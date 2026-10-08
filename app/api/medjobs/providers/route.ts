/**
 * GET /api/medjobs/providers?campus=<slug>&scope=<near|all>
 *
 * Returns providers for the student Find Jobs board.
 *
 * A provider appears on the job board ONLY if they are marked "ready for students"
 * in the MedJobs task board (student_outreach.status = "ready_for_students").
 * This is the single canonical signal that a provider is ready to hire students.
 *
 * Providers are fetched from TWO sources:
 * 1. business_profiles — if the student_outreach record has provider_business_profile_id
 * 2. olera-providers — if the student_outreach record has research_data.olera_provider_id
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
import {
  businessProfileToCardFormat,
  toCardFormat,
  type ProviderCardData,
  type Provider,
} from "@/lib/types/provider";
import type { BusinessProfile } from "@/lib/types";
import { readOpportunityProfile, type OpportunityProfile } from "@/lib/medjobs/opportunity";

export type ProviderCard = ProviderCardData & {
  isProgram: boolean;
  createdAt?: string | null;
  opportunity?: OpportunityProfile;
  /** True if marked "ready for students" in MedJobs task board */
  isReadyForStudents?: boolean;
};

const PAGE_SIZE = 12;

/**
 * Build the list of providers marked "ready for students".
 * Only includes providers with student_outreach.status = "ready_for_students".
 *
 * Fetches from TWO sources:
 * 1. business_profiles — if student_outreach.provider_business_profile_id is set
 * 2. olera-providers — if student_outreach.research_data.olera_provider_id is set
 *
 * This ensures ALL "ready for students" providers appear on the job board,
 * regardless of whether they have a business_profiles record.
 *
 * Cached per campus+scope for 5 minutes.
 */
function getMedjobsProviders(campus: string, scope: "near" | "all"): Promise<ProviderCard[]> {
  return unstable_cache(
    async (): Promise<ProviderCard[]> => {
      const db = getServiceClient();

      // Determine catchment filter
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

      // Get ALL providers marked "ready for students" in the MedJobs task board
      // This is the ONLY source for the job board - if they have this status, they appear
      const { data: readyRows } = await db
        .from("student_outreach")
        .select("id, provider_business_profile_id, organization_name, research_data")
        .eq("kind", "provider")
        .eq("status", "ready_for_students");

      if (!readyRows || readyRows.length === 0) {
        return [];
      }

      // Separate records by their data source
      const bpIds: string[] = [];  // Direct links to business_profiles
      const oleraIds: string[] = [];  // Direct links to olera-providers
      // For name+city+state matching (when no direct link exists)
      type ReadyProviderMatch = { name: string; city: string; state: string };
      const readyByLocation: ReadyProviderMatch[] = [];
      const oleraIdsToLookup: string[] = [];
      const oleraIdToName: Map<string, string> = new Map();
      // Manual entry fallback for providers without any link
      const manualEntries: Array<{
        name: string;
        city: string | null;
        state: string | null;
      }> = [];

      for (const row of readyRows) {
        const rd = (row.research_data ?? {}) as Record<string, unknown>;
        const oleraId = (rd.olera_provider_id as string) ?? null;
        const gc = (rd.general_contact ?? {}) as Record<string, unknown>;

        if (row.provider_business_profile_id) {
          // Has direct link to business_profiles
          bpIds.push(row.provider_business_profile_id as string);
        } else if (oleraId) {
          // Has link to olera-providers directory - fetch from there
          oleraIds.push(oleraId);
        } else if (row.organization_name) {
          // No direct links - will try name matching, or fall back to manual entry
          const city = (gc.city as string) ?? null;
          const state = (gc.state as string) ?? null;
          if (city && state) {
            // Has location data - add to name matching
            readyByLocation.push({
              name: (row.organization_name as string).toLowerCase(),
              city: city.toLowerCase(),
              state,
            });
          }
          // Also add to manual entries as fallback if name matching fails
          manualEntries.push({
            name: row.organization_name as string,
            city,
            state,
          });
        }

        // Also build name+city+state matching for business_profiles
        // This catches cases where student_outreach has olera_provider_id
        // but there's ALSO a matching business_profile (e.g., Comfort Keepers)
        if (!row.provider_business_profile_id && oleraId && row.organization_name) {
          const city = (gc.city as string) ?? null;
          const state = (gc.state as string) ?? null;

          if (city && state) {
            readyByLocation.push({
              name: (row.organization_name as string).toLowerCase(),
              city: city.toLowerCase(),
              state,
            });
          } else {
            // Need to look up location from olera-providers
            oleraIdsToLookup.push(oleraId);
            oleraIdToName.set(oleraId, (row.organization_name as string).toLowerCase());
          }
        }
      }

      // Look up location data from olera-providers for name+city+state matching
      if (oleraIdsToLookup.length > 0) {
        const { data: oleraProviders } = await db
          .from("olera-providers")
          .select("provider_id, city, state")
          .in("provider_id", oleraIdsToLookup);

        for (const op of oleraProviders ?? []) {
          const name = oleraIdToName.get(op.provider_id);
          if (name && op.city && op.state) {
            readyByLocation.push({
              name,
              city: op.city.toLowerCase(),
              state: op.state,
            });
          }
        }
      }

      const inCatchment = (city: string | null, state: string | null) => {
        if (!catchmentFilter) return true; // "all" scope
        return !!city && !!state && catchmentFilter.cities.has(`${city.toLowerCase()}|${state}`);
      };

      const cards: ProviderCard[] = [];
      const seenIds = new Set<string>(); // Prevent duplicates

      // 1. Fetch from business_profiles
      // Two paths: direct ID match OR name+city+state match
      const needsBpQuery = bpIds.length > 0 || readyByLocation.length > 0;

      if (needsBpQuery) {
        let bpQuery = db
          .from("business_profiles")
          .select(
            "id, slug, display_name, city, state, category, image_url, description, care_types, metadata, claim_state, lat, lng, created_at"
          )
          .in("type", ["organization", "caregiver"])
          .eq("is_active", true);

        // If we have direct IDs, we could filter by them, but we also need
        // to fetch for name matching. So we filter by state instead for efficiency.
        if (catchmentFilter) {
          bpQuery = bpQuery.in("state", catchmentFilter.states);
        }

        const { data: bpRows } = await bpQuery;

        for (const row of (bpRows ?? []) as unknown as (BusinessProfile & { created_at?: string })[]) {
          if (!inCatchment(row.city, row.state)) continue;
          if (seenIds.has(row.id)) continue;

          // Check if this business_profile is "ready for students"
          // First check direct link, then check by name+city+state match
          let isReadyForStudents = bpIds.includes(row.id);

          if (!isReadyForStudents && row.display_name && row.city && row.state && readyByLocation.length > 0) {
            const bpName = row.display_name.toLowerCase();
            const bpCity = row.city.toLowerCase();
            const bpState = row.state;
            isReadyForStudents = readyByLocation.some((r) => {
              // Name must be included (handles "Comfort Keepers" matching "Comfort Keepers of Tallahassee")
              const nameMatch = bpName.includes(r.name) || r.name.includes(bpName);
              // City and state must both match exactly
              const cityMatch = r.city === bpCity;
              const stateMatch = r.state === bpState;
              return nameMatch && cityMatch && stateMatch;
            });
          }

          if (!isReadyForStudents) continue;

          seenIds.add(row.id);
          const meta = (row.metadata ?? {}) as Record<string, unknown>;
          const card = businessProfileToCardFormat(row) as ProviderCard;
          card.isProgram = row.claim_state === "claimed";
          card.createdAt = row.created_at ?? null;
          card.opportunity = readOpportunityProfile(meta);
          card.isReadyForStudents = true;
          cards.push(card);
        }
      }

      // 2. Fetch from olera-providers for records with olera_provider_id (no business_profile)
      if (oleraIds.length > 0) {
        let oleraQuery = db
          .from("olera-providers")
          .select(
            "provider_id, provider_name, provider_category, main_category, phone, email, website, google_rating, address, city, state, zipcode, lat, lon, place_id, provider_images, provider_logo, provider_description, hero_image_url, slug, google_reviews_data, cms_data, ai_trust_signals, lower_price, upper_price, contact_for_price, created_at"
          )
          .in("provider_id", oleraIds)
          .or("deleted.is.null,deleted.eq.false");

        // Note: We don't filter by state here because manually added providers
        // may have NULL city/state in olera-providers. We filter in JS instead.

        const { data: oleraRows } = await oleraQuery;

        for (const row of oleraRows ?? []) {
          const provider = row as unknown as Provider & { created_at?: string };
          // For catchment filtering, allow providers with null city/state through
          // if scope is "all", otherwise require valid catchment match
          if (catchmentFilter && provider.city && provider.state) {
            if (!inCatchment(provider.city, provider.state)) continue;
          } else if (catchmentFilter && (!provider.city || !provider.state)) {
            // Provider has no city/state - skip for "near" scope
            continue;
          }
          if (seenIds.has(provider.provider_id)) continue;

          // Check if we already have this provider via business_profiles (name-based dedup)
          // This handles cases where a provider exists in BOTH sources
          const providerNameLower = provider.provider_name?.toLowerCase() ?? "";
          if (providerNameLower) {
            const alreadyFound = cards.some((c) => {
              const cardNameLower = c.name.toLowerCase();
              // Name must be included (handles "Comfort Keepers" matching "Comfort Keepers of Tallahassee")
              return cardNameLower.includes(providerNameLower) || providerNameLower.includes(cardNameLower);
            });
            if (alreadyFound) continue;
          }

          seenIds.add(provider.provider_id);

          const card = toCardFormat(provider) as ProviderCard;
          card.isProgram = false; // olera-providers are not claimed accounts
          card.createdAt = provider.created_at ?? null;
          card.isReadyForStudents = true;
          // No opportunity data for olera-providers (they don't have metadata.medjobs_demand_profile)
          cards.push(card);
        }
      }

      // 3. Handle manual entry providers that didn't match anywhere else
      // These are rare edge cases - only add if not already found via business_profiles or olera-providers
      for (const entry of manualEntries) {
        // Skip if we already have a card for this provider (matched via business_profiles or olera-providers)
        const entrySlug = generateProviderSlug(entry.name, entry.state);
        if (seenIds.has(`manual-${entrySlug}`)) continue;

        // For catchment filtering
        if (catchmentFilter) {
          if (!entry.city || !entry.state) continue;
          if (!inCatchment(entry.city, entry.state)) continue;
        }

        // Check if we already found this via name matching in business_profiles
        // Skip if a similar name is already in cards
        const entryNameLower = entry.name.toLowerCase();
        const alreadyFound = cards.some((c) => {
          const cardNameLower = c.name.toLowerCase();
          return cardNameLower.includes(entryNameLower) || entryNameLower.includes(cardNameLower);
        });
        if (alreadyFound) continue;

        // Create a minimal card from the outreach data
        seenIds.add(`manual-${entrySlug}`);
        const card: ProviderCard = {
          id: `manual-${entrySlug}`,
          slug: entrySlug,
          name: entry.name,
          image: "/images/fallback/home-care-01.jpg",
          imageType: "placeholder",
          fallbackImage: "/images/fallback/home-care-01.jpg",
          images: [],
          address: [entry.city, entry.state].filter(Boolean).join(", "),
          rating: 0,
          priceRange: "Contact for pricing",
          primaryCategory: "Home Care",
          careTypes: ["Home Care (Non-medical)"],
          highlights: [],
          acceptedPayments: [],
          verified: false,
          isProgram: false,
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
