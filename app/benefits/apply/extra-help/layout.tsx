import type { Metadata } from "next";
import type { ReactNode } from "react";

// The apply-along (7 Oct 2026): reached from a family's plan, so it stays out
// of search. Its content depends on the family's own answers.
export const metadata: Metadata = {
  title: "Apply for Extra Help and Medicare Savings | Olera",
  robots: { index: false, follow: false },
};

export default function ApplyAlongLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-vanilla-100">
      <main className="max-w-[560px] mx-auto px-4 sm:px-6 py-8 lg:py-14" aria-label="Apply for Extra Help">
        {children}
      </main>
    </div>
  );
}
