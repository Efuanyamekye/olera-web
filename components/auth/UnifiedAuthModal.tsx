"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth, type OpenAuthOptions } from "@/components/auth/AuthProvider";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import OtpInput from "@/components/auth/OtpInput";
import PostAuthOnboarding from "@/components/auth/PostAuthOnboarding";

// ============================================================
// Types
// ============================================================

type AuthStep = "entry" | "sign-up" | "sign-in" | "verify-otp" | "post-auth";

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
  const { user, account, refreshAccountData } = useAuth();

  // Determine initial step
  const getInitialStep = useCallback((): AuthStep => {
    if (options.startAtPostAuth) return "post-auth";
    return "entry";
  }, [options.startAtPostAuth]);

  const [step, setStep] = useState<AuthStep>(getInitialStep);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checkingEmail, setCheckingEmail] = useState(false);

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
  // Email-first flow: check if email exists
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

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
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

    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || undefined },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError("This email is already registered. Try signing in instead.");
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (!authData.session) {
        if (authData.user?.identities?.length === 0) {
          setError("This email is already registered. Try signing in instead.");
          setLoading(false);
          return;
        }

        // Send an explicit OTP code for verification
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });

        if (otpError) {
          console.error("Failed to send OTP:", otpError);
        }

        setResendCooldown(30);
        setLoading(false);
        setStep("verify-otp");
        return;
      }

      // No email confirmation — proceed to post-auth
      setLoading(false);
      await handleAuthComplete();
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
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
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

      setLoading(false);
      await handleAuthComplete();
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // OTP Verification
  // ──────────────────────────────────────────────────────────

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otpCode.length !== 8) {
      setError("Please enter the 8-digit code.");
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
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "email",
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

      setLoading(false);
      await handleAuthComplete();
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

      const supabase = createClient();
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (resendError) {
        setError(resendError.message);
        setLoading(false);
        return;
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

    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        if (otpError.message.includes("not found") || otpError.message.includes("not registered")) {
          setError("No account found with this email. Please sign up first.");
        } else {
          setError(otpError.message);
        }
        setLoading(false);
        return;
      }

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
  // Post-auth routing
  // ──────────────────────────────────────────────────────────

  const handleAuthComplete = async () => {
    // Refresh auth context to pick up account data
    await refreshAccountData();

    // Check if user has a completed profile
    // Re-read from Supabase since refreshAccountData is async and state might not be updated yet
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: acct } = await supabase
          .from("accounts")
          .select("onboarding_completed")
          .eq("user_id", currentUser.id)
          .single();

        if (acct?.onboarding_completed) {
          // Existing user with profile — close modal
          onClose();
          return;
        }
      }
    }

    // New user — show post-auth onboarding
    setStep("post-auth");
  };

  const handlePostAuthComplete = () => {
    onClose();
  };

  // ──────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────

  const getSize = (): "sm" | "md" | "lg" => {
    if (step === "post-auth") return "lg";
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

          <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
            Log in or sign up
          </h2>

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
              <div className="flex justify-between mt-2">
                <button
                  type="button"
                  onClick={handleSendOtpForSignIn}
                  disabled={loading || !email.trim()}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Email me a code instead
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} fullWidth size="lg">
              Sign in
            </Button>
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
            <OtpInput value={otpCode} onChange={setOtpCode} disabled={loading} />

            <Button type="submit" loading={loading} fullWidth size="lg" disabled={otpCode.length !== 8}>
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
          </form>
        </div>
      )}

      {/* ─── Post-Auth Onboarding ─── */}
      {step === "post-auth" && (
        <PostAuthOnboarding
          intent={options.intent ?? null}
          providerType={options.providerType ?? null}
          claimProfile={options.claimProfile ?? null}
          onComplete={handlePostAuthComplete}
        />
      )}
    </Modal>
  );
}
