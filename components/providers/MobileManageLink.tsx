"use client";

import { useRouter } from "next/navigation";

interface MobileManageLinkProps {
  providerSlug: string;
}

export function MobileManageLink({ providerSlug }: MobileManageLinkProps) {
  const router = useRouter();

  // Route directly to onboarding - no modal needed
  const handleClick = () => {
    router.push(`/provider/onboarding?org=${providerSlug}&returnTo=/provider/${providerSlug}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap"
    >
      Manage this page
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
