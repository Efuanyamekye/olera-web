import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, appendTrackingParams } from "@/lib/email";
import { verificationReminder21DayEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { generateProviderPortalUrl } from "@/lib/claim-tokens";
import { verificationReminderEligibility, VERIFICATION_REMINDER_EMAIL_TYPE } from "@/lib/provider-comms/verification";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") !== `Bearer ${secret}` && params.get("secret") !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = params.get("dry_run") === "true";
  return withCronRun("verification-reminders", async () => {
    const db = getServiceClient();
    // Unlike the shared wrapper's fail-open pause lookup, this new sender
    // requires an explicit enabled row. Missing config or lookup errors hold it.
    const { data: config, error: configError } = await db.from("cron_config")
      .select("enabled").eq("job_id", "verification-reminders").maybeSingle();
    if (configError || config?.enabled !== true) return { status: "held", reason: "Verification reminder requires explicit enablement", dry_run: dryRun };
    const now = new Date();
    const started = Date.now();
    const counts = { sent: 0, suppressed: 0, errors: 0, wouldSend: 0, processed: 0, skipped: {} as Record<string, number> };
    const skip = (reason: string) => { counts.skipped[reason] = (counts.skipped[reason] ?? 0) + 1; };
    let cursor = "";
    // Keyset pagination: skipped candidates cannot starve later recipients,
    // and removing a processed row cannot shift an offset page underneath us.
    while (Date.now() - started < 45_000 && counts.sent + counts.suppressed + counts.errors < 25) {
      let query = db.from("business_profiles")
        .select("id,slug,type,email,metadata,claimed_at,verification_state,display_name")
        .in("type", ["organization", "caregiver"]).eq("verification_state", "unverified").not("account_id", "is", null)
        .lte("claimed_at", new Date(now.getTime() - 21 * 86_400_000).toISOString())
        .is("metadata->>verification_reminder_21d_attempt_id", null)
        .order("id").limit(100);
      if (cursor) query = query.gt("id", cursor);
      const { data: profiles, error } = await query;
      if (error) throw new Error(`Verification candidates unavailable: ${error.message}`);
      if (!profiles?.length) break;
      for (const profile of profiles) {
        if (Date.now() - started >= 45_000 || counts.sent + counts.suppressed + counts.errors >= 25) break;
        cursor = profile.id;
        counts.processed++;
        const reason = verificationReminderEligibility(profile, now.getTime());
        if (reason) { skip(reason); continue; }

        // Reserve atomically, before any external send. Another run cannot
        // acquire the same provider. No bulk JSON write can undo preferences.
        const { data: emailLogId, error: reserveError } = await db.rpc("reserve_verification_reminder", { p_profile_id: profile.id, p_email: profile.email, p_dry_run: dryRun });
        if (reserveError) throw new Error(`Verification reservation failed: ${reserveError.message}`);
        if (!emailLogId) { skip("ineligible_or_digest_today"); continue; }
        if (dryRun) { counts.wouldSend++; continue; }
        try {
          const url = appendTrackingParams(generateProviderPortalUrl(profile.slug, profile.email!, "verify"), emailLogId);
          const result = await sendEmail({
            to: profile.email!, subject: `Complete verification for ${profile.display_name || "your organization"}`,
            html: verificationReminder21DayEmail({ providerName: profile.display_name || "your organization", recipientName: "there", verifyUrl: url, providerSlug: profile.slug }),
            emailType: VERIFICATION_REMINDER_EMAIL_TYPE, recipientType: "provider", providerId: profile.id,
            recipientProfileId: profile.id, emailLogId,
          });
          if (!result.success) counts.errors++;
          else if (result.skipped) counts.suppressed++;
          else counts.sent++;
        } catch (error) {
          // The reserved pending row is deliberately retained if the external
          // send's outcome is uncertain. Inspect it rather than resend blindly.
          console.error("[verification-reminders] Attempt requires review:", emailLogId, error);
          counts.errors++;
        }
      }
      if (profiles.length < 100) break;
    }
    return { status: "ok", dry_run: dryRun, ...counts };
  });
}
