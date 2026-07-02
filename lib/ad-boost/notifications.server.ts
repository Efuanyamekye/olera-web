import { getServiceClient } from "@/lib/admin";
import {
  adBoostProfileReminderEmail,
  adBoostQueuedEmail,
  adBoostReadyEmail,
  adBoostRequestedEmail,
} from "@/lib/email-templates";
import {
  appendTrackingParams,
  reserveEmailLogId,
  sendEmail,
} from "@/lib/email";
import type { AdBoostEligibility } from "./eligibility";

type AdBoostRequestEmailKind =
  | "queued"
  | "requested"
  | "promotion"
  | "profile_reminder";

const SENT_COLUMN: Record<AdBoostRequestEmailKind, string> = {
  queued: "queued_email_sent_at",
  requested: "requested_email_sent_at",
  promotion: "promotion_email_sent_at",
  profile_reminder: "profile_reminder_email_sent_at",
};

const EMAIL_TYPE: Record<AdBoostRequestEmailKind, string> = {
  queued: "ad_boost_queued",
  requested: "ad_boost_requested",
  promotion: "ad_boost_ready",
  profile_reminder: "ad_boost_profile_reminder",
};

const SUBJECT: Record<AdBoostRequestEmailKind, string> = {
  queued: "Your Ad Boost request is saved",
  requested: "Your Ad Boost request is ready for setup",
  promotion: "Your Ad Boost request is now launch-ready",
  profile_reminder: "Finish your Ad Boost launch setup",
};

export async function sendAdBoostRequestEmail(opts: {
  requestId: string;
  kind: AdBoostRequestEmailKind;
  providerName: string;
  providerSlug: string;
  providerEmail: string | null;
  setupWeek: string;
  channel: string | null;
  intendedMonthlyBudget: number | null;
  completeness: number;
  eligibility: AdBoostEligibility;
  isVerified: boolean;
}): Promise<{ sent: boolean; skipped?: string }> {
  const recipient = opts.providerEmail?.trim().toLowerCase();
  if (!recipient) {
    console.warn(
      `[ad-boost/email] skipping ${opts.kind} email for request ${opts.requestId}: no provider email`,
    );
    return { sent: false, skipped: "missing_email" };
  }

  const db = getServiceClient();
  const sentColumn = SENT_COLUMN[opts.kind];
  const reservedAt = new Date().toISOString();

  const { data: reservation, error: reservationError } = await db
    .from("ad_campaign_requests")
    .update({ [sentColumn]: reservedAt })
    .eq("id", opts.requestId)
    .is(sentColumn, null)
    .select("id")
    .maybeSingle();

  if (reservationError) {
    console.error(
      `[ad-boost/email] failed to reserve ${opts.kind} email for request ${opts.requestId}:`,
      reservationError,
    );
    return { sent: false, skipped: "reservation_failed" };
  }

  if (!reservation) {
    return { sent: false, skipped: "already_sent" };
  }

  const emailType = EMAIL_TYPE[opts.kind];
  const subject = SUBJECT[opts.kind];
  const metadata = {
    request_id: opts.requestId,
    ad_boost_email_kind: opts.kind,
    setup_week: opts.setupWeek,
    channel: opts.channel,
    intended_monthly_budget: opts.intendedMonthlyBudget,
    completeness: opts.completeness,
    is_verified: opts.isVerified,
  };

  const emailLogId = await reserveEmailLogId({
    to: recipient,
    subject,
    emailType,
    recipientType: "provider",
    providerId: opts.providerSlug,
    metadata,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const ctaUrl = appendTrackingParams(`${siteUrl}/provider/boost`, emailLogId);

  const html =
    opts.kind === "queued"
      ? adBoostQueuedEmail({
          providerName: opts.providerName,
          ctaUrl,
          setupWeek: opts.setupWeek,
          completeness: opts.completeness,
          threshold: opts.eligibility.threshold,
          missingSectionLabel: opts.eligibility.missingSections[0]?.label ?? null,
          needsVerification: !opts.isVerified,
        })
      : opts.kind === "profile_reminder"
        ? adBoostProfileReminderEmail({
            providerName: opts.providerName,
            ctaUrl,
            setupWeek: opts.setupWeek,
            completeness: opts.completeness,
            threshold: opts.eligibility.threshold,
            missingSectionLabel: opts.eligibility.missingSections[0]?.label ?? null,
            needsVerification: !opts.isVerified,
          })
      : opts.kind === "promotion"
        ? adBoostReadyEmail({
            providerName: opts.providerName,
            ctaUrl,
            setupWeek: opts.setupWeek,
            channel: opts.channel,
          })
        : adBoostRequestedEmail({
            providerName: opts.providerName,
            ctaUrl,
            setupWeek: opts.setupWeek,
            channel: opts.channel,
          });

  const result = await sendEmail({
    to: recipient,
    subject,
    html,
    emailType,
    recipientType: "provider",
    providerId: opts.providerSlug,
    metadata,
    emailLogId: emailLogId ?? undefined,
  });

  if (!result.success || result.skipped) {
    console.warn(
      `[ad-boost/email] ${opts.kind} email for request ${opts.requestId} did not send normally:`,
      result,
    );
    await db
      .from("ad_campaign_requests")
      .update({ [sentColumn]: null })
      .eq("id", opts.requestId)
      .eq(sentColumn, reservedAt);
    return { sent: false, skipped: result.skipReason ?? result.error ?? "send_failed" };
  }

  return { sent: true };
}
