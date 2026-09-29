import type { ReactNode } from "react";

export default function BenefitsFinderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-vanilla-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-14" aria-label="Benefits finder">
        {children}
      </main>
    </div>
  );
}
