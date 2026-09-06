import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TA, TB and TC — the three tracks, where a match turns into something real.
 *
 * Only three of the nine nodes have a source. The rest are dashed on purpose
 * and the gaps are worth naming, because they are the same gap: we record
 * that we introduced two people and stop recording once they take it
 * offline.
 *
 *   TA1–TA3  aid establishment    nothing. A benefits screener produces
 *                                 matches, but applying for aid happens on a
 *                                 government site and nobody tells us how it
 *                                 went.
 *   TB1      provider responded   connections that reached "responded"
 *   TB2–TB3  care established     nothing. Care starts in a conversation we
 *                                 are not part of.
 *   TC1      interview confirmed  interviews that reached "confirmed"
 *   TC2      hire confirmed       medjobs_placements accepted or confirmed
 *   TC3      hours worked         nothing.
 *
 * `inquiriesRaised` and `interviewsProposed` are not nodes on the map — the
 * matched steps were removed. They are still read, because they are what the
 * confirmed counts are a subset of, and a consistency check with nothing to
 * compare against is no check at all.
 *
 * Every count here carries a timing caveat. Only the creation of a row is
 * timestamped, not the status change, so they count rows CREATED in the
 * window that have since reached that state. An inquiry raised last month
 * and answered today lands in last month.
 */

type Range = { from: string | null; to: string | null };

export interface Tracks {
  /** Not a node — the set TB1 is drawn from, kept for the consistency check. */
  inquiriesRaised: number;
  /** TB1 — inquiries a provider answered. */
  inquiriesResponded: number;
  /** Not a node — the set TC1 is drawn from, kept for the consistency check. */
  interviewsProposed: number;
  /** TC1 — interviews that reached confirmed. */
  interviewsConfirmed: number;
  /** TC2 — placements the care worker accepted. */
  hires: number;
}

/** Apply the map's window to any table that timestamps its rows. */
function inRange<T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
  query: T,
  range: Range,
): T {
  let q = query;
  if (range.from) q = q.gte("created_at", range.from);
  if (range.to) q = q.lt("created_at", range.to);
  return q;
}

const HEAD = { count: "exact", head: true } as const;

export async function getTracks(
  db: SupabaseClient,
  range: Range,
): Promise<Tracks> {
  const [
    inquiriesRaised,
    inquiriesResponded,
    interviewsProposed,
    interviewsConfirmed,
    hires,
  ] = await Promise.all([
      inRange(
        db.from("connections").select("id", HEAD).eq("type", "inquiry"),
        range,
      ),
      inRange(
        db
          .from("connections")
          .select("id", HEAD)
          .eq("type", "inquiry")
          .eq("status", "responded"),
        range,
      ),
      inRange(db.from("interviews").select("id", HEAD), range),
      inRange(
        db.from("interviews").select("id", HEAD).eq("status", "confirmed"),
        range,
      ),
      inRange(
        db
          .from("medjobs_placements")
          .select("id", HEAD)
          .in("status", ["accepted", "confirmed"]),
        range,
      ),
    ]);

  for (const result of [
    inquiriesRaised,
    inquiriesResponded,
    interviewsProposed,
    interviewsConfirmed,
    hires,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    inquiriesRaised: inquiriesRaised.count ?? 0,
    inquiriesResponded: inquiriesResponded.count ?? 0,
    interviewsProposed: interviewsProposed.count ?? 0,
    interviewsConfirmed: interviewsConfirmed.count ?? 0,
    hires: hires.count ?? 0,
  };
}
