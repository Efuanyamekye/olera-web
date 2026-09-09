import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getConvertedSubtabCounts } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/converted-subtabs
 *
 * Returns counts for Converted subtabs:
 * - notContacted: converted providers with no call attempts
 * - inProgress: converted providers with at least one call attempt
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

    const counts = await getConvertedSubtabCounts();
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[converted-subtabs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
