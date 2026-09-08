import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { FamilyMetadata } from "@/lib/types";
import { CITY_LEAD_SOURCE } from "@/lib/city-ads/care-seeker.server";

/**
 * family-nudges data access — behind the front door.
 *
 * The daily family-nudges cron reads `business_profiles` FAMILY rows (the
 * eligible-family scan), reads `olera-providers` to build per-area provider
 * recommendations + counts for the email bodies, and writes FAMILY-row
 * `metadata` back after each send. These are thin query wrappers — all
 * orchestration (the pagination loop, the city→category mapping, the in-memory
 * caches, the city→state fallback/merge, and the ProviderRec transform) stays
 * in the cron; only the raw `.from(...)` calls (and their exact error-handling)
 * move here so the cron touches neither table directly.
 *
 * Note: the family readers/writers hit `business_profiles` FAMILY rows, not
 * providers. They live here because the eslint guard bans the table regardless
 * of row type — `lib/providers` is the access layer for both physical tables.
 *
 * Parity-first relocation from `app/api/cron/family-nudges/route.ts`. The
 * metadata writes are bare (no error check / no throw) exactly as the originals
 * were — the cron's outer try/catch must NOT abort on a single failed write.
 */

export interface FamilyNudgeRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  image_url: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  care_types: string[] | null;
  metadata: FamilyMetadata | null;
  created_at: string;
  account_id: string | null;
  claim_token: string | null;
}

const FAMILY_COLUMNS =
  "id, display_name, email, phone, image_url, city, state, description, care_types, metadata, created_at, account_id, claim_token";

/**
 * One page of eligible FAMILY profiles (created on/before the cutoff), newest
 * first. Returns the raw supabase `{ data, error }` — the cron owns the
 * pagination loop and its error-logging.
 *
 * City-lead profiles are excluded. Those families filled in an ad landing page
 * and were told, by SMS, that a person from Olera would call them; a human is
 * working the request by hand. Dropping them into the publish sequence would
 * email "Let providers come to you" to someone we are in the middle of
 * phoning, which reads as though nobody at Olera is talking to anybody else.
 * They are re-eligible the moment the profile is claimed and its source stops
 * being the city form. See lib/city-ads/care-seeker.server.ts.
 */
export async function fetchFamilyProfilesPage(
  db: SupabaseClient,
  cutoffTime: string,
  offset: number,
  pageSize: number,
): Promise<{ data: FamilyNudgeRow[] | null; error: PostgrestError | null }> {
  const { data, error } = await db
    .from("business_profiles")
    .select(FAMILY_COLUMNS)
    .eq("type", "family")
    .or(`source.is.null,source.neq.${CITY_LEAD_SOURCE}`)
    .lte("created_at", cutoffTime)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
  return { data: data as FamilyNudgeRow[] | null, error };
}

export interface NudgeProviderRow {
  provider_name: string;
  provider_category: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  google_rating: number | null;
  google_reviews_data: unknown;
  metadata: unknown;
}

const NUDGE_PROVIDER_COLUMNS =
  "provider_name, provider_category, slug, city, state, google_rating, google_reviews_data, metadata";

/**
 * Count of active providers in a city+state, optionally constrained to a set of
 * provider_category values. Caller passes already-mapped categories. Degrades
 * to 0 (matches the original — no error check).
 */
export async function countActiveProvidersInArea(
  db: SupabaseClient,
  state: string,
  city: string,
  categories: string[],
): Promise<number> {
  let query = db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .eq("state", state)
    .ilike("city", city)
    .or("deleted.is.null,deleted.eq.false");

  if (categories.length > 0) {
    query = query.in("provider_category", categories);
  }

  const { count } = await query;
  return count ?? 0;
}

/**
 * Count of active providers in a city+state created on/after `sinceIso` — the
 * "new providers added" stat for maintenance emails. Degrades to 0.
 */
export async function countRecentProvidersInArea(
  db: SupabaseClient,
  state: string,
  city: string,
  categories: string[],
  sinceIso: string,
): Promise<number> {
  let query = db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .eq("state", state)
    .ilike("city", city)
    .or("deleted.is.null,deleted.eq.false")
    .gte("created_at", sinceIso);

  if (categories.length > 0) {
    query = query.in("provider_category", categories);
  }

  const { count } = await query;
  return count ?? 0;
}

/**
 * Top-rated active providers in a city+state (≥3.5★), highest first. Caller
 * handles the state-only fallback + ProviderRec transform. Degrades to [].
 */
export async function getTopRatedProvidersByCityState(
  db: SupabaseClient,
  state: string,
  city: string,
  categories: string[],
  limit: number,
): Promise<NudgeProviderRow[]> {
  let query = db
    .from("olera-providers")
    .select(NUDGE_PROVIDER_COLUMNS)
    .eq("state", state)
    .ilike("city", city)
    .or("deleted.is.null,deleted.eq.false")
    .not("google_rating", "is", null)
    .gte("google_rating", 3.5)
    .order("google_rating", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (categories.length > 0) {
    query = query.in("provider_category", categories);
  }

  const { data } = await query;
  return (data ?? []) as NudgeProviderRow[];
}

/**
 * Top-rated active providers across the whole state (≥4.0★) — the fallback when
 * a city has too few. Degrades to [].
 */
export async function getTopRatedProvidersByState(
  db: SupabaseClient,
  state: string,
  categories: string[],
  limit: number,
): Promise<NudgeProviderRow[]> {
  let query = db
    .from("olera-providers")
    .select(NUDGE_PROVIDER_COLUMNS)
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false")
    .not("google_rating", "is", null)
    .gte("google_rating", 4.0)
    .order("google_rating", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (categories.length > 0) {
    query = query.in("provider_category", categories);
  }

  const { data } = await query;
  return (data ?? []) as NudgeProviderRow[];
}

/**
 * A claimed provider's display_name + slug by business_profiles id — used by the
 * post-connection follow-up to build the review URL. Silent on error (the
 * original ignores it and falls back on a missing slug), degrades to null.
 */
export async function getBusinessProfileNameSlug(
  db: SupabaseClient,
  profileId: string,
): Promise<{ display_name: string | null; slug: string | null } | null> {
  const { data } = await db
    .from("business_profiles")
    .select("display_name, slug")
    .eq("id", profileId)
    .single();
  return (data as { display_name: string | null; slug: string | null } | null) ?? null;
}

/**
 * Write a FAMILY row's `metadata` jsonb. The cron computes the full metadata
 * object inline (spreading the existing meta + new fields); this only performs
 * the write. Bare/silent exactly as the originals — does NOT throw, so a single
 * failed write never aborts the cron's outer try/catch.
 */
export async function updateFamilyMetadata(
  db: SupabaseClient,
  familyId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.from("business_profiles").update({ metadata }).eq("id", familyId);
}
