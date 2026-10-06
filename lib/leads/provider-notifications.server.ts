import { getServiceClient } from "@/lib/admin";
import {
  appendTrackingParams,
  reserveEmailLogId,
  sendEmail,
} from "@/lib/email";
import { connectionRequestEmail, firstLeadCelebrationEmail } from "@/lib/email-templates";
import { sendAdBoostLeadDeliveredEmail } from "@/lib/ad-boost/lead-notifications.server";
import type { ManagedUtm } from "@/lib/ad-boost/managed-utm";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { newInquirySms } from "@/lib/sms/templates";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSiteUrl } from "@/lib/site-url";
import { pingCareTeam } from "@/lib/city-ads/care-team-ping.server";
import { stateToTimezone } from "@/lib/sms/quiet-hours";

/**
 * Provider lead notifications, held until the inquiry is qualified or abandoned.
 *
 * WHY THIS EXISTS. Until 2026-09-22 every provider-facing notification fired at
 * the instant the family submitted an email address, which is BEFORE the six-step
 * qualifying flow (`EnrichmentState`) runs and before any of it can be answered.
 * Measured over the 90 days to 2026-09-22: 873 inquiries, 485 of them (56%) with
 * no free text at all, and only 342 of 819 enrichment sessions reaching the end.
 * So most providers were told "a family is looking for care" about a row that
 * contained an email address and nothing else. On Franchil's August flight two of
 * three such leads turned out to be caregivers looking for work, and each one
 * sent Hilda "Your Find Families campaign brought in a new family".
 *
 * WHAT CHANGED. The connection is still created immediately and still appears in
 * the provider's in-app inbox immediately. Only the outbound push (email, SMS,
 * WhatsApp) is held, and released by whichever of these comes first:
 *   • the family finishes or skips out of enrichment  → PATCH /api/connections/update-intent
 *   • a 10 minute ceiling elapses                     → cron/lead-notification-release
 * Measured on 353 sessions, median lead→enrichment-finished was 53s, p90 116s,
 * p99 339s, and 352 of 353 landed inside ten minutes. So the ceiling delays
 * nobody who was going to answer. It only delays leads that were never going to
 * carry data.
 *
 * Everything is re-derived from the connection row here rather than passed in from
 * the request, because at release time the request is long gone. That is also why
 * `holdProviderLeadNotifications` persists the managed-ads UTM onto the connection:
 * it previously lived only on the provider_activity event, so a deferred send had
 * no way to know which campaign paid for the lead.
 */

const HOLD_MINUTES = 10;

export type NotifyReleaseReason = "enrichment" | "timeout" | "manual";

interface ConnectionRow {
  id: string;
  to_profile_id: string;
  from_profile_id: string;
  guest_email: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health Care",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
};

const CARE_RECIPIENT_LABELS: Record<string, string> = {
  parent: "their parent",
  spouse: "their spouse",
  self: "",
  other: "a family member",
};

const PLACEHOLDER_NAMES = new Set([
  "anonymous", "careseeker", "care", "a", "family", "guest", "user", "seeker",
]);

function safeFirstName(raw: string | null | undefined): string | null {
  const first = (raw ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  return PLACEHOLDER_NAMES.has(first.toLowerCase()) ? null : first;
}

/**
 * Has this exact email already gone out for this connection?
 *
 * The Ad Boost sender has carried its own dedupe for a while; the generic lead
 * email and the first-lead celebration never needed one, because they used to
 * run exactly once inside the request that created the lead. Now that a failed
 * send is requeued for the cron, a retry could re-send an email that had already
 * succeeded before a later step threw. Same guard, same shape.
 */
async function alreadySent(
  db: ReturnType<typeof getServiceClient>,
  emailType: string,
  connectionId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("email_log")
    .select("id, status")
    .eq("email_type", emailType)
    .filter("metadata->>connection_id", "eq", connectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[lead-notify] dedupe lookup failed for ${emailType}:`, error);
    return false;
  }
  return !!data && data.status !== "failed";
}

/**
 * Mark a freshly created inquiry as awaiting notification. Called at insert time
 * in place of the old inline send block. Never sends.
 */
export async function holdProviderLeadNotifications(opts: {
  connectionId: string;
  managedUtm?: ManagedUtm | null;
  isFirstLead?: boolean;
}): Promise<void> {
  const db = getServiceClient();
  const { data: row, error } = await db
    .from("connections")
    .select("metadata")
    .eq("id", opts.connectionId)
    .maybeSingle();
  if (error || !row) {
    console.error("[lead-notify] hold: connection lookup failed", error);
    return;
  }
  const metadata = (row.metadata as Record<string, unknown>) || {};
  const utm = opts.managedUtm;
  await db
    .from("connections")
    .update({
      metadata: {
        ...metadata,
        provider_notify_state: "held",
        provider_notify_after: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
        provider_notify_is_first_lead: !!opts.isFirstLead,
        // Persisted so the deferred send can still attribute the lead to its
        // campaign. Previously this lived only on the provider_activity event.
        ...(utm?.utmCampaign
          ? { utm_source: utm.utmSource ?? null, utm_campaign: utm.utmCampaign }
          : {}),
      },
    })
    .eq("id", opts.connectionId);
}

/**
 * Has this inquiry told us anything a provider can act on?
 *
 * Deliberately strict: a name alone is not enough, because the enrichment flow
 * collects the name on its LAST step and someone who reached that step has
 * usually answered the earlier ones anyway. What a provider needs to make a call
 * is who needs care, how soon, what kind, or something the family typed.
 */
export function isEnrichedInquiry(message: string | null, metadata: Record<string, unknown> | null): boolean {
  let parsed: Record<string, unknown> = {};
  if (message && message.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return true; // Unparseable free text is still text a provider can read.
    }
  } else if (message?.trim()) {
    return true;
  }
  const has = (key: string) => {
    const value = parsed[key];
    return typeof value === "string" && value.trim().length > 0;
  };
  if (has("care_type") || has("urgency") || has("care_recipient") || has("care_need")) return true;
  if (has("message") || has("additional_notes")) return true;
  const thread = metadata?.thread;
  if (Array.isArray(thread) && thread.some((entry) => {
    const text = (entry as { text?: unknown; type?: unknown })?.text;
    const type = (entry as { type?: unknown })?.type;
    return typeof text === "string" && text.trim().length > 0 && type !== "system";
  })) return true;
  return false;
}

/**
 * Send every held provider notification for one connection. Idempotent: the
 * `provider_notify_state` flip is claimed before any send, and each individual
 * send already dedupes on `email_log.metadata->>connection_id`.
 */
export async function sendProviderLeadNotifications(opts: {
  connectionId: string;
  releasedBy: NotifyReleaseReason;
}): Promise<{ sent: boolean; reason?: string }> {
  const db = getServiceClient();

  const { data: connection, error: connectionError } = await db
    .from("connections")
    .select("id, to_profile_id, from_profile_id, guest_email, message, metadata, created_at")
    .eq("id", opts.connectionId)
    .maybeSingle<ConnectionRow>();

  if (connectionError || !connection) {
    return { sent: false, reason: "connection_not_found" };
  }

  const metadata = (connection.metadata as Record<string, unknown>) || {};
  if (metadata.provider_notify_state !== "held") {
    return { sent: false, reason: `state_${String(metadata.provider_notify_state ?? "absent")}` };
  }

  // Claim it before sending. Two releases can race (the family finishes at the
  // same moment the cron sweeps); whoever flips the row first owns the send.
  const { data: claimed, error: claimError } = await db
    .from("connections")
    .update({
      metadata: {
        ...metadata,
        provider_notify_state: "sending",
        provider_notify_released_by: opts.releasedBy,
        provider_notify_released_at: new Date().toISOString(),
      },
    })
    .eq("id", connection.id)
    .filter("metadata->>provider_notify_state", "eq", "held")
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return { sent: false, reason: "already_claimed" };
  }

  // Re-read before writing: the family can answer enrichment while this is
  // mid-flight, and that write must not be clobbered by a stale copy.
  const setState = async (state: string, extra: Record<string, unknown> = {}) => {
    const { data: current } = await db
      .from("connections")
      .select("metadata")
      .eq("id", connection.id)
      .maybeSingle();
    const latest = ((current?.metadata as Record<string, unknown>) || metadata);
    await db
      .from("connections")
      .update({ metadata: { ...latest, provider_notify_state: state, ...extra } })
      .eq("id", connection.id);
  };
  const finish = (state: "sent" | "skipped") => setState(state);

  /**
   * A throw anywhere in the send would otherwise strand the row in `sending`
   * forever: the cron only sweeps `held`, so the provider would never be told
   * about that lead and nothing would ever retry. Hand it back to the cron with
   * a fresh ceiling instead, and give up after three attempts so a permanently
   * bad row cannot loop.
   */
  const MAX_ATTEMPTS = 3;
  const failAndRequeue = async (err: unknown) => {
    const attempts = Number(metadata.provider_notify_attempts ?? 0) + 1;
    console.error(`[lead-notify] send failed (attempt ${attempts}) for ${connection.id}:`, err);
    if (attempts >= MAX_ATTEMPTS) {
      await setState("failed", { provider_notify_attempts: attempts });
      return;
    }
    await setState("held", {
      provider_notify_attempts: attempts,
      provider_notify_after: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  };

  const { data: provider } = await db
    .from("business_profiles")
    .select("id, slug, email, display_name, city, phone, metadata, source_provider_id")
    .eq("id", connection.to_profile_id)
    .maybeSingle();

  if (!provider) {
    await finish("skipped");
    return { sent: false, reason: "provider_not_found" };
  }
  const providerMeta = (provider.metadata as Record<string, unknown>) || {};
  // `leads_unsubscribed` gates EMAIL only, matching the behaviour this replaced.
  // SMS and WhatsApp carry their own `new_leads` notification preference, so
  // folding them in here would silently widen one opt-out into three.
  const providerEmail = providerMeta.leads_unsubscribed
    ? null
    : (provider.email?.trim() || null);

  let parsed: Record<string, unknown> = {};
  if (connection.message && connection.message.trim().startsWith("{")) {
    try { parsed = JSON.parse(connection.message) as Record<string, unknown>; } catch { /* keep empty */ }
  }

  const enriched = isEnrichedInquiry(connection.message, metadata);
  const familyFirstName = safeFirstName(parsed.seeker_name as string | null);
  const careTypeRaw = (parsed.care_type as string | null) || null;
  const careTypeDisplay = careTypeRaw ? (CARE_TYPE_LABELS[careTypeRaw] || careTypeRaw) : null;
  const careRecipientRaw = (parsed.care_recipient as string | null) || null;
  const careRecipientDisplay = careRecipientRaw
    ? (CARE_RECIPIENT_LABELS[careRecipientRaw] || null)
    : null;
  const providerName = provider.display_name || "your agency";
  const providerCity = provider.city || null;
  const providerSlug = provider.slug || provider.id;
  const siteUrl = getSiteUrl();

  try {
    // ── Ad Boost lead email (campaign-attributed leads only) ──
    const utmCampaign = typeof metadata.utm_campaign === "string" ? metadata.utm_campaign : null;
    const utmSource = typeof metadata.utm_source === "string" ? metadata.utm_source : null;
    let adBoostHandled = false;
    let shouldSendGenericLeadEmail = true;

    if (providerEmail && utmCampaign) {
      const adBoostLeadEmail = await sendAdBoostLeadDeliveredEmail({
        managedUtm: { utmSource, utmCampaign } as ManagedUtm,
        connectionId: connection.id,
        providerEmail,
        providerName,
        providerSlug: provider.slug || null,
        providerProfileId: connection.to_profile_id,
        familyName: familyFirstName || "A family",
        careType: careTypeDisplay,
        city: providerCity,
        careRecipient: careRecipientDisplay,
        enriched,
      });
      adBoostHandled = adBoostLeadEmail.sent || adBoostLeadEmail.skipped === "already_sent";
      shouldSendGenericLeadEmail =
        adBoostLeadEmail.skipped === "not_managed" ||
        adBoostLeadEmail.skipped === "missing_campaign" ||
        adBoostLeadEmail.skipped === "unknown_campaign";
    }

    // ── Generic new-lead email ──
    if (providerEmail && shouldSendGenericLeadEmail && !(await alreadySent(db, "connection_request", connection.id))) {
      const subject = buildLeadSubject({
        enriched,
        familyFirstName,
        city: providerCity,
        careTypeDisplay,
      });
      const emailLogId = await reserveEmailLogId({
        to: providerEmail,
        subject,
        emailType: "connection_request",
        recipientType: "provider",
        providerId: connection.to_profile_id,
        metadata: { connection_id: connection.id },
      });

      let viewUrl: string;
      let manageListingUrl: string;
      let settingsUrl: string;
      try {
        const { generateLeadClaimUrl, generateProviderPortalUrl } = await import("@/lib/claim-tokens");
        viewUrl = appendTrackingParams(
          generateLeadClaimUrl(providerSlug, providerEmail, connection.id, siteUrl),
          emailLogId,
        );
        manageListingUrl = generateProviderPortalUrl(providerSlug, providerEmail, "manage", siteUrl);
        settingsUrl = generateProviderPortalUrl(providerSlug, providerEmail, "settings", siteUrl);
      } catch {
        viewUrl = appendTrackingParams(
          `${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${connection.id}`,
          emailLogId,
        );
        manageListingUrl = `${siteUrl}/provider/${providerSlug}/onboard?action=manage`;
        settingsUrl = `${siteUrl}/provider/${providerSlug}/onboard?action=settings`;
      }

      await sendEmail({
        to: providerEmail,
        subject,
        html: connectionRequestEmail({
          providerName,
          familyName: familyFirstName || "A family",
          careType: careTypeDisplay,
          city: providerCity,
          careRecipient: careRecipientDisplay,
          viewUrl,
          manageListingUrl,
          settingsUrl,
          enriched,
        }),
        emailType: "connection_request",
        recipientType: "provider",
        providerId: connection.to_profile_id,
        emailLogId: emailLogId ?? undefined,
        recipientProfileId: connection.to_profile_id,
      });
    }

    // ── First lead celebration ──
    // Only when the lead is legible. Congratulating a provider on their first lead
    // and then showing them an email address with nothing attached is worse than
    // saying nothing.
      if (
      providerEmail &&
      metadata.provider_notify_is_first_lead &&
      !adBoostHandled &&
      enriched &&
      !(await alreadySent(db, "first_lead_celebration", connection.id))
    ) {
      const celebrationEmailLogId = await reserveEmailLogId({
        to: providerEmail,
        subject: "You got your first lead!",
        emailType: "first_lead_celebration",
        recipientType: "provider",
        providerId: connection.to_profile_id,
        metadata: { connection_id: connection.id },
      });
      let celebrationViewUrl: string;
      try {
        const { generateLeadClaimUrl } = await import("@/lib/claim-tokens");
        celebrationViewUrl = appendTrackingParams(
          generateLeadClaimUrl(providerSlug, providerEmail, connection.id, siteUrl),
          celebrationEmailLogId,
        );
      } catch {
        celebrationViewUrl = appendTrackingParams(
          `${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${connection.id}`,
          celebrationEmailLogId,
        );
      }
      await sendEmail({
        to: providerEmail,
        subject: "You got your first lead!",
        html: firstLeadCelebrationEmail({
          providerName,
          recipientName: providerName,
          familyName: familyFirstName || "A family",
          connectionId: connection.id,
          viewUrl: celebrationViewUrl,
        }),
        emailType: "first_lead_celebration",
        recipientType: "provider",
        providerId: connection.to_profile_id,
        emailLogId: celebrationEmailLogId ?? undefined,
        recipientProfileId: connection.to_profile_id,
      });
    }

    // ── SMS ──
    try {
      let providerPhone = provider.phone || null;
      const lookupId = provider.source_provider_id;
      if (!providerPhone && lookupId) {
        const { data: iosPhone } = await db
          .from("olera-providers")
          .select("phone")
          .eq("provider_id", lookupId)
          .maybeSingle();
        providerPhone = iosPhone?.phone || null;
      }
      const normalized = providerPhone ? normalizeUSPhone(providerPhone) : null;
      if (normalized) {
        await sendSMS({
          to: normalized,
          body: newInquirySms({
            familyName: familyFirstName || undefined,
            url: `${siteUrl}/provider/connections`,
          }),
          recipientProfileId: connection.to_profile_id,
          notificationType: "new_leads",
          // Directory landlines mostly. They still get the email above.
          requireMobile: true,
        });
      }
    } catch (smsErr) {
      console.error("[lead-notify] sms failed:", smsErr);
    }

    // ── WhatsApp (opted-in providers only) ──
    try {
      if (providerMeta.whatsapp_opted_in) {
        let waPhone = provider.phone || null;
        if (!waPhone && provider.source_provider_id) {
          const { data: waIos } = await db
            .from("olera-providers")
            .select("phone")
            .eq("provider_id", provider.source_provider_id)
            .maybeSingle();
          waPhone = waIos?.phone || null;
        }
        const waNormalized = waPhone ? normalizeUSPhone(waPhone) : null;
        if (waNormalized) {
          const familyLabel = familyFirstName || "A family";
          await sendWhatsApp({
            to: waNormalized,
            contentSid: process.env.TWILIO_WA_TEMPLATE_NEW_LEAD || "sandbox",
            contentVariables: { "1": familyLabel, "2": providerName },
            fallbackBody: `${familyLabel} reached out to ${providerName} through Olera.\n\nView inquiry: ${siteUrl}/provider/${providerSlug}/onboard?action=lead&actionId=${connection.id}`,
            messageType: "connection_request",
            recipientType: "provider",
            profileId: connection.to_profile_id,
            notificationType: "new_leads",
          });
        }
      }
    } catch (waErr) {
      console.error("[lead-notify] whatsapp failed:", waErr);
    }

  } catch (err) {
    await failAndRequeue(err);
    return { sent: false, reason: "send_failed" };
  }

  await finish("sent");
  await pingCareTeamForInquiry(db, connection, parsed, {
    familyFirstName,
    providerName: provider.display_name || null,
    careTypeDisplay,
    careRecipientDisplay,
  });
  return { sent: true };
}

/**
 * Put a provider-page family with a phone number in front of Ces (6 Oct).
 *
 * Seven in ten organic inquiries never leave a phone number; the ones that do
 * are the families Olera can actually call, so every one of them is pinged and
 * lands in "Call them" on the families board (lib/seeker-touches). Fired here,
 * at release, because the phone usually arrives during enrichment, a minute
 * after the inquiry itself, and this is the moment the provider is told too.
 *
 * Skipped, quietly: no phone; a city-ad family (already pinged at intake); a
 * family who inquired elsewhere in the last fourteen days (already on her list).
 * Never throws: the provider's notification has already gone out.
 */
async function pingCareTeamForInquiry(
  db: ReturnType<typeof getServiceClient>,
  connection: ConnectionRow,
  parsed: Record<string, unknown>,
  labels: { familyFirstName: string | null; providerName: string | null; careTypeDisplay: string | null; careRecipientDisplay: string | null },
): Promise<void> {
  try {
    const { data: family } = await db
      .from("business_profiles")
      .select("id, phone, state")
      .eq("id", connection.from_profile_id)
      .maybeSingle();
    const phone = normalizeUSPhone(String(parsed.seeker_phone ?? "") || family?.phone || "");
    if (!phone) return;

    const { data: cityLead } = await db
      .from("city_leads")
      .select("id")
      .eq("care_seeker_id", connection.from_profile_id)
      .limit(1)
      .maybeSingle();
    if (cityLead) return;

    const since = new Date(new Date(connection.created_at).getTime() - 14 * 86_400_000).toISOString();
    const { data: earlier } = await db
      .from("connections")
      .select("id")
      .eq("from_profile_id", connection.from_profile_id)
      .eq("type", "inquiry")
      .neq("id", connection.id)
      .gte("created_at", since)
      .lt("created_at", connection.created_at)
      .limit(1);
    if (earlier?.length) return;

    const state = (parsed.looking_in_state as string | null) || family?.state || null;
    const need = [labels.careTypeDisplay, labels.careRecipientDisplay ? `for ${labels.careRecipientDisplay}` : null]
      .filter(Boolean)
      .join(" ");
    await pingCareTeam({
      city: (parsed.looking_in_city as string | null) || state || "Provider page",
      timeZone: stateToTimezone(state) ?? "America/Chicago",
      firstName: labels.familyFirstName || "A family",
      phone,
      need: need || null,
      inquiredWith: labels.providerName || "the provider",
      submittedAt: new Date(connection.created_at),
      seekerId: connection.from_profile_id,
      source: "Provider page",
    });
  } catch (err) {
    console.error("[lead-notify] care team ping failed", err);
  }
}

/**
 * Subject line. When we know nothing, say so rather than asserting a family is
 * looking for care: on the evidence that claim is wrong often enough to cost the
 * provider's trust in every other one we send.
 */
function buildLeadSubject(opts: {
  enriched: boolean;
  familyFirstName: string | null;
  city: string | null;
  careTypeDisplay: string | null;
}): string {
  if (!opts.enriched) {
    return opts.city
      ? `Someone in ${opts.city} asked you to get in touch`
      : "Someone asked you to get in touch";
  }
  const name = opts.familyFirstName;
  const care = opts.careTypeDisplay?.toLowerCase() ?? null;
  if (name && opts.city && care) return `${name} in ${opts.city} is looking for ${care}`;
  if (!name && opts.city && care) return `A family in ${opts.city} is looking for ${care}`;
  if (name && care) return `${name} is looking for ${care}`;
  if (name && opts.city) return `${name} in ${opts.city} is looking for care`;
  if (name) return `${name} is looking for care`;
  if (opts.city) return `A family in ${opts.city} is looking for care`;
  return "A family is looking for care";
}

/**
 * Sweep held notifications whose ceiling has passed. Returns what it did so the
 * cron response is readable without opening the logs.
 */
export async function releaseExpiredLeadNotifications(limit = 100): Promise<{
  examined: number;
  sent: number;
  skipped: number;
}> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("connections")
    .select("id, metadata")
    .filter("metadata->>provider_notify_state", "eq", "held")
    .lte("metadata->>provider_notify_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[lead-notify] sweep query failed:", error);
    return { examined: 0, sent: 0, skipped: 0 };
  }

  let sent = 0;
  let skipped = 0;
  for (const row of data ?? []) {
    const result = await sendProviderLeadNotifications({
      connectionId: (row as { id: string }).id,
      releasedBy: "timeout",
    });
    if (result.sent) sent += 1;
    else skipped += 1;
  }
  return { examined: (data ?? []).length, sent, skipped };
}
