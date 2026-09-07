"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * The "start a campaign" call to action on /managed-ads.
 *
 * WHY THIS IS NOT A PLAIN LINK TO /provider/boost
 * That route is a hub route in app/provider/layout.tsx, so a signed-out visitor
 * gets a bare "Sign in required" screen, and someone who signs up without a
 * claimed page is then bounced to /portal — the family side. This page exists
 * precisely to be sent to providers who have never heard of us, so the common
 * visitor is exactly the one that path fails.
 *
 * So it routes the way /for-providers does: an unclaimed visitor goes to the
 * claim wizard, which takes auth at the END of the flow rather than the front,
 * and a provider who already has a page goes straight to the request form.
 *
 * While auth resolves we point at the wizard. That is the safe default — it is
 * correct for every signed-out visitor, and a signed-in provider who beats the
 * auth check gets the wizard's own routing rather than a dead end.
 */
export default function StartCampaignLink({
  children,
  tone = "primary",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "primary" | "onDark";
  className?: string;
}) {
  const { user, profiles } = useAuth();
  const hasProviderProfile = (profiles || []).some((p) => p.type === "organization");
  const href =
    user && hasProviderProfile ? "/provider/boost" : "/provider/onboarding?returnTo=/managed-ads";

  const base =
    "inline-flex min-h-[48px] items-center justify-center rounded-lg px-7 py-3 text-text-md font-semibold transition-colors";
  const tones = {
    primary: "bg-primary-600 text-white hover:bg-primary-700",
    onDark: "bg-white text-gray-900 hover:bg-gray-100",
  };

  return (
    <Link href={href} className={`${base} ${tones[tone]} ${className}`}>
      {children}
    </Link>
  );
}
