"use client";

import { useState, useCallback } from "react";
import type { VerificationResult } from "@/components/provider/VerificationMethodModal";

interface UseVerificationModalOptions {
  profileId: string;
  claimerName?: string;
  onVerified?: () => void;
  onDismissed?: () => void;
}

interface UseVerificationModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  handleSubmit: (result: VerificationResult) => Promise<void>;
  handleDismiss: () => void;
  isVerified: boolean;
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
  onDismissed,
}: UseVerificationModalOptions): UseVerificationModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleSubmit = useCallback(
    async (result: VerificationResult) => {
      const response = await fetch("/api/provider/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          method: result.method,
          value: result.value,
          documentData: result.documentData,
          documentType: result.documentType,
          claimerName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.reason || "Verification failed");
      }

      if (data.verified) {
        setIsVerified(true);
        onVerified?.();
      } else if (data.suggestion) {
        // Not auto-verified but sent to manual review
        // Still show success screen since they completed the flow
        setIsVerified(true);
        onVerified?.();
      } else {
        // Verification failed with a reason
        throw new Error(data.reason || "Could not verify. Please try a different method.");
      }
    },
    [profileId, claimerName, onVerified]
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
  };
}
