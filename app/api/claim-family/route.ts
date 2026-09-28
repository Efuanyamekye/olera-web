import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { validateClaimToken } from "@/lib/claim-tokens";

/**
 * GET /api/claim-family?otk=<token>&next=<destination>
 *
 * One-click authentication endpoint for email links (families + providers).
 * Handles authentication flow server-side in a single response:
 *
 *  1. Validates the HMAC-signed token (email + 72h expiry)
 *  2. Creates or resolves a Supabase auth user for the email
 *  3. Establishes a session by verifying a fresh magic-link OTP server-side,
 *     writing auth cookies onto the redirect response
 *  4. Redirects to the destination URL (e.g., /portal/inbox?id=123)
 *
 * This provides 72-hour link expiry (vs 1-hour Supabase magic link default).
 *
 * Query params:
 *   - otk: Required. The signed claim token (HMAC-SHA256, 72h expiry)
 *   - next: Required. Destination path to redirect to after auth
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("otk");
  const nextPath = url.searchParams.get("next");
  // Redirect on the host that was hit, because that is where the session
  // cookies below are written. Email links are built with getSiteUrl(), which
  // on staging and previews is the deployment's own host (VERCEL_URL), while
  // NEXT_PUBLIC_SITE_URL there names the staging alias. Sending the visitor to
  // the alias landed them signed out, or signed in as whoever the alias
  // already had (found 28 Sep testing provider offer emails). In production
  // the two are the same host, so nothing changes there.
  const siteUrl = url.origin;

  console.log("[claim-family] route hit", {
    hasToken: !!token,
    nextPath: nextPath || "(none)",
  });

  // Validate required params
  if (!token) {
    console.error("[claim-family] missing token");
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  if (!nextPath) {
    console.error("[claim-family] missing next param");
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  // Validate nextPath to prevent open redirect attacks
  // Must start with / (but not //) and cannot contain protocol schemes
  if (!nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.includes('://')) {
    console.error("[claim-family] invalid next path (potential open redirect):", nextPath);
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  // Validate token (HMAC + expiry)
  const validation = validateClaimToken(token);
  if (!validation.valid) {
    console.error("[claim-family] token validation failed:", validation.error);
    // Token invalid/expired — fall through to the destination UNAUTHENTICATED
    // instead of stranding the user in the inbox. nextPath is already
    // open-redirect-validated above, and destinations carry their own access
    // model (/m/{token} is public-by-token; portal pages prompt sign-in).
    // Before this, a family opening their welcome email >72h late lost their
    // "View matches" link to a portal wall — the exact late-returning
    // audience /m exists for.
    return NextResponse.redirect(`${siteUrl}${nextPath}`, { status: 303 });
  }

  const { email } = validation;
  const normalizedEmail = email.trim().toLowerCase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[claim-family] missing env vars");
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Create or resolve the auth user
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
      console.error("[claim-family] createUser failed:", createError.message);
      return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
    }
  } else {
    userId = createdUser?.user?.id;
  }

  // Generate a magic-link token hash we can verify to mint a session
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[claim-family] generateLink failed:", linkError?.message);
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }
  if (!userId) userId = linkData.user?.id;
  const tokenHash = linkData.properties.hashed_token;

  // Verify the OTP on a plain @supabase/supabase-js client with implicit flow
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
    console.error("[claim-family] verifyOtp failed:", otpError?.message);
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  // Build the redirect response and write session cookies onto it
  const redirectTarget = new URL(`${siteUrl}${nextPath}`);
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
    console.error("[claim-family] setSession failed:", setSessionError.message);
    return NextResponse.redirect(`${siteUrl}/portal/inbox`, { status: 303 });
  }

  // Ensure an account row exists
  // Note: This endpoint is used by both families and providers
  if (!userId) {
    console.error("[claim-family] could not resolve userId");
    return NextResponse.redirect(redirectTarget, { status: 303 });
  }

  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!account) {
    const displayName = normalizedEmail.split("@")[0] || "User";

    const { error: accountError } = await admin
      .from("accounts")
      .insert({
        user_id: userId,
        display_name: displayName,
        onboarding_completed: true, // Email claim completes onboarding for all users
      })
      .select("id")
      .single();

    if (accountError) {
      console.error("[claim-family] account insert failed:", accountError.message);
      // Non-fatal: session is already set, they're signed in
    }
  }

  console.log("[claim-family] success, redirecting to:", redirectTarget.toString());

  return response;
}
