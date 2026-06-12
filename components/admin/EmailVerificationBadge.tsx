"use client";

export type VerificationStatus = "idle" | "verifying" | "valid" | "risky" | "invalid" | "unknown";

interface EmailVerificationBadgeProps {
  status: VerificationStatus;
  className?: string;
}

/**
 * Badge showing email verification status.
 * - idle: nothing shown
 * - verifying: spinner + "Verifying..."
 * - valid: ✓ Valid email (green)
 * - risky: ⚠️ Catch-all (amber)
 * - invalid: ✗ Will bounce (red)
 * - unknown: ? Could not verify (gray)
 */
export default function EmailVerificationBadge({
  status,
  className = "",
}: EmailVerificationBadgeProps) {
  if (status === "idle") return null;

  const config: Record<
    Exclude<VerificationStatus, "idle">,
    { icon: React.ReactNode; text: string; classes: string }
  > = {
    verifying: {
      icon: (
        <svg
          className="w-3 h-3 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ),
      text: "Verifying...",
      classes: "text-gray-500",
    },
    valid: {
      icon: <span>✓</span>,
      text: "Valid email",
      classes: "text-emerald-600",
    },
    risky: {
      icon: <span>⚠️</span>,
      text: "Catch-all",
      classes: "text-amber-600",
    },
    invalid: {
      icon: <span>✗</span>,
      text: "Will bounce",
      classes: "text-red-600",
    },
    unknown: {
      icon: <span>?</span>,
      text: "Could not verify",
      classes: "text-gray-400",
    },
  };

  const { icon, text, classes } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${classes} ${className}`}
    >
      {icon} {text}
    </span>
  );
}
