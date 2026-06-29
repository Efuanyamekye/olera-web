import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countActiveProvidersInArea,
  countRecentProvidersInArea,
  getTopRatedProvidersByCityState,
  getTopRatedProvidersByState,
} from "@/lib/providers";

/**
 * Area-aware provider recommendation helpers for family nudge emails — shared by the
 * family-comms-coordinator (completion track) and the family-nudges engine (publish /
 * monthly recommendations). Orchestration layer over the raw `lib/providers` queries:
 * the family-care-type → olera-providers-category mapping, the in-memory per-run caches,
 * the city→state fallback, and the ProviderRec transform.
 *
 * Relocated from app/api/cron/family-nudges/route.ts (parity-preserving) so the coordinator
 * can render completion nudges without duplicating the machinery. See plans/family-comms-system.md.
 */

// ── Care type mapping: family profile → olera-providers ──
export const CARE_TYPE_TO_CATEGORY: Record<string, string> = {
  "Home Care": "Home Care (Non-medical)",
  "Home Health Care": "Home Health Care",
  "Assisted Living": "Assisted Living",
  "Memory Care": "Memory Care",
  "Nursing Home": "Nursing Home",
  "Independent Living": "Independent Living",
  "Hospice Care": "Hospice",
  "Adult Day Care": "Adult Day Care",
};

export interface ProviderRec {
  name: string;
  category: string;
  slug: string;
  rating: number;
  reviewCount: number;
  reviewSnippet: string | null;
  city: string;
  state: string;
  priceRange: string | null;
}

const providerCountCache = new Map<string, number>();
const topProviderCache = new Map<string, ProviderRec[]>();
const newProviderCountCache = new Map<string, number>();

function cacheKey(city: string, state: string, careTypes: string[]): string {
  return `${city}|${state}|${[...careTypes].sort().join(",")}`;
}

function toCategories(careTypes: string[]): string[] {
  return careTypes.map((ct) => CARE_TYPE_TO_CATEGORY[ct]).filter(Boolean);
}

export async function countProvidersInArea(
  db: SupabaseClient,
  city: string,
  state: string,
  careTypes: string[],
): Promise<number> {
  const key = cacheKey(city, state, careTypes);
  if (providerCountCache.has(key)) return providerCountCache.get(key)!;
  const result = await countActiveProvidersInArea(db, state, city, toCategories(careTypes));
  providerCountCache.set(key, result);
  return result;
}

/**
 * Count providers that joined in the last 30 days for a given area — fresh
 * "new providers" content for maintenance emails.
 */
export async function countNewProvidersInArea(
  db: SupabaseClient,
  city: string,
  state: string,
  careTypes: string[],
): Promise<number> {
  const key = `new-${cacheKey(city, state, careTypes)}`;
  if (newProviderCountCache.has(key)) return newProviderCountCache.get(key)!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await countRecentProvidersInArea(db, state, city, toCategories(careTypes), thirtyDaysAgo);
  newProviderCountCache.set(key, result);
  return result;
}

export async function getTopProviders(
  db: SupabaseClient,
  city: string,
  state: string,
  careTypes: string[],
  limit = 4,
): Promise<ProviderRec[]> {
  const key = cacheKey(city, state, careTypes);
  if (topProviderCache.has(key)) return topProviderCache.get(key)!;

  const categories = toCategories(careTypes);

  // Try city + state first, fall back to state-only if too few results.
  let providers = await getTopRatedProvidersByCityState(db, state, city, categories, limit);
  if (providers.length < 2) {
    const stateProviders = await getTopRatedProvidersByState(db, state, categories, limit);
    if (stateProviders.length > providers.length) providers = stateProviders;
  }

  const results: ProviderRec[] = providers.map((p) => {
    const grd = p.google_reviews_data as {
      rating?: number;
      review_count?: number;
      reviews?: { text?: string }[];
    } | null;

    const meta = p.metadata as Record<string, unknown> | null;
    let priceRange: string | null = null;
    if (meta?.price_range) {
      priceRange = meta.price_range as string;
    } else if (meta?.lower_price && meta?.upper_price) {
      priceRange = `$${(meta.lower_price as number).toLocaleString()}–${(meta.upper_price as number).toLocaleString()}/mo`;
    } else if (meta?.contact_for_pricing) {
      priceRange = "Contact for pricing";
    }

    return {
      name: p.provider_name,
      category: p.provider_category,
      slug: p.slug || p.provider_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      rating: grd?.rating ?? p.google_rating ?? 0,
      reviewCount: grd?.review_count ?? 0,
      reviewSnippet: grd?.reviews?.[0]?.text?.slice(0, 150) ?? null,
      city: p.city ?? "",
      state: p.state ?? "",
      priceRange,
    };
  });

  topProviderCache.set(key, results);
  return results;
}
