import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/analytics/mobile-nav-stats
 *
 * Returns mobile nav variant analytics:
 * 1. Device breakdown (mobile/desktop/tablet) for provider dashboard visits
 * 2. Variant funnel metrics (impressions → conversions by variant)
 *
 * Query params:
 *   from: ISO date string (default: 30 days ago)
 *   to: ISO date string (default: now)
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const searchParams = request.nextUrl.searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const from = searchParams.get("from") || defaultFrom.toISOString();
  const to = searchParams.get("to") || now.toISOString();

  const db = getServiceClient();

  // 1. Device breakdown - count dashboard visits by ua_class
  const { data: deviceData, error: deviceError } = await db.rpc("get_provider_device_breakdown", {
    from_date: from,
    to_date: to,
  });

  if (deviceError) {
    console.error("[mobile-nav-stats] Device breakdown error:", deviceError);
  }

  // 2. Variant funnel - impressions and downstream conversions by variant
  const { data: variantData, error: variantError } = await db.rpc("get_mobile_nav_variant_funnel", {
    from_date: from,
    to_date: to,
  });

  if (variantError) {
    console.error("[mobile-nav-stats] Variant funnel error:", variantError);
  }

  return NextResponse.json({
    range: { from, to },
    deviceBreakdown: deviceData || [],
    variantFunnel: variantData || [],
  });
}
