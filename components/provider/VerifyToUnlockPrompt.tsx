"use client";

interface VerifyToUnlockPromptProps {
  /** Action being gated (e.g., "respond", "send", "publish") */
  action?: string;
  /** Callback when user clicks the verify link */
  onVerifyClick: () => void;
  /** Optional className for the container */
  className?: string;
  /** Style variant */
  variant?: "inline" | "block";
}

/**
 * Inline prompt that appears when an unverified provider tries to take a gated action.
 *
 * Designed to be elegant and non-intrusive — a simple teal link with an arrow.
 *
 * Usage:
 * ```tsx
 * {!isVerified && (
 *   <VerifyToUnlockPrompt
 *     action="respond"
 *     onVerifyClick={openModal}
 *   />
 * )}
 * ```
 */
export default function VerifyToUnlockPrompt({
  action = "continue",
  onVerifyClick,
  className = "",
  variant = "inline",
}: VerifyToUnlockPromptProps) {
  if (variant === "block") {
    return (
      <div className={`rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <svg
              className="w-4 h-4 text-amber-600"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-600">
              Complete verification to {action}.
            </p>
          </div>
          <button
            type="button"
            onClick={onVerifyClick}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-600 hover:text-primary-700 transition-colors group shrink-0"
          >
            Verify now
            <svg
              className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Inline variant - just a link
  return (
    <button
      type="button"
      onClick={onVerifyClick}
      className={`inline-flex items-center gap-1 text-[14px] font-semibold text-primary-600 hover:text-primary-700 transition-colors group ${className}`}
    >
      Verify to {action}
      <svg
        className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
      </svg>
    </button>
  );
}
