import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { buildIntroMessage } from "@/lib/build-intro-message";
import { sendEmail } from "@/lib/email";
import { connectionRequestEmail, connectionSentEmail, guestConnectionEmail, verifyEmailEmail } from "@/lib/email-templates";
import { sendSlackAlert, slackNewLead, slackMissingEmail } from "@/lib/slack";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { sendLoopsEvent } from "@/lib/loops";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { syncIntentToProfile, recipientMap, timelineMap, careTypeMap } from "@/lib/sync-intent-to-profile";

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
  admin,
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
  const displayName = guestFullName?.trim() || normalizedEmail.split("@")[0] || "Guest";

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

        // Generate magic link token and verify server-side for instant session
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

          // Verify server-side to get session tokens
          try {
            const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
              token_hash: linkData.properties.hashed_token,
              type: "magiclink",
            });

            if (!verifyError && verifyData?.session) {
              accessToken = verifyData.session.access_token;
              refreshToken = verifyData.session.refresh_token;
              console.log("[guest-connection] Server-side session created for existing user:", normalizedEmail);
            } else {
              console.warn("[guest-connection] Server-side verify failed for existing user:", verifyError?.message);
            }
          } catch (verifyErr) {
            console.error("[guest-connection] Server-side verify error for existing user:", verifyErr);
          }
        }
      } else {
        // Edge case: auth user exists but no profile in our DB
        // Generate magic link and verify server-side for instant session
        const { data: linkData, error: linkError } = await authClient.auth.admin.generateLink({
          type: "magiclink",
          email: normalizedEmail,
          options: {
            redirectTo: `${siteUrl}/welcome`,
          },
        });

        if (linkError) {
          console.error("Failed to generate link for existing user:", linkError);
          return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
        }

        tokenHash = linkData?.properties?.hashed_token || null;
        actionLink = linkData?.properties?.action_link || null;
        userId = ""; // We don't have easy access to the user ID here

        // Verify server-side to get session tokens
        if (linkData?.properties?.hashed_token) {
          try {
            const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
              token_hash: linkData.properties.hashed_token,
              type: "magiclink",
            });

            if (!verifyError && verifyData?.session) {
              accessToken = verifyData.session.access_token;
              refreshToken = verifyData.session.refresh_token;
              userId = verifyData.session.user?.id || "";
              console.log("[guest-connection] Server-side session created for auth-only user:", normalizedEmail);
            } else {
              console.warn("[guest-connection] Server-side verify failed for auth-only user:", verifyError?.message);
            }
          } catch (verifyErr) {
            console.error("[guest-connection] Server-side verify error for auth-only user:", verifyErr);
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

  // Sync intent data to profile
  try {
    await syncIntentToProfile(db, fromProfileId, {
      careRecipient: intentData.careRecipient,
      careType: intentData.careType,
      urgency: intentData.urgency,
      additionalNotes: intentData.additionalNotes,
    });
  } catch (syncErr) {
    console.error("Failed to sync intent to profile:", syncErr);
  }

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
      providerSlug,
    });
  }

  // Look up provider info for summary card and notifications
  let providerEmail: string | null = null;
  let providerDisplayName: string | null = null;
  let providerCity: string | null = null;
  let providerState: string | null = null;
  try {
    const { data: bp } = await db
      .from("business_profiles")
      .select("email, display_name, city, state")
      .eq("id", toProfileId)
      .single();
    providerEmail = bp?.email || null;
    providerDisplayName = bp?.display_name || null;
    providerCity = bp?.city || null;
    providerState = bp?.state || null;

    // Fallback to olera-providers for email and location
    if (!providerEmail || !providerCity) {
      const { data: ios } = await db
        .from("olera-providers")
        .select("email, city, state")
        .eq("provider_id", providerId)
        .single();
      providerEmail = providerEmail || ios?.email || null;
      providerCity = providerCity || ios?.city || null;
      providerState = providerState || ios?.state || null;
    }
  } catch {
    // Non-blocking
  }

  // Build message payload with all available seeker info
  const seekerName = guestFullName?.trim() || displayName;
  const nameParts = seekerName.split(/\s+/);
  const firstName = nameParts[0] || normalizedEmail.split("@")[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
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
    autoIntro = `${firstName} is interested in care services in ${locationStr}.`;
  } else {
    // Fallback
    autoIntro = `${firstName} is interested in learning more about your services.`;
  }

  // Build connection metadata
  const connectionMetadata: Record<string, unknown> = {};
  connectionMetadata.auto_intro = autoIntro;
  if (!providerEmail) connectionMetadata.needs_provider_email = true;

  // Auto-reply from provider (marked as auto to exclude from unread reminders)
  connectionMetadata.thread = [
    {
      from_profile_id: toProfileId,
      text: `Hello ${firstName || "there"}, thank you for reaching out. We're reviewing your request and will get back to you shortly. In the meantime, feel free to share any additional details.`,
      created_at: new Date().toISOString(),
      is_auto_reply: true,
    },
  ];

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

  // Send "Verify your email" email (user already has instant session via tokenHash)
  try {
    // Generate a verification link for the email
    const { data: verifyLinkData, error: verifyLinkError } = await authClient.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent("/portal/inbox")}&verify=true`,
      },
    });

    if (!verifyLinkError && verifyLinkData?.properties?.action_link) {
      await sendEmail({
        to: normalizedEmail,
        subject: `Verify your email — Olera`,
        html: verifyEmailEmail({
          familyName: firstName || "there",
          providerName,
          verifyUrl: verifyLinkData.properties.action_link,
        }),
      });
    }
  } catch (emailErr) {
    console.error("Failed to send verify email:", emailErr);
    // Non-blocking — user has instant session, verification is optional
  }

  // Provider notifications (fire-and-forget)
  try {
    if (providerEmail) {
      const careTypeMap: Record<string, string> = {
        home_care: "Home Care",
        home_health: "Home Health Care",
        assisted_living: "Assisted Living",
        memory_care: "Memory Care",
      };

      // Generate magic link for provider one-click sign-in
      const siteUrl = getSiteUrl();
      const redirectPath = `/provider/welcome?action=lead&id=${newConnection.id}`;
      // Fallback: direct to welcome page (handles both claimed and unclaimed providers)
      let viewUrl = `${siteUrl}${redirectPath}`;

      try {
        const { data: providerLinkData, error: providerLinkError } = await authClient.auth.admin.generateLink({
          type: "magiclink",
          email: providerEmail,
          options: {
            redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(redirectPath)}`,
          },
        });
        if (!providerLinkError && providerLinkData?.properties?.action_link) {
          viewUrl = providerLinkData.properties.action_link;
        }
      } catch (linkErr) {
        console.error("Failed to generate provider magic link:", linkErr);
        // Continue with fallback URL (welcome page)
      }

      await sendEmail({
        to: providerEmail,
        subject: `A family is looking for care from ${providerDisplayName || providerName}`,
        html: connectionRequestEmail({
          providerName: providerDisplayName || providerName,
          familyName: firstName || "A family",
          careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
          message: intentData?.additionalNotes || null,
          viewUrl,
          providerSlug: providerSlug || undefined,
        }),
      });
    }
  } catch (emailErr) {
    console.error("Failed to send provider email:", emailErr);
  }

  // SMS notification to provider
  try {
    let providerPhone: string | null = null;
    const { data: bpPhone } = await db
      .from("business_profiles")
      .select("phone")
      .eq("id", toProfileId)
      .single();
    providerPhone = bpPhone?.phone || null;

    if (!providerPhone) {
      const { data: iosPhone } = await db
        .from("olera-providers")
        .select("phone")
        .eq("provider_id", providerId)
        .single();
      providerPhone = iosPhone?.phone || null;
    }

    if (providerPhone) {
      const normalized = normalizeUSPhone(providerPhone);
      if (normalized) {
        await sendSMS({
          to: normalized,
          body: `New care inquiry on Olera from ${firstName || "a family"}. View and respond: ${getSiteUrl()}/provider/connections`,
        });
      }
    }
  } catch (smsErr) {
    console.error("[sms] Guest connection error:", smsErr);
  }

  // Slack alert
  try {
    const careTypeMap: Record<string, string> = {
      home_care: "Home Care",
      home_health: "Home Health Care",
      assisted_living: "Assisted Living",
      memory_care: "Memory Care",
    };
    const alert = slackNewLead({
      familyName: `${firstName || "Guest"} (guest)`,
      providerName,
      careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
    });
    await sendSlackAlert(alert.text, alert.blocks);
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
        familyName: `${firstName || "Guest"} (guest)`,
        providerName,
        providerId,
        careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
      });
      await sendSlackAlert(missingAlert.text, missingAlert.blocks);
    } catch {
      // Non-blocking
    }
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
    const {
      providerId,
      providerName,
      providerSlug,
      intentData,
      guest,
      guestEmail,
      formData,
      website, // Honeypot field
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

    // 2. Ensure user has a family profile
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
          metadata: {},
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
    try {
      const { data: bp } = await db
        .from("business_profiles")
        .select("email, display_name, city, state")
        .eq("id", toProfileId)
        .single();
      providerEmail = bp?.email || null;
      providerDisplayName = bp?.display_name || null;
      providerCity = bp?.city || null;
      providerState = bp?.state || null;

      // Fallback to olera-providers for email and location
      if (!providerEmail || !providerCity) {
        const { data: ios } = await db
          .from("olera-providers")
          .select("email, city, state")
          .eq("provider_id", providerId)
          .single();
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

    const messagePayload = JSON.stringify({
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
    });

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

    // 8. Build connection metadata with auto-intro and provider auto-reply
    const connectionMetadata: Record<string, unknown> = {};
    connectionMetadata.auto_intro = autoIntro;
    if (!providerEmail) connectionMetadata.needs_provider_email = true;

    // Seed an automatic reply from the provider so the seeker has an
    // unread message in their inbox immediately after connecting.
    // Marked as auto_reply to exclude from unread reminders cron.
    connectionMetadata.thread = [
      {
        from_profile_id: toProfileId,
        text: `Hello ${firstName || "there"}, thank you for reaching out. We're reviewing your request and will get back to you shortly. In the meantime, feel free to share any additional details.`,
        created_at: new Date().toISOString(),
        is_auto_reply: true,
      },
    ];

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

    // 9. Confirmation email to the family (fire-and-forget)
    try {
      if (user.email) {
        const careTypeMap0: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };

        await sendEmail({
          to: user.email,
          subject: `Your inquiry to ${providerName} was sent`,
          html: connectionSentEmail({
            familyName: firstName || "there",
            providerName,
            careType: intentData?.careType ? (careTypeMap0[intentData.careType] || intentData.careType) : null,
            viewUrl: `${getSiteUrl()}/portal/inbox?id=${newConnection.id}`,
          }),
        });
      }
    } catch (emailErr) {
      console.error("Failed to send connection confirmation email:", emailErr);
    }

    // 9b. Email notification to provider (fire-and-forget)
    try {
      if (providerEmail && admin) {
        const careTypeMap: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };

        // Generate magic link for provider one-click sign-in
        const siteUrl = getSiteUrl();
        const redirectPath = `/provider/welcome?action=lead&id=${newConnection.id}`;
        // Fallback: direct to welcome page (handles both claimed and unclaimed providers)
        let viewUrl = `${siteUrl}${redirectPath}`;

        try {
          const { data: providerLinkData, error: providerLinkError } = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: providerEmail,
            options: {
              redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(redirectPath)}`,
            },
          });
          if (!providerLinkError && providerLinkData?.properties?.action_link) {
            viewUrl = providerLinkData.properties.action_link;
          }
        } catch (linkErr) {
          console.error("Failed to generate provider magic link:", linkErr);
          // Continue with fallback URL (welcome page)
        }

        await sendEmail({
          to: providerEmail,
          subject: `A family is looking for care from ${providerDisplayName || providerName}`,
          html: connectionRequestEmail({
            providerName: providerDisplayName || providerName,
            familyName: account.display_name || "A family",
            careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
            message: intentData?.additionalNotes || null,
            viewUrl,
            providerSlug: providerSlug || undefined,
          }),
        });
      }
    } catch (emailErr) {
      // Non-blocking — connection was created, email is best-effort
      console.error("Failed to send connection request email:", emailErr);
    }

    // 9c. SMS notification to provider (fire-and-forget)
    try {
      // Use provider phone from business_profiles or olera-providers
      let providerPhone: string | null = null;
      const { data: bpPhone } = await db
        .from("business_profiles")
        .select("phone")
        .eq("id", toProfileId)
        .single();
      providerPhone = bpPhone?.phone || null;
      console.log("[sms] business_profiles phone:", providerPhone);

      if (!providerPhone) {
        const { data: iosPhone } = await db
          .from("olera-providers")
          .select("phone")
          .eq("provider_id", providerId)
          .single();
        providerPhone = iosPhone?.phone || null;
        console.log("[sms] olera-providers fallback phone:", providerPhone);
      }

      if (providerPhone) {
        const normalized = normalizeUSPhone(providerPhone);
        console.log("[sms] Normalized:", normalized, "from raw:", providerPhone);
        if (normalized) {
          const result = await sendSMS({
            to: normalized,
            body: `New care inquiry on Olera from ${firstName || "a family"}. View and respond: ${getSiteUrl()}/provider/connections`,
          });
          console.log("[sms] Send result:", JSON.stringify(result));
        } else {
          console.log("[sms] Phone normalization failed for:", providerPhone);
        }
      } else {
        console.log("[sms] No phone found for provider:", toProfileId);
      }
    } catch (smsErr) {
      console.error("[sms] Unexpected error:", smsErr);
    }

    // 9d. Slack alert for new lead (fire-and-forget)
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
      });
      await sendSlackAlert(alert.text, alert.blocks);
    } catch {
      // Non-blocking
    }

    // 9e. Slack alert for missing provider email (fire-and-forget)
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
        });
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
