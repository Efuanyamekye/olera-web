import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANNELS } from "@/lib/analytics/channel";
import { getTrafficByChannel } from "./traffic.server";
import { getPageVisits } from "./page-visits.server";
import { getConversions } from "./conversions.server";
import { getMilestones } from "./milestones.server";
import { getTracks } from "./tracks.server";

/**
 * Which way each number is moving, independent of the range on screen.
 *
 * The map answers "how much" over whatever window you selected. It could not
 * answer "is that good", because a total says nothing about direction. This
 * adds the direction: every node is recounted over eight consecutive weeks,
 * which is enough to draw the shape and to read the two comparisons that
 * matter off it.
 *
 *   week over week   the last full week against the one before  -> the colour
 *   month over month weeks 5-8 against weeks 1-4                -> the arrow
 *   the eight weeks  the sparkline in the tooltip
 *
 * Eight buckets rather than four windows because everything above derives
 * from them. Counting the comparisons separately would have cost the same
 * and produced no shape.
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
 *
 * CP2 is left out for a different reason. It counts providers WE contacted,
 * so it moves when somebody runs a batch and sits flat when nobody does — a
 * trend line on it would describe our calendar rather than the market, and
 * be read as the second thing. It is also by some distance the most
 * expensive node to recount eight times over.
 */

const DAY = 86_400_000;

/** How many weeks of history the sparkline and both comparisons read. */
const WEEKS = 8;

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
  /** The two weekly counts behind the score. */
  week: { now: number; prior: number };
  /** The two four-week counts behind the arrow. */
  month: { now: number; prior: number };
  /** Eight consecutive weeks, oldest first. The sparkline. */
  series: number[];
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

/**
 * Eight consecutive week-long windows, oldest first, ending tonight.
 *
 * Every window is [from, to) — the same way the metrics endpoint reads its
 * date params — so no row is counted in two buckets or missed between them.
 */
function weekWindows(): Range[] {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const at = (daysBack: number) => new Date(end - daysBack * DAY).toISOString().slice(0, 10);
  const out: Range[] = [];
  for (let i = WEEKS; i >= 1; i -= 1) {
    out.push({ from: at(i * 7), to: at((i - 1) * 7) });
  }
  return out;
}

/** Sum a slice of the weekly series. */
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Every node's count over one window, keyed the way the map keys its nodes. */
async function countAll(
  db: SupabaseClient,
  range: Range,
  citySlug: string | null,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  // One slow node must not cost the others their trend, so each group is
  // settled independently and a failure simply leaves its nodes uncoloured.
  const [traffic, visits, conversions, milestones, tracks] =
    await Promise.allSettled([
      getTrafficByChannel(db, range, citySlug),
      getPageVisits(db, range, citySlug),
      getConversions(db, range, citySlug),
      getMilestones(db, range, citySlug),
      getTracks(db, range),
    ]);

  if (traffic.status === "fulfilled") {
    out.traffic = traffic.value.total;
    // Each channel gets its own series, keyed so the tooltip can look one up
    // by name. Free: they came out of the same pass as the total.
    for (const c of CHANNELS) out[`traffic:${c}`] = traffic.value.byChannel[c];
  }
  if (visits.status === "fulfilled") out.visits = visits.value.total;
  if (conversions.status === "fulfilled") {
    out.cr6 = conversions.value.ctasTotal;
    out.cr6a = conversions.value.questions;
    out.cr6b = conversions.value.connections;
    out.cr6c = conversions.value.benefitsAssessments;
  }
  if (milestones.status === "fulfilled") {
    out.m1 = milestones.value.careRecipientProfilesStarted;
    out.m2 = milestones.value.providersClaimed;
    out.m3 = milestones.value.managedAdSignups;
    out.m4 = milestones.value.staffingSignups;
    out.m5 = milestones.value.careWorkerProfilesStarted;
  }
  if (tracks.status === "fulfilled") {
    out.ta1 = tracks.value.benefitsApplied;
    out.tb1 = tracks.value.inquiriesResponded;
    out.tc1 = tracks.value.interviewsScheduled;
    out.tc2 = tracks.value.hires;
  }

  return out;
}

export async function getTrends(
  db: SupabaseClient,
  citySlug: string | null = null,
): Promise<Trends> {
  const windows = weekWindows();

  // Eight windows times six modules is a lot of concurrent paging, so they
  // go in batches rather than all at once. The endpoint is loaded after the
  // numbers and blocks nothing, so a second or two here costs nothing on
  // screen and keeps us from opening fifty connections at a time.
  const weeks: Record<string, number>[] = [];
  for (let i = 0; i < windows.length; i += 4) {
    const batch = await Promise.all(
      windows.slice(i, i + 4).map((range) => countAll(db, range, citySlug)),
    );
    weeks.push(...batch);
  }

  // A node only gets a trend if every week produced a count for it. Half a
  // history is worse than none: it would draw a dip that never happened.
  const complete = Object.keys(weeks[weeks.length - 1] ?? {}).filter((node) =>
    weeks.every((w) => node in w),
  );

  const trends: Trends = {};
  for (const node of complete) {
    const series = weeks.map((w) => w[node]);
    const weekNow = series[series.length - 1];
    const weekPrior = series[series.length - 2];
    const monthNow = sum(series.slice(WEEKS / 2));
    const monthPrior = sum(series.slice(0, WEEKS / 2));

    const { score, change } = scoreWeek(weekNow, weekPrior);
    trends[node] = {
      score,
      weekChange: change,
      monthDirection: monthDirection(monthNow, monthPrior),
      week: { now: weekNow, prior: weekPrior },
      month: { now: monthNow, prior: monthPrior },
      series,
    };
  }
  return trends;
}
