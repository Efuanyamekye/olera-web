import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { validateClaimToken } from "@/lib/claim-tokens";

/**
 * GET /api/medjobs/claim-student?otk=<token>&next=<destination>
 *
 * One-click authentication endpoint for student nudge/activation emails.
 * Handles authentication flow server-side in a single response:
 *
 *  1. Validates the HMAC-signed token (email + 15-day expiry)
 *  2. Resolves the existing Supabase auth user for the email
 *  3. Establishes a session by verifying a fresh magic-link OTP server-side,
 *     writing auth cookies onto the redirect response
 *  4. Redirects to the destination URL (e.g., /portal/medjobs/profile)
 *
 * This provides 15-day link expiry (vs 1-hour Supabase magic link default),
 * matching how provider and family claim links work.
 *
 * Query params:
 *   - otk: Required. The signed claim token (HMAC-SHA256, 15-day expiry)
 *   - next: Required. Destination path to redirect to after auth
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("otk");
  const nextPath = url.searchParams.get("next");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

  const fallbackUrl = `${siteUrl}/portal/medjobs`;

  console.log("[claim-student] route hit", {
    hasToken: !!token,
    nextPath: nextPath || "(none)",
  });

  // Validate required params
  if (!token) {
    console.error("[claim-student] missing token");
    return NextResponse.redirect(fallbackUrl, { status: 303 });
  }

  if (!nextPath) {
    console.error("[claim-student] missing next param");
    return NextResponse.redirect(fallbackUrl, { status: 303 });
  }

  // Validate nextPath to prevent open redirect attacks
  // Must start with / (but not //) and cannot contain protocol schemes
  if (!nextPath.startsWith('/') || nextPath.startsWith('//') || nextPath.includes('://')) {
    console.error("[claim-student] invalid next path (potential open redirect):", nextPath);
    return NextResponse.redirect(fallbackUrl, { status: 303 });
  }

  // Validate token (HMAC + expiry)
  const validation = validateClaimToken(token);
  if (!validation.valid) {
    console.error("[claim-student] token validation failed:", validation.error);
    // Token invalid/expired — redirect to destination unauthenticated
    // Portal pages will prompt sign-in via normal auth flow
    return NextResponse.redirect(`${siteUrl}${nextPath}`, { status: 303 });
  }

  const { email } = validation;
  const normalizedEmail = email.trim().toLowerCase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[claim-student] missing env vars");
    return NextResponse.redirect(fallbackUrl, { status: 303 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Students should already have an auth account from signup
  // Generate a magic-link token hash we can verify to mint a session
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[claim-student] generateLink failed:", linkError?.message);
    // Fall through to destination — they'll need to sign in manually
    return NextResponse.redirect(`${siteUrl}${nextPath}`, { status: 303 });
  }

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
    console.error("[claim-student] verifyOtp failed:", otpError?.message);
    return NextResponse.redirect(`${siteUrl}${nextPath}`, { status: 303 });
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
    console.error("[claim-student] setSession failed:", setSessionError.message);
    // Still redirect — partial success is better than nothing
    return NextResponse.redirect(redirectTarget, { status: 303 });
  }

  console.log("[claim-student] success, redirecting to:", redirectTarget.toString());

  return response;
}
