import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

/**
 * GET /api/provider/reviews
 *
 * Fetch reviews for the authenticated provider's profile.
 * Query params: ?filter=all|replied (default: all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get the user's provider profile
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("id, slug, source_provider_id")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Parse filter
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    // Use service client for database operations
    const db = getServiceClient();

    // Build list of possible provider_id values (reviews may be stored with slug, UUID, or source_provider_id)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    // Build query - match any of the possible provider_id formats
    let query = db
      .from("reviews")
      .select("id, provider_id, account_id, reviewer_name, rating, title, comment, relationship, status, created_at, updated_at, provider_reply, replied_at, replied_by")
      .in("provider_id", providerIdVariants)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    // Apply filter
    if (filter === "replied") {
      query = query.not("provider_reply", "is", null);
    }

    const { data: reviews, error } = await query;

    if (error) {
      console.error("Failed to fetch provider reviews:", error);
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }

    // Calculate stats
    const allReviews = reviews ?? [];
    const totalReviews = allReviews.length;
    const repliedCount = allReviews.filter(r => r.provider_reply).length;
    const avgRating = totalReviews > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    // Calculate category breakdown (mock for now - can be expanded)
    const categoryStats = {
      care_quality: avgRating > 0 ? Math.min(5, avgRating + 0.3) : 0,
      communication: avgRating > 0 ? Math.min(5, avgRating - 0.2) : 0,
      value: avgRating,
      cleanliness: avgRating > 0 ? Math.min(5, avgRating - 0.1) : 0,
    };

    return NextResponse.json({
      reviews: reviews ?? [],
      providerSlug: profile.slug,
      stats: {
        totalReviews,
        repliedCount,
        avgRating: Math.round(avgRating * 10) / 10,
        categoryStats,
      },
    });
  } catch (err) {
    console.error("Provider reviews GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/provider/reviews
 *
 * Reply to a review. Only the provider can reply to reviews about their profile.
 * Body: { id: string, reply: string }
 *
 * Sets: provider_reply, replied_at, replied_by
 */
export async function PATCH(request: NextRequest) {
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
    const { id, reply } = body as { id?: string; reply?: string };

    if (!id || !reply?.trim()) {
      return NextResponse.json({ error: "id and reply are required" }, { status: 400 });
    }

    if (reply.length > 1000) {
      return NextResponse.json({ error: "Reply must be under 1000 characters" }, { status: 400 });
    }

    // Get the user's provider profile
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "No account found" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("business_profiles")
      .select("id, slug, source_provider_id")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Use service client for database operations (bypasses RLS)
    const db = getServiceClient();

    // Verify the review belongs to this provider
    const { data: review, error: reviewError } = await db
      .from("reviews")
      .select("id, provider_id, provider_reply")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      console.error("Review lookup error:", reviewError);
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    // Check if review's provider_id matches any of our possible identifiers (slug, UUID, or source_provider_id)
    const providerIdVariants = [profile.slug, profile.id];
    if (profile.source_provider_id) {
      providerIdVariants.push(profile.source_provider_id);
    }

    if (!providerIdVariants.includes(review.provider_id)) {
      console.error("Provider mismatch:", { reviewProviderId: review.provider_id, providerIdVariants });
      return NextResponse.json({ error: "Not authorized to reply to this review" }, { status: 403 });
    }

    // Update the review with the reply
    const { data: updated, error: updateError } = await db
      .from("reviews")
      .update({
        provider_reply: reply.trim(),
        replied_at: new Date().toISOString(),
        replied_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, provider_id, reviewer_name, rating, title, comment, relationship, status, created_at, provider_reply, replied_at")
      .single();

    if (updateError) {
      console.error("Failed to reply to review:", updateError);
      return NextResponse.json({ error: `Failed to save reply: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ review: updated });
  } catch (err) {
    console.error("Provider reviews PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
