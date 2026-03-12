import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sendLoopsEvent } from "@/lib/loops";

/**
 * GET /auth/callback
 *
 * Handles the OAuth redirect from Google (or other providers).
 * Exchanges the authorization code for a session, ensures an account
 * row exists, then redirects to the `next` query param (or `/`).
 *
 * Uses the middleware-style cookie pattern so session cookies are
 * explicitly set on the redirect response (not lost in transit).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Build redirect response first — cookies will be set directly on it
  const response = NextResponse.redirect(`${origin}${next}`);

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[]
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

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
        // Create account
        const displayName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.email?.split("@")[0] ||
          "";

        const { data: newAccount } = await admin.from("accounts").insert({
          user_id: data.user.id,
          display_name: displayName,
          onboarding_completed: false,
        }).select("id").single();

        // Create family profile (every user gets one)
        let newFamilyId: string | null = null;
        if (newAccount) {
          const { data: newFamily } = await admin.from("business_profiles").insert({
            account_id: newAccount.id,
            slug: `family-${newAccount.id.slice(0, 8)}`,
            type: "family",
            display_name: displayName || "My Family",
            claim_state: "claimed",
            verification_state: "unverified",
            source: "user_created",
            metadata: {},
          }).select("id").single();

          newFamilyId = newFamily?.id || null;

          // Set active profile so user can send messages
          if (newFamilyId) {
            await admin.from("accounts").update({
              active_profile_id: newFamilyId,
            }).eq("id", newAccount.id);
          }
        }

        // Handle placeholder profile if token present (guest connection flow)
        // Move connections to the newly created family profile and delete the placeholder
        try {
          const nextUrl = new URL(next, origin);
          const claimToken = nextUrl.searchParams.get("token");
          if (claimToken && newAccount && newFamilyId) {
            // Find placeholder profile by token
            const { data: placeholder } = await admin
              .from("business_profiles")
              .select("id")
              .eq("claim_token", claimToken)
              .is("account_id", null)
              .single();

            if (placeholder && placeholder.id !== newFamilyId) {
              // Move connections from placeholder to the new family profile
              await admin
                .from("connections")
                .update({ from_profile_id: newFamilyId })
                .eq("from_profile_id", placeholder.id);

              // Delete the placeholder profile (user now has a proper family profile)
              await admin
                .from("business_profiles")
                .delete()
                .eq("id", placeholder.id);
            }
          }
        } catch (err) {
          console.error("[callback] placeholder handling error:", err);
          // Non-blocking — profile will be claimed by AuthProvider fallback
        }

        // Loops: new account created
        try {
          const fullName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || "";
          const nameParts = fullName.trim().split(/\s+/);
          await sendLoopsEvent({
            email: data.user.email || "",
            eventName: "user_signup",
            audience: "seeker",
            eventProperties: { source: "web_v2" },
            contactProperties: {
              firstName: nameParts[0] || "",
              lastName: nameParts.slice(1).join(" ") || "",
            },
          });
        } catch {
          // Non-blocking
        }
      } else {
        // Account exists — ensure family profile exists (handles edge cases)
        const { data: existingFamily } = await admin
          .from("business_profiles")
          .select("id")
          .eq("account_id", existing.id)
          .eq("type", "family")
          .limit(1)
          .maybeSingle();

        if (!existingFamily) {
          const displayName =
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            data.user.email?.split("@")[0] ||
            "My Family";

          await admin.from("business_profiles").insert({
            account_id: existing.id,
            slug: `family-${existing.id.slice(0, 8)}`,
            type: "family",
            display_name: displayName,
            claim_state: "claimed",
            verification_state: "unverified",
            source: "user_created",
            metadata: {},
          });
        }

        // Claim placeholder profile if token present (guest connection flow)
        // For EXISTING users, we DON'T claim the placeholder as a second family profile.
        // Instead, we move the connections to their existing family profile and delete the placeholder.
        try {
          const nextUrl = new URL(next, origin);
          const claimToken = nextUrl.searchParams.get("token");
          if (claimToken) {
            const { data: placeholder } = await admin
              .from("business_profiles")
              .select("id, display_name, email, metadata")
              .eq("claim_token", claimToken)
              .is("account_id", null)
              .single();

            if (placeholder) {
              // Get or create the main family profile
              let mainFamilyId = existingFamily?.id;

              if (!mainFamilyId) {
                // Edge case: existing account but no family profile yet
                const displayName =
                  data.user.user_metadata?.full_name ||
                  data.user.user_metadata?.name ||
                  placeholder.display_name ||
                  data.user.email?.split("@")[0] ||
                  "My Family";

                const { data: newFamily } = await admin.from("business_profiles").insert({
                  account_id: existing.id,
                  slug: `family-${existing.id.slice(0, 8)}`,
                  type: "family",
                  display_name: displayName,
                  claim_state: "claimed",
                  verification_state: "unverified",
                  source: "user_created",
                  metadata: {},
                }).select("id").single();

                mainFamilyId = newFamily?.id;
              }

              if (mainFamilyId) {
                // Move connections from placeholder to main family profile
                await admin
                  .from("connections")
                  .update({ from_profile_id: mainFamilyId })
                  .eq("from_profile_id", placeholder.id);

                // Delete the placeholder profile (don't claim it as second family)
                await admin
                  .from("business_profiles")
                  .delete()
                  .eq("id", placeholder.id);
              }
            }
          }
        } catch (err) {
          console.error("[callback] placeholder claim error:", err);
          // Non-blocking
        }
      }
    }

    return response;
  } catch (err) {
    console.error("OAuth callback unexpected error:", err);
    return NextResponse.redirect(`${origin}${next}`);
  }
}
