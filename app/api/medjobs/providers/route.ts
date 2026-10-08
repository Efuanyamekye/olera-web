/**
 * GET /api/medjobs/providers?campus=<slug>&scope=<near|all>
 *
 * Returns providers for the student Find Jobs board.
 *
 * SIMPLE RULE: A provider appears if and only if job_board_visible = true
 * in student_outreach. That's it. No complex matching, no deduplication.
 *
 * Data comes from:
 * 1. student_outreach row itself (name, location from research_data)
 * 2. olera-providers (images, ratings) if olera_provider_id is set
 *
 * Parameters:
 * - `campus` — Student's campus slug (for "Near You" catchment scoping)
 * - `scope` — `near` (default) = catchment only, `all` = nationwide
 *
 * Response: { cards: ProviderCard[], total: number, pageSize: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getServiceClient } from "@/lib/admin";
import { getPartnerUniversity } from "@/lib/medjobs/catchment";
import { generateProviderSlug } from "@/lib/slugify";
import { LIVE_UNIVERSITIES } from "@/lib/staffing-outreach/partner-universities";
import type { ProviderCardData } from "@/lib/types/provider";
import { readOpportunityProfile, type OpportunityProfile } from "@/lib/medjobs/opportunity";

export type ProviderCard = ProviderCardData & {
  isProgram: boolean;
  createdAt?: string | null;
  opportunity?: OpportunityProfile;
  isReadyForStudents?: boolean;
};

const PAGE_SIZE = 12;

/**
 * Build the list of providers visible on the job board.
 * SIMPLE: job_board_visible = true means they appear.
 */
function getMedjobsProviders(campus: string, scope: "near" | "all"): Promise<ProviderCard[]> {
  return unstable_cache(
    async (): Promise<ProviderCard[]> => {
      const db = getServiceClient();

      // Determine catchment filter for "near" scope
      let catchmentFilter: { cities: Set<string>; states: string[] } | null = null;

      if (scope === "near") {
        const single = campus ? getPartnerUniversity(campus) : null;
        const unis = campus ? (single ? [single] : []) : LIVE_UNIVERSITIES;
        if (unis.length === 0) return [];

        const catchment = unis.flatMap((u) => u.catchment);
        const states = Array.from(new Set(catchment.map((c) => c.state)));
        const cityKeys = new Set(catchment.map((c) => `${c.city.toLowerCase()}|${c.state}`));

        catchmentFilter = { cities: cityKeys, states };
      }

      // Step 1: Get ALL providers with job_board_visible = true
      const { data: outreachRows, error: outreachError } = await db
        .from("student_outreach")
        .select("id, organization_name, research_data, created_at")
        .eq("kind", "provider")
        .eq("job_board_visible", true);

      if (outreachError) {
        console.error("[medjobs/providers] student_outreach query failed:", outreachError.message);
        return [];
      }

      if (!outreachRows || outreachRows.length === 0) {
        return [];
      }

      // Step 2: Extract olera_provider_ids for enrichment
      const oleraIdMap = new Map<string, string>(); // olera_id -> outreach_id
      for (const row of outreachRows) {
        const rd = (row.research_data ?? {}) as Record<string, unknown>;
        const oleraId = rd.olera_provider_id as string | undefined;
        if (oleraId) {
          oleraIdMap.set(oleraId, row.id);
        }
      }

      // Step 3: Fetch enrichment data from olera-providers (images, ratings, etc.)
      const oleraIds = Array.from(oleraIdMap.keys());
      const oleraDataMap = new Map<string, Record<string, unknown>>();

      if (oleraIds.length > 0) {
        const { data: oleraRows, error: oleraError } = await db
          .from("olera-providers")
          .select(
            "provider_id, provider_name, city, state, google_rating, provider_images, provider_logo, hero_image_url, slug, provider_description, provider_category, main_category, deleted"
          )
          .in("provider_id", oleraIds);

        if (oleraError) {
          console.error("[medjobs/providers] olera-providers query failed:", oleraError.message);
        }

        // Build lookup map, excluding deleted
        for (const row of oleraRows ?? []) {
          if (row.deleted === true) continue;
          oleraDataMap.set(row.provider_id, row as Record<string, unknown>);
        }
      }

      // Helper: check if location is in catchment
      const inCatchment = (city: string | null, state: string | null): boolean => {
        if (!catchmentFilter) return true; // "all" scope
        if (!city || !state) return false;
        return catchmentFilter.cities.has(`${city.toLowerCase()}|${state}`);
      };

      // Step 4: Build cards from student_outreach rows
      const cards: ProviderCard[] = [];

      for (const row of outreachRows) {
        const rd = (row.research_data ?? {}) as Record<string, unknown>;
        const gc = (rd.general_contact ?? {}) as Record<string, unknown>;
        const oleraId = rd.olera_provider_id as string | undefined;

        // Get location from research_data.general_contact
        const city = (gc.city as string) ?? null;
        const state = (gc.state as string) ?? null;

        // Catchment filter
        if (!inCatchment(city, state)) continue;

        // Get enrichment data from olera-providers if available
        const oleraData = oleraId ? oleraDataMap.get(oleraId) : null;

        // Build the card
        const name = (row.organization_name as string) || "Unknown Provider";
        const oleraSlug = rd.olera_provider_slug as string | undefined;
        const slug = oleraSlug || generateProviderSlug(name, state) || `provider-${(row.id as string).slice(0, 8)}`;

        // Image: prefer olera-providers data, fall back to placeholder
        let image = "/images/fallback/home-care-01.jpg";
        let images: string[] = [];
        if (oleraData) {
          const heroImage = oleraData.hero_image_url as string | undefined;
          const logo = oleraData.provider_logo as string | undefined;
          const providerImages = oleraData.provider_images as string[] | undefined;

          if (heroImage) {
            image = heroImage;
          } else if (logo) {
            image = logo;
          } else if (providerImages && providerImages.length > 0) {
            image = providerImages[0];
          }
          images = providerImages ?? [];
        }

        // Rating from olera-providers
        const rating = oleraData ? ((oleraData.google_rating as number) ?? 0) : 0;

        // Category from olera-providers or default
        const category = oleraData
          ? ((oleraData.main_category as string) || (oleraData.provider_category as string) || "Home Care")
          : "Home Care";

        const card: ProviderCard = {
          id: row.id as string,
          slug,
          name,
          image,
          imageType: image.includes("fallback") ? "placeholder" : "actual",
          fallbackImage: "/images/fallback/home-care-01.jpg",
          images,
          address: [city, state].filter(Boolean).join(", "),
          rating,
          priceRange: "Contact for pricing",
          primaryCategory: category,
          careTypes: [category],
          highlights: [],
          acceptedPayments: [],
          verified: false,
          isProgram: false,
          createdAt: row.created_at as string | null,
          isReadyForStudents: true,
        };

        cards.push(card);
      }

      return cards;
    },
    [`medjobs-providers-${campus || "all"}-${scope}`],
    { revalidate: 300 }
  )();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campus = searchParams.get("campus")?.trim() || "";
    const scope = searchParams.get("scope") === "all" ? "all" : "near";

    // Validate campus if provided and scope is "near"
    if (campus && scope === "near" && !getPartnerUniversity(campus)) {
      return NextResponse.json({ cards: [], total: 0, pageSize: PAGE_SIZE });
    }

    const unsorted = await getMedjobsProviders(campus, scope);

    // Sort by newest first
    const all = [...unsorted].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    // Cap at 200 results
    const cards = all.slice(0, 200);

    return NextResponse.json({ cards, total: all.length, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[medjobs/providers] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
