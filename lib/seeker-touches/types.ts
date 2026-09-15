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
 *                provider without a spoken yes (see the city-ads consent gap).
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
  | "outcome_reported"
  /** Nobody from Olera has ever said anything to them by hand. */
  | "never_human"
  /** display_name is a placeholder, so the row has nothing to call itself. */
  | "no_name"
  /** A concierge city lead we promised to call and have not reached. */
  | "promise_owed";

export const SEEKER_FLAG_LABEL: Record<SeekerFlag, string> = {
  awaiting_reply: "they wrote, no reply yet",
  unreachable: "no way to reach them",
  opted_out: "opted out",
  provider_silent: "no reply on file",
  outcome_reported: "they told us how it went",
  never_human: "never had a human touch",
  no_name: "no name on file",
  promise_owed: "promised a call",
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
  providers: { id: string; name: string; at: string; responded: boolean }[];
  /** The city lead behind this family, when they came in that way. */
  city_lead_id: string | null;
  city_slug: string | null;
  /** The latest declared next action that nobody has marked done. */
  open_action: SeekerOpenAction | null;
  /** True once a logged touch says we actually spoke to them. */
  ever_reached: boolean;
};

export type SeekerRelationship = {
  profile: SeekerContact;
  reach: Reachability;
  consent: ConsentScope;
  episode: Episode;
  flags: SeekerFlag[];
  providers: { id: string; name: string; at: string; responded: boolean }[];
  city_lead_id: string | null;
  city_slug: string | null;
  open_action: SeekerOpenAction | null;
  ever_reached: boolean;
  items: SeekerTimelineItem[];
};
