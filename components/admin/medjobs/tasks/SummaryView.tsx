"use client";

import { useEffect } from "react";
import { LADDERS, SECTION_ORDER, type SectionKey } from "@/lib/medjobs/ladders";
import {
  dueLabel,
  isReady,
  recordReady,
  sectionReady,
  type BoardRecord,
  type BoardUniversity,
} from "@/lib/medjobs/task-board";
import { sectionsFor, type Person } from "@/lib/medjobs/assignments";
import AssigneeChip from "./AssigneeChip";

/**
 * What a university looks like when you open it: the seven sections, how
 * much each is waiting on, and one button that starts working through it.
 *
 * This is the place you come back to. Running tasks in a row is the fast
 * path, not the only one — an operator who wants to see the shape of a
 * campus before diving in should not have to close and reopen it.
 */
/**
 * Sections where a record can be typed in, and what one is called.
 *
 * Every section a sweep fills. A sweep runs once per campus and the world
 * carries on afterwards: an agency somebody hears about on a call, an
 * advising office that did not exist when the sweep ran, a second student
 * organisation nobody had heard of in week one.
 *
 * This used to be providers and advising offices alone, on the reasoning
 * that an org, an event or a professor "arrives from its own rung" and a
 * hand-typed one would sit outside the count that rung is measured on. That
 * reasoning did not survive contact with the work. Close the org sweep and
 * the section has no way to gain a record at all: on 30 September that left
 * somebody unable to add a second student organisation for two weeks, with
 * nothing on screen to say why or what to do instead.
 *
 * The count argument was also the wrong way round. A record typed in by hand
 * is stamped with its own found_by, so it is distinguishable from a swept one
 * whenever anybody wants to distinguish them. A record that could not be
 * created at all is not.
 *
 * Students and the job board still have no entry here, and that is a
 * different kind of no: a student is a person who applied, and the job board
 * is a property of the campus rather than a row you can have two of.
 */
const ADD_BY_HAND = new Map<SectionKey, string>([
  ["providers", "provider"],
  ["advisors", "advising office"],
  ["orgs", "student org"],
  ["events", "campus event"],
  ["professors", "professor"],
]);

export default function SummaryView({
  university,
  open,
  onToggle,
  cameFrom,
  onStart,
  onOpenRecord,
  onAddRecord,
  people,
  onAssign,
  filterId,
  onToggleJobBoard,
}: {
  university: BoardUniversity;
  /**
   * Which sections are expanded. Held above this component because it
   * unmounts every time a record is opened, and coming back to a collapsed
   * list after every single record is the difference between screening a
   * campus and fighting the screen.
   */
  open: Partial<Record<SectionKey, boolean>>;
  onToggle: (section: SectionKey) => void;
  /** The record last looked at, scrolled back into view on the way in. */
  cameFrom: string | null;
  onStart: () => void;
  onOpenRecord: (record: BoardRecord) => void;
  /** Start a record nobody has in the directory. Providers only, for now. */
  onAddRecord: (section: SectionKey) => void;
  /** The MedJobs team, for the assignee chips. */
  people: Person[];
  /** Null unassigns. */
  onAssign: (section: SectionKey, personId: string | null) => void;
  /**
   * Whose work to foreground, or null for everyone's.
   *
   * Somebody else's sections are dimmed and held shut rather than hidden, so
   * you can still see the campus has more going on without it competing for
   * your eye.
   */
  filterId: string | null;
  /** Toggle job board visibility for a provider. */
  onToggleJobBoard?: (recordId: string, currentVisible: boolean) => void;
}) {
  // Put the record you were just looking at back under your eyes. Centred
  // rather than at the top, because the rows either side are the context.
  useEffect(() => {
    if (!cameFrom) return;
    document
      .getElementById(`board-record-${cameFrom}`)
      ?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [cameFrom]);

  // The task types in front of you. Everything when nothing is filtered.
  const mine = sectionsFor(university.assignments, filterId);

  return (
    <div className="px-5 py-4">
      {mine.some((s) => sectionReady(university, s) > 0) && (
        <button
          type="button"
          onClick={onStart}
          className="mb-3 w-full rounded-lg border border-primary-600 bg-primary-600 px-4 py-2.5 text-left text-[13.5px] font-semibold text-white hover:bg-primary-700"
        >
          Start the next task
        </button>
      )}

      <div className="space-y-2">
        {SECTION_ORDER.map((key) => {
          const ladder = LADDERS[key];
          const records = university.records[key] ?? [];
          const waiting = sectionReady(university, key);
          // A singleton section IS its record — the job board. Expanding it
          // to reveal the only thing in it is a click that buys nothing, so
          // the row opens the record and loses its triangle.
          const only = ladder.singleton && records.length === 1 ? records[0] : null;
          // Somebody else's section under a filter stays shut, whatever the
          // expanded state said before the filter was applied.
          const inScope = mine.includes(key);
          const newHere = records.filter((r) => r.isNew).length;
          const expanded = Boolean(open[key]) && inScope;
          return (
            <div
              key={key}
              className={`rounded-lg border border-gray-200 ${inScope ? "" : "opacity-45"}`}
            >
              {/* A row, not a button. The chip is interactive and cannot be
                  nested inside one — it is invalid markup, and the click
                  would toggle the section instead of opening the menu. */}
              <div className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => (only ? onOpenRecord(only) : onToggle(key))}
                  className="flex min-w-0 shrink items-center gap-2.5 text-left"
                >
                  <span className="w-2.5 shrink-0 text-[10px] text-gray-400">
                    {only ? "" : expanded ? "▾" : "▸"}
                  </span>
                  <span className="truncate text-[13.5px] font-medium text-gray-900">
                    {ladder.label}
                  </span>
                  {/* On the closed section, because the whole complaint was
                      having to open it to find out. The waiting count beside
                      it is how much there is to do; this is how much of it
                      nobody knows about yet. */}
                  {newHere > 0 && (
                    <span className="shrink-0 rounded-full bg-success-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-success-700">
                      {newHere} new
                    </span>
                  )}
                </button>
                {/* Beside the name it belongs to, not out by the count. Who
                    owns this reads as part of the label; against the number
                    it read as another figure. */}
                <AssigneeChip
                  people={people}
                  value={university.assignments?.[key] ?? null}
                  onChange={(id) => onAssign(key, id)}
                />
                {/* Takes the rest of the row so the gap between the chip and
                    the count still toggles the section. */}
                <button
                  type="button"
                  onClick={() => (only ? onOpenRecord(only) : onToggle(key))}
                  aria-label={`${ladder.label} — ${waiting} waiting`}
                  className="flex-1 text-right"
                >
                  {waiting > 0 ? (
                    <span className="text-[12.5px] font-semibold tabular-nums text-warning-700">
                      {waiting}
                    </span>
                  ) : only ? (
                    // "1" is not news about a thing there is exactly one of.
                    // Whether it is live is.
                    only.state && <span className="text-[12px] text-success-700">{only.state}</span>
                  ) : records.length ? (
                    <span className="text-[12px] text-gray-400">{records.length}</span>
                  ) : null}
                </button>
              </div>

              {expanded && !only && (
                <div className="border-t border-gray-100 px-3.5 pb-2">
                  {records.length === 0 ? (
                    <p className="py-3 text-center text-[12.5px] text-gray-400">
                      {ladder.emptyNote ?? "Nothing here yet."}
                    </p>
                  ) : null}
                  {records.length > 0 && (
                    records.map((r) => {
                      const n = recordReady(r);
                      const soon = r.tasks
                        .filter((t) => !t.done && !isReady(t))
                        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
                      const dead = r.state && /^(archived|stopped|declined)/.test(r.state);
                      return (
                        <div
                          key={r.id}
                          id={`board-record-${r.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => onOpenRecord(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenRecord(r);
                            }
                          }}
                          className={`flex w-full cursor-pointer items-center gap-2 border-b border-gray-100 py-2 text-left last:border-b-0 hover:bg-gray-50 ${
                            r.id === cameFrom ? "bg-primary-25" : ""
                          }`}
                        >
                          {/* Visible from the list, which is the point of it. */}
                          {r.flaggedOn && (
                            <span
                              title="Flagged for manager review"
                              aria-label="Flagged for manager review"
                              className="shrink-0 text-warning-600"
                            >
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path
                                  d="M3.5 14.5V2M3.5 2.5h7.2l-1.3 2.6 1.3 2.6H3.5"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          )}
                          <span className="min-w-0 flex-1 text-[13px]">
                            {r.directorySlug ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/admin/directory/${r.directorySlug}`, "_blank", "noopener,noreferrer");
                                }}
                                className="block max-w-full truncate text-left text-gray-900 hover:text-primary-700"
                              >
                                {r.name}
                              </button>
                            ) : (
                              <span className="block truncate text-gray-900">{r.name}</span>
                            )}
                            {/* An applicant nobody has opened. It arrived on
                                its own, so unlike every other record on this
                                board there was nothing to tell anybody it was
                                here. Clears the first time it is opened. */}
                            {r.isNew && (
                              <span className="ml-1.5 rounded-full bg-success-50 px-1.5 py-px align-[1px] text-[10px] font-semibold uppercase tracking-wide text-success-700">
                                new
                              </span>
                            )}
                          </span>
                          <span
                            className={`shrink-0 text-[11.5px] ${
                              n
                                ? "font-semibold tabular-nums text-warning-700"
                                : dead
                                  ? "text-gray-400"
                                  : r.state
                                    ? "text-success-700"
                                    : "text-gray-500"
                            }`}
                          >
                            {n ? n : r.state ? r.state : soon ? dueLabel(soon.dueAt) : ""}
                          </span>
                          {/* Job board visibility toggle for providers */}
                          {key === "providers" && onToggleJobBoard && (
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
                      );
                    })
                  )}
                  {/*
                    The catchment finds a provider only if the directory has
                    one. An agency somebody knows about but the directory has
                    never heard of would otherwise have nowhere to go, so the
                    list ends with a way to start one by hand. Last, and grey:
                    typing a record is the exception, not the work.
                  */}
                  {ADD_BY_HAND.has(key) && (
                    <button
                      type="button"
                      onClick={() => onAddRecord(key)}
                      className="mt-1 flex w-full items-center gap-1.5 border-t border-dashed border-gray-200 py-2.5 text-left text-[12.5px] font-medium text-gray-500 hover:text-primary-700"
                    >
                      <span className="text-[13px] leading-none">+</span>
                      Add a {ADD_BY_HAND.get(key)}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
