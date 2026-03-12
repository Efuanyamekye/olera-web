"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GUEST_REDIRECT_KEY = "olera_guest_redirect";
const CLAIM_TOKEN_KEY = "olera_claim_token";

/**
 * Client-side component that handles magic link implicit flow tokens.
 *
 * When Supabase redirects with #access_token=..., this component:
 * 1. Detects the hash fragment with tokens
 * 2. Sets the session using supabase.auth.setSession()
 * 3. Calls ensure-account API to create account and merge placeholder profiles
 * 4. Redirects to the stored destination (or inbox)
 *
 * This component should be included in the root layout.
 */
export default function MagicLinkHandler() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    async function handleMagicLinkTokens() {
      // Only run on client
      if (typeof window === "undefined") return;

      // Check for hash fragment with tokens
      const hash = window.location.hash;
      if (!hash || !hash.includes("access_token")) return;

      // Prevent double-processing (use ref to survive re-renders)
      if (hasProcessed.current) return;
      hasProcessed.current = true;
      setProcessing(true);

      try {
        // Parse tokens from hash fragment
        // Format: #access_token=xxx&refresh_token=xxx&expires_in=xxx&token_type=bearer&type=magiclink
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        // Only handle magiclink type
        if (type !== "magiclink" || !accessToken) {
          setProcessing(false);
          hasProcessed.current = false;
          return;
        }

        console.log("[MagicLinkHandler] Processing magic link tokens...");

        // Set the session
        const supabase = createClient();
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || "",
        });

        if (sessionError || !data.session) {
          console.error("[MagicLinkHandler] Failed to set session:", sessionError);
          // Clear hash and stay on page
          window.history.replaceState(null, "", window.location.pathname);
          setProcessing(false);
          return;
        }

        console.log("[MagicLinkHandler] Session set successfully");

        // Get stored redirect destination and claim token from localStorage
        // (persists across browser sessions, unlike sessionStorage)
        let redirectTo = "/portal/inbox";
        let claimToken: string | null = null;
        try {
          const stored = localStorage.getItem(GUEST_REDIRECT_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            redirectTo = parsed.redirect || "/portal/inbox";
            claimToken = parsed.claimToken || null;
            localStorage.removeItem(GUEST_REDIRECT_KEY);
            console.log("[MagicLinkHandler] Found stored redirect:", redirectTo);
          }
        } catch {
          // Use defaults
        }

        // Also check localStorage for claim token (set by success page)
        if (!claimToken) {
          try {
            claimToken = localStorage.getItem(CLAIM_TOKEN_KEY);
            console.log("[MagicLinkHandler] Found claim token from localStorage");
          } catch {
            // Ignore
          }
        }

        // Ensure account exists and handle placeholder profile
        try {
          const resp = await fetch("/api/auth/ensure-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claimToken }),
          });
          const result = await resp.json();
          console.log("[MagicLinkHandler] ensure-account result:", result);
        } catch (err) {
          console.error("[MagicLinkHandler] ensure-account error:", err);
          // Non-blocking
        }

        // Clear claim token from localStorage (account is now created)
        try {
          localStorage.removeItem(CLAIM_TOKEN_KEY);
        } catch {
          // Ignore
        }

        // Clear hash from URL
        window.history.replaceState(null, "", window.location.pathname);

        console.log("[MagicLinkHandler] Redirecting to:", redirectTo);

        // Redirect to destination
        router.replace(redirectTo);
      } catch (err) {
        console.error("[MagicLinkHandler] Error:", err);
        window.history.replaceState(null, "", window.location.pathname);
        setProcessing(false);
      }
    }

    handleMagicLinkTokens();
  }, [router]);

  // Show loading overlay while processing
  if (processing) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900">Signing you in...</p>
          <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Store the redirect destination before user clicks magic link.
 * Call this when creating a guest connection.
 * Uses localStorage so it persists across browser sessions.
 */
export function storeGuestRedirect(redirect: string, claimToken: string) {
  try {
    localStorage.setItem(GUEST_REDIRECT_KEY, JSON.stringify({ redirect, claimToken }));
    // Also store claim token separately for backup
    localStorage.setItem(CLAIM_TOKEN_KEY, claimToken);
    console.log("[storeGuestRedirect] Stored redirect:", redirect);
  } catch {
    // localStorage unavailable
  }
}
