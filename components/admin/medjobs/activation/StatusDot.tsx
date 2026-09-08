"use client";

/**
 * The four activation states, drawn the same way everywhere.
 *
 * Colour comes from the design system's semantic scales rather than a
 * palette of this feature's own, so a live channel here reads like a
 * healthy stage on the System diagram.
 */

export type AnyStatus = "not_yet" | "in_progress" | "live" | "not_available" | "declined";

const DOT: Record<AnyStatus, string> = {
  live: "bg-success-500",
  in_progress: "bg-warning-500",
  not_yet: "bg-gray-300",
  not_available: "bg-gray-300",
  declined: "bg-gray-300",
};

const LABEL: Record<AnyStatus, string> = {
  live: "Live",
  in_progress: "In progress",
  not_yet: "Not yet",
  not_available: "Not available",
  declined: "Declined",
};

export function statusLabel(s: AnyStatus) {
  return LABEL[s];
}

export default function StatusDot({
  status,
  label = false,
}: {
  status: AnyStatus;
  label?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden />
      <span className="sr-only">{LABEL[status]}</span>
      {label ? <span className="text-[13px] text-gray-700">{LABEL[status]}</span> : null}
    </span>
  );
}

/** Due or overdue. The only red in the workspace. */
export function DueDot() {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-error-500"
      title="Something is due or overdue"
      aria-label="Due or overdue"
    />
  );
}
