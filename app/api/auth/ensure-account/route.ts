import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Account } from "@/lib/types";
import { sendLoopsEvent } from "@/lib/loops";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { sanitizeDisplayName } from "@/lib/validation";

/**
 * Creates a Supabase admin client with service role key.
 * This bypasses RLS and should only be used server-side.
 * Returns null if service role key is not configured.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not configured - falling back to authenticated client");
    return null;
  }
  return createClient(url, serviceKey);
}

/**
 * POST /api/auth/ensure-account
 *
 * Ensures the authenticated user has an account row in the database.
 * Creates one if it doesn't exist. This handles the edge case where
 * the database trigger didn't fire during auth.
 *
 * Request body (optional):
 * - display_name: string - Name to use if creating a new account
 *
 * Returns:
 * - 200: { account: Account } - The account (existing or newly created)
 * - 401: User not authenticated
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    // Get the authenticated user from cookies
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse optional body
    let displayName = "";
    let markOnboardingComplete = false;
    let claimToken: string | null = null;
    try {
      const body = await request.json();
      displayName = body.display_name || "";
      markOnboardingComplete = body.mark_onboarding_complete === true;
      claimToken = body.claimToken || null;
    } catch {
      // No body or invalid JSON - that's fine
    }

    // Use auth metadata for display name if available
    // Google OAuth: full_name or name
    // Email signup: display_name
    const authName = user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || user.user_metadata?.name
      || "";
    if (!displayName && authName) {
      displayName = authName;
    }

    // Sanitize display name (trim, enforce max length, fallback)
    const sanitizedName = sanitizeDisplayName(displayName, user.email?.split("@")[0] || "User");

    // Try admin client first (bypasses RLS), fall back to authenticated client
    const adminClient = getAdminClient();
    const dbClient = adminClient || supabase;

    // Check if account already exists
    const { data: existingAccount, error: selectError } = await dbClient
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existingAccount) {
      // Account exists — check if user has ANY profiles
      const acctId = (existingAccount as Account).id;
      const { data: existingProfiles } = await dbClient
        .from("business_profiles")
        .select("id, type")
        .eq("account_id", acctId)
        .limit(1);

      const existingFamilyProfile = existingProfiles?.find(p => p.type === "family");
      const hasAnyProfile = existingProfiles && existingProfiles.length > 0;

      // Only create a family profile if:
      // 1. User has no profiles at all, AND
      // 2. This is a guest connection flow (claimToken present) — needs family profile to receive connections
      // Otherwise, defer profile creation to create-profile where we know the user's intent
      if (!hasAnyProfile && claimToken) {
        // Check if this is a MedJobs student — they get their own welcome flow,
        // so skip the generic family welcome email and Loops seeker drip
        const { data: studentProfile } = await dbClient
          .from("business_profiles")
          .select("id")
          .eq("account_id", acctId)
          .eq("type", "student")
          .limit(1)
          .maybeSingle();

        const isMedJobsStudent = !!studentProfile;

        const familyName = sanitizeDisplayName((existingAccount as Account).display_name, user.email?.split("@")[0] || "My Family");
        const familySlug = await generateUniqueSlugFromName(dbClient, familyName);
        const { data: newFamilyProfile, error: profileError } = await dbClient.from("business_profiles").insert({
          account_id: acctId,
          slug: familySlug,
          type: "family",
          display_name: familyName,
          care_types: [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          is_active: true,
          metadata: {},
        }).select("id").single();
        if (profileError) {
          console.error("Error creating family profile (existing account):", profileError.message, profileError.code);
        }

        // Set active profile so user can send messages
        if (newFamilyProfile && !(existingAccount as Account).active_profile_id) {
          await dbClient.from("accounts").update({
            active_profile_id: newFamilyProfile.id,
          }).eq("id", acctId);
        }

        // Send welcome email + Loops event for fresh signups ONLY
        // Skip for MedJobs students — they already got their own welcome email
        if (!isMedJobsStudent) {
          // Loops: seeker signup event
          try {
            const fullName = (existingAccount as Account).display_name
              || user.user_metadata?.full_name
              || user.user_metadata?.name
              || "";
            const nameParts = fullName.trim().split(/\s+/);
            await sendLoopsEvent({
              email: user.email || "",
              eventName: "user_signup",
              audience: "seeker",
              eventProperties: { source: "web_v2" },
              contactProperties: {
                firstName: nameParts[0] || "",
                lastName: nameParts.slice(1).join(" ") || "",
              },
            });
          } catch {
            // Non-blocking
          }

          // Welcome email (fire-and-forget)
          try {
            if (user.email && !claimToken) {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
              const wLogId = await reserveEmailLogId({ to: user.email, subject: "Welcome to Olera", emailType: "welcome", recipientType: "family" });
              const welcomeName = (existingAccount as Account).display_name
                || user.user_metadata?.full_name
                || user.user_metadata?.name
                || "";
              await sendEmail({
                to: user.email,
                subject: "Welcome to Olera",
                html: welcomeEmail({
                  familyName: welcomeName.split(/\s+/)[0] || "there",
                  browseUrl: appendTrackingParams(`${siteUrl}/browse`, wLogId),
                }),
                emailType: "welcome",
                recipientType: "family",
                emailLogId: wLogId ?? undefined,
              });
            }
          } catch {
            // Non-blocking
          }
        }
      }

      // Handle placeholder profile claim for EXISTING accounts (guest connection flow)
      // Move connections from placeholder to existing family profile, then delete placeholder
      if (claimToken) {
        try {
          const mainFamilyId = existingFamilyProfile?.id;
          const { data: placeholder } = await dbClient
            .from("business_profiles")
            .select("id")
            .eq("claim_token", claimToken)
            .is("account_id", null)
            .single();

          if (placeholder && mainFamilyId && placeholder.id !== mainFamilyId) {
            // Move connections from placeholder to main family profile
            await dbClient
              .from("connections")
              .update({ from_profile_id: mainFamilyId })
              .eq("from_profile_id", placeholder.id);

            // Delete the placeholder profile
            await dbClient
              .from("business_profiles")
              .delete()
              .eq("id", placeholder.id);

            // Ensure active_profile_id is set so welcome page can find connections
            if (!(existingAccount as Account).active_profile_id) {
              await dbClient
                .from("accounts")
                .update({ active_profile_id: mainFamilyId })
                .eq("id", acctId);
            }
          }
        } catch (err) {
          console.error("[ensure-account] placeholder handling error (existing):", err);
          // Non-blocking
        }
      }

      // Also ensure active_profile_id is set even without a claim token
      // Some accounts may exist without active_profile_id being set
      if (existingFamilyProfile && !(existingAccount as Account).active_profile_id) {
        await dbClient
          .from("accounts")
          .update({ active_profile_id: existingFamilyProfile.id })
          .eq("id", acctId);
      }

      // If requested, mark onboarding as complete (used when skipping popup for users with deferred actions or existing profiles)
      if (markOnboardingComplete && !(existingAccount as Account).onboarding_completed) {
        await dbClient
          .from("accounts")
          .update({ onboarding_completed: true })
          .eq("id", acctId);
        return NextResponse.json({ account: { ...existingAccount, onboarding_completed: true } as Account });
      }

      return NextResponse.json({ account: existingAccount as Account });
    }

    // Account doesn't exist - create it
    // Note: selectError will be PGRST116 (no rows) if account doesn't exist
    if (selectError && selectError.code !== "PGRST116") {
      console.error("Error checking for account:", selectError.message, selectError.code);
      // Don't fail - try to create the account anyway
    }

    // Create the account
    const { data: newAccount, error: insertError } = await dbClient
      .from("accounts")
      .insert({
        user_id: user.id,
        display_name: sanitizedName,
        onboarding_completed: markOnboardingComplete,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating account:", insertError.message, insertError.code);

      // Handle race condition - another request might have created it
      if (insertError.code === "23505") { // unique_violation
        const { data: raceAccount } = await dbClient
          .from("accounts")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (raceAccount) {
          return NextResponse.json({ account: raceAccount as Account });
        }
      }

      // If insert failed due to RLS, provide a more helpful error
      if (insertError.code === "42501") { // insufficient_privilege
        return NextResponse.json(
          { error: "Database permissions issue. Please contact support." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: `Failed to create account: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Check if this is a MedJobs student — skip generic welcome + Loops seeker drip
    const { data: studentProfileForNew } = await dbClient
      .from("business_profiles")
      .select("id")
      .eq("type", "student")
      .eq("email", user.email?.toLowerCase() || "")
      .limit(1)
      .maybeSingle();

    const isNewMedJobsStudent = !!studentProfileForNew;

    if (!isNewMedJobsStudent) {
      // Loops: new account created (fire-and-forget)
      try {
        const fullName = sanitizedName;
        const nameParts = fullName.split(/\s+/);
        await sendLoopsEvent({
          email: user.email || "",
          eventName: "user_signup",
          audience: "seeker",
          eventProperties: { source: "web_v2" },
          contactProperties: {
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
          },
        });
      } catch {
        // Non-blocking
      }

      // Welcome email (fire-and-forget) — only for new accounts, not guest connections
      try {
        if (user.email && !claimToken) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
          const wLogId2 = await reserveEmailLogId({ to: user.email, subject: "Welcome to Olera", emailType: "welcome", recipientType: "family" });
          await sendEmail({
            to: user.email,
            subject: "Welcome to Olera",
            html: welcomeEmail({
              familyName: sanitizedName.split(/\s+/)[0] || "there",
              browseUrl: appendTrackingParams(`${siteUrl}/browse`, wLogId2),
            }),
            emailType: "welcome",
            recipientType: "family",
            emailLogId: wLogId2 ?? undefined,
          });
        }
      } catch {
        // Non-blocking
      }
    }

    // Only create a family profile if:
    // 1. User has no profiles at all, AND
    // 2. This is a guest connection flow (claimToken present) — needs family profile to receive connections
    // Otherwise, defer profile creation to create-profile where we know the user's intent
    const accountId = (newAccount as Account).id;
    const { data: existingProfiles } = await dbClient
      .from("business_profiles")
      .select("id")
      .eq("account_id", accountId)
      .limit(1);

    const hasAnyProfile = existingProfiles && existingProfiles.length > 0;

    if (!hasAnyProfile && claimToken) {
      const familySlug = await generateUniqueSlugFromName(dbClient, sanitizedName);
      const { data: newFamilyProfile, error: profileError } = await dbClient.from("business_profiles").insert({
        account_id: accountId,
        slug: familySlug,
        type: "family",
        display_name: sanitizedName,
        care_types: [],
        claim_state: "claimed",
        verification_state: "unverified",
        source: "user_created",
        is_active: true,
        metadata: {},
      }).select("id").single();
      if (profileError) {
        console.error("Error creating family profile (new account):", profileError.message, profileError.code);
      }

      // Set active profile so user can send messages
      if (newFamilyProfile) {
        await dbClient.from("accounts").update({
          active_profile_id: newFamilyProfile.id,
        }).eq("id", accountId);
      }

      // Handle placeholder profile claim (guest connection flow)
      // Move connections from placeholder to new family profile, then delete placeholder
      if (newFamilyProfile) {
        try {
          const { data: placeholder } = await dbClient
            .from("business_profiles")
            .select("id")
            .eq("claim_token", claimToken)
            .is("account_id", null)
            .single();

          if (placeholder && placeholder.id !== newFamilyProfile.id) {
            // Move connections from placeholder to new family profile
            await dbClient
              .from("connections")
              .update({ from_profile_id: newFamilyProfile.id })
              .eq("from_profile_id", placeholder.id);

            // Delete the placeholder profile
            await dbClient
              .from("business_profiles")
              .delete()
              .eq("id", placeholder.id);
          }
        } catch (err) {
          console.error("[ensure-account] placeholder handling error:", err);
          // Non-blocking
        }
      }
    }

    return NextResponse.json({ account: newAccount as Account });
  } catch (err) {
    console.error("Ensure account error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
