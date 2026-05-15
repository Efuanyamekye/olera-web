import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { generateUniqueSlugFromName } from "@/lib/slug";
import { validateEmailStrict } from "@/lib/email-validation";

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
      // User exists — generate magic link to get session
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
          userId = verifyData.session.user?.id || "";
        }
      }
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
  // 4. Send welcome email (fire-and-forget for new users)
  // ═══════════════════════════════════════════════════════════════════
  if (isNewUser) {
    (async () => {
      try {
        const subject = providerName
          ? `Welcome to Olera — ${providerName} will respond soon`
          : "Welcome to Olera";

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
          html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111827; background: #ffffff;">
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #6b7280;">
    Hi ${displayName},
  </p>

  <p style="font-size: 20px; line-height: 1.4; margin: 0 0 8px; color: #111827; font-weight: 600;">
    Welcome to Olera!
  </p>

  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #6b7280;">
    Your account is ready. Here's what's happening:
  </p>

  ${providerName ? `
  <div style="background: #f0fdfa; border-radius: 12px; padding: 16px; margin: 0 0 20px; border-left: 4px solid #199087;">
    <p style="font-size: 14px; color: #199087; margin: 0 0 4px; font-weight: 600;">Question sent to ${providerName}</p>
    <p style="font-size: 14px; color: #6b7280; margin: 0;">We'll email you when they respond — most reply within 24 hours.</p>
  </div>
  ` : ""}

  ${questionText ? `
  <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 0 0 24px;">
    <p style="font-size: 13px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Your question</p>
    <p style="font-size: 15px; color: #111827; margin: 0; font-style: italic;">"${questionText}"</p>
  </div>
  ` : ""}

  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px; color: #111827;">
    While you wait, explore more providers or check if you qualify for benefits that can help cover care costs.
  </p>

  <a href="${portalUrl}" style="display: inline-block; background: #199087; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 15px;">
    Go to my portal →
  </a>

  <p style="font-size: 12px; color: #9ca3af; margin: 40px 0 0; line-height: 1.6; border-top: 1px solid #f3f4f6; padding-top: 20px;">
    Olera helps families find and connect with senior care providers. We never sell your info.
  </p>
</div>
          `,
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
