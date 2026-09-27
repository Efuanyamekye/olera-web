/**
 * Care-seeker relationships — shared types and vocabulary.
 *
 * The family counterpart to lib/touches/types.ts. Same three invariants as the
 * provider touch log (migration 205):
 *
 *   1. No stage, no pipeline, no score. Everything on the list is derived at
 *      read time and never stored.
 *   2. Every row says how it knows — which table it came from.
 *   3. System sends stay in email_log; they are merged, never copied.
 *
 * Four things here have no provider equivalent, because a family is not a
 * business:
 *
 *   - REACHABILITY. Provider contact details come from a business listing.
 *     Family details are typed one-handed on a phone, so "we cannot reach them"
 *     is a different state from "they have gone quiet" and must not be filed
 *     under the same flag.
 *   - CONSENT. A provider is a business you may keep emailing. A family has
 *     TCPA consent, quiet hours, a do_not_contact kill switch, and in concierge
 *     cities a checkbox that names Olera and nobody else.
 *   - BLOCKED-ON. A provider's next action is always ours. A family is often
 *     waiting on a provider to call them back, which is a real state with a
 *     real clock and is not our move.
 *   - EPISODE. A provider relationship is permanent. A family relationship is
 *     an episode that opens and closes, so quiet may mean resolved.
 */

import type { TouchChannel, TouchDirection, TouchSource } from "@/lib/touches/types";
import { TOUCH_DIRECTIONS, TOUCH_SOURCES } from "@/lib/touches/types";

export type { TouchChannel, TouchDirection, TouchSource };
// Re-exported as values so the API can validate against them without reaching
// past this module into the provider vocabulary.
export { TOUCH_DIRECTIONS, TOUCH_SOURCES };

/**
 * Channels a family touch can be logged on. "note" has no provider equivalent:
 * it is for something that happened without a conversation — a voicemail we
 * could not leave, what a neighbour said, a decision recorded.
 */
export const FAMILY_TOUCH_CHANNELS = ["call", "text", "email", "meeting", "in_app", "note"] as const;
export type FamilyTouchChannel = (typeof FAMILY_TOUCH_CHANNELS)[number];

export const FAMILY_CHANNEL_LABEL: Record<FamilyTouchChannel, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  meeting: "Meeting",
  in_app: "In app",
  note: "Note",
};

/** A row of family_touches (migration 230). */
export type FamilyTouchRow = {
  id: string;
  seeker_id: string;
  channel: FamilyTouchChannel;
  direction: TouchDirection;
  occurred_at: string;
  /** TRUE only when we actually spoke to them. See the migration comment. */
  reached: boolean | null;
  summary: string;
  detail: string | null;
  contact_name: string | null;
  contact_handle: string | null;
  source: TouchSource;
  source_ref: string | null;
  next_action: string | null;
  next_action_due: string | null;
  next_action_owner: string | null;
  next_action_done_at: string | null;
  author: string;
  admin_user_id: string | null;
  created_at: string;
};

/** What the API accepts on POST. */
export type FamilyTouchInput = {
  seeker_id: string;
  channel: FamilyTouchChannel;
  direction: TouchDirection;
  occurred_at?: string;
  reached?: boolean | null;
  summary: string;
  detail?: string | null;
  contact_name?: string | null;
  contact_handle?: string | null;
  source?: TouchSource;
  source_ref?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  next_action_owner?: string | null;
};

/** The one open next action for a family, if there is one. */
export type SeekerOpenAction = {
  touch_id: string;
  text: string;
  due: string | null;
  owner: string | null;
  declared_at: string;
};

/** Where a family timeline row was read from. */
export type SeekerTimelineSource = TouchSource | "twilio" | "city";

/**
 * One line on a family's timeline.
 *
 * touch    = family_touches (a person logged it) — phase 2, not yet written
 * email    = email_log (system sends, email and SMS, with delivery state)
 * support  = support_email_messages (anything through support@)
 * sms      = sms_inbound (a text to the Olera number)
 * inquiry  = connections (the inquiry, and which provider it went to)
 * city     = city_leads / city_lead_messages (the concierge path)
 * activity = seeker_activity (what they did on the site)
 */
export type SeekerTimelineKind =
  | "touch"
  | "email"
  | "support"
  | "sms"
  | "inquiry"
  | "city"
  | "activity";

export type SeekerTimelineItem = {
  id: string;
  kind: SeekerTimelineKind;
  /** out = we did it, in = they did it, system = the application did it */
  actor: "out" | "in" | "system";
  channel: TouchChannel | "system";
  occurred_at: string;
  title: string;
  detail: string | null;
  source: SeekerTimelineSource;
  /** delivered / opened / failed / bounced, or "needs reply" on unanswered inbound. */
  status?: string | null;
  contact_handle?: string | null;
  /** Where to go to act on it (the support inbox, the SMS inbox, the city queue). */
  href?: string | null;
  /**
   * Who wrote it, when that is not us or the family: a provider writing in the
   * shared thread (city_lead_thread). The case page draws these as the
   * provider's messages rather than as system events.
   */
  author?: "provider" | null;
  author_name?: string | null;
  /**
   * A system send a person actually typed (an admin_reply from the SMS inbox).
   * The row stays actor "system" so the list's counts do not move; the case
   * page uses this so it never labels a person's words as automatic.
   */
  sent_by_person?: boolean;
  /** The whole message when `title` is clipped for the list. The case page reads this. */
  full_text?: string | null;
  /** Olera's care team wrote this into a family–provider conversation. */
  olera_post?: boolean;
  /** The connection a conversation message belongs to, so the case page can reply into it. */
  connection_id?: string | null;
};

// ── Reachability ──────────────────────────────────────────────────────────────

/**
 * Per-channel reachability.
 *
 *   ok         — we have it and nothing says it is broken
 *   none       — we never got one
 *   impossible — structurally not a real address/number (see isImpossibleUsPhone)
 *   bounced    — the provider of record rejected it
 *   opted_out  — on do_not_contact
 */
export type ChannelReach = "ok" | "none" | "impossible" | "bounced" | "opted_out";

export type Reachability = {
  phone: ChannelReach;
  email: ChannelReach;
  /** Channels actually usable right now. Empty means unreachable. */
  open: ("phone" | "email")[];
  /** One line saying why, when something is wrong. */
  note: string | null;
};

// ── Consent ───────────────────────────────────────────────────────────────────

/**
 * What we are allowed to do, as distinct from what we have done.
 *
 *   olera_only — a concierge-city lead. The checkbox they ticked names Olera
 *                and nobody else, so their details may NOT be handed to a
 *                provider except through the relay, which introduces us rather
 *                than handing over a phone number to call cold. A REPLY to the
 *                qualifying text is what releases routing, not a phone call
 *                from us; a call is a courtesy that runs alongside it.
 *   provider_ok — they asked us to contact a provider, so a handoff is covered.
 *   opted_out   — do_not_contact. No channel.
 *   unknown     — no consent record we can read. Treat as olera_only in practice.
 */
export type ConsentScope = "olera_only" | "provider_ok" | "opted_out" | "unknown";

// ── Episode ───────────────────────────────────────────────────────────────────

/**
 * A family relationship is an episode, not an account.
 *
 *   open      — something happened recently and it is unresolved
 *   waiting   — unresolved, but the ball is with a provider, not with us
 *   dormant   — nothing for a while and no outcome recorded. May be resolved,
 *               may be lost; we genuinely cannot tell, and the word says so.
 *   closed    — a terminal outcome exists: they told us it worked, told us it
 *               did not, or opted out.
 */
export type EpisodeState = "open" | "waiting" | "dormant" | "closed";

export type Episode = {
  state: EpisodeState;
  /** First signal of this episode. */
  opened_at: string | null;
  /** Days since the episode opened. */
  age_days: number | null;
  /** Who we are waiting on, when state is "waiting". */
  blocked_on: string | null;
  /** How it ended, when state is "closed". */
  closed_reason: string | null;
};

// ── Flags ─────────────────────────────────────────────────────────────────────

export type SeekerFlag =
  /** They wrote to us and nobody has answered. Most urgent thing on the list. */
  | "awaiting_reply"
  /** No working channel at all. Not the same as quiet. */
  | "unreachable"
  /** On do_not_contact. */
  | "opted_out"
  /**
   * A pending inquiry past the cold threshold with no non-auto message in the
   * on-platform thread. NOT proof the provider ignored them: most providers
   * answer by phone or email, which we cannot see. Read it as "nothing has come
   * back through any channel we can observe", never as blame.
   */
  | "provider_silent"
  /** They told us how it went and the connection row still says "pending". */
  | "provider_no_show"
  /** Nobody from Olera has ever said anything to them by hand. */
  | "never_human"
  /** display_name is a placeholder, so the row has nothing to call itself. */
  | "no_name"
  /** A concierge city lead we promised to call and have not reached. */
  | "promise_owed"
  /**
   * Called three times and never reached. Takes the place of promise_owed:
   * a fourth call on the same pattern is not the next step, a last written
   * message and an archive is.
   */
  | "tried_three";

export const SEEKER_FLAG_LABEL: Record<SeekerFlag, string> = {
  awaiting_reply: "they wrote, no reply yet",
  unreachable: "no way to reach them",
  opted_out: "opted out",
  provider_silent: "no reply on file",
  provider_no_show: "provider never got back to them",
  never_human: "only ever got automated email",
  no_name: "no name on file",
  promise_owed: "promised a call",
  tried_three: "called 3 times, no answer",
};

// ── Rows ──────────────────────────────────────────────────────────────────────

export type SeekerContact = {
  seeker_id: string;
  /** What to call this row. See lib/seeker-touches/label.ts. */
  label: string;
  /** True when `label` is a fallback, not a name they gave us. */
  label_is_fallback: boolean;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  /** "immediate" / "within_1_month" / "exploring", from profile metadata. */
  timeline: string | null;
  /** What they said they were dealing with, verbatim, clipped. */
  situation: string | null;
  /** "Medicaid", "Private pay", … as they selected. */
  payment: string[];
};

export type LastSeekerTouch = {
  occurred_at: string;
  channel: TouchChannel | "system";
  actor: "out" | "in" | "system";
  source: SeekerTimelineSource;
  title: string;
  status?: string | null;
};

/** One row of the care-seeker Relationships list. Everything here is derived. */
export type SeekerRelationshipRow = SeekerContact & {
  last_touch: LastSeekerTouch | null;
  last_human_touch_at: string | null;
  human_touch_count: number;
  days_quiet: number | null;
  reach: Reachability;
  consent: ConsentScope;
  episode: Episode;
  flags: SeekerFlag[];
  /** Providers this family has an open inquiry with, newest first. */
  providers: { id: string; name: string; at: string; responded: boolean; connection_id?: string }[];
  /** The city lead behind this family, when they came in that way. */
  city_lead_id: string | null;
  city_slug: string | null;
  /** The latest declared next action that nobody has marked done. */
  open_action: SeekerOpenAction | null;
  /** True once a logged touch says we actually spoke to them. */
  ever_reached: boolean;
  /**
   * When a missed call parks this family, the moment they come back to "Call
   * them". Null when no attempt in the last 24 hours failed to reach them.
   */
  call_retry_at: string | null;
  /** Logged calls that did not reach them, since nobody ever has. */
  missed_calls: number;
  /** Their newest text or support email, so a reply row shows what they said. */
  last_inbound: { occurred_at: string; channel: string; title: string; detail: string | null } | null;
  /**
   * A person decided this row is not a case to work. Null for everyone else.
   *
   * Not suppression and not erasure: it says nobody needs to act, never that we
   * may not write to them. An archived row carries no work flags and sits out
   * of every queue, which is the whole point — "Test McTest" held the top of
   * "Reply to them" for 1,098 days because a test message genuinely has no
   * reply, and no event would ever have said otherwise.
   */
  archived: { reason: string; note: string | null; at: string } | null;
  /**
   * Where this family came from, derived at read time.
   *
   * DELIBERATELY NOT "organic" for the broad bucket. A connection records
   * nothing about acquisition — every metadata key on all 1,431 inquiries is
   * lifecycle state, with no campaign, referrer or UTM anywhere — so a family
   * who clicked an ad and then enquired from a provider page is
   * indistinguishable from one who arrived by search. "provider_page" says
   * what we observed. "organic" would be a claim we cannot support, and it is
   * the kind of number that gets quoted later.
   *
   * Ad Boost is the narrowest and least complete: attribution lives on the
   * PROVIDER side, and only 14 lead_received rows in the whole database carry
   * it. Treat a paid count as a floor, never a total.
   */
  origin: "city_ad" | "ad_boost" | "benefits" | "provider_page" | "unknown";
  /**
   * What they told us when we asked "did the provider get back to you?".
   *
   * Already structured, already stored, arriving by one click from an email.
   * It was never something a person needed to transcribe — the queue that
   * asked them to was reading a flag that fires on ANY answer, because it
   * compared against connections.status, which is the in-app accept state and
   * has never moved off pending for a single inquiry.
   *
   * "yes" means the provider GOT BACK TO THEM. It does not mean placed, and it
   * does not mean they chose that provider. Do not label it "matched".
   */
  outcome: { value: "yes" | "not_yet" | "no"; at: string } | null;
};

export type SeekerRelationship = {
  profile: SeekerContact;
  reach: Reachability;
  consent: ConsentScope;
  episode: Episode;
  flags: SeekerFlag[];
  providers: { id: string; name: string; at: string; responded: boolean; connection_id?: string }[];
  city_lead_id: string | null;
  city_slug: string | null;
  open_action: SeekerOpenAction | null;
  ever_reached: boolean;
  items: SeekerTimelineItem[];
  /** See SeekerRelationshipRow.archived. */
  archived: { reason: string; note: string | null; at: string } | null;
  /** See SeekerRelationshipRow.origin. */
  origin: SeekerRelationshipRow["origin"];
  /** See SeekerRelationshipRow.outcome. */
  outcome: SeekerRelationshipRow["outcome"];
};

// ── What a logged note was read to contain ───────────────────────────────────

/** The fields worth having, in the order they read on screen. */
export const HEARD_FIELDS = [
  "care_for",
  "relationship",
  "care_type",
  "care_zip",
  "interim_location",
  "hours",
  "transfers",
  "payment",
  "starts",
  "budget",
] as const;

export type HeardField = (typeof HEARD_FIELDS)[number];

export const HEARD_LABEL: Record<HeardField, string> = {
  care_for: "for",
  relationship: "relation",
  care_type: "care",
  care_zip: "where",
  interim_location: "interim",
  hours: "hours",
  transfers: "transfers",
  payment: "paying",
  starts: "starts",
  budget: "budget",
};

export type HeardValue = {
  /** Short display string. Null means the note did not mention it. */
  value: string | null;
  /** False renders as a guess to be checked rather than a fact. */
  sure: boolean;
};

export type Heard = {
  fields: Partial<Record<HeardField, HeardValue>>;
  /** Verbatim fragments worth carrying that no field covers. */
  also_noted: string[];
  /** Set when a person edited a field by hand; those are never overwritten. */
  edited_fields?: HeardField[];
  extracted_at: string;
  model: string;
};

// ── Fields with a fixed vocabulary ───────────────────────────────────────────

/**
 * Three of the ten details are matched against something rather than merely
 * read, so they carry codes instead of prose.
 *
 * `care_type` uses the SAME four values the city pool already routes on, not a
 * new list beside it. A field that decides which providers are eligible cannot
 * be free text: "home care" typed into a box never equals `home_care`, and the
 * router is left unable to read something we plainly know, which is the exact
 * defect this whole feature exists to close.
 *
 * `transfers` is bounded and ordered, and it is the question that decides
 * whether an agency says yes. As prose, "needs 2 ppl" and "two people" never
 * aggregate and you can never count what you are losing on it.
 *
 * `payment` is the only MULTI field. Private pay now with Medicaid pending is
 * a real and common state that one value cannot hold.
 *
 * Everything else stays prose on purpose. Nothing matches on a name, a ZIP or a
 * start date, the long tail is real, and "late October or early November" is
 * more honest than a date picker forcing a precision the family did not give.
 */
export type HeardOption = { code: string; label: string };

export const HEARD_OPTIONS: Partial<Record<HeardField, HeardOption[]>> = {
  care_type: [
    { code: "home_care", label: "Home care" },
    { code: "assisted_living", label: "Assisted living" },
    { code: "medical", label: "Nursing / medical" },
    { code: "unsure", label: "Not decided" },
  ],
  transfers: [
    { code: "independent", label: "Independent" },
    { code: "standby", label: "Standby help" },
    { code: "one_person", label: "One person" },
    { code: "two_people", label: "Two people" },
    { code: "lift", label: "Lift required" },
  ],
  payment: [
    { code: "private_pay", label: "Private pay" },
    { code: "medicaid", label: "Medicaid" },
    { code: "medicare", label: "Medicare" },
    { code: "ltc_insurance", label: "LTC insurance" },
    { code: "va", label: "VA" },
    { code: "unsure", label: "Not sure" },
  ],
};

/** Fields that may hold more than one code, stored comma-separated. */
export const HEARD_MULTI: HeardField[] = ["payment"];

/** Codes in, prose out. Unknown codes render as themselves rather than vanish. */
export function heardDisplay(field: HeardField, value: string): string {
  const options = HEARD_OPTIONS[field];
  if (!options) return value;
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => options.find((o) => o.code === c)?.label ?? c)
    .join(" + ");
}

/** Keeps only codes this field knows, so a bad value is dropped, never stored. */
export function heardCanonical(field: HeardField, value: string): string | null {
  const options = HEARD_OPTIONS[field];
  if (!options) return value.trim() || null;
  const allowed = new Set(options.map((o) => o.code));
  const codes = value
    .split(",")
    .map((c) => c.trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .filter((c) => allowed.has(c));
  const unique = [...new Set(codes)];
  if (!unique.length) return null;
  return (HEARD_MULTI.includes(field) ? unique : unique.slice(0, 1)).join(",");
}

/**
 * The care details recorded from calls, as one line a provider can act on.
 *
 * NOT the call notes. A family who never texted back has this saved text shown
 * to providers as their reply (exchange.server.ts), and notes are written for
 * us: Helen Garner's only "reached" note is a call to Assisting Hands quoting
 * their hourly rate, which would have gone to their competitor. These fields
 * are the structured who, what and where the log form already extracts, and a
 * person has usually corrected them. Budget is left out on purpose.
 */
export function careSummary(heard: Heard | null): string | null {
  const f = heard?.fields;
  if (!f) return null;
  const v = (k: keyof typeof f) => {
    const raw = f[k]?.value?.trim();
    return raw ? heardDisplay(k, raw) : null;
  };
  const who = v("care_for");
  const rel = v("relationship");
  const parts = [
    who || rel ? `For ${rel ? `their ${rel}` : ""}${rel && who ? ", " : ""}${who ?? ""}` : null,
    v("care_type"),
    v("care_zip"),
    v("hours"),
    v("transfers") ? `transfers: ${v("transfers")}` : null,
    v("starts") ? `starts ${v("starts")}` : null,
    v("payment"),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ").slice(0, 2000) : null;
}
