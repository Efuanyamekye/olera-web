"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Redirects logged-in providers away from the marketing page
 * to their dashboard. The /for-providers page is for people who
 * aren't providers yet.
 */
export default function ProviderRedirect() {
  const router = useRouter();
  const { activeProfile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Provider → redirect to dashboard (they don't need marketing page)
    if (activeProfile?.type === "organization") {
      router.replace("/provider");
      return;
    }
  }, [activeProfile, isLoading, router]);

  return null;
}
