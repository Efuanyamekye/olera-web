import { getServiceClient } from "@/lib/admin";
import { adBoostLeadDeliveredEmail } from "@/lib/email-templates";
import {
  appendTrackingParams,
  reserveEmailLogId,
  sendEmail,
} from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { MANAGED_UTM_SOURCE, type ManagedUtm } from "./managed-utm";

const EMAIL_TYPE = "ad_boost_lead_delivered";
const SUBJECT = "Your Find Families campaign brought in a new family";

type SkipReason =
  | "not_managed"
  | "missing_campaign"
  | "missing_email"
  | "unknown_campaign"
  | "already_sent"
  | "send_failed";

export async function sendAdBoostLeadDeliveredEmail(opts: {
  managedUtm: ManagedUtm;
  connectionId: string;
  providerEmail: string | null;
  providerName: string;
  providerSlug: string | null;
  providerProfileId: string;
  familyName: string;
  careType: string | null;
  city?: string | null;
  careRecipient?: string | null;
}): Promise<{ sent: boolean; skipped?: SkipReason; error?: string }> {
  const campaignTag = opts.managedUtm.utmCampaign?.trim();
  if (opts.managedUtm.utmSource !== MANAGED_UTM_SOURCE) {
    return { sent: false, skipped: "not_managed" };
  }
  if (!campaignTag) {
    return { sent: false, skipped: "missing_campaign" };
  }

  const recipient = opts.providerEmail?.trim().toLowerCase();
  if (!recipient) {
    return { sent: false, skipped: "missing_email" };
  }

  const db = getServiceClient();

  const { data: campaign, error: campaignError } = await db
    .from("ad_campaign_requests")
    .select("id, provider_slug, provider_id, display_name, status, deleted_at")
    .eq("campaign_tag", campaignTag)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  if (campaignError) {
    console.error("[ad-boost/lead-email] campaign lookup failed:", campaignError);
    return { sent: false, skipped: "unknown_campaign", error: campaignError.message };
  }
  if (!campaign) {
    return { sent: false, skipped: "unknown_campaign" };
  }

  const { data: existing, error: existingError } = await db
    .from("email_log")
    .select("id, status")
    .eq("email_type", EMAIL_TYPE)
    .filter("metadata->>connection_id", "eq", opts.connectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[ad-boost/lead-email] dedupe lookup failed:", existingError);
  }
  if (existing && existing.status !== "failed") {
    return { sent: false, skipped: "already_sent" };
  }

  const providerSlug = opts.providerSlug || campaign.provider_slug || opts.providerProfileId;
  const metadata = {
    request_id: campaign.id,
    campaign_tag: campaignTag,
    connection_id: opts.connectionId,
    provider_slug: providerSlug,
  };

  const emailLogId = await reserveEmailLogId({
    to: recipient,
    subject: SUBJECT,
    emailType: EMAIL_TYPE,
    recipientType: "provider",
    providerId: providerSlug,
    metadata,
  });

  const siteUrl = getSiteUrl();
  let viewUrl: string;
  try {
    const { generateLeadClaimUrl } = await import("@/lib/claim-tokens");
    viewUrl = generateLeadClaimUrl(providerSlug, recipient, opts.connectionId, siteUrl);
  } catch {
    viewUrl = `${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${opts.connectionId}`;
  }
  viewUrl = appendTrackingParams(viewUrl, emailLogId);

  const result = await sendEmail({
    to: recipient,
    subject: SUBJECT,
    html: adBoostLeadDeliveredEmail({
      providerName: opts.providerName,
      familyName: opts.familyName,
      careType: opts.careType,
      city: opts.city,
      careRecipient: opts.careRecipient,
      viewUrl,
    }),
    emailType: EMAIL_TYPE,
    recipientType: "provider",
    providerId: providerSlug,
    metadata,
    emailLogId: emailLogId ?? undefined,
    recipientProfileId: opts.providerProfileId,
  });

  if (!result.success || result.skipped) {
    console.warn("[ad-boost/lead-email] send did not complete normally:", result);
    return {
      sent: false,
      skipped: "send_failed",
      error: result.skipReason ?? result.error,
    };
  }

  return { sent: true };
}
