import { NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/demand
 *
 * Returns city-grouped counts of care seekers with active care posts.
 * Used by the Demand Map admin page for sales prioritization.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const db = getServiceClient();

    // Fetch all family profiles with active care posts
    // Scale: expected dozens to low hundreds — client-side aggregation is fine
    const { data, error } = await db
      .from("business_profiles")
      .select("id, city, state, created_at, metadata")
      .eq("type", "family")
      .eq("is_active", true)
      .contains("metadata", { care_post: { status: "active" } });

    if (error) {
      console.error("Admin demand error:", error);
      return NextResponse.json({ error: `Failed to fetch demand data: ${error.message}` }, { status: 500 });
    }

    const profiles = data ?? [];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate by city+state
    const cityMap = new Map<string, {
      city: string;
      state: string;
      count: number;
      new_this_week: number;
      latest_published: string;
    }>();

    for (const p of profiles) {
      const city = p.city || "Location not set";
      const state = p.state || "";
      const key = `${city}|||${state}`;
      const publishedAt = p.metadata?.care_post?.published_at || p.created_at;

      const existing = cityMap.get(key);
      if (existing) {
        existing.count++;
        if (new Date(publishedAt) > new Date(existing.latest_published)) {
          existing.latest_published = publishedAt;
        }
        if (new Date(publishedAt) >= weekAgo) {
          existing.new_this_week++;
        }
      } else {
        cityMap.set(key, {
          city,
          state,
          count: 1,
          new_this_week: new Date(publishedAt) >= weekAgo ? 1 : 0,
          latest_published: publishedAt,
        });
      }
    }

    const cities = Array.from(cityMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      cities,
      total_public: profiles.length,
      total_cities: cities.length,
      new_this_week: profiles.filter(p => {
        const pub = p.metadata?.care_post?.published_at || p.created_at;
        return new Date(pub) >= weekAgo;
      }).length,
    });
  } catch (err) {
    console.error("Admin demand error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
