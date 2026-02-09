type BadgeVariant = "verified" | "unclaimed" | "pending" | "rejected" | "trial" | "pro" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  verified: "bg-primary-100 text-primary-700",
  unclaimed: "bg-gray-100 text-gray-600",
  pending: "bg-warm-100 text-warm-700",
  rejected: "bg-red-100 text-red-700",
  trial: "bg-secondary-100 text-secondary-700",
  pro: "bg-primary-600 text-white",
  default: "bg-gray-100 text-gray-600",
};

export default function Badge({
  variant = "default",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
        "text-base font-medium",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {variant === "verified" && (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {children}
    </span>
  );
}
