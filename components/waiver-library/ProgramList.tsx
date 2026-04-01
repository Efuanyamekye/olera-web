"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { WaiverProgram } from "@/data/waiver-library";

function getMaxSavings(savingsRange: string): number {
  const match = savingsRange.match(/\$[\d,]+/g);
  if (!match) return 0;
  const last = match[match.length - 1];
  return parseInt(last.replace(/[$,]/g, ""), 10);
}

const FEDERAL_KEYWORDS = [
  "snap", "calfresh", "liheap", "energy assistance", "weatherization",
  "ssi", "ssp", "medicare savings", "medicare patrol", "hicap", "ship",
  "ombudsman", "family caregiver", "scsep", "home-delivered meals",
  "congregate meals", "senior legal", "pace",
];

import { getCategory, type Category } from "@/lib/waiver-category";
export { getCategory };

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  financial: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2.25S10 12.5 12 13s2.5 1.25 2.5 2.25S13.5 17 12 17c-1 0-2-.5-2.5-1.5M12 6v1.5M12 16.5V18" />
    </svg>
  ),
  food: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </svg>
  ),
  health: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  caregiver: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
};

const CATEGORY_TABS: { value: Category; label: string }[] = [
  { value: "financial", label: "Financial Help" },
  { value: "food", label: "Food & Nutrition" },
  { value: "health", label: "Health Coverage" },
  { value: "caregiver", label: "Caregiver Support" },
];

function isFederalProgram(program: WaiverProgram): boolean {
  const text = `${program.name} ${program.id}`.toLowerCase();
  return FEDERAL_KEYWORDS.some((kw) => text.includes(kw));
}

const QUICK_APPLY_IDS = new Set([
  "texas-snap-food-benefits",
  "texas-meals-on-wheels",
  "texas-comprehensive-energy-assistance-program-ceap-liheap",
  "texas-weatherization-assistance-program",
  "texas-ship-medicare-counseling",
  "texas-legal-services-for-seniors",
  "texas-long-term-care-ombudsman",
  "texas-senior-companion-program",
]);

function getApplyType(program: WaiverProgram, stateId: string): "quick" | "plan" | null {
  if (stateId !== "texas") return null;
  if (QUICK_APPLY_IDS.has(program.id)) return "quick";
  return "plan";
}

interface ProgramListProps {
  programs: WaiverProgram[];
  stateId: string;
  /** Map of program.id → new slug for custom URL paths */
  slugMap?: Record<string, string>;
  /** Base path for program links (e.g. "/texas/benefits") */
  basePath?: string;
}

export function ProgramList({ programs, stateId, slugMap, basePath }: ProgramListProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("financial");
  const [showAll, setShowAll] = useState(false);

  // Read ?tab= param on mount to restore the correct category
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Category | null;
    if (tab && CATEGORY_TABS.some((t) => t.value === tab)) {
      setCategory(tab);
    }
  }, []);

  const hasSearch = search.trim().length > 0;

  const searchFiltered = hasSearch
    ? programs.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      })
    : programs;

  // When searching, show all matches regardless of category
  const filtered = hasSearch
    ? searchFiltered
    : searchFiltered.filter((p) => getCategory(p) === category);

  // Count programs per category (based on search-filtered list)
  const categoryCounts = CATEGORY_TABS.reduce((acc, tab) => {
    acc[tab.value] = searchFiltered.filter((p) => getCategory(p) === tab.value).length;
    return acc;
  }, {} as Record<Category, number>);

  const sorted = [...filtered].sort((a, b) =>
    getMaxSavings(b.savingsRange) - getMaxSavings(a.savingsRange)
  );

  const INITIAL_COUNT = 5;
  const displayed = showAll || hasSearch ? sorted : sorted.slice(0, INITIAL_COUNT);
  const hasMore = !hasSearch && sorted.length > INITIAL_COUNT && !showAll;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Available Programs</h2>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programs..."
            className="pl-10 pr-4 py-2.5 w-64 bg-white border border-gray-200 rounded-xl text-base text-gray-700 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORY_TABS.map((tab) => {
          const isActive = category === tab.value;
          const count = categoryCounts[tab.value];
          return (
            <button
              key={tab.value}
              onClick={() => { setCategory(tab.value); setShowAll(false); }}
              className={`inline-flex items-center px-4 py-2.5 rounded-xl text-base font-medium transition-all duration-150 ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              <span className="mr-1.5 opacity-70">{CATEGORY_ICONS[tab.value]}</span>
              {tab.label}
              <span className={`inline-flex items-center justify-center ml-2 w-6 h-6 rounded-full text-xs font-bold ${
                isActive
                  ? "bg-white text-primary-600"
                  : "bg-primary-100 text-primary-800"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No programs found in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayed.map((program) => {
            const federal = isFederalProgram(program);
            const applyType = getApplyType(program, stateId);
            return (
              <div
                key={program.id}
                className="bg-white rounded-xl shadow-lg border border-gray-300 transition-all duration-200 p-6 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    federal ? "bg-secondary-100 text-secondary-700" : "bg-primary-100 text-primary-700"
                  }`}>
                    {federal ? "Federal" : "State"}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg leading-snug">
                  {program.name}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {program.savingsRange && (
                    <p className="text-sm font-bold text-primary-600">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-xs font-bold mr-1">$</span>Save {program.savingsRange}
                    </p>
                  )}
                  {applyType && (
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      applyType === "quick"
                        ? "bg-success-50 text-success-700 border-success-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {applyType === "quick" ? "Quick Apply" : "Plan Ahead"}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600 flex-1">{program.tagline}</p>

                {program.eligibilityHighlights.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {program.eligibilityHighlights.slice(0, 3).map((highlight) => (
                      <li
                        key={highlight}
                        className="flex items-start gap-2 text-sm text-gray-600"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-success-50 border border-success-200 shrink-0 mt-0.5">
                          <svg
                            className="w-3 h-3 text-success-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-5">
                  <Link
                    href={basePath && slugMap?.[program.id] ? `${basePath}/${slugMap[program.id]}` : `/waiver-library/${stateId}/${program.id}`}
                    className="inline-flex items-center justify-center w-full px-4 py-2.5 text-base font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors"
                  >
                    Learn more
                    <svg
                      className="ml-1 w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            Show {sorted.length - INITIAL_COUNT} more programs
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
