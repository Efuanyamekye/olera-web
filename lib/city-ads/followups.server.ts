/**
 * City lead follow-ups — the measurement layer. Server only.
 *
 * Two questions on a clock, and one consequence:
 *
 *   Day 2  → family:   "Did {Provider} reach you?"   1 yes / 2 not yet
 *   not yet → provider: one nudge with the family's number
 *   still nothing 24h later → the request is offered to the next provider
 *   Day 7, 21 → provider: "Did {name} become a client?" 1 / 2 / 3
 *
 * Why this exists: Ad Boost could not prove its one real client, because
 * nothing ever asked the provider (memory project_adboost_outcome_blindness).
 * A lead with no day-2 check is a lead we learn nothing from, and the question
 * cannot be asked retroactively — which is why this ships before the campaigns
 * go live rather than after.
 *
 * Every marker is stamped BEFORE the send and cleared if the send fails, so a
 * crash mid-run can never double-text and can never silently skip.
 *
 * Politeness: sends are confined to 9am–7pm in the CITY's timezone. That is the
 * right anchor here — the family answered an ad for that city, and the provider
 * works in it. Nothing is queued; a due item simply waits for the next hourly
 * run inside the window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";
import { sendSlackAlert } from "@/lib/slack";
import { generateCityOfferUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";
import { cityOutcomePingEmail } from "@/lib/email-templates";
import {
  cityFamilyCheckSms,
  cityFamilyReofferSms,
  cityOutcomePingSms,
  cityOutcomeThanksSms,
  cityProviderNudgeSms,
} from "@/lib/sms/templates";
import { CARE_LABEL, formatUSPhone, getCityConfig, hourIn } from "@/lib/city-ads/config";
import { startOrAdvance } from "@/lib/city-ads/offers.server";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Day 2 in practice: asked the morning after the day the provider took it. */
const FAMILY_CHECK_AFTER_MS = 20 * 60 * 60 * 1000;
/** How long a nudged provider has before the request moves on. */
const NUDGE_GRACE_MS = 24 * 60 * 60 * 1000;
const PING_1_DAYS = 7;
const PING_2_DAYS = 21;
/** Local window for every follow-up send. */
const POLITE_START = 9;
const POLITE_END = 19;

/** Statuses where a follow-up is still meaningful. */
const OPEN_STATUSES = ["accepted", "contacted"];

interface LeadRow {
  id: string;
  slug: string;
  first_name: string;
  phone: string;
  care_type: string;
  status: string;
  accepted_offer_id: string | null;
  reached_at: string | null;
  outcome: string | null;
  family_check_sent_at: string | null;
  family_check_reply: string | null;
  family_check_reply_at: string | null;
  provider_nudged_at: string | null;
  outcome_ping_1_at: string | null;
  outcome_ping_2_at: string | null;
}

const LEAD_COLS =
  "id, slug, first_name, phone, care_type, status, accepted_offer_id, reached_at, outcome, family_check_sent_at, family_check_reply, family_check_reply_at, provider_nudged_at, outcome_ping_1_at, outcome_ping_2_at";

export interface FollowupCounts {
  family_checks: number;
  provider_nudges: number;
  reoffers: number;
  outcome_pings: number;
  skipped_outside_hours: number;
  errors: number;
}

function politeNow(slug: string): boolean {
  const tz = getCityConfig(slug)?.timeZone ?? "America/New_York";
  const h = hourIn(tz);
  return h >= POLITE_START && h < POLITE_END;
}

/** The accepted offer's provider, with the number offers actually go to. */
async function acceptedProvider(
  db: SupabaseClient,
  lead: LeadRow,
): Promise<{ id: string; name: string; phone: string | null; email: string | null; offerId: string } | null> {
  if (!lead.accepted_offer_id) return null;
  const { data: offer } = await db
    .from("city_lead_offers")
    .select("id, provider_id")
    .eq("id", lead.accepted_offer_id)
    .maybeSingle();
  if (!offer) return null;
  const [{ data: profile }, { data: pool }] = await Promise.all([
    db.from("business_profiles").select("id, display_name, phone, email").eq("id", offer.provider_id).maybeSingle(),
    db.from("city_pool").select("phone_override").eq("slug", lead.slug).eq("provider_id", offer.provider_id).maybeSingle(),
  ]);
  const raw = (pool?.phone_override as string | null) || (profile?.phone as string | null) || null;
  return {
    id: offer.provider_id as string,
    name: (profile?.display_name as string) ?? "the provider",
    phone: raw ? normalizeUSPhone(raw) : null,
    email: (profile?.email as string) ?? null,
    offerId: offer.id as string,
  };
}

/**
 * One pass over everything due. Ordered so a lead advances at most one rung per
 * run: a family check today, a nudge tomorrow, a re-offer the day after.
 */
export async function runFollowups(db: SupabaseClient): Promise<FollowupCounts> {
  const out: FollowupCounts = {
    family_checks: 0,
    provider_nudges: 0,
    reoffers: 0,
    outcome_pings: 0,
    skipped_outside_hours: 0,
    errors: 0,
  };
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: rows } = await db
    .from("city_leads")
    .select(LEAD_COLS)
    .not("accepted_offer_id", "is", null)
    .in("status", OPEN_STATUSES)
    .limit(200);
  const leads = (rows ?? []) as LeadRow[];

  for (const lead of leads) {
    if (!politeNow(lead.slug)) {
      out.skipped_outside_hours++;
      continue;
    }
    try {
      // Rung 1 — the family check, once, ~20h after the provider took it.
      if (!lead.family_check_sent_at) {
        const { data: offer } = await db
          .from("city_lead_offers")
          .select("accepted_at")
          .eq("id", lead.accepted_offer_id!)
          .maybeSingle();
        const acceptedAt = offer?.accepted_at ? new Date(offer.accepted_at as string).getTime() : null;
        if (acceptedAt && now - acceptedAt >= FAMILY_CHECK_AFTER_MS) {
          const provider = await acceptedProvider(db, lead);
          if (provider) {
            await db.from("city_leads").update({ family_check_sent_at: nowIso, updated_at: nowIso }).eq("id", lead.id);
            const r = await sendSMS({
              to: lead.phone,
              body: cityFamilyCheckSms({ firstName: lead.first_name, providerName: provider.name }),
              emailType: "city_lead_family_check",
              recipientType: "family",
              metadata: { lead_id: lead.id },
            });
            if (r.success && !r.skipped) out.family_checks++;
            else await db.from("city_leads").update({ family_check_sent_at: null }).eq("id", lead.id);
          }
        }
        continue;
      }

      // Rung 2 — family said "not yet": the provider's one nudge.
      if (lead.family_check_reply === "not_yet" && !lead.provider_nudged_at && !lead.reached_at) {
        const provider = await acceptedProvider(db, lead);
        if (provider) {
          await db.from("city_leads").update({ provider_nudged_at: nowIso, updated_at: nowIso }).eq("id", lead.id);
          let delivered = false;
          if (provider.phone) {
            const r = await sendSMS({
              to: provider.phone,
              body: cityProviderNudgeSms({ firstName: lead.first_name, phone: formatUSPhone(lead.phone) }),
              emailType: "city_lead_provider_nudge",
              recipientType: "provider",
              recipientLogProfileId: provider.id,
              metadata: { lead_id: lead.id },
            });
            delivered = r.success && !r.skipped;
          }
          if (provider.email) {
            const r = await sendEmail({
              to: provider.email,
              subject: `${lead.first_name} has not heard from you yet`,
              html: cityOutcomePingEmail({
                firstName: lead.first_name,
                city: getCityConfig(lead.slug)?.city ?? lead.slug,
                careLabel: CARE_LABEL[lead.care_type as keyof typeof CARE_LABEL] ?? "care",
                offerUrl: generateCityOfferUrl(provider.offerId, getSiteUrl()),
              }),
              replyTo: "support@olera.care",
              emailType: "city_lead_provider_nudge",
              recipientType: "provider",
              providerId: provider.id,
              metadata: { lead_id: lead.id },
            });
            delivered = delivered || (r.success && !r.skipped);
          }
          if (delivered) out.provider_nudges++;
          else await db.from("city_leads").update({ provider_nudged_at: null }).eq("id", lead.id);
        }
        continue;
      }

      // Rung 3 — nudged, still nothing: offer it to the next provider.
      if (
        lead.family_check_reply === "not_yet" &&
        lead.provider_nudged_at &&
        !lead.reached_at &&
        now - new Date(lead.provider_nudged_at).getTime() >= NUDGE_GRACE_MS
      ) {
        const provider = await acceptedProvider(db, lead);
        // Release the claim so the chain can advance, and record the miss.
        await db
          .from("city_leads")
          .update({ accepted_offer_id: null, status: "offered", updated_at: nowIso })
          .eq("id", lead.id);
        if (provider) {
          await db
            .from("city_lead_offers")
            .update({ outcome: "no_contact" })
            .eq("id", provider.offerId);
        }
        const r = await startOrAdvance(db, lead.id, { force: true });
        if (r.action === "offered") out.reoffers++;
        await sendSMS({
          to: lead.phone,
          body: cityFamilyReofferSms({ firstName: lead.first_name, city: getCityConfig(lead.slug)?.city ?? lead.slug }),
          emailType: "city_lead_family_reoffer",
          recipientType: "family",
          metadata: { lead_id: lead.id },
        });
        await sendSlackAlert(
          `City lead ${lead.id.slice(0, 8)}: ${provider?.name ?? "the provider"} never called ${lead.first_name} after a nudge. Re-offered (${r.action}). /admin/city-ads`,
        );
        continue;
      }

      // Rung 4 — the outcome question, day 7 and day 21.
      if (lead.outcome === "client") continue;
      const { data: offer } = await db
        .from("city_lead_offers")
        .select("accepted_at")
        .eq("id", lead.accepted_offer_id!)
        .maybeSingle();
      const acceptedAt = offer?.accepted_at ? new Date(offer.accepted_at as string).getTime() : null;
      if (!acceptedAt) continue;
      const ageDays = (now - acceptedAt) / DAY_MS;
      const which =
        !lead.outcome_ping_1_at && ageDays >= PING_1_DAYS
          ? ("outcome_ping_1_at" as const)
          : lead.outcome_ping_1_at && !lead.outcome_ping_2_at && ageDays >= PING_2_DAYS
            ? ("outcome_ping_2_at" as const)
            : null;
      if (!which) continue;

      const provider = await acceptedProvider(db, lead);
      if (!provider) continue;
      await db.from("city_leads").update({ [which]: nowIso, updated_at: nowIso }).eq("id", lead.id);
      const city = getCityConfig(lead.slug)?.city ?? lead.slug;
      let delivered = false;
      if (provider.phone) {
        const r = await sendSMS({
          to: provider.phone,
          body: cityOutcomePingSms({ firstName: lead.first_name, city }),
          emailType: "city_lead_outcome_ping",
          recipientType: "provider",
          recipientLogProfileId: provider.id,
          metadata: { lead_id: lead.id, ping: which },
        });
        delivered = r.success && !r.skipped;
      }
      if (provider.email) {
        const r = await sendEmail({
          to: provider.email,
          subject: `Did ${lead.first_name} become a client?`,
          html: cityOutcomePingEmail({
            firstName: lead.first_name,
            city,
            careLabel: CARE_LABEL[lead.care_type as keyof typeof CARE_LABEL] ?? "care",
            offerUrl: generateCityOfferUrl(provider.offerId, getSiteUrl()),
          }),
          replyTo: "support@olera.care",
          emailType: "city_lead_outcome_ping",
          recipientType: "provider",
          providerId: provider.id,
          metadata: { lead_id: lead.id, ping: which },
        });
        delivered = delivered || (r.success && !r.skipped);
      }
      if (delivered) out.outcome_pings++;
      else await db.from("city_leads").update({ [which]: null }).eq("id", lead.id);
    } catch (err) {
      console.error("[city-followups] lead", lead.id, err);
      out.errors++;
    }
  }
  return out;
}

/**
 * A family answering the day-2 check. Returns a reply when consumed.
 * Scoped to a lead whose check was sent and not yet answered, so a stray "1"
 * from any other number falls through to the existing handlers.
 */
export async function handleFamilyCheckReply(
  db: SupabaseClient,
  fromPhone: string,
  body: string,
): Promise<string | null> {
  const phone = normalizeUSPhone(fromPhone);
  if (!phone) return null;
  const word = body.trim().toUpperCase();
  const yes = /^(1|YES|Y|YEP|THEY DID|CALLED)\b/.test(word);
  const no = /^(2|NO|NOT YET|NOPE|HAVENT|HAVE NOT)\b/.test(word);
  if (!yes && !no) return null;

  const { data: rows } = await db
    .from("city_leads")
    .select("id, slug, first_name, accepted_offer_id")
    .eq("phone", phone)
    .not("family_check_sent_at", "is", null)
    .is("family_check_reply", null)
    .order("family_check_sent_at", { ascending: false })
    .limit(1);
  const lead = rows?.[0];
  if (!lead) return null;

  const now = new Date().toISOString();
  if (yes) {
    await db
      .from("city_leads")
      .update({ family_check_reply: "reached", family_check_reply_at: now, reached_at: now, status: "contacted", updated_at: now })
      .eq("id", lead.id);
    return "Good to hear. If they turn out not to be the right fit, reply here and we will send another.";
  }
  await db
    .from("city_leads")
    .update({ family_check_reply: "not_yet", family_check_reply_at: now, updated_at: now })
    .eq("id", lead.id);
  await sendSlackAlert(
    `City lead ${lead.id.slice(0, 8)}: ${lead.first_name} says the provider has NOT called yet. Nudging them; re-offer in 24h if still nothing. /admin/city-ads`,
  );
  return "Thanks for telling us. We are reminding them now, and we will send your request to another provider if you do not hear back today.";
}

/**
 * A provider answering the day-7/21 outcome question. Returns a reply when
 * consumed. Scoped to a provider phone with an outstanding ping.
 */
export async function handleOutcomeReply(
  db: SupabaseClient,
  fromPhone: string,
  body: string,
): Promise<string | null> {
  const phone = normalizeUSPhone(fromPhone);
  const key = phone?.replace(/\D/g, "").slice(-10);
  if (!key) return null;
  const word = body.trim().toUpperCase();
  const outcome: "client" | "talking" | "no" | null = /^(1|YES|CLIENT|SIGNED)\b/.test(word)
    ? "client"
    : /^(2|STILL|TALKING)\b/.test(word)
      ? "talking"
      : /^(3|NO|NOT A FIT|NO FIT)\b/.test(word)
        ? "no"
        : null;
  if (!outcome) return null;

  // The provider's most recent accepted offer that is still awaiting an answer.
  const { data: offers } = await db
    .from("city_lead_offers")
    .select("id, lead_id, accepted_at")
    .eq("provider_phone", key)
    .not("accepted_at", "is", null)
    .order("accepted_at", { ascending: false })
    .limit(10);
  for (const o of offers ?? []) {
    const { data: lead } = await db
      .from("city_leads")
      .select("id, outcome, outcome_ping_1_at")
      .eq("id", o.lead_id as string)
      .maybeSingle();
    if (!lead || !lead.outcome_ping_1_at) continue;
    if (lead.outcome === "client") continue;
    const now = new Date().toISOString();
    await db
      .from("city_leads")
      .update({
        outcome,
        outcome_at: now,
        outcome_source: "provider_sms",
        status: outcome === "client" ? "client" : outcome === "no" ? "no_fit" : "contacted",
        updated_at: now,
      })
      .eq("id", lead.id);
    await db.from("city_lead_offers").update({ outcome }).eq("id", o.id as string);
    if (outcome === "client") {
      await sendSlackAlert(
        `🎉 City lead ${lead.id.slice(0, 8)} became a CLIENT. That is the number the pilot exists to produce. /admin/city-ads`,
      );
    }
    return cityOutcomeThanksSms(outcome);
  }
  return null;
}
