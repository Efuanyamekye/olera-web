/**
 * Shared utilities for power pages (category/state/city routes).
 * Maps v1.0 URL slugs ↔ Supabase provider_category values and
 * state abbreviations ↔ URL-friendly state slugs.
 */

import { createServerClient } from "@supabase/ssr";
import {
  type Provider,
  PROVIDERS_TABLE,
  toCardFormat,
  type ProviderCardData,
  getCategoryDisplayName,
  businessProfileToCardFormat,
  mergeProviderCards,
  enrichBpCards,
  SUPABASE_CAT_TO_PROFILE_CATEGORY,
} from "@/lib/types/provider";
import type { BusinessProfile } from "@/lib/types";
import { expandCityAliases } from "@/lib/city-aliases";
import { getStateMedian, getPricingConfig, PRICING_DATA_SOURCE } from "@/lib/pricing-config";

// ============================================================
// Category slug ↔ Supabase mapping
// ============================================================

export interface CategoryConfig {
  slug: string;
  dbValue: string;       // Exact provider_category in Supabase
  displayName: string;   // Human-readable label
  description: string;   // For meta/page content
}

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    slug: "assisted-living",
    dbValue: "Assisted Living",
    displayName: "Assisted Living",
    description: "Assisted living communities provide housing, meals, personal care, and health services for seniors who need help with daily activities but don't require full-time nursing care.",
  },
  {
    slug: "memory-care",
    dbValue: "Memory Care",
    displayName: "Memory Care",
    description: "Memory care facilities specialize in caring for individuals with Alzheimer's disease, dementia, and other memory impairments in a safe, structured environment.",
  },
  {
    slug: "nursing-home",
    dbValue: "Nursing Home",
    displayName: "Nursing Homes",
    description: "Nursing homes provide 24-hour skilled nursing care, rehabilitation services, and medical supervision for seniors with complex health needs.",
  },
  {
    slug: "home-care",
    dbValue: "Home Care (Non-medical)",
    displayName: "Home Care",
    description: "Home care agencies provide non-medical assistance including companionship, meal preparation, light housekeeping, and personal care in the comfort of your loved one's home.",
  },
  {
    slug: "home-health-care",
    dbValue: "Home Health Care",
    displayName: "Home Health Care",
    description: "Home health care agencies provide skilled medical services including nursing, physical therapy, and health monitoring delivered in the patient's home.",
  },
  {
    slug: "independent-living",
    dbValue: "Independent Living",
    displayName: "Independent Living",
    description: "Independent living communities offer active seniors maintenance-free housing with social activities, dining options, and community amenities.",
  },
];

// Also handle these v1.0 slugs — redirect or alias to the primary slug
export const CATEGORY_ALIASES: Record<string, string> = {
  "home-care-non-medical": "home-care",
  "home-health": "home-health-care",                   // short form used in nav/browse filters
  "nursing-homes": "nursing-home",                     // plural form used in nav/browse filters
  "senior-communities": "assisted-living",
  "elder-law-attorney": "assisted-living",             // no DB match — redirect to closest
  "financial-legal-other-services": "assisted-living", // no DB match — redirect to closest
};

const categoryBySlug = new Map(CATEGORY_CONFIGS.map((c) => [c.slug, c]));
const categoryByDbValue = new Map(CATEGORY_CONFIGS.map((c) => [c.dbValue, c]));
// Casing drifts between the pipeline's CATEGORY_MAP and the canonical dbValue
// ("Home Care (Non-Medical)" vs "Home Care (Non-medical)"). Exact match wins;
// this is the fallback so one capital letter can't cost a provider its redirect.
const categoryByDbValueLower = new Map(
  CATEGORY_CONFIGS.map((c) => [c.dbValue.toLowerCase(), c]),
);

export function getCategoryBySlug(slug: string): CategoryConfig | null {
  return categoryBySlug.get(slug) ?? null;
}

/**
 * "Assisted Living" (DB value) → "assisted-living" (URL slug). null when no match.
 *
 * `provider_category` is not always a single value: the directory stores
 * multi-service providers as a pipe-delimited list ("Assisted Living | Memory
 * Care"). An exact-map lookup returns null for those, which sent 229 soft-deleted
 * providers to a 404 instead of the 301 that `buildPowerPageUrlForDeletedProvider`
 * was written to give them. Split and take the first token that maps — the order
 * the provider listed its services in is the best available signal for which
 * power page it belongs on.
 *
 * Widening only adds matches; anything that resolved before still resolves the
 * same way, since a single value has no delimiter to split on.
 */
export function categoryDbValueToSlug(dbValue: string | null): string | null {
  if (!dbValue) return null;
  for (const part of dbValue.split("|")) {
    const trimmed = part.trim();
    const slug =
      categoryByDbValue.get(trimmed)?.slug ??
      categoryByDbValueLower.get(trimmed.toLowerCase())?.slug;
    if (slug) return slug;
  }
  return null;
}

/**
 * Build the most-specific power page URL we can for a (category, state, city)
 * triple. Falls through to /{category}/{state} if city is missing, then to
 * /{category} if state is missing. Returns null if category can't be mapped —
 * caller should fall back to a 404.
 *
 * Used by app/provider/[slug]/page.tsx to build the 301 target for
 * soft-deleted providers (Project 4 / migration 079).
 */
export function buildPowerPageUrlForDeletedProvider(opts: {
  category: string | null;
  state: string | null;
  city: string | null;
}): string | null {
  const categorySlug = categoryDbValueToSlug(opts.category);
  if (!categorySlug) return null;

  const stateSlug = opts.state ? stateAbbrevToSlug(opts.state) : null;
  if (!stateSlug) return `/${categorySlug}`;

  const citySlug = opts.city ? cityToSlug(opts.city) : null;
  if (!citySlug) return `/${categorySlug}/${stateSlug}`;

  return `/${categorySlug}/${stateSlug}/${citySlug}`;
}

export function getResolvedCategorySlug(slug: string): string | null {
  if (categoryBySlug.has(slug)) return slug;
  return CATEGORY_ALIASES[slug] ?? null;
}

// ============================================================
// State abbreviation ↔ URL slug mapping
// ============================================================

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// Reverse: slug → abbreviation (e.g. "texas" → "TX", "new-york" → "NY")
const slugToAbbrev = new Map<string, string>();
const abbrevToSlug = new Map<string, string>();
for (const [abbr, name] of Object.entries(US_STATES)) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  slugToAbbrev.set(slug, abbr);
  abbrevToSlug.set(abbr, slug);
}

export function stateSlugToAbbrev(slug: string): string | null {
  return slugToAbbrev.get(slug) ?? null;
}

export function stateAbbrevToSlug(abbrev: string): string {
  return abbrevToSlug.get(abbrev) ?? abbrev.toLowerCase();
}

export function stateAbbrevToName(abbrev: string): string {
  return US_STATES[abbrev] ?? abbrev;
}

// ============================================================
// City slug utilities
// ============================================================

/** "New York" → "new-york" */
export function cityToSlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * A city page's URL slug loses punctuation ("St. Louis" → "st-louis" →
 * "St Louis"), so an exact match misses the stored name. Matching with a
 * wildcard between words ("St%Louis") finds "St. Louis" and "St Louis" alike.
 * Apostrophes inside a word ("O'Fallon" → "ofallon") still miss; those are the
 * ~10 cities cityHasPowerPage() in lib/provider-breadcrumbs.ts leaves unlinked.
 */
export function cityMatchPattern(city: string): string {
  return city.trim().split(/\s+/).join("%");
}

/** "new-york" → "New York" */
export function citySlugToDisplay(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ============================================================
// Supabase client (cookie-less, for server data fetching)
// ============================================================

function getSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// ============================================================
// Data fetching for power pages
// ============================================================

export interface PowerPageData {
  providers: ProviderCardData[];
  totalCount: number;
  avgLowerPrice: number | null;
  avgUpperPrice: number | null;
  /** True when avgLowerPrice/avgUpperPrice are state-level medians (not from local providers) */
  isStateAverage: boolean;
  /** Category-specific cost context note for SEO content */
  costNote: string | null;
  topCities?: { city: string; count: number }[];
}

/**
 * Fetch providers for a power page with optional category/state/city filters.
 * Returns up to `limit` providers sorted by Olera Score (community_Score) desc.
 */
export async function fetchPowerPageData(opts: {
  category: string;     // Supabase provider_category value
  stateAbbrev?: string; // 2-letter state code
  city?: string;        // Title-cased city name
  limit?: number;
}): Promise<PowerPageData | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { category, stateAbbrev, city, limit = 24 } = opts;

  // Build query for provider listing
  let query = supabase
    .from(PROVIDERS_TABLE)
    .select("*", { count: "exact" })
    .eq("provider_category", category)
    .or("deleted.is.null,deleted.eq.false");

  if (stateAbbrev) query = query.eq("state", stateAbbrev);
  // Expand city aliases (e.g. "New York" → boroughs, "Butte" → "Butte-Silver Bow")
  const cityNames = city ? expandCityAliases(city) : null;
  if (cityNames) {
    if (cityNames.length === 1) {
      query = query.ilike("city", cityMatchPattern(cityNames[0]));
    } else {
      query = query.in("city", cityNames);
    }
  }

  query = query
    .order("community_Score", { ascending: false, nullsFirst: false })
    .order("google_rating", { ascending: false, nullsFirst: false })
    .limit(limit);

  // Build parallel business_profiles query for approved providers
  const profileCategory = SUPABASE_CAT_TO_PROFILE_CATEGORY[category];
  let bpQuery = profileCategory
    ? supabase
        .from("business_profiles")
        .select("*", { count: "exact" })
        .eq("claim_state", "claimed")
        .eq("is_active", true)
        .eq("type", "organization")
        .eq("category", profileCategory)
    : null;

  if (bpQuery) {
    if (stateAbbrev) bpQuery = (bpQuery as any).eq("state", stateAbbrev);
    if (cityNames) {
      if (cityNames.length === 1) {
        bpQuery = (bpQuery as any).ilike("city", cityMatchPattern(cityNames[0]));
      } else {
        bpQuery = (bpQuery as any).in("city", cityNames);
      }
    }
    bpQuery = (bpQuery as any).order("created_at", { ascending: false }).limit(limit);
  }

  // Run both queries in parallel
  const [seededResult, bpResult] = await Promise.all([
    query,
    bpQuery ?? Promise.resolve({ data: null, count: 0 }),
  ]);

  const { data: providers, count } = seededResult;
  if (!providers) return null;

  const bpProviders = (bpResult.data as BusinessProfile[] | null) ?? [];

  // Convert and merge
  const seededCards = (providers as Provider[]).map(toCardFormat);
  const bpCards = bpProviders.map(businessProfileToCardFormat);
  const bpSourceIds = bpProviders.map((bp) => bp.source_provider_id);
  const dedupeSourceIds = new Set(
    bpSourceIds.filter((id): id is string => id != null)
  );

  // Enrich BP cards with images/pricing/rating from the seeded providers they replace
  enrichBpCards(bpCards, seededCards, bpSourceIds);

  const mergedCards = mergeProviderCards(seededCards, bpCards, dedupeSourceIds);

  // Category-specific pricing config (needed for avg price suppression + cost note)
  const pricingConfig = getPricingConfig(opts.category);

  // Compute average prices with minimum sample size requirement
  // Tier 3 categories (Home Health, Nursing Home, Hospice) suppress dollar amounts —
  // coverage education is more useful than misleading price averages.
  const MIN_SAMPLE_SIZE = 5;
  let avgLowerPrice: number | null = null;
  let avgUpperPrice: number | null = null;
  let isStateAverage = false;

  if (pricingConfig.tier !== 3) {
    // Use proper null checks so $0 prices aren't excluded
    const priced = (providers as Provider[]).filter((p) => p.lower_price != null && p.upper_price != null);

    if (priced.length >= MIN_SAMPLE_SIZE) {
      // Enough local data — use provider-based average
      avgLowerPrice = Math.round(priced.reduce((s, p) => s + (p.lower_price ?? 0), 0) / priced.length);
      avgUpperPrice = Math.round(priced.reduce((s, p) => s + (p.upper_price ?? 0), 0) / priced.length);
    } else if (opts.stateAbbrev) {
      // Not enough local data — fall back to state-level median
      const stateMedian = getStateMedian(opts.category, opts.stateAbbrev);
      if (stateMedian) {
        avgLowerPrice = Math.round(stateMedian.value * 0.85);
        avgUpperPrice = Math.round(stateMedian.value * 1.15);
        isStateAverage = true;
      }
    }
  }

  const costNote = pricingConfig.cityPageNote;

  return {
    providers: mergedCards,
    totalCount: (count ?? providers.length) + (bpResult.count ?? 0),
    avgLowerPrice,
    avgUpperPrice,
    isStateAverage,
    costNote,
  };
}

/**
 * Fetch top cities for a category+state combination.
 * Used on state pages to list cities with provider counts.
 */
export async function fetchTopCities(
  category: string,
  stateAbbrev: string,
  limit = 50
): Promise<{ city: string; count: number }[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  // Supabase doesn't support GROUP BY directly, so fetch distinct cities with counts
  // via RPC or by fetching city column and counting client-side
  const { data } = await supabase
    .from(PROVIDERS_TABLE)
    .select("city")
    .eq("provider_category", category)
    .eq("state", stateAbbrev)
    .or("deleted.is.null,deleted.eq.false")
    .not("city", "is", null);

  if (!data) return [];

  // Count occurrences
  const counts = new Map<string, number>();
  for (const row of data) {
    const c = row.city as string;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Fetch all distinct state abbreviations that have providers for a category.
 */
export async function fetchStatesForCategory(
  category: string
): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data } = await supabase
    .from(PROVIDERS_TABLE)
    .select("state")
    .eq("provider_category", category)
    .or("deleted.is.null,deleted.eq.false")
    .not("state", "is", null);

  if (!data) return [];

  const states = new Set<string>();
  for (const row of data) {
    if (row.state) states.add(row.state as string);
  }

  return Array.from(states).sort();
}

// Re-export for convenience
export { getCategoryDisplayName };
