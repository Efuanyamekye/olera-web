"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StatusDot, { DueDot, statusLabel } from "@/components/admin/medjobs/activation/StatusDot";
import { LADDERS, SECTION_ORDER, type SectionKey } from "@/lib/medjobs/ladders";
import {
  applications,
  readyCount,
  readyCountIn,
  readyForStudents,
  type BoardUniversity,
} from "@/lib/medjobs/task-board";
import {
  assignedPeople,
  byName,
  sectionsFor,
  type Person,
} from "@/lib/medjobs/assignments";
import { applyWhenIdle } from "@/lib/medjobs/editing-guard";
import { demoUniversity, isDemoUniversity } from "@/lib/medjobs/demo-university";
import UniversityFlow from "./UniversityFlow";

/**
 * The Tasks tab: every university, how much is waiting, and the state of
 * the five channels you reach it through.
 *
 * The table is the roster and has to survive being read at a glance across
 * dozens of rows, so it stayed as it was — one column added for the count.
 * Clicking a row opens the university on its summary, from which one button
 * starts working through the tasks in a row.
 */

/** Where the My work choice is remembered. */
const FILTER_KEY = "medjobs.tasks.filter";

/**
 * Where "I have put the teaching campus away" is remembered.
 *
 * Separate from the real campuses, which are hidden in the database for the
 * whole team, because the teaching campus is itself a browser-only object:
 * it is built on load, never fetched, never written, and thrown away on
 * refresh. There is no row to hide it in, and hiding it for everybody would
 * be wrong anyway — whether you want a practice campus on screen is a
 * property of you, not of the programme.
 */
const DEMO_HIDDEN_KEY = "medjobs.tasks.hideDemo";

const CHANNEL_OF: Partial<Record<SectionKey, "st3" | "st4" | "st5" | "st6" | "st7">> = {
  jobboard: "st3",
  advisors: "st4",
  orgs: "st5",
  events: "st6",
  professors: "st7",
};

/** Hide: an eye with a line through it. */
function EyeOffIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a9.1 9.1 0 0 0 5.4-1.6" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

/** Show again. */
function EyeIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function TasksBoard({ seed }: { seed?: BoardUniversity[] }) {
  const [board, setBoard] = useState<BoardUniversity[] | null>(seed ?? null);
  // Built once and kept, so working a real university — which refetches the
  // board — does not wipe what somebody has done on the teaching campus. A
  // page refresh makes a new one, which is the reset.
  const demo = useRef<BoardUniversity | null>(null);
  if (!demo.current) demo.current = demoUniversity();
  const [failed, setFailed] = useState<string | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [, force] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  /**
   * Whose work is in front of you, or null for everyone's.
   *
   * Remembered per browser, because somebody who works one slice of the
   * board works it every morning and re-picking it each time is a tax. Read
   * lazily and in a try/catch: storage throws in a private window, and a
   * board that will not render because of a filter preference is worse than
   * an unremembered filter.
   */
  const [filterId, setFilterId] = useState<string | null>(null);

  const [demoHidden, setDemoHidden] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_KEY);
      if (saved) setFilterId(saved);
      setDemoHidden(window.localStorage.getItem(DEMO_HIDDEN_KEY) === "1");
    } catch {
      /* no storage, no memory. The board still works. */
    }
  }, []);

  const chooseFilter = (id: string | null) => {
    setFilterId(id);
    try {
      if (id) window.localStorage.setItem(FILTER_KEY, id);
      else window.localStorage.removeItem(FILTER_KEY);
    } catch {
      /* the choice still applies to this sitting. */
    }
  };

  /**
   * Whether the hidden campuses are on screen.
   *
   * Not remembered. Hiding is shared and meant to stay out of the way; the
   * reveal is something you do to put one back, not a mode to sit in.
   */
  const [showHidden, setShowHidden] = useState(false);
  const [hiding, setHiding] = useState<string | null>(null);

  /**
   * Whether a row is put away. Two stores behind one question, so nothing
   * downstream has to know which kind of campus it is looking at.
   */
  const isHidden = (u: BoardUniversity) => (isDemoUniversity(u) ? demoHidden : !!u.hidden);

  const setHiddenFor = async (u: BoardUniversity, hidden: boolean) => {
    // The teaching campus has no row to write to, so it is remembered here
    // instead. No request, and nothing for the server to refuse.
    if (isDemoUniversity(u)) {
      setDemoHidden(hidden);
      try {
        if (hidden) window.localStorage.setItem(DEMO_HIDDEN_KEY, "1");
        else window.localStorage.removeItem(DEMO_HIDDEN_KEY);
      } catch {
        /* the choice still applies to this sitting. */
      }
      return;
    }

    setHiding(u.id);
    const before = board;
    // Optimistic, because the row vanishing is the whole feedback. Waiting
    // on a round trip to redraw the table reads as a click that did nothing.
    setBoard((prev) =>
      (prev ?? []).map((x) => (x.id === u.id ? { ...x, hidden } : x)),
    );
    try {
      const res = await fetch("/api/admin/medjobs/tasks-board/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "set_campus_hidden", campusId: u.id, hidden }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setBoard(before);
      setFailed(
        hidden ? `${u.name} could not be hidden.` : `${u.name} could not be brought back.`,
      );
    } finally {
      setHiding(null);
    }
  };

  const load = useCallback(async () => {
    if (seed) return;
    try {
      const res = await fetch("/api/admin/medjobs/tasks-board");
      const d = (await res.json()) as {
        universities: BoardUniversity[];
        people?: Person[];
        me?: Person | null;
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? `Request failed (${res.status}).`);
      // Fetched now, shown the moment nobody is typing. A reload replaces
      // the whole university object, and replacing the one a field is bound
      // to while somebody is mid-word throws the word away with no error and
      // nothing on screen. Saving a field no longer reloads at all, which is
      // where that actually bit; this covers the reloads that remain.
      applyWhenIdle(() => {
        setBoard([...d.universities, demo.current!]);
        setPeople(d.people ?? []);
        setMe(d.me ?? null);
        setFailed(null);
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "The board could not be loaded.");
    }
  }, [seed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return <p className="rounded-md bg-error-50 px-3 py-2.5 text-sm text-error-700">{failed}</p>;
  }
  if (!board) {
    return <p className="px-1 py-8 text-sm text-gray-500">Loading universities…</p>;
  }
  if (board.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center">
        <p className="text-sm font-medium text-gray-900">No universities yet</p>
        <p className="mt-1 text-xs text-gray-500">Add one and its first tasks appear here.</p>
      </div>
    );
  }

  // Most waiting first, then alphabetical. Work top down and stop when the
  // counts run out.
  // The teaching campus sits at the bottom whatever it has waiting on it. It
  // is not work, and sorting it up among the real universities by task count
  // is how somebody ends up practising on a campus they meant to work.
  // How much is waiting for whoever is being shown. Unfiltered, that is
  // every section, so this is the old readyCount by another name.
  const waitingFor = (u: BoardUniversity) =>
    readyCountIn(u, sectionsFor(u.assignments, filterId));

  // Under a filter, a university the person owns nothing at drops out
  // entirely. Forty campuses with thirty-five greyed is worse than five.
  const visible = filterId
    ? board.filter((u) => sectionsFor(u.assignments, filterId).length > 0)
    : board;

  const hiddenCount = visible.filter(isHidden).length;
  const rows = [...(showHidden ? visible : visible.filter((u) => !isHidden(u)))].sort(
    (a, b) =>
      // Hidden below everything, including the teaching campus: they are
      // only on screen at all so somebody can put one back.
      Number(isHidden(a)) - Number(isHidden(b)) ||
      Number(isDemoUniversity(a)) - Number(isDemoUniversity(b)) ||
      waitingFor(b) - waitingFor(a) ||
      a.name.localeCompare(b.name),
  );
  const open = board.find((u) => u.slug === openSlug) ?? null;

  // Everyone, then you, then anybody else actually holding a pair. Built
  // from the assignments rather than the roster so the menu stays short and
  // nobody who is not working campuses clutters it.
  const holders = new Map<string, Person>();
  for (const u of board)
    for (const p of assignedPeople(u.assignments)) holders.set(p.id, p);
  if (me) holders.delete(me.id);
  const others = [...holders.values()].sort(byName);
  const filterName =
    filterId === null
      ? "Everyone"
      : (me?.id === filterId ? me.name : others.find((p) => p.id === filterId)?.name) ??
        // Somebody who held work when the choice was made and holds none now.
        // Named plainly rather than silently reset, so an empty board has a
        // reason on screen.
        people.find((p) => p.id === filterId)?.name ??
        "Someone";

  return (
    <>
      {(me || others.length > 0) && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Showing
          </span>
          <FilterMenu
            label={filterName}
            me={me}
            others={others}
            value={filterId}
            onChange={chooseFilter}
          />
          {filterId && rows.length === 0 && (
            <span className="text-[12px] text-gray-500">
              Nothing assigned to {filterName} yet.
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>University</th>
              <th className={`${TH} text-center`}>Tasks</th>
              {SECTION_ORDER.map((s) => (
                <th key={s} className={`${TH} text-center`}>
                  {LADDERS[s].label}
                </th>
              ))}
              {/* The hide control. No label: the column is 2rem of hover
                  affordance, and a heading over it would read as data. */}
              <th className={`${TH} w-8`} aria-label="Hide" />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const n = waitingFor(u);
              const on = assignedPeople(u.assignments);
              return (
                <tr
                  key={u.slug}
                  onClick={() => setOpenSlug(u.slug)}
                  className={`group/row cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                    isHidden(u) ? "opacity-45" : ""
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2 shrink-0">{n ? <DueDot /> : null}</span>
                      <span className="text-[13px] font-medium text-gray-900">{u.name}</span>
                      {u.isDemo && (
                        <span
                          title="A teaching campus. Safe to work on, and left out of every report."
                          className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-gray-500"
                        >
                          Demo
                        </span>
                      )}
                    </span>
                    {/* Who is on this campus. Indented to clear the dot
                        column so the names line up under the name. */}
                    {on.length > 0 && (
                      <span className="mt-0.5 block pl-4 text-[11.5px] text-gray-500">
                        {on.map((p) => p.name).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-center text-[13px] font-semibold tabular-nums text-warning-700">
                    {n || <span className="text-gray-300">·</span>}
                  </td>
                  {SECTION_ORDER.map((s) => {
                    const channel = CHANNEL_OF[s];
                    // Providers and Students have no channel dot, because
                    // neither is a channel that goes live. They carry a
                    // number instead, and the number is an outcome rather
                    // than a workload: providers ready for students, and
                    // student applications. The Tasks column already says
                    // how much is waiting, and saying it again per section
                    // told you nothing the first column had not.
                    if (!channel) {
                      const n = s === "providers" ? readyForStudents(u) : applications(u);
                      return (
                        <td
                          key={s}
                          className={`py-2.5 pr-3 text-center text-[12px] tabular-nums ${
                            n ? "font-medium text-gray-700" : "text-gray-400"
                          }`}
                        >
                          {n || "—"}
                        </td>
                      );
                    }
                    const status = u.channels[channel] ?? "not_yet";
                    return (
                      <td key={s} className="py-2.5 pr-3">
                        <span className="flex items-center justify-center" title={statusLabel(status)}>
                          <StatusDot status={status} />
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2.5 pr-1 text-right align-top">
                    <button
                      type="button"
                      disabled={hiding === u.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setHiddenFor(u, !isHidden(u));
                      }}
                      title={
                        isHidden(u)
                          ? `Show ${u.name} on the board again`
                          : isDemoUniversity(u)
                            ? "Put the teaching campus away. Just for you, and it comes back from the line below."
                            : `Hide ${u.name}. Nothing on it is archived or lost.`
                      }
                      aria-label={isHidden(u) ? `Show ${u.name}` : `Hide ${u.name}`}
                      className={`rounded p-1 text-gray-300 transition-opacity duration-100 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 ${
                        isHidden(u) ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
                      }`}
                    >
                      {isHidden(u) ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Without this, hiding is a one-way door and the only way back is a
          database. Shown only when something is actually hidden. */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="mt-2 text-[12px] text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          {showHidden
            ? "Put the hidden ones away"
            : `${hiddenCount} hidden \u00B7 show ${hiddenCount === 1 ? "it" : "them"}`}
        </button>
      )}


      {open && (
        <UniversityFlow
          university={open}
          people={people}
          filterId={filterId}
          onClose={() => setOpenSlug(null)}
          onChanged={() => force((x) => x + 1)}
          onReload={load}
        />
      )}
    </>
  );
}

const TH = "py-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500";

/**
 * Whose work the board is showing.
 *
 * Everyone by default. Your own name is pinned above the rest and labelled,
 * because "my work" is the reason most people open this and hunting for
 * yourself in an alphabetical list is a small daily tax.
 */
function FilterMenu({
  label,
  me,
  others,
  value,
  onChange,
}: {
  label: string;
  me: Person | null;
  others: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
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

  const pick = (id: string | null) => {
    setOpen(false);
    onChange(id);
  };
  const row = (id: string | null, text: string) => (
    <button
      key={id ?? "everyone"}
      type="button"
      onClick={() => pick(id)}
      className={`block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-gray-50 ${
        value === id ? "font-semibold text-primary-700" : "text-gray-700"
      }`}
    >
      {text}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
          value
            ? "border-primary-600 bg-primary-50 font-medium text-primary-700 hover:bg-primary-100"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {label} <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-gray-200 bg-white py-0.5 shadow-lg">
          {row(null, "Everyone")}
          {me && (
            <>
              <div className="my-0.5 border-t border-gray-100" />
              {row(me.id, `My work (${me.name})`)}
            </>
          )}
          {others.length > 0 && <div className="my-0.5 border-t border-gray-100" />}
          {others.map((p) => row(p.id, p.name))}
        </div>
      )}
    </div>
  );
}
