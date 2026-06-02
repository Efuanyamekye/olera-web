import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSlackAlert, slackNewLead, slackGuideCtaConverted } from "@/lib/slack";
import { sendLoopsEvent } from "@/lib/loops";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { recordProviderEvent } from "@/lib/analytics/provider-events";

/**
 * POST /api/connections/guide-save
 *
 * Creates a connection to a single provider (for the guide CTA).
 * This is a simplified version of compare-save that:
 * 1. Creates an account silently
 * 2. Creates a connection to the provider
 * 3. Sends the PDF guide via email
 * 4. Returns session tokens for instant login
 * 5. Does NOT redirect — user stays on page
 */

const GUIDE_PDF_URL = "/olera-senior-care-guide-one-page.pdf";

interface RequestBody {
  email: string;
  provider: {
    id: string;
    slug: string;
    name: string;
  };
  sessionId?: string;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { email, provider, sessionId } = body;

    // Validation
    if (!email || !provider) {
      return NextResponse.json(
        { error: "Email and provider are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const db = getAdminClient();
    if (!db) {
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const siteUrl = getSiteUrl();

    // ═══════════════════════════════════════════════════════════════════════════
    // RATE LIMITING
    // ═══════════════════════════════════════════════════════════════════════════
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentConnections } = await db
      .from("connections")
      .select("id")
      .eq("guest_email", normalizedEmail)
      .gte("created_at", oneHourAgo);

    if (recentConnections && recentConnections.length >= 10) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK FOR PROVIDER EMAIL
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
          error: "This email is linked to a provider account. Please use a different email.",
          code: "PROVIDER_EMAIL",
        },
        { status: 409 }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE OR GET ACCOUNT
    // ═══════════════════════════════════════════════════════════════════════════
    const { createClient: createAdminAuthClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const authClient = createAdminAuthClient(supabaseUrl, serviceKey);

    let fromProfileId: string;
    let accountId: string;
    let userId: string;
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let isNewUser = false;
    const displayName = "Care Seeker";

    // Try to create user
    const { data: newUser, error: createUserErr } = await authClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: false,
      user_metadata: { full_name: displayName },
    });

    if (createUserErr) {
      if (
        createUserErr.message?.includes("already been registered") ||
        createUserErr.message?.includes("already exists")
      ) {
        // User exists — look up existing profile
        const { data: existingProfile } = await db
          .from("business_profiles")
          .select("id, account_id")
          .eq("email", normalizedEmail)
          .eq("type", "family")
          .not("account_id", "is", null)
          .limit(1)
          .single();

        if (existingProfile && existingProfile.account_id) {
          fromProfileId = existingProfile.id;
          accountId = existingProfile.account_id;

          const { data: accountData } = await db
            .from("accounts")
            .select("user_id")
            .eq("id", accountId)
            .single();

          userId = accountData?.user_id || "";

          // Generate session for existing user
          const { data: linkData } = await authClient.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmail,
            options: { redirectTo: `${siteUrl}/portal/inbox` },
          });

          if (linkData?.properties?.hashed_token) {
            try {
              const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
                token_hash: linkData.properties.hashed_token,
                type: "magiclink",
              });

              if (!verifyError && verifyData?.session) {
                accessToken = verifyData.session.access_token;
                refreshToken = verifyData.session.refresh_token;
              }
            } catch {
              // Non-fatal
            }
          }
        } else {
          // Auth user exists but no profile — create one
          const { data: linkData } = await authClient.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmail,
            options: { redirectTo: `${siteUrl}/portal/inbox` },
          });

          if (linkData?.properties?.hashed_token) {
            try {
              const { data: verifyData } = await authClient.auth.verifyOtp({
                token_hash: linkData.properties.hashed_token,
                type: "magiclink",
              });

              if (verifyData?.session) {
                accessToken = verifyData.session.access_token;
                refreshToken = verifyData.session.refresh_token;
                userId = verifyData.session.user?.id || "";
              }
            } catch {
              // Non-fatal
            }
          }

          userId = userId! || "";

          // Check if this auth user has a provider profile on their account
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
                    error: "This email is linked to a provider account. Please use a different email.",
                    code: "PROVIDER_EMAIL",
                  },
                  { status: 409 }
                );
              }
            }
          }

          const slug = await generateUniqueSlugFromName(db, displayName);
          const { data: newProfile, error: profileErr } = await db
            .from("business_profiles")
            .insert({
              account_id: null,
              email: normalizedEmail,
              slug,
              type: "family",
              display_name: displayName,
              care_types: [],
              claim_state: "unclaimed",
              verification_state: "unverified",
              source: "guide_save",
              metadata: {},
            })
            .select("id")
            .single();

          if (profileErr) {
            return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
          }
          fromProfileId = newProfile.id;
          accountId = "";
        }
      } else {
        console.error("Failed to create auth user:", createUserErr);
        return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
      }
    } else {
      // New user created
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
        return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
      }
      accountId = newAccount.id;

      // Create family profile
      const slug = await generateUniqueSlugFromName(db, displayName);
      const { data: newProfile, error: profileErr } = await db
        .from("business_profiles")
        .insert({
          account_id: accountId,
          email: normalizedEmail,
          slug,
          type: "family",
          display_name: displayName,
          care_types: [],
          claim_state: "claimed",
          verification_state: "unverified",
          source: "guide_save",
          metadata: {},
        })
        .select("id")
        .single();

      if (profileErr) {
        return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
      }
      fromProfileId = newProfile.id;

      // Set as active profile
      await db.from("accounts").update({ active_profile_id: fromProfileId }).eq("id", accountId);

      // Generate session tokens
      const { data: linkData } = await authClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/portal/inbox` },
      });

      if (linkData?.properties?.hashed_token) {
        try {
          const { data: verifyData } = await authClient.auth.verifyOtp({
            token_hash: linkData.properties.hashed_token,
            type: "magiclink",
          });

          if (verifyData?.session) {
            accessToken = verifyData.session.access_token;
            refreshToken = verifyData.session.refresh_token;
          }
        } catch {
          // Non-fatal
        }
      }

      // Loops: new account signup event (only for new users)
      try {
        await sendLoopsEvent({
          email: normalizedEmail,
          eventName: "user_signup",
          audience: "seeker",
          eventProperties: { source: "guide_save" },
          contactProperties: { firstName: "", lastName: "" },
        });
      } catch {
        // Non-blocking
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESOLVE PROVIDER AND CHECK FOR EXISTING CONNECTION
    // ═══════════════════════════════════════════════════════════════════════════
    let connectionId: string | null = null;
    let isNewConnection = false;
    const createdAt = new Date().toISOString();

    // Resolve provider profile ID
    let toProfileId: string;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(provider.id);

    if (isUUID) {
      const { data: existing } = await db
        .from("business_profiles")
        .select("id")
        .eq("id", provider.id)
        .single();

      if (existing) {
        toProfileId = existing.id;
      } else {
        console.error(`Provider not found: ${provider.id}`);
        toProfileId = "";
      }
    } else {
      // iOS provider lookup
      const { data: existing } = await db
        .from("business_profiles")
        .select("id")
        .eq("source_provider_id", provider.id)
        .limit(1)
        .single();

      if (existing) {
        toProfileId = existing.id;
      } else {
        // Create from olera-providers
        const { data: iosProvider } = await db
          .from("olera-providers")
          .select("provider_name, provider_category, city, state, phone, provider_logo, provider_images")
          .eq("provider_id", provider.id)
          .single();

        const providerImageUrl =
          iosProvider?.provider_logo ||
          (iosProvider?.provider_images as string | null)?.split(" | ")?.[0] ||
          null;

        const { data: newProvider, error: providerError } = await db
          .from("business_profiles")
          .insert({
            source_provider_id: provider.id,
            slug: provider.slug,
            type: "organization",
            category: iosProvider?.provider_category || null,
            display_name: provider.name,
            phone: iosProvider?.phone || null,
            city: iosProvider?.city || null,
            state: iosProvider?.state || null,
            image_url: providerImageUrl,
            care_types: iosProvider ? [iosProvider.provider_category] : [],
            claim_state: "unclaimed",
            verification_state: "unverified",
            source: "seeded",
            is_active: true,
            metadata: {},
          })
          .select("id")
          .single();

        if (providerError && providerError.code !== "23505") {
          console.error(`Failed to create provider profile for ${provider.id}:`, providerError);
          toProfileId = "";
        } else {
          toProfileId = newProvider?.id || "";
          if (!toProfileId) {
            const { data: raceProvider } = await db
              .from("business_profiles")
              .select("id")
              .eq("source_provider_id", provider.id)
              .limit(1)
              .single();
            toProfileId = raceProvider?.id || "";
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK FOR EXISTING CONNECTION
    // ═══════════════════════════════════════════════════════════════════════════
    if (toProfileId) {
      const { data: existingConnection } = await db
        .from("connections")
        .select("id")
        .eq("from_profile_id", fromProfileId)
        .eq("to_profile_id", toProfileId)
        .eq("type", "inquiry")
        .in("status", ["pending", "accepted"])
        .limit(1)
        .single();

      if (existingConnection) {
        // Connection already exists - return early without duplicate notifications
        connectionId = existingConnection.id;

        return NextResponse.json({
          status: "existing",
          connectionId,
          accessToken: accessToken || null,
          refreshToken: refreshToken || null,
          isNewUser,
          pdfUrl: GUIDE_PDF_URL,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE NEW CONNECTION
    // ═══════════════════════════════════════════════════════════════════════════
    if (toProfileId) {
      // Build connection metadata with auto-reply
      const connectionMetadata = {
        auto_intro: `Downloaded senior care checklist.`,
        source: "guide_save",
        cta_variant: "guide",
        thread: [
          {
            from_profile_id: toProfileId,
            text: `Hello, thank you for reaching out. We're reviewing your request and will get back to you shortly. In the meantime, feel free to share any additional details.`,
            created_at: createdAt,
            is_auto_reply: true,
          },
        ],
      };

      // Build message payload
      const messagePayload = JSON.stringify({
        seeker_email: normalizedEmail,
        message: null,
        care_recipient: null,
        care_type: null,
        urgency: null,
        source: "guide_save",
      });

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
          guest_email: normalizedEmail,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`Failed to insert connection for ${provider.id}:`, insertError);
      } else {
        connectionId = newConnection.id;
        isNewConnection = true;

        // Record analytics
        void recordProviderEvent({
          provider_id: provider.slug,
          event_type: "lead_received",
          profile_id: toProfileId,
          metadata: {
            connection_id: newConnection.id,
            guest: true,
            raw_provider_id: provider.id,
            session_id: sessionId || null,
            cta_variant: "guide",
            source: "guide_save",
          },
        });

        // Slack alert for new lead
        try {
          const alert = slackNewLead({
            familyName: "A family (guide)",
            providerName: provider.name,
            careType: null,
          });
          await sendSlackAlert(alert.text, alert.blocks);
        } catch {
          // Non-blocking
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS (only for new connections)
    // ═══════════════════════════════════════════════════════════════════════════
    if (isNewConnection) {
      // Slack: conversion notification
      try {
        const conversionAlert = slackGuideCtaConverted({
          email: normalizedEmail,
          providerName: provider.name,
          providerSlug: provider.slug,
        });
        await sendSlackAlert(conversionAlert.text, conversionAlert.blocks);
      } catch {
        // Non-blocking
      }

      // Activity tracking: conversion event for admin panel
      try {
        await db.from("seeker_activity").insert({
          profile_id: fromProfileId,
          event_type: "guide_cta_converted",
          metadata: {
            provider_name: provider.name,
            provider_slug: provider.slug,
            email: normalizedEmail,
            is_new_user: isNewUser,
          },
        });
      } catch {
        // Non-blocking
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SEND PDF EMAIL (only for new connections)
    // ═══════════════════════════════════════════════════════════════════════════
    if (isNewConnection) {
      // Fire-and-forget email with PDF guide
      (async () => {
      try {
        const subject = `Your senior care checklist from Olera`;

        const emailLogId = await reserveEmailLogId({
          to: normalizedEmail,
          subject,
          emailType: "guide_download",
          recipientType: "family",
        });

        // Generate magic link for one-click sign-in
        const inboxPath = appendTrackingParams("/portal/inbox", emailLogId);
        let magicLinkUrl = `${siteUrl}${inboxPath}`; // Fallback to direct URL

        try {
          const { data: linkData, error: linkError } = await authClient.auth.admin.generateLink({
            type: "magiclink",
            email: normalizedEmail,
            options: {
              redirectTo: `${siteUrl}/auth/magic-link?next=${encodeURIComponent(inboxPath)}`,
            },
          });

          if (!linkError && linkData?.properties?.action_link) {
            magicLinkUrl = linkData.properties.action_link;
          }
        } catch (linkErr) {
          console.error("[guide-save] Failed to generate magic link, using direct URL:", linkErr);
        }

        await sendEmail({
          to: normalizedEmail,
          subject,
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111827; background: #ffffff;">
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #6b7280;">
    Hi there,
  </p>

  <p style="font-size: 20px; line-height: 1.4; margin: 0 0 8px; color: #111827; font-weight: 600;">
    Your checklist is ready
  </p>

  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #6b7280;">
    Here's the senior care checklist you requested. It covers questions to ask and costs to expect.
  </p>

  <a href="${siteUrl}${GUIDE_PDF_URL}" style="display: inline-block; background: #199087; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 15px; margin-bottom: 20px;">
    Download checklist (PDF)
  </a>

  <div style="background: #f0fdfa; border-radius: 12px; padding: 16px; margin: 20px 0; border-left: 4px solid #199087;">
    <p style="font-size: 14px; color: #199087; margin: 0 0 4px; font-weight: 600;">Have questions for ${provider.name}?</p>
    <p style="font-size: 14px; color: #6b7280; margin: 0;">You can message them directly through your Olera account.</p>
  </div>

  <a href="${magicLinkUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 15px;">
    Open a thread with ${provider.name} &rarr;
  </a>

  <p style="font-size: 13px; color: #9ca3af; margin: 24px 0 0; line-height: 1.6;">
    Questions? Just reply to this email — we're here to help.
  </p>

  <p style="font-size: 12px; color: #9ca3af; margin: 16px 0 0; line-height: 1.6; border-top: 1px solid #f3f4f6; padding-top: 16px;">
    Olera helps families find and connect with senior care providers. We never sell your info.
  </p>
</div>
          `,
          emailType: "guide_download",
          recipientType: "family",
          emailLogId: emailLogId ?? undefined,
        });
      } catch (emailErr) {
        console.error("[guide-save] Failed to send guide email:", emailErr);
      }
    })();

      // Loops event
      try {
        await sendLoopsEvent({
          email: normalizedEmail,
          eventName: "guide_downloaded",
          audience: "seeker",
          eventProperties: {
            providerName: provider.name,
            providerSlug: provider.slug,
          },
        });
      } catch {
        // Non-blocking
      }
    } // End of isNewConnection block

    return NextResponse.json({
      status: "created",
      connectionId: connectionId || null,
      accessToken: accessToken || null,
      refreshToken: refreshToken || null,
      isNewUser,
      pdfUrl: GUIDE_PDF_URL,
    });
  } catch (err) {
    console.error("Guide save error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
