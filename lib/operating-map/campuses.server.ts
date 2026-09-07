import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFilterFromSlug } from "@/lib/providers";

/**
 * CW1 and CW2 — the care worker lane's supply side.
 *
 * Care workers reach Olera through universities, so this lane counts the
 * channel rather than the people: how many campuses we have listed, and how
 * many advisors at them we can actually reach.
 *
 * The link runs one hop further than it looks:
 *
 *   student_outreach_campuses   the university, with its own city and state
 *   student_outreach            one row per campus we are working
 *   student_outreach_contacts   the advisors, keyed by outreach_id
 *
 * So a city filter has to resolve campuses first, then their outreach rows,
 * before contacts can be counted.
 *
 * Both are standing counts. A university is listed or it is not; an advisor
 * is reachable or not. Neither is something that happens on a date, so the
 * map's range does not move them — the same as CP1.
 */

const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
const ID_CHUNK = 100;

export interface CampusSupply {
  /** CW1 — campuses we are working. */
  universities: number;
  /** CW1's second number — advisors on file at those campuses. */
  advisors: number;
  /** CW2 — advisors we have actually reached out to. */
  advisorsInOutreach: number;
}

/** Ids of the active campuses, narrowed to a city when one is selected. */
async function activeCampusIds(
  db: SupabaseClient,
  citySlug: string | null,
): Promise<string[]> {
  const ids: string[] = [];
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("student_outreach_campuses")
      .select("id")
      .eq("is_active", true);

    if (citySlug) {
      const filter = cityFilterFromSlug(citySlug);
      if (filter) query = query.in("city", filter.names).eq("state", filter.state);
    }

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) if (r.id) ids.push(r.id);
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return ids;
}

/** Outreach rows belonging to these campuses. */
async function outreachIdsForCampuses(
  db: SupabaseClient,
  campusIds: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < campusIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("student_outreach")
      .select("id")
      .in("campus_id", campusIds.slice(i, i + ID_CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string | null }[]) if (r.id) ids.push(r.id);
  }
  return ids;
}

/**
 * CW1 and CW2 together, since CW2 cannot be counted without CW1's campuses.
 *
 * Advisors are counted where their contact record is active, matching how the
 * MedJobs partners view reads the same table — a contact that bounced or was
 * removed is not someone we can reach.
 *
 * CW2 is the subset we have actually contacted: an advisor with at least one
 * touchpoint against them. A name on a list nobody has emailed is supply we
 * have not tried yet, and the gap between the two is the work.
 */
export async function getCampusSupply(
  db: SupabaseClient,
  citySlug: string | null = null,
): Promise<CampusSupply> {
  const campusIds = await activeCampusIds(db, citySlug);
  const empty = { universities: 0, advisors: 0, advisorsInOutreach: 0 };
  if (campusIds.length === 0) return empty;

  const outreachIds = await outreachIdsForCampuses(db, campusIds);
  if (outreachIds.length === 0) {
    return { ...empty, universities: campusIds.length };
  }

  const advisorIds: string[] = [];
  for (let i = 0; i < outreachIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("student_outreach_contacts")
      .select("id")
      .eq("status", "active")
      .in("outreach_id", outreachIds.slice(i, i + ID_CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string }[]) advisorIds.push(r.id);
  }

  const contacted = new Set<string>();
  for (let i = 0; i < advisorIds.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("student_outreach_touchpoints")
      .select("contact_id")
      .in("contact_id", advisorIds.slice(i, i + ID_CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as { contact_id: string | null }[]) {
      if (r.contact_id) contacted.add(r.contact_id);
    }
  }

  return {
    universities: campusIds.length,
    advisors: advisorIds.length,
    advisorsInOutreach: contacted.size,
  };
}
