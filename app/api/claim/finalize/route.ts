import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { generateProviderSlug } from "@/lib/slugify";
import { sendEmail } from "@/lib/email";
import { claimNotificationEmail } from "@/lib/email-templates";
import { sendSlackAlert, slackProviderClaimed } from "@/lib/slack";
import { sendLoopsEvent } from "@/lib/loops";
import {
  scoreClaimTrust,
  extractDomainFromWebsite,
  type ClaimTrustResult,
} from "@/lib/claim-trust";

export const maxDuration = 30;

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
      const { error: updateErr } = await db
        .from("business_profiles")
        .update({
          account_id: accountId,
          claim_state: claimState,
          verification_state: verificationState,
          claim_trust_level: trustResult.level,
        })
        .eq("id", existingProfile.id);

      if (updateErr) {
        console.error("Failed to update profile:", updateErr);
        return NextResponse.json({ error: "Failed to claim listing." }, { status: 500 });
      }
      profileSlug = existingProfile.slug;
      profileId = existingProfile.id;
    } else {
      // Create new business_profile from olera-providers data
      const { data: provider } = await db
        .from("olera-providers")
        .select("*")
        .eq("provider_id", providerId)
        .single();

      if (!provider) {
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
          claim_state: claimState,
          verification_state: verificationStateForNew,
          claim_trust_level: trustResult.level,
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
        return NextResponse.json({ error: "Failed to create listing." }, { status: 500 });
      }
      profileId = newProfile.id;
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

    // 6b. Slack alert (fire-and-forget)
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
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // Non-blocking
    }

    // 6b-ii. Trust signal for one-click claims is now carried by the
    // one_click_access event (written client-side by /api/activity/track)
    // and the 🚩 Suspicious Claim Slack alert is fired by /api/auth/auto-sign-in.
    // finalize only persists `claim_trust_level` on business_profiles; it
    // intentionally does NOT write a separate activity row or Slack alert to
    // avoid duplicates in the one-click flow. OTP-only claims are covered as a
    // followup.

    // 6c. Loops: provider claimed (fire-and-forget)
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

    return NextResponse.json({ success: true, profileSlug, profileId });
  } catch (err) {
    console.error("Finalize claim error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
