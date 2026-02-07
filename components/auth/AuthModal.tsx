"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDeferredAction } from "@/lib/deferred-action";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

type AuthView = "sign-in" | "sign-up" | "check-email" | "verify-otp";

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalDefaultView } = useAuth();
  const [view, setView] = useState<AuthView>("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Sync view with the requested default when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setView(authModalDefaultView);
    }
  }, [isAuthModalOpen, authModalDefaultView]);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setOtpCode("");
    setError("");
    setLoading(false);
    setResendCooldown(0);
  };

  const handleClose = () => {
    resetForm();
    closeAuthModal();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!isSupabaseConfigured()) {
        setError("Authentication is not configured. Please set up Supabase environment variables.");
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
      handleClose();

      // Check for deferred action with a returnUrl (e.g., claim or create flow)
      const deferred = getDeferredAction();
      if (deferred?.returnUrl) {
        router.push(deferred.returnUrl);
      }
      // No setTimeout — auth listener in AuthProvider handles state.
      // If onboarding isn't complete, the navbar shows "Complete your profile".
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

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
        setError("Authentication is not configured. Please set up Supabase environment variables.");
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || undefined,
          },
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
      // When confirmation is required, session will be null and user.identities may be empty
      if (!data.session) {
        // If identities is empty, the email is already taken (Supabase doesn't error for security)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError("This email is already registered. Try signing in instead.");
          setLoading(false);
          return;
        }

        // Email confirmation required — show a message instead of redirecting
        setLoading(false);
        setView("check-email");
        return;
      }

      // No email confirmation — user is signed in immediately
      setLoading(false);
      handleClose();

      // Check for deferred action with a returnUrl (e.g., claim or create flow)
      // Don't clear — let the target page consume and clear the deferred action
      const deferred = getDeferredAction();
      if (deferred?.returnUrl) {
        router.push(deferred.returnUrl);
      } else {
        router.push("/onboarding");
      }
    } catch (err) {
      console.error("Sign up error:", err);
      setError("Something went wrong. Please try again.");
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
        options: {
          shouldCreateUser: false, // Only existing users can use this
        },
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
      setView("verify-otp");
    } catch (err) {
      console.error("Send OTP error:", err);
      setError("Failed to send code. Please try again.");
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // Successfully signed in
      setLoading(false);
      handleClose();

      // Check for deferred action with a returnUrl
      const deferred = getDeferredAction();
      if (deferred?.returnUrl) {
        router.push(deferred.returnUrl);
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
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
        options: {
          shouldCreateUser: false,
        },
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
      console.error("Resend OTP error:", err);
      setError("Failed to resend code. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={handleClose}
      title={
        view === "check-email"
          ? "Check your email"
          : view === "verify-otp"
          ? "Verify your email"
          : view === "sign-in"
          ? "Welcome back"
          : "Create your account"
      }
      size="sm"
    >
      {view === "check-email" ? (
        <div className="text-center py-4">
          <div className="mb-4">
            <svg className="w-16 h-16 text-primary-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-lg text-gray-900 mb-2">
            We sent a confirmation link to <strong>{email}</strong>.
          </p>
          <p className="text-base text-gray-600 mb-6">
            Click the link in the email to activate your account, then come back here and sign in.
          </p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => {
              setView("sign-in");
              setError("");
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : view === "verify-otp" ? (
        <div className="py-2">
          <div className="text-center mb-6">
            <div className="mb-4">
              <svg className="w-14 h-14 text-primary-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-base text-gray-600">We sent a verification code to</p>
            <p className="font-semibold text-gray-900 mt-1">{email}</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 text-center mb-3">
                Enter 8-digit code
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="12345678"
                className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                disabled={loading}
                autoComplete="one-time-code"
              />
            </div>

            <Button type="submit" loading={loading} fullWidth size="md" disabled={otpCode.length !== 8}>
              Verify & sign in
            </Button>

            <div className="text-center space-y-3">
              <p className="text-sm text-gray-500">Didn&apos;t receive the code?</p>
              {resendCooldown > 0 ? (
                <p className="text-sm text-gray-400">Resend available in {resendCooldown}s</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-primary-600 hover:text-primary-700 font-medium text-sm focus:outline-none focus:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setView("sign-in");
                    setOtpCode("");
                    setError("");
                  }}
                  className="text-gray-500 hover:text-gray-700 text-sm focus:outline-none focus:underline"
                >
                  Use a different email
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
      <form
        onSubmit={view === "sign-in" ? handleSignIn : handleSignUp}
        className="space-y-4"
      >
        {view === "sign-up" && (
          <Input
            label="Your name"
            type="text"
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
            placeholder="First and last name"
            autoComplete="name"
          />
        )}

        <Input
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />

        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
            placeholder={view === "sign-up" ? "At least 8 characters" : "Your password"}
            required
            autoComplete={view === "sign-up" ? "new-password" : "current-password"}
            helpText={view === "sign-up" ? "Must be at least 8 characters" : undefined}
          />
          {view === "sign-in" && (
            <button
              type="button"
              onClick={handleSendOtpForSignIn}
              disabled={loading || !email.trim()}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Email me a code instead
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-base" role="alert">
            {error}
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          fullWidth
          size="md"
        >
          {view === "sign-in" ? "Sign in" : "Create account"}
        </Button>

        <p className="text-center text-base text-gray-500 pt-2">
          {view === "sign-in" ? (
            <>
              New to Olera?{" "}
              <button
                type="button"
                onClick={() => {
                  setView("sign-up");
                  setError("");
                }}
                className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setView("sign-in");
                  setError("");
                }}
                className="text-primary-600 hover:text-primary-700 font-medium focus:outline-none focus:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </form>
      )}
    </Modal>
  );
}
