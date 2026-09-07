import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getGrowthStats } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/stats
 *
 * Get counts for each pipeline stage and conversion status.
 * Used to populate tab badges.
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

    const stats = await getGrowthStats();

    return NextResponse.json({ stats });
  } catch (e) {
    console.error("[provider-growth] GET stats error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
