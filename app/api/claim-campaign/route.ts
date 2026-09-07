import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { validateClaimToken } from "@/lib/claim-tokens";
import {
  scoreClaimTrust,
  extractDomainFromWebsite,
  type ClaimTrustResult,
} from "@/lib/claim-trust";
import { sendSlackAlert, slackProviderClaimed, slackSuspiciousClaim } from "@/lib/slack";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

/**
 * GET /api/claim-campaign?otk=<token>
 *
 * One-click magic link landing for provider cold outreach emails (SmartLead).
 * Handles the entire authentication flow server-side in a single response:
 *
 *  1. Validates the HMAC-signed token (provider email + expiry)
 *  2. Looks up the provider (olera-providers → business_profiles)
 *  3. Creates or resolves a Supabase auth user for the token's email
 *  4. Establishes a session by verifying a fresh magic-link OTP server-side,
 *     writing auth cookies onto the redirect response
 *  5. Links the provider's business_profile to the user's account (if unclaimed)
 *  6. Runs trust scoring for verification flow
 *  7. Tracks one_click_access and claim_completed events
 *  8. Sends Slack notifications for new claims
 *  9. Sends deferred notifications for pending leads/questions
 * 10. Redirects to /provider dashboard
 *
 * FALLBACK BEHAVIOR:
 * If server-side auth fails at any step, we redirect to the onboard page
 * where they can claim their account manually. We never show an error page
 * that blocks the provider entirely.
 *
 * Query params:
 *   - otk: Required. The signed claim token (HMAC-SHA256)
 *   - eid: Optional. Email tracking ID for analytics
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("otk");
  const emailTrackingId = url.searchParams.get("eid");
  // Claim source for analytics - defaults to "cold_outreach" for backwards compatibility
  const claimSource = url.searchParams.get("src") || "cold_outreach";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  console.log("[claim-campaign] route hit", { hasToken: !!token });

  // Helper to fall back to onboard page when auth fails
  const fallbackToOnboard = async (reason: string, slug?: string | null) => {
    // Server-side visibility — these fallbacks were the invisible leak that
    // stranded providers at a sign-in wall (see one_click_failed telemetry).
    const { logOneClickFailed } = await import("@/lib/one-click-telemetry");
    await logOneClickFailed({
      providerId: slug,
      stage: "claim_campaign",
      reason,
      action: "campaign",
    });
    console.log("[claim-campaign] falling back to onboard:", { reason, slug });
    if (!slug) {
      return NextResponse.redirect(`${siteUrl}/`, { status: 303 });
    }
    // Forward the otk: with it, the onboard page runs the client-side
    // one-click flow (valid token) or the link-expired recovery card (dead
    // token) instead of a sign-in wall the provider can't pass.
    const fallbackUrl = new URL(`${siteUrl}/provider/${slug}/onboard`);
    fallbackUrl.searchParams.set("action", "claim");
    if (token) {
      fallbackUrl.searchParams.set("otk", token);
    }
    return NextResponse.redirect(fallbackUrl.toString(), { status: 303 });
  };

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/`, { status: 303 });
  }

  // 1. Validate token (HMAC + expiry)
  const validation = validateClaimToken(token);
  if (!validation.valid) {
    console.error("[claim-campaign] token validation failed:", validation.error);
    return fallbackToOnboard(validation.error, validation.providerId || null);
  }

  const { providerId, email } = validation;
  const normalizedEmail = email.trim().toLowerCase();

  // Sanitize providerId to prevent query injection via special characters
  // Provider IDs should only contain alphanumeric, hyphens, and underscores
  const sanitizedProviderId = providerId.replace(/[^a-zA-Z0-9\-_]/g, "");
  if (sanitizedProviderId !== providerId) {
    console.error("[claim-campaign] providerId contains invalid characters:", providerId);
    return fallbackToOnboard("invalid providerId", null);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[claim-campaign] missing env vars");
    return fallbackToOnboard("missing env vars", providerId);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // 2. Look up the provider - first try olera-providers, then business_profiles
  //    The token's providerId could be a UUID (provider_id) or a slug
  let providerProfile: {
    id: string;
    slug: string | null;
    email: string | null;
    account_id: string | null;
    source_provider_id: string | null;
    display_name: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
  } | null = null;

  // Try business_profiles first (claimed or unclaimed profiles).
  // `id` is a uuid column: including id.eq for a non-UUID value (slug or
  // short-code provider_id — the normal case for outreach tokens) makes
  // Postgres reject the ENTIRE .or() with a uuid cast error, silently
  // skipping existing profiles and walling BP-only providers.
  const CAMPAIGN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const bpFilter = CAMPAIGN_UUID_RE.test(sanitizedProviderId)
    ? `slug.eq.${sanitizedProviderId},source_provider_id.eq.${sanitizedProviderId},id.eq.${sanitizedProviderId}`
    : `slug.eq.${sanitizedProviderId},source_provider_id.eq.${sanitizedProviderId}`;
  const { data: bpProfile } = await admin
    .from("business_profiles")
    .select("id, slug, email, account_id, source_provider_id, display_name, city, state, website")
    .or(bpFilter)
    .in("type", ["organization", "caregiver"])
    .maybeSingle();

  if (bpProfile) {
    providerProfile = bpProfile;
  } else {
    // No BP exists yet - look up in olera-providers to get provider details
    // We'll need to create a BP after auth
    const { data: oleraProvider } = await admin
      .from("olera-providers")
      .select("provider_id, slug, email, provider_name, city, state, website")
      .or(`provider_id.eq.${sanitizedProviderId},slug.eq.${sanitizedProviderId}`)
      .maybeSingle();

    if (oleraProvider) {
      // Create a temporary profile object - we'll create the real BP after auth
      providerProfile = {
        id: "", // Will be set after BP creation
        slug: oleraProvider.slug || sanitizedProviderId,
        email: oleraProvider.email,
        account_id: null,
        source_provider_id: oleraProvider.provider_id,
        display_name: oleraProvider.provider_name,
        city: oleraProvider.city,
        state: oleraProvider.state,
        website: oleraProvider.website,
      };
    }
  }

  if (!providerProfile) {
    console.error("[claim-campaign] provider not found");
    return fallbackToOnboard("provider not found", sanitizedProviderId);
  }

  const actualSlug = providerProfile.slug || providerProfile.source_provider_id || sanitizedProviderId;

  // Verify the token's email matches the provider's email
  if (providerProfile.email?.toLowerCase() !== normalizedEmail) {
    console.error("[claim-campaign] email mismatch:", {
      tokenEmail: normalizedEmail,
      profileEmail: providerProfile.email?.toLowerCase(),
    });
    return fallbackToOnboard("email mismatch", actualSlug);
  }

  // 3. Create or resolve the auth user
  let userId: string | undefined;
  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
  });

  if (createError) {
    const alreadyExists =
      createError.message?.includes("already been registered") ||
      createError.message?.includes("already exists");
    if (!alreadyExists) {
      console.error("[claim-campaign] createUser failed:", createError.message);
      return fallbackToOnboard("createUser failed", actualSlug);
    }
  } else {
    userId = createdUser?.user?.id;
  }

  // 4. Generate a magic-link token hash we can verify to mint a session
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[claim-campaign] generateLink failed:", linkError?.message);
    return fallbackToOnboard("generateLink failed", actualSlug);
  }
  if (!userId) userId = linkData.user?.id;
  const tokenHash = linkData.properties.hashed_token;

  // 5. Verify the OTP on a plain @supabase/supabase-js client with implicit flow
  //    @supabase/ssr's createServerClient may force PKCE, which would reject
  //    token_hash verification
  const otpClient = createClient(supabaseUrl, anonKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: otpData, error: otpError } = await otpClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (otpError || !otpData?.session) {
    console.error("[claim-campaign] verifyOtp failed:", otpError?.message);
    return fallbackToOnboard("verifyOtp failed", actualSlug);
  }

  // 6. Build the redirect response and write session cookies onto it
  const redirectTarget = new URL(`${siteUrl}/provider`);
  if (emailTrackingId) {
    redirectTarget.searchParams.set("eid", emailTrackingId);
  }

  const response = NextResponse.redirect(redirectTarget, { status: 303 });

  const ssrClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error: setSessionError } = await ssrClient.auth.setSession({
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
  });

  if (setSessionError) {
    console.error("[claim-campaign] setSession failed:", setSessionError.message);
    return fallbackToOnboard("setSession failed", actualSlug);
  }

  // 7. Ensure an account row exists, then link the profile to it
  if (!userId) {
    console.error("[claim-campaign] could not resolve userId");
    return fallbackToOnboard("no userId", actualSlug);
  }

  let { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!account) {
    const displayName =
      providerProfile.display_name || normalizedEmail.split("@")[0] || "Provider";

    const { data: newAccount, error: accountError } = await admin
      .from("accounts")
      .insert({
        user_id: userId,
        display_name: displayName,
        onboarding_completed: true,
      })
      .select("id")
      .single();

    if (accountError) {
      // Handle race condition
      if (accountError.code === "23505") {
        const { data: raceAccount } = await admin
          .from("accounts")
          .select("id")
          .eq("user_id", userId)
          .single();
        account = raceAccount;
      }

      if (!account) {
        console.error("[claim-campaign] account creation failed:", accountError.message);
        return fallbackToOnboard("account creation failed", actualSlug);
      }
    } else {
      account = newAccount;
    }
  }

  // 8. Trust scoring & profile linking
  let isNewClaim = false;
  let trustResult: ClaimTrustResult = { level: "medium", reason: "not_scored" };
  let finalProfileId = providerProfile.id;

  if (account) {
    // If no BP exists yet (olera-providers only), create one now
    if (!providerProfile.id && providerProfile.source_provider_id) {
      // Run trust scoring BEFORE creating BP
      try {
        trustResult = await scoreClaimTrust({
          email: normalizedEmail,
          providerName: providerProfile.display_name || actualSlug,
          providerCity: providerProfile.city,
          providerState: providerProfile.state,
          providerDomain: extractDomainFromWebsite(providerProfile.website),
        });
      } catch (err) {
        console.error("[claim-campaign] trust scoring failed:", err);
      }

      const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

      const { data: newBp, error: bpCreateError } = await admin
        .from("business_profiles")
        .insert({
          type: "organization",
          slug: actualSlug,
          source_provider_id: providerProfile.source_provider_id,
          display_name: providerProfile.display_name,
          email: normalizedEmail,
          city: providerProfile.city,
          state: providerProfile.state,
          website: providerProfile.website,
          account_id: account.id,
          claim_state: "claimed",
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
        })
        .select("id")
        .single();

      if (bpCreateError) {
        // Handle race condition: if BP creation failed due to unique constraint
        // (another request created it simultaneously), try to fetch and link it
        if (bpCreateError.code === "23505") {
          console.log("[claim-campaign] BP already exists (race condition), fetching...");
          const { data: existingBp } = await admin
            .from("business_profiles")
            .select("id, account_id")
            .or(`slug.eq.${actualSlug},source_provider_id.eq.${providerProfile.source_provider_id}`)
            .in("type", ["organization", "caregiver"])
            .maybeSingle();

          if (existingBp) {
            finalProfileId = existingBp.id;
            if (!existingBp.account_id) {
              // Unclaimed BP from race condition - link it to this account
              isNewClaim = true;
              await admin
                .from("business_profiles")
                .update({
                  account_id: account.id,
                  claim_state: "claimed",
                  verification_state: verificationState,
                  claim_trust_level: trustResult.level,
                  claim_trust_reason: trustResult.reason,
                })
                .eq("id", existingBp.id);
            } else if (existingBp.account_id === account.id) {
              // BP already belongs to this account (double-click or retry)
              // Not a new claim, but ensure active_profile_id is set
              console.log("[claim-campaign] BP already belongs to this account (race condition retry)");
            }
            // If existingBp.account_id is set but doesn't match account.id,
            // someone else claimed it first - we leave it alone
          }
        } else {
          console.error("[claim-campaign] BP creation failed:", bpCreateError.message);
        }
      } else if (newBp) {
        finalProfileId = newBp.id;
        isNewClaim = true;
        console.log("[claim-campaign] new BP created with trust level:", trustResult.level);
      }

      // Send deferred notifications for new claims
      if (isNewClaim && finalProfileId) {
        sendDeferredNotificationsForProvider({
          profileId: finalProfileId,
          email: normalizedEmail,
          providerName: providerProfile.display_name || actualSlug,
          providerSlug: actualSlug,
          additionalSlugVariants: providerProfile.source_provider_id
            ? [providerProfile.source_provider_id]
            : [],
        }).catch((err) => {
          console.error("[claim-campaign] deferred notifications failed:", err);
        });
      }
    } else if (providerProfile.account_id && providerProfile.account_id !== account.id) {
      // Profile owned by someone else - still let the user authenticate
      // They'll see their own dashboard (possibly empty), not this profile
      // This is a security boundary: we don't give access to someone else's profile
      console.warn("[claim-campaign] profile already linked to different account:", {
        profileId: providerProfile.id,
        profileAccountId: providerProfile.account_id,
        requestingAccountId: account.id,
      });
      // Set finalProfileId for event tracking, even though they don't own it
      finalProfileId = providerProfile.id;
    } else if (providerProfile.account_id === account.id) {
      // Profile already belongs to this account (returning user)
      // Not a new claim, but ensure we track their access and set active_profile_id if needed
      console.log("[claim-campaign] returning user, profile already claimed by this account");
      finalProfileId = providerProfile.id;
    } else if (!providerProfile.account_id) {
      // Existing BP but unclaimed - run trust scoring and link profile
      isNewClaim = true;

      try {
        trustResult = await scoreClaimTrust({
          email: normalizedEmail,
          providerName: providerProfile.display_name || actualSlug,
          providerCity: providerProfile.city,
          providerState: providerProfile.state,
          providerDomain: extractDomainFromWebsite(providerProfile.website),
        });
      } catch (err) {
        console.error("[claim-campaign] trust scoring failed:", err);
      }

      const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

      const { error: linkErr } = await admin
        .from("business_profiles")
        .update({
          account_id: account.id,
          claim_state: "claimed",
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
        })
        .eq("id", providerProfile.id);

      if (linkErr) {
        console.error("[claim-campaign] profile link failed:", linkErr.message);
        isNewClaim = false;
      } else {
        // Set finalProfileId after successful linking
        finalProfileId = providerProfile.id;
        console.log("[claim-campaign] profile linked with trust level:", trustResult.level);

        // Send deferred notifications for pending leads/questions
        sendDeferredNotificationsForProvider({
          profileId: providerProfile.id,
          email: normalizedEmail,
          providerName: providerProfile.display_name || actualSlug,
          providerSlug: actualSlug,
          additionalSlugVariants: providerProfile.source_provider_id
            ? [providerProfile.source_provider_id]
            : [],
        }).catch((err) => {
          console.error("[claim-campaign] deferred notifications failed:", err);
        });
      }
    }

    // Set active profile if the account has none yet
    // This runs for new claims AND returning users who own the profile
    // (in case active_profile_id was never set for some reason)
    if (finalProfileId) {
      const { data: accountRow } = await admin
        .from("accounts")
        .select("active_profile_id")
        .eq("id", account.id)
        .single();

      if (!accountRow?.active_profile_id) {
        await admin
          .from("accounts")
          .update({ active_profile_id: finalProfileId })
          .eq("id", account.id);
        console.log("[claim-campaign] set active_profile_id:", finalProfileId);
      }
    }
  }

  // 9. Track events BEFORE returning
  const providerKey = actualSlug;

  // Track one_click_access event
  const { error: accessError } = await admin.from("provider_activity").insert({
    provider_id: providerKey,
    event_type: "one_click_access",
    metadata: {
      source: claimSource,
      email: normalizedEmail,
      email_log_id: emailTrackingId || null,
    },
  });
  if (accessError) {
    console.error("[claim-campaign] one_click_access tracking failed:", accessError.message);
  }

  // Track claim_completed and send Slack notifications ONLY on new claims
  if (isNewClaim) {
    const { error: claimCompletedErr } = await admin.from("provider_activity").insert({
      provider_id: providerKey,
      profile_id: finalProfileId || providerProfile.id,
      event_type: "claim_completed",
      metadata: {
        source: claimSource,
      },
    });
    if (claimCompletedErr) {
      console.error("[claim-campaign] claim_completed tracking failed:", claimCompletedErr.message);
    }

    // Update provider_outreach_tracking to "claimed" stage
    // This ensures the tracking table stays in sync with actual claim state
    // NOTE: We do this BEFORE Slack notification so we can include re_engage_channel
    const sourceProviderId = providerProfile.source_provider_id;
    let reEngageChannel: string | null = null;

    if (sourceProviderId) {
      try {
        const nowIso = new Date().toISOString();

        // Look up existing tracking row (include re_engage_channel for Slack notification)
        const { data: trackingRow } = await admin
          .from("provider_outreach_tracking")
          .select("id, stage, re_engage_channel")
          .eq("provider_id", sourceProviderId)
          .maybeSingle();

        if (trackingRow) {
          reEngageChannel = trackingRow.re_engage_channel;

          if (trackingRow.stage !== "claimed") {
            const oldStage = trackingRow.stage;

            // Update tracking row to claimed (with race condition guard)
            const { error: updateErr, count } = await admin
              .from("provider_outreach_tracking")
              .update({
                stage: "claimed",
                claimed_at: nowIso,
                stage_changed_at: nowIso,
              })
              .eq("id", trackingRow.id)
              .neq("stage", "claimed"); // Atomic guard: only update if not already claimed

            if (updateErr) {
              console.error("[claim-campaign] Failed to update tracking to claimed:", updateErr.message);
            } else if (count && count > 0) {
              // Only log touchpoint if update actually changed something
              console.log("[claim-campaign] Updated provider_outreach_tracking to claimed:", sourceProviderId);

              await admin.from("provider_outreach_touchpoints").insert({
                provider_id: sourceProviderId,
                touchpoint_type: "stage_changed",
                details: {
                  old_stage: oldStage,
                  new_stage: "claimed",
                  source: `${claimSource}_claim`,
                  auto_updated: true,
                  ...(reEngageChannel && { re_engage_channel: reEngageChannel }),
                },
                admin_user_id: null, // System-triggered, not admin action
                created_at: nowIso,
              });
            }
          }
        }
      } catch (trackingErr) {
        // Non-fatal: log but don't fail the claim
        console.error("[claim-campaign] Error updating outreach tracking:", trackingErr);
      }
    }

    // Create provider_growth_tracking record for new claims
    try {
      // Detect MedJobs eligibility based on location
      const medjobsEligibility = detectMedjobsCatchment(
        providerProfile.city,
        providerProfile.state
      );

      // Map claim source - use city_broadcast if that was the re-engage channel
      const trackingClaimSource =
        reEngageChannel === "city_broadcast"
          ? "city_broadcast"
          : claimSource === "cold_outreach"
            ? "cold_outreach"
            : "email";

      await admin.from("provider_growth_tracking").insert({
        business_profile_id: finalProfileId || providerProfile.id,
        claim_source: trackingClaimSource,
        claimed_at: new Date().toISOString(),
        medjobs_eligible: medjobsEligibility.eligible,
        medjobs_catchment_university: medjobsEligibility.university,
        pipeline_stage: "new_claim",
        pipeline_stage_changed_at: new Date().toISOString(),
      });

      console.log("[claim-campaign] Created provider_growth_tracking for:", finalProfileId || providerProfile.id);
    } catch (growthErr) {
      // Non-blocking - don't fail the claim if tracking fails
      console.error("[claim-campaign] provider_growth_tracking insert failed:", growthErr);
    }

    // Send Slack notifications
    try {
      const alert = slackProviderClaimed({
        providerName: providerProfile.display_name || actualSlug,
        claimedByEmail: normalizedEmail,
        providerSlug: actualSlug,
        claimSource: claimSource,
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch (slackErr) {
      console.error("[claim-campaign] Slack claim notification failed:", slackErr);
    }

    // Suspicious claim alert for medium/low trust
    if (
      trustResult.reason !== "not_scored" &&
      (trustResult.level === "medium" || trustResult.level === "low")
    ) {
      try {
        const suspiciousAlert = slackSuspiciousClaim({
          providerName: providerProfile.display_name || actualSlug,
          providerSlug: actualSlug,
          claimedByEmail: normalizedEmail,
          trustLevel: trustResult.level,
          trustReason: trustResult.reason,
        });
        await sendSlackAlert(suspiciousAlert.text, suspiciousAlert.blocks);
      } catch (slackErr) {
        console.error("[claim-campaign] Slack suspicious claim alert failed:", slackErr);
      }
    }
  }

  console.log("[claim-campaign] success, redirecting to:", redirectTarget.toString());

  return response;
}
