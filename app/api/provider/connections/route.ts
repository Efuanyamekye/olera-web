import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actingProfileIds } from "@/lib/auth/profile-access.server";
import { getServiceClient } from "@/lib/admin";
import { formatRedactedName } from "@/lib/utils/pii-redaction";
import { deriveLeadSignals, type FamilyProfileLike } from "@/lib/provider/lead-signals";

/**
 * GET /api/provider/connections
 *
 * Returns the caller's family-initiated inquiries (leads) for the provider
 * connections page. Replaces the previous client-side Supabase join, which
 * shipped every family's real email / phone / name to the browser regardless
 * of the provider's verification state — the "verify to unlock" gate was only
 * cosmetic (the data was in the page, just rendered as dots).
 *
 * This route enforces the gate in the data layer:
 *   - Resolves the caller's provider profile from their session.
 *   - Fetches inquiries via the service client (route-level access control:
 *     only connections where to_profile_id = the caller's profile).
 *   - If the provider is VERIFIED (or not_required), returns full data —
 *     identical to before.
 *   - If UNVERIFIED, redacts name/email/phone (both the joined profile AND the
 *     connection `message` JSON's seeker_* fields) before the data ever leaves
 *     the server, and injects server-computed completeness + lead-quality
 *     (derived from the FULL row) so the displayed numbers don't change.
 *
 * The response shape matches what the connections page's mapConnectionToLead
 * already consumes, so the client mapping is unchanged.
 *
 * Auth: authenticated provider only. Returns the caller's own leads.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("id, active_profile_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    // Resolve the caller's provider profile (prefer active_profile_id; fall back
    // to first provider profile on the account) — mirrors /api/provider/dashboard.
    const profileSelect = "id, type, verification_state";
    let profile:
      | { id: string; type: string; verification_state: string | null }
      | null = null;

    // Owned agencies plus agencies this email is a team member of (migration 272).
    const actingIds = await actingProfileIds(getServiceClient(), user, { types: ["organization", "caregiver"] });
    const pick =
      account.active_profile_id && actingIds.includes(account.active_profile_id)
        ? account.active_profile_id
        : actingIds[0] ?? null;
    if (pick) {
      const { data: active } = await supabase
        .from("business_profiles")
        .select(profileSelect)
        .eq("id", pick)
        .maybeSingle();
      profile = active;
    }

    if (!profile) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Verified or not_required (high-trust auto-verified) → full data.
    const isVerified =
      profile.verification_state === "verified" ||
      profile.verification_state === "not_required";

    const db = getServiceClient();
    const { data: inquiries, error: inquiriesError } = await db
      .from("connections")
      .select(
        "*, fromProfile:from_profile_id(id, display_name, email, phone, city, state, type, care_types, metadata, image_url, created_at)",
      )
      .eq("to_profile_id", profile.id)
      .eq("type", "inquiry")
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    if (inquiriesError) {
      console.error("[provider/connections] inquiries query failed:", inquiriesError);
      return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
    }

    const rows = (inquiries ?? []) as Array<Record<string, unknown>>;

    // Verified providers get the data unchanged (lowest-risk: identical to the
    // old client query). Only redact for unverified callers.
    if (isVerified) {
      return NextResponse.json({ connections: rows, verified: true });
    }

    const redacted = rows.map((row) => redactLeadRow(row));
    return NextResponse.json({ connections: redacted, verified: false });
  } catch (err) {
    console.error("[provider/connections] fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Strip family contact PII from a connection row for an unverified provider,
 * and inject completeness + quality computed from the FULL (pre-redaction) row
 * so the UI's displayed numbers are unchanged.
 */
function redactLeadRow(row: Record<string, unknown>): Record<string, unknown> {
  // Compute signals from the FULL row before we strip anything.
  const signals = deriveLeadSignals(row as { message?: string | null; metadata?: Record<string, unknown> | null; fromProfile?: FamilyProfileLike | FamilyProfileLike[] | null });
  const redactedName = formatRedactedName(signals.fullName);

  // Redact the joined family profile (handle to-one object or array form).
  const fromProfile = row.fromProfile as FamilyProfileLike | FamilyProfileLike[] | null | undefined;
  const redactProfile = (p: FamilyProfileLike) => {
    p.display_name = redactedName;
    p.email = null;
    p.phone = null;
  };
  if (Array.isArray(fromProfile)) {
    if (fromProfile[0]) redactProfile(fromProfile[0]);
  } else if (fromProfile) {
    redactProfile(fromProfile);
  }

  // Redact the seeker_* PII carried in the connection `message` JSON (older
  // connections store name/email/phone here). Keep the non-PII fields the UI
  // needs (care_type, urgency, looking_in_*, etc.). Leave non-JSON messages
  // untouched.
  if (typeof row.message === "string" && row.message.trim()) {
    try {
      const parsed = JSON.parse(row.message) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        delete parsed.seeker_email;
        delete parsed.seeker_phone;
        delete parsed.seeker_last_name;
        delete parsed.seeker_name;
        // Keep a redacted first-name so the mapper's message fallback (used when
        // the joined profile has no name) still shows "Jane D.", not the real name.
        if ("seeker_first_name" in parsed) parsed.seeker_first_name = redactedName;
        row.message = JSON.stringify(parsed);
      }
    } catch {
      // Non-JSON message — leave as-is.
    }
  }

  // Inject full-data signals so completeness / quality don't drop on redaction.
  row.__piiRedacted = true;
  row.__completeness = signals.completeness;
  row.__quality = signals.quality;
  return row;
}
