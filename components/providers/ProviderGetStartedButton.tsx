"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import Button from "@/components/ui/Button";

interface ProviderGetStartedButtonProps {
  /** Visual variant */
  variant?: "primary" | "hero";
  className?: string;
  children?: React.ReactNode;
}

/**
 * Client component that opens the unified auth modal for providers.
 *
 * Uses openAuth with intent="provider" to skip the "family vs provider"
 * question since the user's intent is clear from the entry point.
 */
export default function ProviderGetStartedButton({
  variant = "primary",
  className,
  children,
}: ProviderGetStartedButtonProps) {
  const { openAuth } = useAuth();

  const handleClick = () => {
    openAuth({ intent: "provider" });
  };

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={
          className ??
          "inline-flex items-center justify-center font-semibold rounded-lg px-10 py-4 text-lg bg-white text-primary-700 hover:bg-primary-50 transition-colors min-h-[44px] shadow-lg"
        }
      >
        {children ?? "Get Started Free"}
      </button>
    );
  }

  return (
    <Button size="lg" onClick={handleClick}>
      {children ?? "Get Started Free"}
    </Button>
  );
}
