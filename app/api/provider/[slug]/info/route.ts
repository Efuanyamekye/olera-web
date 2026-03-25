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

    // Try to find the provider by slug in business_profiles
    const { data: profile } = await db
      .from("business_profiles")
      .select("id, display_name, slug, image_url, tagline, city, state, metadata, type")
      .eq("slug", slug)
      .maybeSingle();

    if (!profile) {
      // Try legacy olera-providers table as fallback
      const { data: legacyProvider } = await db
        .from("olera-providers")
        .select("provider_id, name, city, state, place_id")
        .eq("provider_id", slug)
        .single();

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
