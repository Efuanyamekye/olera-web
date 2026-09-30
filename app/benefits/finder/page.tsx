"use client";

import FinderQuiz from "@/components/benefits/finder/FinderQuiz";
import FinderResults from "@/components/benefits/finder/FinderResults";
import { useFinder } from "@/hooks/use-finder";
import { ContentViewTracker } from "@/components/analytics/ContentViewTracker";

/**
 * The Senior Benefits Finder, redesigned 2026-09-30: "who is this for" first,
 * a caregiver question, household before income, and results that start
 * with one call and end with "send me this plan". Results come from the same
 * fact-checked programs as the program pages (/api/benefits/finder).
 */
export default function BenefitsFinderPage() {
  const f = useFinder();

  // Nothing renders until a saved draft has been read, so a returning
  // visitor doesn't see question 1 flash before their own step.
  if (!f.restored) return <div className="min-h-[520px]" aria-busy="true" />;

  if (f.phase === "results" && f.result) return <FinderResults f={f} />;

  if (f.phase === "loading") {
    return (
      <div className="py-24 flex flex-col items-start gap-4" role="status">
        <div className="w-8 h-8 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-base text-gray-600">Finding programs and who to call…</p>
      </div>
    );
  }

  if (f.phase === "error") {
    return (
      <div className="py-16 flex flex-col items-start gap-3 max-w-[560px]" role="alert">
        <h2 className="font-display text-[28px] text-gray-900">We couldn&apos;t load your plan</h2>
        <p className="text-gray-600">{f.error}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void f.retry()}
            className="min-h-[48px] px-6 rounded-2xl bg-primary-800 text-white font-semibold border-none cursor-pointer hover:bg-primary-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => f.goTo("zip")}
            className="min-h-[48px] px-6 rounded-2xl border-[1.5px] border-gray-200 bg-white text-gray-800 font-medium cursor-pointer"
          >
            Check the ZIP code
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ContentViewTracker page="/benefits/finder" />
      <FinderQuiz f={f} />
    </>
  );
}
