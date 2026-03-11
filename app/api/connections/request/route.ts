import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { buildIntroMessage } from "@/lib/build-intro-message";
import { sendEmail } from "@/lib/email";
import { connectionRequestEmail, connectionSentEmail } from "@/lib/email-templates";
import { sendSlackAlert, slackNewLead, slackMissingEmail } from "@/lib/slack";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { sendLoopsEvent } from "@/lib/loops";

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

  // Find or create placeholder profile for this guest email
  let fromProfileId: string;
  let claimToken: string;

  const { data: existingProfile } = await db
    .from("business_profiles")
    .select("id, claim_token")
    .eq("email", normalizedEmail)
    .is("account_id", null)
    .eq("type", "family")
    .limit(1)
    .single();

  if (existingProfile) {
    fromProfileId = existingProfile.id;
    claimToken = existingProfile.claim_token;
  } else {
    // Create placeholder profile
    const displayName = normalizedEmail.split("@")[0] || "Guest";
    const slug = generateSlug(displayName);

    const { data: newProfile, error: profileError } = await db
      .from("business_profiles")
      .insert({
        account_id: null, // Placeholder — no account yet
        email: normalizedEmail,
        slug,
        type: "family",
        category: null,
        display_name: displayName,
        care_types: [],
        claim_state: "unclaimed",
        verification_state: "unverified",
        source: "guest_connection",
        metadata: {
          relationship_to_recipient: intentData.careRecipient
            ? { self: "Myself", parent: "My parent", spouse: "My spouse", other: "Someone else" }[intentData.careRecipient]
            : null,
          timeline: intentData.urgency
            ? { asap: "immediate", within_month: "within_1_month", few_months: "within_3_months", researching: "exploring" }[intentData.urgency]
            : null,
        },
      })
      .select("id, claim_token")
      .single();

    if (profileError) {
      console.error("Failed to create guest profile:", profileError);
      return NextResponse.json(
        { error: "Failed to create your profile." },
        { status: 500 }
      );
    }

    fromProfileId = newProfile.id;
    claimToken = newProfile.claim_token;
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
      claimToken,
    });
  }

  // Build message payload
  const firstName = normalizedEmail.split("@")[0] || "";

  const messagePayload = JSON.stringify({
    care_recipient: intentData?.careRecipient || null,
    care_type: intentData?.careType || null,
    care_type_other: intentData?.careTypeOtherText || null,
    urgency: intentData?.urgency || null,
    additional_notes: intentData?.additionalNotes || null,
    contact_preference: null,
    seeker_phone: null,
    seeker_email: normalizedEmail,
    seeker_first_name: firstName,
    seeker_last_name: "",
  });

  // Look up provider info for notifications
  let providerEmail: string | null = null;
  let providerDisplayName: string | null = null;
  try {
    const { data: bp } = await db
      .from("business_profiles")
      .select("email, display_name")
      .eq("id", toProfileId)
      .single();
    providerEmail = bp?.email || null;
    providerDisplayName = bp?.display_name || null;

    if (!providerEmail) {
      const { data: ios } = await db
        .from("olera-providers")
        .select("email")
        .eq("provider_id", providerId)
        .single();
      providerEmail = ios?.email || null;
    }
  } catch {
    // Non-blocking
  }

  // Build connection metadata
  const connectionMetadata: Record<string, unknown> = {};
  if (!providerEmail) connectionMetadata.needs_provider_email = true;

  // Auto-reply from provider
  connectionMetadata.thread = [
    {
      from_profile_id: toProfileId,
      text: `Hello ${firstName || "there"}, thank you for reaching out. We're reviewing your request and will get back to you shortly. In the meantime, feel free to share any additional details.`,
      created_at: new Date().toISOString(),
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

  // Send magic link via Supabase (fire-and-forget)
  try {
    const { createClient: createAdminAuthClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

    if (url && serviceKey) {
      const authClient = createAdminAuthClient(url, serviceKey);
      await authClient.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${siteUrl}/portal/inbox?id=${newConnection.id}`,
        },
      });
    }
  } catch (magicLinkErr) {
    console.error("Failed to send magic link:", magicLinkErr);
    // Non-blocking — connection was created
  }

  // Send confirmation email to guest (fire-and-forget)
  try {
    const careTypeMap: Record<string, string> = {
      home_care: "Home Care",
      home_health: "Home Health Care",
      assisted_living: "Assisted Living",
      memory_care: "Memory Care",
    };

    await sendEmail({
      to: normalizedEmail,
      subject: `Your inquiry to ${providerName} was sent`,
      html: connectionSentEmail({
        familyName: firstName || "there",
        providerName,
        careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
        viewUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/portal/inbox?id=${newConnection.id}`,
      }),
    });
  } catch (emailErr) {
    console.error("Failed to send guest confirmation email:", emailErr);
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

      await sendEmail({
        to: providerEmail,
        subject: `New care inquiry from ${firstName || "a family"} on Olera`,
        html: connectionRequestEmail({
          providerName: providerDisplayName || providerName,
          familyName: firstName || "A family",
          careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
          message: intentData?.additionalNotes || null,
          viewUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/provider/connections`,
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
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
        await sendSMS({
          to: normalized,
          body: `New care inquiry on Olera from ${firstName || "a family"}. View and respond: ${siteUrl}/provider/connections`,
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

  return NextResponse.json({
    status: "created",
    connectionId: newConnection.id,
    created_at: newConnection.created_at,
    claimToken,
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
      const slug = generateSlug(displayName);

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

    // 5. Build message payload
    const nameParts = (account.display_name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const messagePayload = JSON.stringify({
      care_recipient: intentData?.careRecipient || null,
      care_type: intentData?.careType || null,
      care_type_other: intentData?.careTypeOtherText || null,
      urgency: intentData?.urgency || null,
      additional_notes: intentData?.additionalNotes || null,
      contact_preference: null,
      seeker_phone: null,
      seeker_email: user.email || "",
      seeker_first_name: firstName,
      seeker_last_name: lastName,
    });

    // 6a. Look up provider email (used for metadata flag + notification)
    let providerEmail: string | null = null;
    let providerDisplayName: string | null = null;
    try {
      const { data: bp } = await db
        .from("business_profiles")
        .select("email, display_name")
        .eq("id", toProfileId)
        .single();
      providerEmail = bp?.email || null;
      providerDisplayName = bp?.display_name || null;

      if (!providerEmail) {
        const { data: ios } = await db
          .from("olera-providers")
          .select("email")
          .eq("provider_id", providerId)
          .single();
        providerEmail = ios?.email || null;
      }
    } catch {
      // Non-blocking
    }

    // 6. Build auto-intro message from profile + intent data
    let autoIntro: string | null = null;
    try {
      const [{ data: familyProfile }, { data: providerProfile }] = await Promise.all([
        db.from("business_profiles").select("care_types, metadata").eq("id", fromProfileId).single(),
        db.from("business_profiles").select("care_types").eq("id", toProfileId).single(),
      ]);

      const familyMeta = (familyProfile?.metadata || {}) as Record<string, string | undefined>;
      autoIntro = buildIntroMessage(
        familyProfile?.care_types || [],
        providerProfile?.care_types || [],
        familyMeta.relationship_to_recipient,
        familyMeta.timeline,
        intentData?.careType,
        intentData?.careRecipient,
        intentData?.urgency,
      );
    } catch {
      // Non-blocking — connection creation should not fail if intro generation fails
    }

    // 7. Build connection metadata with auto-intro and provider auto-reply
    const connectionMetadata: Record<string, unknown> = {};
    if (autoIntro) connectionMetadata.auto_intro = autoIntro;
    if (!providerEmail) connectionMetadata.needs_provider_email = true;

    // Seed an automatic reply from the provider so the seeker has an
    // unread message in their inbox immediately after connecting.
    connectionMetadata.thread = [
      {
        from_profile_id: toProfileId,
        text: `Hello ${firstName || "there"}, thank you for reaching out. We're reviewing your request and will get back to you shortly. In the meantime, feel free to share any additional details.`,
        created_at: new Date().toISOString(),
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
            viewUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/provider/connections`,
          }),
        });
      }
    } catch (emailErr) {
      console.error("Failed to send connection confirmation email:", emailErr);
    }

    // 9b. Email notification to provider (fire-and-forget)
    try {
      if (providerEmail) {
        const careTypeMap: Record<string, string> = {
          home_care: "Home Care",
          home_health: "Home Health Care",
          assisted_living: "Assisted Living",
          memory_care: "Memory Care",
        };

        await sendEmail({
          to: providerEmail,
          subject: `New care inquiry from ${firstName || "a family"} on Olera`,
          html: connectionRequestEmail({
            providerName: providerDisplayName || providerName,
            familyName: account.display_name || "A family",
            careType: intentData?.careType ? (careTypeMap[intentData.careType] || intentData.careType) : null,
            message: intentData?.additionalNotes || null,
            viewUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care"}/provider/connections`,
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
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
          const result = await sendSMS({
            to: normalized,
            body: `New care inquiry on Olera from ${firstName || "a family"}. View and respond: ${siteUrl}/provider/connections`,
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
        const { data: currentProfile } = await db
          .from("business_profiles")
          .select("metadata, care_types")
          .eq("id", fromProfileId)
          .single();

        if (currentProfile) {
          const currentMeta = (currentProfile.metadata || {}) as Record<string, unknown>;
          const currentCareTypes: string[] = currentProfile.care_types || [];
          const updates: Record<string, unknown> = {};

          // Map CTA recipient → profile relationship_to_recipient
          const recipientMap: Record<string, string> = {
            self: "Myself",
            parent: "My parent",
            spouse: "My spouse",
            other: "Someone else",
          };
          if (intentData.careRecipient && recipientMap[intentData.careRecipient]) {
            currentMeta.relationship_to_recipient = recipientMap[intentData.careRecipient];
          }

          // Map CTA urgency → profile timeline
          const timelineMap: Record<string, string> = {
            asap: "immediate",
            within_month: "within_1_month",
            few_months: "within_3_months",
            researching: "exploring",
          };
          if (intentData.urgency && timelineMap[intentData.urgency]) {
            currentMeta.timeline = timelineMap[intentData.urgency];
          }

          updates.metadata = currentMeta;

          // Map CTA careType → profile care_types display name
          const careTypeMap: Record<string, string> = {
            home_care: "Home Care",
            home_health: "Home Health Care",
            assisted_living: "Assisted Living",
            memory_care: "Memory Care",
          };
          if (intentData.careType && careTypeMap[intentData.careType]) {
            const displayName = careTypeMap[intentData.careType];
            if (!currentCareTypes.includes(displayName)) {
              updates.care_types = [...currentCareTypes, displayName];
            }
          }

          await db
            .from("business_profiles")
            .update(updates)
            .eq("id", fromProfileId);
        }
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
