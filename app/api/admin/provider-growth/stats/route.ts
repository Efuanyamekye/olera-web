import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getGrowthStats, type SubtabCountsFilterOptions } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/stats
 *
 * Get counts for each pipeline stage and conversion status.
 * Used to populate tab badges.
 *
 * Supports filter parameters to match the main provider list:
 * - completenessMin: minimum profile completeness percentage
 * - completenessMax: maximum profile completeness percentage
 * - careTypes: comma-separated care type filter values
 * - claimedFrom: filter by claim date start
 * - claimedTo: filter by claim date end
 * - search: provider name search
 * - assignedTo: filter by assigned admin ID
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Parse filter parameters
    const { searchParams } = new URL(request.url);
    const filters: SubtabCountsFilterOptions = {};

    const completenessMin = searchParams.get("completenessMin");
    if (completenessMin) {
      filters.completenessMin = parseInt(completenessMin, 10);
    }

    const completenessMax = searchParams.get("completenessMax");
    if (completenessMax) {
      filters.completenessMax = parseInt(completenessMax, 10);
    }

    const careTypes = searchParams.get("careTypes");
    if (careTypes) {
      filters.careTypes = careTypes.split(",").filter(Boolean);
    }

    const claimedFrom = searchParams.get("claimedFrom");
    if (claimedFrom) {
      filters.claimedFrom = claimedFrom;
    }

    const claimedTo = searchParams.get("claimedTo");
    if (claimedTo) {
      filters.claimedTo = claimedTo;
    }

    const search = searchParams.get("search");
    if (search) {
      filters.search = search;
    }

    const assignedTo = searchParams.get("assignedTo");
    if (assignedTo) {
      filters.assignedTo = assignedTo;
    }

    const stats = await getGrowthStats(filters);

    return NextResponse.json({ stats });
  } catch (e) {
    console.error("[provider-growth] GET stats error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
