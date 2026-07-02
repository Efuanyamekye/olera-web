/**
 * Notify a provider that a family inquiry landed — the standalone version used by
 * the one-tap intro (B2) GET write path. The main POST /api/connections/request
 * has its own (larger) inline notification block with route-local context; this
 * mirrors the load-bearing parts (provider email + lead-received event + one-click
 * lead link) for a connection that already exists, so the intro is a *real*
 * introduction the provider actually hears about — not just a DB row.
 *
 * Deliberately narrow: no first-lead-celebration, no SMS/WhatsApp/Slack fan-out.
 * If those matter for intros later, extract a shared notifier from the POST route.
 *
 * PHI: subject never carries the family's name (Apple Mail preview + memory
 * feedback_phi_in_subject_lines) — always "A family in {city}…".
 */

import type { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { connectionRequestEmail } from "@/lib/email-templates";
import { generateLeadClaimUrl } from "@/lib/claim-tokens";
import { recordProviderEvent } from "@/lib/analytics/provider-events";
import { getSiteUrl } from "@/lib/site-url";

const CARE_TYPE_DISPLAY: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health Care",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

/**
 * Send the provider the "a family is looking for care" notification for an
 * already-inserted inquiry connection. Fire-and-forget safe: swallows its own
 * errors so a notification failure never blocks the intro redirect. Returns
 * whether an email was sent (for logging).
 */
export async function notifyProviderOfInquiry(
  db: ReturnType<typeof getServiceClient>,
  connectionId: string,
): Promise<boolean> {
  try {
    const { data: conn } = await db
      .from("connections")
      .select("id, to_profile_id, message, metadata")
      .eq("id", connectionId)
      .single();
    if (!conn) return false;

    const { data: provider } = await db
      .from("business_profiles")
      .select("id, display_name, slug, email, city, metadata")
      .eq("id", conn.to_profile_id)
      .single();
    if (!provider) return false;

    const providerEmail = provider.email?.trim() || undefined;
    const providerMeta = (provider.metadata as Record<string, unknown> | null) || {};
    const leadsUnsubscribed = !!providerMeta.leads_unsubscribed;

    // Parse the carried intent for the care-type label + recipient.
    let careTypeToken: string | null = null;
    let careRecipient: string | null = null;
    if (conn.message) {
      try {
        const parsed = JSON.parse(conn.message as string) as Record<string, unknown>;
        careTypeToken = (parsed.care_type as string) || (parsed.careType as string) || null;
        careRecipient = (parsed.care_recipient as string) || (parsed.careRecipient as string) || null;
      } catch {
        /* message wasn't JSON — leave labels null */
      }
    }
    const careTypeDisplay = careTypeToken
      ? CARE_TYPE_DISPLAY[careTypeToken] || careTypeToken
      : null;

    const providerCity = provider.city || null;
    const providerSlug = provider.slug || provider.id;

    // Record the lead so it counts in provider metrics + Ad Boost attribution,
    // exactly like the POST route (slug space keeps it aggregatable with page_view).
    void recordProviderEvent({
      provider_id: providerSlug,
      event_type: "lead_received",
      profile_id: conn.to_profile_id,
      metadata: {
        connection_id: conn.id,
        care_type: careTypeToken,
        guest: true,
        raw_provider_id: conn.to_profile_id,
        source: "one_tap_intro",
      },
    });

    if (!providerEmail || leadsUnsubscribed) return false;

    // Subject — no family name (PHI). Degrades from most→least specific.
    let subject: string;
    if (providerCity && careTypeDisplay) {
      subject = `A family in ${providerCity} is looking for ${careTypeDisplay.toLowerCase()}`;
    } else if (providerCity) {
      subject = `A family in ${providerCity} is looking for care`;
    } else {
      subject = "A family is looking for care";
    }

    const siteUrl = getSiteUrl();
    const emailLogId = await reserveEmailLogId({
      to: providerEmail,
      subject,
      emailType: "connection_request",
      recipientType: "provider",
      providerId: conn.to_profile_id,
      metadata: { connection_id: conn.id, source: "one_tap_intro" },
    });

    let viewUrl = generateLeadClaimUrl(providerSlug, providerEmail, conn.id, siteUrl);
    viewUrl = appendTrackingParams(viewUrl, emailLogId);

    await sendEmail({
      to: providerEmail,
      subject,
      html: connectionRequestEmail({
        providerName: provider.display_name || "there",
        familyName: "A family",
        careType: careTypeDisplay,
        city: providerCity,
        careRecipient,
        viewUrl,
      }),
      emailType: "connection_request",
      recipientType: "provider",
      providerId: conn.to_profile_id,
      emailLogId: emailLogId ?? undefined,
      recipientProfileId: conn.to_profile_id,
    });
    return true;
  } catch (err) {
    console.error("[notify-inquiry] failed:", err);
    return false;
  }
}
