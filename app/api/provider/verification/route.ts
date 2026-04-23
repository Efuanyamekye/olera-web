import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { autoVerifyProvider } from "@/lib/verification-auto";
import { sendSlackAlert, slackVerificationReview } from "@/lib/slack";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate the user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { profileId, submission } = body;

    if (!profileId) {
      return NextResponse.json({ error: "Profile ID required" }, { status: 400 });
    }

    if (!submission?.name || !submission?.role) {
      return NextResponse.json({ error: "Name and role are required" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get user's account
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 403 });
    }

    // Get profile and verify ownership
    const { data: profile, error: fetchError } = await admin
      .from("business_profiles")
      .select("metadata, account_id, verification_state, display_name, slug")
      .eq("id", profileId)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Verify the user owns this profile
    if (profile.account_id !== account.id) {
      return NextResponse.json({ error: "You don't have permission to update this profile" }, { status: 403 });
    }

    // Prepare verification submission data
    const verificationSubmission = {
      name: submission.name,
      email: submission.email || null,
      role: submission.role,
      phone: submission.phone || null,
      notes: submission.notes || null,
      document_url: submission.documentUrl || null,
      linkedin_url: submission.linkedinUrl || null,
      business_website_url: submission.businessWebsiteUrl || null,
      manual_review_requested: submission.manualReviewRequested || false,
      submitted_at: new Date().toISOString(),
    };

    // Merge with existing metadata
    // Reset badge flags so resubmissions appear in pending queue
    const updatedMetadata = {
      ...(profile.metadata || {}),
      verification_submission: verificationSubmission,
      badge_approved: null,
      badge_approved_at: null,
      badge_rejected: null,
      badge_rejected_at: null,
    };

    // Determine the new verification_state based on current state
    // If currently 'unverified' or 'rejected', move to 'pending' (awaiting review)
    // If already 'verified', 'not_required', or 'pending', keep current state (badge update only)
    const shouldUpdateVerificationState =
      profile.verification_state === "unverified" || profile.verification_state === "rejected";
    const newVerificationState = shouldUpdateVerificationState ? "pending" : profile.verification_state;

    // Update profile with verification data
    const { error: updateError } = await admin
      .from("business_profiles")
      .update({
        metadata: updatedMetadata,
        verification_state: newVerificationState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (updateError) {
      console.error("Failed to update profile:", updateError);
      return NextResponse.json({ error: "Failed to save verification" }, { status: 500 });
    }

    // Run auto-verification (fire-and-forget, don't block the response)
    // This runs after storing the submission so the user gets a quick response
    runAutoVerification({
      profileId,
      businessName: profile.display_name || "Unknown Business",
      profileSlug: profile.slug || profileId,
      claimerName: submission.name,
      claimerEmail: submission.email || user.email || "",
      claimerRole: submission.role,
      linkedinUrl: submission.linkedinUrl,
      businessWebsiteUrl: submission.businessWebsiteUrl,
      manualReviewRequested: submission.manualReviewRequested,
    }).catch((err) => {
      console.error("[verification] Auto-verification failed:", err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Verification submission error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Run auto-verification in the background.
 * If high confidence, auto-approves the verification.
 * Otherwise, posts to Slack for manual review.
 */
async function runAutoVerification(opts: {
  profileId: string;
  businessName: string;
  profileSlug: string;
  claimerName: string;
  claimerEmail: string;
  claimerRole: string;
  linkedinUrl?: string | null;
  businessWebsiteUrl?: string | null;
  manualReviewRequested?: boolean;
}) {
  const admin = getAdminClient();
  if (!admin) return;

  try {
    // Run LLM verification
    const result = await autoVerifyProvider({
      claimedName: opts.claimerName,
      claimedRole: opts.claimerRole,
      businessName: opts.businessName,
      linkedinUrl: opts.linkedinUrl,
      businessWebsiteUrl: opts.businessWebsiteUrl,
      manualReviewRequested: opts.manualReviewRequested,
    });

    console.log(
      `[verification] Auto-verify result for ${opts.businessName}:`,
      result.confidence,
      result.reason
    );

    if (result.confidence === "high") {
      // Auto-approve: update verification_state to 'verified' and set badge_approved
      const { data: currentProfile } = await admin
        .from("business_profiles")
        .select("metadata")
        .eq("id", opts.profileId)
        .single();

      const updatedMetadata = {
        ...((currentProfile?.metadata as Record<string, unknown>) || {}),
        badge_approved: true,
        badge_approved_at: new Date().toISOString(),
        auto_verified: true,
        auto_verify_reason: result.reason,
      };

      await admin
        .from("business_profiles")
        .update({
          verification_state: "verified",
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", opts.profileId);

      console.log(`[verification] Auto-approved: ${opts.businessName}`);

      // TODO: Send approval email (Step 8)
    } else {
      // Post to Slack for manual review
      const alert = slackVerificationReview({
        providerName: opts.businessName,
        providerSlug: opts.profileSlug,
        claimerName: opts.claimerName,
        claimerEmail: opts.claimerEmail,
        claimerRole: opts.claimerRole,
        linkedinUrl: opts.linkedinUrl,
        businessWebsiteUrl: opts.businessWebsiteUrl,
        manualReviewRequested: opts.manualReviewRequested,
        autoVerifyReason: result.reason,
      });

      await sendSlackAlert(alert.text, alert.blocks);

      console.log(`[verification] Routed to manual review: ${opts.businessName}`);

      // TODO: Send "we're taking a closer look" email (Step 8)
    }
  } catch (err) {
    console.error("[verification] Auto-verification error:", err);
    // On error, still post to Slack so it doesn't get lost
    try {
      const alert = slackVerificationReview({
        providerName: opts.businessName,
        providerSlug: opts.profileSlug,
        claimerName: opts.claimerName,
        claimerEmail: opts.claimerEmail,
        claimerRole: opts.claimerRole,
        linkedinUrl: opts.linkedinUrl,
        businessWebsiteUrl: opts.businessWebsiteUrl,
        manualReviewRequested: opts.manualReviewRequested,
        autoVerifyReason: "Auto-verification failed — needs manual review",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // If Slack also fails, just log it
    }
  }
}

// GET endpoint to check verification status
export async function GET(request: NextRequest) {
  try {
    // Authenticate the user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");

    if (!profileId) {
      return NextResponse.json({ error: "Profile ID required" }, { status: 400 });
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get user's account
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 403 });
    }

    const { data: profile, error } = await admin
      .from("business_profiles")
      .select("verification_state, metadata, account_id")
      .eq("id", profileId)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Verify ownership
    if (profile.account_id !== account.id) {
      return NextResponse.json({ error: "You don't have permission to view this profile" }, { status: 403 });
    }

    return NextResponse.json({
      verificationState: profile.verification_state,
      submission: (profile.metadata as Record<string, unknown>)?.verification_submission || null,
    });
  } catch (error) {
    console.error("Verification status check error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
