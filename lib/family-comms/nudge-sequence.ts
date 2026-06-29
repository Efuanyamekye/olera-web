import type { NudgeSequence, NudgeSequencePhase } from "@/lib/types";

/**
 * Family-nudge sequence cadence helpers — shared by the family-comms-coordinator
 * (completion track, Track 2 / Option B) and the family-nudges engine (publish track).
 *
 * Extracted from app/api/cron/family-nudges/route.ts so completion and publish can no
 * longer drift apart. Step-state lives in `business_profiles.metadata.completion_sequence`
 * / `.publish_sequence`; both engines read/advance the SAME field, so a sequence in flight
 * continues seamlessly when ownership of completion moved from family-nudges to the
 * coordinator. See plans/family-comms-system.md "Track 2 — Option B build spec".
 */

export const COMPLETION_ACTIVE_COUNT = 4;
export const PUBLISH_ACTIVE_COUNT = 4;
export const COMPLETION_COOLDOWNS = [0, 2, 4, 7]; // days between nudges — same-day, Day 2, Day 6, Day 13
export const PUBLISH_COOLDOWNS = [0, 2, 4, 7]; // days between nudges — same-day after complete, Day 2, Day 6, Day 13
export const MAINTENANCE_COOLDOWN = 30; // days between maintenance nudges
export const MAX_MAINTENANCE_NUDGES = 6; // cap monthly nudges at 6 (stop after ~8 months total)

export function daysSince(isoDate: string | undefined | null): number {
  if (!isoDate) return Infinity;
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

export function getSequenceOrDefault(seq: NudgeSequence | undefined): NudgeSequence {
  return seq ?? { nudge_count: 0, phase: "active" as NudgeSequencePhase };
}

/**
 * Get sequence with migration handling for legacy flags.
 * If user has the legacy flag but no sequence, start them at nudge #2 (skip #1).
 */
export function getSequenceWithMigration(
  seq: NudgeSequence | undefined,
  legacyFlagSent: boolean | undefined,
): NudgeSequence {
  if (seq) return seq;
  if (legacyFlagSent) return { nudge_count: 1, phase: "active" as NudgeSequencePhase };
  return { nudge_count: 0, phase: "active" as NudgeSequencePhase };
}

export function getCooldownForNudge(nudgeCount: number, cooldowns: number[]): number {
  // nudgeCount is 0-indexed (0 = before first nudge). cooldowns[0] = days before first
  // nudge, cooldowns[1] = days between 1st and 2nd, etc. After the active phase, use the
  // maintenance cooldown.
  if (nudgeCount < cooldowns.length) return cooldowns[nudgeCount];
  return MAINTENANCE_COOLDOWN;
}

export function shouldSendCompletionNudge(seq: NudgeSequence, createdAt: string): boolean {
  const daysSinceLastNudge = daysSince(seq.last_nudge_at ?? createdAt);
  if (seq.phase === "active") {
    return daysSinceLastNudge >= getCooldownForNudge(seq.nudge_count, COMPLETION_COOLDOWNS);
  }
  return daysSinceLastNudge >= MAINTENANCE_COOLDOWN;
}

export function shouldSendPublishNudge(
  seq: NudgeSequence,
  profileCompletedAt: string | undefined,
  createdAt: string,
): boolean {
  // For the first nudge, use profile completion time as the baseline.
  const baseline = profileCompletedAt || createdAt;
  const daysSinceLastNudge = daysSince(seq.last_nudge_at ?? baseline);
  if (seq.phase === "active") {
    return daysSinceLastNudge >= getCooldownForNudge(seq.nudge_count, PUBLISH_COOLDOWNS);
  }
  return daysSinceLastNudge >= MAINTENANCE_COOLDOWN;
}

/**
 * The next sequence state after sending nudge #`nudgeNumber`. Crosses into "maintenance"
 * once the active count is reached.
 */
export function advanceSequence(nudgeNumber: number, activeCount: number): NudgeSequence {
  return {
    nudge_count: nudgeNumber,
    last_nudge_at: new Date().toISOString(),
    phase: nudgeNumber >= activeCount ? "maintenance" : "active",
  };
}
