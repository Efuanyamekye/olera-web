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
      const bpIds: string[] = [];
      const oleraIds: string[] = [];
      const outreachById = new Map<string, (typeof readyRows)[number]>();

      for (const row of readyRows) {
        const rd = (row.research_data ?? {}) as Record<string, unknown>;
        const oleraId = (rd.olera_provider_id as string) ?? null;

        if (row.provider_business_profile_id) {
          // Has direct link to business_profiles
          bpIds.push(row.provider_business_profile_id as string);
          outreachById.set(`bp:${row.provider_business_profile_id}`, row);
        } else if (oleraId) {
          // Has link to olera-providers directory
          oleraIds.push(oleraId);
          outreachById.set(`olera:${oleraId}`, row);
        }
        // Records with neither link cannot be displayed (no provider data)
      }

      const inCatchment = (city: string | null, state: string | null) => {
        if (!catchmentFilter) return true; // "all" scope
        return !!city && !!state && catchmentFilter.cities.has(`${city.toLowerCase()}|${state}`);
      };

      const cards: ProviderCard[] = [];
      const seenIds = new Set<string>(); // Prevent duplicates

      // 1. Fetch from business_profiles for records with provider_business_profile_id
      if (bpIds.length > 0) {
        let bpQuery = db
          .from("business_profiles")
          .select(
            "id, slug, display_name, city, state, category, image_url, description, care_types, metadata, claim_state, lat, lng, created_at"
          )
          .in("id", bpIds)
          .eq("is_active", true);

        if (catchmentFilter) {
          bpQuery = bpQuery.in("state", catchmentFilter.states);
        }

        const { data: bpRows } = await bpQuery;

        for (const row of (bpRows ?? []) as unknown as (BusinessProfile & { created_at?: string })[]) {
          if (!inCatchment(row.city, row.state)) continue;
          if (seenIds.has(row.id)) continue;
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
            "provider_id, provider_name, provider_category, main_category, phone, email, website, google_rating, address, city, state, zipcode, lat, lon, place_id, provider_images, provider_logo, provider_description, hero_image_url, slug, google_reviews_data, cms_data, ai_trust_signals, created_at"
          )
          .in("provider_id", oleraIds)
          .or("deleted.is.null,deleted.eq.false");

        if (catchmentFilter) {
          oleraQuery = oleraQuery.in("state", catchmentFilter.states);
        }

        const { data: oleraRows } = await oleraQuery;

        for (const row of oleraRows ?? []) {
          const provider = row as unknown as Provider & { created_at?: string };
          if (!inCatchment(provider.city, provider.state)) continue;
          if (seenIds.has(provider.provider_id)) continue;
          seenIds.add(provider.provider_id);

          const card = toCardFormat(provider) as ProviderCard;
          card.isProgram = false; // olera-providers are not claimed accounts
          card.createdAt = provider.created_at ?? null;
          card.isReadyForStudents = true;
          // No opportunity data for olera-providers (they don't have metadata.medjobs_demand_profile)
          cards.push(card);
        }
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
