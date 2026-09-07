import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFilterFromSlug, listedProviderIdsInCity } from "@/lib/providers";

/**
 * M1–M5 — the user milestone strip: the moments someone stops being traffic
 * and becomes a record we can act on.
 *
 *   M1  care recipient profiles        business_profiles type=family,
 *                                       started / completed / live
 *   M2  provider profiles               provider_activity claim_completed,
 *                                       then completed / verified among them
 *   M3  managed ad signups              ad_campaign_requests, plus repeats
 *   M4  provider staffing signups       staffing_touchpoints system_activated
 *   M5  care worker profiles            business_profiles type=student,
 *                                       started / completed
 *
 * "student" is the stored type for a care worker — MedJobs' original name for
 * them, kept because the column is what it is.
 *
 * M2, M3 and M4 are true events with their own timestamps. M1 and M5 are not,
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
  /** M1 — every care recipient profile begun, finished or not. */
  careRecipientProfilesStarted: number;
  /** Of those, the ones marked complete. */
  careRecipientProfiles: number;
  /** Of those, the ones whose care post is published. */
  careRecipientProfilesLive: number;
  /** M2 — providers who finished claiming in this range. */
  providersClaimed: number;
  /** Of those, the ones whose profile is active. */
  providersCompleted: number;
  /** Of those, the ones verification has passed. */
  providersVerified: number;
  /** M3 — campaign requests in this range. */
  managedAdSignups: number;
  /** Providers who have asked for more than one campaign, ever. */
  managedAdRepeat: number;
  /** M4 — providers activating staffing in this range. */
  staffingSignups: number;
  /** M5 — every care worker application begun. */
  careWorkerProfilesStarted: number;
  /** Of those, the ones that went live. */
  careWorkerProfiles: number;
}

type Range = { from: string | null; to: string | null };

/** Completed profiles of one kind. City here is the profile's own city. */
async function countProfiles(
  db: SupabaseClient,
  type: "family" | "student",
  range: Range,
  citySlug: string | null,
  options: {
    /** Narrow to profiles whose care post is published. */
    liveOnly?: boolean;
    /**
     * Count applications that were only begun too. `is_active` flips when a
     * care worker's intro video and documents land, so without this the
     * count is finished profiles and the pool behind them is invisible.
     */
    includeIncomplete?: boolean;
  } = {},
): Promise<number> {
  const { liveOnly = false, includeIncomplete = false } = options;

  let query = db
    .from("business_profiles")
    .select("id", { count: "exact", head: true })
    .eq("type", type);

  if (!includeIncomplete) query = query.eq("is_active", true);

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
 * M4 — providers activating staffing.
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

/**
 * M2's second and third numbers: of the providers who claimed in this range,
 * how many finished the profile and how many passed verification.
 *
 * Deliberately scoped to the same claimers rather than counted across the
 * whole directory — read as a funnel inside the claim cohort, it says how
 * far this range's claimers actually got. A standing directory-wide count
 * would answer a different question and sit misleadingly under an event.
 */
async function countClaimOutcomes(
  db: SupabaseClient,
  providerIds: string[],
): Promise<{ completed: number; verified: number }> {
  if (providerIds.length === 0) return { completed: 0, verified: 0 };

  let completed = 0;
  let verified = 0;
  for (let i = 0; i < providerIds.length; i += 100) {
    const { data, error } = await db
      .from("business_profiles")
      .select("is_active, verification_state")
      .eq("type", "provider")
      .in("source_provider_id", providerIds.slice(i, i + 100));
    if (error) throw error;
    for (const r of (data ?? []) as {
      is_active: boolean | null;
      verification_state: string | null;
    }[]) {
      if (r.is_active) completed += 1;
      if (r.verification_state === "verified") verified += 1;
    }
  }
  return { completed, verified };
}

/**
 * M3's second number: providers who have asked for more than one campaign.
 *
 * Counted over all time, not the range — a repeat is by definition something
 * that happened across two moments, and a 30-day window would report almost
 * none of them.
 */
async function countRepeatAdCustomers(
  db: SupabaseClient,
  cityIds: Set<string> | null,
): Promise<number> {
  const seen = new Map<string, number>();
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    const { data, error } = await db
      .from("ad_campaign_requests")
      .select("provider_id")
      .range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { provider_id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!r.provider_id) continue;
      if (cityIds && !cityIds.has(r.provider_id)) continue;
      seen.set(r.provider_id, (seen.get(r.provider_id) ?? 0) + 1);
    }
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  let repeat = 0;
  for (const count of seen.values()) if (count > 1) repeat += 1;
  return repeat;
}

/** The provider ids behind M2's claim events, for the outcome counts above. */
async function claimedProviderIdsInRange(
  db: SupabaseClient,
  range: Range,
  cityIds: Set<string> | null,
): Promise<string[]> {
  const ids = new Set<string>();
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("provider_activity")
      .select("provider_id")
      .eq("event_type", "claim_completed");
    if (range.from) query = query.gte("created_at", range.from);
    if (range.to) query = query.lt("created_at", range.to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { provider_id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.provider_id && (!cityIds || cityIds.has(r.provider_id))) ids.add(r.provider_id);
    }
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }
  return [...ids];
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

  const claimedIds = await claimedProviderIdsInRange(db, range, cityIds);

  const [
    careRecipientProfilesStarted,
    careRecipientProfiles,
    careRecipientProfilesLive,
    careWorkerProfilesStarted,
    careWorkerProfiles,
    claimOutcomes,
    managedAdSignups,
    managedAdRepeat,
    staffingSignups,
  ] = await Promise.all([
    countProfiles(db, "family", range, citySlug, { includeIncomplete: true }),
    countProfiles(db, "family", range, citySlug),
    countProfiles(db, "family", range, citySlug, { liveOnly: true }),
    countProfiles(db, "student", range, citySlug, { includeIncomplete: true }),
    countProfiles(db, "student", range, citySlug),
    countClaimOutcomes(db, claimedIds),
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
    countRepeatAdCustomers(db, cityIds),
    countStaffingSignups(db, range, cityIds),
  ]);

  return {
    careRecipientProfilesStarted,
    careRecipientProfiles,
    careRecipientProfilesLive,
    providersClaimed: claimedIds.length,
    providersCompleted: claimOutcomes.completed,
    providersVerified: claimOutcomes.verified,
    managedAdSignups,
    managedAdRepeat,
    staffingSignups,
    careWorkerProfilesStarted,
    careWorkerProfiles,
  };
}
