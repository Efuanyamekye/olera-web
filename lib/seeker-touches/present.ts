/**
 * How a family row is put into words.
 *
 * One module so the screen and the markdown read the same, and so the wording
 * can be argued about in one place rather than in six template literals.
 *
 * THE RULE HERE IS PLAIN ENGLISH. The first version of this page used the
 * vocabulary of the schema — "episode", "dormant", "unreachable", a mono meta
 * line, five chip colours — and the column header had to be explained. A header
 * you have to ask about has failed. Every string below is something a person
 * would actually say out loud about a family.
 *
 * Pure and client-safe.
 */

import { SCHEDULE_TZ } from "@/lib/eastern-time";
import type { EpisodeState, Reachability, SeekerRelationshipRow } from "./types";

/** Red = do something now. Amber = they are waiting on us. None = nothing to do. */
export type Tone = "act" | "warn" | "none";

export type RowState = {
  /** What to show in the right-hand column. A phrase, not a status code. */
  phrase: string;
  tone: Tone;
  /** The small line under it: how long this has been true. */
  age: string | null;
};

const TIMELINE_WORD: Record<string, string> = {
  immediate: "needs care now",
  this_week: "needs care this week",
  within_1_month: "within a month",
  this_month: "within a month",
  within_3_months: "within three months",
  exploring: "planning ahead",
  planning: "planning ahead",
};

/** Plain-word version of the four episode states. "Dormant" meant nothing to anyone. */
export const EPISODE_WORD: Record<EpisodeState, string> = {
  open: "Open",
  waiting: "Providers have it",
  dormant: "Gone quiet",
  closed: "Closed",
};

function days(n: number | null | undefined, unit = "day"): string | null {
  if (n === null || n === undefined) return null;
  if (n <= 0) return "today";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The right-hand column. Order is the same priority the list sorts by, so the
 * phrase always names the most urgent true thing rather than the most recent.
 */
export function stateOf(r: SeekerRelationshipRow): RowState {
  const age = r.episode.age_days !== null ? `day ${r.episode.age_days + 1}` : null;
  const quiet = days(r.days_quiet);
  // Eastern, not UTC: a date typed as "due the 15th" must not turn red at 8pm
  // Eastern on the 14th, which is what toISOString() would do.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHEDULE_TZ }).format(new Date());

  // Archived outranks everything. With its work flags cleared an archived row
  // fell all the way through to "Open", so the Archived tab read "Open" on
  // every line and the text export said the same — the exact false claim the
  // archive was added to remove.
  if (r.archived) {
    return { phrase: "Archived", tone: "none", age: r.archived.reason.replace(/_/g, " ") };
  }
  // Opted out first, or it reads as "Waiting on us" in amber directly above a
  // line saying they asked us to stop. Four rows did exactly that.
  if (r.flags.includes("opted_out")) {
    return { phrase: "Opted out", tone: "none", age: quiet };
  }
  if (r.flags.includes("unreachable")) {
    return { phrase: "Can't reach them", tone: "act", age };
  }
  // Benefits work waiting on a person, most pressing first.
  if (r.benefits?.urgent_at) {
    return { phrase: "Urgent", tone: "act", age: quiet };
  }
  if (r.benefits?.help_due_at && r.benefits.help_overdue) {
    return { phrase: "Help overdue", tone: "act", age: quiet };
  }
  // A missed plan is our own doing and outranks everything except not being
  // able to contact them at all — telling someone to chase a family they
  // physically cannot reach is asking for the impossible.
  if (r.open_action?.due && r.open_action.due < today) {
    return { phrase: "Overdue", tone: "act", age: `was due ${r.open_action.due}` };
  }
  if (r.flags.includes("promise_owed")) {
    return { phrase: r.city_lead_id ? "Owed a call" : "Call them", tone: "act", age };
  }
  if (r.flags.includes("tried_three")) {
    return { phrase: "Close out", tone: "warn", age };
  }
  if (r.flags.includes("awaiting_reply")) {
    return { phrase: "Waiting on us", tone: "warn", age: quiet };
  }
  if (r.benefits?.help_due_at) {
    return { phrase: "Help due", tone: "warn", age: quiet };
  }
  if (r.benefits?.letter_to_read) {
    return { phrase: "Letter to read", tone: "warn", age: quiet };
  }
  // The age here is days since they ANSWERED, not days since we last heard
  // anything, because the answer is what puts the row in the queue and the
  // queue is capped at fourteen days from it. Showing quiet time instead would
  // put a row reading "2 days" next to one about to age out.
  if (r.flags.includes("provider_no_show")) {
    const n = r.outcome ? Math.floor((Date.now() - new Date(r.outcome.at).getTime()) / 86_400_000) : null;
    const said = n === null ? quiet : n <= 0 ? "said so today" : `said so ${days(n)} ago`;
    return { phrase: "Provider never replied", tone: "act", age: said };
  }
  if (r.flags.includes("check_provider") && r.handed_to) {
    return { phrase: "Check with provider", tone: "warn", age: handedAge(r.handed_to.at) };
  }
  if (r.episode.state === "closed") {
    // The reason goes in the small line. "Closed — no connection formed" is 29
    // characters and wrapped to three lines in the state column.
    return { phrase: "Closed", tone: "none", age: r.episode.closed_reason ?? quiet };
  }
  if (r.episode.state === "waiting") {
    // "No reply ON FILE", not "no provider reply". The distinction is load
    // bearing. provider_silent is derived from the absence of a non-auto
    // message in the on-platform thread, and providers overwhelmingly answer
    // families by phone or email, which we cannot see. Measured 15 Sep over 397
    // inquiries in 45 days: 52% have neither a thread nor a family self-report,
    // so we know nothing about them at all. Where there IS a visible
    // conversation it runs 52 provider-silent to 7 family-silent, so the lean
    // is real — but the page must not assert blame on an absence of evidence.
    if (r.flags.includes("provider_silent")) return { phrase: "No reply on file", tone: "none", age: quiet };
    const n = r.providers.length;
    return { phrase: n > 1 ? "Providers have it" : "Provider has it", tone: "none", age: quiet };
  }
  if (r.episode.state === "dormant") {
    return { phrase: "Gone quiet", tone: "none", age: quiet };
  }
  if (r.flags.includes("provider_silent")) {
    return { phrase: "No reply on file", tone: "none", age: quiet };
  }
  return { phrase: "Open", tone: "none", age };
}

/**
 * The one muted line under the name. Everything a glance needs and nothing a
 * glance doesn't: where, how urgent, how they'd pay, where they came from.
 */
/**
 * How they arrived, in words. "Provider page" rather than "Organic": a
 * connection records nothing about acquisition, so we know they enquired from
 * a provider page and nothing about how they reached it.
 */
export const ORIGIN_LABEL: Record<SeekerRelationshipRow["origin"], string> = {
  city_ad: "City ad",
  ad_boost: "Ad Boost",
  benefits: "Benefits",
  provider_page: "Provider page",
  unknown: "Unknown",
};

export function detailLine(r: SeekerRelationshipRow): string {
  const bits: string[] = [];

  const place = [r.city, r.state].filter(Boolean).join(" ");
  if (place) bits.push(place);

  const when = r.timeline ? TIMELINE_WORD[r.timeline] ?? r.timeline.replace(/_/g, " ") : null;
  if (when) bits.push(when);

  if (r.payment.length) bits.push(r.payment.join(", "));


  if (r.label_is_fallback) bits.push("no name on file");

  if (r.episode.state === "waiting" && r.providers.length) {
    const n = r.providers.length;
    bits.push(n === 1 ? `${r.providers[0].name} has their request` : `${n} providers have their request`);
  }

  return bits.join(" · ");
}

/** Why we cannot get hold of them, said the way you would say it. */
function reachProblem(reach: Reachability): string | null {
  const phoneBad = reach.phone === "impossible";
  const phoneMissing = reach.phone === "none";
  const emailBad = reach.email === "bounced";
  const emailMissing = reach.email === "none";

  if (phoneBad && emailBad) return "Phone isn't a real number, email bounced.";
  if (phoneBad && emailMissing) return "Phone isn't a real number and there's no email.";
  if (emailBad && phoneMissing) return "Email bounced and there's no phone number.";
  if (phoneBad) return "Phone isn't a real number.";
  if (emailBad) return "Email bounced.";
  if (phoneMissing && emailMissing) return "No phone or email on file.";
  return null;
}

/**
 * The third line — and most rows never get one.
 *
 * That is the whole point: a row is one line when nothing is wrong and two when
 * something is, so the shape of the list is visible before any of it is read.
 */
export function problemLine(r: SeekerRelationshipRow): string | null {
  // Nothing is owed to someone who asked us to stop, whatever else is true of
  // them. This has to come first: several opted-out families also carry an
  // unanswered support thread.
  if (r.flags.includes("opted_out")) return null;

  if (r.flags.includes("unreachable")) {
    const why = reachProblem(r.reach);
    const owed = r.flags.includes("promise_owed") ? "Promised a call. " : "";
    return why ? `${owed}${why}` : `${owed}No working way to contact them.`.trim();
  }

  // Benefits work waiting on a person (lib/benefits/queue-signals.ts). An
  // urgent answer and a help request outrank an unanswered message: they are
  // the family telling us they are stuck or in trouble, not asking a question.
  if (r.benefits?.urgent_at) return "Told us something is urgent at home. Nobody has reached them since.";
  if (r.benefits?.help_due_at) {
    const d = shortEt(r.benefits.help_due_at);
    return r.benefits.help_overdue ? `Asked for a person. Overdue since ${d}.` : `Asked for a person. Due ${d}.`;
  }

  if (r.flags.includes("tried_three")) {
    return `Called ${r.missed_calls} times, never reached. Text them twice on different days, then archive as Never answered.`;
  }


  if (r.flags.includes("promise_owed")) {
    // A provider-page family was never promised anything: they asked a
    // provider, and we call to check that provider is looking after them.
    if (!r.city_lead_id) {
      return `Asked ${r.providers[0]?.name ?? "a provider"} about care. Call to check they're being looked after.`;
    }
    if (r.reach.note) return `Promised a call. ${capitalise(r.reach.note)}.`;
    return "Promised a call, still not reached.";
  }

  if (r.flags.includes("awaiting_reply")) {
    return "Wrote to us and nobody has replied.";
  }

  if (r.flags.includes("provider_no_show")) {
    return "Told us the provider never got back to them.";
  }

  if (r.flags.includes("check_provider")) return checkLine(r);

  if (r.benefits?.letter_to_read) {
    return r.benefits.letter_reason ? `Letter waiting for your read: ${r.benefits.letter_reason}.` : "Letter waiting for your read.";
  }

  return null;
}

/**
 * The Check with the provider queue's own line. A family in that queue often
 * carries a more urgent flag too (a call we owe them), and the row normally
 * shows the most urgent thing, so without this five of the first nine rows
 * never named the provider to ask. Inside that queue, the queue's question wins.
 */
export function checkLine(r: SeekerRelationshipRow): string | null {
  if (!r.handed_to) return null;
  return `With ${r.handed_to.name} since ${shortEt(r.handed_to.at)}. Ask them how it went and log what they said.`;
}

export function handedAge(at: string): string {
  const n = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return `handed over ${days(n)} ago`;
}

function shortEt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
}

/**
 * The plan, when there is one. Rendered apart from the problem line because a
 * thing you meant to do and a thing that is wrong are different colours of
 * information, and a family can easily have both.
 */
export function nextLine(r: SeekerRelationshipRow): string | null {
  if (!r.open_action) return null;
  const due = r.open_action.due ? ` — due ${r.open_action.due}` : "";
  return `Next: ${r.open_action.text}${due}`;
}

/**
 * A family parked by a missed call, said with when they come back. Without it
 * the row would drop out of "Call them" with no trace of why.
 */
export function retryLine(r: SeekerRelationshipRow, now: Date = new Date()): string | null {
  if (!r.call_retry_at || r.flags.includes("opted_out")) return null;
  const at = new Date(r.call_retry_at);
  if (at.getTime() <= now.getTime()) return null;
  const when = at.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
  return `Missed call logged. Back in Call them ${when} ET.`;
}

/** What we're allowed to do, when it restricts us. Silent when it doesn't. */
export function consentWarning(r: SeekerRelationshipRow): string | null {
  if (r.consent === "olera_only") return "Olera only — providers hear about them from us, never the reverse";
  if (r.consent === "opted_out") return "Asked us to stop contacting them";
  return null;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
