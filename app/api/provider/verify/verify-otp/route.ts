import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendSlackAlert, slackVerificationReview } from "@/lib/slack";
import { sendEmail } from "@/lib/email";
import { verificationApprovedEmail } from "@/lib/email-templates";
import { scoreClaimTrust, extractDomainFromWebsite } from "@/lib/claim-trust";

// ============================================================
// Types
// ============================================================

interface VerifyOtpRequest {
  profileId: string;
  code: string;
}

// ============================================================
// Supabase Admin Client
// ============================================================

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

// ============================================================
// Main Handler
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VerifyOtpRequest;
    const { profileId, code } = body;

    if (!profileId || !code) {
      return NextResponse.json(
        { success: false, verified: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user is authenticated
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, verified: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, verified: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Fetch profile with OTP data
    const { data: profile, error: fetchError } = await admin
      .from("business_profiles")
      .select("id, slug, display_name, website, account_id, metadata, verification_state")
      .eq("id", profileId)
      .single();

    if (fetchError || !profile) {
      return NextResponse.json(
        { success: false, verified: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    // Verify user owns this profile
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!account || profile.account_id !== account.id) {
      return NextResponse.json(
        { success: false, verified: false, error: "Not authorized" },
        { status: 403 }
      );
    }

    // Already verified?
    if (profile.verification_state === "verified") {
      return NextResponse.json({
        success: true,
        verified: true,
        reason: "Already verified",
      });
    }

    // Check OTP
    const metadata = (profile.metadata as Record<string, unknown>) || {};
    const otpData = metadata.verification_otp as {
      code?: string;
      email?: string;
      fullName?: string;
      expires_at?: string;
    } | undefined;

    if (!otpData || !otpData.code) {
      return NextResponse.json({
        success: false,
        verified: false,
        error: "No verification code found. Please request a new code.",
        pendingReview: false,
      });
    }

    // Check expiry
    if (otpData.expires_at && new Date(otpData.expires_at) < new Date()) {
      return NextResponse.json({
        success: false,
        verified: false,
        error: "Code expired. Please request a new one.",
        pendingReview: false,
      });
    }

    // Check code match
    if (otpData.code !== code) {
      return NextResponse.json({
        success: false,
        verified: false,
        error: "Invalid code. Please check and try again.",
        pendingReview: false,
      });
    }

    // OTP is valid! Now check if email domain gives instant verification
    const email = otpData.email || "";
    const fullName = otpData.fullName || "";
    const businessDomain = extractDomainFromWebsite(profile.website);

    // Score the email for trust
    const trustResult = await scoreClaimTrust({
      email,
      providerName: profile.display_name || "",
      providerDomain: businessDomain,
    });

    // Clear the OTP data
    const { verification_otp: _, ...cleanMetadata } = metadata;

    if (trustResult.level === "high") {
      // High trust = instant verification
      const updatedMetadata = {
        ...cleanMetadata,
        verification_method: "email",
        verification_value: email,
        verified_at: new Date().toISOString(),
        verification_reason: `Email OTP verified: ${trustResult.reason}`,
        claimer_name: fullName,
      };

      const { error: updateError } = await admin
        .from("business_profiles")
        .update({
          verification_state: "verified",
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (updateError) {
        console.error("[verify-otp] Failed to update profile:", updateError);
        return NextResponse.json(
          { success: false, verified: false, error: "Failed to save verification" },
          { status: 500 }
        );
      }

      // Send verification success email
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
      try {
        await sendEmail({
          to: email,
          subject: "You're verified!",
          html: verificationApprovedEmail({
            providerName: profile.display_name || "your organization",
            recipientName: fullName || "there",
            dashboardUrl: `${siteUrl}/provider`,
            autoApproved: true,
          }),
          emailType: "verification_approved",
          recipientType: "provider",
          providerId: profile.slug,
          metadata: { method: "email", auto_verified: true },
        });
      } catch (emailErr) {
        console.error("[verify-otp] Failed to send verification email:", emailErr);
      }

      // Publish any pending Q&A answers
      const { error: publishError, count: publishedCount } = await admin
        .from("provider_questions")
        .update({
          answer_status: "published",
          is_public: true,
          updated_at: new Date().toISOString(),
        })
        .eq("answered_by", profileId)
        .eq("answer_status", "pending");

      if (publishError) {
        console.error("[verify-otp] Failed to publish pending answers:", publishError);
      } else if (publishedCount && publishedCount > 0) {
        console.log(`[verify-otp] Published ${publishedCount} pending Q&A answers`);
      }

      console.log(`[verify-otp] Auto-verified ${profile.display_name} via email OTP: ${trustResult.reason}`);

      return NextResponse.json({
        success: true,
        verified: true,
        reason: `Email verified: ${trustResult.reason}`,
        pendingReview: false,
      });
    } else {
      // Medium/low trust - OTP proves email ownership, but domain doesn't match business
      // This counts as a valid verification attempt - user should try another method
      // We DON'T set verification_state to "pending" here - that would prevent Slack alerts
      // when subsequent methods also fail. Instead, we just return pendingReview: true
      // and let the main verify route handle the state transition + Slack on future attempts.

      // Store the OTP attempt info for reference, but don't change verification_state
      const updatedMetadata = {
        ...cleanMetadata,
        email_otp_attempt: {
          email,
          fullName,
          submitted_at: new Date().toISOString(),
          reason: `OTP verified but ${trustResult.reason}`,
          otp_verified: true,
        },
      };

      const { error: updateError } = await admin
        .from("business_profiles")
        .update({
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (updateError) {
        console.error("[verify-otp] Failed to update profile metadata:", updateError);
      }

      console.log(`[verify-otp] OTP valid but low trust for ${profile.display_name}: ${trustResult.reason}`);

      return NextResponse.json({
        success: true,
        verified: false,
        reason: trustResult.reason,
        suggestion: "Your email was verified, but we couldn't match it to the business. Try another method.",
        pendingReview: true,
      });
    }
  } catch (error) {
    console.error("[verify-otp] Error:", error);
    return NextResponse.json(
      { success: false, verified: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
