"use client";

import { useEffect, useRef, useState } from "react";
import type { Owner } from "@/lib/admin-page-owners";

/**
 * Who leads a sidebar page: the names under the tab, and the menu that sets
 * them.
 *
 * Two pieces because they sit in different parts of the row. The names go
 * inside the link, under the label, so the whole two-line block is one target
 * and the hover background covers both. The menu is a sibling of the link,
 * absolutely positioned, because a button inside an anchor is not a button.
 */

/**
 * The line under a tab name.
 *
 * Interpuncts, matching the university board. Truncated rather than wrapped:
 * the sidebar is 208px and four names would otherwise push every row below it
 * down a line, which turns a glance into a scroll.
 */
export function OwnerNames({ people }: { people: Owner[] }) {
  if (people.length === 0) return null;
  return (
    <span
      className="mt-0.5 block truncate text-[11px] font-normal leading-tight text-gray-400"
      title={people.map((p) => p.name).join(", ")}
    >
      {people.map((p) => p.name).join(" · ")}
    </span>
  );
}

function PersonIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11h-6" />
    </svg>
  );
}

/**
 * The assign menu.
 *
 * A checklist, not a picker: clicking a name toggles that one person and the
 * menu stays open, because setting three leaders should be three clicks
 * rather than three trips through the menu. That is the one behavioural
 * difference from the MedJobs AssigneeChip, which closes on pick because a
 * section there has exactly one owner.
 *
 * Anchored to its right edge. The sidebar is 208px wide and scrolls, which
 * clips on both axes, so a menu opening rightward from the button would be
 * cut off by the panel.
 *
 * Renders inline. The caller puts it in the same absolutely positioned strip
 * as the pin star so the two icons sit together on the tab's first line,
 * rather than one of them drifting to the middle of a row that has grown a
 * second line of names.
 */
export function OwnersMenu({
  people,
  owners,
  onToggle,
  label,
  busy,
}: {
  /** Everyone who may lead a page. Already narrowed and sorted by the route. */
  people: Owner[];
  /** Who leads this one now. */
  owners: Owner[];
  onToggle: (personId: string, next: boolean) => void;
  /** The tab's name, for the accessible label. */
  label: string;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const held = new Set(owners.map((p) => p.id));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((s) => !s);
        }}
        title={owners.length ? owners.map((p) => p.name).join(", ") : "Assign someone"}
        aria-label={`Assign someone to ${label}`}
        className={[
          "rounded p-0.5 transition-opacity duration-100 disabled:opacity-40",
          // Stays visible once somebody holds the page, so the way to change
          // it is where the names are rather than somewhere to go hunting.
          open || owners.length > 0
            ? "text-gray-400 opacity-100 hover:text-gray-600"
            : "text-gray-300 opacity-0 hover:text-gray-500 group-hover/item:opacity-100",
        ].join(" ")}
      >
        <PersonIcon />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-0.5 shadow-lg">
          {people.map((p) => {
            const on = held.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(p.id, !on);
                }}
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-gray-50 ${
                  on ? "font-semibold text-primary-700" : "text-gray-700"
                }`}
              >
                <span className="w-3 shrink-0 text-primary-600">{on ? "✓" : ""}</span>
                <span className="truncate">{p.name}</span>
              </button>
            );
          })}
          {owners.length > 0 && (
            <>
              <div className="my-0.5 border-t border-gray-100" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  for (const p of owners) onToggle(p.id, false);
                }}
                className="block w-full px-2.5 py-1.5 text-left text-[12.5px] text-gray-500 hover:bg-gray-50"
              >
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
