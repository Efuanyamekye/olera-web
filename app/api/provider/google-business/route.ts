import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { validateGooglePlaceId } from "@/lib/google-places";
import { addressesAgree } from "@/lib/providers/address-match";
import { deliverPendingConnections } from "@/lib/notifications/deliver-pending-connections";
import { publishPendingQAAnswers } from "@/lib/notifications/publish-pending-qa-answers";
import { publishPendingInterviews } from "@/lib/notifications/publish-pending-interviews";
import { activeProviderProfile } from "@/lib/providers/active-profile.server";

/**
 * Extract Google Place ID from various URL formats:
 * - https://www.google.com/maps/place/?q=place_id:ChIJ...
 * - https://maps.google.com/?cid=1234567890
 * - https://g.page/r/CxxxxxxxxEAE (short URL - needs resolution)
 * - Direct Place ID: ChIJ..., GhIJ..., etc.
 */
function extractPlaceId(input: string): string | null {
  const trimmed = input.trim();

  // Direct Place ID - alphanumeric string, typically 20+ characters
  // Google Place IDs can start with various prefixes (ChIJ, GhIJ, etc.)
  // They contain letters, numbers, underscores, and hyphens
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  // URL with place_id parameter
  const placeIdMatch = trimmed.match(/place_id[=:]([A-Za-z0-9_-]{20,})/i);
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

    const { data: profile } = await activeProviderProfile(db, account.id, "id, slug, display_name, metadata");

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
          error: "Could not extract Place ID. Please provide a valid Place ID (20+ characters) or a Google Maps URL containing 'place_id='",
        },
        { status: 400 }
      );
    }

    // Validate the Place ID with Google Places API
    const validation = await validateGooglePlaceId(placeId);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error || "Invalid Place ID - could not verify with Google",
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

    const { data: profile } = await activeProviderProfile(db, account.id, "id, slug, display_name, address, metadata, verification_state");

    if (!profile) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    const existingMetadata = (profile.metadata || {}) as Record<string, unknown>;
    const existingGoogleMetadata = (existingMetadata.google_metadata || {}) as Record<string, unknown>;
    const isRebind = !!existingGoogleMetadata.place_id;

    if (isRebind && existingGoogleMetadata.place_id === placeId) {
      return NextResponse.json(
        { error: "That is already the connected Google Business Profile." },
        { status: 400 }
      );
    }

    // Changing an existing connection is gated on the new Place being at the
    // same street address as the profile. A first connection is not: it is the
    // ownership proof that grants verification, and at that point the profile
    // address is still whatever the directory seeded, so requiring agreement
    // would lock out exactly the providers who need to correct it.
    //
    // The gate exists because a rebind is otherwise a way to adopt another
    // business's rating. It fails closed: if Google gave us no address to
    // compare, the change is refused rather than allowed.
    if (isRebind) {
      const agreement = addressesAgree(profile.address, validation.formattedAddress);
      if (!agreement.agrees) {
        return NextResponse.json(
          {
            error:
              agreement.reason === "different-street"
                ? `"${validation.name}" is at ${validation.formattedAddress}, which does not match the address on your profile (${profile.address}). Update your profile address first if you have moved, or contact support if this listing is yours.`
                : "We could not confirm that listing is at your profile's address. Contact support and we'll connect it for you.",
            address_mismatch: true,
            place_name: validation.name,
            place_address: validation.formattedAddress,
          },
          { status: 400 }
        );
      }
    }

    // Update the metadata with the new Google Place ID.
    //
    // Everything cached under the old binding describes a DIFFERENT business,
    // so writing a place_id invalidates all of it — on a first connection as
    // much as on a rebind. A profile can hold a cached review payload without
    // ever having owned a place_id: the detail page inherits the linked
    // directory row's place_id, and the on-demand backfill then writes that
    // Place's reviews onto the profile. Keeping them across a connect would
    // pin the directory listing's stars under the provider's own listing, and
    // the backfill never re-fires once the cache is non-empty.
    //
    // google_metadata is rebuilt rather than spread for the same reason: its
    // `rating` and `place_name` describe the place being replaced.
    const { google_reviews_data: _staleReviewCache, ...metadataWithoutReviews } = existingMetadata;
    const boundAt = new Date().toISOString();

    const updatedMetadata = {
      ...metadataWithoutReviews,
      google_metadata: {
        place_id: placeId,
        place_name: validation.name,
        last_synced: boundAt,
        // What the binding was checked against, so a later address change can
        // be spotted without re-querying Google.
        bound_address: profile.address ?? null,
        bound_at: boundAt,
        ...(isRebind
          ? { previous_place_id: existingGoogleMetadata.place_id, rebound_at: boundAt }
          : {}),
      },
    };

    // Update metadata AND auto-verify the provider
    // Connecting Google Business Profile proves business ownership
    const wasVerified = profile.verification_state === "verified";
    const { error: updateError } = await db
      .from("business_profiles")
      .update({
        metadata: updatedMetadata,
        verification_state: "verified",
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("Failed to update Google Business Profile:", updateError);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    // Release pending content and notify (fire-and-forget). Only on the
    // transition into verified — a rebind by an already-verified provider is
    // not a verification event and must not re-fire these notifications.
    const providerName = profile.display_name || "A provider";
    const providerSlug = profile.slug;

    if (!wasVerified) {
      publishPendingQAAnswers(db, profile.id, providerName, providerSlug).catch((err) => {
        console.error("[google-business] Error publishing pending Q&A answers:", err);
      });

      deliverPendingConnections(db, profile.id, providerName, providerSlug).catch((err) => {
        console.error("[google-business] Error delivering pending connections:", err);
      });

      publishPendingInterviews(db, profile.id, providerName, providerSlug).catch((err) => {
        console.error("[google-business] Error publishing pending interviews:", err);
      });
    }

    return NextResponse.json({
      success: true,
      place_id: placeId,
      place_name: validation.name,
      rebound: isRebind,
      verified: true,
    });
  } catch (err) {
    console.error("Google Business POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
