"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStateSearch } from "@/components/waiver-library/StateSearchContext";
import { WHO_OPTIONS, finderHref, matchStates, trackHubClick, type HubState, type HubWho } from "./hub-links";

/**
 * Desktop hero search: "Where" opens a state's programs; "Who needs help"
 * sends the family into the finder with its first question answered. Typing a
 * state also highlights it on the map below (shared search context).
 */
export function HubSearchBar({ states }: { states: HubState[] }) {
  const router = useRouter();
  const { query, setQuery } = useStateSearch();
  const [whereOpen, setWhereOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [who, setWho] = useState<HubWho | null>(null);
  const [nudge, setNudge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const matches = matchStates(states, query).slice(0, 5);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setWhereOpen(false);
        setWhoOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function openState(s: HubState) {
    trackHubClick(`hub_state:${s.id}`);
    router.push(`/benefits/${s.id}`);
  }

  function go() {
    if (who) {
      trackHubClick(`hub_plan:search_bar_${who}`);
      router.push(finderHref(who));
    } else if (matches[0]) {
      openState(matches[0]);
    } else {
      setNudge(true);
      inputRef.current?.focus();
    }
  }

  const whoLabel = WHO_OPTIONS.find((o) => o.value === who)?.label;

  return (
    <div ref={rootRef} className="relative w-full max-w-[560px]">
      <div role="search" className="flex items-center rounded-full border border-gray-200 bg-white p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.10)]">
        <label className="flex min-w-0 flex-1 cursor-text flex-col rounded-full px-6 py-2 hover:bg-gray-50">
          <span className="text-[13px] font-semibold text-gray-900">Where</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setWhereOpen(true);
              setNudge(false);
            }}
            onFocus={() => setWhereOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
              if (e.key === "Escape") setWhereOpen(false);
            }}
            placeholder="Type your state"
            aria-label="Your state"
            className="w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-500 focus:outline-none"
          />
        </label>
        <span aria-hidden="true" className="h-8 w-px bg-gray-200" />
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={whoOpen}
          onClick={() => setWhoOpen((v) => !v)}
          className="flex min-w-0 flex-1 flex-col items-start rounded-full px-6 py-2 text-left hover:bg-gray-50"
        >
          <span className="text-[13px] font-semibold text-gray-900">Who needs help</span>
          <span className={`truncate text-[15px] ${whoLabel ? "text-gray-900" : "text-gray-500"}`}>{whoLabel || "Choose one"}</span>
        </button>
        <button
          type="button"
          onClick={go}
          aria-label={who ? "Start your plan" : "Search"}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary-700 text-white transition-colors hover:bg-primary-800"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
      </div>

      {whereOpen && query.trim() && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[320px] rounded-2xl bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          {matches.length ? (
            matches.map((s) => (
              <Link
                key={s.id}
                href={`/benefits/${s.id}`}
                onClick={() => trackHubClick(`hub_state:${s.id}`)}
                className="flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-vanilla-100"
              >
                <span className="font-semibold text-gray-900">{s.name}</span>
                <span className="text-sm text-gray-500">{s.count} programs</span>
              </Link>
            ))
          ) : (
            <p className="px-3 py-2.5 text-sm text-gray-600">No state matches &ldquo;{query}&rdquo;.</p>
          )}
        </div>
      )}

      {whoOpen && (
        <div role="listbox" className="absolute right-12 top-[calc(100%+8px)] z-30 w-[260px] rounded-2xl bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          {WHO_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={who === o.value}
              onClick={() => {
                setWho(o.value);
                setWhoOpen(false);
              }}
              className={`block w-full rounded-xl px-3 py-2.5 text-left font-semibold text-gray-900 hover:bg-vanilla-100 ${who === o.value ? "bg-vanilla-100" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {nudge && <p className="mt-2 pl-6 text-sm text-gray-600">Type your state, or choose who needs help.</p>}
    </div>
  );
}
