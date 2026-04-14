import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * POST /api/provider/olera-reviews/[id]/flag
 *
 * Flag an Olera review as inappropriate. Requires authentication.
 * Only the provider who received the review can flag it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reviewId } = await params;

    if (!reviewId) {
      return NextResponse.json({ error: "Review ID is required" }, { status: 400 });
    }

    // Authenticate user
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
      .select("slug")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Get the review and verify it belongs to this provider
    const { data: review, error: reviewError } = await db
      .from("olera_reviews")
      .select("id, provider_slug, flagged")
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.provider_slug !== profile.slug) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (review.flagged) {
      return NextResponse.json({ error: "Review is already flagged" }, { status: 400 });
    }

    // Flag the review
    const { error: updateError } = await db
      .from("olera_reviews")
      .update({
        flagged: true,
        flagged_at: new Date().toISOString(),
        flagged_reason: "Flagged by provider",
      })
      .eq("id", reviewId);

    if (updateError) {
      console.error("Failed to flag review:", updateError);
      return NextResponse.json({ error: "Failed to flag review" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Flag review error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
