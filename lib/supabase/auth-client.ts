import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with implicit flow (no PKCE) for OTP-based auth operations.
 *
 * `@supabase/ssr`'s `createBrowserClient` forces `flowType: "pkce"`, which
 * causes `signUp()` to send a PKCE `code_challenge`. However, `verifyOtp()`
 * does NOT send the corresponding `code_verifier`, so GoTrue rejects
 * verification with 403 Forbidden.
 *
 * This client uses implicit flow so that signUp/verifyOtp work correctly
 * for OTP-based email confirmation. After successful verification, callers
 * must transfer the session to the main SSR client via `setSession()`.
 */
let _authClient: ReturnType<typeof createClient> | null = null;

export function createAuthClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase environment variables not configured");
  }

  if (!_authClient) {
    _authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          flowType: "implicit",
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return _authClient;
}
