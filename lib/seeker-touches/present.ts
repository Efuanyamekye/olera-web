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

  // Opted out first, or it reads as "Waiting on us" in amber directly above a
  // line saying they asked us to stop. Four rows did exactly that.
  if (r.flags.includes("opted_out")) {
    return { phrase: "Opted out", tone: "none", age: quiet };
  }
  if (r.flags.includes("unreachable")) {
    return { phrase: "Can't reach them", tone: "act", age };
  }
  // A missed plan is our own doing and outranks everything except not being
  // able to contact them at all — telling someone to chase a family they
  // physically cannot reach is asking for the impossible.
  if (r.open_action?.due && r.open_action.due < today) {
    return { phrase: "Overdue", tone: "act", age: `was due ${r.open_action.due}` };
  }
  if (r.flags.includes("promise_owed")) {
    return { phrase: "Owed a call", tone: "act", age };
  }
  if (r.flags.includes("awaiting_reply")) {
    return { phrase: "Waiting on us", tone: "warn", age: quiet };
  }
  if (r.flags.includes("outcome_reported") && r.episode.state !== "closed") {
    return { phrase: "Outcome reported", tone: "warn", age: quiet };
  }
  if (r.episode.state === "closed") {
    // The reason goes in the small line. "Closed — no connection formed" is 29
    // characters and wrapped to three lines in the state column.
    return { phrase: "Closed", tone: "none", age: r.episode.closed_reason ?? quiet };
  }
  if (r.episode.state === "waiting") {
    // A provider holding a request and a provider ignoring one are different
    // facts, and 260 rows were showing the first while meaning the second. The
    // phrase carries it; the rail deliberately does not, because amber on 260
    // rows is the chip problem again in another colour.
    if (r.flags.includes("provider_silent")) return { phrase: "No provider reply", tone: "none", age: quiet };
    const n = r.providers.length;
    return { phrase: n > 1 ? "Providers have it" : "Provider has it", tone: "none", age: quiet };
  }
  if (r.episode.state === "dormant") {
    return { phrase: "Gone quiet", tone: "none", age: quiet };
  }
  if (r.flags.includes("provider_silent")) {
    return { phrase: "No provider reply", tone: "none", age: quiet };
  }
  return { phrase: "Open", tone: "none", age };
}

/**
 * The one muted line under the name. Everything a glance needs and nothing a
 * glance doesn't: where, how urgent, how they'd pay, where they came from.
 */
export function detailLine(r: SeekerRelationshipRow): string {
  const bits: string[] = [];

  const place = [r.city, r.state].filter(Boolean).join(" ");
  if (place) bits.push(place);

  const when = r.timeline ? TIMELINE_WORD[r.timeline] ?? r.timeline.replace(/_/g, " ") : null;
  if (when) bits.push(when);

  if (r.payment.length) bits.push(r.payment.join(", "));

  if (r.city_lead_id) bits.push("came from a city ad");

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

  if (r.flags.includes("promise_owed")) {
    if (r.reach.note) return `Promised a call. ${capitalise(r.reach.note)}.`;
    return "Promised a call, still not reached.";
  }

  if (r.flags.includes("awaiting_reply")) {
    return "Wrote to us and nobody has replied.";
  }

  if (r.flags.includes("outcome_reported") && r.episode.state !== "closed") {
    return "Told us how it went. The request is still marked open.";
  }

  return null;
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

/** What we're allowed to do, when it restricts us. Silent when it doesn't. */
export function consentWarning(r: SeekerRelationshipRow): string | null {
  if (r.consent === "olera_only") return "Olera only — needs a spoken yes before any handoff";
  if (r.consent === "opted_out") return "Asked us to stop contacting them";
  return null;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
