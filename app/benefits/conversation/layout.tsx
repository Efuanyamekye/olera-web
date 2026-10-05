import type { Metadata } from "next";
import type { ReactNode } from "react";

// Phase 3 prototype of the benefits conversation (5 Oct 2026). Reached only by
// link, so it stays out of search until it replaces the finder.
export const metadata: Metadata = {
  title: "Find benefits | Olera",
  robots: { index: false, follow: false },
};

export default function BenefitsConversationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-vanilla-100">
      <main className="max-w-[560px] mx-auto px-4 sm:px-6 py-8 lg:py-14" aria-label="Benefits conversation">
        {children}
      </main>
    </div>
  );
}
