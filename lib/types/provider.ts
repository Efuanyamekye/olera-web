/**
 * Provider Types
 *
 * Matches the iOS Supabase `olera-providers` table schema exactly.
 * The web app uses this schema directly - no adapter needed.
 *
 * Table: olera-providers (39,355+ records)
 */

import { generateProviderSlug } from "@/lib/slugify";
import type { BusinessProfile, ProfileCategory, GoogleReviewsData, CMSData, AiTrustSignals } from "@/lib/types";
import { getRegionalEstimate, getPricingConfig } from "@/lib/pricing-config";
import { buildHighlights } from "@/lib/provider-highlights";

export interface Provider {
  provider_id: string;
  provider_name: string;
  provider_category: string;
  main_category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_rating: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: number | null;
  lat: number | null;
  lon: number | null;
  place_id: string | null;
  provider_images: string | null; // Pipe-separated URLs: "url1 | url2 | url3"
  provider_logo: string | null;
  provider_description: string | null;
  community_Score: number | null;
  value_score: number | null;
  information_availability_score: number | null;
  lower_price: number | null;
  upper_price: number | null;
  contact_for_price: string | null; // "True" or "False"
  deleted: boolean;
  deleted_at: string | null;
  deletion_reason: "data_sweep" | "provider_request" | "duplicate" | "out_of_scope" | "other" | null;
  parent_organization: { name: string; url?: string } | null; // Franchise parent brand for schema.org parentOrganization (migration 101)
  hero_image_url: string | null;
  slug: string | null; // Human-readable URL slug (populated via migration)
  google_reviews_data: GoogleReviewsData | null; // Cached Google review snippets (JSONB)
  cms_data: CMSData | null; // CMS Medicare quality data (JSONB)
  ai_trust_signals: AiTrustSignals | null; // AI-verified trust signals (JSONB)
  last_viewed_at: string | null; // Tracks page views for tiered refresh
}

/**
 * Parse pipe-separated images string into array
 */
export function parseProviderImages(images: string | null): string[] {
  if (!images) return [];
  return images.split(" | ").filter(Boolean);
}

/** Categories where pricing is per-hour rather than per-month */
const HOURLY_CATEGORIES = new Set([
  "Home Care (Non-medical)",
  "Home Health Care",
]);

/**
 * Format price range for display
 */
export function formatPriceRange(provider: Provider): string | null {
  const suffix = HOURLY_CATEGORIES.has(provider.provider_category) ? "/hr" : "/mo";
  // Use proper null checks (not truthy) so $0 prices aren't lost
  if (provider.lower_price != null && provider.upper_price != null) {
    if (provider.upper_price > provider.lower_price) {
      // Valid range: show both
      return `$${provider.lower_price.toLocaleString()} - $${provider.upper_price.toLocaleString()}${suffix}`;
    }
    if (provider.upper_price === provider.lower_price) {
      // Equal prices: show single price
      return `$${provider.lower_price.toLocaleString()}${suffix}`;
    }
    // upper < lower is a data issue; fall through to lower-only
  }
  if (provider.lower_price != null) {
    return `From $${provider.lower_price.toLocaleString()}${suffix}`;
  }
  if (provider.upper_price != null) {
    return `Up to $${provider.upper_price.toLocaleString()}${suffix}`;
  }
  if (provider.contact_for_price === "True") {
    return "Contact for pricing";
  }
  return null;
}

/**
 * Get primary image for card hero display.
 * Prefers classified hero, then facility photos, then logo as fallback.
 * Priority: hero_image_url → provider_images[0] → provider_logo → null
 */
export function getPrimaryImage(provider: Provider): string | null {
  if (provider.hero_image_url) return provider.hero_image_url;
  const images = parseProviderImages(provider.provider_images);
  if (images[0]) return images[0];
  if (provider.provider_logo) return provider.provider_logo;
  return null;
}

/**
 * Format location string
 */
export function formatLocation(provider: Provider): string {
  const parts = [provider.city, provider.state].filter(Boolean);
  return parts.join(", ");
}

/**
 * Category display names
 */
export const categoryDisplayNames: Record<string, string> = {
  "Home Care (Non-medical)": "Home Care",
  "Home Health Care": "Home Health",
  "Assisted Living": "Assisted Living",
  "Independent Living": "Independent Living",
  "Memory Care": "Memory Care",
  "Nursing Home": "Nursing Home",
  "Assisted Living | Independent Living": "Assisted Living",
  "Memory Care | Assisted Living": "Memory Care",
};

/**
 * Get display name for category
 */
export function getCategoryDisplayName(category: string | null): string {
  if (!category) return "Senior Care";
  return categoryDisplayNames[category] || category;
}

/**
 * The Supabase table name
 */
export const PROVIDERS_TABLE = "olera-providers";

/**
 * Type for provider card display data
 */
export type CardImageType = "photo" | "logo" | "placeholder";

export interface ProviderCardData {
  id: string;
  slug: string;
  name: string;
  image: string;
  imageType: CardImageType;
  images: string[];
  address: string;
  rating: number;
  reviewCount?: number;
  priceRange: string;
  primaryCategory: string;
  careTypes: string[];
  highlights: string[];
  acceptedPayments: string[];
  verified: boolean;
  badge?: string;
  description?: string;
  lat?: number | null;
  lon?: number | null;
  cmsRating?: number | null;
  cmsSource?: string | null;
  trustSignalCount?: number; // count of AI-confirmed trust signals
  /** True when priceRange is a regional estimate, not provider-entered */
  isRegionalEstimate?: boolean;
  /** True when regional estimate uses metro-level adjustment (vs flat state average) */
  isMetroAdjusted?: boolean;
  /** Raw provider_category for pricing tier logic (e.g., "Nursing Home", "nursing_home") */
  providerCategory?: string;
  /** Category stock photo URL — rendered when `image` fails to load at runtime. */
  fallbackImage?: string;
}

/** URL patterns that strongly suggest a logo rather than a facility photo */
const LOGO_URL_PATTERNS = [
  /\/logo/i, /logo[._-]/i, /_logo/i, /-logo/i,
  /\/brand/i, /\/icon/i, /favicon/i,
];

/**
 * Detect whether a URL is likely a logo image.
 * Checks against provider_logo field and URL patterns.
 */
function isLikelyLogo(url: string, provider: Provider): boolean {
  // Exact match with the provider_logo field
  if (provider.provider_logo && url === provider.provider_logo) return true;
  // URL pattern heuristics
  return LOGO_URL_PATTERNS.some((p) => p.test(url));
}

/**
 * Category → pool of curated fallback photos.
 *
 * All images are provably-licensed (Pexels + Unsplash) senior-care photos. Every file
 * referenced here MUST have a matching entry in
 * `public/images/fallback/CREDITS.json` (enforced by
 * `scripts/check-fallback-licenses.js`). Do not add a path here without
 * recording its license in that manifest first.
 *
 * Pools hold distinct scenes (near-identical series are deduped) so the
 * per-provider pick — deterministic via hashString — spreads providers across
 * varied imagery instead of repeating. Independent Living is the thinnest
 * category and leans on social assisted-living backfill (see its pool).
 */
const HOME_CARE_POOL = [
  "/images/fallback/home-care-01.jpg",
  "/images/fallback/home-care-02.jpg",
  "/images/fallback/home-care-03.jpg",
  "/images/fallback/home-care-04.jpg",
  "/images/fallback/home-care-06.jpg",
  "/images/fallback/home-care-07.jpg",
  "/images/fallback/home-care-08.jpg",
  "/images/fallback/home-care-09.jpg",
  "/images/fallback/home-care-10.jpg",
  "/images/fallback/home-care-11.jpg",
  "/images/fallback/home-care-13.jpg",
  "/images/fallback/home-care-14.jpg",
  // Caregivers in scrubs (Unsplash) — professional-care signal, blended with
  // the domestic shots above; domestic-only ones to be diluted out over time.
  "/images/fallback/home-care-15.jpg",
  "/images/fallback/home-care-16.jpg",
  "/images/fallback/home-care-17.jpg",
  "/images/fallback/home-care-18.jpg",
];

const ASSISTED_LIVING_POOL = [
  "/images/fallback/assisted-living-01.jpg",
  "/images/fallback/assisted-living-02.jpg",
  "/images/fallback/assisted-living-03.jpg",
  "/images/fallback/assisted-living-04.jpg",
  "/images/fallback/assisted-living-05.jpg",
  "/images/fallback/assisted-living-06.jpg",
];

const NURSING_HOME_POOL = [
  "/images/fallback/nursing-home-01.jpg",
  "/images/fallback/nursing-home-02.jpg",
  "/images/fallback/nursing-home-03.jpg",
  "/images/fallback/nursing-home-04.jpg",
  "/images/fallback/nursing-home-05.jpg",
  "/images/fallback/nursing-home-09.jpg", // navy-scrubs bedside care (Unsplash)
  "/images/fallback/nursing-home-10.jpg", // clinical scrubs team (Unsplash)
];

const GENERAL_POOL = [
  "/images/fallback/general-02.jpg",
  "/images/fallback/general-03.jpg",
  "/images/fallback/general-04.jpg",
];

// Memory care: 5 tender / gentle-touch / comfort scenes that read as
// compassionate dementia care.
const MEMORY_CARE_POOL = [
  "/images/fallback/memory-care-01.jpg",
  "/images/fallback/memory-care-02.jpg",
  "/images/fallback/memory-care-03.jpg",
  "/images/fallback/memory-care-04.jpg",
  "/images/fallback/memory-care-05.jpg",
];

// Independent living is the thinnest category in our current library (the set
// skews care-heavy). Two lifestyle photos + two social assisted-living scenes
// as the closest-fitting backfill. Candidate for targeted re-sourcing.
const INDEPENDENT_LIVING_POOL = [
  "/images/fallback/independent-living-01.jpg",
  "/images/fallback/independent-living-02.jpg",
  "/images/fallback/assisted-living-04.jpg",
  "/images/fallback/assisted-living-05.jpg",
];

const CATEGORY_FALLBACK_POOLS: Record<string, string[]> = {
  "Home Care (Non-medical)": HOME_CARE_POOL,
  "Home Health Care": HOME_CARE_POOL,
  "Assisted Living": ASSISTED_LIVING_POOL,
  "Memory Care": MEMORY_CARE_POOL,
  "Independent Living": INDEPENDENT_LIVING_POOL,
  "Nursing Home": NURSING_HOME_POOL,
  "Hospice": HOME_CARE_POOL,
  "Assisted Living | Independent Living": ASSISTED_LIVING_POOL,
  "Memory Care | Assisted Living": MEMORY_CARE_POOL,
};

const DEFAULT_FALLBACK_POOL = GENERAL_POOL;

/**
 * Simple deterministic hash of a string → number.
 * Used to pick a stable fallback image per provider so the same provider
 * always shows the same stock photo (avoids hydration mismatches and
 * layout shift), but different providers get different images.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getCategoryFallbackImage(category: string, providerId: string): string {
  const pool = CATEGORY_FALLBACK_POOLS[category] || DEFAULT_FALLBACK_POOL;
  const index = hashString(providerId) % pool.length;
  return pool[index];
}

export function getProfileCategoryFallbackImage(
  category: ProfileCategory | null,
  providerId: string,
): string {
  const supabaseCat = category ? PROFILE_CAT_TO_SUPABASE_CAT[category] || "" : "";
  return getCategoryFallbackImage(supabaseCat, providerId);
}

/**
 * Determine the best card hero image.
 *
 * Strategy: filter out images we KNOW are logos (exact match with
 * provider_logo field + URL pattern heuristics), use whatever remains.
 * This works across all categories — Comfort Keepers' caregiver portrait
 * passes through, while a home care agency whose only image is their
 * logo gets stock instead.
 *
 * Priority:
 *  1. hero_image_url (classified by script + vision AI) — always trust
 *  2. First non-logo image from provider_images — real photo regardless
 *     of category (facilities, home care, hospice all benefit)
 *  3. No non-logo images — category stock fallback
 */
function resolveCardImage(provider: Provider): { image: string; imageType: CardImageType } {
  if (provider.hero_image_url) {
    return { image: provider.hero_image_url, imageType: "photo" };
  }

  // Filter out known logos, use the first real photo
  const images = parseProviderImages(provider.provider_images);
  const nonLogoImages = images.filter((url) => !isLikelyLogo(url, provider));
  if (nonLogoImages.length > 0) {
    return { image: nonLogoImages[0], imageType: "photo" };
  }

  return {
    image: getCategoryFallbackImage(provider.provider_category, provider.provider_id),
    imageType: "photo",
  };
}

/**
 * Convert iOS Provider to the format expected by ProviderCard component
 */
export function toCardFormat(provider: Provider): ProviderCardData {
  const images = parseProviderImages(provider.provider_images);
  const { image: cardImage, imageType } = resolveCardImage(provider);

  // Pricing: Tier 3 categories (Home Health, Nursing Home, Hospice) suppress
  // dollar amounts on cards — lead with coverage education instead.
  const pricingConfig = getPricingConfig(provider.provider_category);
  let priceRange = "";
  let isRegionalEstimate = false;
  let isMetroAdjusted = false;

  if (pricingConfig.tier !== 3) {
    priceRange = formatPriceRange(provider) || "";

    if (!priceRange && provider.state) {
      const regional = getRegionalEstimate(provider.provider_category, provider.state, provider.city);
      if (regional) {
        priceRange = regional.formatted;
        isRegionalEstimate = true;
        isMetroAdjusted = regional.isMetroAdjusted;
      }
    }
  }

  if (!priceRange) {
    priceRange = "Contact for pricing";
  }

  return {
    id: provider.provider_id,
    slug: provider.slug || generateProviderSlug(provider.provider_name, provider.state),
    name: provider.provider_name,
    image: cardImage,
    imageType,
    fallbackImage: getCategoryFallbackImage(provider.provider_category, provider.provider_id),
    images: images.length > 0 ? images : [],
    address: formatLocation(provider),
    rating: provider.google_reviews_data?.rating ?? provider.google_rating ?? 0,
    reviewCount: provider.google_reviews_data?.review_count ?? undefined,
    priceRange,
    isRegionalEstimate,
    isMetroAdjusted,
    providerCategory: provider.provider_category,
    primaryCategory: getCategoryDisplayName(provider.provider_category),
    careTypes: [provider.provider_category],
    highlights: buildHighlights({
      trustSignals: provider.ai_trust_signals,
      googleReviews: provider.google_reviews_data,
      cmsData: provider.cms_data,
      category: provider.provider_category,
      maxItems: 3,
      skipCapability: true,
    }).map((h) => h.label),
    acceptedPayments: [],
    verified: false,
    description: provider.provider_description?.slice(0, 200) || undefined,
    lat: provider.lat,
    lon: provider.lon,
    cmsRating: provider.cms_data?.overall_rating ?? null,
    cmsSource: provider.cms_data?.source ?? null,
    trustSignalCount: provider.ai_trust_signals?.summary_score ?? undefined,
  };
}

// ============================================================
// BusinessProfile → ProviderCardData conversion
// ============================================================

/**
 * Map ProfileCategory enum → display name used in ProviderCardData.primaryCategory
 */
const PROFILE_CATEGORY_DISPLAY: Record<ProfileCategory, string> = {
  home_care_agency: "Home Care",
  home_health_agency: "Home Health",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  inpatient_hospice: "Hospice",
  rehab_facility: "Rehabilitation",
  adult_day_care: "Adult Day Care",
  wellness_center: "Wellness Center",
  private_caregiver: "Private Caregiver",
};

/**
 * Map Supabase provider_category (olera-providers) → ProfileCategory (business_profiles).
 * Used in power-pages.ts to query business_profiles with the same category filter.
 */
export const SUPABASE_CAT_TO_PROFILE_CATEGORY: Record<string, ProfileCategory> = {
  "Home Care (Non-medical)": "home_care_agency",
  "Home Health Care": "home_health_agency",
  "Assisted Living": "assisted_living",
  "Memory Care": "memory_care",
  "Nursing Home": "nursing_home",
  "Independent Living": "independent_living",
  "Hospice": "hospice_agency",
};

/**
 * Map browse page care-type slugs → ProfileCategory.
 * Used in BrowseClient / CityBrowseClient for client-side business_profiles queries.
 */
export const CARE_TYPE_SLUG_TO_PROFILE_CATEGORY: Record<string, ProfileCategory> = {
  "home-care": "home_care_agency",
  "home-health": "home_health_agency",
  "assisted-living": "assisted_living",
  "memory-care": "memory_care",
  "nursing-homes": "nursing_home",
  "independent-living": "independent_living",
};

/**
 * Map ProfileCategory → Supabase provider_category display for highlights lookup.
 */
export const PROFILE_CAT_TO_SUPABASE_CAT: Record<string, string> = {
  home_care_agency: "Home Care (Non-medical)",
  home_health_agency: "Home Health Care",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
};

/**
 * Convert a BusinessProfile → ProviderCardData for display in search results.
 */
export function businessProfileToCardFormat(bp: BusinessProfile): ProviderCardData {
  const displayCategory = bp.category
    ? PROFILE_CATEGORY_DISPLAY[bp.category]
    : "Senior Care";

  const supabaseCat = bp.category
    ? PROFILE_CAT_TO_SUPABASE_CAT[bp.category] || ""
    : "";

  // Gallery images are stored in metadata.images (uploaded via provider dashboard)
  const meta = bp.metadata as Record<string, unknown> | null;
  const metaImages = Array.isArray(meta?.images) ? (meta.images as string[]) : [];
  const primaryImage = bp.image_url || metaImages[0] || null;

  // Pricing: Tier 3 categories suppress dollar amounts on cards — education badge instead.
  const bpPricingConfig = bp.category ? getPricingConfig(bp.category) : null;
  const contactForPricing = meta?.contact_for_pricing === true;
  let priceRange = "Contact for pricing";
  let isRegionalEstimate = false;
  let isMetroAdjusted = false;

  if (bpPricingConfig?.tier !== 3 && !contactForPricing) {
    const lowerPrice = meta?.lower_price as number | undefined;
    const upperPrice = meta?.upper_price as number | undefined;
    const frequency = (meta?.price_frequency as string | undefined) || "per month";
    const suffix = frequency === "per hour" ? "/hr" : frequency === "per day" ? "/day" : "/mo";

    // Use proper null checks (not truthy) so $0 prices aren't lost
    if (lowerPrice != null && upperPrice != null && upperPrice > lowerPrice) {
      priceRange = `$${lowerPrice.toLocaleString()} - $${upperPrice.toLocaleString()}${suffix}`;
    } else if (lowerPrice != null && upperPrice != null && upperPrice === lowerPrice) {
      // Equal prices: show single price
      priceRange = `$${lowerPrice.toLocaleString()}${suffix}`;
    } else if (lowerPrice != null) {
      priceRange = `From $${lowerPrice.toLocaleString()}${suffix}`;
    } else if (upperPrice != null) {
      priceRange = `Up to $${upperPrice.toLocaleString()}${suffix}`;
    } else if (meta?.price_range) {
      // Fallback to legacy price_range string
      priceRange = meta.price_range as string;
    } else if (bp.state && bp.category) {
      // Regional estimate fallback
      const regional = getRegionalEstimate(bp.category, bp.state, bp.city);
      if (regional) {
        priceRange = regional.formatted;
        isRegionalEstimate = true;
        isMetroAdjusted = regional.isMetroAdjusted;
      }
    }
  }

  return {
    id: bp.id,
    slug: bp.slug,
    name: bp.display_name,
    image: primaryImage || getCategoryFallbackImage(supabaseCat, bp.id),
    imageType: "photo",
    fallbackImage: getCategoryFallbackImage(supabaseCat, bp.id),
    images: metaImages.length > 0 ? metaImages : (bp.image_url ? [bp.image_url] : []),
    address: [bp.city, bp.state].filter(Boolean).join(", "),
    rating: 0,
    reviewCount: undefined,
    priceRange,
    isRegionalEstimate,
    isMetroAdjusted,
    providerCategory: bp.category ?? undefined,
    primaryCategory: displayCategory,
    careTypes: bp.care_types.length > 0 ? bp.care_types : (supabaseCat ? [supabaseCat] : []),
    highlights: buildHighlights({
      careTypes: bp.care_types.length > 0 ? bp.care_types : undefined,
      category: bp.category || supabaseCat,
      maxItems: 3,
      skipCapability: true,
    }).map((h) => h.label),
    acceptedPayments: [],
    verified: bp.claim_state === "claimed",
    description: bp.description?.slice(0, 200) || undefined,
    lat: bp.lat,
    lon: bp.lng,
  };
}

/**
 * Enrich BP cards with data from the seeded providers they replaced.
 * When a provider claims their page, the BP may lack images/pricing/rating
 * that exist on the original olera-providers record.
 */
export function enrichBpCards(
  bpCards: ProviderCardData[],
  seededCards: ProviderCardData[],
  bpSourceIds: (string | null)[],
): void {
  const seededById = new Map(seededCards.map((c) => [c.id, c]));
  const seededBySlug = new Map(seededCards.map((c) => [c.slug, c]));

  for (let i = 0; i < bpCards.length; i++) {
    const bp = bpCards[i];
    // Match by source_provider_id first, then fall back to slug
    const sourceId = bpSourceIds[i];
    const seeded = (sourceId ? seededById.get(sourceId) : null) ?? seededBySlug.get(bp.slug);
    if (!seeded) continue;

    if (bp.imageType === "placeholder" && seeded.imageType !== "placeholder") {
      bp.image = seeded.image;
      bp.imageType = seeded.imageType;
      if (seeded.images.length > 0) bp.images = seeded.images;
    }
    if (bp.priceRange === "Contact for pricing" && seeded.priceRange !== "Contact for pricing") {
      bp.priceRange = seeded.priceRange;
    }
    if (bp.rating === 0 && seeded.rating > 0) {
      bp.rating = seeded.rating;
      bp.reviewCount = seeded.reviewCount;
    }
  }
}

/**
 * Merge seeded provider cards with business_profile cards.
 * If a BP has a source_provider_id matching a seeded card, the BP version wins.
 */
export function mergeProviderCards(
  seededCards: ProviderCardData[],
  bpCards: ProviderCardData[],
  dedupeSourceIds: Set<string>,
): ProviderCardData[] {
  // Also deduplicate by slug so claimed BPs without source_provider_id
  // don't appear alongside their seeded counterpart
  const bpSlugs = new Set(bpCards.map((c) => c.slug));
  const filtered = seededCards.filter(
    (c) => !dedupeSourceIds.has(c.id) && !bpSlugs.has(c.slug)
  );
  return [...filtered, ...bpCards];
}

/**
 * Convert mock provider data to ProviderCardData
 * Uses a flexible type to work with various mock data shapes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockToCardFormat(p: any): ProviderCardData {
  return {
    id: String(p.id || ""),
    slug: String(p.slug || p.id || ""),
    name: String(p.name || ""),
    image: String(p.image || "/placeholder-provider.jpg"),
    imageType: (p.imageType as CardImageType) || "photo",
    images: Array.isArray(p.images) ? p.images : [],
    address: String(p.address || ""),
    rating: Number(p.rating) || 0,
    reviewCount: p.reviewCount as number | undefined,
    priceRange: String(p.priceRange || "Contact for pricing"),
    primaryCategory: String(p.primaryCategory || "Senior Care"),
    careTypes: Array.isArray(p.careTypes) ? p.careTypes : [],
    highlights: Array.isArray(p.highlights) ? p.highlights : [],
    acceptedPayments: Array.isArray(p.acceptedPayments) ? p.acceptedPayments : [],
    verified: Boolean(p.verified),
    description: p.description as string | undefined,
  };
}

