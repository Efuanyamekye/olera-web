"use client";

import Link from "next/link";
import { useState } from "react";
import { useStateSearch } from "@/components/waiver-library/StateSearchContext";
import { trackHubClick, type HubState } from "./hub-links";

/**
 * The state list: flat rows split by hairlines, no boxes. On phones it shows
 * the first eight with a "Show all" (the search box finds the rest faster);
 * the desktop A to Z list passes `all`.
 */
export function HubStateList({ states, all = false, withSearch = false }: { states: HubState[]; all?: boolean; withSearch?: boolean }) {
  const { query, setQuery } = useStateSearch();
  const [expanded, setExpanded] = useState(all);
  const q = query.trim().toLowerCase();
  const matches = q
    ? states.filter((s) => s.name.toLowerCase().includes(q) || s.abbreviation.toLowerCase() === q)
    : states;
  const shown = q || expanded ? matches : matches.slice(0, 8);

  return (
    <div className="flex flex-col gap-3">
      {withSearch && (
        <label className="flex min-h-[52px] items-center gap-3 rounded-full border border-gray-300 bg-white px-5">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gray-900" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your state"
            aria-label="Your state"
            className="w-full bg-transparent text-base text-gray-900 placeholder:text-gray-500 focus:outline-none"
          />
        </label>
      )}

      {shown.length === 0 ? (
        <p className="py-4 text-sm text-gray-600">
          No state matches &ldquo;{query}&rdquo;.{" "}
          <button type="button" onClick={() => setQuery("")} className="font-semibold text-primary-700 underline underline-offset-2">
            Clear
          </button>
        </p>
      ) : (
        <ul className={all ? "grid grid-cols-2 gap-x-8 lg:grid-cols-4" : ""}>
          {shown.map((s) => (
            <li key={s.id}>
              <Link
                href={`/benefits/${s.id}`}
                onClick={() => trackHubClick(`hub_state:${s.id}`)}
                className="flex min-h-[48px] items-center justify-between gap-3 border-t border-gray-200 py-2.5 text-base text-gray-900 hover:text-primary-700"
              >
                <span>{s.name}</span>
                <span className="whitespace-nowrap text-sm text-gray-500">{s.count} programs</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!q && !expanded && matches.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-[44px] self-start text-[15px] font-semibold text-gray-900 underline underline-offset-4"
        >
          Show all {states.length} states
        </button>
      )}
    </div>
  );
}
