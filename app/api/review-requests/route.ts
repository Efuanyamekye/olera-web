import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { reviewRequestEmail } from "@/lib/email-templates";

interface ReviewRequestClient {
  name: string;
  email?: string;
  phone?: string;
}

interface EmailLogRow {
  id: string;
  recipient: string;
  created_at: string;
  status: string;
  metadata: {
    client_name?: string;
    delivery_method?: string;
  } | null;
}

interface OleraReviewRow {
  id: string;
  reviewer_name: string;
  rating: number;
  review_text: string;
  created_at: string;
  flagged: boolean;
}

// Free credit limit for review requests (lifetime, not monthly)
const FREE_REVIEW_CREDITS = 3;

/**
 * GET /api/review-requests
 *
 * Fetch sent review request emails for the authenticated provider.
 * Returns list of sent requests with recipient info, method, date, and open status.
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
      .select("id, metadata")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Get access tier info
    const metadata = (profile.metadata || {}) as Record<string, unknown>;
    const isPaid = !!(metadata.medjobs_subscription_active as boolean);
    const reviewCreditsUsed = (metadata.reviews_credits_used as number) || 0;

    // Get the provider's slug for matching Olera reviews
    const { data: profileWithSlug } = await db
      .from("business_profiles")
      .select("slug")
      .eq("id", profile.id)
      .single();

    const providerSlug = profileWithSlug?.slug;

    // Fetch review request emails and Olera reviews in parallel
    const [emailsResult, oleraReviewsResult] = await Promise.all([
      db
        .from("email_log")
        .select("id, recipient, created_at, status, metadata")
        .eq("provider_id", profile.id)
        .eq("email_type", "review_request")
        .order("created_at", { ascending: false })
        .limit(100),
      providerSlug
        ? db
            .from("olera_reviews")
            .select("id, reviewer_name, rating, review_text, created_at, flagged")
            .eq("provider_slug", providerSlug)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (emailsResult.error) {
      console.error("Failed to fetch review request emails:", emailsResult.error);
      return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }

    const emails = emailsResult.data as EmailLogRow[] | null;
    const oleraReviews = (oleraReviewsResult.data as OleraReviewRow[] | null) || [];

    // Create a map of reviewer names to their reviews (case-insensitive)
    const reviewsByName = new Map<string, OleraReviewRow>();
    for (const review of oleraReviews) {
      const normalizedName = review.reviewer_name.toLowerCase().trim();
      // Only keep the first (most recent) review per name
      if (!reviewsByName.has(normalizedName)) {
        reviewsByName.set(normalizedName, review);
      }
    }

    // Transform the data for the frontend, matching reviews to requests
    const requests = ((emails as EmailLogRow[]) || []).map((email) => {
      const clientName = email.metadata?.client_name || email.recipient.split("@")[0];
      const normalizedClientName = clientName.toLowerCase().trim();
      const matchingReview = reviewsByName.get(normalizedClientName);

      return {
        id: email.id,
        clientName,
        recipient: email.recipient,
        deliveryMethod: email.metadata?.delivery_method || "email",
        sentAt: email.created_at,
        status: email.status,
        // Olera review data (if they left a review)
        oleraReviewId: matchingReview?.id || null,
        hasReview: !!matchingReview && !matchingReview.flagged,
        reviewRating: matchingReview?.rating || null,
        reviewFlagged: matchingReview?.flagged || false,
      };
    });

    return NextResponse.json({
      requests,
      is_paid: isPaid,
      credits_used: reviewCreditsUsed,
      credits_remaining: isPaid ? Infinity : Math.max(FREE_REVIEW_CREDITS - reviewCreditsUsed, 0),
    });
  } catch (err) {
    console.error("Review requests GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/review-requests
 *
 * Send review request emails to clients. Requires authentication.
 *
 * Body: {
 *   clients: Array<{ name: string, email?: string, phone?: string }>
 *   message: string
 *   delivery_method: "email" | "sms" | "both"
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
    const { clients, message, delivery_method } = body as {
      clients: ReviewRequestClient[];
      message: string;
      delivery_method: "email" | "sms" | "both";
    };

    // Validate inputs
    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: "At least one client is required" }, { status: 400 });
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (clients.length > 50) {
      return NextResponse.json({ error: "Maximum 50 clients per request" }, { status: 400 });
    }

    // Get the user's provider profile
    const db = getServiceClient();

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
      .select("id, display_name, slug, metadata")
      .eq("account_id", account.id)
      .in("type", ["organization", "caregiver"])
      .single();

    if (!profile?.slug) {
      return NextResponse.json({ error: "No provider profile found" }, { status: 400 });
    }

    // Check access tier for review requests
    const metadata = (profile.metadata || {}) as Record<string, unknown>;
    const isPaid = !!(metadata.medjobs_subscription_active as boolean);
    const reviewCreditsUsed = (metadata.reviews_credits_used as number) || 0;

    // If not paid and at/over limit, require upgrade
    if (!isPaid && reviewCreditsUsed >= FREE_REVIEW_CREDITS) {
      return NextResponse.json(
        {
          error: "Review request limit reached",
          upgrade_required: true,
          credits_used: reviewCreditsUsed,
        },
        { status: 402 }
      );
    }

    // Check if this batch would exceed the limit (prevent batch bypass)
    const clientsWithEmail = clients.filter((c) => c.email);
    if (!isPaid && reviewCreditsUsed + clientsWithEmail.length > FREE_REVIEW_CREDITS) {
      const creditsRemaining = FREE_REVIEW_CREDITS - reviewCreditsUsed;
      return NextResponse.json(
        {
          error: `You can only send ${creditsRemaining} more free request${creditsRemaining === 1 ? "" : "s"}. Upgrade to Pro for unlimited requests.`,
          upgrade_required: true,
          credits_used: reviewCreditsUsed,
          credits_remaining: creditsRemaining,
        },
        { status: 402 }
      );
    }

    // Use request origin for correct preview/staging URLs, fallback to env variable
    const requestHost = request.headers.get("host");
    const protocol = requestHost?.includes("localhost") ? "http" : "https";
    const siteUrl = requestHost
      ? `${protocol}://${requestHost}`
      : process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
    const results: { name: string; email?: string; status: "sent" | "skipped" | "failed"; error?: string }[] = [];

    // Process each client
    for (const client of clients) {
      // Skip clients without email if sending email
      if (delivery_method !== "sms" && client.email) {
        const reviewUrl = `${siteUrl}/review/${profile.slug}?ref=email&name=${encodeURIComponent(client.name)}`;

        try {
          const emailResult = await sendEmail({
            to: client.email,
            subject: `${profile.display_name} would love your feedback`,
            html: reviewRequestEmail({
              clientName: client.name,
              providerName: profile.display_name || "Your care provider",
              customMessage: message.trim(),
              reviewUrl,
            }),
            emailType: "review_request",
            recipientType: "family",
            providerId: profile.id,
            metadata: {
              client_name: client.name,
              delivery_method,
            },
          });

          if (emailResult.success) {
            results.push({ name: client.name, email: client.email, status: "sent" });
          } else {
            console.error(`Email send returned error for ${client.email}:`, emailResult.error);
            results.push({
              name: client.name,
              email: client.email,
              status: "failed",
              error: emailResult.error || "Failed to send email",
            });
          }
        } catch (emailErr) {
          console.error(`Failed to send review request to ${client.email}:`, emailErr);
          results.push({
            name: client.name,
            email: client.email,
            status: "failed",
            error: "Failed to send email",
          });
        }
      } else if (!client.email) {
        results.push({
          name: client.name,
          status: "skipped",
          error: "No email address provided",
        });
      }

      // Note: SMS sending is not implemented yet
      // When SMS is needed, integrate with Twilio or similar service
    }

    // Log the review requests for analytics
    try {
      await db.from("review_request_logs").insert({
        provider_id: profile.id,
        provider_slug: profile.slug,
        request_count: clients.length,
        sent_count: results.filter((r) => r.status === "sent").length,
        delivery_method,
        created_by: user.id,
      });
    } catch (logErr) {
      // Non-blocking — don't fail the request if logging fails
      console.error("Failed to log review requests:", logErr);
    }

    const sentCount = results.filter((r) => r.status === "sent").length;

    // Increment review credits used (only for non-paid providers, and only for actually sent emails)
    if (!isPaid && sentCount > 0) {
      const newCreditsUsed = reviewCreditsUsed + sentCount;
      try {
        await db
          .from("business_profiles")
          .update({
            metadata: {
              ...metadata,
              reviews_credits_used: newCreditsUsed,
            },
          })
          .eq("id", profile.id);
      } catch (creditErr) {
        // Non-blocking — don't fail the request if credit tracking fails
        console.error("Failed to update review credits:", creditErr);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      total: clients.length,
      results,
      credits_used: isPaid ? 0 : reviewCreditsUsed + sentCount,
      credits_remaining: isPaid ? Infinity : Math.max(FREE_REVIEW_CREDITS - (reviewCreditsUsed + sentCount), 0),
    });
  } catch (err) {
    console.error("Review requests POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
