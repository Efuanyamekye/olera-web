import { getServiceClient } from "@/lib/admin";
import {
  adBoostCampaignLaunchedEmail,
  adBoostPromoCompleteEmail,
  adBoostTractionEmail,
} from "@/lib/email-templates";
import {
  appendTrackingParams,
  reserveEmailLogId,
  sendEmail,
} from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { getCampaignStats } from "./delivered.server";

type AdBoostLifecycleKind = "launched" | "traction" | "promo_complete";

const SENT_COLUMN: Record<AdBoostLifecycleKind, string> = {
  launched: "launched_email_sent_at",
  traction: "traction_email_sent_at",
  promo_complete: "promo_complete_email_sent_at",
};

const EMAIL_TYPE: Record<AdBoostLifecycleKind, string> = {
  launched: "ad_boost_campaign_launched",
  traction: "ad_boost_traction",
  promo_complete: "ad_boost_promo_complete",
};

const SUBJECT: Record<AdBoostLifecycleKind, string> = {
  launched: "Your Find Families campaign is live",
  traction: "Your Find Families campaign is getting activity",
  promo_complete: "Your starter campaign is complete",
};

type CampaignRow = {
  id: string;
  provider_id: string;
  provider_slug: string | null;
  display_name: string | null;
  requested_setup_week: string | null;
  channel: string | null;
  campaign_tag: string | null;
  intended_monthly_budget: number | null;
  ad_spend_cents: number | null;
  ad_clicks: number | null;
};

type ProviderRecipient = {
  email: string | null;
  name: string;
  profileId: string;
  slug: string;
  leadsUnsubscribed: boolean;
};

async function loadProviderRecipient(
  db: ReturnType<typeof getServiceClient>,
  row: CampaignRow,
): Promise<ProviderRecipient> {
  const fallbackSlug = row.provider_slug || row.provider_id;
  const fallbackName = row.display_name || fallbackSlug;

  const { data: bp } = await db
    .from("business_profiles")
    .select("id, email, display_name, slug, metadata, source_provider_id")
    .eq("id", row.provider_id)
    .maybeSingle();

  const sourceProviderId = bp?.source_provider_id || row.provider_id;
  let iosEmail: string | null = null;
  if (!bp?.email && sourceProviderId) {
    const { data: ios } = await db
      .from("olera-providers")
      .select("email")
      .eq("provider_id", sourceProviderId)
      .maybeSingle();
    iosEmail = ios?.email || null;
  }

  const meta = (bp?.metadata || {}) as Record<string, unknown>;
  return {
    email: bp?.email || iosEmail,
    name: bp?.display_name || row.display_name || fallbackName,
    profileId: bp?.id || row.provider_id,
    slug: bp?.slug || fallbackSlug,
    leadsUnsubscribed: !!meta.leads_unsubscribed,
  };
}

export async function sendAdBoostLifecycleEmail(opts: {
  request: CampaignRow;
  kind: AdBoostLifecycleKind;
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const db = getServiceClient();
  const recipient = await loadProviderRecipient(db, opts.request);
  if (!recipient.email) {
    return { sent: false, skipped: "missing_email" };
  }
  if (recipient.leadsUnsubscribed) {
    return { sent: false, skipped: "provider_unsubscribed" };
  }

  const sentColumn = SENT_COLUMN[opts.kind];
  const reservedAt = new Date().toISOString();
  const { data: reservation, error: reservationError } = await db
    .from("ad_campaign_requests")
    .update({ [sentColumn]: reservedAt })
    .eq("id", opts.request.id)
    .is(sentColumn, null)
    .select("id")
    .maybeSingle();

  if (reservationError) {
    console.error("[ad-boost/lifecycle-email] reservation failed:", reservationError);
    return { sent: false, skipped: "reservation_failed", error: reservationError.message };
  }
  if (!reservation) {
    return { sent: false, skipped: "already_sent" };
  }

  const since = new Date(
    opts.request.requested_setup_week || new Date().toISOString(),
  ).toISOString();
  const stats = await getCampaignStats(db, {
    providerIdVariants: [opts.request.provider_slug || "", opts.request.provider_id],
    since,
  });

  const emailType = EMAIL_TYPE[opts.kind];
  const subject = SUBJECT[opts.kind];
  const metadata = {
    request_id: opts.request.id,
    campaign_tag: opts.request.campaign_tag || opts.request.id,
    ad_boost_lifecycle_kind: opts.kind,
    visitors: stats.visitors,
    leads: stats.leads,
    ad_spend_cents: opts.request.ad_spend_cents,
    ad_clicks: opts.request.ad_clicks,
  };

  const emailLogId = await reserveEmailLogId({
    to: recipient.email,
    subject,
    emailType,
    recipientType: "provider",
    providerId: recipient.slug,
    metadata,
  });

  const ctaUrl = appendTrackingParams(`${getSiteUrl()}/provider/boost`, emailLogId);
  const html =
    opts.kind === "launched"
      ? adBoostCampaignLaunchedEmail({
          providerName: recipient.name,
          ctaUrl,
          channel: opts.request.channel,
        })
      : opts.kind === "traction"
        ? adBoostTractionEmail({
            providerName: recipient.name,
            ctaUrl,
            visitors: stats.visitors,
            leads: stats.leads,
            clicks: opts.request.ad_clicks,
            spendCents: opts.request.ad_spend_cents,
          })
        : adBoostPromoCompleteEmail({
            providerName: recipient.name,
            ctaUrl,
            visitors: stats.visitors,
            leads: stats.leads,
            clicks: opts.request.ad_clicks,
            spendCents: opts.request.ad_spend_cents,
            intendedMonthlyBudget: opts.request.intended_monthly_budget,
          });

  const result = await sendEmail({
    to: recipient.email,
    subject,
    html,
    emailType,
    recipientType: "provider",
    providerId: recipient.slug,
    metadata,
    emailLogId: emailLogId ?? undefined,
    recipientProfileId: recipient.profileId,
  });

  if (!result.success || result.skipped) {
    console.warn("[ad-boost/lifecycle-email] send did not complete normally:", result);
    await db
      .from("ad_campaign_requests")
      .update({ [sentColumn]: null })
      .eq("id", opts.request.id)
      .eq(sentColumn, reservedAt);
    return { sent: false, skipped: result.skipReason ?? result.error ?? "send_failed" };
  }

  return { sent: true };
}
