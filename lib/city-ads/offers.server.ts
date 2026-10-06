import { cityLeadBlocked } from "./messages.server";
import { getLeadExchange } from "./exchange.server";
import { classifyQualification, BLOCKING_CATEGORIES, type ClassifyLead } from "./classify.server";
import { resolvePrimaryCampaign, handToPrimary, HANDOVER_AFTER_MS } from "./primary.server";
import { getThreadLead, notifyProviderOfHandover } from "./thread.server";
import { providerAlertPhone } from "./provider-alert-phone";
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
import { cityOfferEmail, cityOfferAcceptedEmail, cityThreadProviderEmail } from "@/lib/email-templates";
import { generateCityOfferUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import { recordProviderEvent } from "@/lib/analytics/provider-events";
import { providerSignInUrl } from "@/lib/city-ads/provider-links.server";
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
  OFFER_WINDOW_BUSINESS_MINUTES,
  OFFER_NUDGE_AFTER_BUSINESS_MINUTES,
  OFFER_UNREACHED_BUSINESS_MINUTES,
  addBusinessMinutes,
  businessMinutesBetween,
  formatUntil,
  isProviderHours,
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
  capture_method?: string;
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
  created_at: string;
  qualification_reply: string | null;
  qualification_reply_at: string | null;
  qualification_escalated_at: string | null;
  qualification_verdict: string | null;
  qualification_verdict_category: string | null;
  meta_campaign_id?: string | null;
  handed_at?: string | null;
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
  slug: string | null;
  display_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  metadata?: unknown;
}

const LEAD_COLS =
  "capture_method, id, slug, care_recipient, care_type, urgency, zip, first_name, phone, note, payment_type, status, accepted_offer_id, offer_count, next_offer_at, created_at, qualification_reply, qualification_reply_at, qualification_escalated_at, qualification_verdict, qualification_verdict_category, meta_campaign_id, handed_at";

/**
 * How long a native lead waits for its qualifying reply before a person is
 * asked to call. The confirmation goes out within about five minutes of
 * submission, so the family is holding the phone by construction and replies
 * concentrate in those first minutes rather than over hours.
 *
 * What happens at the end of the hour is the whole point: the lead goes to a
 * PERSON, never to a provider. Two Dallas providers have now been told in
 * writing that we would rather hold a request back than send them another name
 * with nothing attached, and a timer that routed silence anyway would make that
 * sentence false on the first lead. So the hour is not a licence to route; it
 * is how long we wait before a human takes it over.
 *
 * Watch reply latency across the first leads and lengthen this if most answers
 * land past the hour.
 */
const NATIVE_QUALIFY_MS = 60 * 60 * 1000;

function last10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

function labels(lead: CityLeadRow) {
  return {
    careLabel: CARE_LABEL[lead.care_type] ?? "care",
    recipientLabel: RECIPIENT_LABEL[lead.care_recipient ?? "other"] ?? "a family member",
    // Null urgency stays null. It used to default to "this_month", which meant
    // a lead nobody had asked about timing reached a provider as "starting this
    // month" — a commitment the family never made, in a message where the name
    // and number are withheld, so those few words ARE the lead. Every city lead
    // in the system has a null urgency, so every offer we could make carried an
    // invented deadline. Payment already behaved correctly; urgency now matches.
    urgencyLabel: lead.urgency ? URGENCY_LABEL[lead.urgency] ?? null : null,
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
  const { data } = await db.from("business_profiles").select("id, slug, display_name, city, phone, email, metadata").in("id", ids);
  for (const p of (data ?? []) as ProviderLite[]) out.set(p.id, p);
  return out;
}

function providerPhone(entry: PoolEntry | undefined, provider: ProviderLite | undefined): string | null {
  const raw = entry?.phone_override || providerAlertPhone(provider) || null;
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
): Promise<{ action: "offered" | "parked" | "unfilled" | "closed" | "escalated" | "held" | "handed" | "noop"; providerName?: string }> {
  if (await cityLeadBlocked(db, leadId)) return { action: "noop" };
  const lead = await getLead(db, leadId);
  if (!lead) return { action: "noop" };
  if (lead.accepted_offer_id || !["new", "offered", "unfilled"].includes(lead.status)) {
    return { action: "closed" };
  }
  const cfg = getCityConfig(lead.slug);
  const tz = cfg?.timeZone ?? "America/New_York";
  const city = cfg?.city ?? lead.slug;

  // A LEAD FROM A PROVIDER'S OWN AD IS HERS. It skips the pool, the offer clock
  // and the person-calls-it escalation below: it is handed to her campaign page
  // once it has either answered as a family or had an hour to answer. See
  // primary.server.ts. A handed lead is closed to the relay; only an explicit
  // admin "Offer to…" (providerId or force) moves it anywhere else.
  if (!opts.providerId && !opts.force) {
    if (lead.handed_at) return { action: "closed" };
    const primary = await resolvePrimaryCampaign(db, lead);
    if (primary) {
      // Judged not a family (job seeker, spam): the qualification pass has
      // already filed it, and it never reaches her.
      if (lead.qualification_verdict === "not_care_seeker") return { action: "held" };
      const replied = lead.qualification_verdict === "care_seeker";
      const waited = Date.now() - new Date(lead.created_at).getTime() >= HANDOVER_AFTER_MS;
      if (!replied && !waited) return { action: "held" };
      const handed = await handToPrimary(db, lead, primary, replied ? "replied" : "timer");
      if (handed) {
        // Best-effort: the family is on her page either way.
        try {
          const tl = await getThreadLead(db, lead.id);
          if (tl) await notifyProviderOfHandover(db, tl);
        } catch (e) {
          console.error("[city-ads] handover notice failed", e);
        }
      }
      return { action: handed ? "handed" : "noop", providerName: primary.providerName ?? undefined };
    }
  }

  // NO REQUEST GOES TO A PROVIDER UNANSWERED. One rule, both front doors.
  //
  // The Meta form collects a name, a phone and a ZIP, so an unanswered native
  // lead is a blank lead. The /care/{city} form collects more than that, but in
  // a CONCIERGE city there is no provider on the hook to receive it: the page
  // promises a call from Olera, the campaign was sold to providers as requests
  // we have spoken to, and two Dallas providers have been told in writing that
  // we would rather hold a request back than send another name with nothing
  // attached. Either way the request waits for the qualifying answer.
  //
  // What differs is who is already on it. A native lead has nobody, so an hour
  // of silence pages a person (escalateUnqualified). A website lead already
  // paged one at submission through slackCityLead's "CALL THEM", so a second
  // alert would only be noise: it holds quietly and sits in Needs you.
  //
  // An explicit admin action (providerId, or force) still routes it, and that
  // is the only way an unqualified request reaches a provider — someone chose
  // to send it, knowing what is in it.
  const unanswered = !lead.qualification_reply_at && !opts.providerId && !opts.force;
  if (unanswered && lead.capture_method === "meta_instant_form") {
    return escalateUnqualified(db, lead);
  }
  if (unanswered && cfg?.routingMode === "concierge") {
    // Clear a morning that will never come. Parking stamped next_offer_at
    // before this rule existed, and the admin queue reads it as "waiting for
    // 8am", which would be a promise the relay no longer intends to keep.
    if (lead.next_offer_at) {
      await db.from("city_leads").update({ next_offer_at: null, updated_at: new Date().toISOString() }).eq("id", lead.id);
    }
    // "held", not "noop". The relay reaches this every five minutes and must
    // stay silent, but a decline or an expiry reaches it too, and those are
    // the moments a chain an admin started by hand comes back with nowhere to
    // go. Naming the outcome lets those two callers say so once, without the
    // relay saying it twelve times an hour.
    return { action: "held" };
  }
  // ANSWERED IS NOT THE SAME AS QUALIFIED, and until 21 September the relay
  // could not tell the difference. `qualification_reply_at` is a timestamp set
  // by ANY inbound text, so "she replied" unlocked this cascade and nothing
  // read the words. Drema Mitchell Lowe answered "I want to be a caretaker" on
  // the 19th and three Dallas agencies were each told a family needed care.
  //
  // A verdict that is missing holds, exactly like a verdict that is unsure.
  // That is deliberate: the classify pass runs in the same five-minute sweep
  // immediately before this, so a null here means it has not run yet or it
  // failed, and neither is a reason to send someone to a business. An admin
  // who routes by hand (providerId, or force) still overrides everything,
  // which remains the only way an unjudged request reaches a provider.
  if (!opts.providerId && !opts.force && lead.qualification_reply_at && lead.qualification_verdict !== "care_seeker") {
    return { action: "held" };
  }

  if (lead.status === "unfilled" && !opts.force && !opts.providerId) return { action: "noop" };

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
  const { data: prior } = await db.from("city_lead_offers").select("id, provider_id, position").eq("lead_id", lead.id);
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
    const { data: pool, error: poolErr } = await db
      .from("city_pool")
      .select("id, provider_id, position, care_types, enabled, phone_override")
      .eq("slug", lead.slug)
      .eq("enabled", true)
      .eq("is_test", false)
      .order("position", { ascending: true });
    // A failed read is not the same as an empty pool. Marking the lead unfilled
    // here would text the family that we are still looking when we never
    // actually looked, and would burn the lead's place in the queue.
    if (poolErr) {
      console.error("[city-ads] pool read failed", poolErr);
      await sendSlackAlert(
        `⚠️ City lead ${lead.id.slice(0, 8)} (${city}): could not read the provider pool (${poolErr.message}). Nothing sent, nothing marked. Retry from /admin/city-ads.`,
      );
      return { action: "noop" };
    }
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

  // Four of the provider's business hours (config.ts).
  const offeredAt = new Date();
  const expiresAt = addBusinessMinutes(tz, offeredAt, OFFER_WINDOW_BUSINESS_MINUTES).toISOString();
  const until = formatUntil(tz, new Date(expiresAt), offeredAt);
  // A SECOND OFFER TO THE SAME PROVIDER REOPENS THE FIRST. city_lead_offers is
  // unique on (lead_id, provider_id), so an insert here failed and the admin
  // saw "Nothing was sent". That is exactly the case a hand-picked provider
  // hits: Marla Branham's first offer went to Assisting Hands on 21 Sep and
  // expired unanswered; on 27 Sep she said yes to them by name, and "Offer
  // to…" could not reach them. Only an explicit providerId gets here with a
  // provider already seen; the relay filters them out above.
  const earlier = (prior ?? []).find((o) => o.provider_id === candidate.provider_id);
  const position = earlier ? (earlier.position as number) : nextPosition;
  const offerCount = earlier ? (prior?.length ?? 0) : nextPosition;
  const { data: inserted, error: offerErr } = earlier
    ? await db
        .from("city_lead_offers")
        .update({
          provider_phone: last10(phone),
          offered_at: new Date().toISOString(),
          expires_at: expiresAt,
          declined_at: null,
          decline_reason: null,
          expired_at: null,
          reached_channels: [],
          delivery_note: null,
          // A provider released after taking the family (the follow-up
          // ladder's "no_contact", or Move on the case page) can be offered
          // them again. Without this the guard below matched no row, and the
          // re-offer did nothing while reporting nothing.
          accepted_at: null,
          outcome: null,
        })
        .eq("id", earlier.id as string)
        .or("accepted_at.is.null,outcome.in.(no_contact,moved)")
        .select("id")
        .single()
    : await db
        .from("city_lead_offers")
        .insert({
          lead_id: lead.id,
          provider_id: candidate.provider_id,
          position,
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
  // The email opens the family in her inbox, signed in; the text keeps the
  // one-offer page (provider-links.server.ts).
  const emailUrl = (await providerSignInUrl(db, candidate.provider_id, lead.id)) ?? offerUrl;
  await db
    .from("city_leads")
    .update({ status: "offered", offer_count: offerCount, next_offer_at: null, updated_at: new Date().toISOString() })
    .eq("id", lead.id);

  if (await cityLeadBlocked(db, lead.id)) return { action: "noop" };
  const l = labels(lead);
  // The family's own words ride along with the offer, in all three places a
  // provider might read it. Everything above this line is generated from four
  // form fields; this is the only part she wrote. Best effort by construction:
  // getLeadExchange swallows its own read errors and returns what it has, so a
  // message-store problem degrades the offer rather than blocking it.
  const exchange = await getLeadExchange(db, lead);
  const askedQuestion = exchange.find((t) => t.who === "olera")?.text ?? null;
  const familySaid = exchange.filter((t) => t.who === "family").map((t) => t.text);
  // Email first: many provider numbers are office lines. The text goes only
  // where a text can land (requireMobile), and carries the same link.
  const channels: string[] = [];
  if (email) {
    const r = await sendEmail({
      to: email,
      subject: `A family in ${city} is looking for ${l.careLabel}`,
      html: cityOfferEmail({ providerName: name, city, ...l, until, offerUrl: emailUrl, askedQuestion, familySaid }),
      replyTo: "support@olera.care",
      emailType: "city_lead_offer",
      recipientType: "provider",
      providerId: candidate.provider_id,
      metadata: { lead_id: lead.id, offer_id: inserted.id, slug: lead.slug, position: position },
    });
    if (r.success && !r.skipped) channels.push("email");
  }
  if (phone) {
    const r = await sendSMS({
      to: phone,
      body: `${cityOfferSms({ city, ...l, until, excerpt: familySaid[0] ?? null })} Details: ${offerUrl}`,
      emailType: "city_lead_offer",
      recipientType: "provider",
      recipientLogProfileId: candidate.provider_id,
      requireMobile: !candidate.phone_override, // a number typed as the override was given for texts
      metadata: { lead_id: lead.id, offer_id: inserted.id, slug: lead.slug, position: position },
    });
    // "sms", not "text". This array is persisted to reached_channels, and the
    // backfill derived its values from email_log.channel, which is 'sms'. Two
    // spellings in one column would read fine in a sentence and quietly break
    // the first query that filtered on either. Display maps it back to "text".
    if (r.success && !r.skipped) channels.push("sms");
  }
  // OFFERED IS NOT REACHED, and for two days they were the same row.
  //
  // Every Dallas provider number is a landline, so every offer text was skipped.
  // Two of the three have info@ addresses cached invalid, and a suppressed email
  // returns success-with-skipped and writes NOTHING anywhere, so half the
  // failure was not even recoverable afterwards. The result looked like three
  // providers passing on a request. Two had never been told one existed.
  //
  // This line is what makes the difference legible to the case tracker rather
  // than to whoever happened to be reading Slack that minute.
  const spoken = (cs: string[]) => cs.map((c) => (c === "sms" ? "text" : c)).join(" and ");
  const note = channels.length
    ? null
    : [
        email ? "email address did not accept the send" : "no email address on file",
        phone ? "number cannot receive texts" : "no phone number on file",
      ].join("; ");
  // A clock against an agency that was never told only makes the family wait.
  // An offer that reached nobody gets an hour, for the team to call them, then
  // moves on (decided 27 Sep: check the offer reached them before moving on).
  const unreachedUntil = channels.length
    ? null
    : addBusinessMinutes(tz, offeredAt, OFFER_UNREACHED_BUSINESS_MINUTES).toISOString();
  await db
    .from("city_lead_offers")
    .update({ reached_channels: channels, delivery_note: note, ...(unreachedUntil ? { expires_at: unreachedUntil } : {}) })
    .eq("id", inserted.id as string);

  await sendSlackAlert(
    channels.length
      ? `City lead ${lead.id.slice(0, 8)} (${city}): offer #${position} to ${name} by ${spoken(channels)}. ${l.careLabel} for ${l.recipientLabel}, ${l.urgencyLabel ?? "urgency not stated"}. Theirs until ${until}. /admin/city-ads`
      : `🚨 City lead ${lead.id.slice(0, 8)} (${city}): offer #${position} to ${name} REACHED NOBODY (${note}). Call them${phone ? ` at ${formatUSPhone(phone)}` : ""} to take it; otherwise it moves on at ${formatUntil(tz, new Date(unreachedUntil as string), offeredAt)}. /admin/city-ads`,
  );
  return { action: "offered", providerName: name };
}

async function markUnfilled(db: SupabaseClient, lead: CityLeadRow, city: string) {
  const alreadyUnfilled = lead.status === "unfilled";
  await db.from("city_leads").update({ status: "unfilled", next_offer_at: null, updated_at: new Date().toISOString() }).eq("id", lead.id);
  if (alreadyUnfilled) return { action: "unfilled" as const };
  const askedNobody = lead.offer_count === 0;
  await sendSlackAlert(
    askedNobody
      ? `⚠️ City lead ${lead.id.slice(0, 8)} (${city}): nobody is switched on in this pool, so the request was offered to no one. ${lead.first_name}, ${formatUSPhone(lead.phone)}, needs ${CARE_LABEL[lead.care_type]}. They have NOT been texted about this. Call them, or enable a provider at /admin/city-ads.`
      : `⚠️ City lead ${lead.id.slice(0, 8)} (${city}) is UNFILLED: no enabled provider left for ${CARE_LABEL[lead.care_type]}. ${lead.first_name}, ${formatUSPhone(lead.phone)}. Route by hand at /admin/city-ads.`,
  );
  // The "still looking" text is for a family whose request three providers
  // saw and passed on. When the pool is empty nobody saw it, and she has
  // already been told twice in the last ten minutes that someone from Olera
  // will call her: at submission, and again when she answered the qualifying
  // question. A third automated text restating it is noise, and it is the one
  // that would arrive right after she took the trouble to answer us.
  if (!askedNobody) {
    await sendSMS({
      to: lead.phone,
      body: cityFamilyStillWorkingSms({ firstName: lead.first_name, city }),
      emailType: "city_lead_family_still_working",
      recipientType: "family",
      metadata: { lead_id: lead.id },
    });
  }
  return { action: "unfilled" as const };
}

/**
 * A hand-routed request that came back with nowhere to go.
 *
 * An unanswered request in a concierge city is held rather than offered
 * onwards, which is right for the relay and wrong in silence for the two
 * moments a chain actually ends: the provider declined, or their thirty
 * minutes ran out. Before the hold existed both fell through to markUnfilled,
 * which alerted. Now they reach a "held" and would stop there.
 *
 * Called only from those two event paths, never from the relay's scan, so it
 * fires once per event without a stamp to guard it: an offer expires once and
 * is declined once.
 */
async function alertChainStopped(db: SupabaseClient, leadId: string, what: string) {
  const lead = await getLead(db, leadId);
  if (!lead) return;
  const city = getCityConfig(lead.slug)?.city ?? lead.slug;
  await sendSlackAlert(
    `📞 City lead ${leadId.slice(0, 8)} (${city}): the provider ${what}, and the request is held because we still do not know what ${lead.first_name} needs. Nothing else has gone out and nothing else will. Call them: ${formatUSPhone(lead.phone)}, then type what they say into the lead at /admin/city-ads.`,
  );
}

/**
 * A native lead that never answered the qualifying text, an hour on. Hand it to
 * a person and stop. Nothing is sent to the family here — they have already had
 * one text and a second one repeating the question is nagging, not service; the
 * next contact they get should be a human who can actually help.
 *
 * Idempotent by the conditional update, which matters more than it looks: the
 * relay runs every five minutes, so the difference between stamping first and
 * alerting first is the difference between one Slack message and twelve an hour.
 */
async function escalateUnqualified(
  db: SupabaseClient,
  lead: CityLeadRow,
): Promise<{ action: "escalated" | "noop" }> {
  if (Date.now() - new Date(lead.created_at).getTime() < NATIVE_QUALIFY_MS) return { action: "noop" };
  if (lead.qualification_escalated_at) return { action: "noop" };
  const now = new Date().toISOString();
  const { data: stamped, error } = await db
    .from("city_leads")
    .update({ qualification_escalated_at: now, updated_at: now })
    .eq("id", lead.id)
    .is("qualification_escalated_at", null)
    .select("id");
  if (error) {
    console.error("[city-ads] qualification escalation failed", error);
    return { action: "noop" };
  }
  if (!stamped?.length) return { action: "noop" };
  const city = getCityConfig(lead.slug)?.city ?? lead.slug;
  // offer_count is not always zero: an admin can hand-route a blank lead, and
  // if that provider passes, the chain stops here rather than advancing. Say
  // which of the two happened instead of asserting the common one.
  const held =
    lead.offer_count > 0
      ? "The chain has stopped rather than pass a blank lead on"
      : "Nothing has gone to a provider and nothing will";
  await sendSlackAlert(
    `📞 City lead ${lead.id.slice(0, 8)} (${city}): no answer to the qualifying text in the hour since ${lead.first_name} filled in the form. Call them: ${formatUSPhone(lead.phone)}. ${held} until someone records what they need — type it into the lead at /admin/city-ads.`,
  );
  return { action: "escalated" };
}

/**
 * A provider's YES. Claims the lead with a conditional update; the loser of a
 * race gets a polite "already taken".
 */
export async function acceptOffer(
  db: SupabaseClient,
  offer: CityOfferRow,
  source: "provider_sms" | "provider_page" | "provider_inbox" | "admin" = "provider_sms",
): Promise<{ won: boolean; reply: string }> {
  if (await cityLeadBlocked(db, offer.lead_id)) return { won: false, reply: cityOfferGoneSms() };
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
      html: cityOfferAcceptedEmail({
        providerName,
        city,
        careLabel: l.careLabel,
        callBy,
        // Her conversation with the family, signed in, not the one-offer page.
        offerUrl: (await providerSignInUrl(db, offer.provider_id, lead.id)) ?? offerUrl,
      }),
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
    `✅ City lead ${lead.id.slice(0, 8)} (${city}) ACCEPTED by ${providerName}${source === "admin" ? " (admin)" : source === "provider_inbox" ? " (inbox)" : source === "provider_page" ? " (link)" : " (text)"}. ${lead.first_name} told to expect a call ${callBy}. /admin/city-ads`,
  );

  // The receipt. Only for an ad the provider is actually paying for: one whose
  // city_campaigns row names her campaign (see primary.server.ts). An
  // Olera-funded city arm has no primary provider and writes nothing, because
  // crediting a pool lead to her own campaign would tell her that her ad
  // produced a family that ours did.
  //
  // Awaited, not fire-and-forget: this runs inside a serverless request and a
  // dangling promise is the one that does not survive the response.
  //
  // Keyed in slug space to stay aggregatable with `page_view`, and carrying no
  // `connection_id` because a native lead has no connection row — which also
  // keeps it out of the growth_attribution upsert, where a fabricated
  // conversion id would be worse than a missing one.
  // Both halves required: the tag names a campaign, the id names whose it is.
  // A pool can hold several providers and only one of them is paying for this
  // ad, so an unguarded write would put a lead on the wrong dashboard.
  const primary = await resolvePrimaryCampaign(db, lead);
  if (primary?.campaignTag && primary.providerId === offer.provider_id) {
    await recordProviderEvent({
      provider_id: provider?.slug ?? offer.provider_id,
      event_type: "lead_received",
      profile_id: offer.provider_id,
      metadata: {
        utm_source: "olera_managed",
        utm_campaign: primary.campaignTag,
        city_lead_id: lead.id,
        city_offer_id: offer.id,
        capture_method: lead.capture_method ?? null,
        raw_provider_id: offer.provider_id,
        source: "city_lead_offer",
      },
    });
  }
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
  if (next.action === "held") await alertChainStopped(db, offer.lead_id, "passed on it");
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
/**
 * Judge every answered lead that has not been judged, before anything routes.
 *
 * Runs at the top of the sweep so a verdict exists by the time startOrAdvance
 * looks for one. Bounded per tick: these are model calls, and the set is
 * normally empty because a lead is judged once and the verdict persists.
 *
 * WHAT HAPPENS TO A BLOCK DEPENDS ON WHETHER WE COULD HAVE HELPED THEM.
 * Someone asking for a caregiving job, or selling us something, gets filed:
 * there is nothing to do for them and leaving it open only makes a person
 * click. Someone asking how to PAY for care, or asking a care question, is not
 * junk — Olera runs a benefits finder and an answering engine — so they wait
 * for a person who can send the right thing. Filing those two groups the same
 * way is how a family who asked the wrong question gets binned.
 */
async function runQualificationPass(db: SupabaseClient): Promise<{ judged: number; filed: number; holding: number }> {
  const out = { judged: 0, filed: 0, holding: 0 };
  const { data: waiting, error } = await db
    .from("city_leads")
    .select(LEAD_COLS)
    .eq("is_test", false)
    .is("archived_at", null)
    .is("accepted_offer_id", null)
    .is("qualification_verdict", null)
    .not("qualification_reply_at", "is", null)
    .in("status", ["new", "offered", "unfilled"])
    .order("qualification_reply_at", { ascending: true })
    .limit(10);
  if (error) {
    console.error("[city-ads] qualification pass read failed", error);
    return out;
  }

  for (const row of (waiting ?? []) as CityLeadRow[]) {
    const lead = row as unknown as ClassifyLead;
    const result = await classifyQualification(db, lead);
    const now = new Date().toISOString();
    const blocking = (BLOCKING_CATEGORIES as readonly string[]).includes(result.category);
    const file = result.verdict === "not_care_seeker" && blocking;

    // Conditional on the verdict still being null so two overlapping sweeps
    // cannot judge the same lead twice and double-post to Slack.
    const { data: stamped, error: writeError } = await db
      .from("city_leads")
      .update({
        qualification_verdict: result.verdict,
        qualification_verdict_category: result.category,
        qualification_verdict_reason: result.reason,
        qualification_verdict_at: now,
        ...(file ? { archived_at: now, archive_reason: result.category, archived_by: "classifier" } : {}),
        updated_at: now,
      })
      .eq("id", row.id)
      .is("qualification_verdict", null)
      .select("id");
    if (writeError) {
      console.error("[city-ads] qualification verdict write failed", writeError);
      continue;
    }
    if (!stamped?.length) continue;
    out.judged++;

    const city = getCityConfig(row.slug)?.city ?? row.slug;
    const who = String(row.first_name ?? "").trim().split(/\s+/)[0] || "there";
    const said = (row.qualification_reply ?? "").slice(0, 200);
    // A lead already handed to its ad's provider has been on her campaign
    // page since before this reply, so the usual "nothing went to a provider"
    // would be false. Filing it takes it off her page.
    const handed = !!row.handed_at;
    if (file) {
      out.filed++;
      await sendSlackAlert(
        handed
          ? `🗂️ City lead ${row.id.slice(0, 8)} (${city}): ${who} filed as ${result.category.replace(/_/g, " ")} and taken off the provider's campaign page, where it had been since the hand-over. They said: "${said}" ${result.reason} Wrong? Put them back at /admin/city-ads.`
          : `🗂️ City lead ${row.id.slice(0, 8)} (${city}): ${who} filed as ${result.category.replace(/_/g, " ")} and will NOT go to a provider. They said: "${said}" ${result.reason} Wrong? Put them back at /admin/city-ads.`,
      );
    } else if (result.verdict !== "care_seeker") {
      out.holding++;
      await sendSlackAlert(
        handed
          ? `🕵️ City lead ${row.id.slice(0, 8)} (${city}): ${who} replied and reads as ${result.category.replace(/_/g, " ")}. They are still on the provider's campaign page. They said: "${said}" ${result.reason} Archive at /admin/city-ads if it should come off.`
          : `🕵️ City lead ${row.id.slice(0, 8)} (${city}): ${who} is held as ${result.category.replace(/_/g, " ")}, nothing has gone to a provider. They said: "${said}" ${result.reason} Read it and decide at /admin/city-ads.`,
      );
    }
  }
  return out;
}

export async function runOfferMaintenance(db: SupabaseClient): Promise<{
  started: number;
  expired: number;
  advanced: number;
  unfilled: number;
  parked: number;
  escalated: number;
  held: number;
  judged: number;
  filed: number;
  holding: number;
  nudged: number;
}> {
  const now = new Date().toISOString();
  const out = { started: 0, expired: 0, advanced: 0, unfilled: 0, parked: 0, escalated: 0, held: 0, judged: 0, filed: 0, holding: 0, nudged: 0 };

  // Judge first. Everything below reads the verdict, and a lead with none
  // holds, so classifying after routing would hold every lead for a full tick.
  Object.assign(out, await runQualificationPass(db));

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
    else if (r.action === "escalated") out.escalated++;
    // The offer we just expired was the end of the line for a request we
    // cannot pass on. Same reason as the decline path: once per expiry.
    else if (r.action === "held") { out.held++; await alertChainStopped(db, o.lead_id, "ran out of time"); }
  }

  // 1b. The one-hour reminder (decided 27 Sep). Email only: it is the channel
  // that reaches these agencies, and an offer whose email never landed has
  // already been cut short and flagged in Slack (startOrAdvance).
  out.nudged = await sendOfferReminders(db);

  // 2. Parked leads whose morning has come, plus stragglers never started.
  //
  // "offered" belongs here as much as "new". Parking sets next_offer_at but
  // deliberately does not rewind status, so a chain that ran out of staffed
  // hours mid-way is left sitting at "offered" — and a query for "new" alone
  // never picks it up again. That strands the family silently. It matters more
  // since the staffed window narrowed to four hours: three 30-minute offers
  // need ninety minutes, so any chain starting after 10:30am can cross the
  // boundary. startOrAdvance still refuses a lead with a live offer, so
  // including "offered" cannot double-send.
  // Native leads are no longer excluded here. They used to be, because they
  // never entered the chain at all; now they either answer the qualifying text
  // and are routed on the next tick, or go to a person after an hour, and
  // startOrAdvance is the single place that decides which. Including them costs
  // a no-op call every five minutes until one of those two things happens.
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: waiting } = await db
    .from("city_leads")
    .select("id, next_offer_at, created_at")
    .eq("is_test", false)
    .in("status", ["new", "offered"])
    .is("accepted_offer_id", null)
    // Handed leads belong to a provider's campaign page and are closed to the
    // relay. Excluding them keeps them from crowding this 50-row window.
    .is("handed_at", null)
    .or(`next_offer_at.lte.${now},and(next_offer_at.is.null,created_at.lte.${twoMinAgo})`)
    .limit(50);
  for (const w of waiting ?? []) {
    const r = await startOrAdvance(db, w.id as string);
    if (r.action === "offered") out.started++;
    else if (r.action === "unfilled") out.unfilled++;
    else if (r.action === "parked") out.parked++;
    else if (r.action === "escalated") out.escalated++;
  }
  return out;
}

/**
 * An hour into an open offer, one email: a family is still waiting, and when
 * it stops being hers. Sent inside her business hours, once per offer (a
 * reopened offer gets its own, keyed on when it was offered).
 */
async function sendOfferReminders(db: SupabaseClient): Promise<number> {
  const now = new Date();
  const { data: open } = await db
    .from("city_lead_offers")
    .select("id, lead_id, provider_id, offered_at, expires_at, reached_channels")
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("expired_at", null)
    .gt("expires_at", now.toISOString())
    .contains("reached_channels", ["email"])
    .limit(50);
  let sent = 0;
  for (const o of (open ?? []) as Array<{ id: string; lead_id: string; provider_id: string; offered_at: string; expires_at: string }>) {
    try {
      const { data: lead } = await db
        .from("city_leads")
        .select("id, slug, care_type, is_test, archived_at")
        .eq("id", o.lead_id)
        .maybeSingle();
      if (!lead || lead.is_test || lead.archived_at) continue;
      const cfg = getCityConfig(lead.slug as string);
      const tz = cfg?.timeZone ?? "America/New_York";
      if (!isProviderHours(tz, now)) continue;
      if (businessMinutesBetween(tz, new Date(o.offered_at), now) < OFFER_NUDGE_AFTER_BUSINESS_MINUTES) continue;
      const { count } = await db
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("email_type", "city_lead_offer_reminder")
        .eq("metadata->>offer_id", o.id)
        .gte("created_at", o.offered_at);
      if ((count ?? 0) > 0) continue;
      const { data: p } = await db.from("business_profiles").select("display_name, email").eq("id", o.provider_id).maybeSingle();
      const email = (p?.email as string | null) ?? null;
      if (!email) continue;
      const city = cfg?.city ?? (lead.slug as string);
      const care = CARE_LABEL[lead.care_type as CityCareType] ?? "care";
      const until = formatUntil(tz, new Date(o.expires_at), now);
      const url = (await providerSignInUrl(db, o.provider_id, o.lead_id)) ?? generateCityOfferUrl(o.id, getSiteUrl());
      const r = await sendEmail({
        to: email,
        subject: `A family in ${city} is still waiting`,
        html: cityThreadProviderEmail({
          eyebrow: `Olera · ${city}`,
          headline: "A family is still waiting on you",
          body: `We sent you a family's request for ${care} an hour ago. It's yours until ${until}. After that we ask the next agency, so they aren't left waiting.`,
          ctaUrl: url,
          ctaLabel: "Take this family",
        }),
        replyTo: "support@olera.care",
        emailType: "city_lead_offer_reminder",
        recipientType: "provider",
        providerId: o.provider_id,
        metadata: { lead_id: o.lead_id, offer_id: o.id },
      });
      if (r.success && !r.skipped) sent++;
    } catch (e) {
      console.error("[city-ads] offer reminder failed", o.id, e);
    }
  }
  return sent;
}
