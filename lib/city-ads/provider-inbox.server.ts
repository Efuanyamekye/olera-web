/**
 * Families from ads, in a provider's inbox — server only.
 *
 * One inbox for a provider: page inquiries (connections) and families from
 * city ads side by side. The ad families stay in their own tables on purpose.
 * Ten crons act on inquiry connections, and a family from an ad must not start
 * getting their reminders (see primary.server.ts).
 *
 * A provider sees a family from an ad in one of three ways:
 *
 *   own_ad    the family came from her own ad and was handed to her campaign.
 *             She sees the shared thread, as on her campaign page.
 *   offered   Olera offered her the family and she has not answered yet. She
 *             sees what the family needs in their own words, never a name or a
 *             number, and can take it or pass.
 *   taken     she took the offer. She sees her own conversation only: what she
 *             wrote, what the family wrote after she took them, and nothing
 *             from Olera's texts or any other agency the family was offered to.
 *
 * An offer she passed on or let lapse is not listed, and neither is a family
 * from her own ad that another agency has since taken: the shared thread would
 * show her their conversation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFamilyTimeline, getThreadLead, firstWordOf, type ThreadEntry, type ThreadLead } from "@/lib/city-ads/thread.server";
import { getLeadExchange } from "@/lib/city-ads/exchange.server";
import { CARE_LABEL, PAYMENT_LABEL, RECIPIENT_LABEL, URGENCY_LABEL, formatUSPhone, getCityConfig } from "@/lib/city-ads/config";

export type AdFamilyAccess = "own_ad" | "offered" | "taken";

export interface AdFamilyItem {
  leadId: string;
  access: AdFamilyAccess;
  offerId: string | null;
  /** The profile of hers that holds this family. */
  providerId: string;
  /** "Marla" once she can see who it is, "A family in Dallas" before. */
  name: string;
  city: string;
  /** "Help at home for a parent". */
  need: string;
  arrivedAt: string;
  lastText: string;
  lastAt: string;
  /** When an offer lapses, for "offered" only. */
  expiresAt: string | null;
  outcome: "talking" | "client" | "no" | null;
  closed: boolean;
}

export interface AdFamilyDetail extends AdFamilyItem {
  phone: string | null;
  email: string | null;
  /** The facts from the form, in words. */
  facts: string[];
  /** The family's own words, contact details removed. */
  words: string[];
  entries: ThreadEntry[];
  canMessage: boolean;
  timeZone: string;
}

type OfferRow = {
  id: string;
  lead_id: string;
  provider_id: string;
  offered_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
};

type LeadRow = ThreadLead & {
  care_type: string | null;
  care_recipient: string | null;
  urgency: string | null;
  payment_type: string | null;
  zip: string | null;
  note: string | null;
  is_test: boolean | null;
};

const LEAD_COLS =
  "id, slug, first_name, phone, email, created_at, handed_at, handed_request_id, care_seeker_id, archived_at, meta_campaign_id, qualification_reply, qualification_reply_at, family_check_sent_at, family_check_reply, family_check_reply_at, provider_nudged_at, outcome_ping_1_at, outcome_ping_2_at, outcome, outcome_at, outcome_source, care_type, care_recipient, urgency, payment_type, zip, note, is_test";

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function needOf(lead: LeadRow): string {
  const who = RECIPIENT_LABEL[(lead.care_recipient ?? "other") as keyof typeof RECIPIENT_LABEL] ?? "a family member";
  // "Care, type not decided yet" reads badly with "for …" after it.
  if (lead.care_type === "unsure" || !lead.care_type) return `Care for ${who}, type not decided yet`;
  const care = CARE_LABEL[lead.care_type as keyof typeof CARE_LABEL] ?? "care";
  return cap(`${care} for ${who}`);
}

function cityOf(lead: LeadRow): string {
  return getCityConfig(lead.slug)?.city ?? lead.slug;
}

function asOutcome(v: string | null): AdFamilyItem["outcome"] {
  return v === "talking" || v === "client" || v === "no" ? v : null;
}

function isOpen(o: OfferRow, now: number): boolean {
  return !o.accepted_at && !o.declined_at && !o.expired_at && new Date(o.expires_at).getTime() > now;
}

/** Which of these profiles can see this lead, and how. Null when none can. */
async function accessFor(
  db: SupabaseClient,
  lead: LeadRow,
  profileIds: string[],
): Promise<{ access: AdFamilyAccess; providerId: string; offer: OfferRow | null } | null> {
  const { data: allOffers } = await db
    .from("city_lead_offers")
    .select("id, lead_id, provider_id, offered_at, expires_at, accepted_at, declined_at, expired_at")
    .eq("lead_id", lead.id)
    .order("offered_at", { ascending: false });
  const offers = (allOffers ?? []) as OfferRow[];
  // Another agency took this family: the conversation is theirs now.
  const takenElsewhere = offers.some((o) => o.accepted_at && !profileIds.includes(o.provider_id));
  if (lead.handed_request_id && !takenElsewhere) {
    const { data: req } = await db
      .from("ad_campaign_requests")
      .select("provider_id")
      .eq("id", lead.handed_request_id)
      .maybeSingle();
    const owner = req?.provider_id ? String(req.provider_id) : null;
    if (owner && profileIds.includes(owner)) return { access: "own_ad", providerId: owner, offer: null };
  }
  const now = Date.now();
  for (const o of offers.filter((x) => profileIds.includes(x.provider_id))) {
    if (o.accepted_at) return { access: "taken", providerId: o.provider_id, offer: o };
    if (isOpen(o, now)) return { access: "offered", providerId: o.provider_id, offer: o };
  }
  return null;
}

/**
 * Her own conversation with a family she took as an offer. Olera's texts are
 * left out: they are Olera's with the family, and some name other agencies.
 */
async function takenEntries(db: SupabaseClient, lead: LeadRow, offer: OfferRow, profileIds: string[]): Promise<ThreadEntry[]> {
  const first = firstWordOf(lead.first_name);
  const out: ThreadEntry[] = [
    { at: offer.offered_at, author: "olera", kind: "event", text: `Olera sent you ${first}'s request.` },
    { at: offer.accepted_at as string, author: "provider", kind: "event", text: `You took it. ${first} was told to expect your call.` },
  ];
  const { data: typed } = await db
    .from("city_lead_thread")
    .select("author, author_profile_id, body, created_at")
    .eq("lead_id", lead.id)
    .gte("created_at", offer.accepted_at as string)
    .order("created_at", { ascending: true });
  for (const t of (typed ?? []) as Array<{ author: string; author_profile_id: string | null; body: string; created_at: string }>) {
    if (t.author === "provider" && !profileIds.includes(String(t.author_profile_id))) continue;
    if (t.author !== "provider" && t.author !== "family") continue;
    out.push({ at: t.created_at, author: t.author, kind: "message", channel: "page", text: t.body });
  }
  if (lead.outcome && lead.outcome_at && lead.outcome_at >= (offer.accepted_at as string)) {
    const word = lead.outcome === "client" ? "Became a client" : lead.outcome === "talking" ? "Talked" : "Not a fit";
    out.push({ at: lead.outcome_at, author: "provider", kind: "event", text: `Marked: ${word}.` });
  }
  out.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return out;
}

function lastOf(entries: ThreadEntry[], fallback: { text: string; at: string }): { text: string; at: string } {
  const msgs = entries.filter((e) => e.kind === "message");
  const last = msgs[msgs.length - 1] ?? entries[entries.length - 1];
  if (!last) return fallback;
  const who = last.kind === "event" ? "" : last.author === "provider" ? "You: " : last.author === "olera" ? "Olera: " : "";
  return { text: `${who}${last.text}`.replace(/\s+/g, " ").trim(), at: last.at };
}

async function buildItem(
  db: SupabaseClient,
  lead: LeadRow,
  a: { access: AdFamilyAccess; providerId: string; offer: OfferRow | null },
  providerName: string,
  profileIds: string[],
): Promise<{ item: AdFamilyItem; entries: ThreadEntry[] }> {
  const city = cityOf(lead);
  const entries =
    a.access === "own_ad"
      ? await getFamilyTimeline(db, lead, { audience: "provider", providerName })
      : a.access === "taken" && a.offer
        ? await takenEntries(db, lead, a.offer, profileIds)
        : [];
  const arrivedAt = a.offer?.offered_at ?? lead.handed_at ?? lead.created_at;
  const last =
    a.access === "offered"
      ? { text: "New request from Olera. Take it or pass.", at: arrivedAt }
      : lastOf(entries, { text: needOf(lead), at: arrivedAt });
  return {
    entries,
    item: {
      leadId: lead.id,
      access: a.access,
      offerId: a.offer?.id ?? null,
      providerId: a.providerId,
      name: a.access === "offered" ? `A family in ${city}` : firstWordOf(lead.first_name),
      city,
      need: needOf(lead),
      arrivedAt,
      lastText: last.text,
      lastAt: last.at,
      expiresAt: a.access === "offered" ? a.offer?.expires_at ?? null : null,
      outcome: asOutcome(lead.outcome),
      closed: !!lead.archived_at,
    },
  };
}

/** Every ad family these profiles can see, newest activity first. */
export async function listAdFamilies(
  db: SupabaseClient,
  profileIds: string[],
  providerName: string,
): Promise<AdFamilyItem[]> {
  if (profileIds.length === 0) return [];
  const [{ data: reqs }, { data: offers }] = await Promise.all([
    db.from("ad_campaign_requests").select("id").in("provider_id", profileIds),
    db.from("city_lead_offers").select("lead_id").in("provider_id", profileIds),
  ]);
  const reqIds = (reqs ?? []).map((r) => r.id as string);
  const leadIds = new Set((offers ?? []).map((o) => o.lead_id as string));
  const [{ data: handed }, { data: offered }] = await Promise.all([
    reqIds.length
      ? db.from("city_leads").select(LEAD_COLS).in("handed_request_id", reqIds)
      : Promise.resolve({ data: [] as LeadRow[] }),
    leadIds.size
      ? db.from("city_leads").select(LEAD_COLS).in("id", [...leadIds])
      : Promise.resolve({ data: [] as LeadRow[] }),
  ]);
  const byId = new Map<string, LeadRow>();
  for (const l of [...((handed ?? []) as LeadRow[]), ...((offered ?? []) as LeadRow[])]) {
    if (l.is_test) continue;
    byId.set(l.id, l);
  }
  const items: AdFamilyItem[] = [];
  for (const lead of byId.values()) {
    const a = await accessFor(db, lead, profileIds);
    if (!a) continue;
    // A closed family from her own ad leaves the list, as on her campaign page.
    if (a.access === "own_ad" && lead.archived_at) continue;
    items.push((await buildItem(db, lead, a, providerName, profileIds)).item);
  }
  items.sort((x, y) => +new Date(y.lastAt) - +new Date(x.lastAt));
  return items;
}

/** One family, with the conversation and the panel details. Null when she can't see it. */
export async function getAdFamily(
  db: SupabaseClient,
  leadId: string,
  profileIds: string[],
  providerName: string,
): Promise<AdFamilyDetail | null> {
  const { data } = await db.from("city_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  const lead = data as LeadRow | null;
  if (!lead || lead.is_test) return null;
  const a = await accessFor(db, lead, profileIds);
  if (!a) return null;
  const { item, entries } = await buildItem(db, lead, a, providerName, profileIds);
  const exchange = await getLeadExchange(db, lead);
  const facts = [
    item.need,
    lead.urgency ? cap(URGENCY_LABEL[lead.urgency as keyof typeof URGENCY_LABEL] ?? "") : "",
    lead.payment_type ? cap(PAYMENT_LABEL[lead.payment_type] ?? "") : "",
    lead.zip ? `${item.city}, ZIP ${lead.zip}` : item.city,
  ].filter(Boolean);
  // No name or number until she takes the family.
  const hidden = a.access === "offered";
  return {
    ...item,
    phone: hidden ? null : lead.phone ? formatUSPhone(lead.phone) : null,
    email: hidden ? null : lead.email,
    facts,
    words: exchange.filter((t) => t.who === "family").map((t) => t.text),
    entries,
    canMessage: a.access !== "offered" && !lead.archived_at,
    timeZone: getCityConfig(lead.slug)?.timeZone ?? "America/New_York",
  };
}

/** The lead and the profile she acts as, for a write. Null when not hers to act on. */
export async function adFamilyForWrite(
  db: SupabaseClient,
  leadId: string,
  profileIds: string[],
): Promise<{ lead: ThreadLead; providerId: string; access: AdFamilyAccess; offerId: string | null } | null> {
  const { data } = await db.from("city_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
  const lead = data as LeadRow | null;
  if (!lead || lead.is_test) return null;
  const a = await accessFor(db, lead, profileIds);
  if (!a) return null;
  const threadLead = await getThreadLead(db, lead.id);
  if (!threadLead) return null;
  return { lead: threadLead, providerId: a.providerId, access: a.access, offerId: a.offer?.id ?? null };
}
