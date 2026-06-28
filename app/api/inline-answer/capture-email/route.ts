import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { questionWelcomeEmail } from "@/lib/email-templates";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { generateProviderSlug } from "@/lib/slugify";
import { validateEmailStrict } from "@/lib/email-validation";
import { recordProviderEvent } from "@/lib/analytics/provider-events";
import { readManagedUtmFromRequest, managedUtmMetadata } from "@/lib/ad-boost/managed-utm";
import { syncIntentToProfile } from "@/lib/sync-intent-to-profile";
import { emailReturningUserSignInLink } from "@/lib/auth/returning-user";

/**
 * POST /api/inline-answer/capture-email
 *
 * Captures an email from the inline_answer variant's expanded Q&A card.
 * Creates a user account if needed, sends a welcome email, and returns
 * session tokens so the client is instantly authenticated.
 *
 * This is a lighter-weight version of /api/benefits/save-results, designed
 * for the inline Q&A experience which only captures email (no intake survey).
 */

interface CaptureEmailPayload {
  email: string;
  providerId: string;
  providerName?: string;
  questionText?: string;
  sessionId?: string;
  /** For multi_provider variants: IDs of all providers contacted */
  sentProviderIds?: string[];
  /** For multi_provider variants: total number of providers contacted */
  sentCount?: number;
  /** Variant identifier (multi_provider or multi_provider_v2) */
  variant?: "multi_provider" | "multi_provider_v2";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function POST(req: Request) {
  let payload: CaptureEmailPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  // Managed-ads attribution from the provider-page-load cookie (rides along on
  // this same-origin fetch). See lib/ad-boost/managed-utm.
  const managedUtm = readManagedUtmFromRequest(req);

  const { email, providerId, providerName, questionText, sessionId, sentProviderIds, sentCount, variant } = payload;
  // Default to multi_provider for backwards compatibility
  const resolvedVariant = variant || "multi_provider";

  // Validate email
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const validation = validateEmailStrict(email);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: validation.error || "Please enter a valid email address.",
        suggestion: validation.suggestion,
        suggestedEmail: validation.suggestedEmail,
      },
      { status: 400 }
    );
  }
  const normalizedEmail = email.trim().toLowerCase();

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  // Check if already authenticated
  const serverSupabase = await createServerClient();
  const { data: { user: currentUser } } = await serverSupabase.auth.getUser();

  // Check for existing provider profile with this email (block providers from using family flows)
  const { data: existingProviderProfile } = await db
    .from("business_profiles")
    .select("id, type")
    .eq("email", normalizedEmail)
    .in("type", ["organization", "caregiver", "student"])
    .limit(1)
    .maybeSingle();

  if (!currentUser && existingProviderProfile) {
    return NextResponse.json(
      {
        error: "This email is linked to a provider account. Please use a different email.",
        code: "PROVIDER_EMAIL",
      },
      { status: 409 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  const authClient = createClient(supabaseUrl, serviceKey);
  const siteUrl = getSiteUrl();

  let userId: string = "";
  let accountId: string | null = null;
  let familyProfileId: string = "";
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let isNewUser = false;
  let existingUser = false;
  const displayName = normalizedEmail.split("@")[0];

  // ═══════════════════════════════════════════════════════════════════
  // 1. Resolve user: already logged in → use their account
  //    Else → create or look up by email, generate magic link session
  // ═══════════════════════════════════════════════════════════════════
  if (currentUser) {
    userId = currentUser.id;

    const { data: account } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (account) accountId = account.id;
  } else {
    // Try to create user
    const { data: newUser, error: createUserErr } = await authClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: false,
      user_metadata: { full_name: displayName },
    });

    if (!createUserErr && newUser?.user) {
      userId = newUser.user.id;
      isNewUser = true;
    } else if (
      createUserErr?.message?.includes("already been registered") ||
      createUserErr?.message?.includes("already exists")
    ) {
      // SECURITY: existing account. Never mint a session for a caller-supplied
      // email (account takeover). Email a magic link instead; the submitted data
      // still attaches to their account via the resolved userId.
      const { userId: existingUserId } = await emailReturningUserSignInLink(authClient, {
        email: normalizedEmail,
        nextPath: "/portal",
      });
      userId = existingUserId || "";
      existingUser = true;
    } else {
      console.error("[inline-answer/capture-email] Failed to create user:", createUserErr);
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }

    // For new users, generate a magic link + session so they're logged in instantly
    if (isNewUser && userId) {
      const { data: linkData } = await authClient.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: { redirectTo: `${siteUrl}/portal` },
      });
      if (linkData?.properties?.hashed_token) {
        const { data: verifyData } = await authClient.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });
        if (verifyData?.session) {
          accessToken = verifyData.session.access_token;
          refreshToken = verifyData.session.refresh_token;
        }
      }
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Failed to resolve user." }, { status: 500 });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 2. Ensure an `accounts` row exists for this userId
  // ═══════════════════════════════════════════════════════════════════
  if (!accountId) {
    const { data: existingAccount } = await db
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const { data: newAccount, error: accountErr } = await db
        .from("accounts")
        .insert({
          user_id: userId,
          display_name: displayName,
          onboarding_completed: false,
          signup_source: resolvedVariant,
          session_id: sessionId || null,
        })
        .select("id")
        .single();
      if (accountErr || !newAccount) {
        console.error("[inline-answer/capture-email] Failed to create account:", accountErr);
        return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
      }
      accountId = newAccount.id;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. Resolve or create family profile
  // ═══════════════════════════════════════════════════════════════════
  const { data: existingFamilyProfile } = await db
    .from("business_profiles")
    .select("id")
    .eq("account_id", accountId)
    .eq("type", "family")
    .maybeSingle();

  if (existingFamilyProfile) {
    familyProfileId = existingFamilyProfile.id;
    // Update email if not set
    await db
      .from("business_profiles")
      .update({ email: normalizedEmail })
      .eq("id", familyProfileId)
      .is("email", null);
  } else {
    const slug = await generateUniqueSlugFromName(db, displayName);
    // Build signup context metadata
    const signupContext: Record<string, unknown> = {
      provider_id: providerId,
      provider_name: providerName,
      question_text: questionText,
      variant: resolvedVariant,
    };
    // Include multi-provider data if present (from multi_provider variants)
    if (sentProviderIds && sentProviderIds.length > 0) {
      signupContext.sent_provider_ids = sentProviderIds;
      signupContext.sent_count = sentCount || sentProviderIds.length;
    }

    const { data: newProfile, error: createErr } = await db
      .from("business_profiles")
      .insert({
        account_id: accountId,
        slug,
        type: "family",
        display_name: displayName,
        email: normalizedEmail,
        claim_state: "claimed",
        verification_state: "unverified",
        source: resolvedVariant,
        metadata: {
          signup_context: signupContext,
        },
      })
      .select("id")
      .single();
    if (createErr || !newProfile) {
      console.error("[inline-answer/capture-email] Failed to create family profile:", createErr);
      return NextResponse.json({ error: "Failed to create profile." }, { status: 500 });
    }
    familyProfileId = newProfile.id;

    // Set active profile
    await db.from("accounts").update({ active_profile_id: familyProfileId }).eq("id", accountId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3b. Pre-fill city and care_types from provider (for completeness)
  // ═══════════════════════════════════════════════════════════════════
  // Multi-strategy provider lookup to get city, state, category.
  // Many providers are in olera-providers (iOS data), not business_profiles.
  // This mirrors the 4-strategy lookup from /api/questions/route.ts.
  // Result: users get 31% completeness (email 10 + name 5 + city 8 + care_types 8)
  if (providerId) {
    try {
      let providerCity: string | null = null;
      let providerState: string | null = null;
      let providerCategory: string | null = null;

      // Strategy 1: business_profiles by slug
      const { data: bpProvider } = await db
        .from("business_profiles")
        .select("city, state, category, source_provider_id")
        .eq("slug", providerId)
        .maybeSingle();

      if (bpProvider) {
        providerCity = bpProvider.city;
        providerState = bpProvider.state;
        providerCategory = bpProvider.category;
      } else {
        // Strategy 2: olera-providers by slug
        let iosProvider = await db
          .from("olera-providers")
          .select("provider_id, city, state, provider_category, provider_name")
          .eq("slug", providerId)
          .not("deleted", "is", true)
          .maybeSingle()
          .then((r: { data: { provider_id: string; city: string | null; state: string | null; provider_category: string | null; provider_name: string | null } | null }) => r.data);

        if (!iosProvider) {
          // Strategy 3: olera-providers by provider_id (legacy alphanumeric ID)
          iosProvider = await db
            .from("olera-providers")
            .select("provider_id, city, state, provider_category, provider_name")
            .eq("provider_id", providerId)
            .not("deleted", "is", true)
            .maybeSingle()
            .then((r: { data: { provider_id: string; city: string | null; state: string | null; provider_category: string | null; provider_name: string | null } | null }) => r.data);
        }

        if (!iosProvider) {
          // Strategy 4: reverse-match auto-generated slug from name+state
          const slugParts = providerId.split("-");
          const namePrefix = slugParts.slice(0, 3).join("-");
          const { data: candidates } = await db
            .from("olera-providers")
            .select("provider_id, city, state, provider_category, provider_name")
            .not("deleted", "is", true)
            .is("slug", null)
            .ilike("provider_name", `${namePrefix.replace(/-/g, "%")}%`)
            .limit(20);

          if (candidates) {
            for (const c of candidates) {
              if (generateProviderSlug(c.provider_name, c.state) === providerId) {
                iosProvider = c;
                break;
              }
            }
          }
        }

        if (iosProvider) {
          providerCity = iosProvider.city;
          providerState = iosProvider.state;
          providerCategory = iosProvider.provider_category;
        }
      }

      // Sync to profile if we found provider data
      if (providerCity || providerState || providerCategory) {
        await syncIntentToProfile(db, familyProfileId, {
          providerCity,
          providerState,
          providerCategory,
        }, normalizedEmail);
      }
    } catch (prefillErr) {
      console.error("[inline-answer/capture-email] Failed to pre-fill from provider:", prefillErr);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. Record lead_received event for conversion tracking
  // ═══════════════════════════════════════════════════════════════════
  // Fire lead_received so Q&A conversions show in admin analytics alongside
  // CTA and Lead Capture conversions. The variant (multi_provider / multi_provider_v2)
  // is stored as entry_point for attribution.
  void recordProviderEvent({
    provider_id: providerId,
    event_type: "lead_received",
    profile_id: familyProfileId,
    metadata: {
      email: normalizedEmail,
      guest: !currentUser,
      session_id: sessionId || null,
      // Store variant as entry_point for Q&A conversion attribution
      // This matches how Lead Capture uses entry_point
      entry_point: resolvedVariant.startsWith("multi_provider") ? `qa_${resolvedVariant}` : `qa_${resolvedVariant}`,
      // Also store the raw variant for debugging
      qa_variant: resolvedVariant,
      provider_name: providerName || null,
      question_text: questionText || null,
      sent_provider_ids: sentProviderIds || null,
      sent_count: sentCount || null,
      ...managedUtmMetadata(managedUtm),
    },
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. Send welcome email (fire-and-forget for new users)
  // ═══════════════════════════════════════════════════════════════════
  if (isNewUser) {
    (async () => {
      try {
        const subject = providerName
          ? `${providerName} will respond soon`
          : "Your question has been delivered";

        const emailLogId = await reserveEmailLogId({
          to: normalizedEmail,
          subject,
          emailType: "inline_answer_welcome",
          recipientType: "family",
        });

        const portalUrl = appendTrackingParams(`${siteUrl}/portal`, emailLogId);

        await sendEmail({
          to: normalizedEmail,
          subject,
          html: questionWelcomeEmail({
            displayName,
            providerName: providerName || null,
            questionText: questionText || null,
            portalUrl,
          }),
          emailLogId: emailLogId ?? undefined,
        });
      } catch (emailErr) {
        console.error("[inline-answer/capture-email] Failed to send welcome email:", emailErr);
      }
    })();
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. Return response with session cookies
  // ═══════════════════════════════════════════════════════════════════
  // Note: Slack notification fires from /api/activity/track when the client
  // sends multi_provider_converted (single source of truth for both guest
  // and logged-in conversions). Don't double-fire it here.
  const response = NextResponse.json({
    success: true,
    profileId: familyProfileId,
    userId,
    isNewUser,
    // When true, the client should show "check your email to sign in" rather
    // than expecting an instant session — no session is minted for existing
    // accounts (security: prevents takeover via a typed email).
    existingUser,
  });

  if (accessToken && refreshToken) {
    try {
      const cookieWriter = createSSRServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => [],
            setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
              cookiesToSet.forEach((c) => {
                response.cookies.set(c.name, c.value, c.options);
              });
            },
          },
        }
      );
      await cookieWriter.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } catch (err) {
      console.error("[inline-answer/capture-email] Failed to write session cookies:", err);
    }
  }

  return response;
}
