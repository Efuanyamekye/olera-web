"use client";

export type VerificationStatus = "idle" | "verifying" | "valid" | "risky" | "invalid" | "unknown";

interface EmailVerificationBadgeProps {
  status: VerificationStatus;
  className?: string;
  /** Show inline helper text instead of just the badge */
  showHelperText?: boolean;
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
  showHelperText = false,
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

  // Guidance for invalid/risky emails - shown as inline helper text
  const guidance: Partial<Record<VerificationStatus, { label: string; helperText: string }>> = {
    invalid: {
      label: "May bounce",
      helperText: "If you've confirmed this email works, click Save anyway.",
    },
    risky: {
      label: "Catch-all",
      helperText: "This domain accepts all mail. Save anyway if you've confirmed it.",
    },
  };

  if (status === "invalid" || status === "risky") {
    const g = guidance[status]!;
    const badge = (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 w-fit">
        <span aria-hidden>⚠</span>
        {g.label}
      </span>
    );

    // When showing helper text, wrap badge + text in a column layout
    if (showHelperText) {
      return (
        <span className={`inline-flex flex-col gap-0.5 ${className}`}>
          {badge}
          <span className="text-[11px] text-amber-600 leading-tight">
            {g.helperText}
          </span>
        </span>
      );
    }

    // No helper text - just return the badge with className
    return <span className={className}>{badge}</span>;
  }

  const { icon, text, classes } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${classes} ${className}`}
    >
      {icon} {text}
    </span>
  );
}
