"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

type AuthView = "sign-in" | "sign-up";

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, account } = useAuth();
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError("");
    setLoading(false);
    setView("sign-in");
  };

  const handleClose = () => {
    resetForm();
    closeAuthModal();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

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

    // If onboarding not completed, redirect
    // Account data will be refreshed by AuthProvider's onAuthStateChange
    // We check after a short delay to let the state update
    setTimeout(() => {
      if (account && !account.onboarding_completed) {
        router.push("/onboarding");
      }
    }, 100);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
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

    setLoading(false);
    handleClose();

    // New users always go to onboarding
    router.push("/onboarding");
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={handleClose}
      title={view === "sign-in" ? "Welcome back" : "Create your account"}
      size="sm"
    >
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
    </Modal>
  );
}
