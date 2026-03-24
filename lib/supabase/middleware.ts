import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Refresh the session — this is critical for server components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes: redirect to home if not authenticated
  const protectedPaths = ["/portal", "/admin"];
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
          // Check if user has a provider profile to route them correctly
          const { data: providerProfile } = await supabase
            .from("business_profiles")
            .select("id, slug, source_provider_id")
            .eq("account_id", account.id)
            .in("type", ["organization", "caregiver"])
            .limit(1)
            .maybeSingle();

          const url = request.nextUrl.clone();
          const originalPath = request.nextUrl.pathname + request.nextUrl.search;

          if (providerProfile) {
            // Route providers to their onboard page
            const providerSlug = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
            url.pathname = `/provider/${providerSlug}/onboard`;
            url.search = `?next=${encodeURIComponent(originalPath)}`;
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
