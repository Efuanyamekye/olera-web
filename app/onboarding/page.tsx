"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import Button from "@/components/ui/Button";

/**
 * /onboarding — Simplified redirect page.
 *
 * - Authenticated + onboarding complete → redirect to /portal
 * - Authenticated + no profile → open unified auth modal in post-auth mode
 * - Unauthenticated → open unified auth modal in sign-up mode
 */
export default function OnboardingPage() {
  const { user, account, isLoading, openAuth } = useAuth();
  const router = useRouter();
  const [prompted, setPrompted] = useState(false);

  useEffect(() => {
    if (isLoading || prompted) return;

    if (user && account?.onboarding_completed) {
      router.replace("/portal");
      return;
    }

    if (user && account && !account.onboarding_completed) {
      setPrompted(true);
      openAuth({ startAtPostAuth: true });
      return;
    }

    if (!user) {
      setPrompted(true);
      openAuth({ defaultMode: "sign-up" });
    }
  }, [isLoading, user, account, prompted, openAuth, router]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create your profile
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          Sign in or create an account to get started on Olera.
        </p>
        <Button size="lg" onClick={() => openAuth({ defaultMode: "sign-up" })}>
          Get started
        </Button>
        <p className="mt-4 text-base text-gray-500">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => openAuth({ defaultMode: "sign-in" })}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
