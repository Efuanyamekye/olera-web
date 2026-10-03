import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleReviewsData } from "@/lib/types";
import { fetchGoogleReviews } from "@/lib/google-places";
import type { RefreshCandidate } from "./review-refresh-plan";

/**
 * Google-reviews refresh cron data access — behind the front door.
 *
 * The monthly `google-reviews` cron reads which providers to refresh and writes
 * the refreshed cache back, and every "refresh my Google reviews" button
 * (provider, admin, on-view) runs through `refreshGoogleReviews` here. This is the first provider-table WRITE to move
 * behind the door (`updateProviderGoogleReviews`); the reads come along so the
 * cron touches no `.from("olera-providers"/"business_profiles")` directly.
 * Relocated parity-first from `app/api/cron/google-reviews/route.ts`.
 */

/**
 * Directory ids (`olera-providers.provider_id`) of providers whose page is
 * claimed. Matched by `source_provider_id`, not slug: a claimed account's slug
 * carries a suffix for about one in ten providers ("-e24d", "-3p5y"), and the
 * old slug match left those out of the claimed tier.
 */
export async function getClaimedProviderIds(db: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .eq("claim_state", "claimed")
      .not("source_provider_id", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ source_provider_id: string }>) ids.add(row.source_provider_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

export type { RefreshCandidate as ReviewRefreshProvider } from "./review-refresh-plan";

/**
 * Every active provider with a `place_id`, as lean rows: only the sync date
 * is read out of the JSONB, not the cached reviews. Paged through the whole
 * table (70,390 rows on 2 Oct 2026); the old single `.limit(5000)` query saw
 * an arbitrary 7% of the directory each month and the rest never aged out.
 */
export async function getProvidersForReviewRefresh(db: SupabaseClient): Promise<RefreshCandidate[]> {
  const PAGE = 1000;
  // Eight pages at a time: 71 pages read one after another took 80s on 2 Oct,
  // too much of the cron's 300s once the Google calls follow.
  const CONCURRENCY = 8;
  const base = () => db
    .from("olera-providers")
    .select("provider_id, place_id, last_viewed_at, last_synced:google_reviews_data->>last_synced")
    .eq("deleted", false)
    .not("place_id", "is", null)
    .order("provider_id");
  const { count, error: countError } = await db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .eq("deleted", false)
    .not("place_id", "is", null);
  if (countError) {
    console.error("[google-reviews-cron] Failed to count providers:", countError);
    throw countError;
  }
  const pages = Math.ceil((count ?? 0) / PAGE);
  const out: RefreshCandidate[] = [];
  for (let first = 0; first < pages; first += CONCURRENCY) {
    const results = await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pages - first) }, (_, i) => base().range((first + i) * PAGE, (first + i + 1) * PAGE - 1)),
    );
    for (const { data, error } of results) {
      if (error) {
        console.error("[google-reviews-cron] Failed to fetch providers:", error);
        throw error;
      }
      out.push(...((data ?? []) as unknown as RefreshCandidate[]));
    }
  }
  return out;
}

export type RefreshTarget =
  /** A directory row: the cache lives in `olera-providers.google_reviews_data`. */
  | { source: "ios"; providerId: string; placeId: string }
  /** A user-created account with no directory row: the cache lives in `business_profiles.metadata.google_reviews_data`. */
  | { source: "bp"; providerId: string; placeId: string };

export type RefreshOutcome =
  | { refreshed: true; data: GoogleReviewsData }
  | { refreshed: false; reason: "too_soon"; nextAllowedAt: string; data: GoogleReviewsData | null }
  | { refreshed: false; reason: "google_empty" | "google_error"; data: GoogleReviewsData | null };

/** The cached record for a target, from whichever table holds it. */
export async function readGoogleReviews(db: SupabaseClient, target: RefreshTarget): Promise<GoogleReviewsData | null> {
  if (target.source === "bp") {
    const { data } = await db.from("business_profiles").select("metadata").eq("id", target.providerId).maybeSingle();
    return ((data?.metadata as { google_reviews_data?: GoogleReviewsData } | null)?.google_reviews_data) ?? null;
  }
  const { data } = await db.from("olera-providers").select("google_reviews_data").eq("provider_id", target.providerId).maybeSingle();
  return (data?.google_reviews_data as GoogleReviewsData | null) ?? null;
}

async function writeGoogleReviews(db: SupabaseClient, target: RefreshTarget, data: GoogleReviewsData): Promise<void> {
  if (target.source === "bp") {
    const { data: bp } = await db.from("business_profiles").select("metadata").eq("id", target.providerId).single();
    const existingMeta = (bp?.metadata as Record<string, unknown>) ?? {};
    const { error } = await db.from("business_profiles").update({ metadata: { ...existingMeta, google_reviews_data: data } }).eq("id", target.providerId);
    if (error) throw error;
    return;
  }
  await updateProviderGoogleReviews(target.providerId, data, db);
}

/**
 * Re-sync one provider's Google rating and review count, the same call for
 * every surface: the provider's own "Refresh reviews" button, the admin
 * button, the on-view refresh of a stale claimed page, and the backfill of a
 * page with no cache. `minDays` is how old the cache must be before Google is
 * called again (0 for a backfill, 7 for a button, 90 for an on-view refresh);
 * `force` ignores it. When Google returns nothing, `writeSentinel` stores an
 * empty record so a page with no cache stops re-triggering the fetch.
 */
export async function refreshGoogleReviews(
  db: SupabaseClient,
  target: RefreshTarget,
  options: { minDays?: number; force?: boolean; writeSentinel?: boolean; now?: Date } = {},
): Promise<RefreshOutcome> {
  const now = options.now ?? new Date();
  const existing = await readGoogleReviews(db, target);
  const minDays = options.minDays ?? 0;
  if (!options.force && existing?.last_synced && minDays > 0) {
    const next = Date.parse(existing.last_synced) + minDays * 86_400_000;
    if (next > now.getTime()) return { refreshed: false, reason: "too_soon", nextAllowedAt: new Date(next).toISOString(), data: existing };
  }
  const fresh = await fetchGoogleReviews(target.placeId);
  if (!fresh) {
    if (options.writeSentinel && !existing) {
      await writeGoogleReviews(db, target, { rating: 0, review_count: 0, reviews: [], last_synced: now.toISOString() });
    }
    return { refreshed: false, reason: "google_empty", data: existing };
  }
  await writeGoogleReviews(db, target, fresh);
  return { refreshed: true, data: fresh };
}

/**
 * Write the refreshed Google reviews cache for one provider. Throws on error so
 * the cron's per-provider `Promise.allSettled` records it as a failure (matching
 * the original inline update).
 */
export async function updateProviderGoogleReviews(
  providerId: string,
  data: GoogleReviewsData,
  db: SupabaseClient,
): Promise<void> {
  const { error } = await db
    .from("olera-providers")
    .update({ google_reviews_data: data })
    .eq("provider_id", providerId);

  if (error) {
    console.error(`[google-reviews-cron] Update failed for ${providerId}:`, error);
    throw error;
  }
}
