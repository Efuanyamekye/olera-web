import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { validateIntroToken, generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { notifyProviderOfInquiry } from "@/lib/family-comms/notify-inquiry";
import { getSiteUrl } from "@/lib/site-url";

/**
 * GET /api/family-intro?tok=<intro-token>
 *
 * The one-tap "introduce me" write path (B2). A family taps an alternative
 * provider's "Introduce me" button in a follow-up email; this creates a real
 * inquiry to that provider — carrying the intent from their original inquiry so
 * they never re-type — notifies the provider, signs the family in, and lands them
 * on a confirmation screen.
 *
 * This is the ONLY authed GET write path for inquiries; every other inquiry is a
 * POST. The signed intro token (family + provider + source inquiry + email, HMAC,
 * 72h) is what makes a click safe: none of it is tamperable, and it can't be
 * replayed as a claim token (distinct signature domain).
 *
 * Reuses the two existing guardrails from POST /api/connections/request:
 *   - rate limit: max 5 inquiries/family/hour (honors the "no flood of calls" promise)
 *   - dedup: an existing pending/accepted inquiry to the same provider is idempotent
 *
 * Auth is delegated to /api/claim-family (redirect), so we never duplicate the
 * session-minting flow.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("tok");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  // Land unauthed on the family inbox when anything is off — never a hard error page.
  const bail = () => NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });

  if (!token) return bail();
  const v = validateIntroToken(token);
  if (!v.valid) {
    console.error("[family-intro] token invalid:", v.error);
    return bail();
  }
  const { familyProfileId, targetProviderId, sourceConnectionId, email } = v;
  const normalizedEmail = email.trim().toLowerCase();

  const db = getServiceClient();

  // Confirmation redirect (through claim-family so they land signed in).
  const confirm = (status: "sent" | "already" | "limit", slug: string) =>
    NextResponse.redirect(
      generateFamilyInboxUrl(
        normalizedEmail,
        `/family/intro-sent?p=${encodeURIComponent(slug)}&status=${status}`,
        getSiteUrl(),
      ),
      { status: 303 },
    );

  try {
    // Resolve the source inquiry (carries the family's intent) and verify it's theirs.
    const { data: source } = await db
      .from("connections")
      .select("id, from_profile_id, message")
      .eq("id", sourceConnectionId)
      .single();
    if (!source || source.from_profile_id !== familyProfileId) {
      console.error("[family-intro] source inquiry missing or not owned by family");
      return bail();
    }

    // Resolve the target provider (must exist + be active).
    const { data: provider } = await db
      .from("business_profiles")
      .select("id, slug, display_name, is_active")
      .eq("id", targetProviderId)
      .single();
    if (!provider || provider.is_active === false) {
      console.error("[family-intro] target provider missing or inactive");
      return bail();
    }
    const slug = provider.slug || provider.id;

    // Rate limit: max 5 inquiries per family per hour (honors "no flood of calls").
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("from_profile_id", familyProfileId)
      .eq("type", "inquiry")
      .gte("created_at", oneHourAgo);
    if (typeof recentCount === "number" && recentCount >= 5) {
      console.log("[family-intro] rate limit hit for family", familyProfileId);
      return confirm("limit", slug);
    }

    // Dedup: an existing active inquiry to this provider makes the tap idempotent.
    const { data: existing } = await db
      .from("connections")
      .select("id")
      .eq("from_profile_id", familyProfileId)
      .eq("to_profile_id", targetProviderId)
      .eq("type", "inquiry")
      .in("status", ["pending", "accepted"])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return confirm("already", slug);
    }

    // Create the inquiry, carrying the original intent forward (no re-typing).
    const { data: created, error: insertErr } = await db
      .from("connections")
      .insert({
        from_profile_id: familyProfileId,
        to_profile_id: targetProviderId,
        type: "inquiry",
        status: "pending",
        message: source.message,
        metadata: { thread: [], source: "one_tap_intro", origin_connection: sourceConnectionId },
        guest_email: normalizedEmail,
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      console.error("[family-intro] insert failed:", insertErr?.message);
      return bail();
    }

    // Log the family's action (awaited — Vercel kills pending work after response).
    const { error: actErr } = await db.from("seeker_activity").insert({
      profile_id: familyProfileId,
      event_type: "connection_sent",
      related_provider_id: targetProviderId,
      metadata: { connection_id: created.id, source: "one_tap_intro", origin_connection: sourceConnectionId },
    });
    if (actErr) console.error("[family-intro] seeker_activity insert failed:", actErr.message);

    // Notify the provider — this is what makes it a real introduction.
    await notifyProviderOfInquiry(db, created.id);

    return confirm("sent", slug);
  } catch (err) {
    console.error("[family-intro] unexpected error:", err);
    return bail();
  }
}
