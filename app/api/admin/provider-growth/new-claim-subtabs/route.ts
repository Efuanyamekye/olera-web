import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getNewClaimSubtabCounts } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/new-claim-subtabs
 *
 * Returns counts for Claimed subtabs (In Progress is now a separate top-level tab):
 * - notContacted: providers with no call attempts and not converted
 * - converted: providers on free trial with no call attempts (self-converted)
 * - inProgress: providers with call attempts (now shown as separate top-level tab count)
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

    const counts = await getNewClaimSubtabCounts();
    // Return all counts - inProgress is now used as a separate top-level tab
    return NextResponse.json(counts);
  } catch (err) {
    console.error("[new-claim-subtabs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
