import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFilterFromSlug, listedProviderIdsInCity } from "@/lib/providers";

/**
 * M1–M5 — the user milestone strip: the moments someone stops being traffic
 * and becomes a record we can act on.
 *
 *   M1  care recipient profiles live        business_profiles type=family
 *                                           with a published care post
 *   M2  care worker profiles completed      business_profiles type=student
 *   M3  provider profiles claimed           provider_activity claim_completed
 *   M4  managed ad signups                  ad_campaign_requests
 *   M5  provider staffing signups           staffing_touchpoints system_activated
 *
 * "student" is the stored type for a care worker — MedJobs' original name for
 * them, kept because the column is what it is.
 *
 * M3, M4 and M5 are true events with their own timestamps. M1 and M2 are not,
 * and that difference is real rather than cosmetic: a profile becomes
 * complete when `is_active` flips — a care worker's when their intro video
 * lands, a care recipient's again when their care post is published — and
 * nothing records when that happened. So those two count profiles CREATED in
 * the window that are in that state NOW. A profile created just before the
 * window and finished inside it is missed; one created inside and finished
 * after is counted. The tooltip says so.
 *
 * M1 counts only live profiles, not merely complete ones. A profile nobody
 * can see is not a milestone.
 */

const PAGE_SIZE = 1000;
const MAX_ROWS = 100_000;

export interface Milestones {
  /** M1 — profiles whose care post is published, so providers can see them. */
  careRecipientProfilesLive: number;
  careWorkerProfiles: number;
  providersClaimed: number;
  managedAdSignups: number;
  staffingSignups: number;
}

type Range = { from: string | null; to: string | null };

/** Completed profiles of one kind. City here is the profile's own city. */
async function countProfiles(
  db: SupabaseClient,
  type: "family" | "student",
  range: Range,
  citySlug: string | null,
  /** Narrow to profiles whose care post is published. */
  liveOnly = false,
): Promise<number> {
  let query = db
    .from("business_profiles")
    .select("id", { count: "exact", head: true })
    .eq("type", type)
    .eq("is_active", true);

  // The same test the admin Care Seekers page uses for its Published view.
  if (liveOnly) {
    query = query.contains("metadata", { care_post: { status: "active" } });
  }

  if (citySlug) {
    const filter = cityFilterFromSlug(citySlug);
    if (filter) query = query.in("city", filter.names).eq("state", filter.state);
  }
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lt("created_at", range.to);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Provider-keyed events in the window, counted once each, optionally narrowed
 * to one city.
 *
 * These sets are small — claims, ad signups and staffing activations are rare
 * next to page views — so the ids come back and are filtered here rather than
 * pushing a few thousand provider ids into a URL.
 */
async function countProviderEvents(
  db: SupabaseClient,
  spec: {
    table: string;
    select: string;
    eventType?: string;
    idField: string;
  },
  range: Range,
  cityIds: Set<string> | null,
): Promise<number> {
  const ids = new Set<string>();
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db.from(spec.table).select(spec.select);
    if (spec.eventType) query = query.eq("event_type", spec.eventType);
    if (range.from) query = query.gte("created_at", range.from);
    if (range.to) query = query.lt("created_at", range.to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = row[spec.idField];
      // A row with no provider still happened. Key it by its own id so it is
      // counted once, unless a city filter is on — then it cannot be placed.
      if (typeof id === "string" && id) {
        if (!cityIds || cityIds.has(id)) ids.add(id);
      } else if (!cityIds) {
        ids.add(`row:${scanned}:${ids.size}`);
      }
    }

    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return ids.size;
}

/**
 * M5 — providers activating staffing.
 *
 * The activation is a touchpoint; the provider it belongs to is one hop away
 * through staffing_outreach, so a city filter has to resolve that hop first.
 */
async function countStaffingSignups(
  db: SupabaseClient,
  range: Range,
  cityIds: Set<string> | null,
): Promise<number> {
  const outreachIds = new Set<string>();
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("staffing_touchpoints")
      .select("outreach_id")
      .eq("type", "system_activated")
      .not("outreach_id", "is", null);
    if (range.from) query = query.gte("created_at", range.from);
    if (range.to) query = query.lt("created_at", range.to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { outreach_id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) if (r.outreach_id) outreachIds.add(r.outreach_id);
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  if (!cityIds) return outreachIds.size;

  const ids = [...outreachIds];
  const inCity = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("staffing_outreach")
      .select("id, provider_id")
      .in("id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; provider_id: string | null }[]) {
      if (r.provider_id && cityIds.has(r.provider_id)) inCity.add(r.id);
    }
  }
  return inCity.size;
}

export async function getMilestones(
  db: SupabaseClient,
  range: Range,
  citySlug: string | null = null,
): Promise<Milestones> {
  // The provider-keyed nodes all narrow against the same city list, so it is
  // resolved once rather than three times.
  const cityIds = citySlug
    ? new Set(await listedProviderIdsInCity(db, citySlug))
    : null;

  const [
    careRecipientProfilesLive,
    careWorkerProfiles,
    providersClaimed,
    managedAdSignups,
    staffingSignups,
  ] = await Promise.all([
    countProfiles(db, "family", range, citySlug, true),
    countProfiles(db, "student", range, citySlug),
    countProviderEvents(
      db,
      {
        table: "provider_activity",
        select: "provider_id, created_at",
        eventType: "claim_completed",
        idField: "provider_id",
      },
      range,
      cityIds,
    ),
    countProviderEvents(
      db,
      {
        table: "ad_campaign_requests",
        select: "provider_id, created_at",
        idField: "provider_id",
      },
      range,
      cityIds,
    ),
    countStaffingSignups(db, range, cityIds),
  ]);

  return {
    careRecipientProfilesLive,
    careWorkerProfiles,
    providersClaimed,
    managedAdSignups,
    staffingSignups,
  };
}
