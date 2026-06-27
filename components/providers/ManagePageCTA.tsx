"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

// ============================================================
// Main Component
// ============================================================

interface ManagePageCTAProps {
  providerSlug: string;
  providerName: string;
  providerId: string;
  /** The olera-providers.provider_id (for claiming) */
  sourceProviderId?: string | null;
  /** Provider's email on file */
  providerEmail?: string | null;
  /** Provider's city */
  providerCity?: string | null;
  /** Provider's state */
  providerState?: string | null;
  /** Whether listing is already claimed */
  isClaimed?: boolean;
  /** Account ID of claimer (for ownership check) */
  claimAccountId?: string | null;
}

export default function ManagePageCTA({
  providerSlug,
  isClaimed = false,
  claimAccountId,
}: ManagePageCTAProps) {
  const router = useRouter();
  const { account } = useAuth();

  // Check if current user is the owner
  const isOwner = isClaimed && !!account && !!claimAccountId && account.id === claimAccountId;

  // Hide CTA for claimed owners - they're in limbo until verified
  // They can access portal via header navigation
  if (isOwner) {
    return null;
  }

  // Route directly to onboarding - no modal needed
  const handleClick = () => {
    router.push(`/provider/onboarding?org=${providerSlug}&returnTo=/provider/${providerSlug}`);
  };

  return (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <svg
        className="w-4 h-4 text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
      <span className="text-gray-500">Is this your business?</span>
      <button
        onClick={handleClick}
        className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
      >
        Manage this page <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
