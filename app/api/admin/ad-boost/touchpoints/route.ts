import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * Touchpoint analytics for Ad Boost pitch surfaces.
 *
 * Queries provider_activity for ads_touchpoint_* events and aggregates
 * by touchpoint (post_edit, post_question, leads_page, hero_managed_ads,
 * hero_views_to_ads) to show which surfaces drive engagement.
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — returns touchpoint stats for date range.
 *
 * Auth: admin only.
 */

interface TouchpointRow {
  touchpoint: string;
  viewed: number;
  clicked: number;
  dismissed: number;
}

const TOUCHPOINT_LABELS: Record<string, string> = {
  post_edit: "Post-edit nudge",
  post_question: "After answering question",
  leads_page: "Leads page nudge",
  hero_managed_ads: "Profile hero (managed ads)",
  hero_views_to_ads: "Profile hero (views to ads)",
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const db = getServiceClient();

  // Default to last 30 days
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;

  // Query all touchpoint events in range
  const { data: events, error } = await db
    .from("provider_activity")
    .select("event_type, metadata, provider_id")
    .in("event_type", [
      "ads_touchpoint_viewed",
      "ads_touchpoint_clicked",
      "ads_touchpoint_dismissed",
    ])
    .gte("created_at", `${from}T00:00:00Z`)
    .lte("created_at", `${to}T23:59:59Z`)
    .order("created_at", { ascending: false })
    .limit(50000);

  if (error) {
    console.error("[admin/ad-boost/touchpoints] query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by touchpoint
  const touchpointStats: Record<string, { viewed: Set<string>; clicked: Set<string>; dismissed: Set<string> }> = {};

  for (const event of events || []) {
    const meta = (event.metadata || {}) as Record<string, unknown>;
    const touchpoint = (meta.touchpoint as string) || "unknown";
    const providerId = event.provider_id as string;

    // Skip events without a valid provider_id
    if (!providerId) continue;

    if (!touchpointStats[touchpoint]) {
      touchpointStats[touchpoint] = {
        viewed: new Set(),
        clicked: new Set(),
        dismissed: new Set(),
      };
    }

    if (event.event_type === "ads_touchpoint_viewed") {
      touchpointStats[touchpoint].viewed.add(providerId);
    } else if (event.event_type === "ads_touchpoint_clicked") {
      touchpointStats[touchpoint].clicked.add(providerId);
    } else if (event.event_type === "ads_touchpoint_dismissed") {
      touchpointStats[touchpoint].dismissed.add(providerId);
    }
  }

  // Convert to array sorted by viewed count
  const rows: TouchpointRow[] = Object.entries(touchpointStats)
    .map(([touchpoint, stats]) => ({
      touchpoint,
      label: TOUCHPOINT_LABELS[touchpoint] || touchpoint,
      viewed: stats.viewed.size,
      clicked: stats.clicked.size,
      dismissed: stats.dismissed.size,
      ctr: stats.viewed.size > 0
        ? Math.round((stats.clicked.size / stats.viewed.size) * 100)
        : 0,
    }))
    .sort((a, b) => b.viewed - a.viewed);

  // Calculate totals
  const totals = {
    viewed: rows.reduce((sum, r) => sum + r.viewed, 0),
    clicked: rows.reduce((sum, r) => sum + r.clicked, 0),
    dismissed: rows.reduce((sum, r) => sum + r.dismissed, 0),
  };

  return NextResponse.json({
    range: { from, to },
    touchpoints: rows,
    totals,
  });
}
