import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getClaimedAndConvertedSubtabCounts } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/subtab-counts
 *
 * Returns counts for both Claimed and Converted tabs:
 *
 * Claimed tab (non-converted providers):
 * - claimed.notContacted: no call attempts, never started free trial
 * - claimed.inProgress: has call attempts, never started free trial
 *
 * Converted tab (providers on free trial):
 * - converted.notContacted: no call attempts, on free trial
 * - converted.inProgress: has call attempts, on free trial
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

    const counts = await getClaimedAndConvertedSubtabCounts();
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[subtab-counts] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
