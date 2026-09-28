import type { SeekerRelationshipRow } from "@/lib/seeker-touches/types";

/**
 * TABS ARE ACTIONS, NOT STATES.
 *
 * "Waiting on us" held 72 families across four unrelated jobs: answer a text,
 * make a promised call, write down an outcome somebody already gave us, and
 * fix a broken phone number. Working it meant re-deciding what KIND of task
 * each row was, one row at a time, seventy-two times. Splitting on the
 * physical action is what turns the list into a shift somebody can finish.
 *
 * "Providers have it" is deliberately NOT here. It was 295 rows, four times
 * the size of every real queue combined, and there is no action attached to
 * any of them: it means "we handed this over and have never seen what
 * happened", which is a measurement, not a job. Presenting it as a tab beside
 * genuine work implied the two were the same kind of thing and made the board
 * open feeling hopeless. It lives in the strip above as a number instead.
 *
 * "Chase a provider" was tried here and removed for the same reason, which is
 * worth recording because it looked like a real queue. provider_silent is 307
 * rows: past the cold threshold with nothing observable back. Putting a verb
 * on it does not make it workable, and nobody is chasing three hundred
 * agencies. The genuinely actionable version of that signal is the family
 * themselves telling us the provider never got back to them, which is what
 * the "Provider never got back to them" queue holds.
 *
 * That queue replaced "Write down what they told us", which was a defect
 * wearing a verb. It fired whenever a family answered the outcome email AND
 * connections.status still read pending — but status is the in-app accept
 * state and has never moved off pending for a single one of 1,431 inquiries,
 * so the flag fired on every answer ever given, including "yes". It asked a
 * person to transcribe an answer that was already stored, structured, on the
 * connection. Nothing needed writing down. What is worth a human is the
 * subset who said NO, and only while it is still fresh enough to act on:
 * capped at fourteen days, which covers eleven of the thirty-seven answers on
 * record. Uncapped it would be a monument, not a queue — the average "no" is
 * thirty-eight days old and there is nothing useful to say to a family about
 * a referral from last quarter.
 */
export type Tab = "urgent" | "reply" | "letter" | "help" | "call" | "follow" | "close" | "record" | "reach" | "all" | "archived";

export const TABS: { key: Tab; label: string }[] = [
  { key: "urgent", label: "Urgent" },
  { key: "reply", label: "Reply to them" },
  { key: "letter", label: "Letter to read" },
  { key: "help", label: "Help due" },
  { key: "call", label: "Call them" },
  { key: "follow", label: "Follow up" },
  { key: "close", label: "Tried 3 times" },
  { key: "record", label: "Provider never got back to them" },
  { key: "reach", label: "Fix how we reach them" },
  { key: "all", label: "All" },
  { key: "archived", label: "Archived" },
];

export const TAB_BLURB: Record<Tab, string> = {
  urgent: "They told the text companion something is urgent (a shutoff, no food, losing housing) in the last week, and nobody has reached them since.",
  letter: "A first-step letter the verdict held for a person to read. Open the case and read it in the Benefits section.",
  help: "They asked for a person (STUCK or \"I'd like help\"). Overdue ones first.",
  reply: "They wrote to us and nobody has answered.",
  call: "We promised a call and have not reached them. A logged missed call parks them for 24 hours.",
  follow: "Tried and waiting, or a next step is set. A missed call comes back to Call them after 24 hours.",
  close: "Called three times and never reached. Send one last text or email, then archive as Never answered.",
  record: "They told us the provider never got back to them, in the last two weeks.",
  reach: "No working phone or email, so nothing we send can land.",
  all: "Everyone with a live episode in the window.",
  archived: "Rows a person decided are not cases. Nothing here is in any queue.",
};

export function matches(r: SeekerRelationshipRow, tab: Tab): boolean {
  // An archived row appears in exactly one place. It carries no work flags
  // either, so the queues below would skip it anyway; this is what keeps it out
  // of "All", where it would otherwise sit forever looking like a live case.
  if (r.archived) return tab === "archived";
  if (tab === "archived") return false;
  // Opted out never appears in a work queue: there is no channel left to act
  // on, so it only pads the lists meant to be finished.
  if (tab !== "all" && r.flags.includes("opted_out")) return false;
  switch (tab) {
    // The three benefits queues (2026-09-28). These are about the family's
    // benefits work, not their messages, so they are read off r.benefits.
    case "urgent":
      return Boolean(r.benefits?.urgent_at);
    // Not for a family we cannot reach: the letter has nowhere to land, so
    // they belong in "Fix how we reach them" first.
    case "letter":
      return Boolean(r.benefits?.letter_to_read) && !r.flags.includes("unreachable");
    case "help":
      return Boolean(r.benefits?.help_due_at);
    case "reply":
      return r.flags.includes("awaiting_reply");
    case "call":
      return r.flags.includes("promise_owed");
    case "close":
      return r.flags.includes("tried_three");
    // WHERE A LOGGED CALL GOES. Ces logged calls and watched the families
    // vanish from "Call them" with nowhere to find them: a missed call parks
    // them for a day, and a dated next step takes them off the list too. Both
    // are families someone is actively working, so they get their own place.
    case "follow":
      return Boolean(r.call_retry_at) || Boolean(r.open_action);
    case "record":
      return r.flags.includes("provider_no_show");
    case "reach":
      return r.flags.includes("unreachable");
    default:
      return true;
  }
}

/** Everything with an action attached, for the "nothing is waiting" case. */
export function openWorkCount(rows: SeekerRelationshipRow[]): number {
  return rows.filter((r) => TABS.some((t) => t.key !== "all" && t.key !== "archived" && matches(r, t.key))).length;
}
