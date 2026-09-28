import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import { getWorkQueueProviders } from "@/lib/provider-growth/queries";

/**
 * GET /api/admin/provider-growth/work-queue
 *
 * Returns providers that need follow-up action, organized by urgency:
 * - Overdue Callbacks: callback_date < today
 * - Due Today: callback_date = today
 * - Needs Retry: voicemail/hung_up/left_message, stale > 2 days
 * - Stale: no activity in 7+ days
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

    const result = await getWorkQueueProviders();

    return NextResponse.json(result);
  } catch (e) {
    console.error("[work-queue] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
