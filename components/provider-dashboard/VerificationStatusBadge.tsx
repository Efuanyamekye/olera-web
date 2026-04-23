"use client";

import { useState, useRef, useEffect } from "react";

type VerificationState = "not_required" | "unverified" | "pending" | "verified" | "rejected";

interface ProfileMetadata {
  badge_approved?: boolean;
}

interface VerificationStatusBadgeProps {
  /** Profile metadata containing badge_approved status */
  metadata?: ProfileMetadata | null;
  /** The verification_state from the profile */
  verificationState?: VerificationState | null;
  /** Callback when user clicks to open verification form (for unverified/rejected states) */
  onVerifyClick?: () => void;
}

/**
 * Badge component that shows verification status for providers.
 *
 * States:
 * - 'not_required': High trust, no badge shown (ProfileOverviewCard shows "Claimed")
 * - 'unverified': Needs verification, shows amber "Pending verification"
 * - 'pending': Submitted, awaiting review, shows amber "Pending verification"
 * - 'verified' or badge_approved: Shows green "Verified"
 * - 'rejected': Rejected, shows amber "Pending verification" with resubmit prompt
 */
export default function VerificationStatusBadge({
  metadata,
  verificationState,
  onVerifyClick,
}: VerificationStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);

  // Check if we're on mobile (below lg breakpoint)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close tooltip when clicking outside (desktop only)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    }

    if (showTooltip && !isMobile) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTooltip, isMobile]);

  // Determine the effective state
  // Priority: badge_approved (legacy) > verificationState
  const isVerified = metadata?.badge_approved === true || verificationState === "verified";
  const isPending = verificationState === "pending";
  const isUnverified = verificationState === "unverified";
  const isRejected = verificationState === "rejected";
  const needsVerification = isUnverified || isPending || isRejected;

  // Don't render for 'not_required' state or if no state info
  if (verificationState === "not_required" || (!isVerified && !needsVerification)) {
    return null;
  }

  const handleBadgeClick = () => {
    if (isMobile) {
      setShowSheet(true);
    } else {
      setShowTooltip(!showTooltip);
    }
  };

  const handleClose = () => {
    setShowTooltip(false);
    setShowSheet(false);
  };

  // Get badge styling and content based on state
  const getBadgeConfig = () => {
    if (isVerified) {
      return {
        bgClass: "bg-green-50 text-green-700 border-green-200",
        icon: (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Verified",
      };
    }
    // All other states show amber "Pending verification"
    return {
      bgClass: "bg-amber-50 text-amber-700 border-amber-200",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      label: "Pending verification",
    };
  };

  const badgeConfig = getBadgeConfig();

  // Get tooltip content based on state
  const getTooltipConfig = () => {
    if (isVerified) {
      return {
        iconBg: "bg-green-100",
        iconColor: "text-green-600",
        title: "Verified Business",
        description:
          "This profile has been verified. Families can trust that this is a legitimate business.",
        showCta: false,
      };
    }
    if (isPending) {
      return {
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
        title: "Verification in Review",
        description:
          "We're reviewing your submission. You'll hear from us within 3 hours during business hours.",
        showCta: false,
      };
    }
    if (isRejected) {
      return {
        iconBg: "bg-amber-100",
        iconColor: "text-amber-600",
        title: "Verification Needs Update",
        description:
          "Your previous submission needs more information. Please resubmit with updated details.",
        showCta: true,
        ctaLabel: "Resubmit verification",
      };
    }
    // isUnverified
    return {
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      title: "Verification Required",
      description:
        "Complete verification to unlock all features and show families you're a trusted provider.",
      showCta: true,
      ctaLabel: "Complete verification",
    };
  };

  const tooltipConfig = getTooltipConfig();

  const TooltipContent = ({ inSheet = false }: { inSheet?: boolean }) => (
    <div className={inSheet ? "" : "relative"}>
      <div className={`flex items-center gap-2 ${inSheet ? "mb-2" : "mb-1"}`}>
        <div className={`w-8 h-8 rounded-full ${tooltipConfig.iconBg} flex items-center justify-center`}>
          {isVerified ? (
            <svg className={`w-4 h-4 ${tooltipConfig.iconColor}`} fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg className={`w-4 h-4 ${tooltipConfig.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>
        <h4 className={`font-semibold text-gray-900 ${inSheet ? "text-base" : "text-sm"}`}>
          {tooltipConfig.title}
        </h4>
      </div>
      <p className={`text-gray-500 leading-relaxed ${inSheet ? "text-sm" : "text-xs"}`}>
        {tooltipConfig.description}
      </p>
      {tooltipConfig.showCta && onVerifyClick && (
        <button
          type="button"
          onClick={() => {
            handleClose();
            onVerifyClick();
          }}
          className={`mt-3 w-full px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors ${
            inSheet ? "" : "text-xs"
          }`}
        >
          {tooltipConfig.ctaLabel}
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="relative inline-block">
        <button
          ref={badgeRef}
          type="button"
          onClick={handleBadgeClick}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all hover:opacity-80 ${badgeConfig.bgClass}`}
        >
          {badgeConfig.icon}
          {badgeConfig.label}
        </button>

        {/* Desktop Tooltip */}
        {showTooltip && !isMobile && (
          <div
            ref={tooltipRef}
            className="absolute top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50 right-0"
            style={{ animation: "fade-in 0.15s ease-out both" }}
          >
            {/* Arrow */}
            <div className="absolute -top-2 right-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45" />
            <TooltipContent />
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet */}
      {showSheet && isMobile && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={handleClose}
            style={{ animation: "fade-in 0.2s ease-out both" }}
          />

          {/* Sheet */}
          <div
            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-xl pb-[env(safe-area-inset-bottom)]"
            style={{ animation: "slide-up 0.3s ease-out both" }}
          >
            {/* Handle */}
            <div className="pt-3 pb-2 px-6 border-b border-gray-100">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-bold text-gray-900">
                  {tooltipConfig.title}
                </h3>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <TooltipContent inSheet />
            </div>

            {/* Safe area padding for iPhone */}
            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
