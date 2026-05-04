/**
 * Top providers lookup for the AgentOutreachModule (H1 demand-test surface).
 *
 * Ships visual proof for the outreach arm of the SBF intake A/B test:
 * "Have an AI agent contact the top providers in [city] for you" + 3 mini
 * cards of real providers. Cards are determined server-side and round-trip
 * back to POST /api/outreach/request as `target_provider_ids` so we have
 * an audit trail of which 3 providers each request was anchored to.
 *
 * Scope is intentionally narrow:
 *   - Same city + same category, excluding the source provider (D1)
 *   - Composite ranking that privileges enriched providers (D2)
 *   - Falls back to state-level when a city is too small (D3)
 *   - 10-minute in-memory cache by (city, state, category) — providers
 *     don't move and the provider page is high-traffic; uncached queries
 *     would compound under load
 *
 * Returns the same ProviderCardData shape that BrowseCard consumes so the
 * mini-card has parity with existing card components.
 *
 * See plans/agent-outreach-cta-workbook.md for the full spec.
 */

import { createClient } from "@/lib/supabase/server";
import {
  PROVIDERS_TABLE,
  toCardFormat,
  type Provider,
  type ProviderCardData,
} from "@/lib/types/provider";
import { buildHighlights } from "@/lib/provider-highlights";
import type { ClaimState, VerificationState } from "@/lib/types";

interface GetTopProvidersOpts {
  /** City name as stored in olera-providers.city (Title Case, e.g. "Austin"). */
  city: string;
  /** 2-letter state abbreviation (e.g. "TX"). */
  state: string;
  /** olera-providers.provider_category value (e.g. "Memory Care"). */
  category: string;
  /** Source provider ID to exclude from results (the page the visitor is on). */
  excludeProviderId?: string;
  /** Default 3. */
  limit?: number;
}

interface CacheEntry {
  data: ProviderCardData[];
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE = new Map<string, CacheEntry>();

function cacheKey(opts: Pick<GetTopProvidersOpts, "city" | "state" | "category">): string {
  return `${opts.state.toUpperCase()}|${opts.city.toLowerCase()}|${opts.category}`;
}

/**
 * Claim/verification weight per D2. Privileges providers more likely to
 * actually reply when contacted: verified providers (a real human owns the
 * page) > claimed (an account links it) > unclaimed (no human attached).
 */
function claimedStatusWeight(claimState: ClaimState | undefined, verificationState: VerificationState | undefined): number {
  if (verificationState === "verified") return 1.5;
  if (claimState === "claimed") return 1.2;
  return 1.0;
}

/**
 * Composite score per D2 in plans/agent-outreach-cta-plan.md.
 *
 *   score = claimed_status_weight × rating × log(review_count + 1) × completeness
 *
 * Completeness uses the highlights system as a proxy: 0.5 floor for unenriched
 * providers, scales up to 1.0 for providers with ≥4 verified trust signals
 * (Tier 1-4 of buildHighlights). Floor avoids zeroing out small-city pools
 * where nobody is enriched yet.
 */
function scoreProvider(provider: Provider, weight: number): number {
  const rating = provider.google_reviews_data?.rating ?? provider.google_rating ?? 0;
  const reviewCount = provider.google_reviews_data?.review_count ?? 0;

  const highlights = buildHighlights({
    trustSignals: provider.ai_trust_signals,
    googleReviews: provider.google_reviews_data,
    cmsData: provider.cms_data,
    category: provider.provider_category,
    maxItems: 4,
    skipCapability: true, // capability is a Tier 5 fallback, not a verified signal
  });
  const completeness = 0.5 + (Math.min(highlights.length, 4) / 4) * 0.5; // 0.5..1.0

  return weight * rating * Math.log(reviewCount + 1) * completeness;
}

interface ClaimRow {
  source_provider_id: string | null;
  claim_state: ClaimState;
  verification_state: VerificationState;
  is_active: boolean;
}

/**
 * Best claim weight per source_provider_id across the matched business_profiles
 * pool. A single olera-providers row can have multiple business_profiles
 * pointing at it (legacy + reclaim paths); take the strongest signal.
 */
function buildClaimWeightMap(rows: ClaimRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.source_provider_id) continue;
    if (!row.is_active) continue;
    const w = claimedStatusWeight(row.claim_state, row.verification_state);
    const existing = map.get(row.source_provider_id) ?? 1.0;
    if (w > existing) map.set(row.source_provider_id, w);
  }
  return map;
}

function rankAndTrim(
  providers: Provider[],
  weights: Map<string, number>,
  excludeProviderId: string | undefined,
  limit: number,
): ProviderCardData[] {
  // Precompute score once per provider — buildHighlights is non-trivial and a
  // sort comparator runs O(n log n) times. With n=20 we'd burn ~140 highlight
  // builds per sort otherwise.
  const scored = providers
    .filter((p) => {
      if (p.deleted) return false;
      if (excludeProviderId && p.provider_id === excludeProviderId) return false;
      if (!p.provider_name) return false;
      return true;
    })
    .map((p) => ({
      provider: p,
      score: scoreProvider(p, weights.get(p.provider_id) ?? 1.0),
      rating: p.google_rating ?? 0,
      reviewCount: p.google_reviews_data?.review_count ?? 0,
    }));

  // Sort by composite score descending. Ties broken by rating then review
  // count so identical scores don't shuffle on each request.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.reviewCount - a.reviewCount;
  });

  return scored.slice(0, limit).map((s) => toCardFormat(s.provider));
}

/**
 * Fetch the top N providers in `city + state + category`, excluding the
 * source provider, ranked by the D2 composite formula. Falls back to
 * state-level when the city has fewer than `limit` matches.
 *
 * Cached for 10 minutes by (city, state, category). Cache hits return the
 * pre-built ProviderCardData array directly.
 *
 * Returns [] if neither pass yields any results — the caller (provider
 * page or AgentOutreachModule) is responsible for hiding the surface
 * gracefully when there are no candidates.
 */
export async function getTopProvidersByCityAndCategory(
  opts: GetTopProvidersOpts,
): Promise<ProviderCardData[]> {
  const { city, state, category, excludeProviderId, limit = 3 } = opts;

  const key = cacheKey({ city, state, category });
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (excludeProviderId) {
      // Cache key omits exclusion; filter at read time. Keeps the cache hit
      // rate high (multiple providers in the same city share a key).
      return cached.data.filter((c) => c.id !== excludeProviderId).slice(0, limit);
    }
    return cached.data.slice(0, limit);
  }

  const supabase = await createClient();

  // Pass 1: same city + same category. Pull a wider pool than `limit` so the
  // ranking has signal to work with — top-3-by-rating alone misses well-
  // reviewed providers behind a single 5★ no-review walk-in.
  const POOL_SIZE = 20;
  const cityResult = await supabase
    .from(PROVIDERS_TABLE)
    .select("*")
    .not("deleted", "is", true)
    .eq("provider_category", category)
    .eq("state", state)
    .ilike("city", city)
    .order("google_rating", { ascending: false, nullsFirst: false })
    .limit(POOL_SIZE);

  let pool = (cityResult.data as Provider[] | null) ?? [];

  // Pass 2: state-level fallback when the city doesn't have enough candidates.
  // Each card's `address` field surfaces the actual city so the visitor can
  // tell when a card isn't local-local.
  if (pool.filter((p) => !excludeProviderId || p.provider_id !== excludeProviderId).length < limit) {
    const stateResult = await supabase
      .from(PROVIDERS_TABLE)
      .select("*")
      .not("deleted", "is", true)
      .eq("provider_category", category)
      .eq("state", state)
      .order("google_rating", { ascending: false, nullsFirst: false })
      .limit(POOL_SIZE);
    pool = (stateResult.data as Provider[] | null) ?? pool;
  }

  // Pull claim/verification status for the candidate pool in a single query.
  // claimed/verified providers are more likely to actually reply when
  // contacted, so they get rank weight.
  const poolIds = pool.map((p) => p.provider_id).filter(Boolean);
  let weights = new Map<string, number>();
  if (poolIds.length > 0) {
    const claimResult = await supabase
      .from("business_profiles")
      .select("source_provider_id, claim_state, verification_state, is_active")
      .in("source_provider_id", poolIds);
    const rows = (claimResult.data as ClaimRow[] | null) ?? [];
    weights = buildClaimWeightMap(rows);
  }

  const ranked = rankAndTrim(pool, weights, excludeProviderId, limit);

  // Cache the unfiltered top-of-pool so adjacent provider pages (different
  // excludeProviderId, same city/state/category) still hit. We re-slice on
  // read.
  const cacheable = rankAndTrim(pool, weights, undefined, limit + 1); // +1 buffer for exclusion at read time
  CACHE.set(key, { data: cacheable, expiresAt: Date.now() + CACHE_TTL_MS });

  return ranked;
}

/** Test/dev hook to clear the in-memory cache. Not used in production. */
export function __clearAgentOutreachCache() {
  CACHE.clear();
}
