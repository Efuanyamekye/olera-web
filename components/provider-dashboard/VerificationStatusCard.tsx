"use client";

import Link from "next/link";

interface ProfileMetadata {
  verification_submission?: {
    name: string;
    role: string;
    phone?: string | null;
    submitted_at: string;
  };
  badge_approved?: boolean;
  badge_rejected?: boolean;
}

interface VerificationStatusCardProps {
  /** Profile metadata containing verification_submission and badge_approved */
  metadata?: ProfileMetadata | null;
  /** Profile verification_state (e.g., "verified", "unverified", "pending") */
  verificationState?: string | null;
  /** Callback when provider wants to submit verification form */
  onRequestVerification: () => void;
}

/**
 * Badge request card for the sidebar.
 * Shows if:
 * - Provider hasn't submitted the form yet, OR
 * - Provider was rejected (can resubmit)
 *
 * Hides if:
 * - Badge is admin-approved (badge_approved = true)
 * - Provider is self-verified (verification_state = "verified")
 * - Form submitted and pending review (not yet approved/rejected)
 *
 * Note: This is now for optional badge requests, not access control.
 * Everyone has full access via email verification.
 */
export default function VerificationStatusCard({
  metadata,
  verificationState,
  onRequestVerification,
}: VerificationStatusCardProps) {
  // Don't render if already verified:
  // - badge_approved = admin-approved badge
  // - verified = self-verified or admin-approved
  // - not_required = high-trust auto-verified at claim time
  if (metadata?.badge_approved || verificationState === "verified" || verificationState === "not_required") {
    return null;
  }

  const wasRejected = metadata?.badge_rejected === true;
  const hasSubmission = !!metadata?.verification_submission;

  // If form submitted and not rejected, hide (pending review)
  if (hasSubmission && !wasRejected) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 border-b border-gray-100 ${wasRejected ? "bg-gradient-to-r from-amber-50/50 to-white" : "bg-gradient-to-r from-primary-50/50 to-white"}`}>
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${wasRejected ? "bg-amber-100" : "bg-primary-100"}`}>
            <svg className={`w-5 h-5 ${wasRejected ? "text-amber-600" : "text-primary-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>

          {/* Title + Subtitle */}
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-gray-900">
              {wasRejected ? "Resubmit for Badge" : "Get Verified Badge"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {wasRejected ? "Your previous request needs attention" : "Stand out to families"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          {wasRejected
            ? "Your badge request wasn't approved. Please update your information and try again."
            : "Add a trust badge to your profile. Verified providers stand out and get more inquiries."
          }
        </p>
        <button
          type="button"
          onClick={onRequestVerification}
          className="w-full py-3 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors"
        >
          {wasRejected ? "Resubmit Request" : "Get Verified"}
        </button>
        {!wasRejected && (
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            Takes about 2 minutes
          </p>
        )}
      </div>
    </div>
  );
}
