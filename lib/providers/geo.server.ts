import type { SupabaseClient } from "@supabase/supabase-js";
import { citiesWithAliases, expandCityAliases } from "@/lib/city-aliases";
import { cityKey, normalizeCityName } from "@/lib/city-key";

/** One city Olera has live providers in. */
export interface ProviderCity {
  /** Display form, e.g. "Fort Worth". */
  city: string;
  /** Two-letter abbreviation, upper case. */
  state: string;
  /** Stable key for URLs and lookups, e.g. "fort-worth-tx". */
  slug: string;
  /** Non-deleted provider rows resolving to this city. */
  providers: number;
}

const PAGE_SIZE = 1000;

/**
 * Hard ceiling on rows scanned, so a runaway table can never turn an admin
 * page into a full-table read. If this trips the result is flagged
 * `truncated` and the caller must say so rather than report a low count as
 * fact.
 */
const MAX_ROWS = 200_000;

/**
 * City values on provider rows are free text and genuinely messy — see
 * `lib/city-aliases.ts` (providers live under "Brooklyn", search resolves to
 * "New York") and `scripts/fix-mislabeled-cities.js` (a legacy import wrote
 * the wrong city on a swath of rows). Counting distinct raw values would
 * inflate the total with case and spacing variants, so everything collapses
 * to one normalized key first.
 *
 * Slugs come from `lib/city-key.ts`, shared with the visitor geo recorded on
 * page events, so a provider's city and a visitor's city are the same string.
 */
const normalizeCity = normalizeCityName;

/** Reverse of `expandCityAliases`: the name a group of aliases rolls up to. */
function buildAliasIndex(): Map<string, string> {
  const index = new Map<string, string>();
  // expandCityAliases maps a search term to the names providers are stored
  // under. Walking it backwards gives us alias -> canonical, so five borough
  // spellings collapse into one city instead of five.
  for (const term of citiesWithAliases()) {
    for (const alias of expandCityAliases(term)) {
      if (normalizeCity(alias) !== normalizeCity(term)) {
        index.set(normalizeCity(alias), normalizeCity(term));
      }
    }
  }
  return index;
}

/** Title-case a normalized city for display ("fort worth" -> "Fort Worth"). */
function toDisplay(normalized: string): string {
  return normalized
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join("-"),
    )
    .join(" ");
}

/**
 * Every city with at least one live provider, with how many.
 *
 * This is the operating map's definition of "a city we have": the cities the
 * public site actually publishes pages for. It is deliberately wider than
 * "cities we launched" — the directory carries rows in places the city
 * pipeline never ran — so callers presenting it as coverage should say which
 * they mean.
 */
export async function getProviderCities(
  db: SupabaseClient,
): Promise<{ cities: ProviderCity[]; truncated: boolean }> {
  const aliases = buildAliasIndex();
  const counts = new Map<string, ProviderCity>();
  let scanned = 0;
  let truncated = false;

  for (;;) {
    if (scanned >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await db
      .from("olera-providers")
      .select("city, state")
      .or("deleted.is.null,deleted.eq.false")
      .not("city", "is", null)
      .not("state", "is", null)
      .range(scanned, scanned + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = (data ?? []) as { city: string | null; state: string | null }[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const rawCity = (row.city ?? "").trim();
      const rawState = (row.state ?? "").trim().toUpperCase();
      if (!rawCity || !rawState) continue;

      const normalized = normalizeCity(rawCity);
      const canonical = aliases.get(normalized) ?? normalized;
      const key = `${rawState}::${canonical}`;

      const existing = counts.get(key);
      if (existing) {
        existing.providers += 1;
      } else {
        counts.set(key, {
          city: toDisplay(canonical),
          state: rawState,
          slug: cityKey(canonical, rawState) ?? `${canonical}-${rawState.toLowerCase()}`,
          providers: 1,
        });
      }
    }

    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  const cities = [...counts.values()].sort(
    (a, b) => b.providers - a.providers || a.city.localeCompare(b.city),
  );
  return { cities, truncated };
}

/** PostgREST puts filters in the URL, so id batches stay short. */
export const PROVIDER_ID_CHUNK = 100;

/**
 * Turn a city slug back into the values providers are actually stored under.
 *
 * "fort-worth-tx" becomes { names: ["Fort Worth"], state: "TX" }. Aliases are
 * expanded, so New York also matches the borough names the directory really
 * uses. A city whose real name contains a hyphen (Winston-Salem) will not
 * round-trip through the slug — a known limit, not a silent one.
 */
export function cityFilterFromSlug(
  slug: string,
): { names: string[]; state: string } | null {
  const match = /^(.+)-([a-z]{2})$/.exec(slug.trim().toLowerCase());
  if (!match) return null;
  const [, cityPart, state] = match;
  const name = cityPart
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  return { names: expandCityAliases(name), state: state.toUpperCase() };
}

/** The subset of the query builder this file needs, kept explicit. */
interface CityFilterable<T> {
  in: (column: string, values: string[]) => T;
  eq: (column: string, value: string) => T;
}

function applyCity<T>(query: T, citySlug: string | null): T {
  if (!citySlug) return query;
  const filter = cityFilterFromSlug(citySlug);
  if (!filter) return query;
  // `in` on the alias list keeps New York's boroughs together; state is an
  // exact match because it is always stored as a two-letter code.
  const q = query as CityFilterable<T>;
  return (q.in("city", filter.names) as unknown as CityFilterable<T>).eq(
    "state",
    filter.state,
  );
}

/**
 * Providers listed, optionally in one city.
 *
 * Same rule as the admin Directory's Published tab and the operating map's
 * city picker: any provider row that has not been deleted. Those three
 * agreeing matters more than any of them being cleverer.
 */
export async function countListedProviders(
  db: SupabaseClient,
  citySlug: string | null = null,
): Promise<number> {
  let query = db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .or("deleted.is.null,deleted.eq.false");
  query = applyCity(query, citySlug);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * A few seconds of memory for the two city scans below.
 *
 * The operating map's trend endpoint asks the same question eight times in
 * one request — once per week of history — and the answer cannot change
 * between them. Without this each week re-reads the whole city. The window
 * is short enough that a provider added or removed shows up on the next
 * page load, which is the same freshness the rest of the console has.
 */
const CITY_SCAN_TTL_MS = 30_000;
const cityScanMemo = new Map<string, { at: number; value: Promise<unknown> }>();

function memoizeCityScan<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = cityScanMemo.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CITY_SCAN_TTL_MS) return hit.value as Promise<T>;

  const value = run().catch((error) => {
    // A failed read must not be remembered, or one blip poisons the window.
    cityScanMemo.delete(key);
    throw error;
  });
  cityScanMemo.set(key, { at: now, value });

  // Drop anything already stale so the map cannot grow without bound.
  for (const [k, v] of cityScanMemo) {
    if (now - v.at >= CITY_SCAN_TTL_MS) cityScanMemo.delete(k);
  }
  return value;
}

/** Every non-deleted provider id in one city. Bounded, like every scan here. */
export function listedProviderIdsInCity(
  db: SupabaseClient,
  citySlug: string,
): Promise<string[]> {
  return memoizeCityScan(`ids:${citySlug}`, () => scanListedProviderIdsInCity(db, citySlug));
}

async function scanListedProviderIdsInCity(
  db: SupabaseClient,
  citySlug: string,
): Promise<string[]> {
  const ids: string[] = [];
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("olera-providers")
      .select("provider_id")
      .or("deleted.is.null,deleted.eq.false");
    query = applyCity(query, citySlug);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { provider_id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) if (r.provider_id) ids.push(r.provider_id);
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return ids;
}

/**
 * Every string a city's providers answer to.
 *
 * Three different tables key the same provider three different ways, and
 * this is not tidy-able from here — it is what the writers do:
 *
 *   provider_activity        the slug, falling back to the directory id
 *   provider_question_asks   whatever the page URL said, so usually the slug
 *   email_log                the linked business_profiles id, where there is
 *                            one, and otherwise the directory id
 *
 * Matching a city against any one of those alone silently drops the rows
 * keyed the other ways — and drops them as zeros, which read as a quiet
 * market rather than as a missed join. So this returns all three kinds and
 * callers test membership instead of equality.
 */
export function providerKeysInCity(
  db: SupabaseClient,
  citySlug: string,
): Promise<Set<string>> {
  return memoizeCityScan(`keys:${citySlug}`, () => scanProviderKeysInCity(db, citySlug));
}

async function scanProviderKeysInCity(
  db: SupabaseClient,
  citySlug: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const directoryIds: string[] = [];
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    let query = db
      .from("olera-providers")
      .select("provider_id, slug")
      .or("deleted.is.null,deleted.eq.false");
    query = applyCity(query, citySlug);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { provider_id: string | null; slug: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.provider_id) {
        keys.add(r.provider_id);
        directoryIds.push(r.provider_id);
      }
      if (r.slug) keys.add(r.slug);
    }
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  // The profile ids these providers are linked to, for the tables that key
  // by profile. Batched because PostgREST carries filters in the URL.
  for (let i = 0; i < directoryIds.length; i += PROVIDER_ID_CHUNK) {
    const { data, error } = await db
      .from("business_profiles")
      .select("id")
      .in("source_provider_id", directoryIds.slice(i, i + PROVIDER_ID_CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string }[]) keys.add(r.id);
  }

  return keys;
}

/**
 * Which of these provider ids have been claimed.
 *
 * Claimed means a business profile exists with an account behind it — the
 * same test the Directory's Unclaimed tab uses. Batched because PostgREST
 * carries filters in the URL.
 */
export async function claimedIdsAmong(
  db: SupabaseClient,
  ids: string[],
): Promise<Set<string>> {
  const claimed = new Set<string>();
  for (let i = 0; i < ids.length; i += PROVIDER_ID_CHUNK) {
    const chunk = ids.slice(i, i + PROVIDER_ID_CHUNK);
    const { data, error } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .not("account_id", "is", null)
      .in("source_provider_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as { source_provider_id: string | null }[]) {
      if (row.source_provider_id) claimed.add(row.source_provider_id);
    }
  }
  return claimed;
}

/**
 * Every provider id that has been claimed.
 *
 * Small next to the directory — claiming is rare — so this is read in full
 * and intersected with the directory rather than counted in place. Counting
 * business profiles alone would include claims pointing at providers since
 * deleted, or at no provider at all, and quietly understate how many
 * providers are still unclaimed.
 */
export async function claimedProviderIds(db: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) break;
    const { data, error } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .not("account_id", "is", null)
      .not("source_provider_id", "is", null)
      .range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { source_provider_id: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) if (r.source_provider_id) ids.push(r.source_provider_id);
    scanned += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  return ids;
}

/** Which of these ids are providers currently listed in the directory. */
export async function listedIdsAmong(
  db: SupabaseClient,
  ids: string[],
): Promise<Set<string>> {
  const listed = new Set<string>();
  for (let i = 0; i < ids.length; i += PROVIDER_ID_CHUNK) {
    const { data, error } = await db
      .from("olera-providers")
      .select("provider_id")
      .or("deleted.is.null,deleted.eq.false")
      .in("provider_id", ids.slice(i, i + PROVIDER_ID_CHUNK));
    if (error) throw error;
    for (const row of (data ?? []) as { provider_id: string | null }[]) {
      if (row.provider_id) listed.add(row.provider_id);
    }
  }
  return listed;
}

/** How many of these ids are providers currently listed in the directory. */
export async function countListedAmong(
  db: SupabaseClient,
  ids: string[],
): Promise<number> {
  return (await listedIdsAmong(db, ids)).size;
}
