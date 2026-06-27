"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

// ============================================================
// Utility Functions
// ============================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.com";
  const maskedLocal =
    local.length <= 2
      ? "*".repeat(local.length)
      : local[0] + "***" + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// ============================================================
// Info Tooltip Component
// ============================================================

function InfoTooltip({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="p-1 -m-0.5 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
        aria-label="More information"
        aria-expanded={isOpen}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-[200] w-64 p-3 bg-gray-900 text-white text-sm rounded-xl shadow-xl"
          role="tooltip"
        >
          <div className="absolute -top-1.5 right-3 w-3 h-3 bg-gray-900 rotate-45" />
          <p className="relative text-[13px] leading-relaxed text-gray-100">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

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
  providerName,
  providerId,
  sourceProviderId,
  providerEmail,
  providerCity,
  providerState,
  isClaimed = false,
  claimAccountId,
}: ManagePageCTAProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { account } = useAuth();

  // Check if current user is the owner
  const isOwner = isClaimed && !!account && !!claimAccountId && account.id === claimAccountId;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Claim flow: Route to unified onboarding page with org pre-selected
  // User already knows which org they're claiming, so pre-fill it
  const handleClaimClick = useCallback(() => {
    setOpen(false);
    // Add returnTo param so Exit button returns to this provider's page
    router.push(`/provider/onboarding?org=${providerSlug}&returnTo=/provider/${providerSlug}`);
  }, [router, providerSlug]);

  const handleRemoval = useCallback(() => {
    setOpen(false);
    router.push(
      `/for-providers/removal-request/${providerSlug}?provider_name=${encodeURIComponent(providerName)}&provider_id=${encodeURIComponent(sourceProviderId || providerId)}`
    );
  }, [router, providerSlug, providerName, sourceProviderId, providerId]);

  // Hide CTA for claimed owners - they're in limbo until verified
  // They can access portal via header navigation
  if (isOwner) {
    return null;
  }

  return (
    <>
      {/* Inline CTA trigger - shown for unclaimed or claimed non-owners */}
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
          onClick={() => setOpen(true)}
          className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          Manage this page <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            style={{ animation: "fade-in 150ms ease-out" }}
          />

          {/* Dialog */}
          <div
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "modal-enter 200ms ease-out" }}
          >
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Claim card - same for unclaimed and claimed (routes to onboarding) */}
            <div className="text-center">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                </div>
                {/* Title with tooltip */}
                <h2 className="text-lg font-display font-bold text-gray-900 mb-1.5 inline-flex items-center gap-1.5">
                  Manage this page
                  <InfoTooltip content="Sign in with your business email. If it matches our records, you'll get instant access to manage this page." />
                </h2>
                {/* Conditional subtitle */}
                <p className="text-[15px] text-gray-500 leading-relaxed mb-4">
                  {providerEmail
                    ? <>Sign in with <span className="font-semibold text-gray-700">{maskEmail(providerEmail)}</span> for instant access.</>
                    : "Use your business email for instant verification."}
                </p>
                {/* CTA - routes to onboard page */}
                <button
                  onClick={handleClaimClick}
                  className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 active:scale-[0.99] transition-all min-h-[48px] flex items-center justify-center gap-1.5"
                >
                  Get started
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
            </div>

            {/* Divider + Removal link */}
            <div className="flex items-center gap-3 mt-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <button
              onClick={handleRemoval}
              className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Request to hide or remove page
            </button>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-enter {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}
