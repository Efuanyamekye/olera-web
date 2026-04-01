"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Redirects logged-in providers and caregivers away from the family homepage
 * to their respective dashboards.
 */
export default function HomeRedirect() {
  const router = useRouter();
  const { activeProfile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Provider → redirect to provider dashboard
    if (activeProfile?.type === "organization") {
      router.replace("/provider");
      return;
    }

    // MedJobs caregiver (student or legacy caregiver type) → redirect to MedJobs portal
    if (activeProfile?.type === "student" || activeProfile?.type === "caregiver") {
      router.replace("/portal/medjobs");
      return;
    }

    // Family or logged out → stay on homepage
  }, [activeProfile, isLoading, router]);

  // This component renders nothing - it just handles redirects
  return null;
}
