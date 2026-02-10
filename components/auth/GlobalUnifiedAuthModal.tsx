"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import UnifiedAuthModal from "@/components/auth/UnifiedAuthModal";

/**
 * Global wrapper that renders UnifiedAuthModal based on context state.
 * Include this once in your root layout.
 */
export default function GlobalUnifiedAuthModal() {
  const { isUnifiedAuthOpen, closeUnifiedAuth, unifiedAuthOptions } = useAuth();

  return (
    <UnifiedAuthModal
      isOpen={isUnifiedAuthOpen}
      onClose={closeUnifiedAuth}
      options={unifiedAuthOptions}
    />
  );
}
