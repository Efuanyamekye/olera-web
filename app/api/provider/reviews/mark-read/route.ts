import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { activeProviderProfile } from "@/lib/providers/active-profile.server";

/**
 * POST /api/provider/reviews/mark-read
 *
 * Mark a review as read by the current provider's profile.
 * Stores read timestamp in metadata.read_by[profileId].
 *
 * Body: { reviewId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { reviewId } = body;

    if (!reviewId) {
      return NextResponse.json(
        { error: "reviewId is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Get user's account
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Get user's provider profile
    const { data: profile } = await activeProviderProfile(db, account.id, "id, slug, source_provider_id");

    if (!profile) {
      return NextResponse.json(
        { error: "No provider profile found" },
        { status: 404 }
      );
    }

    // Fetch the review
    const { data: review, error: fetchError } = await db
      .from("reviews")
      .select("id, provider_id, metadata")
      .eq("id", reviewId)
      .single();

    if (fetchError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Verify provider owns this review (review.provider_id may be slug, UUID, or source_provider_id)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    if (!providerIdVariants.includes(review.provider_id)) {
      return NextResponse.json(
        { error: "Not authorized to mark this review as read" },
        { status: 403 }
      );
    }

    // Update metadata.read_by
    const existingMeta =
      (review.metadata as Record<string, unknown>) || {};
    const existingReadBy =
      (existingMeta.read_by as Record<string, string>) || {};

    const updatedReadBy = {
      ...existingReadBy,
      [profile.id]: new Date().toISOString(),
    };

    const { error: updateError } = await db
      .from("reviews")
      .update({
        metadata: { ...existingMeta, read_by: updatedReadBy },
      })
      .eq("id", reviewId);

    if (updateError) {
      console.error("[reviews/mark-read] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to mark as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profileId: profile.id });
  } catch (err) {
    console.error("[reviews/mark-read] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
