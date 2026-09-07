/**
 * City lead offer chain — server only.
 *
 * The relay, in order:
 *   private request -> offer to provider #1 (no contact details) -> 30 min ->
 *   #2 -> #3 -> unfilled (Slack, human). A YES claims the lead with ONE
 *   conditional update (accepted_offer_id IS NULL), so a late YES on an
 *   already-taken lead loses cleanly. Only on a claim do the family's details
 *   move: to the provider by text, and the provider's name and number to the
 *   family by text.
 *
 * Staffed hours are 8am to 8pm in the city's zone. Outside them the chain parks
 * (city_leads.next_offer_at) and the cron (/api/cron/city-lead-offers) starts
 * it at 8am. The same cron expires offers past their window and advances.
 *
 * Everything here uses the service-role client. Nothing throws to callers
 * except programmer errors; delivery failures are logged and surfaced in Slack.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { sendEmail } from "@/lib/email";
import { cityOfferEmail, cityOfferAcceptedEmail } from "@/lib/email-templates";
import { generateCityOfferUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import {
  cityOfferSms,
  cityAcceptedProviderSms,
  cityDeclinedAskReasonSms,
  cityOfferGoneSms,
  cityFamilyAcceptedSms,
  cityFamilyStillWorkingSms,
} from "@/lib/sms/templates";
import {
  CARE_LABEL,
  RECIPIENT_LABEL,
  URGENCY_LABEL,
  PAYMENT_LABEL,
  MAX_OFFERS_PER_LEAD,
  OFFER_WINDOW_MINUTES,
  formatUSPhone,
  getCityConfig,
  hourIn,
  isStaffedNow,
  nextStaffedStart,
  type CityCareType,
  type CityRecipient,
  type CityUrgency,
} from "@/lib/city-ads/config";

export interface CityLeadRow {
  id: string;
  slug: string;
  care_recipient: CityRecipient | null;
  care_type: CityCareType;
  urgency: CityUrgency | null;
  zip: string | null;
  first_name: string;
  phone: string;
  note: string | null;
  payment_type: string | null;
  status: string;
  accepted_offer_id: string | null;
  offer_count: number;
  next_offer_at: string | null;
}

export interface CityOfferRow {
  id: string;
  lead_id: string;
  provider_id: string;
  position: number;
  provider_phone: string | null;
  offered_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  expired_at: string | null;
}

interface PoolEntry {
  id: string;
  provider_id: string;
  position: number;
  care_types: string[];
  enabled: boolean;
  phone_override: string | null;
}

interface ProviderLite {
  id: string;
  display_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}

const LEAD_COLS =
  "id, slug, care_recipient, care_type, urgency, zip, first_name, phone, note, payment_type, status, accepted_offer_id, offer_count, next_offer_at";

function last10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

function labels(lead: CityLeadRow) {
  return {
    careLabel: CARE_LABEL[lead.care_type] ?? "care",
    recipientLabel: RECIPIENT_LABEL[lead.care_recipient ?? "other"] ?? "a family member",
    urgencyLabel: URGENCY_LABEL[lead.urgency ?? "this_month"] ?? "starting soon",
    paymentLabel: lead.payment_type ? PAYMENT_LABEL[lead.payment_type] ?? null : null,
  };
}

/** "today" before 5pm local, otherwise "by noon tomorrow". */
function callByLabel(timeZone: string): string {
  return hourIn(timeZone) < 17 ? "today" : "by noon tomorrow";
}

async function getLead(db: SupabaseClient, leadId: string): Promise<CityLeadRow | null> {
  const { data } = await db.from("city_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  return (data as CityLeadRow | null) ?? null;
}

async function getProviders(db: SupabaseClient, ids: string[]): Promise<Map<string, ProviderLite>> {
  const out = new Map<string, ProviderLite>();
  if (ids.length === 0) return out;
  const { data } = await db.from("business_profiles").select("id, display_name, city, phone, email").in("id", ids);
  for (const p of (data ?? []) as ProviderLite[]) out.set(p.id, p);
  return out;
}

function providerPhone(entry: PoolEntry | undefined, provider: ProviderLite | undefined): string | null {
  const raw = entry?.phone_override || provider?.phone || null;
  return raw ? normalizeUSPhone(raw) : null;
}

/**
 * Start the chain for a new lead, or advance it after a miss. Idempotent on a
 * lead that is already accepted, stopped, or otherwise closed.
 */
export async function startOrAdvance(
  db: SupabaseClient,
  leadId: string,
  opts: { force?: boolean; providerId?: string } = {},
): Promise<{ action: "offered" | "parked" | "unfilled" | "closed" | "noop"; providerName?: string }> {
  const lead = await getLead(db, leadId);
  if (!lead) return { action: "noop" };
  if (lead.accepted_offer_id || !["new", "offered", "unfilled"].includes(lead.status)) {
    return { action: "closed" };
  }
  if (lead.status === "unfilled" && !opts.force && !opts.providerId) return { action: "noop" };

  const cfg = getCityConfig(lead.slug);
  const tz = cfg?.timeZone ?? "America/New_York";
  const city = cfg?.city ?? lead.slug;

  // An open (unanswered, unexpired) offer means the clock is still running.
  const { data: open } = await db
    .from("city_lead_offers")
    .select("id, expires_at")
    .eq("lead_id", lead.id)
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("expired_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if ((open?.length ?? 0) > 0 && !opts.force) return { action: "noop" };

  if (!isStaffedNow(tz) && !opts.force) {
    const at = nextStaffedStart(tz).toISOString();
    await db.from("city_leads").update({ next_offer_at: at, updated_at: new Date().toISOString() }).eq("id", lead.id);
    return { action: "parked" };
  }

  // Who has already seen it.
  const { data: prior } = await db.from("city_lead_offers").select("provider_id, position").eq("lead_id", lead.id);
  const seen = new Set((prior ?? []).map((o) => o.provider_id as string));
  const nextPosition = (prior?.length ?? 0) + 1;

  let candidate: PoolEntry | null = null;
  if (opts.providerId) {
    const { data } = await db
      .from("city_pool")
      .select("id, provider_id, position, care_types, enabled, phone_override")
      .eq("slug", lead.slug)
      .eq("provider_id", opts.providerId)
      .maybeSingle();
    candidate = (data as PoolEntry | null) ?? { id: "", provider_id: opts.providerId, position: 0, care_types: [], enabled: true, phone_override: null };
  } else {
    if (nextPosition > MAX_OFFERS_PER_LEAD && !opts.force) {
      return markUnfilled(db, lead, city);
    }
    const { data: pool } = await db
      .from("city_pool")
      .select("id, provider_id, position, care_types, enabled, phone_override")
      .eq("slug", lead.slug)
      .eq("enabled", true)
      .order("position", { ascending: true });
    const entries = ((pool ?? []) as PoolEntry[]).filter((e) => !seen.has(e.provider_id));
    // "unsure" goes to home care first (most families prefer in-home), then AL.
    const wants: string[] =
      lead.care_type === "unsure" ? ["home_care", "assisted_living"] : [lead.care_type];
    for (const w of wants) {
      const hit = entries.find((e) => e.care_types.includes(w));
      if (hit) {
        candidate = hit;
        break;
      }
    }
    if (!candidate) return markUnfilled(db, lead, city);
  }

  const providers = await getProviders(db, [candidate.provider_id]);
  const provider = providers.get(candidate.provider_id);
  const phone = providerPhone(candidate, provider);
  const email = provider?.email?.trim() || null;
  const name = provider?.display_name ?? "a provider";
  if (!phone && !email) {
    await sendSlackAlert(
      `City lead ${lead.id.slice(0, 8)} (${city}): ${name} has no email or phone on file, skipping. Fix the pool at /admin/city-ads.`,
    );
    // Record a skipped offer so we do not loop on the same provider.
    await db.from("city_lead_offers").insert({
      lead_id: lead.id,
      provider_id: candidate.provider_id,
      position: nextPosition,
      provider_phone: null,
      expires_at: new Date().toISOString(),
      expired_at: new Date().toISOString(),
      decline_reason: "other",
    });
    return startOrAdvance(db, lead.id, { force: opts.force });
  }

  const expiresAt = new Date(Date.now() + OFFER_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: inserted, error: offerErr } = await db
    .from("city_lead_offers")
    .insert({
      lead_id: lead.id,
      provider_id: candidate.provider_id,
      position: nextPosition,
      provider_phone: last10(phone),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (offerErr || !inserted) {
    console.error("[city-ads] offer insert failed", offerErr);
    return { action: "noop" };
  }
  const offerUrl = generateCityOfferUrl(inserted.id as string, getSiteUrl());
  await db
    .from("city_leads")
    .update({ status: "offered", offer_count: nextPosition, next_offer_at: null, updated_at: new Date().toISOString() })
    .eq("id", lead.id);

  const l = labels(lead);
  // Email first: many provider numbers are office lines. The text goes only
  // where a text can land (requireMobile), and carries the same link.
  const channels: string[] = [];
  if (email) {
    const r = await sendEmail({
      to: email,
      subject: `A family in ${city} is looking for ${l.careLabel}`,
      html: cityOfferEmail({ providerName: name, city, ...l, minutes: OFFER_WINDOW_MINUTES, offerUrl }),
      replyTo: "support@olera.care",
      emailType: "city_lead_offer",
      recipientType: "provider",
      providerId: candidate.provider_id,
      metadata: { lead_id: lead.id, offer_id: inserted.id, slug: lead.slug, position: nextPosition },
    });
    if (r.success && !r.skipped) channels.push("email");
  }
  if (phone) {
    const r = await sendSMS({
      to: phone,
      body: `${cityOfferSms({ city, ...l, minutes: OFFER_WINDOW_MINUTES })} Details: ${offerUrl}`,
      emailType: "city_lead_offer",
      recipientType: "provider",
      recipientLogProfileId: candidate.provider_id,
      requireMobile: !candidate.phone_override, // a number typed as the override was given for texts
      metadata: { lead_id: lead.id, offer_id: inserted.id, slug: lead.slug, position: nextPosition },
    });
    if (r.success && !r.skipped) channels.push("text");
  }
  await sendSlackAlert(
    `City lead ${lead.id.slice(0, 8)} (${city}): offer #${nextPosition} to ${name} by ${channels.length ? channels.join(" and ") : "NOTHING (both sends failed)"}. ${l.careLabel} for ${l.recipientLabel}, ${l.urgencyLabel}. ${OFFER_WINDOW_MINUTES} min clock. /admin/city-ads`,
  );
  return { action: "offered", providerName: name };
}

async function markUnfilled(db: SupabaseClient, lead: CityLeadRow, city: string) {
  const alreadyUnfilled = lead.status === "unfilled";
  await db.from("city_leads").update({ status: "unfilled", next_offer_at: null, updated_at: new Date().toISOString() }).eq("id", lead.id);
  if (alreadyUnfilled) return { action: "unfilled" as const };
  await sendSlackAlert(
    `⚠️ City lead ${lead.id.slice(0, 8)} (${city}) is UNFILLED: no enabled provider left for ${CARE_LABEL[lead.care_type]}. ${lead.first_name}, ${formatUSPhone(lead.phone)}. Route by hand at /admin/city-ads.`,
  );
  await sendSMS({
    to: lead.phone,
    body: cityFamilyStillWorkingSms({ firstName: lead.first_name, city }),
    emailType: "city_lead_family_still_working",
    recipientType: "family",
    metadata: { lead_id: lead.id },
  });
  return { action: "unfilled" as const };
}

/**
 * A provider's YES. Claims the lead with a conditional update; the loser of a
 * race gets a polite "already taken".
 */
export async function acceptOffer(
  db: SupabaseClient,
  offer: CityOfferRow,
  source: "provider_sms" | "provider_page" | "admin" = "provider_sms",
): Promise<{ won: boolean; reply: string }> {
  const now = new Date().toISOString();
  const { data: claimed } = await db
    .from("city_leads")
    .update({ accepted_offer_id: offer.id, status: "accepted", next_offer_at: null, updated_at: now })
    .eq("id", offer.lead_id)
    .is("accepted_offer_id", null)
    .in("status", ["new", "offered", "unfilled"])
    .select(LEAD_COLS);
  const lead = (claimed?.[0] as CityLeadRow | undefined) ?? null;
  if (!lead) return { won: false, reply: cityOfferGoneSms() };

  await db.from("city_lead_offers").update({ accepted_at: now }).eq("id", offer.id);

  const cfg = getCityConfig(lead.slug);
  const tz = cfg?.timeZone ?? "America/New_York";
  const city = cfg?.city ?? lead.slug;
  const callBy = callByLabel(tz);
  const providers = await getProviders(db, [offer.provider_id]);
  const provider = providers.get(offer.provider_id);
  const { data: poolRow } = await db
    .from("city_pool")
    .select("id, provider_id, position, care_types, enabled, phone_override")
    .eq("slug", lead.slug)
    .eq("provider_id", offer.provider_id)
    .maybeSingle();
  const pool = (poolRow as PoolEntry | null) ?? undefined;
  const provPhone = providerPhone(pool, provider);
  const providerName = provider?.display_name ?? "The provider";
  const l = labels(lead);
  const offerUrl = generateCityOfferUrl(offer.id, getSiteUrl());

  // Details by text where a text can land; by link in email everywhere. The
  // email itself carries no name or number.
  if (provider?.email) {
    await sendEmail({
      to: provider.email,
      subject: `You took a family's request in ${city}`,
      html: cityOfferAcceptedEmail({ providerName, city, careLabel: l.careLabel, callBy, offerUrl }),
      replyTo: "support@olera.care",
      emailType: "city_lead_accepted_provider",
      recipientType: "provider",
      providerId: offer.provider_id,
      metadata: { lead_id: lead.id, offer_id: offer.id },
    });
  }
  if (provPhone) {
    await sendSMS({
      to: provPhone,
      body: cityAcceptedProviderSms({
        firstName: lead.first_name,
        phone: formatUSPhone(lead.phone),
        careLabel: l.careLabel,
        recipientLabel: l.recipientLabel,
        urgencyLabel: l.urgencyLabel,
        note: lead.note,
        callBy,
        providerPhone: formatUSPhone(provider?.phone ?? provPhone ?? ""),
      }),
      emailType: "city_lead_accepted_provider",
      recipientType: "provider",
      recipientLogProfileId: offer.provider_id,
      requireMobile: !pool?.phone_override,
      metadata: { lead_id: lead.id, offer_id: offer.id },
    });
  }
  await sendSMS({
    to: lead.phone,
    body: cityFamilyAcceptedSms({
      providerName,
      city: provider?.city ?? city,
      providerPhone: formatUSPhone(provider?.phone ?? provPhone ?? ""),
      callBy,
    }),
    emailType: "city_lead_accepted_family",
    recipientType: "family",
    metadata: { lead_id: lead.id, offer_id: offer.id },
  });
  await sendSlackAlert(
    `✅ City lead ${lead.id.slice(0, 8)} (${city}) ACCEPTED by ${providerName}${source === "admin" ? " (admin)" : source === "provider_page" ? " (link)" : " (text)"}. ${lead.first_name} told to expect a call ${callBy}. /admin/city-ads`,
  );
  // The reply to the provider's YES itself: the details went in a separate text
  // so they survive as their own message in the thread.
  return { won: true, reply: `Sent ${lead.first_name}'s details in the next text. Thank you.` };
}

/** A provider's NO (or an admin skip). Records it and advances the chain. */
export async function declineOffer(
  db: SupabaseClient,
  offer: CityOfferRow,
  reason: string | null = null,
): Promise<{ reply: string }> {
  await db
    .from("city_lead_offers")
    .update({ declined_at: new Date().toISOString(), decline_reason: reason })
    .eq("id", offer.id)
    .is("accepted_at", null);
  const next = await startOrAdvance(db, offer.lead_id);
  console.log(`[city-ads] offer ${offer.id} declined, advance -> ${next.action}`);
  return { reply: cityDeclinedAskReasonSms() };
}

/**
 * Inbound text from a phone that may belong to a provider with an open offer.
 * Returns a reply when the message was consumed by the chain, null otherwise so
 * the webhook can fall through to its normal handling.
 */
export async function handleProviderReply(
  db: SupabaseClient,
  fromPhone: string,
  body: string,
): Promise<string | null> {
  const key = last10(fromPhone);
  if (!key) return null;
  const word = body.trim().toUpperCase();
  const isYes = /^(YES|Y|YEP|YEAH|TAKE|TAKE IT|ACCEPT|OK|OKAY)\b/.test(word);
  const isNo = /^(NO|N|NOPE|PASS|DECLINE|CANT|CAN'T|CANNOT)\b/.test(word);
  const digit = /^[1-4]$/.test(word) ? word : null;
  if (!isYes && !isNo && !digit) return null;

  // Most recent offer to this number in the last 6 hours, open first.
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: offers } = await db
    .from("city_lead_offers")
    .select("id, lead_id, provider_id, position, provider_phone, offered_at, expires_at, accepted_at, declined_at, decline_reason, expired_at")
    .eq("provider_phone", key)
    .gte("offered_at", since)
    .order("offered_at", { ascending: false })
    .limit(5);
  const list = (offers ?? []) as CityOfferRow[];
  // No offer has ever gone to this number: not ours. Fall through so a family's
  // YES still reaches the TCPA opt-in branch and a family's "1" still reaches
  // the benefits and outcome handlers.
  if (list.length === 0) return null;

  if (digit) {
    const declined = list.find((o) => o.declined_at && !o.decline_reason);
    if (!declined) return null;
    const reason = ({ "1": "capacity", "2": "area", "3": "payment", "4": "medical" } as Record<string, string>)[digit];
    await db.from("city_lead_offers").update({ decline_reason: reason }).eq("id", declined.id);
    return "Noted, thank you.";
  }

  const open = list.find((o) => !o.accepted_at && !o.declined_at);
  // Nothing open for this provider ("Ok thanks" after their own acceptance, a
  // second NO): not a chain message. Let the webhook's normal path handle it.
  if (!open) return null;

  if (isYes) {
    // An expired-but-unclaimed offer may still win: the lead is not taken and
    // the provider is willing. The conditional update decides.
    const r = await acceptOffer(db, open);
    return r.reply;
  }
  const r = await declineOffer(db, open);
  return r.reply;
}

/**
 * Cron body: start parked chains once staffed hours open, expire offers past
 * their window and advance, and pick up any 'new' lead the request path failed
 * to start (safety net, 2 minutes old or more).
 */
export async function runOfferMaintenance(db: SupabaseClient): Promise<{
  started: number;
  expired: number;
  advanced: number;
  unfilled: number;
  parked: number;
}> {
  const now = new Date().toISOString();
  const out = { started: 0, expired: 0, advanced: 0, unfilled: 0, parked: 0 };

  // 1. Offers past their window.
  const { data: due } = await db
    .from("city_lead_offers")
    .select("id, lead_id, provider_id, position, provider_phone, offered_at, expires_at, accepted_at, declined_at, decline_reason, expired_at")
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("expired_at", null)
    .lt("expires_at", now)
    .limit(50);
  for (const o of (due ?? []) as CityOfferRow[]) {
    await db.from("city_lead_offers").update({ expired_at: now }).eq("id", o.id).is("accepted_at", null);
    out.expired++;
    const r = await startOrAdvance(db, o.lead_id);
    if (r.action === "offered") out.advanced++;
    else if (r.action === "unfilled") out.unfilled++;
    else if (r.action === "parked") out.parked++;
  }

  // 2. Parked leads whose morning has come, plus stragglers never started.
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: waiting } = await db
    .from("city_leads")
    .select("id, next_offer_at, created_at")
    .eq("status", "new")
    .is("accepted_offer_id", null)
    .or(`next_offer_at.lte.${now},and(next_offer_at.is.null,created_at.lte.${twoMinAgo})`)
    .limit(50);
  for (const w of waiting ?? []) {
    const r = await startOrAdvance(db, w.id as string);
    if (r.action === "offered") out.started++;
    else if (r.action === "unfilled") out.unfilled++;
    else if (r.action === "parked") out.parked++;
  }
  return out;
}
