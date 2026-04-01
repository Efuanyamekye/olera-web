"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Redirects logged-in caregivers away from the marketing page
 * to their dashboard. The /medjobs page is for people who
 * aren't caregivers yet.
 */
export default function CaregiverRedirect() {
  const router = useRouter();
  const { activeProfile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Caregiver → redirect to dashboard (they don't need marketing page)
    // Includes both "student" (new) and "caregiver" (legacy) types
    if (activeProfile?.type === "student" || activeProfile?.type === "caregiver") {
      router.replace("/portal/medjobs");
      return;
    }
  }, [activeProfile, isLoading, router]);

  return null;
}
