import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Medicaid Spend-Down Calculator 2026 — See If You Qualify | Olera",
  description:
    "Free Medicaid spend-down calculator. See how much you need to spend down to qualify for Medicaid in 2026. Takes 2 minutes, no signup required.",
  alternates: { canonical: "/benefits/spend-down-calculator" },
  openGraph: {
    title: "Medicaid Spend-Down Calculator 2026 | Olera",
    description:
      "Free Medicaid spend-down calculator. See how much you need to spend down to qualify for Medicaid in 2026.",
    url: "/benefits/spend-down-calculator",
    siteName: "Olera",
    type: "website",
  },
};

export default function SpendDownCalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
