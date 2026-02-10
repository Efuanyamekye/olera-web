import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Google (or other providers).
 * Exchanges the authorization code for a session, ensures an account
 * row exists, then redirects to the `next` query param (or `/`).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      console.error("OAuth callback error:", error?.message);
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Ensure account row exists (same pattern as /api/auth/ensure-account)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && serviceKey) {
      const admin = createClient(url, serviceKey);
      const { data: existing } = await admin
        .from("accounts")
        .select("id")
        .eq("user_id", data.user.id)
        .single();

      if (!existing) {
        await admin.from("accounts").insert({
          user_id: data.user.id,
          display_name:
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            data.user.email?.split("@")[0] ||
            "",
          onboarding_completed: false,
        });
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("OAuth callback unexpected error:", err);
    return NextResponse.redirect(`${origin}${next}`);
  }
}
