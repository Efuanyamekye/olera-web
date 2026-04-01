"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createAuthClient } from "@/lib/supabase/auth-client";
import { useAuth, type OpenAuthOptions } from "@/components/auth/AuthProvider";
import { validateReturnUrl } from "@/lib/validation";
import { getDeferredAction } from "@/lib/deferred-action";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import OtpInput from "@/components/auth/OtpInput";

// ============================================================
// Constants
// ============================================================

/** Key for storing pre-auth page in localStorage (for "Skip for now" on /welcome) */
export const PRE_AUTH_PAGE_KEY = "olera_pre_auth_page";

// ============================================================
// Types
// ============================================================

type AuthStep = "entry" | "sign-up" | "sign-in" | "verify-otp";

export interface UnifiedAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  options?: OpenAuthOptions;
}

// ============================================================
// Component
// ============================================================

export default function UnifiedAuthModal({
  isOpen,
  onClose,
  options = {},
}: UnifiedAuthModalProps) {
  const router = useRouter();
  const { user, account, profiles, refreshAccountData } = useAuth();

  // Determine initial step
  const getInitialStep = useCallback((): AuthStep => {
    return "entry";
  }, []);

  const [step, setStep] = useState<AuthStep>(getInitialStep);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Tracks whether the OTP screen is for signup confirmation or sign-in magic link
  const [otpContext, setOtpContext] = useState<"signup" | "signin">("signup");
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(getInitialStep());
      setEmail("");
      setPassword("");
      setDisplayName("");
      setError("");
      setLoading(false);
      setOtpCode("");
      setResendCooldown(0);
      setCheckingEmail(false);
      setOtpContext("signup");
      setForgotPasswordSent(false);
    }
  }, [isOpen, getInitialStep]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // ──────────────────────────────────────────────────────────
  // Email-first flow: check if email exists, show password or sign-up
  // ──────────────────────────────────────────────────────────

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setCheckingEmail(true);

    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { exists } = await res.json();

      if (exists) {
        setStep("sign-in");
      } else {
        setStep("sign-up");
      }
    } catch {
      // On error, default to sign-up
      setStep("sign-up");
    } finally {
      setCheckingEmail(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Google OAuth
  // ──────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured()) return;

    // Store current page for "Skip for now" redirect on /welcome
    try {
      localStorage.setItem(PRE_AUTH_PAGE_KEY, window.location.pathname);
    } catch { /* localStorage not available */ }

    const supabase = createClient();

    // Build callback URL with action hint if there's a deferred action
    // This lets the server-side callback know to skip the welcome redirect
    const deferred = options.deferred || getDeferredAction();
    let callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;
    if (deferred?.action) {
      callbackUrl += `&action=${encodeURIComponent(deferred.action)}`;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
    // Browser will redirect — no further action needed
  };

  // ──────────────────────────────────────────────────────────
  // Sign Up
  // ──────────────────────────────────────────────────────────

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    // Store current page for "Skip for now" redirect on /welcome
    try {
      localStorage.setItem(PRE_AUTH_PAGE_KEY, window.location.pathname);
    } catch { /* localStorage not available */ }

    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      // If user is already logged in with a DIFFERENT email, sign out first.
      // This handles the case where a provider creates a separate family account.
      if (user && user.email?.toLowerCase() !== email.toLowerCase()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }

      // Use implicit-flow client for signUp to avoid PKCE code_challenge.
      // The SSR browser client forces PKCE, but verifyOtp() can't send
      // the code_verifier back, causing 403 on verification.
      const authClient = createAuthClient();
      const { data: authData, error: authError } = await authClient.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || undefined },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          // Provide a clearer message when user is trying to create a family account
          // but their email is already used for a provider/caregiver account
          if (options.intent === "family") {
            setError(
              "This email is already registered with another account. " +
              "Please use a different email for your family account, or sign in to your existing account."
            );
          } else {
            setError("This email is already registered. Try signing in instead.");
          }
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (!authData.session) {
        if (authData.user?.identities?.length === 0) {
          // Anti-enumeration response: email may be an existing unconfirmed
          // user, or Supabase is masking that it doesn't exist. Either way,
          // signUp() did NOT send a confirmation email in this case. Explicitly
          // resend — if an unconfirmed user exists, this delivers a fresh code.
          // If not, the call fails silently and the user can fall back to
          // sign-in from the OTP screen.
          try {
            await authClient.auth.resend({ type: "signup", email });
          } catch {
            // Ignore — proceed to OTP screen with sign-in fallback
          }
        }
        // For identities.length > 0, signUp() already sent the confirmation
        setOtpContext("signup");
        setResendCooldown(60);
        setLoading(false);
        setStep("verify-otp");
        return;
      }

      // No email confirmation — auth complete
      setLoading(false);
      handleAuthComplete();
    } catch (err) {
      console.error("Sign up error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Sign In
  // ──────────────────────────────────────────────────────────

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Store current page for "Skip for now" redirect on /welcome
    try {
      localStorage.setItem(PRE_AUTH_PAGE_KEY, window.location.pathname);
    } catch { /* localStorage not available */ }

    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Wrong email or password. Please try again."
            : authError.message
        );
        setLoading(false);
        return;
      }

      // Pre-warm the auth cache so the dropdown has data immediately.
      // signInWithPassword triggers SIGNED_IN which starts a background
      // fetch, but we await here to guarantee the cache is warm before
      // the modal closes. 3s timeout as a safety net.
      const userId = signInData?.user?.id;
      if (userId) {
        try {
          await Promise.race([
            refreshAccountData(userId),
            new Promise((_, reject) => setTimeout(() => reject(new Error("prefetch timeout")), 3000)),
          ]);
        } catch {
          // Timeout or error — SIGNED_IN handler will continue in background
        }
      }

      setLoading(false);
      handleAuthComplete();
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // OTP Verification
  // ──────────────────────────────────────────────────────────

  const expectedOtpLength = 8;

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otpCode.length !== expectedOtpLength) {
      setError(`Please enter the ${expectedOtpLength}-digit code.`);
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      // Use implicit-flow client so verifyOtp works without PKCE code_verifier
      const authClient = createAuthClient();
      const { data: verifyData, error: verifyError } = await authClient.auth.verifyOtp({
        email,
        token: otpCode,
        type: otpContext === "signup" ? "signup" : "email",
      });

      if (verifyError) {
        if (verifyError.message.includes("expired")) {
          setError("This code has expired. Please request a new one.");
        } else if (verifyError.message.includes("invalid")) {
          setError("Invalid code. Please check and try again.");
        } else {
          setError(verifyError.message);
        }
        setLoading(false);
        return;
      }

      // Transfer session to SSR client BEFORE closing the modal.
      // setSession is fast (~100ms) — it writes cookies locally and fires
      // the SIGNED_IN event in AuthProvider.
      if (verifyData.session) {
        try {
          await Promise.race([
            createClient().auth.setSession({
              access_token: verifyData.session.access_token,
              refresh_token: verifyData.session.refresh_token,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("setSession timeout")), 2000)),
          ]);
        } catch (err) {
          console.error("[olera] setSession failed or timed out:", err);
        }
      }

      // Pre-warm the auth cache so the dropdown has data immediately.
      // The SIGNED_IN handler also fetches, but we await here to
      // guarantee data is cached before the modal closes. 3s timeout.
      const userId = verifyData.user?.id;
      if (userId) {
        try {
          await Promise.race([
            refreshAccountData(userId),
            new Promise((_, reject) => setTimeout(() => reject(new Error("prefetch timeout")), 3000)),
          ]);
        } catch {
          // Timeout — SIGNED_IN handler continues in background
        }
      }

      setLoading(false);
      handleAuthComplete();
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      // Use implicit-flow client for OTP operations (avoids PKCE mismatch)
      const authClient = createAuthClient();

      if (otpContext === "signup") {
        // For signup confirmation, use the dedicated resend API
        const { error: resendError } = await authClient.auth.resend({
          type: "signup",
          email,
        });
        if (resendError) {
          setError(resendError.message);
          setLoading(false);
          return;
        }
      } else {
        // For sign-in OTP, send a new magic code
        const { error: resendError } = await authClient.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (resendError) {
          setError(resendError.message);
          setLoading(false);
          return;
        }
      }

      setResendCooldown(60);
      setOtpCode("");
      setLoading(false);
    } catch (err) {
      console.error("Resend code error:", err);
      setError("Failed to resend code. Please try again.");
      setLoading(false);
    }
  };

  // Send OTP code for sign-in (alternative to password)
  const handleSendOtpForSignIn = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    // Store current page for "Skip for now" redirect on /welcome
    try {
      localStorage.setItem(PRE_AUTH_PAGE_KEY, window.location.pathname);
    } catch { /* localStorage not available */ }

    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      // Use implicit-flow client for OTP operations (avoids PKCE mismatch)
      const authClient = createAuthClient();
      const { error: otpError } = await authClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        if (otpError.message.includes("not found") || otpError.message.includes("not registered")) {
          setError("No account found with this email. Please sign up first.");
        } else if (otpError.message.includes("not allowed") || otpError.message.includes("disabled")) {
          setError("Email codes aren't available right now. Please use your password or reset it below.");
        } else {
          setError(otpError.message);
        }
        setLoading(false);
        return;
      }

      setOtpContext("signin");
      setResendCooldown(30);
      setLoading(false);
      setStep("verify-otp");
    } catch (err) {
      console.error("Send OTP error:", err);
      setError("Failed to send code. Please try again.");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Forgot Password
  // ──────────────────────────────────────────────────────────

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/auth/reset-password` }
      );

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setForgotPasswordSent(true);
      setLoading(false);
    } catch {
      setError("Failed to send reset email. Please try again.");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // Post-auth routing
  // ──────────────────────────────────────────────────────────

  const handleAuthComplete = async () => {
    // Check for any deferred action (from options or sessionStorage)
    const deferred = options.deferred || getDeferredAction();
    const hasDeferredAction = !!deferred?.action;

    // Deferred returnUrl — skip welcome and redirect to where they were going.
    // Used by the claim page to return after auth (verification-first flow).
    if (deferred?.returnUrl && hasDeferredAction) {
      const safeReturnUrl = validateReturnUrl(deferred.returnUrl, "/browse");
      onClose();
      router.push(safeReturnUrl);
      return;
    }

    // Check if user already has a provider profile (from cache)
    const providerProfile = (profiles || []).find(
      (p) => p.type === "organization" || p.type === "caregiver"
    );
    const hasProviderProfile = !!providerProfile;

    // Provider intent — route to provider onboarding (not /welcome)
    if (options.intent === "provider") {
      onClose();
      if (hasProviderProfile) {
        router.push("/provider");
      } else {
        router.push("/provider/onboarding");
      }
      return;
    }

    // Family intent — route to family welcome page (skip stale profile checks)
    // This handles the case where a provider creates a separate family account.
    if (options.intent === "family") {
      onClose();
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/welcome?next=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Check onboarding_completed directly from API (not React state, which may be stale)
    // This avoids the race condition where setState from refreshAccountData hasn't rendered yet
    if (!hasDeferredAction) {
      try {
        const res = await fetch("/api/auth/ensure-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const { account: freshAccount } = await res.json();
          if (freshAccount?.onboarding_completed === false) {
            onClose();
            // Pass current page as ?next= so they return here after onboarding
            const currentPath = window.location.pathname + window.location.search;

            if (providerProfile) {
              // Route providers to their onboard page
              const slug = providerProfile.slug || providerProfile.source_provider_id || providerProfile.id;
              router.push(`/provider/${slug}/onboard?next=${encodeURIComponent(currentPath)}`);
            } else {
              // Route families to family welcome page
              router.push(`/welcome?next=${encodeURIComponent(currentPath)}`);
            }
            return;
          }

          // Check for incomplete student profile → redirect to student dashboard
          if (freshAccount?.id) {
            try {
              const { createBrowserClient } = await import("@supabase/ssr");
              const sb = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
              );
              const { data: studentProfile } = await sb
                .from("business_profiles")
                .select("id, is_active")
                .eq("account_id", freshAccount.id)
                .eq("type", "student")
                .limit(1)
                .maybeSingle();

              if (studentProfile && !studentProfile.is_active) {
                onClose();
                router.push("/portal/medjobs");
                return;
              }
            } catch {
              // Non-blocking
            }
          }
        }
      } catch {
        // Non-blocking — continue to close modal
      }
    }

    // Close modal — user is authenticated (returning user or has deferred action).
    // AuthProvider handles the rest (including deferred action execution).
    onClose();
  };

  // ──────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────

  const getSize = (): "sm" | "md" | "lg" => {
    return "sm";
  };

  const getOnBack = (): (() => void) | undefined => {
    if (step === "sign-up" || step === "sign-in") {
      return () => { setStep("entry"); setError(""); };
    }
    if (step === "verify-otp") {
      return () => { setStep("entry"); setOtpCode(""); setError(""); };
    }
    return undefined;
  };

  // ──────────────────────────────────────────────────────────
  // Shared UI pieces
  // ──────────────────────────────────────────────────────────

  const inputClass =
    "w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

  const googleButton = (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      Continue with Google
    </button>
  );

  const divider = (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-100" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-white px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">or</span>
      </div>
    </div>
  );

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={getSize()}
      onBack={getOnBack()}
    >
      {/* ─── Entry Screen ─── */}
      {step === "entry" && (
        <div>
          <div className="flex justify-center mb-4">
            <Image
              src="/images/olera-logo.png"
              alt="Olera"
              width={44}
              height={44}
              className="object-contain"
              priority
            />
          </div>

          <h2 className="text-xl font-semibold text-gray-900 text-center mb-1">
            {options.headline || "Log in or sign up"}
          </h2>
          {options.subline && (
            <p className="text-sm text-gray-500 text-center mb-6">{options.subline}</p>
          )}
          {!options.subline && <div className="mb-5" />}

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm" role="alert">
              {error}
            </div>
          )}

          {googleButton}

          {divider}

          <form onSubmit={handleEmailContinue} className="space-y-3">
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              className={inputClass}
            />
            <Button type="submit" fullWidth size="lg" loading={checkingEmail}>
              Continue
            </Button>
          </form>

          <p className="text-center text-[13px] text-gray-400 mt-5 leading-relaxed">
            By continuing, you agree to our{" "}
            <span className="text-gray-500">Terms</span> and{" "}
            <span className="text-gray-500">Privacy Policy</span>
          </p>
        </div>
      )}

      {/* ─── Sign Up Screen ─── */}
      {step === "sign-up" && (
        <div>
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Create your account</h2>
            <p className="text-sm text-gray-500 mt-1">{email}</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-3">
            <input
              type="text"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className={inputClass}
            />

            <div>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-gray-400">Must be at least 8 characters</p>
            </div>

            <Button type="submit" loading={loading} fullWidth size="lg">
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-5">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => { setStep("sign-in"); setError(""); }}
              className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none"
            >
              Sign in
            </button>
          </p>
        </div>
      )}

      {/* ─── Sign In Screen ─── */}
      {step === "sign-in" && (
        <div>
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">{email || "Sign in to your account"}</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-3">
            {!email && (
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                autoComplete="email"
                className={inputClass}
              />
            )}

            <div>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="current-password"
                className={inputClass}
              />
              {/* Links grouped with input, proper touch targets, space before button */}
              <div className="flex justify-between mt-1.5 -mx-2">
                <button
                  type="button"
                  onClick={handleSendOtpForSignIn}
                  disabled={loading || !email.trim()}
                  className="min-h-[44px] px-2 flex items-center text-[15px] text-primary-600 hover:text-primary-700 font-medium focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Email me a code instead
                </button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading || !email.trim()}
                  className="min-h-[44px] px-2 flex items-center text-[15px] text-gray-400 hover:text-gray-600 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            {forgotPasswordSent && (
              <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-sm" role="status">
                Password reset email sent to <span className="font-medium">{email}</span>. Check your inbox.
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" loading={loading} fullWidth size="lg">
                Sign in
              </Button>
            </div>
          </form>

          <p className="text-center text-sm text-gray-400 mt-5">
            New to Olera?{" "}
            <button
              type="button"
              onClick={() => { setStep("entry"); setError(""); }}
              className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none"
            >
              Create an account
            </button>
          </p>
        </div>
      )}

      {/* ─── Verify OTP Screen ─── */}
      {step === "verify-otp" && (
        <div>
          <div className="flex justify-center mb-4">
            <div className="w-11 h-11 rounded-full bg-primary-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the code sent to <span className="font-medium text-gray-700">{email}</span>
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <OtpInput value={otpCode} onChange={setOtpCode} disabled={loading} length={expectedOtpLength} />

            <Button type="submit" loading={loading} fullWidth size="lg" disabled={otpCode.length !== expectedOtpLength}>
              Verify
            </Button>

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-gray-400">Resend in {resendCooldown}s</p>
              ) : (
                <p className="text-sm text-gray-500">
                  Didn&apos;t get a code?{" "}
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none disabled:opacity-50"
                  >
                    Resend
                  </button>
                </p>
              )}
            </div>

            {otpContext === "signin" && (
              <p className="text-center text-sm text-gray-400 mt-1">
                <button
                  type="button"
                  onClick={() => { setStep("sign-in"); setOtpCode(""); setError(""); }}
                  className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none"
                >
                  Use password instead
                </button>
              </p>
            )}

            {otpContext === "signup" && (
              <p className="text-center text-sm text-gray-400 mt-1">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setStep("sign-in"); setOtpCode(""); setError(""); }}
                  className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none"
                >
                  Sign in instead
                </button>
              </p>
            )}
          </form>
        </div>
      )}

    </Modal>
  );
}
