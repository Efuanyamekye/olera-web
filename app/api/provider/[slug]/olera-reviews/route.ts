import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";

/**
 * POST /api/provider/[slug]/olera-reviews
 *
 * Submit an Olera review (guest review from review request flow).
 * No auth required - used when provider has no Google Place ID.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const body = await request.json();
    const { reviewer_name, rating, review_text } = body;

    // Validate required fields
    if (!reviewer_name || typeof reviewer_name !== "string" || !reviewer_name.trim()) {
      return NextResponse.json({ error: "reviewer_name is required" }, { status: 400 });
    }

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be between 1 and 5" }, { status: 400 });
    }

    if (!review_text || typeof review_text !== "string" || review_text.trim().length < 10) {
      return NextResponse.json({ error: "review_text must be at least 10 characters" }, { status: 400 });
    }

    const db = getServiceClient();

    // Verify the provider exists
    let providerExists = false;

    // Check business_profiles first
    const { data: bpProfile } = await db
      .from("business_profiles")
      .select("slug")
      .eq("slug", slug)
      .in("type", ["organization", "caregiver"])
      .maybeSingle();

    if (bpProfile) {
      providerExists = true;
    } else {
      // Check olera-providers
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("slug")
        .eq("slug", slug)
        .not("deleted", "is", true)
        .maybeSingle();

      if (iosProvider) {
        providerExists = true;
      }
    }

    if (!providerExists) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Insert the review
    const { data: review, error } = await db
      .from("olera_reviews")
      .insert({
        provider_slug: slug,
        reviewer_name: reviewer_name.trim(),
        rating,
        review_text: review_text.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to insert olera review:", error);
      return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        reviewer_name: review.reviewer_name,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at,
      },
    });
  } catch (err) {
    console.error("Olera review POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/provider/[slug]/olera-reviews
 *
 * Fetch Olera reviews for a provider. Public endpoint.
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

    const { data: reviews, error } = await db
      .from("olera_reviews")
      .select("id, reviewer_name, rating, review_text, created_at")
      .eq("provider_slug", slug)
      .eq("flagged", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch olera reviews:", error);
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }

    const response = NextResponse.json({ reviews: reviews || [] });
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response;
  } catch (err) {
    console.error("Olera reviews GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
