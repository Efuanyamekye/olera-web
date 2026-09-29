import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getCallbacksDue } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/callbacks-due
 *
 * Returns callbacks that are due today, overdue, or upcoming (next 7 days).
 * Used for the callback queue banner on the In Progress tab.
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const result = await getCallbacksDue();

    return NextResponse.json(result);
  } catch (e) {
    console.error("[callbacks-due] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
