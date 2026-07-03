import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { markEmailTrusted } from "@/lib/email";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";

/**
 * Email override — the human "send anyway" action.
 *
 * Marks an address as trusted (email_overrides), so future sends bypass BOTH
 * suppression signals (bounce/complaint via email_log AND the verification
 * verdict). Then, if a providerSlug is given, immediately flushes that
 * provider's deferred questions/leads to the address — clearing the pile-up
 * that the over-aggressive checker had been blocking (e.g. The Grove).
 *
 * Unlike /api/admin/questions/add-email, this does NOT change the provider's
 * email and does NOT 403 claimed providers — the whole point is to unblock a
 * claimed provider's existing, human-confirmed inbox.
 *
 * GET and POST both supported so it's triggerable straight from a browser.
 *   POST body:   { email?, providerSlug?, reason?, note? }
 *   GET query:   ?email=...&providerSlug=...&reason=...&note=...
 * Provide email, providerSlug, or both. providerSlug alone trusts the address
 * already on file and flushes; email alone trusts without flushing.
 */

type OverrideReason = "phone_verified" | "official_website" | "claimed_account" | "admin";
const VALID_REASONS = new Set<string>(["phone_verified", "official_website", "claimed_account", "admin"]);

// Default question batch size when flushing via this endpoint, so a large
// backlog (e.g. The Grove's ~24) doesn't blast the provider all at once.
// Override with ?limit=N; pass a large N to flush everything.
const DEFAULT_FLUSH_LIMIT = 5;

async function handle(params: {
  email?: string | null;
  providerSlug?: string | null;
  reason?: string | null;
  note?: string | null;
  limit?: string | null;
  adminEmail: string;
  adminUserId: string;
}) {
  const { providerSlug, adminEmail, adminUserId } = params;
  const parsedLimit = params.limit != null && params.limit !== "" ? parseInt(params.limit, 10) : NaN;
  const flushLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_FLUSH_LIMIT;
  const reason: OverrideReason =
    params.reason && VALID_REASONS.has(params.reason) ? (params.reason as OverrideReason) : "admin";
  const note = params.note ?? null;
  let email = params.email?.trim() || null;

  if (!email && !providerSlug) {
    return NextResponse.json({ error: "Provide an email and/or a providerSlug" }, { status: 400 });
  }

  const db = getServiceClient();

  // Resolve the provider so we can (a) default the trust target to the email on
  // file, and (b) flush its deferred notifications. Focused lookup — covers the
  // common cases (claimed business_profile, directory provider by slug/id).
  let provider:
    | { id: string; display_name: string | null; email: string | null; source_provider_id: string | null; slug: string | null }
    | null = null;
  let iosProvider: { provider_id: string; email: string | null; provider_name: string | null } | null = null;

  if (providerSlug) {
    provider = await db
      .from("business_profiles")
      .select("id, display_name, email, source_provider_id, slug")
      .eq("slug", providerSlug)
      .maybeSingle()
      .then((r) => r.data);

    if (!provider) {
      iosProvider = await db
        .from("olera-providers")
        .select("provider_id, email, provider_name")
        .eq("slug", providerSlug)
        .not("deleted", "is", true)
        .maybeSingle()
        .then((r) => r.data);
      if (!iosProvider) {
        iosProvider = await db
          .from("olera-providers")
          .select("provider_id, email, provider_name")
          .eq("provider_id", providerSlug)
          .not("deleted", "is", true)
          .maybeSingle()
          .then((r) => r.data);
      }
      if (iosProvider) {
        provider = await db
          .from("business_profiles")
          .select("id, display_name, email, source_provider_id, slug")
          .eq("source_provider_id", iosProvider.provider_id)
          .maybeSingle()
          .then((r) => r.data);
      }
    }

    if (!provider && !iosProvider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
  }

  // Trust target: explicit email wins; otherwise the address on file.
  email = email || provider?.email || iosProvider?.email || null;
  if (!email) {
    return NextResponse.json(
      { error: "no_email", message: "No email on file for this provider — add one via the Questions tab first." },
      { status: 422 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  const trusted = await markEmailTrusted(email, { reason, note: note ?? undefined, createdBy: adminEmail });
  if (!trusted) {
    return NextResponse.json({ error: "Failed to record override" }, { status: 500 });
  }

  // Flush the pile-up for this provider, if we have one. Now that the address is
  // trusted, the deferred sends skip suppression and actually go out. Capped at
  // flushLimit questions per call (newest first) so a big backlog is paced —
  // re-hit the endpoint to send the next batch.
  let questionEmailsSent = 0;
  let leadEmailsSent = 0;
  let questionsRemaining = 0;
  let questionFlagsCleared = 0;
  if (providerSlug && (provider || iosProvider)) {
    const iosProviderId = provider?.source_provider_id || iosProvider?.provider_id;
    const variantSet = new Set<string>();
    if (iosProviderId && iosProviderId !== providerSlug) variantSet.add(iosProviderId);
    if (provider?.source_provider_id && provider.source_provider_id !== providerSlug) {
      variantSet.add(provider.source_provider_id);
    }
    if (provider?.slug && provider.slug !== providerSlug) variantSet.add(provider.slug);

    const result = await sendDeferredNotificationsForProvider({
      profileId: provider?.id || "",
      email,
      providerName: provider?.display_name || iosProvider?.provider_name || providerSlug,
      providerSlug,
      additionalSlugVariants: Array.from(variantSet),
      maxQuestions: flushLimit,
    });
    questionEmailsSent = result.questionEmailsSent;
    leadEmailsSent = result.leadEmailsSent;

    // Clear email_dead and needs_provider_email flags from questions for this provider.
    // These flags were set when the previous email bounced or was missing — now that
    // we have a working email, clear them so the questions leave the "Delivery Issues"
    // and "Needs Email" tabs.
    const allSlugVariants = [providerSlug, ...Array.from(variantSet)];
    const { data: flaggedQuestions } = await db
      .from("provider_questions")
      .select("id, metadata")
      .in("provider_id", allSlugVariants);

    if (flaggedQuestions?.length) {
      for (const q of flaggedQuestions) {
        const qMeta = (q.metadata || {}) as Record<string, unknown>;
        if (qMeta.email_dead || qMeta.needs_provider_email) {
          delete qMeta.email_dead;
          delete qMeta.needs_provider_email;
          const { error: updateErr } = await db
            .from("provider_questions")
            .update({ metadata: qMeta })
            .eq("id", q.id);
          if (!updateErr) {
            questionFlagsCleared++;
          }
        }
      }
      if (questionFlagsCleared > 0) {
        console.log(`[email-override] Cleared email_dead/needs_provider_email flags from ${questionFlagsCleared} question(s) for ${providerSlug}`);
      }
    }

    // How many questions are still waiting (so the operator knows whether to
    // run it again). Counts pending questions across all variants that haven't
    // been emailed yet.
    const allVariants = Array.from(new Set([providerSlug, ...variantSet]));
    const { data: stillPending } = await db
      .from("provider_questions")
      .select("id, metadata")
      .in("provider_id", allVariants)
      .eq("status", "pending");
    questionsRemaining = (stillPending ?? []).filter(
      (q) => !(q.metadata as Record<string, unknown> | null)?.email_sent_at,
    ).length;
  }

  await logAuditAction({
    adminUserId,
    action: "email_override_trust",
    targetType: provider ? "business_profile" : iosProvider ? "olera_provider" : "email",
    targetId: provider?.id || iosProvider?.provider_id || email,
    details: { email, reason, note, provider_slug: providerSlug ?? null, questionEmailsSent, leadEmailsSent, questionsRemaining, questionFlagsCleared },
  });

  return NextResponse.json({
    success: true,
    email,
    reason,
    flushed: { questionEmailsSent, leadEmailsSent, questionsRemaining, questionFlagsCleared },
    message: providerSlug
      ? `Trusted ${email} and sent ${questionEmailsSent} question + ${leadEmailsSent} lead notification(s).` +
        (questionsRemaining > 0
          ? ` ${questionsRemaining} question(s) still waiting — re-run this URL to send the next ${flushLimit}.`
          : " All caught up.")
      : `Trusted ${email}. Future sends will bypass suppression.`,
  });
}

async function authed() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { adminUser, adminEmail: user.email ?? adminUser.id };
}

export async function POST(request: NextRequest) {
  try {
    const a = await authed();
    if (a.error) return a.error;
    const body = await request.json().catch(() => ({}));
    return await handle({
      email: body.email ?? null,
      providerSlug: body.providerSlug ?? null,
      reason: body.reason ?? null,
      note: body.note ?? null,
      limit: body.limit != null ? String(body.limit) : null,
      adminEmail: a.adminEmail,
      adminUserId: a.adminUser.id,
    });
  } catch (err) {
    console.error("Email override error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const a = await authed();
    if (a.error) return a.error;
    const sp = request.nextUrl.searchParams;
    return await handle({
      email: sp.get("email"),
      providerSlug: sp.get("providerSlug"),
      reason: sp.get("reason"),
      note: sp.get("note"),
      limit: sp.get("limit"),
      adminEmail: a.adminEmail,
      adminUserId: a.adminUser.id,
    });
  } catch (err) {
    console.error("Email override error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
