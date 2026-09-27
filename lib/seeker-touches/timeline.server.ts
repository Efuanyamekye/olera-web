import { getServiceClient } from "@/lib/admin";
import { seekerEventLabel } from "@/lib/activity/seeker-categories";
import { getConnectionTemperature, providerResponded, type ConnectionLike } from "@/lib/connection-temperature";
import { getCityConfig } from "@/lib/city-ads/config";
import { matchOutcomeReply } from "@/lib/sms/inbound-intent";
import { isImpossibleUsPhone, last10, seekerLabel } from "./label";
import { EPISODE_WORD, ORIGIN_LABEL, detailLine, problemLine, stateOf } from "./present";
import type {
  FamilyTouchRow,
  SeekerOpenAction,
  ChannelReach,
  ConsentScope,
  Episode,
  LastSeekerTouch,
  Reachability,
  SeekerContact,
  SeekerFlag,
  SeekerRelationship,
  SeekerRelationshipRow,
  SeekerTimelineItem,
} from "./types";

/**
 * Read side of care-seeker relationships.
 *
 *   loadSeekerRelationships() — the list. One row per family with a live
 *                               episode, derived state, unanswered replies on top.
 *   loadSeekerTimeline(id)    — everything that happened with one family, in
 *                               order, across every channel.
 *
 * SEVEN SOURCES, SIX OF WHICH ALREADY EXIST AND ARE ALREADY KEYED TO THE FAMILY.
 * Nothing here is new capture:
 *
 *   connections            the inquiry, and which provider it went to
 *   city_leads             the concierge path, plus city_lead_messages
 *   email_log              system sends on both email and SMS, with delivery state
 *   sms_inbound            texts to the Olera number (profile_type='family')
 *   support_email_*        replies to support@ (matched_profile_type='family')
 *   seeker_activity        what they did on the site
 *   family_touches         what a person did by hand: calls, meetings, texts
 *                          from a personal phone, anything said out loud. The
 *                          only feed here that is new capture (migration 230).
 *
 * Nothing in this file writes. Nothing in this file stores state. Same invariant
 * as the provider side (lib/touches/timeline.server.ts): the list is a view over
 * events, so it can never disagree with them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a "the provider never got back to me" answer stays workable.
 *
 * Measured, not guessed: of 37 such answers, 5 came in the last week and 11 in
 * the last fortnight, and the average is 38 days old. A family who told us two
 * weeks ago that nobody called is still plausibly looking. Past that,
 * re-contacting is more likely to be unwelcome than useful, and a queue nobody
 * can finish stops being a queue.
 */
const NO_SHOW_ACTIONABLE_MS = 14 * DAY_MS;

/** The most recent outcome answer across a family's inquiries. */
function latestOutcome(
  inquiries: { metadata?: Record<string, unknown> | null }[],
): { value: "yes" | "not_yet" | "no"; at: string } | null {
  let best: { value: "yes" | "not_yet" | "no"; at: string } | null = null;
  for (const c of inquiries) {
    const o = (c.metadata ?? {}).outcome as { value?: string; at?: string } | undefined;
    if (!o?.value || !o.at) continue;
    if (o.value !== "yes" && o.value !== "not_yet" && o.value !== "no") continue;
    if (!best || o.at > best.at) best = { value: o.value, at: o.at };
  }
  return best;
}

/**
 * How far back an episode counts as live. 45 days is the point past which a
 * family who has said nothing is more likely to have resolved their situation
 * elsewhere than to be waiting on us. Overridable per request.
 */
export const DEFAULT_WINDOW_DAYS = 45;

/**
 * The list is joined in memory, and a PostgREST `in.(…)` of UUIDs travels in the
 * query string, so the candidate set is bounded. Families are ranked by their most
 * recent signal before the cap applies, so the tail that falls off is the quietest.
 */
const MAX_FAMILIES = 400;

/** A pending inquiry older than this with no provider reply reads as silence. */
const PROVIDER_SILENT_MS = 3 * DAY_MS;

/**
 * How many ids go into one PostgREST `in.(…)`.
 *
 * The filter travels in the query string, so a long id list becomes a long URL
 * and the request is rejected before it reaches Postgres — measured on this
 * project: 300 uuids succeed, 400 fail outright with a fetch error rather than
 * a partial result. At 417 candidate families in a 45 day window that is not a
 * degradation, it is the page failing to load at all.
 *
 * So every id-filtered read below is chunked. 100 keeps each URL near 4KB with
 * room to spare, and the chunks run in parallel, so this costs a little fan-out
 * and buys a list that does not have a size cliff in it.
 */
const IN_CHUNK = 100;

/**
 * Run an id-filtered query in chunks and concatenate the rows.
 *
 * Errors are thrown rather than swallowed: a page that silently renders half a
 * family's history is worse than one that fails and says so.
 */
async function fetchInChunks<T>(
  ids: string[],
  build: (slice: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  if (!ids.length) return [];
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) groups.push(ids.slice(i, i + IN_CHUNK));
  const results = await Promise.all(groups.map((g) => build(g)));
  const out: T[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    out.push(...((r.data ?? []) as T[]));
  }
  return out;
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  metadata: Record<string, unknown> | null;
};

type ConnRow = {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  type: string;
  status: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  to_profile?: { id: string; display_name: string | null } | null;
};

type EmailRow = {
  id: string;
  recipient: string | null;
  provider_id: string | null;
  channel: string | null;
  email_type: string;
  subject: string | null;
  status: string;
  /** Only populated for texts — see the note on EMAIL_COLS. */
  html_body?: string | null;
  created_at: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

type SmsRow = {
  id: number;
  from_phone: string;
  phone_last10: string;
  body: string;
  keyword: string | null;
  profile_id: string | null;
  created_at: string;
  handled_at: string | null;
};

type SupportThreadRow = {
  id: string;
  subject: string;
  state: string;
  category: string;
  matched_profile_id: string | null;
  last_message_at: string;
};

type SupportMsgRow = {
  id: string;
  thread_id: string;
  direction: "in" | "out";
  from_email: string | null;
  from_name: string | null;
  subject: string;
  snippet: string;
  internal_date: string;
};

type CityLeadRow = {
  id: string;
  slug: string;
  care_seeker_id: string | null;
  first_name: string;
  phone: string;
  email: string | null;
  note: string | null;
  care_type: string;
  urgency: string | null;
  payment_type: string | null;
  zip: string | null;
  status: string;
  reached_at: string | null;
  outcome: string | null;
  admin_note: string | null;
  created_at: string;
  archived_at: string | null;
};

type CityMsgRow = {
  id: string;
  lead_id: string;
  /** Delivery state lifted off the email_log twin before it is discarded. */
  delivery?: string;
  channel: string;
  body: string;
  subject: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
};

type ActivityRow = {
  id: string;
  profile_id: string | null;
  event_type: string;
  related_provider_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DncRow = { email: string | null; phone: string | null; reason: string | null };

// ── small helpers ─────────────────────────────────────────────────────────────

function clip(s: string | null | undefined, n: number): string | null {
  const t = (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function byNewest(a: { occurred_at: string }, b: { occurred_at: string }): number {
  return a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0;
}

/** Newest first for rows that date themselves with `created_at` rather than `occurred_at`. */
function byCreatedDesc(a: { created_at: string }, b: { created_at: string }): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}

function emailStatus(e: EmailRow): string {
  if (e.complained_at) return "complained";
  if (e.bounced_at) return "bounced";
  if (e.status === "failed") return e.error_message ? `failed · ${clip(e.error_message, 60)}` : "failed";
  if (e.first_opened_at) return "opened";
  if (e.delivered_at) return "delivered";
  return e.status;
}

function isSms(e: EmailRow): boolean {
  return e.channel === "sms";
}

function humanize(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function toContact(p: ProfileRow): SeekerContact {
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const { label, is_fallback } = seekerLabel(p, p.id);
  return {
    seeker_id: p.id,
    label,
    label_is_fallback: is_fallback,
    city: p.city,
    state: p.state,
    email: p.email,
    phone: p.phone,
    timeline: typeof meta.timeline === "string" ? meta.timeline : null,
    situation: clip(typeof meta.about_situation === "string" ? meta.about_situation : null, 160),
    payment: strArray(meta.payment_methods),
  };
}

// ── item builders ─────────────────────────────────────────────────────────────

function emailToItem(e: EmailRow): SeekerTimelineItem {
  const sms = isSms(e);
  const status = emailStatus(e);
  return {
    id: `email:${e.id}`,
    kind: "email",
    sent_by_person: e.email_type === "admin_reply",
    actor: "system",
    channel: sms ? "text" : "email",
    occurred_at: e.created_at,
    // A text has no subject worth showing; its body is the message.
    title: sms ? clip(e.html_body, 150) ?? humanize(e.email_type) : e.subject ?? humanize(e.email_type),
    full_text: sms ? (e.html_body ?? null) : null,
    detail: null,
    source: "system",
    status,
    contact_handle: e.recipient,
    href: null,
  };
}

/** How a benefits check-in answer reads on the timeline. */
const CHECKIN_WORD: Record<string, string> = {
  CALLED: "called the program",
  NOANSWER: "no answer from the program",
  NEEDDOCS: "needs documents",
  APPLIED: "application submitted",
  WAITING: "waiting on the agency",
  NOTELIGIBLE: "not eligible",
};

/**
 * A short, unambiguous answer to the benefits check-in text ("Reply CALLED,
 * NO ANSWER, or STUCK"), other than STUCK.
 *
 * lib/family-comms/benefits-sms-replies.server.ts already answers these
 * automatically and moves the family's plan, so nobody owes them a reply. But
 * the webhook never marks them handled, and every "APPLIED" landed in "Reply
 * to them" as work: por2gloria sat at the top of the queue for ten days for
 * telling us she had applied. STUCK is left alone because it is a request for
 * a person, and so is anything longer than a few words, which may be a real
 * message that happens to contain the word.
 */
function checkinAnswer(body: string | null, at: string, prompts: string[]): string | null {
  // Only as an answer to a check-in we actually sent in the two weeks before
  // it. A city family asked "Did Assisting Hands reach you?" can reply "Yes
  // they called", which parses as CALLED, and that is a reply a person has to
  // see.
  const t = new Date(at).getTime();
  const asked = prompts.some((p) => {
    const pt = new Date(p).getTime();
    return pt <= t && t - pt <= 14 * DAY_MS;
  });
  if (!asked) return null;
  const text = (body ?? "").trim();
  // A question ("applied?") is asking us something, not telling us.
  if (!text || text.includes("?") || text.split(/\s+/).length > 3) return null;
  const m = matchOutcomeReply(text);
  return m.keyword && !m.ambiguous && m.keyword !== "STUCK" ? m.keyword : null;
}

/** When we sent this family a benefits check-in text ("Reply CALLED, …"). */
const CHECKIN_PROMPT = /Reply (CALLED|APPLIED)\b/i;

function smsToItem(r: SmsRow, prompts: string[] = []): SeekerTimelineItem {
  const checkin = checkinAnswer(r.body, r.created_at, prompts);
  return {
    id: `sms:${r.id}`,
    kind: "sms",
    actor: "in",
    channel: "text",
    occurred_at: r.created_at,
    title: clip(r.body, 160) ?? "(empty text)",
    full_text: r.body ?? null,
    detail: checkin ? `answered the benefits check-in: ${CHECKIN_WORD[checkin]}` : r.keyword ? `keyword ${r.keyword}` : null,
    source: "twilio",
    status: r.handled_at || checkin ? null : "needs reply",
    contact_handle: r.from_phone,
    href: "/admin/inbox",
  };
}

function supportToItem(m: SupportMsgRow, thread: SupportThreadRow | undefined, latestInThread: boolean): SeekerTimelineItem {
  const inbound = m.direction === "in";
  return {
    id: `support:${m.id}`,
    kind: "support",
    actor: inbound ? "in" : "out",
    channel: "email",
    occurred_at: m.internal_date,
    title: m.subject || thread?.subject || "(no subject)",
    detail: clip(m.snippet, 220),
    source: "gmail",
    // Only the newest message in a thread can be the one waiting on an answer.
    status: inbound && latestInThread && thread?.state === "needs_reply" ? "needs reply" : null,
    contact_handle: m.from_email,
    href: `/admin/support-email?thread=${m.thread_id}`,
  };
}

function connToItem(c: ConnRow): SeekerTimelineItem {
  const name = c.to_profile?.display_name ?? "a provider";
  const responded = providerResponded(c as ConnectionLike);
  const outcome = (c.metadata ?? {}).outcome as { value?: string; at?: string } | undefined;
  const bits: string[] = [];
  if (responded) bits.push("provider replied");
  if (outcome?.value) bits.push(`family said "${outcome.value}"`);
  return {
    id: `conn:${c.id}`,
    kind: "inquiry",
    actor: "in",
    channel: "in_app",
    occurred_at: c.created_at,
    title: `${c.type === "inquiry" ? "Inquiry sent to" : `${humanize(c.type)} —`} ${name}`,
    detail: clip(c.message, 220),
    source: "system",
    status: bits.length ? bits.join(" · ") : `${c.status ?? "pending"}, no provider response`,
    contact_handle: null,
    href: `/admin/connections`,
  };
}

function cityLeadToItem(l: CityLeadRow): SeekerTimelineItem {
  const cfg = getCityConfig(l.slug);
  return {
    id: `city:${l.id}`,
    kind: "city",
    actor: "in",
    channel: "in_app",
    occurred_at: l.created_at,
    title: `Submitted the ${cfg?.city ?? l.slug} page`,
    detail: clip(l.note, 220),
    source: "city",
    status:
      [l.care_type, l.urgency, l.payment_type]
        .filter((x): x is string => !!x)
        .map(humanize)
        .join(" · ") || null,
    contact_handle: l.phone,
    href: `/admin/city-ads`,
  };
}

/**
 * A queued city message is ours by hand only when a person queued it.
 *
 * The admin composer stamps the sender's email in created_by. Everything else
 * that writes this table is automation — the Meta intake confirmation
 * ("meta_native_intake", 15 of the first 35 rows), backfills, scripts — and
 * read as "You:" it made every Meta family look contacted by a person a minute
 * after they submitted, and counted toward human_touch_count and never_human.
 */
function cityMsgIsHuman(m: CityMsgRow): boolean {
  return (m.created_by ?? "").includes("@");
}

function cityMsgToItem(m: CityMsgRow): SeekerTimelineItem {
  const failed = m.status === "failed";
  const human = cityMsgIsHuman(m);
  return {
    id: `citymsg:${m.id}`,
    kind: "city",
    actor: human ? "out" : "system",
    channel: m.channel === "sms" ? "text" : "email",
    occurred_at: m.created_at,
    title: clip(m.body, 160) ?? m.subject ?? (human ? "(sent by hand)" : "(sent automatically)"),
    full_text: m.body ?? null,
    detail: null,
    source: human ? "manual" : "system",
    status: failed ? `failed · ${clip(m.last_error, 60)}` : m.delivery ?? m.status,
    contact_handle: m.created_by,
    href: `/admin/city-ads`,
  };
}

function touchToItem(t: FamilyTouchRow): SeekerTimelineItem {
  // "reached" is the difference between calling someone and speaking to them,
  // and it is the whole reason this column exists.
  const outcome = t.reached === true ? "spoke to them" : t.reached === false ? "did not reach them" : null;
  return {
    id: `touch:${t.id}`,
    kind: "touch",
    actor: t.direction,
    channel: t.channel === "note" ? "in_app" : t.channel,
    occurred_at: t.occurred_at,
    title: t.summary,
    detail: t.detail,
    source: t.source,
    status: [outcome, t.next_action ? `next: ${t.next_action}` : null].filter(Boolean).join(" · ") || null,
    contact_handle: t.contact_handle,
    href: null,
  };
}

function openActionOf(touches: FamilyTouchRow[]): SeekerOpenAction | null {
  const open = touches
    .filter((t) => t.next_action && !t.next_action_done_at)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0];
  if (!open) return null;
  return {
    touch_id: open.id,
    text: open.next_action as string,
    due: open.next_action_due,
    owner: open.next_action_owner,
    declared_at: open.occurred_at,
  };
}

function activityToItem(a: ActivityRow): SeekerTimelineItem {
  const meta = a.metadata ?? {};
  const provider = typeof meta.provider_name === "string" ? meta.provider_name : null;
  return {
    id: `act:${a.id}`,
    kind: "activity",
    actor: "in",
    channel: "in_app",
    occurred_at: a.created_at,
    title: seekerEventLabel(a.event_type) + (provider ? ` — ${provider}` : ""),
    detail: null,
    source: "system",
    status: null,
    contact_handle: null,
    href: null,
  };
}

// ── derived state ─────────────────────────────────────────────────────────────

/**
 * Can we actually reach this family, and if not, why not.
 *
 * This is the column the provider list has no reason to carry. A provider's
 * details come from a business listing; a family's are typed one-handed into a
 * phone, and a typo there is the difference between a call to make and a person
 * we have lost.
 */
function reachabilityOf(
  contact: SeekerContact,
  bouncedAddrs: Set<string>,
  dncEmails: Set<string>,
  dncPhones: Set<string>,
): Reachability {
  const notes: string[] = [];

  let phone: ChannelReach = "ok";
  if (!contact.phone) {
    phone = "none";
  } else if (dncPhones.has(last10(contact.phone) ?? "")) {
    phone = "opted_out";
    notes.push("texted STOP");
  } else if (isImpossibleUsPhone(contact.phone)) {
    phone = "impossible";
    notes.push(`${contact.phone} is not a dialable number`);
  }

  let email: ChannelReach = "ok";
  const addr = (contact.email ?? "").toLowerCase();
  if (!addr) {
    email = "none";
  } else if (dncEmails.has(addr)) {
    email = "opted_out";
    notes.push("asked us to stop emailing");
  } else if (bouncedAddrs.has(addr)) {
    email = "bounced";
    notes.push(`${contact.email} bounced`);
  }

  const open: ("phone" | "email")[] = [];
  if (phone === "ok") open.push("phone");
  if (email === "ok") open.push("email");

  return { phone, email, open, note: notes.length ? notes.join("; ") : null };
}

/**
 * What we are allowed to do.
 *
 * A concierge city lead is the strict case: the consent checkbox on
 * /care/{city} names Olera and nobody else when routingMode is "concierge", so
 * their details reach a provider only through the relay. That fact lives
 * in a code comment today and nowhere a person can see it before picking up the
 * phone. Here it is a column.
 */
function consentOf(
  reach: Reachability,
  cityLead: CityLeadRow | undefined,
  inquiries: ConnRow[],
): ConsentScope {
  if (reach.phone === "opted_out" || reach.email === "opted_out") return "opted_out";
  if (cityLead) {
    const cfg = getCityConfig(cityLead.slug);
    if (cfg?.routingMode === "concierge") return "olera_only";
  }
  // Sending an inquiry to a provider IS the request to be contacted by them.
  if (inquiries.length > 0) return "provider_ok";
  return "unknown";
}

/**
 * Open, waiting on someone else, dormant, or closed.
 *
 * "Dormant" is deliberately not called "stalled" or "lost": a family who has
 * gone quiet may have solved their problem, and the list must not assert
 * otherwise. Only a recorded outcome closes an episode.
 */
function episodeOf(
  now: Date,
  openedAt: string | null,
  lastAnyAt: string | null,
  inquiries: ConnRow[],
  reach: Reachability,
  consent: ConsentScope,
  windowDays: number,
): Episode {
  const age = daysSince(openedAt, now);
  const base = { opened_at: openedAt, age_days: age };

  if (consent === "opted_out") {
    return { ...base, state: "closed", blocked_on: null, closed_reason: "opted out" };
  }

  const reported = inquiries
    .map((c) => (c.metadata ?? {}).outcome as { value?: string } | undefined)
    .find((o) => o?.value === "yes" || o?.value === "no");
  if (reported?.value === "yes") {
    return { ...base, state: "closed", blocked_on: null, closed_reason: "they connected" };
  }
  if (reported?.value === "no") {
    return { ...base, state: "closed", blocked_on: null, closed_reason: "no connection formed" };
  }

  const quietDays = daysSince(lastAnyAt, now);
  if (quietDays !== null && quietDays > windowDays) {
    return { ...base, state: "dormant", blocked_on: null, closed_reason: null };
  }

  // Whose turn is it? If a provider is holding a live inquiry, it is theirs.
  const waiting = inquiries
    .filter((c) => c.type === "inquiry")
    .map((c) => ({ c, t: getConnectionTemperature(c as ConnectionLike, now.getTime()) }))
    .find(({ t }) => t.waitingOn === "provider" && !t.isClosed);
  if (waiting && reach.open.length > 0) {
    return {
      ...base,
      state: "waiting",
      blocked_on: waiting.c.to_profile?.display_name ?? "a provider",
      closed_reason: null,
    };
  }

  return { ...base, state: "open", blocked_on: null, closed_reason: null };
}

// ── the list ──────────────────────────────────────────────────────────────────

/**
 * An offer the relay made on this family's behalf, and whether it landed.
 *
 * The board knew a family came from a city ad and nothing about what happened
 * next. Offers, and specifically reached_channels, are the difference between
 * "three providers passed" and "two were never told" — which is what actually
 * happened to Bessie Brooks on 20 September, and was invisible here.
 */
type CityOfferRow = {
  id: string;
  lead_id: string;
  provider_id: string;
  position: number;
  offered_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  expired_at: string | null;
  reached_channels: string[] | null;
  delivery_note: string | null;
};

type Loaded = {
  profiles: ProfileRow[];
  conns: Map<string, ConnRow[]>;
  emails: Map<string, EmailRow[]>;
  sms: Map<string, SmsRow[]>;
  support: Map<string, SeekerTimelineItem[]>;
  cityLeads: Map<string, CityLeadRow>;
  cityMsgs: Map<string, CityMsgRow[]>;
  cityOffers: Map<string, CityOfferRow[]>;
  providerNames: Map<string, string>;
  activity: Map<string, ActivityRow[]>;
  touches: Map<string, FamilyTouchRow[]>;
  archived: Map<string, { reason: string; note: string | null; at: string }>;
  /** Inquiry ids a managed (Ad Boost) campaign is recorded as having delivered. */
  managedConnections: Set<string>;
  /** Families who have EVER completed the benefits finder. Not time-windowed. */
  everDidBenefits: Set<string>;
  bouncedAddrs: Set<string>;
  dncEmails: Set<string>;
  dncPhones: Set<string>;
};

/**
 * Find the families with a live episode, newest signal first, capped.
 *
 * "In a relationship with" is defined as: inquired, or came in as a city lead,
 * or texted us, or wrote to support@, or ANSWERED the outcome email, inside
 * the window.
 *
 * That last one is here because every other feed is keyed on when the family
 * arrived, and an outcome answer is keyed on when they replied. The two drift
 * apart by exactly as long as it takes somebody to answer an email. A family
 * who enquired in June and told us in September that the provider never came
 * back is the most actionable row on the board, and without this query she is
 * not a candidate at all — the queue would silently drop the rows it exists
 * for. The stored timestamp is an ISO-8601 UTC string of fixed shape, so the
 * text comparison below orders correctly.
 */
async function candidateIds(
  db: ReturnType<typeof getServiceClient>,
  sinceIso: string,
): Promise<string[]> {
  const [conns, leads, sms, threads, answered] = await Promise.all([
    db.from("connections").select("from_profile_id, created_at").gte("created_at", sinceIso).limit(4000),
    db
      .from("city_leads")
      .select("care_seeker_id, created_at")
      .eq("is_test", false)
      .not("care_seeker_id", "is", null)
      .gte("created_at", sinceIso)
      .limit(1000),
    db
      .from("sms_inbound")
      .select("profile_id, created_at")
      .eq("profile_type", "family")
      .not("profile_id", "is", null)
      .gte("created_at", sinceIso)
      .limit(2000),
    db
      .from("support_email_threads")
      .select("matched_profile_id, last_message_at")
      .eq("matched_profile_type", "family")
      .not("matched_profile_id", "is", null)
      .gte("last_message_at", sinceIso)
      .limit(2000),
    db
      .from("connections")
      .select("from_profile_id, metadata->outcome->>at")
      .gte("metadata->outcome->>at", sinceIso)
      .limit(1000),
  ]);

  const latest = new Map<string, string>();
  const note = (id: string | null, at: string | null) => {
    if (!id || !at) return;
    const prev = latest.get(id);
    if (!prev || prev < at) latest.set(id, at);
  };
  for (const r of (conns.data ?? []) as { from_profile_id: string; created_at: string }[]) note(r.from_profile_id, r.created_at);
  for (const r of (leads.data ?? []) as { care_seeker_id: string; created_at: string }[]) note(r.care_seeker_id, r.created_at);
  for (const r of (sms.data ?? []) as { profile_id: string; created_at: string }[]) note(r.profile_id, r.created_at);
  for (const r of (threads.data ?? []) as { matched_profile_id: string; last_message_at: string }[]) note(r.matched_profile_id, r.last_message_at);
  for (const r of (answered.data ?? []) as { from_profile_id: string; at: string }[]) note(r.from_profile_id, r.at);

  return Array.from(latest.entries())
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, MAX_FAMILIES)
    .map(([id]) => id);
}

/** Pull every feed for a known set of family ids. */
async function loadFeeds(
  db: ReturnType<typeof getServiceClient>,
  ids: string[],
  sinceIso: string | null,
): Promise<Loaded> {
  const empty: Loaded = {
    profiles: [],
    conns: new Map(),
    emails: new Map(),
    sms: new Map(),
    support: new Map(),
    cityLeads: new Map(),
    cityMsgs: new Map(),
    cityOffers: new Map(),
    providerNames: new Map(),
    archived: new Map(),
    managedConnections: new Set(),
    everDidBenefits: new Set(),
    activity: new Map(),
    touches: new Map(),
    bouncedAddrs: new Set(),
    dncEmails: new Set(),
    dncPhones: new Set(),
  };
  if (!ids.length) return empty;

  const gte = <Q extends { gte: (c: string, v: string) => Q }>(q: Q, col: string): Q => (sinceIso ? q.gte(col, sinceIso) : q);

  const [profiles, connRows, smsRows, threads0, leads0, actRows, dncRes, touchRows] = await Promise.all([
    // type='family' is load-bearing, not belt-and-braces: connections.from_profile_id
    // is not always a family (5 of the last 300 were organization rows), so without
    // this a provider sending a connection lands on the care-seeker list.
    fetchInChunks<ProfileRow>(ids, (g) =>
      db
        .from("business_profiles")
        .select("id, display_name, city, state, email, phone, metadata")
        .eq("type", "family")
        .in("id", g),
    ),
    fetchInChunks<ConnRow>(ids, (g) =>
      db
        .from("connections")
        .select(
          "id, from_profile_id, to_profile_id, type, status, message, metadata, created_at, to_profile:to_profile_id(id, display_name)",
        )
        .in("from_profile_id", g)
        .order("created_at", { ascending: false })
        .limit(2000),
    ),
    fetchInChunks<SmsRow>(ids, (g) =>
      db
        .from("sms_inbound")
        .select("id, from_phone, phone_last10, body, keyword, profile_id, created_at, handled_at")
        .in("profile_id", g)
        .order("created_at", { ascending: false })
        .limit(2000),
    ),
    fetchInChunks<SupportThreadRow>(ids, (g) =>
      db
        .from("support_email_threads")
        .select("id, subject, state, category, matched_profile_id, last_message_at")
        .in("matched_profile_id", g)
        .order("last_message_at", { ascending: false })
        .limit(1000),
    ),
    fetchInChunks<CityLeadRow>(ids, (g) =>
      db
        .from("city_leads")
        .select(
          "id, slug, care_seeker_id, first_name, phone, email, note, care_type, urgency, payment_type, zip, status, reached_at, outcome, admin_note, created_at, archived_at",
        )
        .in("care_seeker_id", g)
        .limit(1000),
    ),
    fetchInChunks<ActivityRow>(ids, (g) =>
      gte(
        db
          .from("seeker_activity")
          .select("id, profile_id, event_type, related_provider_id, metadata, created_at")
          .in("profile_id", g)
          .order("created_at", { ascending: false })
          .limit(3000),
        "created_at",
      ),
    ),
    db.from("do_not_contact").select("email, phone, reason").limit(2000),
    // The ONLY tolerated feed. family_touches (migration 230) is applied by hand
    // through the Supabase dashboard, so between a deploy and that being run the
    // table does not exist. Six feeds of real history should not go dark because
    // the seventh is not there yet; everything else still throws, because a
    // silently half-rendered relationship is worse than an error.
    fetchInChunks<FamilyTouchRow>(ids, (g) =>
      db
        .from("family_touches")
        .select("*")
        .in("seeker_id", g)
        .order("occurred_at", { ascending: false })
        .limit(2000),
    ).catch((err: { code?: string; message?: string }) => {
      // ONLY the table not existing is tolerated, and only until the migration
      // is applied. Anything else — permissions, a timeout — must surface,
      // because an empty touch list is indistinguishable from "nothing was ever
      // logged", and TJ would reasonably conclude his call had vanished.
      const missing = err?.code === "PGRST205" || /Could not find the table/i.test(err?.message ?? "");
      if (!missing) throw err;
      console.warn("[seeker-touches] family_touches not created yet, continuing without it");
      return [] as FamilyTouchRow[];
    }),
  ]);

  const addrs = profiles.map((p) => (p.email ?? "").trim()).filter(Boolean);
  // A text lands in email_log with the PHONE NUMBER in `recipient`, so the
  // recipient lookup has to carry both. Benefits texts also set provider_id to
  // the profile uuid, but city-lead texts leave it null — which is how every
  // system text sent to a city lead would otherwise be missing from their
  // timeline, i.e. exactly the story this page was built to show.
  const phones = profiles.map((p) => (p.phone ?? "").trim()).filter(Boolean);
  const recipients = Array.from(new Set([...addrs, ...phones]));

  // email_log keys a family three different ways depending on which sender wrote
  // the row: the address, the legacy provider_id column (family SMS), and
  // metadata.family_profile_id (modern family email, so history survives an
  // address change). Query each and union.
  //
  // Two things bound the cost. recipient_type narrows away the provider-facing
  // majority of the table (null is allowed because older rows predate the
  // column — the same predicate the care-seeker comms timeline already uses).
  //
  // And html_body is NOT selected here. A text keeps its whole message in that
  // column and needs it; an email keeps a full HTML document in it, and pulling
  // those for every family cost 14.5MB and seven seconds on a measured load of
  // 394 families. An email already has a subject to show, so the body preview
  // was buying almost nothing. Texts get their own small query below.
  const EMAIL_COLS =
    "id, recipient, provider_id, channel, email_type, subject, status, created_at, delivered_at, first_opened_at, bounced_at, complained_at, error_message, metadata";
  const EMAIL_LIMIT = 1500;
  const familyScoped = <Q extends { or: (f: string) => Q }>(q: Q): Q =>
    q.or("recipient_type.is.null,recipient_type.eq.family");

  const [byAddr, byLegacy, byMeta, bounced] = await Promise.all([
    recipients.length
      ? fetchInChunks<EmailRow>(recipients, (g) =>
          gte(
            familyScoped(db.from("email_log").select(EMAIL_COLS).in("recipient", g))
              .order("created_at", { ascending: false })
              .limit(EMAIL_LIMIT),
            "created_at",
          ),
        )
      : Promise.resolve([] as EmailRow[]),
    fetchInChunks<EmailRow>(ids, (g) =>
      gte(
        familyScoped(db.from("email_log").select(EMAIL_COLS).in("provider_id", g))
          .order("created_at", { ascending: false })
          .limit(EMAIL_LIMIT),
        "created_at",
      ),
    ),
    fetchInChunks<EmailRow>(ids, (g) =>
      gte(
        familyScoped(db.from("email_log").select(EMAIL_COLS).in("metadata->>family_profile_id", g))
          .order("created_at", { ascending: false })
          .limit(EMAIL_LIMIT),
        "created_at",
      ),
    ),
    // Bounces get their own query, unwindowed and unlimited, because
    // reachability must not depend on whether a bounce happened to survive the
    // row cap above. Saying "reachable by email" about an address that bounced
    // is the exact failure this page exists to stop, and a bounce is rare
    // enough that the extra read is free.
    fetchInChunks<{ id: string; recipient: string | null; bounced_at: string }>(addrs, (g) =>
      db.from("email_log").select("id, recipient, bounced_at").in("recipient", g).not("bounced_at", "is", null).limit(1000),
    ),
  ]);

  const bouncedAddrs = new Set(
    bounced.map((b) => (b.recipient ?? "").trim().toLowerCase()).filter(Boolean),
  );

  // Texts only: short bodies, and the body IS the message, so it has to be shown.
  const smsBodies = await fetchInChunks<{ id: string; html_body: string | null }>(recipients, (g) =>
    gte(
      db
        .from("email_log")
        .select("id, html_body")
        .eq("channel", "sms")
        .in("recipient", g)
        .order("created_at", { ascending: false })
        .limit(EMAIL_LIMIT),
      "created_at",
    ),
  );
  const smsBodyById = new Map(smsBodies.map((r) => [r.id, r.html_body]));

  const threads = threads0;
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const ownerOfThread = new Map<string, string>();
  for (const t of threads) if (t.matched_profile_id) ownerOfThread.set(t.id, t.matched_profile_id);

  const supportMsgs = await fetchInChunks<SupportMsgRow>(
    threads.map((t) => t.id),
    (g) =>
      db
        .from("support_email_messages")
        .select("id, thread_id, direction, from_email, from_name, subject, snippet, internal_date")
        .in("thread_id", g)
        .order("internal_date", { ascending: false })
        .limit(2000),
  );
  supportMsgs.sort((a, b) => (a.internal_date < b.internal_date ? 1 : -1));

  const leads = leads0;
  const cityMsgRows = await fetchInChunks<CityMsgRow>(
    leads.map((l) => l.id),
    (g) =>
      db
        .from("city_lead_messages")
        .select("id, lead_id, channel, body, subject, status, last_error, created_at, completed_at, created_by")
        .in("lead_id", g)
        .order("created_at", { ascending: false })
        .limit(1000),
  );

  const cityOfferRows = await fetchInChunks<CityOfferRow>(
    leads.map((l) => l.id),
    (g) =>
      db
        .from("city_lead_offers")
        .select(
          "id, lead_id, provider_id, position, offered_at, accepted_at, declined_at, decline_reason, expired_at, reached_channels, delivery_note",
        )
        .in("lead_id", g)
        .order("position")
        .limit(1000),
  );
  const offerProviderIds = Array.from(new Set(cityOfferRows.map((o) => o.provider_id)));
  const offerProviders = offerProviderIds.length
    ? await fetchInChunks<{ id: string; display_name: string | null }>(offerProviderIds, (g) =>
        db.from("business_profiles").select("id, display_name").in("id", g),
      )
    : [];
  const providerNames = new Map(offerProviders.map((p) => [p.id, p.display_name ?? "a provider"]));

  // ── group ──
  const idSet = new Set(ids);
  const byId = <T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      if (!k || !idSet.has(k)) continue;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  };

  const addrOwner = new Map<string, string>();
  const phoneOwner = new Map<string, string>();
  for (const p of profiles) {
    if (p.email) addrOwner.set(p.email.trim().toLowerCase(), p.id);
    const k = last10(p.phone);
    if (k) phoneOwner.set(k, p.id);
  }

  const allEmails = new Map<string, EmailRow>();
  for (const e of [...byAddr, ...byLegacy, ...byMeta]) {
    allEmails.set(e.id, smsBodyById.has(e.id) ? { ...e, html_body: smsBodyById.get(e.id) ?? null } : e);
  }
  const emailOwner = (e: EmailRow): string | null => {
    const fromMeta = (e.metadata ?? {}).family_profile_id;
    if (typeof fromMeta === "string" && idSet.has(fromMeta)) return fromMeta;
    if (e.provider_id && idSet.has(e.provider_id)) return e.provider_id;
    const recipient = (e.recipient ?? "").trim();
    const byAddress = addrOwner.get(recipient.toLowerCase());
    if (byAddress) return byAddress;
    // A text: `recipient` is the number it went to.
    const digits = last10(recipient);
    return (digits && phoneOwner.get(digits)) ?? null;
  };

  // Support messages, newest first, so the first per thread is the latest.
  const supportItems = new Map<string, SeekerTimelineItem[]>();
  const latestSeen = new Set<string>();
  for (const m of supportMsgs) {
    const owner = ownerOfThread.get(m.thread_id);
    if (!owner) continue;
    const latest = !latestSeen.has(m.thread_id);
    latestSeen.add(m.thread_id);
    const arr = supportItems.get(owner) ?? [];
    arr.push(supportToItem(m, threadById.get(m.thread_id), latest));
    supportItems.set(owner, arr);
  }

  const cityLeads = new Map<string, CityLeadRow>();
  for (const l of leads) {
    if (!l.care_seeker_id) continue;
    const prev = cityLeads.get(l.care_seeker_id);
    if (!prev || prev.created_at < l.created_at) cityLeads.set(l.care_seeker_id, l);
  }
  const cityMsgs = new Map<string, CityMsgRow[]>();
  const leadOwner = new Map(leads.map((l) => [l.id, l.care_seeker_id]));
  for (const m of cityMsgRows) {
    const owner = leadOwner.get(m.lead_id);
    if (!owner) continue;
    const arr = cityMsgs.get(owner) ?? [];
    arr.push(m);
    cityMsgs.set(owner, arr);
  }

  // A person's decision that this row is not a case. Read for the families on
  // screen, by primary key.
  const archiveRows = await fetchInChunks<{ seeker_id: string; reason: string; note: string | null; archived_at: string }>(
    ids,
    (g) => db.from("seeker_archives").select("seeker_id, reason, note, archived_at").in("seeker_id", g),
  );
  const archived = new Map(archiveRows.map((a) => [a.seeker_id, { reason: a.reason, note: a.note, at: a.archived_at }]));

  // Ad Boost attribution is recorded against the PROVIDER, not the family, so
  // the only way to the family is through the connection id it names. Tiny set
  // by construction: 14 rows in the whole table at the time of writing, which
  // is itself the reason a paid count here is a floor rather than a total.
  const { data: managedRows } = await db
    .from("provider_activity")
    .select("metadata")
    .eq("event_type", "lead_received")
    .eq("metadata->>utm_source", "olera_managed")
    .limit(2000);
  const managedConnections = new Set(
    (managedRows ?? [])
      .map((m) => (m.metadata as Record<string, unknown> | null)?.connection_id)
      .filter((v): v is string => typeof v === "string"),
  );

  // ORIGIN DOES NOT EXPIRE, AND THE ACTIVITY FEED DOES.
  //
  // The seeker_activity feed above is windowed to the same period as the board,
  // which is right for "what have they done lately" and wrong for "how did they
  // arrive". Reading benefits origin off it mis-tagged three families as
  // provider_page at 45 days, and the page offers a 14-day view where nearly
  // every benefits family would have been wrong. One narrow unwindowed lookup
  // instead: a single event type, for the families already on screen.
  const benefitsRows = await fetchInChunks<{ profile_id: string }>(ids, (g) =>
    db.from("seeker_activity").select("profile_id").eq("event_type", "benefits_completed").in("profile_id", g),
  );
  const everDidBenefits = new Set(benefitsRows.map((b) => b.profile_id));

  const cityOffers = new Map<string, CityOfferRow[]>();
  for (const o of cityOfferRows) {
    const owner = leadOwner.get(o.lead_id);
    if (!owner) continue;
    const arr = cityOffers.get(owner) ?? [];
    arr.push(o);
    cityOffers.set(owner, arr);
  }

  // A message sent by hand from the city queue is written TWICE: once as the
  // city_lead_messages row, and once into email_log by the sender that actually
  // delivered it. Merged naively that renders every hand-sent text as two
  // timeline entries a minute apart — one labelled "You", one labelled "System",
  // which was all four of them. Keep the queue row, because it knows a person
  // sent it, and lift the delivery state off the email twin before dropping it.
  const cityMsgById = new Map(cityMsgRows.map((m) => [m.id, m]));
  for (const [id, e] of Array.from(allEmails.entries())) {
    const twin = (e.metadata ?? {}).city_message_id;
    if (typeof twin !== "string") continue;
    const queued = cityMsgById.get(twin);
    if (!queued) continue;
    queued.delivery = emailStatus(e);
    allEmails.delete(id);
  }

  const dncEmails = new Set<string>();
  const dncPhones = new Set<string>();
  for (const d of (dncRes.data ?? []) as DncRow[]) {
    if (d.email) dncEmails.add(d.email.trim().toLowerCase());
    const p = last10(d.phone);
    if (p) dncPhones.add(p);
  }

  return {
    profiles,
    conns: byId(connRows, (c) => c.from_profile_id),
    emails: byId(Array.from(allEmails.values()), emailOwner),
    sms: byId(smsRows, (s) => s.profile_id),
    support: supportItems,
    cityLeads,
    cityMsgs,
    cityOffers,
    providerNames,
    archived,
    managedConnections,
    everDidBenefits,
    activity: byId(actRows, (a) => a.profile_id),
    touches: byId(touchRows, (t) => t.seeker_id),
    bouncedAddrs,
    dncEmails,
    dncPhones,
  };
}

/** Assemble one family's derived state from their already-grouped feeds. */
function assemble(p: ProfileRow, f: Loaded, now: Date, windowDays: number) {
  const contact = toContact(p);
  const conns = (f.conns.get(p.id) ?? []).slice().sort(byCreatedDesc);
  const emails = (f.emails.get(p.id) ?? []).slice().sort(byCreatedDesc);
  const checkinPrompts = emails.filter((e) => isSms(e) && CHECKIN_PROMPT.test(e.html_body ?? "")).map((e) => e.created_at);
  const sms = (f.sms.get(p.id) ?? []).map((r) => smsToItem(r, checkinPrompts));
  const support = f.support.get(p.id) ?? [];
  const lead = f.cityLeads.get(p.id);
  const cityMsgs = (f.cityMsgs.get(p.id) ?? []).map(cityMsgToItem);
  const touchRows = (f.touches.get(p.id) ?? []).slice().sort(byNewest);
  const touches = touchRows.map(touchToItem);
  const openAction = openActionOf(touchRows);
  const everReached = touchRows.some((t) => t.reached === true);
  const archived = f.archived.get(p.id) ?? null;
  // Order matters: most specific evidence first. A city-ad family often also
  // has an inquiry, so checking "has an inquiry" first would swallow every
  // paid family into provider_page and report zero ads.
  const origin: SeekerRelationshipRow["origin"] = lead
    ? "city_ad"
    : conns.some((c) => f.managedConnections.has(c.id))
      ? "ad_boost"
      : f.everDidBenefits.has(p.id)
        ? "benefits"
        : conns.some((c) => c.type === "inquiry")
          ? "provider_page"
          : "unknown";

  const reach = reachabilityOf(contact, f.bouncedAddrs, f.dncEmails, f.dncPhones);
  const inquiries = conns.filter((c) => c.type === "inquiry" || c.type === "request");
  const consent = consentOf(reach, lead, inquiries);

  // A human touch is anything a person did on either side: their text, their
  // support email, a message we sent by hand. System sends do not count.
  const inbound = [...support, ...sms].sort(byNewest);
  const humanTouches = [...inbound, ...cityMsgs.filter((m) => m.actor === "out"), ...touches].sort(byNewest);
  const lastHuman = humanTouches[0] ?? null;

  const candidates: LastSeekerTouch[] = [];
  const push = (it: SeekerTimelineItem | undefined) => {
    if (!it) return;
    candidates.push({
      occurred_at: it.occurred_at,
      channel: it.channel,
      actor: it.actor,
      source: it.source,
      title: it.title,
      status: it.status ?? null,
    });
  };
  push(humanTouches[0]);
  push(touches[0]);
  push(conns[0] ? connToItem(conns[0]) : undefined);
  if (emails[0]) push(emailToItem(emails[0]));
  if (lead) push(cityLeadToItem(lead));
  const lastTouch = candidates.sort(byNewest)[0] ?? null;

  /**
   * The clock that decides "quiet" and "dormant" — and it deliberately does NOT
   * count our own automated sends.
   *
   * The publish and completion nudge crons email families on a ladder for
   * months (1,894 such sends in the last 45 days alone). If a cron email reset
   * the clock, no family in a nudge sequence could ever read as quiet or go
   * dormant, and the Open tab would fill with people whose only recent activity
   * is us emailing them. Same reason the provider list prefers its last *human*
   * touch. `lastTouch` above still shows a system send when that genuinely was
   * the last thing to happen; this is only the clock.
   */
  const meaningful = [
    humanTouches[0]?.occurred_at,
    conns[0]?.created_at,
    lead?.created_at,
  ].filter((x): x is string => !!x);
  const lastMeaningfulAt = meaningful.length ? meaningful.sort().reverse()[0] : null;

  const firstSignals = [
    lead?.created_at,
    conns[conns.length - 1]?.created_at,
    inbound[inbound.length - 1]?.occurred_at,
  ].filter((x): x is string => !!x);
  const openedAt = firstSignals.length ? firstSignals.sort()[0] : null;

  const episode = episodeOf(now, openedAt, lastMeaningfulAt, inquiries, reach, consent, windowDays);

  const flags: SeekerFlag[] = [];
  // AN ARCHIVED CITY LEAD IS A DECISION, AND IT HAS TO TRAVEL.
  //
  // Archiving already cancels their queued messages and any open offer, and it
  // is now done automatically: the qualification classifier files a job seeker
  // or a sales pitch on its own. Drema Mitchell Lowe was filed as looking for
  // work, and still appeared at the top of "Reply to them" because her
  // unanswered text set awaiting_reply — the one flag that never checked.
  // Somebody had decided she was not a case, and the case desk asked for her
  // anyway. Suppressing the work flags is not hiding her: she stays in All,
  // and un-archiving puts her straight back.
  // Dated, not blanket. Suppressing on archived_at alone would also bury a
  // family who was filed months ago and has just written in again about
  // something real — the archive closes the case we knew about, it does not
  // close her. Only the unanswered messages from BEFORE the archive are
  // covered; anything she sends afterwards is a live case and says so.
  const closedAt = lead?.archived_at ?? null;
  const unanswered = inbound.filter((it) => it.status === "needs reply");
  const liveUnanswered = closedAt ? unanswered.filter((it) => it.occurred_at > closedAt) : unanswered;
  const cityClosed = Boolean(closedAt);
  if (liveUnanswered.length > 0) flags.push("awaiting_reply");
  if (reach.open.length === 0 && consent !== "opted_out") flags.push("unreachable");
  if (consent === "opted_out") flags.push("opted_out");
  if (
    inquiries.some(
      (c) =>
        (c.status ?? "pending") === "pending" &&
        !providerResponded(c as ConnectionLike) &&
        now.getTime() - new Date(c.created_at).getTime() > PROVIDER_SILENT_MS,
    )
  ) {
    flags.push("provider_silent");
  }
  // WHAT THEY SAID, NOT THAT THEY SAID SOMETHING.
  //
  // The old flag fired on ANY answer, because it also required
  // status === 'pending' — and status is the in-app accept state, which has
  // never moved off pending for a single one of 1,431 inquiries. So the
  // condition was permanently true of every answered inquiry and could never
  // clear. It produced a 42-row queue asking a person to write down a value
  // that arrived as structured data from a one-click link.
  //
  // Only one of the three answers is work. "no" means they told us the
  // provider never came back, which is a request we can re-route. "yes" means
  // contacted, not placed, and is the audience for a follow-up rather than a
  // task. "not_yet" is a timer.
  const outcome = latestOutcome(inquiries);
  if (
    outcome?.value === "no" &&
    now.getTime() - new Date(outcome.at).getTime() < NO_SHOW_ACTIONABLE_MS
  ) {
    flags.push("provider_no_show");
  }
  if (humanTouches.length === 0) flags.push("never_human");
  if (contact.label_is_fallback) flags.push("no_name");

  // A MISSED CALL TAKES THEM OFF THE CALL LIST FOR A DAY, NOT FOR GOOD.
  //
  // The rule below keeps a call owed until somebody actually speaks to them,
  // and that stays true. But without a pause, a family Ces rang an hour ago
  // sat at the top of "Call them" looking untouched, the list never shrank as
  // it was worked, and the team went back to keeping the real state in their
  // heads. The newest attempt that did not reach them parks the row for
  // twenty-four hours; if nobody reaches them by then, it comes back.
  const lastMiss = touchRows.find((t) => t.direction === "out" && t.reached === false);
  const retryAtMs = lastMiss ? new Date(lastMiss.occurred_at).getTime() + DAY_MS : null;
  const missedRecently = Boolean(retryAtMs && retryAtMs > now.getTime());

  // A promised call stays owed until somebody actually SPOKE to them, or until
  // a dated next action says when we will try again. Logging "called, mailbox
  // full" must not clear it — trying is not reaching, and clearing on the
  // attempt would quietly drop the families who are hardest to get hold of.
  const callOwed =
    Boolean(lead) &&
    !lead!.reached_at &&
    !cityClosed &&
    getCityConfig(lead!.slug)?.routingMode === "concierge" &&
    !everReached &&
    !(openAction && openAction.due);
  // Only a family who still owes a call can be parked. Helen Garner had a
  // missed call logged after she had already been reached, and read "back in
  // Call them tomorrow" for a list she was never going back to.
  // THREE STRIKES. The pause above repeats forever on its own, so a family
  // who never picks up came back to "Call them" every day indefinitely. After
  // three logged misses the ask changes: one last text or email, then archive
  // as "Never answered". Nothing is sent automatically; the row only says so.
  const missedCalls = touchRows.filter((t) => t.direction === "out" && t.reached === false).length;
  const triedThree = callOwed && missedCalls >= 3;
  const callRetryAt = callOwed && !triedThree && missedRecently ? new Date(retryAtMs!).toISOString() : null;
  if (triedThree) flags.push("tried_three");
  else if (callOwed && !callRetryAt) flags.push("promise_owed");

  // ARCHIVING IS A DECISION ABOUT THE ROW, NOT ABOUT THE EVENTS.
  //
  // Every flag above reads real history and is correct. "Test McTest" really
  // does have a message nobody answered, which is exactly why it ranked first
  // in "Reply to them" for 1,098 days. No event will ever say a row is a test
  // record, so a person says it, and from then on the row stops asking for
  // anyone. Emptying the flags is the whole mechanism: the queues are built
  // from them, so nothing downstream needs to know archiving exists.
  if (archived) {
    // Only the flags that ASK FOR SOMEONE'S TIME. opted_out and no_name are
    // facts about the person that stay true after a decision about the row —
    // erasing the opt-out in particular would quietly drop the one flag that
    // says they told us to stop.
    const work = new Set<SeekerFlag>([
      "awaiting_reply", "promise_owed", "tried_three", "unreachable",
      "provider_no_show", "provider_silent", "never_human",
    ]);
    for (let i = flags.length - 1; i >= 0; i--) if (work.has(flags[i])) flags.splice(i, 1);
  }

  const providers = inquiries
    .filter((c) => c.to_profile)
    .map((c) => ({
      id: c.to_profile!.id,
      name: c.to_profile!.display_name ?? "a provider",
      at: c.created_at,
      responded: providerResponded(c as ConnectionLike),
      connection_id: c.id,
    }));

  return {
    contact,
    reach,
    consent,
    episode,
    flags,
    providers,
    lastTouch,
    lastHuman,
    lastMeaningfulAt,
    humanTouchCount: humanTouches.length,
    // Their own latest words, for a row that is waiting on our answer.
    lastInbound: inbound[0] ?? null,
    callRetryAt,
    missedCalls,
    openAction,
    everReached,
    lead,
    archived,
    origin,
    outcome,
    parts: { conns, emails, sms, support, cityMsgs, touches },
  };
}

export async function loadSeekerRelationships(opts?: { days?: number }): Promise<SeekerRelationshipRow[]> {
  const db = getServiceClient();
  const now = new Date();
  const windowDays = opts?.days ?? DEFAULT_WINDOW_DAYS;
  const sinceIso = new Date(now.getTime() - windowDays * DAY_MS).toISOString();

  const ids = await candidateIds(db, sinceIso);
  if (!ids.length) return [];

  // Feeds read further back than the candidate window so a family who inquired
  // recently still shows the history that explains them.
  const feedSince = new Date(now.getTime() - Math.max(windowDays, 120) * DAY_MS).toISOString();
  const feeds = await loadFeeds(db, ids, feedSince);

  const rows: SeekerRelationshipRow[] = feeds.profiles.map((p) => {
    const a = assemble(p, feeds, now, windowDays);
    return {
      ...a.contact,
      last_touch: a.lastTouch,
      last_human_touch_at: a.lastHuman?.occurred_at ?? null,
      human_touch_count: a.humanTouchCount,
      days_quiet: daysSince(a.lastMeaningfulAt ?? a.lastTouch?.occurred_at ?? null, now),
      reach: a.reach,
      consent: a.consent,
      episode: a.episode,
      flags: a.flags,
      providers: a.providers,
      city_lead_id: a.lead?.id ?? null,
      city_slug: a.lead?.slug ?? null,
      open_action: a.openAction,
      ever_reached: a.everReached,
      archived: a.archived,
      origin: a.origin,
      outcome: a.outcome,
      call_retry_at: a.callRetryAt,
      missed_calls: a.missedCalls,
      last_inbound: a.lastInbound
        ? {
            occurred_at: a.lastInbound.occurred_at,
            channel: a.lastInbound.channel,
            title: a.lastInbound.title,
            detail: a.lastInbound.detail ?? null,
          }
        : null,
    };
  });

  // Whoever is waiting on us comes first: an unanswered reply, then a promise we
  // made, then someone we cannot reach. After that, longest quiet — but only
  // within "open", because a dormant family being quiet is not news.
  const rank = (r: SeekerRelationshipRow): number => {
    if (r.flags.includes("awaiting_reply")) return 0;
    if (r.flags.includes("promise_owed") || r.flags.includes("tried_three")) return 1;
    if (r.flags.includes("unreachable")) return 2;
    if (r.flags.includes("provider_no_show")) return 3;
    if (r.episode.state === "open") return 4;
    if (r.flags.includes("provider_silent")) return 5;
    if (r.episode.state === "waiting") return 6;
    if (r.episode.state === "dormant") return 7;
    return 8;
  };
  rows.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.days_quiet ?? -1) - (a.days_quiet ?? -1);
  });

  return rows;
}

// ── one family ────────────────────────────────────────────────────────────────

/**
 * One offer, as a line in the family's story.
 *
 * Says REACHED, not offered. Those were the same fact on every surface until
 * 21 September, and they are not: every pooled Dallas provider number is a
 * landline and two of the three have addresses the verification gate
 * suppresses, so four of the first seven offers arrived nowhere while the
 * panel showed a thirty minute clock and then "no one on call took it".
 */
function offerToItem(o: CityOfferRow, providerName: string): SeekerTimelineItem {
  const reached = o.reached_channels ?? [];
  const spoken = reached.map((c) => (c === "sms" ? "text" : c)).join(" and ");
  const outcome = o.accepted_at
    ? "They took it."
    : o.declined_at
      ? `They passed${o.decline_reason ? ` (${o.decline_reason.replace(/_/g, " ")})` : ""}.`
      : o.expired_at
        ? "Their 30 minutes ran out."
        : "Their 30 minutes are running.";
  return {
    id: `offer-${o.id}`,
    kind: "city",
    actor: "system",
    channel: "system",
    occurred_at: o.offered_at,
    title: `Offer #${o.position} to ${providerName}`,
    detail: reached.length
      ? `Sent by ${spoken}. ${outcome}`
      : `NEVER REACHED THEM. ${o.delivery_note ?? "No offer message is recorded as delivered."} The clock ran against a provider who was never told.`,
    status: reached.length ? "delivered" : "failed",
    source: "city",
    href: "/admin/city-ads",
  };
}

/**
 * The conversation inside each page inquiry: what the family and the provider
 * wrote to each other in the inbox (metadata.thread), and what Olera wrote
 * into it (metadata.olera_messages). Only for the one family on screen.
 * System lines in the thread are skipped; the inquiry itself is already an
 * event from connToItem.
 */
function connectionThreadItems(conns: ConnRow[]): SeekerTimelineItem[] {
  const out: SeekerTimelineItem[] = [];
  for (const c of conns) {
    if (c.type !== "inquiry" && c.type !== "request") continue;
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const familyId = c.type === "inquiry" ? c.from_profile_id : c.to_profile_id;
    const providerName = c.to_profile?.display_name ?? "The provider";
    const thread = Array.isArray(meta.thread) ? (meta.thread as Record<string, unknown>[]) : [];
    thread.forEach((m, i) => {
      const text = typeof m.text === "string" ? m.text : "";
      if (!text || m.type === "system") return;
      const fromFamily = m.from_profile_id === familyId;
      out.push({
        id: `conv:${c.id}:${i}`,
        kind: "inquiry",
        actor: fromFamily ? "in" : "system",
        channel: "in_app",
        occurred_at: String(m.created_at ?? c.created_at),
        title: clip(text, 160) ?? text,
        full_text: text,
        detail: m.is_auto_reply ? "sent automatically" : null,
        source: "system",
        status: null,
        author: fromFamily ? null : "provider",
        author_name: fromFamily ? null : providerName,
        connection_id: c.id,
      });
    });
    const olera = Array.isArray(meta.olera_messages) ? (meta.olera_messages as Record<string, unknown>[]) : [];
    for (const m of olera) {
      const text = typeof m.text === "string" ? m.text : "";
      if (!text) continue;
      out.push({
        id: `olera:${String(m.id ?? m.created_at)}`,
        kind: "inquiry",
        actor: "out",
        channel: "in_app",
        occurred_at: String(m.created_at),
        title: clip(text, 160) ?? text,
        full_text: text,
        detail: `to them and ${providerName}`,
        source: "manual",
        status: null,
        olera_post: true,
        sent_by_person: true,
        author_name: typeof m.author_name === "string" ? m.author_name : null,
        connection_id: c.id,
      });
    }
  }
  return out;
}

async function loadThreadItems(db: ReturnType<typeof getServiceClient>, leadId: string): Promise<SeekerTimelineItem[]> {
  const { data: rows, error } = await db
    .from("city_lead_thread")
    .select("id, author, author_profile_id, body, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[seeker-touches] thread read failed:", error);
    return [];
  }
  const ids = Array.from(new Set((rows ?? []).map((r) => r.author_profile_id).filter((v): v is string => !!v)));
  const { data: profs } = ids.length
    ? await db.from("business_profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };
  const names = new Map((profs ?? []).map((p) => [p.id, p.display_name ?? "The provider"]));
  return (rows ?? []).map((r) => {
    const provider = r.author === "provider";
    return {
      id: `thread:${r.id}`,
      kind: "city" as const,
      actor: provider ? ("system" as const) : ("in" as const),
      channel: "in_app" as const,
      occurred_at: r.created_at as string,
      title: String(r.body ?? ""),
      detail: null,
      source: "city" as const,
      status: null,
      author: provider ? ("provider" as const) : null,
      author_name: provider ? (names.get(r.author_profile_id as string) ?? "The provider") : null,
    };
  });
}

export async function loadSeekerTimeline(seekerId: string): Promise<SeekerRelationship | null> {
  const db = getServiceClient();
  const now = new Date();

  const feeds = await loadFeeds(db, [seekerId], null);
  const profile = feeds.profiles[0];
  if (!profile) return null;

  const a = assemble(profile, feeds, now, DEFAULT_WINDOW_DAYS);

  // The shared thread (migration 257): words a provider or the family typed on
  // our pages. Read only for the one family on screen, so the list never pays
  // for it.
  const threadItems = a.lead ? await loadThreadItems(db, a.lead.id) : [];
  const convItems = connectionThreadItems(a.parts.conns);

  const items: SeekerTimelineItem[] = [
    ...threadItems,
    ...convItems,
    ...a.parts.conns.map(connToItem),
    ...a.parts.emails.map(emailToItem),
    ...a.parts.sms,
    ...a.parts.support,
    ...a.parts.cityMsgs,
    ...a.parts.touches,
    ...(feeds.activity.get(seekerId) ?? []).map(activityToItem),
    ...(a.lead ? [cityLeadToItem(a.lead)] : []),
    ...(feeds.cityOffers.get(seekerId) ?? []).map((o) =>
      offerToItem(o, feeds.providerNames.get(o.provider_id) ?? "a provider"),
    ),
  ].sort(byNewest);

  return {
    profile: a.contact,
    reach: a.reach,
    consent: a.consent,
    episode: a.episode,
    flags: a.flags,
    providers: a.providers,
    city_lead_id: a.lead?.id ?? null,
    city_slug: a.lead?.slug ?? null,
    open_action: a.openAction,
    ever_reached: a.everReached,
    archived: a.archived,
    origin: a.origin,
    outcome: a.outcome,
    items,
  };
}

// ── markdown (…&format=md) ────────────────────────────────────────────────────

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function seekerRelationshipsToMarkdown(rows: SeekerRelationshipRow[]): string {
  const out: string[] = ["# Care seekers — who is waiting on us", ""];
  // Archived rows are not waiting on us, and this file says in its own heading
  // that everything below is. The page filters them into their own tab; the
  // export had no filter at all and listed them as "Open".
  for (const r of rows.filter((x) => !x.archived)) {
    const st = stateOf(r);
    out.push(`## ${r.label} — ${st.phrase}${st.age ? ` (${st.age})` : ""}`);
    // Origin moved out of detailLine and into a chip on the page, which this
    // file cannot render. Without this the export came out with strictly LESS
    // than before: "came from a city ad" used to appear here and the
    // replacement was UI-only.
    const detail = [detailLine(r), ORIGIN_LABEL[r.origin]].filter(Boolean).join(" · ");
    if (detail) out.push(detail);
    const problem = problemLine(r);
    if (problem) out.push(`**${problem}**`);
    out.push("");
  }
  return out.join("\n");
}

export function seekerTimelineToMarkdown(t: SeekerRelationship): string {
  const out: string[] = [`# ${t.profile.label}`, ""];
  out.push(`- reachable by: ${t.reach.open.join(" + ") || "nothing"}${t.reach.note ? ` — ${t.reach.note}` : ""}`);
  out.push(`- consent: ${t.consent}`);
  out.push(
    `- where it stands: ${EPISODE_WORD[t.episode.state]}${t.episode.blocked_on ? ` — ${t.episode.blocked_on} has it` : ""}${t.episode.closed_reason ? ` — ${t.episode.closed_reason}` : ""}`,
  );
  if (t.profile.situation) out.push(`- said: "${t.profile.situation}"`);
  out.push("");
  for (const it of t.items) {
    const who = it.actor === "out" ? "You" : it.actor === "in" ? "Them" : "System";
    out.push(`- ${fmt(it.occurred_at)} · ${it.kind} · ${who}: ${it.title}${it.status ? ` [${it.status}]` : ""}`);
  }
  return out.join("\n");
}
