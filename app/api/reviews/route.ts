import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { newReviewEmail } from "@/lib/email-templates";
import { sendLoopsEvent } from "@/lib/loops";

/**
 * GET /api/reviews?provider_id=xxx
 *
 * Fetch published reviews for a provider. No auth required.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get("provider_id");

  if (!providerId) {
    return NextResponse.json({ error: "provider_id required" }, { status: 400 });
  }

  try {
    const db = getServiceClient();
    const { data: reviews, error } = await db
      .from("reviews")
      .select("id, provider_id, account_id, reviewer_name, rating, title, comment, relationship, status, created_at, updated_at, provider_reply, replied_at")
      .eq("provider_id", providerId)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch reviews:", error);
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }

    return NextResponse.json({ reviews: reviews ?? [] });
  } catch (err) {
    console.error("Reviews GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/reviews
 *
 * Submit a review for a provider. Requires authentication.
 * Body: { provider_id, rating, comment, relationship, title? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { provider_id, rating, comment, relationship, title } = body;

    // Validate required fields
    if (!provider_id) {
      return NextResponse.json({ error: "provider_id is required" }, { status: 400 });
    }
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json({ error: "Rating must be an integer between 1 and 5" }, { status: 400 });
    }
    if (!comment || !comment.trim()) {
      return NextResponse.json({ error: "Review text is required" }, { status: 400 });
    }
    if (!relationship) {
      return NextResponse.json({ error: "Relationship is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Look up account for this user
    const { data: account } = await db
      .from("accounts")
      .select("id, display_name")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Compute reviewer name as "First L."
    const displayName = account.display_name || user.email?.split("@")[0] || "Anonymous";
    const parts = displayName.trim().split(/\s+/);
    const reviewerName = parts.length >= 2
      ? `${parts[0]} ${parts[parts.length - 1][0]}.`
      : parts[0];

    // Check for existing review (one per user per provider)
    const { data: existing } = await db
      .from("reviews")
      .select("id")
      .eq("provider_id", provider_id)
      .eq("account_id", account.id)
      .neq("status", "removed")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "You have already reviewed this provider." },
        { status: 409 }
      );
    }

    // Insert review
    const { data: newReview, error } = await db
      .from("reviews")
      .insert({
        provider_id,
        account_id: account.id,
        reviewer_name: reviewerName,
        rating,
        title: title?.trim() || null,
        comment: comment.trim(),
        relationship,
        status: "published",
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (race condition)
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "You have already reviewed this provider." },
          { status: 409 }
        );
      }
      console.error("Failed to create review:", error);
      return NextResponse.json({ error: "Failed to submit review" }, { status: 500 });
    }

    // Send email notification to provider (fire-and-forget)
    try {
      // Look up provider profile and their account
      const { data: provider } = await db
        .from("business_profiles")
        .select("id, display_name, slug, account_id, email, source_provider_id")
        .eq("id", provider_id)
        .single();

      if (provider) {
        let providerEmail: string | null = null;

        // Try to get email: first from auth user (claimed), then from profile (unclaimed)
        if (provider.account_id) {
          // Claimed provider - get email from auth user
          const { data: providerAccount } = await db
            .from("accounts")
            .select("user_id")
            .eq("id", provider.account_id)
            .single();

          if (providerAccount?.user_id) {
            const { data: authUser } = await db.auth.admin.getUserById(providerAccount.user_id);
            providerEmail = authUser?.user?.email || null;
          }
        }

        // Fallback for unclaimed providers: check business_profiles.email
        if (!providerEmail && provider.email) {
          providerEmail = provider.email;
        }

        // Fallback: check ios_provider_profiles
        if (!providerEmail && provider.source_provider_id) {
          const { data: ios } = await db
            .from("ios_provider_profiles")
            .select("email")
            .eq("provider_id", provider.id)
            .single();
          providerEmail = ios?.email || null;
        }

        // Last fallback: check olera-providers table
        if (!providerEmail && provider.source_provider_id) {
          const { data: sourceProvider } = await db
            .from("olera-providers")
            .select("email")
            .eq("provider_id", provider.source_provider_id)
            .single();
          providerEmail = sourceProvider?.email || null;
        }

        if (providerEmail) {
          // Generate magic link for provider one-click sign-in
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
          const redirectPath = `/provider/welcome?action=review&id=${newReview.id}`;
          // Fallback: direct to welcome page (handles both claimed and unclaimed providers)
          let viewUrl = `${siteUrl}${redirectPath}`;

          try {
            const { data: providerLinkData, error: providerLinkError } = await db.auth.admin.generateLink({
              type: "magiclink",
              email: providerEmail,
              options: {
                redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(redirectPath)}`,
              },
            });
            if (!providerLinkError && providerLinkData?.properties?.action_link) {
              viewUrl = providerLinkData.properties.action_link;
            }
          } catch (linkErr) {
            console.error("Failed to generate provider magic link for review:", linkErr);
            // Continue with fallback URL (welcome page)
          }

          await sendEmail({
            to: providerEmail,
            subject: `${reviewerName.split(" ")[0]} left a review for ${provider.display_name || "your listing"}`,
            html: newReviewEmail({
              providerName: provider.display_name || "Your organization",
              reviewerName,
              rating,
              comment: comment.trim().slice(0, 200) + (comment.trim().length > 200 ? "..." : ""),
              viewUrl,
              providerSlug: provider.slug || undefined,
            }),
          });
          await sendLoopsEvent({
            email: providerEmail,
            eventName: "review_received",
            audience: "provider",
            eventProperties: {
              providerName: provider.display_name || "",
              rating,
              reviewerName,
            },
          });
        }
      }
    } catch (notifyErr) {
      // Non-blocking - log but don't fail the request
      console.error("Failed to send review notification:", notifyErr);
    }

    return NextResponse.json({ review: newReview }, { status: 201 });
  } catch (err) {
    console.error("Reviews POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/reviews
 *
 * Edit a review. Requires authentication and ownership.
 * Body: { id, rating?, title?, comment?, relationship? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { id, rating, title, comment, relationship } = body;

    if (!id) {
      return NextResponse.json({ error: "Review ID is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Look up account for this user
    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Fetch the review and verify ownership
    const { data: review } = await db
      .from("reviews")
      .select("id, account_id")
      .eq("id", id)
      .single();

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    if (review.account_id !== account.id) {
      return NextResponse.json({ error: "You can only edit your own reviews" }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (rating !== undefined) {
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return NextResponse.json({ error: "Rating must be an integer between 1 and 5" }, { status: 400 });
      }
      updates.rating = rating;
    }

    if (title !== undefined) {
      updates.title = title?.trim() || null;
    }

    if (comment !== undefined) {
      if (!comment.trim()) {
        return NextResponse.json({ error: "Review text cannot be empty" }, { status: 400 });
      }
      updates.comment = comment.trim();
    }

    if (relationship !== undefined) {
      if (!relationship) {
        return NextResponse.json({ error: "Relationship is required" }, { status: 400 });
      }
      updates.relationship = relationship;
    }

    // Update the review
    const { data: updatedReview, error } = await db
      .from("reviews")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update review:", error);
      return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
    }

    return NextResponse.json({ review: updatedReview });
  } catch (err) {
    console.error("Reviews PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
