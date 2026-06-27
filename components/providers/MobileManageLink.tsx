"use client";

import { useState } from "react";
import ManageListingModal from "./ManageListingModal";
import type { ClaimState } from "@/lib/types";

interface MobileManageLinkProps {
  providerName: string;
  providerSlug: string;
  providerId: string;
  sourceProviderId?: string | null;
  providerEmail?: string | null;
  providerCity?: string | null;
  providerState?: string | null;
  claimState?: ClaimState;
  claimAccountId?: string | null;
}

export function MobileManageLink({
  providerName,
  providerSlug,
  providerId,
  sourceProviderId,
  providerEmail,
  providerCity,
  providerState,
  claimState,
  claimAccountId,
}: MobileManageLinkProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-700 whitespace-nowrap"
      >
        Manage this page
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <ManageListingModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        providerName={providerName}
        providerSlug={providerSlug}
        providerId={providerId}
        sourceProviderId={sourceProviderId}
        providerEmail={providerEmail}
        providerCity={providerCity}
        providerState={providerState}
        claimState={claimState}
        claimAccountId={claimAccountId}
      />
    </>
  );
}
