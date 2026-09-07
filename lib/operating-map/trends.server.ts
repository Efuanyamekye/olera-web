import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrganicVisitors } from "./organic.server";
import { getPageVisits } from "./page-visits.server";
import { getConversions } from "./conversions.server";
import { getProvidersInOutreach } from "./providers.server";
import { getMilestones } from "./milestones.server";
import { getTracks } from "./tracks.server";

/**
 * Which way each number is moving, independent of the range on screen.
 *
 * The map answers "how much" over whatever window you selected. It could not
 * answer "is that good", because a total says nothing about direction. This
 * adds the direction: every node is recounted over the last 7 days against
 * the 7 before, and over the last 30 against the 30 before.
 *
 * Those windows are FIXED. They do not follow the date picker, because a
 * trend that changes shape every time you widen the range is not a trend —
 * it is a different question each time. The tooltip says which window the
 * colour came from so the two readings are never confused.
 *
 * Each node is recounted by calling the same function that produced its
 * number, with a different range. That is the whole point: a trend computed
 * from a second, looser definition would drift away from the number it sits
 * on, and nobody would know which one was wrong.
 *
 * Standing counts — the directory, the universities, the advisors, the city
 * list — get no trend at all. They describe the world as it is now and we
 * keep no history of what it was, so any "change" we printed would be
 * invented.
 */

const DAY = 86_400_000;

/** One node's movement. */
export interface NodeTrend {
  /**
   * -3 to +3. Zero is flat; the sign is direction and the magnitude is how
   * hard it is moving. One step per 10% change week over week.
   */
  score: number;
  /** Week-over-week change as a fraction, or null when there is no baseline. */
  weekChange: number | null;
  /** The month arrow: -1 down, 0 flat, +1 up. */
  monthDirection: -1 | 0 | 1;
  /** The two weekly counts behind the score, for the tooltip. */
  week: { now: number; prior: number };
  /** The two monthly counts behind the arrow. */
  month: { now: number; prior: number };
}

export type Trends = Record<string, NodeTrend>;

type Range = { from: string | null; to: string | null };

/**
 * Below this much total activity a percentage is mostly noise — two events
 * against one is a 100% rise that means nothing. Those nodes still get a
 * direction, but never a strong one.
 */
const NOISE_FLOOR = 6;

/** A move smaller than this is flat. Stops a rounding wobble reading as growth. */
const FLAT_BAND = 0.05;

/**
 * Score one node's week. Returns 0 for anything we cannot honestly call a
 * direction, so a grey number means "no signal", never "no data".
 */
function scoreWeek(now: number, prior: number): { score: number; change: number | null } {
  if (prior === 0) {
    // No baseline, so there is no percentage to take. Activity where there
    // was none is real news; nothing against nothing is not.
    if (now === 0) return { score: 0, change: null };
    return { score: now + prior >= NOISE_FLOOR ? 3 : 1, change: null };
  }
  const change = (now - prior) / prior;
  if (Math.abs(change) < FLAT_BAND) return { score: 0, change };
  const raw = Math.max(-3, Math.min(3, Math.round(change * 10)));
  // Small numbers move in big percentages. Cap them at the gentlest shade
  // rather than painting a 1-to-2 week deep green.
  const capped = now + prior < NOISE_FLOOR ? Math.sign(raw) : raw;
  return { score: capped, change };
}

function monthDirection(now: number, prior: number): -1 | 0 | 1 {
  if (prior === 0) return now > 0 ? 1 : 0;
  const change = (now - prior) / prior;
  if (Math.abs(change) < FLAT_BAND) return 0;
  return change > 0 ? 1 : -1;
}

/** The four windows, anchored on today and ending at tonight's midnight. */
function windows(): { weekNow: Range; weekPrior: Range; monthNow: Range; monthPrior: Range } {
  const now = new Date();
  // Exclusive end, so today's rows are included — every range here is
  // [from, to) the same way the metrics endpoint reads its date params.
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const at = (daysBack: number) => new Date(end - daysBack * DAY).toISOString().slice(0, 10);
  const to = at(0);
  return {
    weekNow: { from: at(7), to },
    weekPrior: { from: at(14), to: at(7) },
    monthNow: { from: at(30), to },
    monthPrior: { from: at(60), to: at(30) },
  };
}

/** Every node's count over one window, keyed the way the map keys its nodes. */
async function countAll(
  db: SupabaseClient,
  range: Range,
  citySlug: string | null,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  // One slow node must not cost the others their trend, so each group is
  // settled independently and a failure simply leaves its nodes uncoloured.
  const [organic, visits, conversions, outreach, milestones, tracks] =
    await Promise.allSettled([
      getOrganicVisitors(db, range, citySlug),
      getPageVisits(db, range, citySlug),
      getConversions(db, range),
      getProvidersInOutreach(db, range, citySlug),
      getMilestones(db, range, citySlug),
      getTracks(db, range),
    ]);

  if (organic.status === "fulfilled") out.cr2 = organic.value.value;
  if (visits.status === "fulfilled") out.cr4 = visits.value.total;
  if (conversions.status === "fulfilled") {
    out.cr6 = conversions.value.ctasTotal;
    out.cr6a = conversions.value.questions;
    out.cr6b = conversions.value.connections;
    out.cr6c = conversions.value.benefitsAssessments;
  }
  if (outreach.status === "fulfilled") out.cp2 = outreach.value.value;
  if (milestones.status === "fulfilled") {
    out.m1 = milestones.value.careRecipientProfilesLive;
    out.m2 = milestones.value.careWorkerProfiles;
    out.m3 = milestones.value.providersClaimed;
    out.m4 = milestones.value.managedAdSignups;
    out.m5 = milestones.value.staffingSignups;
  }
  if (tracks.status === "fulfilled") {
    out.tb1 = tracks.value.inquiriesResponded;
    out.tc1 = tracks.value.interviewsConfirmed;
    out.tc2 = tracks.value.hires;
  }

  return out;
}

export async function getTrends(
  db: SupabaseClient,
  citySlug: string | null = null,
): Promise<Trends> {
  const w = windows();
  const [weekNow, weekPrior, monthNow, monthPrior] = await Promise.all([
    countAll(db, w.weekNow, citySlug),
    countAll(db, w.weekPrior, citySlug),
    countAll(db, w.monthNow, citySlug),
    countAll(db, w.monthPrior, citySlug),
  ]);

  const trends: Trends = {};
  for (const node of Object.keys(weekNow)) {
    // A node missing from any window failed somewhere. Half a comparison is
    // worse than none, so it goes uncoloured.
    if (
      !(node in weekPrior) ||
      !(node in monthNow) ||
      !(node in monthPrior)
    ) {
      continue;
    }
    const { score, change } = scoreWeek(weekNow[node], weekPrior[node]);
    trends[node] = {
      score,
      weekChange: change,
      monthDirection: monthDirection(monthNow[node], monthPrior[node]),
      week: { now: weekNow[node], prior: weekPrior[node] },
      month: { now: monthNow[node], prior: monthPrior[node] },
    };
  }
  return trends;
}
