import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * Extract Google Place ID from various URL formats:
 * - https://www.google.com/maps/place/?q=place_id:ChIJ...
 * - https://maps.google.com/?cid=1234567890
 * - https://g.page/r/CxxxxxxxxEAE (short URL - needs resolution)
 * - Direct Place ID: ChIJ...
 */
function extractPlaceId(input: string): string | null {
  const trimmed = input.trim();

  // Direct Place ID (starts with ChIJ or similar pattern)
  if (/^ChIJ[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  // URL with place_id parameter
  const placeIdMatch = trimmed.match(/place_id[=:]([a-zA-Z0-9_-]+)/i);
  if (placeIdMatch) {
    return placeIdMatch[1];
  }

  // CID-based URL (we can't convert CID to Place ID server-side without Google API)
  // For now, return null and let the user know to use a different format

  return null;
}

/**
 * GET /api/provider/google-business
 *
 * Get the current Google Business Profile connection status.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getServiceClient();

    // Get the user's provider profile
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await db
      .from("business_profiles")
      .select("id, slug, display_name, metadata")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    const metadata = (profile.metadata || {}) as Record<string, unknown>;
    const googleMetadata = (metadata.google_metadata || {}) as Record<string, unknown>;
    const placeId = googleMetadata.place_id as string | undefined;

    return NextResponse.json({
      connected: !!placeId,
      place_id: placeId || null,
      profile: {
        slug: profile.slug,
        display_name: profile.display_name,
      },
    });
  } catch (err) {
    console.error("Google Business GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/provider/google-business
 *
 * Connect a Google Business Profile by providing a Place ID or Google Maps URL.
 *
 * Body: {
 *   place_id_or_url: string  // Either a direct Place ID or a Google Maps URL
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { place_id_or_url } = body as { place_id_or_url: string };

    if (!place_id_or_url?.trim()) {
      return NextResponse.json(
        { error: "Please provide a Google Place ID or Google Maps URL" },
        { status: 400 }
      );
    }

    // Extract Place ID from input
    const placeId = extractPlaceId(place_id_or_url);

    if (!placeId) {
      return NextResponse.json(
        {
          error: "Could not extract Place ID. Please provide a direct Place ID (starts with 'ChIJ') or a Google Maps URL containing 'place_id='",
        },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Get the user's provider profile
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await db
      .from("business_profiles")
      .select("id, metadata")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Update the metadata with the new Google Place ID
    const existingMetadata = (profile.metadata || {}) as Record<string, unknown>;
    const existingGoogleMetadata = (existingMetadata.google_metadata || {}) as Record<string, unknown>;

    const updatedMetadata = {
      ...existingMetadata,
      google_metadata: {
        ...existingGoogleMetadata,
        place_id: placeId,
        last_synced: new Date().toISOString(),
      },
    };

    const { error: updateError } = await db
      .from("business_profiles")
      .update({ metadata: updatedMetadata })
      .eq("id", profile.id);

    if (updateError) {
      console.error("Failed to update Google Business Profile:", updateError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      place_id: placeId,
    });
  } catch (err) {
    console.error("Google Business POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
