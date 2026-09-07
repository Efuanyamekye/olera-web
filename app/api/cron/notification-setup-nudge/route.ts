import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail, appendTrackingParams } from "@/lib/email";
import { onboardingNotificationsEmail } from "@/lib/email-templates";
import { withCronRun } from "@/lib/crons/run";
import { generateProviderPortalUrl } from "@/lib/claim-tokens";
import { notificationEligibility, notificationBusinessHours, NOTIFICATION_EMAIL_TYPE } from "@/lib/provider-comms/notifications";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const secret = process.env.CRON_SECRET;
  if (!secret || (request.headers.get("authorization") !== `Bearer ${secret}` && params.get("secret") !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = params.get("dry_run") === "true";
  return withCronRun("notification-setup-nudge", async () => {
    const db = getServiceClient();
    // Unlike the shared wrapper's fail-open pause lookup, this new sender
    // requires an explicit enabled row. Missing config or lookup errors hold it.
    const { data: config, error: configError } = await db.from("cron_config")
      .select("enabled").eq("job_id", "notification-setup-nudge").maybeSingle();
    if (configError || config?.enabled !== true) return { status: "held", reason: "Notification email requires explicit enablement", dry_run: dryRun };
    const now = new Date();
    const started = Date.now();
    const counts = { sent: 0, suppressed: 0, errors: 0, wouldSend: 0, processed: 0, skipped: {} as Record<string, number> };
    const skip = (reason: string) => { counts.skipped[reason] = (counts.skipped[reason] ?? 0) + 1; };
    let cursor = "";
    // Keyset pagination: skipped candidates cannot starve later recipients,
    // and removing a processed row cannot shift an offset page underneath us.
    while (Date.now() - started < 45_000 && counts.sent + counts.suppressed + counts.errors < 100) {
      let query = db.from("business_profiles")
        .select("id,slug,type,email,phone,metadata,state,display_name")
        .eq("type", "organization").not("account_id", "is", null)
        .gte("claimed_at", new Date(now.getTime() - 30 * 86_400_000).toISOString())
        .not("metadata->>profile_preview_nudge_sent_at", "is", null)
        .is("metadata->>notification_nudge_attempt_id", null)
        .order("id").limit(100);
      if (cursor) query = query.gt("id", cursor);
      const { data: profiles, error } = await query;
      if (error) throw new Error(`Notification candidates unavailable: ${error.message}`);
      if (!profiles?.length) break;
      for (const profile of profiles) {
        if (Date.now() - started >= 45_000 || counts.sent + counts.suppressed + counts.errors >= 100) break;
        cursor = profile.id;
        counts.processed++;
        const reason = notificationEligibility(profile, now.getTime());
        if (reason) { skip(reason); continue; }
        if (!notificationBusinessHours(now, profile.state)) { skip("outside_business_hours"); continue; }
        if (dryRun) { counts.wouldSend++; continue; }
        // Reserve atomically, before any external send. Another run cannot
        // acquire the same provider. No bulk JSON write can undo preferences.
        const { data: emailLogId, error: reserveError } = await db.rpc("reserve_notification_nudge", { p_profile_id: profile.id, p_email: profile.email });
        if (reserveError) throw new Error(`Notification reservation failed: ${reserveError.message}`);
        if (!emailLogId) { skip("already_processed"); continue; }
        try {
          const url = appendTrackingParams(generateProviderPortalUrl(profile.slug, profile.email!, "notifications"), emailLogId);
          const result = await sendEmail({
            to: profile.email!, subject: "Never miss a family inquiry",
            html: onboardingNotificationsEmail({ providerName: profile.display_name || "your organization", notificationsUrl: url, providerSlug: profile.slug }),
            emailType: NOTIFICATION_EMAIL_TYPE, recipientType: "provider", providerId: profile.id,
            recipientProfileId: profile.id, emailLogId,
          });
          if (!result.success) counts.errors++;
          else if (result.skipped) counts.suppressed++;
          else counts.sent++;
        } catch (error) {
          // The reserved pending row is deliberately retained if the external
          // send's outcome is uncertain. Inspect it rather than resend blindly.
          console.error("[notification-setup-nudge] Attempt requires review:", emailLogId, error);
          counts.errors++;
        }
      }
      if (profiles.length < 100) break;
    }
    return { status: "ok", dry_run: dryRun, ...counts };
  });
}
