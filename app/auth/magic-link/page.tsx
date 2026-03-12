"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

/**
 * /auth/magic-link
 *
 * Client-side handler for magic link implicit flow.
 * When Supabase redirects with #access_token=..., this page:
 * 1. Extracts tokens from the hash fragment
 * 2. Sets the session using supabase.auth.setSession()
 * 3. Ensures account exists (calls ensure-account API)
 * 4. Redirects to the intended destination
 */

function MagicLinkHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleMagicLink() {
      try {
        // Get the intended destination from query params
        const next = searchParams.get("next") || "/";

        // Check for hash fragment with tokens
        const hash = window.location.hash;
        if (!hash || !hash.includes("access_token")) {
          // No tokens in hash - might be a direct visit or error
          // Check if already authenticated
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (session) {
            // Already logged in, redirect to destination
            router.replace(next);
            return;
          }

          // No session and no tokens - redirect to home
          setError("Invalid or expired link. Please request a new one.");
          setStatus("error");
          setTimeout(() => router.replace("/"), 3000);
          return;
        }

        // Parse tokens from hash fragment
        // Format: #access_token=xxx&refresh_token=xxx&expires_in=xxx&token_type=bearer&type=magiclink
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (!accessToken) {
          setError("Invalid link format. Please request a new one.");
          setStatus("error");
          setTimeout(() => router.replace("/"), 3000);
          return;
        }

        // Set the session
        const supabase = createClient();
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || "",
        });

        if (sessionError || !data.session) {
          console.error("Failed to set session:", sessionError);
          setError("Failed to sign in. Please try again.");
          setStatus("error");
          setTimeout(() => router.replace("/"), 3000);
          return;
        }

        // Ensure account exists (same as OAuth callback)
        try {
          await fetch("/api/auth/ensure-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              claimToken: searchParams.get("token") || null,
            }),
          });
        } catch (err) {
          console.error("ensure-account error:", err);
          // Non-blocking
        }

        // Clear the hash from URL (for cleaner experience)
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        setStatus("success");

        // Small delay to show success state, then redirect
        setTimeout(() => {
          router.replace(next);
        }, 500);
      } catch (err) {
        console.error("Magic link handler error:", err);
        setError("Something went wrong. Please try again.");
        setStatus("error");
        setTimeout(() => router.replace("/"), 3000);
      }
    }

    handleMagicLink();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        {status === "processing" && (
          <>
            <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Signing you in...</p>
            <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-900">Signed in!</p>
            <p className="text-sm text-gray-500 mt-1">Redirecting...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-900">Sign in failed</p>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
            <p className="text-xs text-gray-400 mt-2">Redirecting to home...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MagicLinkHandler />
    </Suspense>
  );
}
