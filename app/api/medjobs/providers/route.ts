/**
 * GET /api/medjobs/providers?campus=<slug>&scope=<near|all>
 *
 * Returns MedJobs-interested providers for the student Find Jobs board.
 * Unlike the families endpoint (which shows all non-medical providers),
 * this returns only providers who have explicitly indicated MedJobs interest:
 *
 * 1. Accepted interview terms (interview_terms_accepted_at in metadata)
 * 2. Completed MedJobs eligibility (medjobs_eligibility_completed_at in metadata)
 * 3. Enrolled/activated via staffing outreach
 * 4. Marked "ready for students" in MedJobs task board (student_outreach.status)
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
  type ProviderCardData,
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
 * Build the list of MedJobs-interested providers.
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

      // First, get providers enrolled/activated via staffing_outreach
      const { data: outreachRows } = await db
        .from("staffing_outreach")
        .select("provider_id")
        .in("status", ["enrolled", "activated"]);

      const outreachProviderIds = new Set<string>(
        (outreachRows ?? []).map((r) => r.provider_id as string)
      );

      // Get providers marked "ready for students" in the MedJobs task board
      // This is the canonical signal that a provider is ready to hire
      const { data: readyRows } = await db
        .from("student_outreach")
        .select("provider_business_profile_id, organization_name, research_data")
        .eq("kind", "provider")
        .eq("status", "ready_for_students");

      // Build set of ready provider IDs (directly linked)
      const readyForStudentsIds = new Set<string>(
        (readyRows ?? [])
          .filter((r) => r.provider_business_profile_id)
          .map((r) => r.provider_business_profile_id as string)
      );

      // For records without provider_business_profile_id, build a lookup by name+city+state.
      // We need location data to avoid false positives with franchises (e.g., "Visiting Angels"
      // has 41 locations). First try research_data.general_contact, then fall back to looking
      // up the original olera-providers record.
      type ReadyProviderMatch = { name: string; city: string; state: string };
      const readyByLocation: ReadyProviderMatch[] = [];
      const oleraIdsToLookup: string[] = [];
      const oleraIdToName: Map<string, string> = new Map();

      for (const row of readyRows ?? []) {
        if (row.provider_business_profile_id) continue; // Already have direct link
        const rd = (row.research_data ?? {}) as Record<string, unknown>;
        const gc = (rd.general_contact ?? {}) as Record<string, unknown>;
        const name = (row.organization_name as string) ?? "";
        const city = (gc.city as string) ?? null;
        const state = (gc.state as string) ?? null;
        const oleraId = (rd.olera_provider_id as string) ?? null;

        if (name && city && state) {
          // Have location data - use it directly
          readyByLocation.push({ name: name.toLowerCase(), city: city.toLowerCase(), state });
        } else if (name && oleraId) {
          // No location in research_data, but have olera_provider_id - look it up
          oleraIdsToLookup.push(oleraId);
          oleraIdToName.set(oleraId, name.toLowerCase());
        }
      }

      // Look up location data from olera-providers for records that need it
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

      // Query business_profiles for MedJobs-interested providers
      let query = db
        .from("business_profiles")
        .select(
          "id, slug, display_name, city, state, category, image_url, description, care_types, metadata, claim_state, lat, lng, created_at"
        )
        .in("type", ["organization", "caregiver"])
        .eq("is_active", true);

      // Apply state filter if scoped to catchment
      if (catchmentFilter) {
        query = query.in("state", catchmentFilter.states);
      }

      const { data: bpRows } = await query;

      const inCatchment = (city: string | null, state: string | null) => {
        if (!catchmentFilter) return true; // "all" scope
        return !!city && !!state && catchmentFilter.cities.has(`${city.toLowerCase()}|${state}`);
      };

      const cards: ProviderCard[] = [];

      for (const row of (bpRows ?? []) as unknown as (BusinessProfile & { created_at?: string })[]) {
        // Check catchment filter
        if (!inCatchment(row.city, row.state)) continue;

        const meta = (row.metadata ?? {}) as Record<string, unknown>;

        // Check MedJobs interest indicators (non-empty strings only)
        const hasAcceptedTerms =
          typeof meta.interview_terms_accepted_at === "string" &&
          meta.interview_terms_accepted_at !== "";
        const hasCompletedEligibility =
          typeof meta.medjobs_eligibility_completed_at === "string" &&
          meta.medjobs_eligibility_completed_at !== "";
        const sourceProviderId =
          typeof meta.source_provider_id === "string" && meta.source_provider_id !== ""
            ? meta.source_provider_id
            : null;

        // Check if enrolled via staffing outreach (match by source_provider_id only)
        // Note: staffing_outreach.provider_id references olera-providers.provider_id,
        // NOT business_profiles.id. The link is via metadata.source_provider_id.
        const isEnrolledViaOutreach = !!sourceProviderId && outreachProviderIds.has(sourceProviderId);

        // Check if marked "ready for students" in MedJobs task board
        // This is the canonical signal from admin workflow
        // First check direct link, then check by name+city+state match
        let isReadyForStudents = readyForStudentsIds.has(row.id);
        if (!isReadyForStudents && row.display_name && row.city && row.state && readyByLocation.length > 0) {
          // Try to match by name + location (requires exact city+state match)
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

        // Determine if this is a verified/real provider:
        // - Claimed profiles (real person verified ownership), OR
        // - Enrolled via outreach (we vetted them during campaigns), OR
        // - Marked ready for students (admin verified in task board)
        const isClaimed = row.claim_state === "claimed";
        const isVerifiedProvider = isClaimed || isEnrolledViaOutreach || isReadyForStudents;

        // Skip if no MedJobs interest OR not a verified provider
        // This filters out test accounts and unverified directory listings
        // Sources: 1) accepted terms, 2) completed eligibility, 3) outreach enrolled, 4) ready for students
        if (!hasAcceptedTerms && !hasCompletedEligibility && !isEnrolledViaOutreach && !isReadyForStudents) {
          continue;
        }
        if (!isVerifiedProvider) {
          continue;
        }

        const card = businessProfileToCardFormat(row) as ProviderCard;
        card.isProgram = row.claim_state === "claimed";
        card.createdAt = row.created_at ?? null;
        card.opportunity = readOpportunityProfile(meta);
        card.isReadyForStudents = isReadyForStudents;
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
