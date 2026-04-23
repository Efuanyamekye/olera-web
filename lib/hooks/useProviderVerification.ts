"use client";

import { useState, useCallback } from "react";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import type { VerificationState } from "@/lib/types";

interface UseProviderVerificationReturn {
  /** True if provider is verified or doesn't require verification (high trust) */
  isVerified: boolean;
  /** The raw verification state from the profile */
  verificationState: VerificationState | null;
  /** True while profile data is loading */
  isLoading: boolean;
  /** Profile ID for the provider */
  profileId: string | null;
  /** Provider's display name (for modal) */
  providerName: string | null;
  /** Whether the verification modal is open */
  isModalOpen: boolean;
  /** Open the verification modal */
  openModal: () => void;
  /** Close the verification modal */
  closeModal: () => void;
}

/**
 * Hook to check provider verification status and manage the verification modal.
 *
 * Usage:
 * ```tsx
 * const { isVerified, isModalOpen, openModal, closeModal } = useProviderVerification();
 *
 * // Gate an action
 * const handleSendMessage = () => {
 *   if (!isVerified) {
 *     openModal();
 *     return;
 *   }
 *   // ... send message
 * };
 * ```
 */
export function useProviderVerification(): UseProviderVerificationReturn {
  const profile = useProviderProfile();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const verificationState = profile?.verification_state ?? null;

  // Consider verified if state is "verified" or "not_required"
  // Note: "not_required" is for high-trust providers who auto-verified at claim time
  const isVerified =
    verificationState === "verified" ||
    verificationState === "not_required";

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return {
    isVerified,
    verificationState,
    isLoading: profile === null,
    profileId: profile?.id ?? null,
    providerName: profile?.display_name ?? null,
    isModalOpen,
    openModal,
    closeModal,
  };
}
