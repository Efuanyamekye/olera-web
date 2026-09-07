import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateUniqueSlug } from "@/lib/slug";
import { directoryHydrationFields, DIRECTORY_HYDRATION_COLUMNS } from "@/lib/providers/directory-hydrate";
import { sendSlackAlert, slackProviderClaimed, slackSuspiciousClaim } from "@/lib/slack";
import {
  scoreClaimTrust,
  extractDomainFromWebsite,
  type ClaimTrustResult,
} from "@/lib/claim-trust";
import { sendEmail } from "@/lib/email";
import { claimNotificationEmail } from "@/lib/email-templates";
import { sendLoopsEvent } from "@/lib/loops";
import { isBlockedEmailDomain } from "@/lib/email-validation";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

/**
 * POST /api/provider/claim-instant
 *
 * Instant claim without OTP verification:
 * 1. Creates or gets Supabase user with email_confirm: true (no email sent)
 * 2. Creates account + business_profile with verification_state: "unverified"
 * 3. Returns tokenHash for client-side session establishment
 *
 * Supports both:
 * - Claiming existing provider (providerId required)
 * - Creating new org (isNewOrg=true, orgName required)
 *
 * Returns:
 * - 200: { tokenHash, profileId }
 * - 400: Validation error
 * - 409: Already claimed / email conflict
 * - 500: Server error
 */
export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

    if (!url || !serviceKey) {
      console.error("[claim-instant] Missing SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, serviceKey);
    const body = await request.json();

    const {
      email,
      // For claiming existing provider:
      providerId,
      providerName,
      providerSlug,
      providerEmail,
      city,
      state,
      // For creating new org:
      isNewOrg,
      orgName,
      phone,
      careTypes,
    } = body;

    // Validate email
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Hard block: abuse domains may not mint accounts or claim listings
    // (see lib/email-validation.ts BLOCKED_DOMAINS).
    if (isBlockedEmailDomain(normalizedEmail)) {
      console.warn(`[claim-instant] blocked domain claim: ${normalizedEmail}`);
      return NextResponse.json(
        { error: "This email address can't be used to claim a listing." },
        { status: 403 }
      );
    }

    // For new org creation
    if (isNewOrg) {
      if (!orgName?.trim()) {
        return NextResponse.json(
          { error: "Organization name is required" },
          { status: 400 }
        );
      }
      if (!city?.trim() || !state?.trim()) {
        return NextResponse.json(
          { error: "City and state are required" },
          { status: 400 }
        );
      }
    } else {
      // For claiming existing - providerId required
      if (!providerId) {
        return NextResponse.json(
          { error: "Provider ID is required" },
          { status: 400 }
        );
      }
    }

    // ──────────────────────────────────────────────────────────
    // 1. For claiming existing: Check if already claimed
    // ──────────────────────────────────────────────────────────
    if (!isNewOrg && providerId) {
      // Exclude rejected profiles - they should not block new claims
      const { data: existingClaim } = await supabaseAdmin
        .from("business_profiles")
        .select("id, account_id")
        .eq("source_provider_id", providerId)
        .neq("claim_state", "rejected")
        .maybeSingle();

      if (existingClaim) {
        return NextResponse.json(
          {
            error: "This listing has already been claimed.",
            code: "ALREADY_CLAIMED",
          },
          { status: 409 }
        );
      }
    }

    // ──────────────────────────────────────────────────────────
    // 3. Create or get Supabase user (no email sent)
    // ──────────────────────────────────────────────────────────
    let userId: string | undefined;

    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true, // No email sent!
      });

    if (createError) {
      if (
        createError.message?.includes("already been registered") ||
        createError.message?.includes("already exists")
      ) {
        // User exists - get their ID via generateLink
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmail,
          options: { redirectTo: `${siteUrl}/provider` },
        });
        userId = linkData?.user?.id;
      } else {
        console.error("[claim-instant] createUser failed:", createError.message);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }
    } else {
      userId = newUser?.user?.id;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Could not resolve user" },
        { status: 500 }
      );
    }

    // ──────────────────────────────────────────────────────────
    // 4. Get or create account
    // ──────────────────────────────────────────────────────────
    let accountId: string;

    const { data: existingAccount } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const displayName = isNewOrg
        ? orgName
        : providerName || normalizedEmail.split("@")[0] || "Provider";

      const { data: newAccount, error: createAccountError } = await supabaseAdmin
        .from("accounts")
        .insert({
          user_id: userId,
          display_name: displayName,
          onboarding_completed: true,
        })
        .select("id")
        .single();

      if (createAccountError || !newAccount) {
        console.error("[claim-instant] account creation error:", createAccountError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      accountId = newAccount.id;
      console.log("[claim-instant] created account:", accountId);
    }

    // ──────────────────────────────────────────────────────────
    // 5. Trust scoring
    // ──────────────────────────────────────────────────────────
    let trustResult: ClaimTrustResult = { level: "medium", reason: "not_scored" };

    // For existing provider claims, fetch provider data for trust scoring
    if (!isNewOrg && providerId) {
      const { data: iosProvider } = await supabaseAdmin
        .from("olera-providers")
        .select("website, category, provider_category")
        .eq("provider_id", providerId)
        .maybeSingle();

      if (iosProvider) {
        try {
          trustResult = await scoreClaimTrust({
            email: normalizedEmail,
            providerName: providerName || "Provider",
            providerCity: city,
            providerState: state,
            providerCategory: iosProvider.category || iosProvider.provider_category,
            providerDomain: extractDomainFromWebsite(iosProvider.website),
          });
        } catch (err) {
          console.error("[claim-instant] trust scoring failed:", err);
          // Keep default: medium/not_scored (fail safe to unverified)
        }
      }
    } else if (isNewOrg) {
      // For new orgs, score based on email + location (no website to compare)
      try {
        trustResult = await scoreClaimTrust({
          email: normalizedEmail,
          providerName: orgName,
          providerCity: city,
          providerState: state,
        });
      } catch (err) {
        console.error("[claim-instant] trust scoring failed:", err);
        // Keep default: medium/not_scored (fail safe to unverified)
      }
    }

    // Set verification_state based on trust level:
    // - High trust: 'not_required' (full access, no verification needed)
    // - Medium/Low trust: 'unverified' (gated, must complete verification)
    const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

    // ──────────────────────────────────────────────────────────
    // 6. Create business_profile
    // ──────────────────────────────────────────────────────────
    const slug = await generateUniqueSlug(
      supabaseAdmin,
      isNewOrg ? orgName : providerName || "Provider",
      city || "",
      state || ""
    );

    // Claiming a directory listing → hydrate the new business_profile with the
    // directory's full display data (one complete, editable record from the
    // start), instead of a thin shell projected at render time.
    let hydration: ReturnType<typeof directoryHydrationFields> | null = null;
    if (!isNewOrg && providerId) {
      const { data: dirRow } = await supabaseAdmin
        .from("olera-providers")
        .select(DIRECTORY_HYDRATION_COLUMNS)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (dirRow) hydration = directoryHydrationFields(dirRow as Record<string, unknown>);
    }

    const profileData = isNewOrg
      ? {
          account_id: accountId,
          slug,
          type: "organization",
          display_name: orgName,
          email: normalizedEmail,
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
        }
      : {
          account_id: accountId,
          source_provider_id: providerId,
          slug,
          type: "organization",
          display_name: providerName || "My Business",
          email: normalizedEmail,
          city: city || null,
          state: state || null,
          // Hydrated from the directory listing (the one record).
          description: hydration?.description ?? null,
          care_types: hydration?.care_types ?? [],
          category: hydration?.category ?? null,
          image_url: hydration?.image_url ?? null,
          claim_state: "claimed",
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
          source: "claimed_from_directory",
          is_active: true,
          metadata: hydration?.images?.length ? { images: hydration.images } : {},
        };

    const { data: newProfile, error: insertErr } = await supabaseAdmin
      .from("business_profiles")
      .insert(profileData as Record<string, unknown>)
      .select("id")
      .single();

    if (insertErr) {
      console.error("[claim-instant] profile creation error:", insertErr);
      // Handle race condition: provider was claimed between check and insert
      if (
        insertErr.message?.includes("duplicate") ||
        insertErr.message?.includes("unique") ||
        insertErr.code === "23505" // PostgreSQL unique violation
      ) {
        return NextResponse.json(
          {
            error: "This listing has already been claimed.",
            code: "ALREADY_CLAIMED",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: `Failed to create profile: ${insertErr.message}` },
        { status: 500 }
      );
    }

    // ──────────────────────────────────────────────────────────
    // 6. Create membership if needed
    // ──────────────────────────────────────────────────────────
    const { data: existingMembership } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("account_id", accountId)
      .limit(1);

    if (!existingMembership || existingMembership.length === 0) {
      await supabaseAdmin.from("memberships").insert({
        account_id: accountId,
        plan: "free",
        status: "free",
      });
    }

    // ──────────────────────────────────────────────────────────
    // 7. Update account with active profile
    // ──────────────────────────────────────────────────────────
    await supabaseAdmin
      .from("accounts")
      .update({
        onboarding_completed: true,
        active_profile_id: newProfile.id,
      })
      .eq("id", accountId);

    // ──────────────────────────────────────────────────────────
    // 8. Activity log + Slack alert (awaited in parallel)
    // ──────────────────────────────────────────────────────────
    // Both side effects awaited via Promise.allSettled — fire-and-forget
    // gets killed by Vercel's serverless runtime once the response goes
    // out (cost a 7h diagnosis on the agent-outreach route, 2026-05-03).
    // allSettled so neither blocks the other and neither failing aborts
    // the response — the canonical claim is already in the DB above.
    // Use same display_name logic as profile creation for consistency.
    const displayName = isNewOrg ? orgName : (providerName || "My Business");
    const claimAlert = slackProviderClaimed({
      providerName: displayName,
      claimedByEmail: normalizedEmail,
      providerSlug: slug,
      claimSource: isNewOrg ? "new_org_signup" : "instant_claim",
    });
    const claimResults = await Promise.allSettled([
      supabaseAdmin
        .from("provider_activity")
        .insert({
          provider_id: providerSlug || providerId || slug,
          profile_id: newProfile.id,
          event_type: "claim_completed",
          metadata: {
            source: "instant_claim",
            olera_provider_id: providerId || null,
            verification_state: verificationState,
            claim_trust_level: trustResult.level,
          },
        }),
      sendSlackAlert(claimAlert.text, claimAlert.blocks),
    ]);
    if (claimResults[0].status === "rejected") {
      console.error("[claim-instant] activity insert failed:", claimResults[0].reason);
    }
    if (claimResults[1].status === "rejected") {
      console.error("[claim-instant] Slack alert failed:", claimResults[1].reason);
    }

    // 8b. Suspicious claim alert for medium/low trust
    // Only send if trust scoring actually ran (reason !== "not_scored")
    if (trustResult.reason !== "not_scored" &&
        (trustResult.level === "medium" || trustResult.level === "low")) {
      try {
        const suspiciousAlert = slackSuspiciousClaim({
          providerName: displayName,
          claimedByEmail: normalizedEmail,
          providerSlug: slug,
          trustLevel: trustResult.level,
          trustReason: trustResult.reason,
        });
        await sendSlackAlert(suspiciousAlert.text, suspiciousAlert.blocks);
      } catch {
        // Non-blocking
      }
    }

    // 8c. Update provider_outreach_tracking to "claimed" stage
    // This ensures the tracking table stays in sync with actual claim state
    // Only applies to claims of existing directory providers (not new orgs)
    if (!isNewOrg && providerId) {
      try {
        const nowIso = new Date().toISOString();

        // Look up existing tracking row
        const { data: trackingRow } = await supabaseAdmin
          .from("provider_outreach_tracking")
          .select("id, stage")
          .eq("provider_id", providerId)
          .maybeSingle();

        if (trackingRow && trackingRow.stage !== "claimed") {
          const oldStage = trackingRow.stage;

          // Update tracking row to claimed (with race condition guard)
          const { error: updateErr, count } = await supabaseAdmin
            .from("provider_outreach_tracking")
            .update({
              stage: "claimed",
              claimed_at: nowIso,
              stage_changed_at: nowIso,
            })
            .eq("id", trackingRow.id)
            .neq("stage", "claimed"); // Atomic guard: only update if not already claimed

          if (updateErr) {
            console.error("[claim-instant] Failed to update tracking to claimed:", updateErr.message);
          } else if (count && count > 0) {
            // Only log touchpoint if update actually changed something
            console.log("[claim-instant] Updated provider_outreach_tracking to claimed:", providerId);

            await supabaseAdmin.from("provider_outreach_touchpoints").insert({
              provider_id: providerId,
              touchpoint_type: "stage_changed",
              details: {
                old_stage: oldStage,
                new_stage: "claimed",
                source: "instant_claim",
                auto_updated: true,
              },
              admin_user_id: null, // System-triggered, not admin action
              created_at: nowIso,
            });
          }
        }
      } catch (trackingErr) {
        // Non-fatal: log but don't fail the claim
        console.error("[claim-instant] Error updating outreach tracking:", trackingErr);
      }
    }

    // 8d. Create provider_growth_tracking record
    try {
      // Detect MedJobs eligibility based on location
      const medjobsEligibility = detectMedjobsCatchment(city, state);

      await supabaseAdmin.from("provider_growth_tracking").insert({
        business_profile_id: newProfile.id,
        claim_source: isNewOrg ? "new_org_signup" : "instant_claim",
        claimed_at: new Date().toISOString(),
        medjobs_eligible: medjobsEligibility.eligible,
        medjobs_catchment_university: medjobsEligibility.university,
        pipeline_stage: "new_claim",
        pipeline_stage_changed_at: new Date().toISOString(),
      });

      console.log("[claim-instant] Created provider_growth_tracking for:", newProfile.id);
    } catch (growthErr) {
      // Non-blocking - don't fail the claim if tracking fails
      console.error("[claim-instant] provider_growth_tracking insert failed:", growthErr);
    }

    // ──────────────────────────────────────────────────────────
    // 9. Email + marketing-loop notifications (fire-and-forget)
    // ──────────────────────────────────────────────────────────

    // 9a. Admin email notification
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (adminEmail) {
        sendEmail({
          to: adminEmail,
          subject: `Provider claimed: ${displayName}`,
          html: claimNotificationEmail({
            providerName: displayName,
            providerSlug: slug,
            claimedByEmail: normalizedEmail,
          }),
          emailType: "claim_notification",
          recipientType: "admin",
          providerId: providerId || newProfile.id,
        }).catch((err) => {
          console.error("[claim-instant] admin email failed:", err);
        });
      }
    } catch (emailErr) {
      console.error("[claim-instant] admin notification failed:", emailErr);
    }

    // 9b. Loops event (for email marketing sequences)
    try {
      sendLoopsEvent({
        email: normalizedEmail,
        eventName: "provider_claimed",
        audience: "provider",
        eventProperties: {
          providerName: displayName,
        },
        contactProperties: {
          userType: "provider",
        },
      }).catch(() => {
        // Non-blocking
      });
    } catch {
      // Non-blocking
    }

    // ──────────────────────────────────────────────────────────
    // 10. Generate magic link token for session
    // ──────────────────────────────────────────────────────────
    const { data: signInLink, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/provider` },
      });

    if (linkError || !signInLink?.properties?.hashed_token) {
      console.error("[claim-instant] generateLink failed:", linkError?.message);
      return NextResponse.json(
        { error: "Failed to generate sign-in token" },
        { status: 500 }
      );
    }

    console.log(
      "[claim-instant] success:",
      isNewOrg ? "new org" : "claim",
      newProfile.id
    );

    // Send deferred notifications for any pending leads/questions (fire-and-forget)
    sendDeferredNotificationsForProvider({
      profileId: newProfile.id,
      email: normalizedEmail,
      providerName: isNewOrg ? orgName : (providerName || "My Business"),
      providerSlug: slug,
      additionalSlugVariants: providerId ? [providerId] : [],
    }).catch((err) => {
      console.error("[claim-instant] deferred notifications failed:", err);
    });

    return NextResponse.json({
      tokenHash: signInLink.properties.hashed_token,
      profileId: newProfile.id,
    });
  } catch (err) {
    console.error("[claim-instant] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
