import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";

/**
 * GET /api/provider/[slug]/info
 *
 * Fetch public provider info by slug. No auth required.
 * Used by the public review page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Try to find the provider by slug in business_profiles (only provider types)
    let profile = null;

    console.log("Looking up provider with slug:", slug);

    // First try: strict type filter (organization or caregiver)
    const { data: strictProfile, error: strictError } = await db
      .from("business_profiles")
      .select("id, display_name, slug, image_url, tagline, city, state, metadata, type")
      .eq("slug", slug)
      .in("type", ["organization", "caregiver"])
      .maybeSingle();

    console.log("Strict query result:", { strictProfile, strictError });

    profile = strictProfile;

    // Second try: if not found, search without type filter but exclude family/student
    // This handles older profiles that may have null or different types
    if (!profile) {
      const { data: lenientProfile, error: lenientError } = await db
        .from("business_profiles")
        .select("id, display_name, slug, image_url, tagline, city, state, metadata, type")
        .eq("slug", slug)
        .not("type", "in", "(family,student)")
        .maybeSingle();

      console.log("Lenient query result:", { lenientProfile, lenientError });

      profile = lenientProfile;
    }

    if (!profile) {
      // Third try: legacy olera-providers table as fallback
      const { data: legacyProvider } = await db
        .from("olera-providers")
        .select("provider_id, name, city, state, place_id")
        .eq("provider_id", slug)
        .maybeSingle();

      if (legacyProvider) {
        return NextResponse.json({
          provider: {
            id: legacyProvider.provider_id,
            display_name: legacyProvider.name,
            slug: legacyProvider.provider_id,
            image_url: null,
            tagline: null,
            city: legacyProvider.city,
            state: legacyProvider.state,
            google_place_id: legacyProvider.place_id || null,
          },
        });
      }

      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Extract Google Place ID from metadata
    const googlePlaceId = profile.metadata?.google_metadata?.place_id || null;

    return NextResponse.json({
      provider: {
        id: profile.id,
        display_name: profile.display_name,
        slug: profile.slug,
        image_url: profile.image_url,
        tagline: profile.tagline,
        city: profile.city,
        state: profile.state,
        google_place_id: googlePlaceId,
      },
    });
  } catch (err) {
    console.error("Provider info GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
