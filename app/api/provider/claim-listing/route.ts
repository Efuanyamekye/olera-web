import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { generateUniqueSlug } from "@/lib/slug";
import { isBlockedEmailDomain } from "@/lib/email-validation";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { sendSlackAlert, slackProviderClaimed, slackSuspiciousClaim } from "@/lib/slack";
import {
  scoreClaimTrust,
  extractDomainFromWebsite,
  type ClaimTrustResult,
} from "@/lib/claim-trust";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

/**
 * Creates a Supabase admin client with service role key.
 * Bypasses RLS — only use server-side.
 */
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not configured — falling back to authenticated client");
    return null;
  }
  return createClient(url, serviceKey);
}

/**
 * POST /api/provider/claim-listing
 *
 * Claims an olera-providers listing by creating a business_profile linked to it,
 * OR creates a new listing (when isNewOrg=true).
 *
 * Request body for claiming existing listing:
 * - providerId: string (provider_id from olera-providers)
 * - providerName: string
 * - providerSlug?: string
 * - city?: string
 * - state?: string
 *
 * Request body for creating new listing:
 * - isNewOrg: true
 * - orgName: string
 * - city: string
 * - state: string
 * - phone?: string
 * - careTypes?: string[]
 *
 * Returns:
 * - 200: { profileId: string, verificationState: string }
 * - 401: Not authenticated
 * - 404: Listing not found
 * - 409: Already claimed
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    // Authenticate the user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Hard block: abuse domains may not claim listings (see
    // lib/email-validation.ts BLOCKED_DOMAINS).
    if (isBlockedEmailDomain(user.email ?? "")) {
      console.warn(`[claim-listing] blocked domain claim: ${user.email}`);
      return NextResponse.json(
        { error: "This email address can't be used to claim a listing." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      providerId,
      providerName,
      providerSlug,
      city,
      state,
      // New org fields
      isNewOrg,
      orgName,
      phone,
      careTypes,
    } = body;

    // For new org creation, skip providerId requirement
    if (!isNewOrg && !providerId) {
      return NextResponse.json({ error: "Provider ID is required" }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const adminClient = getAdminClient();
    const db = adminClient || supabase;

    // Get or create the user's account
    // (New users signing up via Flow B won't have an account yet)
    let accountId: string;
    const { data: existingAccount } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      // Create account for new user
      const displayName = (isNewOrg ? orgName : providerName) || user.email?.split("@")[0] || "Provider";
      const { data: newAccount, error: createAccountError } = await db
        .from("accounts")
        .insert({
          user_id: user.id,
          display_name: displayName,
          onboarding_completed: true,
        })
        .select("id")
        .single();

      if (createAccountError || !newAccount) {
        console.error("[claim-listing] account creation error:", createAccountError);
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
      }
      accountId = newAccount.id;
      console.log("[claim-listing] created account for new user:", accountId);
    }

    // ──────────────────────────────────────────────────────────
    // NEW ORG CREATION FLOW (isNewOrg=true)
    // Creates a new listing without linking to existing provider
    // ──────────────────────────────────────────────────────────
    if (isNewOrg) {
      // Validation for new org
      if (!orgName?.trim()) {
        return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
      }
      if (!city?.trim() || !state?.trim()) {
        return NextResponse.json({ error: "City and state are required" }, { status: 400 });
      }

      // Check if user already has a provider profile
      const { data: existingOrgProfile } = await db
        .from("business_profiles")
        .select("id, type")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (existingOrgProfile) {
        if (existingOrgProfile.type !== "organization") {
          return NextResponse.json(
            {
              error: "This email is already used for a different account type.",
              code: "ACCOUNT_TYPE_MISMATCH"
            },
            { status: 409 }
          );
        }
        // Already has a provider profile
        return NextResponse.json(
          {
            error: "You already have a business profile.",
            code: "PROFILE_EXISTS"
          },
          { status: 409 }
        );
      }

      // Generate unique slug for the new profile
      const slug = await generateUniqueSlug(db, orgName, city, state);

      // Score trust for the new org claim
      const trustResult: ClaimTrustResult = await scoreClaimTrust({
        email: user.email || "",
        providerName: orgName,
        providerCity: city,
        providerState: state,
      });

      // Set verification_state based on trust level:
      // - High trust: 'not_required' (full access, no verification needed)
      // - Medium/Low trust: 'unverified' (gated, must complete verification)
      const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

      // Create the business_profile (no source_provider_id - self-created)
      const { data: newProfile, error: insertErr } = await db
        .from("business_profiles")
        .insert({
          account_id: accountId,
          // No source_provider_id - this is a self-created listing
          slug,
          type: "organization",
          display_name: orgName,
          email: user.email || null,
          phone: phone || null,
          city: city,
          state: state,
          care_types: careTypes || [],
          claim_state: "claimed",
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
          source: "self_service",
          is_active: true,
          metadata: {},
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[claim-listing] Create new org profile error:", insertErr);
        return NextResponse.json(
          { error: `Failed to create listing: ${insertErr.message}` },
          { status: 500 }
        );
      }

      // Create membership for the new provider
      const { data: existingMembership } = await db
        .from("memberships")
        .select("id")
        .eq("account_id", accountId)
        .limit(1);

      if (!existingMembership || existingMembership.length === 0) {
        await db.from("memberships").insert({
          account_id: accountId,
          plan: "free",
          status: "free",
        });
      }

      // Update account: mark onboarding complete + set active profile
      await db
        .from("accounts")
        .update({
          onboarding_completed: true,
          active_profile_id: newProfile.id,
        })
        .eq("id", accountId);

      console.log("[claim-listing] Created new org profile:", newProfile.id, "for account:", accountId);

      // Log provider activity for analytics (new org creation)
      db.from("provider_activity").insert({
        provider_id: slug,
        profile_id: newProfile.id,
        event_type: "claim_completed",
        metadata: { source: "new_org_signup" },
      }).then(({ error: actErr }: { error: { message: string } | null }) => {
        if (actErr) console.error("[provider_activity] claim_completed (new_org) insert failed:", actErr);
      });

      // Send deferred notifications for any pending leads/questions (fire-and-forget)
      if (user.email) {
        sendDeferredNotificationsForProvider({
          profileId: newProfile.id,
          email: user.email,
          providerName: orgName,
          providerSlug: slug,
        }).catch((err) => {
          console.error("[claim-listing] deferred notifications failed:", err);
        });
      }

      // Slack alert for new org creation (fire-and-forget)
      try {
        const alert = slackProviderClaimed({
          providerName: orgName,
          claimedByEmail: user.email || "unknown",
          providerSlug: slug,
          claimSource: "new_org_signup",
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-blocking
      }

      // Suspicious claim alert if trust is medium/low
      if (trustResult.reason !== "not_scored" &&
          (trustResult.level === "medium" || trustResult.level === "low")) {
        try {
          const suspiciousAlert = slackSuspiciousClaim({
            providerName: orgName,
            claimedByEmail: user.email || "unknown",
            providerSlug: slug,
            trustLevel: trustResult.level,
            trustReason: trustResult.reason,
          });
          await sendSlackAlert(suspiciousAlert.text, suspiciousAlert.blocks);
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json({
        profileId: newProfile.id,
        verificationState: verificationState,
        isNewOrg: true,
      });
    }

    // ──────────────────────────────────────────────────────────
    // EXISTING LISTING CLAIM FLOW (isNewOrg=false/undefined)
    // ──────────────────────────────────────────────────────────

    // Check if this listing is already claimed (business_profile with this source_provider_id exists)
    // Exclude rejected profiles - they should not block new claims
    const { data: existingClaim } = await db
      .from("business_profiles")
      .select("id, account_id")
      .eq("source_provider_id", providerId)
      .neq("claim_state", "rejected")
      .maybeSingle();

    if (existingClaim) {
      if (existingClaim.account_id === accountId) {
        // Already claimed by this user - just return success
        return NextResponse.json({
          profileId: existingClaim.id,
          verificationState: "verified", // They already own it
          alreadyOwned: true,
        });
      } else {
        // Claimed by someone else
        return NextResponse.json(
          { error: "This listing has already been claimed by another account" },
          { status: 409 }
        );
      }
    }

    // STRICT ACCOUNT SEPARATION: Check if user already has a profile of a different type
    // One email = one account type (family, provider, caregiver are separate)
    const { data: anyExistingProfile } = await db
      .from("business_profiles")
      .select("id, type")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (anyExistingProfile && anyExistingProfile.type !== "organization") {
      return NextResponse.json(
        {
          error: "This email is already used for a different account type. Please use a different email to claim this listing.",
          code: "ACCOUNT_TYPE_MISMATCH"
        },
        { status: 409 }
      );
    }

    // Check if user already has a provider profile (they can only have one for now)
    const { data: existingProfile } = await db
      .from("business_profiles")
      .select("id, source_provider_id, verification_state")
      .eq("account_id", accountId)
      .eq("type", "organization")
      .eq("is_active", true)
      .maybeSingle();

    if (existingProfile) {
      // User already has a provider profile
      // Block if they're trying to claim a DIFFERENT listing than the one already linked
      // This includes the case where source_provider_id is NULL (self-created profile)
      if (existingProfile.source_provider_id !== providerId) {
        return NextResponse.json(
          {
            error: "You already have a business profile. You can only manage one listing per account.",
            code: "PROFILE_EXISTS"
          },
          { status: 409 }
        );
      }

      // Re-claiming the same listing they already own - update to link source provider
      // User has already verified via OTP, so they get full verified access
      // Sync user's verified email to ensure they receive lead notifications
      const { error: updateErr } = await db
        .from("business_profiles")
        .update({
          source_provider_id: providerId,
          claim_state: "claimed",
          verification_state: "verified",
          email: user.email || null,
        })
        .eq("id", existingProfile.id);

      if (updateErr) {
        console.error("Update profile error:", updateErr);
        return NextResponse.json(
          { error: "Failed to link listing to your profile" },
          { status: 500 }
        );
      }

      // Send deferred notifications for any pending leads/questions (fire-and-forget)
      if (user.email) {
        sendDeferredNotificationsForProvider({
          profileId: existingProfile.id,
          email: user.email,
          providerName: providerName || "Provider",
          providerSlug: providerSlug || providerId,
          additionalSlugVariants: providerId ? [providerId] : [],
        }).catch((err) => {
          console.error("[claim-listing] deferred notifications failed:", err);
        });
      }

      // Slack alert for re-claim (fire-and-forget)
      try {
        const alert = slackProviderClaimed({
          providerName: providerName || "Provider",
          claimedByEmail: user.email || "unknown",
          providerSlug: providerSlug || providerId,
          claimSource: "re_claim_from_page",
        });
        await sendSlackAlert(alert.text, alert.blocks);
      } catch {
        // Non-blocking
      }

      // Update provider_outreach_tracking to "claimed" stage (re-claim)
      try {
        const nowIso = new Date().toISOString();
        const { data: trackingRow } = await db
          .from("provider_outreach_tracking")
          .select("id, stage")
          .eq("provider_id", providerId)
          .maybeSingle();

        if (trackingRow && trackingRow.stage !== "claimed") {
          const oldStage = trackingRow.stage;
          // Atomic guard: only update if not already claimed
          const { error: updateErr, count } = await db
            .from("provider_outreach_tracking")
            .update({
              stage: "claimed",
              claimed_at: nowIso,
              stage_changed_at: nowIso,
            })
            .eq("id", trackingRow.id)
            .neq("stage", "claimed");

          if (!updateErr && count && count > 0) {
            console.log("[claim-listing] Updated tracking to claimed (re-claim):", providerId);
            await db.from("provider_outreach_touchpoints").insert({
              provider_id: providerId,
              touchpoint_type: "stage_changed",
              details: {
                old_stage: oldStage,
                new_stage: "claimed",
                source: "re_claim_from_page",
                auto_updated: true,
              },
              admin_user_id: null,
              created_at: nowIso,
            });
          }
        }
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        profileId: existingProfile.id,
        verificationState: "verified",
      });
    }

    // No existing profile - create a new business_profile linked to the olera-providers listing

    // Fetch provider data from olera-providers for trust scoring
    const { data: oleraProvider } = await db
      .from("olera-providers")
      .select("website, category, provider_category")
      .eq("provider_id", providerId)
      .maybeSingle();

    // Score trust for the claim
    const trustResult: ClaimTrustResult = await scoreClaimTrust({
      email: user.email || "",
      providerName: providerName || "Provider",
      providerCity: city,
      providerState: state,
      providerCategory: oleraProvider?.category || oleraProvider?.provider_category,
      providerDomain: extractDomainFromWebsite(oleraProvider?.website),
    });

    // Set verification_state based on trust level:
    // - High trust: 'not_required' (full access, no verification needed)
    // - Medium/Low trust: 'unverified' (gated, must complete verification)
    const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

    // Generate unique slug for the new profile (don't use providerSlug to avoid collisions)
    const slug = await generateUniqueSlug(db, providerName || "Provider", city || "", state || "");

    // Create the business_profile
    const { data: newProfile, error: insertErr } = await db
      .from("business_profiles")
      .insert({
        account_id: accountId,
        source_provider_id: providerId,
        slug,
        type: "organization",
        display_name: providerName || "My Business",
        email: user.email || null,
        city: city || null,
        state: state || null,
        claim_state: "claimed",
        verification_state: verificationState,
        claim_trust_level: trustResult.level,
        claim_trust_reason: trustResult.reason,
        source: "claimed_from_directory",
        is_active: true,
        metadata: {},
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Create profile error:", insertErr);
      return NextResponse.json(
        { error: `Failed to claim listing: ${insertErr.message}` },
        { status: 500 }
      );
    }

    // Create membership for the new provider
    const { data: existingMembership } = await db
      .from("memberships")
      .select("id")
      .eq("account_id", accountId)
      .limit(1);

    if (!existingMembership || existingMembership.length === 0) {
      await db.from("memberships").insert({
        account_id: accountId,
        plan: "free",
        status: "free",
      });
    }

    // Update account: mark onboarding complete + set active profile
    await db
      .from("accounts")
      .update({
        onboarding_completed: true,
        active_profile_id: newProfile.id,
      })
      .eq("id", accountId);

    // Log provider activity: claim attribution for the admin Providers section.
    // source='page' — this endpoint is reached from the public provider page
    // via UnifiedAuthModal, distinct from the email-flow claim in /api/claim/finalize.
    // Prefer providerSlug as the activity key since other anonymous events
    // (page_view, search_click, one_click_access) all use the URL slug —
    // keeps distinct-provider counts addressable by the same identifier.
    db.from("provider_activity").insert({
      provider_id: providerSlug || providerId,
      profile_id: newProfile.id,
      event_type: "claim_completed",
      metadata: { source: "page", olera_provider_id: providerId },
    }).then(({ error: actErr }: { error: { message: string } | null }) => {
      if (actErr) console.error("[provider_activity] claim_completed (page) insert failed:", actErr);
    });

    // Send deferred notifications for any pending leads/questions (fire-and-forget)
    if (user.email) {
      sendDeferredNotificationsForProvider({
        profileId: newProfile.id,
        email: user.email,
        providerName: providerName || "My Business",
        providerSlug: slug,
        additionalSlugVariants: providerId ? [providerId] : [],
      }).catch((err) => {
        console.error("[claim-listing] deferred notifications failed:", err);
      });
    }

    // Slack alert for claim (fire-and-forget)
    try {
      const alert = slackProviderClaimed({
        providerName: providerName || "My Business",
        claimedByEmail: user.email || "unknown",
        providerSlug: slug,
        claimSource: "claimed_from_page",
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // Non-blocking
    }

    // Suspicious claim alert if trust is medium/low
    if (trustResult.reason !== "not_scored" &&
        (trustResult.level === "medium" || trustResult.level === "low")) {
      try {
        const suspiciousAlert = slackSuspiciousClaim({
          providerName: providerName || "My Business",
          claimedByEmail: user.email || "unknown",
          providerSlug: slug,
          trustLevel: trustResult.level,
          trustReason: trustResult.reason,
        });
        await sendSlackAlert(suspiciousAlert.text, suspiciousAlert.blocks);
      } catch {
        // Non-blocking
      }
    }

    // Update provider_outreach_tracking to "claimed" stage
    // This ensures the tracking table stays in sync with actual claim state
    try {
      const nowIso = new Date().toISOString();

      // Look up existing tracking row
      const { data: trackingRow } = await db
        .from("provider_outreach_tracking")
        .select("id, stage")
        .eq("provider_id", providerId)
        .maybeSingle();

      if (trackingRow && trackingRow.stage !== "claimed") {
        const oldStage = trackingRow.stage;

        // Update tracking row to claimed (with race condition guard)
        const { error: updateErr, count } = await db
          .from("provider_outreach_tracking")
          .update({
            stage: "claimed",
            claimed_at: nowIso,
            stage_changed_at: nowIso,
          })
          .eq("id", trackingRow.id)
          .neq("stage", "claimed"); // Atomic guard: only update if not already claimed

        if (updateErr) {
          console.error("[claim-listing] Failed to update tracking to claimed:", updateErr.message);
        } else if (count && count > 0) {
          // Only log touchpoint if update actually changed something
          console.log("[claim-listing] Updated provider_outreach_tracking to claimed:", providerId);

          await db.from("provider_outreach_touchpoints").insert({
            provider_id: providerId,
            touchpoint_type: "stage_changed",
            details: {
              old_stage: oldStage,
              new_stage: "claimed",
              source: "claimed_from_page",
              auto_updated: true,
            },
            admin_user_id: null, // System-triggered, not admin action
            created_at: nowIso,
          });
        }
      }
    } catch (trackingErr) {
      // Non-fatal: log but don't fail the claim
      console.error("[claim-listing] Error updating outreach tracking:", trackingErr);
    }

    // Create provider_growth_tracking record
    try {
      // Detect MedJobs eligibility based on location
      const medjobsEligibility = detectMedjobsCatchment(city, state);

      await db.from("provider_growth_tracking").insert({
        business_profile_id: newProfile.id,
        claim_source: isNewOrg ? "new_org_signup" : "page",
        claimed_at: new Date().toISOString(),
        medjobs_eligible: medjobsEligibility.eligible,
        medjobs_catchment_university: medjobsEligibility.university,
        pipeline_stage: "new_claim",
        pipeline_stage_changed_at: new Date().toISOString(),
      });

      console.log("[claim-listing] Created provider_growth_tracking for:", newProfile.id);
    } catch (growthErr) {
      // Non-blocking - don't fail the claim if tracking fails
      console.error("[claim-listing] provider_growth_tracking insert failed:", growthErr);
    }

    return NextResponse.json({
      profileId: newProfile.id,
      verificationState: verificationState,
    });
  } catch (err) {
    console.error("Claim listing error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
