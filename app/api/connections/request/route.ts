import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { buildIntroMessage } from "@/lib/build-intro-message";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { connectionSentEmail, careReportEmail } from "@/lib/email-templates";
import { getPricingForProviderSync, formatPricingRange, getFundingOptions } from "@/lib/pricing-ranges";
import { sendSlackAlert, slackNewLead, slackMissingEmail, slackLeadCaptureConverted, slackLegacyConnectConverted } from "@/lib/slack";
import { normalizeUSPhone } from "@/lib/twilio";
import { startSeekerConversation } from "@/lib/whatsapp-conversation";
import { sendLoopsEvent } from "@/lib/loops";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { syncIntentToProfile, recipientMap, timelineMap, careTypeMap } from "@/lib/sync-intent-to-profile";
import { recordProviderEvent } from "@/lib/analytics/provider-events";
import { markAdsLeadConversion } from "@/lib/ad-boost/ads-conversion.server";
import { readManagedUtmFromRequest, managedUtmMetadata, type ManagedUtm } from "@/lib/ad-boost/managed-utm";
import { holdProviderLeadNotifications, sendProviderLeadNotifications } from "@/lib/leads/provider-notifications.server";
import { stampNextBestOption } from "@/lib/connections/next-best-option.server";
import { emailReturningUserSignInLink } from "@/lib/auth/returning-user";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).substring(2, 6);
  return `family-${base}-${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GUEST CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

interface GuestConnectionParams {
  guestEmail: string;
  guestFullName?: string;
  guestPhone?: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  intentData: {
    careRecipient: string | null;
    careType: string | null;
    careTypeOtherText?: string;
    urgency: string | null;
    additionalNotes?: string;
  };
  /** Anonymous session id from the client. Threaded into the lead_received
   *  event so we can join leads back to outreach/SBF arm impressions for
   *  cannibalization analysis. Optional because legacy callers don't send
   *  it; null is a valid value in metadata. */
  sessionId?: string | null;
  /** Thirty-minute visit id for honest landing-session conversion rates. */
  visitId?: string | null;
  /** CTA variant for A/B testing attribution. Passed from the frontend
   *  CTAVariantRouter so conversions can be attributed to a variant arm. */
  ctaVariant?: string | null;
  /** Entry point for lead capture (custom_quote, book_consultation, message_host) */
  entryPoint?: string | null;
  /** Managed-ads attribution from the provider-page-load cookie. Stamped onto
   *  the lead_received event so an ad-driven inquiry is credited to its campaign. */
  managedUtm?: ManagedUtm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
}

async function handleGuestConnection({
  guestEmail,
  guestFullName,
  guestPhone,
  providerId,
  providerName,
  providerSlug,
  intentData,
  sessionId,
  visitId,
  ctaVariant,
  entryPoint,
  admin,
  managedUtm,
}: GuestConnectionParams) {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(guestEmail)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const db = admin;
  if (!db) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const normalizedEmail = guestEmail.trim().toLowerCase();

  // Rate limiting: 5 connections per email per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentConnections } = await db
    .from("connections")
    .select("id")
    .eq("guest_email", normalizedEmail)
    .gte("created_at", oneHourAgo);

  if (recentConnections && recentConnections.length >= 5) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER EMAIL CHECK
  // Block if this email belongs to a provider/caregiver account.
  // Family accounts are allowed to proceed (they'll just get logged in).
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: existingProviderProfile } = await db
    .from("business_profiles")
    .select("id, type")
    .eq("email", normalizedEmail)
    .in("type", ["organization", "caregiver", "student"])
    .limit(1)
    .maybeSingle();

  if (existingProviderProfile) {
    return NextResponse.json(
      {
        error: "This email is linked to a provider account. To send care inquiries, please use a different email or sign in to create a separate family account.",
        code: "PROVIDER_EMAIL",
      },
      { status: 409 }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTANT ACCOUNT CREATION
  // Create real Supabase user + account + profile (not placeholder)
  // User gets instant session via tokenHash returned to client
  // ═══════════════════════════════════════════════════════════════════════════

  const { createClient: createAdminAuthClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const authClient = createAdminAuthClient(supabaseUrl, serviceKey);
  const siteUrl = getSiteUrl();

  let fromProfileId: string;
  let accountId: string;
  let userId: string;
  let tokenHash: string | null = null;
  let actionLink: string | null = null;
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let isNewUser = false;
  let existingUser = false;
  const displayName = guestFullName?.trim() || "Care Seeker";

  // Try to create user — if already exists, we'll handle that case
  const { data: newUser, error: createUserErr } = await authClient.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: false,
    user_metadata: {
      full_name: displayName,
    },
  });

  if (createUserErr) {
    // Check if user already exists (error code for duplicate email)
    if (createUserErr.message?.includes("already been registered") ||
        createUserErr.message?.includes("already exists")) {
      // User exists — look up by email in accounts table via business_profiles
      const { data: existingProfile } = await db
        .from("business_profiles")
        .select("id, account_id")
        .eq("email", normalizedEmail)
        .eq("type", "family")
        .not("account_id", "is", null)
        .limit(1)
        .single();

      if (existingProfile && existingProfile.account_id) {
        // Existing user with account and profile
        fromProfileId = existingProfile.id;
        accountId = existingProfile.account_id;

        // Get user_id from account
        const { data: accountData } = await db
          .from("accounts")
          .select("user_id")
          .eq("id", accountId)
          .single();

        userId = accountData?.user_id || "";

        // SECURITY: existing account — email a sign-in link instead of minting
        // a session for a caller-supplied email (prevents account takeover).
        // tokenHash / actionLink / tokens are intentionally left null.
        await emailReturningUserSignInLink(authClient, {
          email: normalizedEmail,
          nextPath: "/welcome",
        });
        existingUser = true;
      } else {
        // Edge case: auth user exists but no profile in our DB.
        // SECURITY: never mint a session for a caller-supplied email. Resolve
        // their id and email a sign-in link instead (prevents account takeover).
        const { userId: resolvedUserId } = await emailReturningUserSignInLink(authClient, {
          email: normalizedEmail,
          nextPath: "/welcome",
        });
        userId = resolvedUserId || "";
        existingUser = true;

        // Check if this auth user has a provider profile on their account
        // If so, block them instead of creating a family profile
        if (userId) {
          const { data: existingAccount } = await db
            .from("accounts")
            .select("id")
            .eq("user_id", userId)
            .single();

          if (existingAccount) {
            const { data: providerProfiles } = await db
              .from("business_profiles")
              .select("id, type")
              .eq("account_id", existingAccount.id)
              .in("type", ["organization", "caregiver", "student"])
              .limit(1);

            if (providerProfiles && providerProfiles.length > 0) {
              return NextResponse.json(
                {
                  error: "This email is linked to a provider account. To send care inquiries, please use a different email or sign in to create a separate family account.",
                  code: "PROVIDER_EMAIL",
                },
                { status: 409 }
              );
            }
          }
        }

        // Create account and profile for this existing auth user
        // First, we need to look up the user via the auth admin API
        // Since we can't easily get user by email, we'll create profile with null account for now
        // and let the magic link callback claim it
        const slug = await generateUniqueSlugFromName(db, displayName);
        const normalizedPhone = guestPhone ? normalizeUSPhone(guestPhone) : null;
        const { data: newProfile, error: profileErr } = await db
          .from("business_profiles")
          .insert({
            account_id: null, // Will be claimed when user uses magic link
            email: normalizedEmail,
            phone: normalizedPhone,
            slug,
            type: "family",
            display_name: displayName,
            care_types: intentData.careType && careTypeMap[intentData.careType]
              ? [careTypeMap[intentData.careType]]
              : [],
            claim_state: "unclaimed",
            verification_state: "unverified",
            source: "guest_connection",
            metadata: {
              relationship_to_recipient: intentData.careRecipient
                ? recipientMap[intentData.careRecipient] ?? null
                : null,
              timeline: intentData.urgency
                ? timelineMap[intentData.urgency] ?? null
                : null,
              about_situation: intentData.additionalNotes || null,
              // Store session_id for cleanup when account is deleted
              enrichment_session_id: sessionId || null,
            },
          })
          .select("id")
          .single();

        if (profileErr) {
          console.error("Failed to create profile for existing user:", profileErr);
          return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
        }
        fromProfileId = newProfile.id;
        accountId = ""; // Will be set when magic link is used
      }
    } else {
      // Actual error creating user
      console.error("Failed to create auth user:", createUserErr);
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }
  } else {
    // Successfully created new user
    isNewUser = true;
    userId = newUser.user.id;

    // Create account
    const { data: newAccount, error: accountErr } = await db
      .from("accounts")
      .insert({
        user_id: userId,
        display_name: displayName,
        onboarding_completed: false,
      })
      .select("id")
      .single();

    if (accountErr) {
      console.error("Failed to create account:", accountErr);
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }
    accountId = newAccount.id;

    // Create family profile with phone if provided
    const slug = await generateUniqueSlugFromName(db, displayName);
    const normalizedPhone = guestPhone ? normalizeUSPhone(guestPhone) : null;
    const { data: newProfile, error: profileErr } = await db
      .from("business_profiles")
      .insert({
        account_id: accountId,
        email: normalizedEmail,
        phone: normalizedPhone,
        slug,
        type: "family",
        display_name: displayName,
        care_types: intentData.careType && careTypeMap[intentData.careType]
          ? [careTypeMap[intentData.careType]]
          : [],
        claim_state: "claimed",
        verification_state: "unverified",
        source: "guest_connection",
        metadata: {
          relationship_to_recipient: intentData.careRecipient
            ? recipientMap[intentData.careRecipient] ?? null
            : null,
          timeline: intentData.urgency
            ? timelineMap[intentData.urgency] ?? null
            : null,
          about_situation: intentData.additionalNotes || null,
          // Store session_id for cleanup when account is deleted
          enrichment_session_id: sessionId || null,
        },
      })
      .select("id")
      .single();

    if (profileErr) {
      console.error("Failed to create family profile:", profileErr);
      return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
    }
    fromProfileId = newProfile.id;

    // Set as active profile
    await db.from("accounts").update({ active_profile_id: fromProfileId }).eq("id", accountId);

    // Generate session tokens for instant login
    // We use generateLink to get the OTP, then verify it server-side to get session tokens
    const { data: linkData, error: linkError } = await authClient.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: `${siteUrl}/welcome`,
      },
    });

    if (!linkError && linkData?.properties) {
      tokenHash = linkData.properties.hashed_token || null;
      actionLink = linkData.properties.action_link || null;

      // Try to verify the token server-side and get session tokens
      // This creates a session we can pass to the client
      try {
        const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });

        if (!verifyError && verifyData?.session) {
          accessToken = verifyData.session.access_token;
          refreshToken = verifyData.session.refresh_token;
          console.log("[guest-connection] Server-side session created for:", normalizedEmail);
        } else {
          console.warn("[guest-connection] Server-side verify failed:", verifyError?.message);
        }
      } catch (verifyErr) {
        console.error("[guest-connection] Server-side verify error:", verifyErr);
      }
    }

    // Loops: new account created
    try {
      const nameParts = displayName.trim().split(/\s+/);
      await sendLoopsEvent({
        email: normalizedEmail,
        eventName: "user_signup",
        audience: "seeker",
        eventProperties: { source: "guest_connection" },
        contactProperties: {
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
        },
      });
    } catch {
      // Non-blocking
    }
  }

  // NOTE: syncIntentToProfile is called AFTER provider info is resolved
  // so we can include providerCity/providerState for completeness calculation

  // Resolve target provider (same logic as authenticated flow)
  let toProfileId: string;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);

  if (isUUID) {
    const { data: existing } = await db
      .from("business_profiles")
      .select("id")
      .eq("id", providerId)
      .single();

    if (existing) {
      toProfileId = existing.id;
    } else {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }
  } else {
    // iOS provider lookup
    const { data: existing } = await db
      .from("business_profiles")
      .select("id")
      .eq("source_provider_id", providerId)
      .limit(1)
      .single();

    if (existing) {
      toProfileId = existing.id;
    } else {
      // Create from olera-providers
      const { data: iosProvider } = await db
        .from("olera-providers")
        .select("provider_name, provider_category, main_category, city, state, phone, provider_logo, provider_images")
        .eq("provider_id", providerId)
        .single();

      const providerCity = iosProvider?.city || null;
      const providerState = iosProvider?.state || null;
      const providerPhone = iosProvider?.phone || null;
      const providerCategory = iosProvider?.provider_category || null;
      const providerImageUrl = iosProvider?.provider_logo
        || (iosProvider?.provider_images as string | null)?.split(" | ")?.[0]
        || null;
      const providerCareTypes = iosProvider ? [iosProvider.provider_category] : [];
      if (iosProvider?.main_category && iosProvider.main_category !== iosProvider.provider_category) {
        providerCareTypes.push(iosProvider.main_category);
      }

      const { data: newProvider, error: providerError } = await db
        .from("business_profiles")
        .insert({
          source_provider_id: providerId,
          slug: providerSlug || providerId,
          type: "organization",
          category: providerCategory,
          display_name: providerName,
          phone: providerPhone,
          city: providerCity,
          state: providerState,
          image_url: providerImageUrl,
          care_types: providerCareTypes,
          claim_state: "unclaimed",
          verification_state: "unverified",
          source: "seeded",
          is_active: true,
          metadata: {},
        })
        .select("id")
        .single();

      if (providerError && providerError.code !== "23505") {
        console.error("Failed to create provider profile:", providerError);
        return NextResponse.json({ error: "Failed to register provider." }, { status: 500 });
      }

      toProfileId = newProvider?.id;
      if (!toProfileId) {
        // Race condition — fetch again
        const { data: raceProvider } = await db
          .from("business_profiles")
          .select("id")
          .eq("source_provider_id", providerId)
          .limit(1)
          .single();
        toProfileId = raceProvider?.id;
      }

      if (!toProfileId) {
        return NextResponse.json({ error: "Failed to register provider." }, { status: 500 });
      }
    }
  }

  // Check for existing connection from this guest profile
  const { data: existingConnection } = await db
    .from("connections")
    .select("id, created_at")
    .eq("from_profile_id", fromProfileId)
    .eq("to_profile_id", toProfileId)
    .eq("type", "inquiry")
    .in("status", ["pending", "accepted"])
    .limit(1)
    .single();

  if (existingConnection) {
    return NextResponse.json({
      status: "duplicate",
      connectionId: existingConnection.id,
      created_at: existingConnection.created_at,
      tokenHash: accessToken ? null : (tokenHash || null),
      actionLink: accessToken ? null : (actionLink || null),
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      // When true, an existing account was found — no session minted, a sign-in
      // link was emailed. Client should show "check your email" (anti-takeover).
      existingUser,
      providerSlug,
    });
  }

  // Look up provider info for summary card and notifications
  let providerEmail: string | null = null;
  let providerDisplayName: string | null = null;
  let providerCity: string | null = null;
  let providerState: string | null = null;
  let providerCategoryForWa: string | null = null;
  let providerLeadsUnsubscribed = false;
  try {
    const { data: bp } = await db
      .from("business_profiles")
      .select("email, display_name, city, state, category, metadata, source_provider_id")
      .eq("id", toProfileId)
      .single();
    providerCategoryForWa = bp?.category || null;
    providerEmail = bp?.email || null;
    providerDisplayName = bp?.display_name || null;
    providerCity = bp?.city || null;
    providerState = bp?.state || null;
    const bpMeta = (bp?.metadata as Record<string, unknown>) || {};
    providerLeadsUnsubscribed = !!bpMeta.leads_unsubscribed;

    // Fallback to olera-providers for email and location
    // Use source_provider_id if available (correct link), otherwise fall back to providerId
    const iosLookupId = bp?.source_provider_id || providerId;
    if ((!providerEmail || !providerCity) && iosLookupId) {
      const { data: ios } = await db
        .from("olera-providers")
        .select("email, city, state")
        .eq("provider_id", iosLookupId)
        .maybeSingle();
      providerEmail = providerEmail || ios?.email || null;
      providerCity = providerCity || ios?.city || null;
      providerState = providerState || ios?.state || null;
    }
  } catch {
    // Non-blocking
  }

  // Sync intent data to profile (includes city + care type pre-fill and completeness calculation)
  try {
    await syncIntentToProfile(db, fromProfileId, {
      careRecipient: intentData.careRecipient,
      careType: intentData.careType,
      urgency: intentData.urgency,
      additionalNotes: intentData.additionalNotes,
      providerCity,
      providerState,
      providerCategory: providerCategoryForWa,
    }, normalizedEmail);
  } catch (syncErr) {
    console.error("Failed to sync intent to profile:", syncErr);
  }

  // Build message payload with all available seeker info
  const seekerName = guestFullName?.trim() || displayName;
  const nameParts = seekerName.split(/\s+/);
  const firstName = (guestFullName?.trim()) ? nameParts[0] : "";
  const lastName = (guestFullName?.trim()) ? nameParts.slice(1).join(" ") : "";
  const normalizedPhone = guestPhone ? normalizeUSPhone(guestPhone) : null;

  // Build location string for summary
  const locationStr = [providerCity, providerState].filter(Boolean).join(", ");

  const messagePayload = JSON.stringify({
    // Seeker identity (always available)
    seeker_name: seekerName,
    seeker_first_name: firstName,
    seeker_last_name: lastName,
    seeker_email: normalizedEmail,
    seeker_phone: normalizedPhone,
    // Location context (from provider)
    looking_in_city: providerCity,
    looking_in_state: providerState,
    // Custom message from form
    message: intentData?.additionalNotes || null,
    // Care details (may be filled later via profile)
    care_recipient: intentData?.careRecipient || null,
    care_type: intentData?.careType || null,
    care_type_other: intentData?.careTypeOtherText || null,
    urgency: intentData?.urgency || null,
    // Legacy field for backward compatibility
    additional_notes: intentData?.additionalNotes || null,
    contact_preference: null,
  });

  // Build auto_intro - a natural language summary
  let autoIntro: string;
  if (intentData?.additionalNotes) {
    // User wrote a custom message - use it as the intro
    autoIntro = intentData.additionalNotes;
  } else if (locationStr) {
    // No custom message - generate based on location
    const introName = firstName || "A family";
    autoIntro = `${introName} is interested in care services in ${locationStr}.`;
  } else {
    // Fallback
    const introName = firstName || "A family";
    autoIntro = `${introName} is interested in learning more about your services.`;
  }

  // Build connection metadata
  const connectionMetadata: Record<string, unknown> = {};
  connectionMetadata.auto_intro = autoIntro;
  if (!providerEmail) connectionMetadata.needs_provider_email = true;
  if (ctaVariant) connectionMetadata.cta_variant = ctaVariant;
  if (entryPoint) connectionMetadata.entry_point = entryPoint;
  if (sessionId) connectionMetadata.session_id = sessionId;
  if (visitId) connectionMetadata.visit_id = visitId;

  // Thread starts empty - provider must send the first real message
  connectionMetadata.thread = [];

  // Check if this is the provider's first lead (before insert)
  const { count: existingLeadCount } = await db
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("to_profile_id", toProfileId)
    .eq("type", "inquiry");
  const isFirstLead = existingLeadCount === 0;

  // Insert connection
  const { data: newConnection, error: insertError } = await db
    .from("connections")
    .insert({
      from_profile_id: fromProfileId,
      to_profile_id: toProfileId,
      type: "inquiry",
      status: "pending",
      message: messagePayload,
      metadata: connectionMetadata,
      guest_email: normalizedEmail, // For rate limiting
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    console.error("Failed to insert guest connection:", insertError);
    return NextResponse.json({ error: "Failed to send request." }, { status: 500 });
  }

  // Log family engagement event (fire-and-forget)
  db.from("seeker_activity").insert({
    profile_id: fromProfileId,
    event_type: "connection_sent",
    related_provider_id: providerId,
    metadata: {
      connection_id: newConnection.id,
      care_type: intentData.careType || null,
      timeline: intentData.urgency || null,
      guest: true,
      provider_name: providerName || null,
      provider_slug: providerSlug || null,
    },
  }).then(({ error: actErr }: { error: { message: string } | null }) => {
    if (actErr) console.error("[seeker_activity] connection_sent insert failed:", actErr);
  });

  await markAdsLeadConversion();
  void recordProviderEvent({
    // Slug, not internal id — keeps row aggregatable with page_view (URL slug).
    provider_id: providerSlug || providerId,
    event_type: "lead_received",
    profile_id: toProfileId,
    metadata: {
      connection_id: newConnection.id,
      care_type: intentData.careType || null,
      timeline: intentData.urgency || null,
      guest: true,
      raw_provider_id: providerId,
      // session_id makes leads joinable back to arm impressions in
      // seeker_activity / provider_activity for cannibalization analysis.
      session_id: sessionId || null,
      visit_id: visitId || sessionId || null,
      subject_id: fromProfileId,
      // cta_variant for CTA A/B testing attribution
      // Default to "legacy" only for CTA-based conversions (no entry_point)
      // Lead Capture conversions have entry_point and shouldn't be attributed to a CTA variant
      cta_variant: entryPoint ? (ctaVariant || null) : (ctaVariant || "legacy"),
      // entry_point for Lead Capture attribution (custom_quote, book_consultation, message_host)
      entry_point: entryPoint || null,
      // Managed-ads campaign attribution (utm_source/utm_campaign) — the signal
      // behind Ad Boost "families delivered". See lib/ad-boost/managed-utm.
      ...managedUtmMetadata(managedUtm || {}),
    },
  });

  // Provider notifications are HELD, not sent here. The family has not been
  // asked anything yet at this point: the six-step qualifying flow runs after
  // this response returns, and about six in ten people skip out of it. Sending
  // now is what produced months of "a family is looking for care" emails about
  // rows containing an email address and nothing else.
  // Released by whichever comes first: the family finishing enrichment
  // (PATCH /api/connections/update-intent) or the 10 minute ceiling swept by
  // cron/lead-notification-release. See lib/leads/provider-notifications.server.ts.
  await holdProviderLeadNotifications({
    connectionId: newConnection.id,
    managedUtm: managedUtm || null,
    isFirstLead,
  });

  // WhatsApp enrichment conversation to seeker (fire-and-forget)
  try {
    const seekerNormalized = normalizeUSPhone(guestPhone || "");
    if (seekerNormalized) {
      // Check if seeker opted in to WhatsApp
      const { data: seekerBp } = await db
        .from("business_profiles")
        .select("metadata")
        .eq("id", fromProfileId)
        .single();
      const seekerMeta = (seekerBp?.metadata || {}) as Record<string, unknown>;
      if (seekerMeta.whatsapp_opted_in) {
        await startSeekerConversation({
          connectionId: newConnection.id,
          profileId: fromProfileId,
          phone: seekerNormalized,
          seekerFirstName: firstName || "there",
          providerName: providerDisplayName || providerName,
          providerCategory: providerCategoryForWa,
          city: providerCity,
          state: providerState,
        });
      }
    }
  } catch (seekerWaErr) {
    console.error("[whatsapp] Seeker enrichment conversation failed:", seekerWaErr);
  }

  // Slack alert for new lead
  try {
    const careTypeMap: Record<string, string> = {
      home_care: "Home Care",
      home_health: "Home Health Care",
      assisted_living: "Assisted Living",
      memory_care: "Memory Care",
    };
    const alert = slackNewLead({
      familyName: `${firstName || "A family"} (guest)`,
      providerName,
      careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
      adCampaign: managedUtm?.utmCampaign ?? null,
    });
    await sendSlackAlert(alert.text, alert.blocks);
  } catch {
    // Non-blocking
  }

  // Slack alert for conversion (guest account created)
  try {
    if (entryPoint) {
      // Lead Capture conversion (custom_quote, book_consultation, message_host)
      const conversionAlert = slackLeadCaptureConverted({
        email: normalizedEmail,
        providerName,
        providerSlug,
        entryPoint,
      });
      await sendSlackAlert(conversionAlert.text, conversionAlert.blocks);
    } else {
      // Legacy Connect conversion (no entry point)
      const conversionAlert = slackLegacyConnectConverted({
        email: normalizedEmail,
        providerName,
        providerSlug,
      });
      await sendSlackAlert(conversionAlert.text, conversionAlert.blocks);
    }
  } catch {
    // Non-blocking
  }

  // Slack alert for missing provider email
  if (!providerEmail) {
    try {
      const careTypeMap: Record<string, string> = {
        home_care: "Home Care",
        home_health: "Home Health Care",
        assisted_living: "Assisted Living",
        memory_care: "Memory Care",
      };
      const missingAlert = slackMissingEmail({
        familyName: `${firstName || "A family"} (guest)`,
        providerName,
        providerId,
        careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
      });
      await sendSlackAlert(missingAlert.text, missingAlert.blocks);
    } catch {
      // Non-blocking
    }
  }

  // Care report email — now consolidated with confirmation + magic link
  // This is the ONLY email sent to families when they send a lead
  try {
    const providerCareTypes = (await db
      .from("business_profiles")
      .select("care_types")
      .eq("id", toProfileId)
      .single()
    ).data?.care_types as string[] || [];

    // Resolve pricing from care types (sync — national baselines)
    const pricing = getPricingForProviderSync(providerCareTypes.length > 0 ? providerCareTypes : [providerName]);
    const pricingRange = pricing.range ? formatPricingRange(pricing.range) : null;

    // Get funding options with savings ranges
    const fundingOpts = getFundingOptions().map((f) => ({
      label: f.label,
      savings: f.monthlySavings ? `$${f.monthlySavings.low.toLocaleString()}–$${f.monthlySavings.high.toLocaleString()}` : null,
    }));

    // Find 3 similar providers in the same city
    const { data: similarRaw } = await db
      .from("business_profiles")
      .select("display_name, slug, metadata")
      .eq("city", providerCity)
      .eq("state", providerState)
      .eq("type", "organization")
      .eq("is_active", true)
      .neq("id", toProfileId)
      .limit(3);

    // Generate magic link for inbox access with fallback to family landing page
    const careReportEmailLogId = await reserveEmailLogId({
      to: normalizedEmail,
      subject: `You can now message ${providerName}`,
      emailType: "care_report",
      recipientType: "family",
      metadata: { connection_id: newConnection.id, provider_id: toProfileId },
    });

    const inboxDest = appendTrackingParams("/portal/inbox", careReportEmailLogId);

    // Default to family landing page as fallback (better UX than auth modal on empty inbox)
    // They can sign in from there and access their inbox naturally
    let magicLinkUrl = `${siteUrl}/browse`;

    // Try to generate magic link (expires in 1 hour), but don't block email if it fails
    try {
      const { data: magicLinkData, error: magicLinkError } = await authClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(inboxDest)}`,
        },
      });

      if (!magicLinkError && magicLinkData?.properties?.action_link) {
        magicLinkUrl = magicLinkData.properties.action_link;
      } else {
        console.warn("[care-report] Magic link generation failed, using browse page fallback:", magicLinkError?.message);
      }
    } catch (magicLinkErr) {
      console.error("[care-report] Magic link generation error, using browse page fallback:", magicLinkErr);
    }

    // Generate magic links for each similar provider in PARALLEL (performance optimization)
    const similarProviderPromises = (similarRaw || []).map(async (p: { display_name: string; slug: string; metadata: Record<string, unknown> | null }) => {
      // Add provider slug to tracking for click attribution (Issue #2 fix)
      const providerDest = appendTrackingParams(`/provider/${p.slug}?sp=${p.slug}`, careReportEmailLogId);
      let providerMagicLink = `${siteUrl}${providerDest}`; // Fallback to public URL

      try {
        const { data: providerLinkData, error: providerLinkError } = await authClient.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmail,
          options: {
            redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(providerDest)}`,
          },
        });

        if (!providerLinkError && providerLinkData?.properties?.action_link) {
          providerMagicLink = providerLinkData.properties.action_link;
        }
      } catch (linkErr) {
        console.error(`[care-report] Similar provider magic link failed for ${p.slug}:`, linkErr);
        // Continue with fallback public URL (graceful degradation)
      }

      return {
        name: p.display_name,
        slug: p.slug,
        priceRange: (p.metadata?.price_range as string) || null,
        viewUrl: providerMagicLink,
      };
    });

    // Wait for all magic links to generate in parallel (much faster than sequential)
    const similarProvidersWithMagicLinks = await Promise.all(similarProviderPromises);

    // Always send email, regardless of magic link success
    await sendEmail({
      to: normalizedEmail,
      subject: `You can now message ${providerName}`,
      html: careReportEmail({
        seekerFirstName: firstName || "",
        providerName,
        providerSlug: providerSlug || toProfileId,
        careTypeLabel: pricing.careTypeLabel,
        pricingRange,
        pricingDescription: pricing.range?.description || null,
        city: providerCity,
        state: providerState,
        fundingOptions: fundingOpts,
        similarProviders: similarProvidersWithMagicLinks,
        magicLinkUrl,
      }),
      emailType: "care_report",
      recipientType: "family",
      metadata: { connection_id: newConnection.id, provider_id: toProfileId },
      emailLogId: careReportEmailLogId ?? undefined,
    });
  } catch (err) {
    console.error("[care-report-email] error:", err);
    // Non-blocking — connection still created successfully
  }

  // Loops event
  try {
    await sendLoopsEvent({
      email: normalizedEmail,
      eventName: "new_lead",
      audience: "seeker",
      eventProperties: {
        providerName,
        careType: intentData?.careType || "",
        urgency: intentData?.urgency || "",
        guest: true,
      },
    });
  } catch {
    // Non-blocking
  }

  // If we have session tokens, don't send tokenHash/actionLink (they're consumed)
  // If we don't have session tokens, send tokenHash/actionLink for fallback
  return NextResponse.json({
    status: "created",
    connectionId: newConnection.id,
    created_at: newConnection.created_at,
    tokenHash: accessToken ? null : (tokenHash || null),
    actionLink: accessToken ? null : (actionLink || null),
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    providerSlug,
    isNewUser,
    // When true, an existing account was found — no session minted, a sign-in
    // link was emailed. Client should show "check your email" (anti-takeover).
    existingUser,
  });
}

/**
 * POST /api/connections/request
 *
 * Creates a connection request from a user to a provider.
 * Supports both authenticated users and guest users (via email).
 *
 * For authenticated users:
 * - Ensures user has a family profile
 * - Creates connection with proper FK references
 *
 * For guest users:
 * - Creates a placeholder profile with claim_token
 * - Sends magic link via Supabase for later account creation
 * - Returns claimToken for localStorage-based inbox access
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Managed-ads attribution from the provider-page-load cookie (set by
    // ManagedUtmCapture). Cookie rides along on this same-origin fetch, so no
    // client caller needs to thread UTM. See lib/ad-boost/managed-utm.
    // let: a next-best-option request clears it below (3b).
    let managedUtm = readManagedUtmFromRequest(request);
    const {
      providerId,
      providerName,
      providerSlug,
      intentData,
      guest,
      guestEmail,
      formData,
      website, // Honeypot field
      session_id: sessionId,
      visit_id: visitId,
      cta_variant: ctaVariant,
      entry_point: entryPoint,
      from_connection_id: fromConnectionId,
    } = body as {
      providerId: string;
      providerName: string;
      providerSlug: string;
      intentData: {
        careRecipient: string | null;
        careType: string | null;
        careTypeOtherText?: string;
        urgency: string | null;
        additionalNotes?: string;
      };
      guest?: boolean;
      guestEmail?: string;
      formData?: { fullName?: string; phone?: string; message?: string };
      website?: string; // Honeypot
      session_id?: string;
      visit_id?: string;
      cta_variant?: string;
      entry_point?: string; // Lead capture entry point (custom_quote, book_consultation, message_host)
      /** next_best_option only: the inquiry the family just sent, whose answers carry over. */
      from_connection_id?: string;
    };

    if (!providerId || !providerName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Honeypot check — if filled, silently "succeed" but don't actually create connection
    if (website) {
      return NextResponse.json({
        status: "created",
        connectionId: "00000000-0000-0000-0000-000000000000",
      });
    }

    const admin = getAdminClient();

    // ═══════════════════════════════════════════════════════════
    // GUEST FLOW
    // ═══════════════════════════════════════════════════════════
    if (guest && guestEmail) {
      return handleGuestConnection({
        guestEmail,
        guestFullName: formData?.fullName,
        guestPhone: formData?.phone,
        providerId,
        providerName,
        providerSlug,
        intentData,
        sessionId,
        visitId,
        ctaVariant,
        entryPoint,
        managedUtm,
        admin,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // AUTHENTICATED FLOW
    // ═══════════════════════════════════════════════════════════
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const db = admin || supabase;

    // 1. Get user's account
    const { data: account } = await db
      .from("accounts")
      .select("id, display_name, active_profile_id, onboarding_completed")
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Account not found. Please try again." },
        { status: 404 }
      );
    }

    // 2. STRICT ACCOUNT SEPARATION: Check if user has any non-family profiles
    // Provider, caregiver, and student accounts cannot send care inquiries
    const { data: allProfiles } = await db
      .from("business_profiles")
      .select("id, type")
      .eq("account_id", account.id)
      .eq("is_active", true);

    const hasNonFamilyProfile = allProfiles?.some(
      (p: { type: string }) => p.type === "organization" || p.type === "caregiver" || p.type === "student"
    );
    const hasFamilyProfile = allProfiles?.some((p: { type: string }) => p.type === "family");

    // Block if user has a non-family profile but no family profile
    // This enforces strict account separation
    if (hasNonFamilyProfile && !hasFamilyProfile) {
      return NextResponse.json(
        { error: "Care inquiries can only be sent from a family account. Please create a separate family account to connect with providers." },
        { status: 403 }
      );
    }

    // 3. Ensure user has a family profile
    let fromProfileId: string;

    const { data: existingFamily } = await db
      .from("business_profiles")
      .select("id")
      .eq("account_id", account.id)
      .eq("type", "family")
      .limit(1)
      .single();

    if (existingFamily) {
      fromProfileId = existingFamily.id;

      // Mark onboarding complete if not already (connection = onboarded)
      if (!account.onboarding_completed) {
        await db
          .from("accounts")
          .update({ onboarding_completed: true })
          .eq("id", account.id);
      }
    } else {
      const displayName =
        account.display_name || user.email?.split("@")[0] || "Family";
      const slug = await generateUniqueSlugFromName(db, displayName);

      const { data: newProfile, error: profileError } = await db
        .from("business_profiles")
        .insert({
          account_id: account.id,
          slug,
          type: "family",
          category: null,
          display_name: displayName,
          care_types: [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "user_created",
          metadata: {
            // Store session_id for cleanup when account is deleted
            enrichment_session_id: sessionId || null,
          },
        })
        .select("id")
        .single();

      if (profileError) {
        console.error("Failed to create family profile:", profileError);
        return NextResponse.json(
          { error: "Failed to create your profile." },
          { status: 500 }
        );
      }

      fromProfileId = newProfile.id;

      // Set as active profile if user doesn't have one
      if (!account.active_profile_id) {
        await db
          .from("accounts")
          .update({
            active_profile_id: newProfile.id,
            onboarding_completed: true,
          })
          .eq("id", account.id);
      }
    }

    // 3. Ensure target provider exists in business_profiles
    let toProfileId: string;

    // Check if providerId is a valid UUID (business_profiles record)
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        providerId
      );

    if (isUUID) {
      // Verify it exists
      const { data: existing } = await db
        .from("business_profiles")
        .select("id")
        .eq("id", providerId)
        .single();

      if (existing) {
        toProfileId = existing.id;
      } else {
        return NextResponse.json(
          { error: "Provider not found." },
          { status: 404 }
        );
      }
    } else {
      // iOS provider — look up by source_provider_id or create
      const { data: existing } = await db
        .from("business_profiles")
        .select("id")
        .eq("source_provider_id", providerId)
        .limit(1)
        .single();

      if (existing) {
        toProfileId = existing.id;
      } else {
        // Look up in olera-providers to get full data
        let providerCity: string | null = null;
        let providerState: string | null = null;
        let providerPhone: string | null = null;
        let providerCategory: string | null = null;
        let providerImageUrl: string | null = null;
        let providerCareTypes: string[] = [];

        const { data: iosProvider } = await db
          .from("olera-providers")
          .select(
            "provider_name, provider_category, main_category, city, state, phone, provider_logo, provider_images"
          )
          .eq("provider_id", providerId)
          .single();

        if (iosProvider) {
          providerCity = iosProvider.city;
          providerState = iosProvider.state;
          providerPhone = iosProvider.phone;
          providerCategory = iosProvider.provider_category;
          providerImageUrl = iosProvider.provider_logo
            || (iosProvider.provider_images as string | null)?.split(" | ")?.[0]
            || null;
          providerCareTypes = [iosProvider.provider_category];
          if (
            iosProvider.main_category &&
            iosProvider.main_category !== iosProvider.provider_category
          ) {
            providerCareTypes.push(iosProvider.main_category);
          }
        }

        const { data: newProvider, error: providerError } = await db
          .from("business_profiles")
          .insert({
            source_provider_id: providerId,
            slug: providerSlug || providerId,
            type: "organization",
            category: providerCategory,
            display_name: providerName,
            phone: providerPhone,
            city: providerCity,
            state: providerState,
            image_url: providerImageUrl,
            care_types: providerCareTypes,
            claim_state: "unclaimed",
            verification_state: "unverified",
            source: "seeded",
            is_active: true,
            metadata: {},
          })
          .select("id")
          .single();

        if (providerError) {
          // Handle race condition — another request may have created it
          if (providerError.code === "23505") {
            const { data: raceProvider } = await db
              .from("business_profiles")
              .select("id")
              .eq("source_provider_id", providerId)
              .limit(1)
              .single();

            if (raceProvider) {
              toProfileId = raceProvider.id;
            } else {
              console.error(
                "Failed to create provider profile:",
                providerError
              );
              return NextResponse.json(
                { error: "Failed to register provider." },
                { status: 500 }
              );
            }
          } else {
            console.error(
              "Failed to create provider profile:",
              providerError
            );
            return NextResponse.json(
              { error: "Failed to register provider." },
              { status: 500 }
            );
          }
        } else {
          toProfileId = newProvider.id;
        }
      }
    }

    // 3b. "Next best option" (lib/connections/next-best-option.server.ts): the
    // family just answered the qualifying questions for another provider, so
    // carry those answers over instead of sending this provider a blank lead.
    // Only from an inquiry this same family sent; anything else is ignored and
    // the request proceeds as an ordinary one.
    let carriedFrom: string | null = null;
    let carriedFromProviderId: string | null = null;
    let carried: Record<string, unknown> = {};
    // The managed-ads cookie names a campaign, not a provider, and it was set
    // by the page the family is still on: the FIRST provider's page. Kept, it
    // would credit this second provider's inquiry to that provider's Ad Boost
    // campaign and fire its ad conversion. This family came from our offer.
    if (entryPoint === "next_best_option") managedUtm = {};
    if (entryPoint === "next_best_option" && fromConnectionId) {
      const { data: original } = await db
        .from("connections")
        .select("id, from_profile_id, to_profile_id, type, message")
        .eq("id", fromConnectionId)
        .maybeSingle();
      if (original && original.from_profile_id === fromProfileId && original.type === "inquiry") {
        carriedFrom = original.id;
        carriedFromProviderId = original.to_profile_id as string;
        try {
          const parsed = JSON.parse(original.message || "{}");
          if (parsed && typeof parsed === "object") carried = parsed as Record<string, unknown>;
        } catch {
          carried = {};
        }
      }
    }

    // 4. Check for existing active connection (prevent duplicates)
    // Only pending/accepted connections block reconnection.
    // Expired (withdrawn/ended) and declined connections allow a fresh request.
    const { data: existingConnection } = await db
      .from("connections")
      .select("id, created_at")
      .eq("from_profile_id", fromProfileId)
      .eq("to_profile_id", toProfileId)
      .eq("type", "inquiry")
      .in("status", ["pending", "accepted"])
      .limit(1)
      .single();

    if (existingConnection) {
      return NextResponse.json({
        status: "duplicate",
        connectionId: existingConnection.id,
        created_at: existingConnection.created_at,
      });
    }

    // 5. Look up provider info for summary card and notifications
    let providerEmail: string | null = null;
    let providerDisplayName: string | null = null;
    let providerCity: string | null = null;
    let providerState: string | null = null;
    let providerCategoryAuth: string | null = null;
    let providerLeadsUnsubscribedAuth = false;
    try {
      const { data: bp } = await db
        .from("business_profiles")
        .select("email, display_name, city, state, category, metadata, source_provider_id")
        .eq("id", toProfileId)
        .single();
      providerEmail = bp?.email || null;
      providerDisplayName = bp?.display_name || null;
      providerCity = bp?.city || null;
      providerCategoryAuth = bp?.category || null;
      providerState = bp?.state || null;
      const bpMeta = (bp?.metadata as Record<string, unknown>) || {};
      providerLeadsUnsubscribedAuth = !!bpMeta.leads_unsubscribed;

      // Fallback to olera-providers for email and location
      // Use source_provider_id if available (correct link), otherwise fall back to providerId
      const iosLookupId = bp?.source_provider_id || providerId;
      if ((!providerEmail || !providerCity) && iosLookupId) {
        const { data: ios } = await db
          .from("olera-providers")
          .select("email, city, state")
          .eq("provider_id", iosLookupId)
          .maybeSingle();
        providerEmail = providerEmail || ios?.email || null;
        providerCity = providerCity || ios?.city || null;
        providerState = providerState || ios?.state || null;
      }
    } catch {
      // Non-blocking
    }

    // 6. Get seeker's profile data for richer summary card
    let seekerPhone: string | null = null;
    let seekerCareTypes: string[] = [];
    let seekerRelationship: string | null = null;
    let seekerTimeline: string | null = null;
    try {
      const { data: familyProfile } = await db
        .from("business_profiles")
        .select("phone, care_types, metadata")
        .eq("id", fromProfileId)
        .single();

      seekerPhone = familyProfile?.phone || null;
      seekerCareTypes = familyProfile?.care_types || [];
      const familyMeta = (familyProfile?.metadata || {}) as Record<string, string | undefined>;
      seekerRelationship = familyMeta.relationship_to_recipient || null;
      seekerTimeline = familyMeta.timeline || null;
    } catch {
      // Non-blocking
    }

    // Build message payload with all available seeker info
    const seekerName = account.display_name || user.email?.split("@")[0] || "";
    const nameParts = seekerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Build location string for summary
    const locationStr = [providerCity, providerState].filter(Boolean).join(", ");

    // Resolve care details: prefer intent data, fall back to profile data
    const careRecipient = intentData?.careRecipient || seekerRelationship;
    const careType = intentData?.careType || (seekerCareTypes.length > 0 ? seekerCareTypes[0] : null);
    const urgency = intentData?.urgency || seekerTimeline;

    const messageFields: Record<string, unknown> = {
      // Seeker identity (always available)
      seeker_name: seekerName,
      seeker_first_name: firstName,
      seeker_last_name: lastName,
      seeker_email: user.email || "",
      seeker_phone: seekerPhone,
      // Location context (from provider)
      looking_in_city: providerCity,
      looking_in_state: providerState,
      // Custom message from form
      message: intentData?.additionalNotes || null,
      // Care details (from intent or profile)
      care_recipient: careRecipient,
      care_type: careType,
      care_type_other: intentData?.careTypeOtherText || null,
      urgency: urgency,
      // Legacy field for backward compatibility
      additional_notes: intentData?.additionalNotes || null,
      contact_preference: null,
    };
    // Fill what this request left blank from the inquiry it follows (3b).
    // Location stays this provider's: the family is looking near them.
    for (const key of [
      "seeker_phone", "care_recipient", "care_type", "care_type_other", "urgency",
      "payment_method", "care_need", "message", "additional_notes", "contact_preference",
    ]) {
      const have = messageFields[key];
      const prior = carried[key];
      if ((have === null || have === undefined || have === "") && prior !== null && prior !== undefined && prior !== "") {
        messageFields[key] = prior;
      }
    }
    const messagePayload = JSON.stringify(messageFields);

    // 7. Build auto-intro message
    let autoIntro: string;
    if (intentData?.additionalNotes) {
      // User wrote a custom message - use it
      autoIntro = intentData.additionalNotes;
    } else {
      // Try to build from profile data using existing function
      const generatedIntro = buildIntroMessage(
        seekerCareTypes,
        [], // provider care types not needed for this
        seekerRelationship || undefined,
        seekerTimeline || undefined,
        careType,
        careRecipient,
        urgency,
      );
      // If buildIntroMessage returns generic fallback, use location-based intro instead
      if (generatedIntro === "Hi, I'd love to learn more about your services." && locationStr) {
        autoIntro = `${firstName} is interested in care services in ${locationStr}.`;
      } else {
        autoIntro = generatedIntro;
      }
    }

    // 8. Build connection metadata with auto-intro
    const connectionMetadata: Record<string, unknown> = {};
    connectionMetadata.auto_intro = autoIntro;
    if (!providerEmail) connectionMetadata.needs_provider_email = true;
    if (ctaVariant) connectionMetadata.cta_variant = ctaVariant;
    if (entryPoint) connectionMetadata.entry_point = entryPoint;
    if (sessionId) connectionMetadata.session_id = sessionId;
    if (visitId) connectionMetadata.visit_id = visitId;
    if (carriedFrom) {
      connectionMetadata.source = "next_best_option";
      connectionMetadata.from_connection_id = carriedFrom;
    }

    // Thread starts empty - provider must send the first real message
    connectionMetadata.thread = [];

    // Check if this is the provider's first lead (before insert)
    const { count: existingLeadCountAuth } = await db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("to_profile_id", toProfileId)
      .eq("type", "inquiry");
    const isFirstLeadAuth = existingLeadCountAuth === 0;

    // 8. Insert connection
    const { data: newConnection, error: insertError } = await db
      .from("connections")
      .insert({
        from_profile_id: fromProfileId,
        to_profile_id: toProfileId,
        type: "inquiry",
        status: "pending",
        message: messagePayload,
        metadata: connectionMetadata,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert connection:", insertError);
      return NextResponse.json(
        { error: "Failed to send request." },
        { status: 500 }
      );
    }

    // Log family engagement event (fire-and-forget)
    db.from("seeker_activity").insert({
      profile_id: fromProfileId,
      event_type: "connection_sent",
      related_provider_id: providerId,
      metadata: {
        connection_id: newConnection.id,
        care_type: intentData?.careType || null,
        timeline: intentData?.urgency || null,
        guest: false,
        provider_name: providerName || null,
        provider_slug: providerSlug || null,
      },
    }).then(({ error: actErr }: { error: { message: string } | null }) => {
      if (actErr) console.error("[seeker_activity] connection_sent insert failed:", actErr);
    });

    await markAdsLeadConversion();
    void recordProviderEvent({
      // Slug, not internal id — keeps row aggregatable with page_view (URL slug).
      provider_id: providerSlug || providerId,
      event_type: "lead_received",
      profile_id: toProfileId,
      metadata: {
        connection_id: newConnection.id,
        care_type: intentData?.careType || null,
        timeline: intentData?.urgency || null,
        guest: false,
        raw_provider_id: providerId,
        // session_id makes leads joinable back to arm impressions in
        // seeker_activity / provider_activity for cannibalization analysis.
        session_id: sessionId || null,
        visit_id: visitId || sessionId || null,
        subject_id: fromProfileId,
        // cta_variant for CTA A/B testing attribution
        // Default to "legacy" only for CTA-based conversions (no entry_point)
        // Lead Capture conversions have entry_point and shouldn't be attributed to a CTA variant
        cta_variant: entryPoint ? (ctaVariant || null) : (ctaVariant || "legacy"),
        // entry_point for Lead Capture attribution (custom_quote, book_consultation, message_host)
        entry_point: entryPoint || null,
        // Managed-ads campaign attribution (utm_source/utm_campaign) — the signal
        // behind Ad Boost "families delivered". See lib/ad-boost/managed-utm.
        ...managedUtmMetadata(managedUtm),
      },
    });

    // 9. Confirmation email to the family (fire-and-forget)
    try {
      if (user.email) {
        const connSentEmailLogId = await reserveEmailLogId({
          to: user.email,
          subject: `Your inquiry to ${providerName} was sent`,
          emailType: "connection_sent",
          recipientType: "family",
          providerId: toProfileId,
          metadata: { connection_id: newConnection.id },
        });

        const careTypeMap0: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };

        const inboxUrl = appendTrackingParams(
          `${getSiteUrl()}/portal/inbox?id=${newConnection.id}`,
          connSentEmailLogId
        );

        await sendEmail({
          to: user.email,
          subject: `Your inquiry to ${providerName} was sent`,
          html: connectionSentEmail({
            familyName: firstName || "there",
            providerName,
            careType: intentData?.careType ? (careTypeMap0[intentData.careType] || intentData.careType) : null,
            viewUrl: inboxUrl,
          }),
          emailType: 'connection_sent',
          recipientType: 'family',
          providerId: toProfileId,
          emailLogId: connSentEmailLogId ?? undefined,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send connection confirmation email:", emailErr);
    }

    // 9b. Provider notifications are HELD, not sent here. Same reasoning as the
    // guest path above: the qualifying flow has not run yet. Released by the
    // family finishing enrichment or by the 10 minute ceiling.
    // See lib/leads/provider-notifications.server.ts.
    await holdProviderLeadNotifications({
      connectionId: newConnection.id,
      managedUtm: managedUtm || null,
      isFirstLead: isFirstLeadAuth,
    });
    // A next-best-option request already carries the family's answers (3b):
    // there is no enrichment step coming to release it, so release it now
    // rather than making this provider wait for the ten-minute ceiling.
    if (carriedFrom) {
      await sendProviderLeadNotifications({ connectionId: newConnection.id, releasedBy: "enrichment" }).catch((err) =>
        console.error("[connections/request] next-best-option release failed", err),
      );
      // The funnel's last step, and a line in #notifications (TJ, 6 Oct): the
      // offer only matters if families take it, so every take is visible.
      await stampNextBestOption(db, carriedFrom, {
        sent_at: new Date().toISOString(),
        sent_connection_id: newConnection.id,
      });
      try {
        const { data: first } = carriedFromProviderId
          ? await db.from("business_profiles").select("display_name").eq("id", carriedFromProviderId).maybeSingle()
          : { data: null };
        const who = (typeof carried.seeker_first_name === "string" && carried.seeker_first_name) || "A family";
        await sendSlackAlert(
          `↪️ Next best option taken: ${who} asked ${first?.display_name ?? "a provider"}, then sent their request to ${providerName} from our offer. Both have their details. ${getSiteUrl()}/admin/relationships/families/${fromProfileId}`,
        );
      } catch (err) {
        console.error("[connections/request] next-best-option alert failed", err);
      }
    }

    // 9d-ii. WhatsApp enrichment conversation to seeker (fire-and-forget)
    try {
      const seekerNorm = seekerPhone ? normalizeUSPhone(seekerPhone) : null;
      if (seekerNorm) {
        const { data: seekerBpAuth } = await db
          .from("business_profiles")
          .select("metadata")
          .eq("id", fromProfileId)
          .single();
        const seekerMetaAuth = (seekerBpAuth?.metadata || {}) as Record<string, unknown>;
        if (seekerMetaAuth.whatsapp_opted_in) {
          await startSeekerConversation({
            connectionId: newConnection.id,
            profileId: fromProfileId,
            phone: seekerNorm,
            seekerFirstName: firstName || "there",
            providerName: providerDisplayName || providerName,
            providerCategory: providerCategoryAuth,
            city: providerCity,
            state: providerState,
          });
        }
      }
    } catch (seekerWaErr) {
      console.error("[whatsapp] Seeker enrichment conversation failed:", seekerWaErr);
    }

    // 9e. Slack alert for new lead (fire-and-forget)
    try {
      const careTypeMap2: Record<string, string> = {
        home_care: "Home Care",
        home_health: "Home Health Care",
        assisted_living: "Assisted Living",
        memory_care: "Memory Care",
      };
      const alert = slackNewLead({
        familyName: account.display_name || "A family",
        providerName: providerName,
        careType: intentData?.careType ? (careTypeMap2[intentData.careType] || intentData.careType) : null,
        adCampaign: managedUtm?.utmCampaign ?? null,
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // Non-blocking
    }

    // 9f. Slack alert for missing provider email (fire-and-forget)
    if (!providerEmail) {
      try {
        const careTypeMap3: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };
        const missingAlert = slackMissingEmail({
          familyName: account.display_name || "A family",
          providerName,
          providerId,
          careType: intentData?.careType ? (careTypeMap3[intentData.careType] || intentData.careType) : null,
        });
        await sendSlackAlert(missingAlert.text, missingAlert.blocks);
      } catch {
        // Non-blocking
      }
    }

    // 9f. Loops: new lead event (fire-and-forget)
    try {
      await sendLoopsEvent({
        email: user.email || "",
        eventName: "new_lead",
        audience: "seeker",
        eventProperties: {
          providerName,
          careType: intentData?.careType || "",
          urgency: intentData?.urgency || "",
        },
      });
    } catch {
      // Non-blocking
    }

    // 10. Sync intent data back to user's family profile
    if (intentData) {
      try {
        await syncIntentToProfile(db, fromProfileId, {
          careRecipient: intentData.careRecipient,
          careType: intentData.careType,
          urgency: intentData.urgency,
          additionalNotes: intentData.additionalNotes,
          providerCity,
          providerState,
          providerCategory: providerCategoryAuth,
        }, user.email);
      } catch (syncErr) {
        // Non-blocking — connection was created, profile sync is best-effort
        console.error("Failed to sync intent to profile:", syncErr);
      }
    }

    return NextResponse.json({
      status: "created",
      connectionId: newConnection?.id ?? null,
    });
  } catch (err) {
    console.error("Connection request error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
