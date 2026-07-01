import { getServiceClient } from "@/lib/admin";
import { buildHighlights } from "@/lib/provider-highlights";
import type { AiTrustSignals, CMSData, GoogleReviewsData } from "@/lib/types";

/**
 * Shared alternative-provider finder for the family help cascade.
 *
 * Used by both the self-report landing page (app/api/families/connection-outcome)
 * and the Family Comms Coordinator's "provider silent" rung. One copy so the two
 * surfaces can never drift. See plans/family-comms-system.md.
 */

export interface ThreadMessage {
  from_profile_id: string;
  text?: string;
  is_auto_reply?: boolean;
}

/**
 * Map a provider care_type token (snake_case, e.g. "home_care") to the browse
 * page's `type` slug (kebab, e.g. "home-care") so a compare CTA can deep-link to a
 * pre-filtered /browse. Returns null for unknown tokens — the caller omits the
 * `type` filter rather than sending a broken one. Browse reads `type` →
 * CARE_TYPE_TO_SUPABASE → provider_category (see components/browse/BrowseClient.tsx).
 * NOTE: nursing_home → the plural "nursing-homes" slug browse expects.
 */
export function careTypeToBrowseSlug(careType?: string | null): string | null {
  if (!careType) return null;
  const t = careType.toLowerCase().trim().replace(/-/g, "_");
  const map: Record<string, string> = {
    home_care: "home-care",
    in_home_care: "home-care",
    home_health: "home-health",
    home_health_agency: "home-health",
    assisted_living: "assisted-living",
    memory_care: "memory-care",
    nursing_home: "nursing-homes",
    nursing_homes: "nursing-homes",
    independent_living: "independent-living",
  };
  return map[t] ?? null;
}

export interface RecommendedProvider {
  name: string;
  slug: string;
  url: string;
  priceRange: string | null;
  /** Real facility/logo photo when available, else a rotated category stock image. Always set. */
  imageUrl: string;
  /** Google rating (1–5) via the olera-providers join, when available. */
  rating: number | null;
  reviewCount: number | null;
  /** Miles from the family, when both family + provider coordinates are known. */
  distanceMi: number | null;
  /** One short, honest "why we picked this" line built from verified signals
   *  (trust signals / reviews / CMS quality) via the provider-highlights
   *  waterfall. Null when the provider has no signal worth standing behind —
   *  fewer honest reasons beat generic ones. NEVER a response-time claim. */
  reason: string | null;
}

// Category stock images, re-hosted on Supabase storage — olera.care/images/* is
// WAF-challenged for email image proxies and renders blank (see email-templates.tsx).
// home_health has no dedicated stock set → maps to home-care.
const STOCK_BASE =
  "https://ocaabzfiiikjcgqwhbwr.supabase.co/storage/v1/object/public/content-images/fallback";

// Map a care_type to one of the 5 stock-image categories. care_types in
// business_profiles are stored DISPLAY-CASE with spaces/punctuation
// ("Assisted Living", "Home Care (Non-medical)", "Assisted Living | Memory Care"),
// NOT snake_case tokens — so normalize aggressively: take the first of a
// pipe-joined list, drop parentheticals, collapse anything non-alpha to "_".
// (Earlier this only handled hyphens, so every display-case label fell through to
// the home-care fallback — an assisted-living facility showed a home-care photo.)
function stockSlugForCareType(careType: string | undefined): string {
  const norm = (careType || "")
    .split("|")[0]
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const map: Record<string, string> = {
    home_care: "home-care",
    in_home_care: "home-care",
    home_health: "home-care",
    home_health_care: "home-care",
    home_health_agency: "home-care",
    personal_care: "home-care",
    companion_care: "home-care",
    respite_care: "home-care",
    assisted_living: "assisted-living",
    memory_care: "memory-care",
    nursing_home: "nursing-home",
    nursing_homes: "nursing-home",
    skilled_nursing: "nursing-home",
    independent_living: "independent-living",
    senior_living: "independent-living",
    senior_community: "independent-living",
    senior_communities: "independent-living",
  };
  return map[norm] || "home-care";
}
export function categoryStockImage(careType: string | undefined, index: number): string {
  const slug = stockSlugForCareType(careType);
  const variant = (index % 3) + 1; // rotate 1..3 so 3 same-category cards aren't identical
  return `${STOCK_BASE}/${slug}-${variant}.jpg`;
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find up to 3 alternative providers in the same area + care type. Prefers
 * providers that have actually responded to a lead in the last 60 days
 * ("responsive"), then fills remaining slots with other matching providers so the
 * cascade is never empty when options exist.
 */
export async function findAlternativeProviders(
  db: ReturnType<typeof getServiceClient>,
  excludeProfileId: string,
  city: string | undefined,
  state: string | undefined,
  careTypes: string[],
  /** Family coordinates — when provided, each card gets a distance. */
  familyLat?: number | null,
  familyLng?: number | null,
): Promise<RecommendedProvider[]> {
  if (!city || !state || careTypes.length === 0) return [];

  const { data: candidates } = await db
    .from("business_profiles")
    .select("id, display_name, slug, care_types, metadata, image_url, lat, lng, source_provider_id")
    .eq("type", "organization")
    .eq("is_active", true)
    .eq("city", city)
    .eq("state", state)
    .neq("id", excludeProfileId)
    .limit(50);

  if (!candidates?.length) return [];

  const matching = candidates.filter((p) => {
    const cts = (p.care_types as string[]) || [];
    return cts.some((ct) => careTypes.includes(ct));
  });
  if (matching.length === 0) return [];

  // Responsiveness: who has a real (non-auto) provider reply in the last 60 days.
  const ids = matching.map((p) => p.id);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentConns } = await db
    .from("connections")
    .select("to_profile_id, metadata")
    .in("to_profile_id", ids)
    .gte("created_at", sixtyDaysAgo);

  const responsive = new Set<string>();
  for (const c of recentConns || []) {
    if (responsive.has(c.to_profile_id)) continue;
    const thread = ((c.metadata as Record<string, unknown> | null)?.thread as ThreadMessage[]) || [];
    if (thread.some((m) => m.from_profile_id === c.to_profile_id && !m.is_auto_reply && m.text?.trim())) {
      responsive.add(c.to_profile_id);
    }
  }

  // Responsive-first ranking (silent — never surfaced as a response-time claim).
  const ranked = [
    ...matching.filter((p) => responsive.has(p.id)),
    ...matching.filter((p) => !responsive.has(p.id)),
  ];
  const top = ranked.slice(0, 3);

  // Ratings + trust/quality signals live on olera-providers, not business_profiles
  // — join via source_provider_id. The trust/CMS JSONB powers the honest "why we
  // picked this" reason (buildHighlights), same waterfall the provider pages use.
  interface ProviderEnrich {
    rating: number | null;
    reviewCount: number | null;
    reviews: GoogleReviewsData | null;
    trustSignals: AiTrustSignals | null;
    cmsData: CMSData | null;
  }
  const enrichByProvider = new Map<string, ProviderEnrich>();
  const srcIds = top.map((p) => p.source_provider_id).filter(Boolean) as string[];
  if (srcIds.length) {
    const { data: provs } = await db
      .from("olera-providers")
      .select("provider_id, google_rating, google_reviews_data, ai_trust_signals, cms_data")
      .in("provider_id", srcIds);
    for (const pr of provs || []) {
      const reviews = (pr.google_reviews_data as GoogleReviewsData | null) || null;
      enrichByProvider.set(pr.provider_id as string, {
        rating: reviews?.rating ?? (pr.google_rating as number | null) ?? null,
        reviewCount: reviews?.review_count ?? null,
        reviews,
        trustSignals: (pr.ai_trust_signals as AiTrustSignals | null) || null,
        cmsData: (pr.cms_data as CMSData | null) || null,
      });
    }
  }

  const hasFamilyCoords = typeof familyLat === "number" && typeof familyLng === "number";
  return top.map((p, i) => {
    const meta = (p.metadata as Record<string, unknown> | null) || {};
    const realImg =
      typeof p.image_url === "string" && p.image_url.startsWith("https://") ? p.image_url : null;
    const rt: ProviderEnrich = (p.source_provider_id && enrichByProvider.get(p.source_provider_id as string)) || {
      rating: null,
      reviewCount: null,
      reviews: null,
      trustSignals: null,
      cmsData: null,
    };
    // The honest "why" line — up to 2 verified highlights (trust > longevity >
    // reviews > CMS), joined. skipCapability so we never fall back to a bare
    // category label as a "reason". Null when nothing verified exists.
    const highlights = buildHighlights({
      trustSignals: rt.trustSignals,
      googleReviews: rt.reviews,
      cmsData: rt.cmsData,
      careTypes: (p.care_types as string[]) || undefined,
      maxItems: 2,
      skipCapability: true,
    });
    const reason = highlights.length ? highlights.map((h) => h.label).join(" · ") : null;
    const pLat = typeof p.lat === "number" ? p.lat : null;
    // Distance only when it's plausibly "nearby" — beyond ~75mi it's not a useful
    // proximity signal (e.g. a family arranging out-of-state care) and would read as
    // "835 mi away" under a "providers near you" framing. Omit it; rating carries.
    const pLng = typeof p.lng === "number" ? p.lng : null;
    let distanceMi: number | null = null;
    if (hasFamilyCoords && pLat !== null && pLng !== null) {
      const d = haversineMi(familyLat as number, familyLng as number, pLat, pLng);
      if (d <= 75) distanceMi = d;
    }
    return {
      name: p.display_name as string,
      slug: p.slug as string,
      url: `/provider/${p.slug}?rp=${p.slug}`,
      priceRange: (meta.price_range as string) || null,
      imageUrl: realImg || categoryStockImage((p.care_types as string[])?.[0], i),
      rating: rt.rating,
      reviewCount: rt.reviewCount,
      distanceMi,
      reason,
    };
  });
}
