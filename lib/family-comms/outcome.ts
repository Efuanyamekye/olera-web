/**
 * Per-family OUTCOME — the Phase 0 measurement layer for Family Comms v2.
 *
 * The dashboard has always counted sends (deliver → open → click). The north
 * star is *connections, with graceful guidance when no connection forms* — so
 * we also need to know, per family, WHERE they landed. This is that: a pure
 * derivation over signals we already capture (no new schema, no writes).
 *
 * Four states, a clean partition of every family that has inquired:
 *   - connected — a real match formed (the north star). Provider engaged /
 *                 accepted on-platform, OR the family self-reported "yes, they
 *                 got back to me" (the off-platform truth the sensor captures).
 *   - active    — still inside the matchmaking window: a fresh inquiry, no
 *                 provider response yet, the sensor hasn't flipped. Give it room.
 *   - guided    — matchmaking stalled, but the family engaged the guidance
 *                 journey (compare / guide / benefits). Not a connection, but
 *                 not a dead end either.
 *   - stalled   — aged out, provider silent, no guidance engagement. The
 *                 graceful-failure set v2 exists to shrink.
 *
 * The sensor ("did the provider respond?") is the conceptual switch between
 * Matchmaking (connected/active) and Guidance (guided/stalled); this function
 * makes that switch measurable. Built on the canonical connection predicates in
 * lib/connection-temperature so "the provider responded" means the same thing
 * everywhere.
 */

import { isSuccessfulConnection, type ConnectionLike } from "@/lib/connection-temperature";

export type FamilyOutcome = "connected" | "active" | "guided" | "stalled";

/**
 * How long after an inquiry a family is still considered "active" (in the
 * matchmaking window) rather than stalled. Matches the coordinator cascade
 * timeline — the sensor fires at 48–72h and the silent-provider rungs run
 * through ~144h (6d), so a week gives matchmaking room before we call it.
 */
export const ACTIVE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True if the family self-reported "yes, the provider got back to me" on any
 *  inquiry (metadata.outcome.value === "yes"). This is the off-platform truth
 *  the outcome-check sensor records — a real connection that would otherwise be
 *  invisible (provider replied by phone/email, never on-platform). */
export function familySelfReportedYes(inquiries: ConnectionLike[]): boolean {
  return inquiries.some((c) => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const outcome = meta.outcome as { value?: string } | undefined;
    return outcome?.value === "yes";
  });
}

export interface FamilyOutcomeInput {
  /** The family's inquiry connections (from_profile_id === the family). */
  inquiries: ConnectionLike[];
  /** Did the family take any guidance action (compare/guide/benefits) — from
   *  seeker_activity. Only consulted once matchmaking hasn't succeeded and the
   *  active window has passed. */
  guidanceEngaged: boolean;
}

/**
 * Classify one family into a single outcome. Precedence:
 * connected > active > guided > stalled — best outcome wins, and a family still
 * inside the matchmaking window counts as active even if they've also poked at
 * guidance (they'll roll to guided/stalled once the window passes).
 *
 * Pure — `now` is injectable so the boundaries can be reasoned about/tested.
 */
export function computeFamilyOutcome(
  { inquiries, guidanceEngaged }: FamilyOutcomeInput,
  now: number = Date.now(),
): FamilyOutcome {
  if (familySelfReportedYes(inquiries) || inquiries.some((c) => isSuccessfulConnection(c))) {
    return "connected";
  }
  const activeCutoff = now - ACTIVE_WINDOW_DAYS * DAY_MS;
  if (inquiries.some((c) => c.created_at && new Date(c.created_at).getTime() >= activeCutoff)) {
    return "active";
  }
  if (guidanceEngaged) return "guided";
  return "stalled";
}

export const FAMILY_OUTCOMES: readonly FamilyOutcome[] = [
  "connected",
  "active",
  "guided",
  "stalled",
] as const;

/** Aggregate a set of families into an outcome distribution (counts). */
export function tallyFamilyOutcomes(outcomes: FamilyOutcome[]): Record<FamilyOutcome, number> {
  const tally: Record<FamilyOutcome, number> = { connected: 0, active: 0, guided: 0, stalled: 0 };
  for (const o of outcomes) tally[o] += 1;
  return tally;
}
