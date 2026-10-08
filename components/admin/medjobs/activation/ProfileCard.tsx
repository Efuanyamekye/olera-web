"use client";

/**
 * ProfileCard — the Providers and Students cards at the top of a university
 * drawer, above the five channels.
 *
 * Providers and students are profiles, not tasks: they exist whether or not
 * there is anything to do about them today. The card is the roster; the Tasks
 * tab is today's queue. Both reach the same detail panel.
 *
 * Counts read "N clients · M in catchment" and "N applicants · M qualified".
 * Clients-confirmed and students-qualified are not instrumented yet, so those
 * halves render a dash rather than a zero that looks like a measurement.
 */

import { useState } from "react";

export interface ProfileRow {
  id: string;
  name: string;
  /** Right-hand status: "Round 3 of 7", "client", "archived", … */
  state: string;
  /** Second line — phone, or whatever identifies the row at a glance. */
  detail?: string | null;
  /** Red dot: something is due on this row today. */
  due?: boolean;
  /** Slug for linking to the admin directory page. */
  directorySlug?: string | null;
  /** Whether this provider is visible on the student job board. */
  jobBoardVisible?: boolean;
}

export default function ProfileCard({
  title,
  primaryCount,
  primaryLabel,
  secondaryCount,
  secondaryLabel,
  rows,
  emptyText,
  addLabel,
  onAdd,
  onOpenRow,
  onOpenDirectory,
  onToggleJobBoard,
  showJobBoardToggle = false,
}: {
  title: string;
  /** Null renders a dash — the metric exists but is not instrumented. */
  primaryCount: number | null;
  primaryLabel: string;
  secondaryCount: number | null;
  secondaryLabel: string;
  rows: ProfileRow[];
  emptyText: string;
  addLabel?: string;
  onAdd?: () => void;
  onOpenRow?: (id: string) => void;
  /** Opens the provider's directory page. Called with the slug. */
  onOpenDirectory?: (slug: string) => void;
  /** Toggles job board visibility for a provider. Called with (id, currentVisible). */
  onToggleJobBoard?: (id: string, currentVisible: boolean) => void;
  /** Whether to show the job board toggle for providers. */
  showJobBoardToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = (v: number | null) => (v == null ? "—" : String(v));

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
          {title}
        </span>
        <span className="shrink-0 text-[12px] text-gray-500">
          {n(primaryCount)} {primaryLabel} · {n(secondaryCount)} {secondaryLabel}
        </span>
        <span className="shrink-0 text-gray-400" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2">
          {rows.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-gray-400">{emptyText}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <div
                    role={onOpenRow ? "button" : undefined}
                    tabIndex={onOpenRow ? 0 : undefined}
                    onClick={() => onOpenRow?.(r.id)}
                    onKeyDown={(e) => {
                      if (onOpenRow && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onOpenRow(r.id);
                      }
                    }}
                    className={`flex w-full items-center gap-2 py-2 text-left${onOpenRow ? " cursor-pointer hover:bg-gray-50" : ""}`}
                  >
                    <span className="w-2 shrink-0">
                      {r.due ? (
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-error-500" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      {r.directorySlug && onOpenDirectory ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDirectory(r.directorySlug!);
                          }}
                          className="block truncate text-[13px] text-gray-900 hover:text-primary-700 text-left"
                        >
                          {r.name}
                        </button>
                      ) : (
                        <span className="block truncate text-[13px] text-gray-900">{r.name}</span>
                      )}
                      {r.detail ? (
                        <span className="block truncate text-[11px] text-gray-500">{r.detail}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-500">{r.state}</span>
                    {showJobBoardToggle && onToggleJobBoard && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleJobBoard(r.id, r.jobBoardVisible ?? false);
                        }}
                        className="ml-2 flex shrink-0 items-center gap-1.5"
                        title={r.jobBoardVisible ? "Visible on job board" : "Hidden from job board"}
                      >
                        <span className="text-[10px] font-medium text-gray-400">Live</span>
                        <span
                          className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            r.jobBoardVisible
                              ? "bg-success-500"
                              : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              r.jobBoardVisible ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {addLabel && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-1 w-full rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
            >
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
