import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  detectMedjobsCatchment,
  detectMedjobsCatchmentBatch,
  getPartnerUniversitySummary,
} from "@/lib/provider-growth/medjobs-eligibility";

/**
 * POST /api/admin/provider-growth/detect-eligibility
 *
 * Detect MedJobs eligibility for one or more providers based on location.
 * Can be used for:
 * - Single provider check (provide city/state)
 * - Batch check (provide array of {id, city, state})
 * - Update tracking records (provide update: true)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { city, state, providers, update } = body;

    // Single provider check
    if (city && state && !providers) {
      const eligibility = detectMedjobsCatchment(city, state);
      return NextResponse.json({ eligibility });
    }

    // Batch check
    if (providers && Array.isArray(providers)) {
      const results = detectMedjobsCatchmentBatch(providers);

      // Convert Map to object for JSON response
      const eligibilityMap: Record<string, { eligible: boolean; university: string | null }> = {};
      results.forEach((value, key) => {
        eligibilityMap[key] = value;
      });

      // Optionally update tracking records
      if (update) {
        const db = getServiceClient();
        const updates: Array<{ id: string; medjobs_eligible: boolean; medjobs_catchment_university: string | null }> = [];

        results.forEach((value, id) => {
          updates.push({
            id,
            medjobs_eligible: value.eligible,
            medjobs_catchment_university: value.university,
          });
        });

        // Update in batches
        for (const { id, medjobs_eligible, medjobs_catchment_university } of updates) {
          await db
            .from("provider_growth_tracking")
            .update({ medjobs_eligible, medjobs_catchment_university })
            .eq("business_profile_id", id);
        }
      }

      return NextResponse.json({
        eligibility: eligibilityMap,
        count: {
          total: providers.length,
          eligible: Array.from(results.values()).filter((v) => v.eligible).length,
        },
      });
    }

    return NextResponse.json(
      { error: "Provide either city/state or providers array" },
      { status: 400 }
    );
  } catch (e) {
    console.error("[provider-growth] POST detect-eligibility error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * GET /api/admin/provider-growth/detect-eligibility
 *
 * Get list of partner universities and their catchment sizes.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const universities = getPartnerUniversitySummary();

    return NextResponse.json({ universities });
  } catch (e) {
    console.error("[provider-growth] GET detect-eligibility error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
