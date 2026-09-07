import { NextResponse, after } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { warmCity } from "@/lib/market-diagnostic/warm";
import { createClient } from "@supabase/supabase-js";
import { isBlockedEmailDomain } from "@/lib/email-validation";
import { generateProviderSlug } from "@/lib/slugify";
import { sendEmail } from "@/lib/email";
import { claimNotificationEmail } from "@/lib/email-templates";
import { sendSlackAlert, slackProviderClaimed, slackSuspiciousClaim } from "@/lib/slack";
import { sendLoopsEvent } from "@/lib/loops";
import {
  scoreClaimTrust,
  extractDomainFromWebsite,
  type ClaimTrustResult,
} from "@/lib/claim-trust";
import { sendDeferredNotificationsForProvider } from "@/lib/admin/send-deferred-notifications";
import { logOneClickFailed } from "@/lib/one-click-telemetry";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

export const maxDuration = 60; // room for the background warm-on-claim compute (~16s)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * POST /api/claim/finalize
 *
 * Finalizes a provider claim after verification.
 * Requires authentication — links the verified provider to the user's account.
 *
 * Request body: { providerId: string, claimSession: string }
 * Returns: { success: true, profileSlug: string } or error
 */
export async function POST(request: Request) {
  try {
    // Require authentication
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Hard block: abuse domains may not finalize a claim (see
    // lib/email-validation.ts BLOCKED_DOMAINS).
    if (isBlockedEmailDomain(user.email ?? "")) {
      console.warn(`[claim/finalize] blocked domain claim: ${user.email}`);
      return NextResponse.json(
        { error: "This email address can't be used to claim a listing." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { providerId, claimSession, pendingClaim } = body as {
      providerId: string;
      claimSession: string;
      pendingClaim?: boolean; // If true, set claim_state to "pending" for manual review
    };

    if (!providerId || !claimSession) {
      return NextResponse.json(
        { error: "Provider ID and claim session are required." },
        { status: 400 }
      );
    }

    // Determine claim state based on pendingClaim flag
    const claimState = pendingClaim ? "pending" : "claimed";

    if (!UUID_RE.test(claimSession)) {
      return NextResponse.json({ error: "Invalid claim session." }, { status: 400 });
    }

    const db = getAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    // 1. Verify that a valid, verified claim_session exists
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: verifiedCode } = await db
      .from("claim_verification_codes")
      .select("id")
      .eq("provider_id", providerId)
      .eq("claim_session", claimSession)
      .not("verified_at", "is", null)
      .gt("verified_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (!verifiedCode) {
      await logOneClickFailed({
        providerId,
        stage: "finalize",
        reason: "verification_expired_or_id_mismatch",
        email: user.email,
      });
      return NextResponse.json(
        { error: "Verification required or expired. Please verify again." },
        { status: 403 }
      );
    }

    // 2. Ensure user has an account
    let { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!account) {
      const { data: newAccount, error: accountErr } = await db
        .from("accounts")
        .insert({
          user_id: user.id,
          display_name: user.email?.split("@")[0] || "",
          onboarding_completed: false,
        })
        .select("id")
        .single();

      if (accountErr) {
        // Handle race condition
        if (accountErr.code === "23505") {
          const { data: raceAccount } = await db
            .from("accounts")
            .select("id")
            .eq("user_id", user.id)
            .single();
          account = raceAccount;
        }
        if (!account) {
          console.error("Failed to create account:", accountErr);
          return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
        }
      } else {
        account = newAccount;
      }
    }

    const accountId = account!.id as string;

    // STRICT ACCOUNT SEPARATION: Check if user already has a profile of a different type
    // One email = one account type (family, provider, caregiver are separate)
    // Do NOT create family profiles for provider claims
    const { data: existingProfileOfDifferentType } = await db
      .from("business_profiles")
      .select("id, type")
      .eq("account_id", accountId)
      .neq("type", "organization")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (existingProfileOfDifferentType) {
      await logOneClickFailed({
        providerId,
        stage: "finalize",
        reason: `account_type_mismatch:${existingProfileOfDifferentType.type}`,
        email: user.email,
      });
      return NextResponse.json(
        {
          error: "This email is already used for a different account type. Please use a different email to claim this listing.",
          code: "ACCOUNT_TYPE_MISMATCH"
        },
        { status: 409 }
      );
    }

    // 3. Check if business_profile already exists for this provider
    // First try by source_provider_id (olera-providers linked profiles)
    type ExistingProfile = {
      id: string;
      claim_state: string | null;
      account_id: string | null;
      slug: string;
      display_name: string | null;
      city: string | null;
      state: string | null;
      website: string | null;
    };
    const existingProfileColumns =
      "id, claim_state, account_id, slug, display_name, city, state, website";

    let existingProfile = await db
      .from("business_profiles")
      .select(existingProfileColumns)
      .eq("source_provider_id", providerId)
      .maybeSingle()
      .then((r: { data: ExistingProfile | null }) => r.data);

    // Fallback: try by BP id directly (MedJobs ghost profiles and other BP-only providers)
    if (!existingProfile && UUID_RE.test(providerId)) {
      existingProfile = await db
        .from("business_profiles")
        .select(existingProfileColumns)
        .eq("id", providerId)
        .in("type", ["organization", "caregiver"])
        .maybeSingle()
        .then((r: { data: ExistingProfile | null }) => r.data);
    }

    let profileSlug: string;
    let profileId: string;
    let trustResult: ClaimTrustResult = { level: "medium", reason: "not_scored" };
    let providerDisplayName: string = providerId;
    // For provider_growth_tracking creation
    let providerCity: string | null = null;
    let providerState: string | null = null;

    if (existingProfile) {
      if (existingProfile.claim_state === "claimed" && existingProfile.account_id) {
        return NextResponse.json(
          { error: "This listing has already been claimed." },
          { status: 409 }
        );
      }

      providerDisplayName = existingProfile.display_name || providerId;

      trustResult = await scoreClaimTrust({
        email: user.email || "",
        providerName: providerDisplayName,
        providerCity: existingProfile.city,
        providerState: existingProfile.state,
        providerDomain: extractDomainFromWebsite(existingProfile.website),
      });

      // Set verification_state based on trust level:
      // - High trust: 'not_required' (full access, no verification needed)
      // - Medium/Low trust: 'unverified' (gated, must complete verification)
      const verificationState = trustResult.level === "high" ? "not_required" : "unverified";

      // Update existing unclaimed profile
      // Sync user's verified email to the profile so they receive lead notifications
      const { error: updateErr } = await db
        .from("business_profiles")
        .update({
          account_id: accountId,
          claim_state: claimState,
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
          email: user.email || null,
        })
        .eq("id", existingProfile.id);

      if (updateErr) {
        console.error("Failed to update profile:", updateErr);
        await logOneClickFailed({
          providerId,
          stage: "finalize",
          reason: "profile_update_failed",
          email: user.email,
        });
        return NextResponse.json({ error: "Failed to claim listing." }, { status: 500 });
      }
      profileSlug = existingProfile.slug;
      profileId = existingProfile.id;
      providerCity = existingProfile.city;
      providerState = existingProfile.state;
    } else {
      // Create new business_profile from olera-providers data
      const { data: provider } = await db
        .from("olera-providers")
        .select("*")
        .eq("provider_id", providerId)
        .single();

      if (!provider) {
        await logOneClickFailed({
          providerId,
          stage: "finalize",
          reason: "provider_not_found",
          email: user.email,
        });
        return NextResponse.json({ error: "Provider not found." }, { status: 404 });
      }

      profileSlug =
        provider.slug || generateProviderSlug(provider.provider_name, provider.state);
      providerDisplayName = provider.provider_name;

      trustResult = await scoreClaimTrust({
        email: user.email || "",
        providerName: provider.provider_name,
        providerCity: provider.city,
        providerState: provider.state,
        providerCategory: provider.category || provider.provider_category,
        providerDomain: extractDomainFromWebsite(provider.website),
      });

      // Set verification_state based on trust level:
      // - High trust: 'not_required' (full access, no verification needed)
      // - Medium/Low trust: 'unverified' (gated, must complete verification)
      const verificationStateForNew = trustResult.level === "high" ? "not_required" : "unverified";

      // Store Google metadata separately (read-only, external data)
      // Real reviews will come from the reviews table, not metadata
      const metadata: Record<string, unknown> = {};
      if (provider.google_rating != null) {
        metadata.google_metadata = {
          rating: provider.google_rating,
          place_id: provider.place_id || null,
          last_synced: new Date().toISOString(),
        };
      }

      const { data: newProfile, error: insertErr } = await db
        .from("business_profiles")
        .insert({
          account_id: accountId,
          source_provider_id: providerId,
          slug: profileSlug,
          type: "organization",
          display_name: provider.provider_name,
          description: provider.provider_description,
          image_url: provider.hero_image_url || provider.provider_logo,
          phone: provider.phone,
          email: provider.email,
          website: provider.website,
          address: provider.address,
          city: provider.city,
          state: provider.state,
          zip: provider.zipcode?.toString() || null,
          // Exact coords from the Google import — powers the "families near you" catchment.
          lat: provider.lat ?? null,
          lng: provider.lon ?? null,
          claim_state: claimState,
          verification_state: verificationStateForNew,
          claim_trust_level: trustResult.level,
          claim_trust_reason: trustResult.reason,
          // Real provider claimed from directory - NOT seeded test data
          source: "claimed_from_directory",
          is_active: true,
          // Store Google data in structured metadata (no mock reviews)
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        })
        .select("id")
        .single();

      if (insertErr || !newProfile) {
        console.error("Failed to create profile:", insertErr);
        await logOneClickFailed({
          providerId,
          stage: "finalize",
          reason: `profile_insert_failed:${insertErr?.code || "unknown"}`,
          email: user.email,
        });
        return NextResponse.json({ error: "Failed to create listing." }, { status: 500 });
      }
      profileId = newProfile.id;
      providerCity = provider.city;
      providerState = provider.state;

      // Warm this market's diagnostic in the background so Find Families is instant when the
      // provider gets there — moves the ~16s compute off the critical path. No-ops if the city
      // is already warm or we're over budget; shared by city × care-type.
      after(() =>
        warmCity(provider.city, provider.state, provider.category || provider.provider_category).catch(() => {}),
      );
    }

    // 4. Mark account onboarding as completed and set active profile
    await db
      .from("accounts")
      .update({ onboarding_completed: true, active_profile_id: profileId })
      .eq("id", accountId);

    // 5. Clean up verification codes
    await db
      .from("claim_verification_codes")
      .delete()
      .eq("provider_id", providerId)
      .eq("claim_session", claimSession);

    // 5b. Send deferred notifications for any pending leads/questions (fire-and-forget)
    // Now that the provider has an email, notify them about leads waiting for them
    if (user.email) {
      sendDeferredNotificationsForProvider({
        profileId,
        email: user.email,
        providerName: providerDisplayName,
        providerSlug: profileSlug,
        additionalSlugVariants: providerId ? [providerId] : [],
      }).catch((err) => {
        console.error("[claim/finalize] deferred notifications failed:", err);
      });
    }

    // 6. Notify admin team about the claim (fire-and-forget)
    try {
      const { data: claimedProfile } = await db
        .from("business_profiles")
        .select("display_name")
        .eq("source_provider_id", providerId)
        .single();

      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: `Provider claimed: ${claimedProfile?.display_name || providerId}`,
          html: claimNotificationEmail({
            providerName: claimedProfile?.display_name || providerId,
            providerSlug: profileSlug,
            claimedByEmail: user.email || "unknown",
          }),
          emailType: "claim_notification",
          recipientType: "admin",
          providerId,
        });
      }
    } catch (emailErr) {
      console.error("[claim/finalize] admin notification failed:", emailErr);
    }

    // 6b. Check if provider was in cold outreach and update tracking
    // This fixes the attribution loophole when magic link fails and provider uses OTP
    let claimSource = "otp_verification";
    let reEngageChannel: string | null = null;
    try {
      const nowIso = new Date().toISOString();
      const { data: trackingRow } = await db
        .from("provider_outreach_tracking")
        .select("id, stage, re_engage_channel")
        .eq("provider_id", providerId)
        .maybeSingle();

      if (trackingRow && trackingRow.stage !== "claimed") {
        // Provider was in cold outreach - attribute to cold_outreach
        claimSource = "cold_outreach";
        reEngageChannel = trackingRow.re_engage_channel;
        const oldStage = trackingRow.stage;

        // Update tracking to claimed
        const { error: updateErr, count } = await db
          .from("provider_outreach_tracking")
          .update({
            stage: "claimed",
            claimed_at: nowIso,
            stage_changed_at: nowIso,
          })
          .eq("id", trackingRow.id)
          .neq("stage", "claimed");

        if (updateErr) {
          console.error("[claim/finalize] Failed to update outreach tracking:", updateErr.message);
        } else if (count && count > 0) {
          console.log("[claim/finalize] Updated provider_outreach_tracking to claimed:", providerId);

          // Log touchpoint
          await db.from("provider_outreach_touchpoints").insert({
            provider_id: providerId,
            touchpoint_type: "stage_changed",
            details: {
              old_stage: oldStage,
              new_stage: "claimed",
              source: "cold_outreach_otp_fallback",
              auto_updated: true,
              ...(reEngageChannel && { re_engage_channel: reEngageChannel }),
            },
            admin_user_id: null,
            created_at: nowIso,
          });
        }
      }
    } catch (trackingErr) {
      console.error("[claim/finalize] Outreach tracking check failed:", trackingErr);
      // Non-blocking - continue with claim
    }

    // 6b-ii. Create provider_growth_tracking record (only for fully claimed, not pending)
    if (claimState === "claimed") {
      try {
        // Detect MedJobs eligibility based on location
        const medjobsEligibility = detectMedjobsCatchment(providerCity, providerState);

        // Map claim source to canonical values
        const trackingClaimSource =
          claimSource === "cold_outreach"
            ? "cold_outreach"
            : reEngageChannel === "city_broadcast"
              ? "city_broadcast"
              : "email"; // default for organic/OTP claims

        await db.from("provider_growth_tracking").insert({
          business_profile_id: profileId,
          claim_source: trackingClaimSource,
          claimed_at: new Date().toISOString(),
          medjobs_eligible: medjobsEligibility.eligible,
          medjobs_catchment_university: medjobsEligibility.university,
          pipeline_stage: "new_claim",
          pipeline_stage_changed_at: new Date().toISOString(),
        });

        console.log("[claim/finalize] Created provider_growth_tracking for:", profileId);
      } catch (growthErr) {
        // Non-blocking - don't fail the claim if tracking fails
        console.error("[claim/finalize] provider_growth_tracking insert failed:", growthErr);
      }
    }

    // 6c. Slack alert (fire-and-forget)
    try {
      const { data: claimedBp } = await db
        .from("business_profiles")
        .select("display_name")
        .eq("source_provider_id", providerId)
        .single();

      const alert = slackProviderClaimed({
        providerName: claimedBp?.display_name || providerId,
        claimedByEmail: user.email || "unknown",
        providerSlug: profileSlug,
        claimSource,
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // Non-blocking
    }

    // 6c-ii. Suspicious claim alert for OTP-based claims with medium/low trust
    // One-click claims get their suspicious alert via /api/auth/auto-sign-in,
    // but OTP-only claims (manual email verification) need their own alert here.
    // Only send if trust scoring actually ran (reason !== "not_scored")
    if (trustResult.reason !== "not_scored" &&
        (trustResult.level === "medium" || trustResult.level === "low")) {
      try {
        const suspiciousAlert = slackSuspiciousClaim({
          providerName: providerDisplayName,
          claimedByEmail: user.email || "unknown",
          providerSlug: profileSlug,
          trustLevel: trustResult.level,
          trustReason: trustResult.reason,
        });
        await sendSlackAlert(suspiciousAlert.text, suspiciousAlert.blocks);
      } catch {
        // Non-blocking
      }
    }

    // 6d. Loops: provider claimed (fire-and-forget)
    try {
      const { data: loopsBp } = await db
        .from("business_profiles")
        .select("display_name")
        .eq("source_provider_id", providerId)
        .single();

      await sendLoopsEvent({
        email: user.email || "",
        eventName: "provider_claimed",
        audience: "provider",
        eventProperties: {
          providerName: loopsBp?.display_name || providerId,
        },
        contactProperties: {
          userType: "provider",
        },
      });
    } catch {
      // Non-blocking
    }

    // 6e. Provider activity: claim attribution for the admin Providers section.
    // Uses claimSource determined above (cold_outreach if from outreach, else email/otp)
    db.from("provider_activity").insert({
      provider_id: providerId,
      profile_id: profileId,
      event_type: "claim_completed",
      metadata: { source: claimSource === "cold_outreach" ? "cold_outreach" : "email" },
    }).then(({ error: actErr }: { error: { message: string } | null }) => {
      if (actErr) console.error("[provider_activity] claim_completed insert failed:", actErr);
    });

    return NextResponse.json({ success: true, profileSlug, profileId });
  } catch (err) {
    console.error("Finalize claim error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
