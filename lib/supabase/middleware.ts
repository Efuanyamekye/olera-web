import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { skipsWelcome } from "@/lib/auth/welcome-redirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Skip Supabase session refresh if not configured
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://your-project-id.supabase.co"
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify the signed access token locally when the project uses asymmetric
  // signing keys. This avoids a remote Auth round-trip before every protected
  // document request; getClaims still falls back to server validation for
  // legacy symmetric tokens.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub
    ? { id: claimsData.claims.sub }
    : null;

  // Protected routes: redirect to home if not authenticated
  const protectedPaths = ["/portal", "/admin", "/account"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !user) {
    // Allow guest access to inbox with claim token
    const isInboxWithToken =
      request.nextUrl.pathname === "/portal/inbox" &&
      request.nextUrl.searchParams.has("token");

    if (!isInboxWithToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // New user onboarding guard: redirect to /welcome if onboarding not completed
  // This prevents the inbox from flashing before the client-side redirect kicks in
  // Note: Guest flow (unauthenticated users with token) is handled above - if we're here,
  // the user is authenticated and should go through the onboarding check regardless of token
  // Exception: /portal/profile is always accessible so users can complete their profile
  if (user && request.nextUrl.pathname.startsWith("/portal")) {
    const isProfilePage = request.nextUrl.pathname === "/portal/profile";

    if (!isProfilePage) {
      try {
        const { data: account } = await supabase
          .from("accounts")
          .select("id, onboarding_completed")
          .eq("user_id", user.id)
          .single();

        if (account && account.onboarding_completed === false) {
          // Check if user is completing a task (review, Q&A, message, lead) via URL hints
          // If so, skip the welcome redirect and let them complete their task
          const hasActionParam = request.nextUrl.searchParams.has("action") ||
            request.nextUrl.searchParams.has("id");
          const pathname = request.nextUrl.pathname;
          const isTaskPage = pathname.includes("/inbox") ||
            pathname.includes("/reviews") ||
            pathname.includes("/qna") ||
            pathname.includes("/leads");

          // If user is going to a task page with an ID (completing a deferred action), allow through
          if (hasActionParam || isTaskPage) {
            return supabaseResponse;
          }

          // A team member of an agency (migration 272) is not a new family.
          // Their own account owns nothing, so without this they would land on
          // the family welcome. RLS returns only the signed-in email's rows.
          const { data: teamRow } = await supabase
            .from("business_profile_members")
            .select("profile_id")
            .limit(1)
            .maybeSingle();
          if (teamRow) {
            return supabaseResponse;
          }

          // Which kinds of account this is. "caregiver" is in the list for
          // history only — nothing creates that type; students are "student".
          // Leaving students out is what made this branch treat every one of
          // them as a family.
          //
          // Every matching row, not limit(1): an account can hold more than
          // one profile, and with three types in the filter an unordered
          // limit(1) could return the student row of somebody who also owns an
          // organization — sending a provider to the student portal. Provider
          // is chosen first here, explicitly, which is the precedence this
          // block had when it only ever matched organizations.
          const { data: ownProfiles } = await supabase
            .from("business_profiles")
            .select("id, slug, source_provider_id, claim_state, type")
            .eq("account_id", account.id)
            .in("type", ["organization", "caregiver", "student"]);
          const rows = ownProfiles ?? [];
          const providerProfile = rows.find((r) => r.type !== "student") ?? null;
          const studentProfile = rows.find((r) => r.type === "student") ?? null;

          const url = request.nextUrl.clone();
          const originalPath = request.nextUrl.pathname + request.nextUrl.search;

          if (providerProfile) {
            // Claimed providers skip onboarding — allow through to destination
            if (providerProfile.claim_state === "claimed") {
              return supabaseResponse;
            }
            // Unclaimed providers go to onboard page
            const providerSlug = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
            url.pathname = `/provider/${providerSlug}/onboard`;
            url.search = `?next=${encodeURIComponent(originalPath)}`;
          } else if (studentProfile) {
            // A student's onboarding is their MedJobs profile, not the
            // care-seeker questionnaire — which is what this branch used to
            // hand them, because "student" was missing from the lookup above
            // and every one of them read as a family.
            //
            // Already heading somewhere that is theirs: let them through. This
            // is the check that was missing, and it is scoped to students on
            // purpose — a provider mid-onboarding still gets their onboard
            // page, and a family still gets /welcome, exactly as before.
            if (skipsWelcome(pathname)) {
              return supabaseResponse;
            }
            // Anywhere else in /portal sends them to the portal that is theirs.
            url.pathname = "/portal/medjobs";
            url.search = "";
          } else {
            // Route families to family welcome page
            url.pathname = "/welcome";
            url.search = `?next=${encodeURIComponent(originalPath)}`;
          }
          return NextResponse.redirect(url);
        }
      } catch {
        // Query failed — allow through, client-side will handle it
      }
    }
  }

  return supabaseResponse;
}
