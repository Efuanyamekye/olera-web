"use client";

import { useState, useCallback } from "react";
import type { VerificationResult } from "@/components/provider/VerificationMethodModal";

interface UseVerificationModalOptions {
  profileId: string;
  claimerName?: string;
  onVerified?: () => void;
  onPendingReview?: () => void;
  onDismissed?: () => void;
}

interface UseVerificationModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  handleSubmit: (result: VerificationResult) => Promise<{ verified: boolean; pendingReview: boolean }>;
  handleDismiss: () => void;
  isVerified: boolean;
  isPendingReview: boolean;
}

/**
 * Hook to manage the verification modal state and API calls.
 *
 * Usage:
 * ```tsx
 * const { isOpen, open, close, handleSubmit, handleDismiss, isVerified } = useVerificationModal({
 *   profileId: profile.id,
 *   claimerName: "John Doe",
 *   onVerified: () => router.refresh(),
 * });
 *
 * <VerificationMethodModal
 *   isOpen={isOpen}
 *   onClose={close}
 *   onSubmit={handleSubmit}
 *   onDismiss={handleDismiss}
 *   businessName={profile.display_name}
 * />
 * ```
 */
export function useVerificationModal({
  profileId,
  claimerName,
  onVerified,
  onPendingReview,
  onDismissed,
}: UseVerificationModalOptions): UseVerificationModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isPendingReview, setIsPendingReview] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleSubmit = useCallback(
    async (result: VerificationResult): Promise<{ verified: boolean; pendingReview: boolean }> => {
      const response = await fetch("/api/provider/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          method: result.method,
          value: result.value,
          documentData: result.documentData,
          documentType: result.documentType,
          linkedinScreenshots: result.linkedinScreenshots,
          // Use fullName from form (preferred) or fallback to pre-configured claimerName
          claimerName: result.fullName || claimerName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.reason || "Verification failed");
      }

      if (data.verified) {
        // Instant verification succeeded
        setIsVerified(true);
        setIsPendingReview(false);
        onVerified?.();
        return { verified: true, pendingReview: false };
      } else if (data.pendingReview) {
        // Sent to manual review - user completed their part but not yet verified
        setIsVerified(false);
        setIsPendingReview(true);
        onPendingReview?.();
        return { verified: false, pendingReview: true };
      } else {
        // Verification failed with a reason
        throw new Error(data.reason || "Could not verify. Please try a different method.");
      }
    },
    [profileId, claimerName, onVerified, onPendingReview]
  );

  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    onDismissed?.();
  }, [onDismissed]);

  return {
    isOpen,
    open,
    close,
    handleSubmit,
    handleDismiss,
    isVerified,
    isPendingReview,
  };
}
