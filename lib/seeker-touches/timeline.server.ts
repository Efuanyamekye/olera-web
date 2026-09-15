import { getServiceClient } from "@/lib/admin";
import { seekerEventLabel } from "@/lib/activity/seeker-categories";
import { getConnectionTemperature, providerResponded, type ConnectionLike } from "@/lib/connection-temperature";
import { getCityConfig } from "@/lib/city-ads/config";
import { isImpossibleUsPhone, last10, seekerLabel } from "./label";
import { EPISODE_WORD, detailLine, problemLine, stateOf } from "./present";
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
    actor: "system",
    channel: sms ? "text" : "email",
    occurred_at: e.created_at,
    // A text has no subject worth showing; its body is the message.
    title: sms ? clip(e.html_body, 150) ?? humanize(e.email_type) : e.subject ?? humanize(e.email_type),
    detail: null,
    source: "system",
    status,
    contact_handle: e.recipient,
    href: null,
  };
}

function smsToItem(r: SmsRow): SeekerTimelineItem {
  return {
    id: `sms:${r.id}`,
    kind: "sms",
    actor: "in",
    channel: "text",
    occurred_at: r.created_at,
    title: clip(r.body, 160) ?? "(empty text)",
    detail: r.keyword ? `keyword ${r.keyword}` : null,
    source: "twilio",
    status: r.handled_at ? null : "needs reply",
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

function cityMsgToItem(m: CityMsgRow): SeekerTimelineItem {
  const failed = m.status === "failed";
  return {
    id: `citymsg:${m.id}`,
    kind: "city",
    actor: "out",
    channel: m.channel === "sms" ? "text" : "email",
    occurred_at: m.created_at,
    title: clip(m.body, 160) ?? m.subject ?? "(sent by hand)",
    detail: null,
    source: "manual",
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
 * their details may not go to a provider without a spoken yes. That fact lives
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

type Loaded = {
  profiles: ProfileRow[];
  conns: Map<string, ConnRow[]>;
  emails: Map<string, EmailRow[]>;
  sms: Map<string, SmsRow[]>;
  support: Map<string, SeekerTimelineItem[]>;
  cityLeads: Map<string, CityLeadRow>;
  cityMsgs: Map<string, CityMsgRow[]>;
  activity: Map<string, ActivityRow[]>;
  touches: Map<string, FamilyTouchRow[]>;
  bouncedAddrs: Set<string>;
  dncEmails: Set<string>;
  dncPhones: Set<string>;
};

/**
 * Find the families with a live episode, newest signal first, capped.
 *
 * "In a relationship with" is defined as: inquired, or came in as a city lead,
 * or texted us, or wrote to support@, inside the window.
 */
async function candidateIds(
  db: ReturnType<typeof getServiceClient>,
  sinceIso: string,
): Promise<string[]> {
  const [conns, leads, sms, threads] = await Promise.all([
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
  const sms = (f.sms.get(p.id) ?? []).map(smsToItem);
  const support = f.support.get(p.id) ?? [];
  const lead = f.cityLeads.get(p.id);
  const cityMsgs = (f.cityMsgs.get(p.id) ?? []).map(cityMsgToItem);
  const touchRows = (f.touches.get(p.id) ?? []).slice().sort(byNewest);
  const touches = touchRows.map(touchToItem);
  const openAction = openActionOf(touchRows);
  const everReached = touchRows.some((t) => t.reached === true);

  const reach = reachabilityOf(contact, f.bouncedAddrs, f.dncEmails, f.dncPhones);
  const inquiries = conns.filter((c) => c.type === "inquiry" || c.type === "request");
  const consent = consentOf(reach, lead, inquiries);

  // A human touch is anything a person did on either side: their text, their
  // support email, a message we sent by hand. System sends do not count.
  const inbound = [...support, ...sms].sort(byNewest);
  const humanTouches = [...inbound, ...cityMsgs, ...touches].sort(byNewest);
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
  if (inbound.some((it) => it.status === "needs reply")) flags.push("awaiting_reply");
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
  if (
    inquiries.some((c) => {
      const o = (c.metadata ?? {}).outcome as { value?: string } | undefined;
      return !!o?.value && (c.status ?? "pending") === "pending";
    })
  ) {
    flags.push("outcome_reported");
  }
  if (humanTouches.length === 0) flags.push("never_human");
  if (contact.label_is_fallback) flags.push("no_name");
  // A promised call stays owed until somebody actually SPOKE to them, or until
  // a dated next action says when we will try again. Logging "called, mailbox
  // full" must not clear it — trying is not reaching, and clearing on the
  // attempt would quietly drop the families who are hardest to get hold of.
  if (
    lead &&
    !lead.reached_at &&
    !lead.archived_at &&
    getCityConfig(lead.slug)?.routingMode === "concierge" &&
    !everReached &&
    !(openAction && openAction.due)
  ) {
    flags.push("promise_owed");
  }

  const providers = inquiries
    .filter((c) => c.to_profile)
    .map((c) => ({
      id: c.to_profile!.id,
      name: c.to_profile!.display_name ?? "a provider",
      at: c.created_at,
      responded: providerResponded(c as ConnectionLike),
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
    openAction,
    everReached,
    lead,
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
    };
  });

  // Whoever is waiting on us comes first: an unanswered reply, then a promise we
  // made, then someone we cannot reach. After that, longest quiet — but only
  // within "open", because a dormant family being quiet is not news.
  const rank = (r: SeekerRelationshipRow): number => {
    if (r.flags.includes("awaiting_reply")) return 0;
    if (r.flags.includes("promise_owed")) return 1;
    if (r.flags.includes("unreachable")) return 2;
    if (r.flags.includes("outcome_reported")) return 3;
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

export async function loadSeekerTimeline(seekerId: string): Promise<SeekerRelationship | null> {
  const db = getServiceClient();
  const now = new Date();

  const feeds = await loadFeeds(db, [seekerId], null);
  const profile = feeds.profiles[0];
  if (!profile) return null;

  const a = assemble(profile, feeds, now, DEFAULT_WINDOW_DAYS);

  const items: SeekerTimelineItem[] = [
    ...a.parts.conns.map(connToItem),
    ...a.parts.emails.map(emailToItem),
    ...a.parts.sms,
    ...a.parts.support,
    ...a.parts.cityMsgs,
    ...a.parts.touches,
    ...(feeds.activity.get(seekerId) ?? []).map(activityToItem),
    ...(a.lead ? [cityLeadToItem(a.lead)] : []),
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
  for (const r of rows) {
    const st = stateOf(r);
    out.push(`## ${r.label} — ${st.phrase}${st.age ? ` (${st.age})` : ""}`);
    const detail = detailLine(r);
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
