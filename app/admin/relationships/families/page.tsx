"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SeekerRelationshipRow } from "@/lib/seeker-touches/types";
import { TABS, TAB_BLURB, matches, openWorkCount, type Tab } from "@/lib/seeker-touches/queues";
import { ORIGIN_LABEL, consentWarning, detailLine, nextLine, problemLine, retryLine, stateOf, type Tone } from "@/lib/seeker-touches/present";

/**
 * Relationships — care seekers.
 *
 * NOT A TABLE. The first version was a four-column grid and every cell stacked
 * two or three lines of its own, so one family became a small page: eleven text
 * objects, four type sizes, three font families, nine forced wrap points. It
 * read as chaos however few chips were on it.
 *
 * So: one flex row per family. Name and one muted line on the left, where it
 * stands on the right. A row earns a third line only when something is actually
 * wrong, which means the loud rows are taller than the quiet ones and the shape
 * of the list is visible before a word of it is read. State is carried by a
 * coloured left rail — red act now, amber waiting on us, nothing otherwise —
 * rather than by five colours of chip.
 *
 * Nothing here is stored. Every value is derived at read time in
 * lib/seeker-touches/timeline.server.ts and put into words in ./present.
 */

const RAIL: Record<Tone, string> = {
  act: "border-l-red-600 bg-red-50/30",
  warn: "border-l-amber-500 bg-amber-50/30",
  none: "border-l-transparent",
};

const STATE_TONE: Record<Tone, string> = {
  act: "text-red-700",
  warn: "text-amber-700",
  none: "text-gray-700",
};

const PROBLEM_TONE: Record<Tone, string> = {
  act: "text-red-700",
  warn: "text-amber-700",
  none: "text-gray-600",
};

/**
 * Take a row off the board, or put it back.
 *
 * Two steps on purpose. A single click that archives is a click somebody makes
 * by accident on a page they are scrolling, and this is the only control here
 * that removes a family from view. Naming the reason is also the point: the
 * difference between "we made this row ourselves" and "the ad reached the wrong
 * audience" is what tells us whether targeting is leaking, and nothing else
 * records it.
 */
const ARCHIVE_REASONS: { key: string; label: string }[] = [
  { key: "test_record", label: "Ours, a test" },
  { key: "not_a_care_seeker", label: "Not looking for care" },
  { key: "duplicate", label: "Duplicate" },
  { key: "resolved_elsewhere", label: "Sorted elsewhere" },
  { key: "no_answer", label: "Never answered" },
  { key: "opted_out", label: "Asked us to stop" },
  { key: "other", label: "Something else" },
];

function ArchiveControl({ row, onDone }: { row: SeekerRelationshipRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE", reason?: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/seeker-archive", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seekerId: row.seeker_id, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error ?? "Did not save");
        return;
      }
      setOpen(false);
      onDone();
    } catch {
      setErr("Did not save");
    } finally {
      setBusy(false);
    }
  }

  if (row.archived) {
    return (
      <div className="shrink-0 py-3.5 pr-4 text-right">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-gray-400">
          {row.archived.reason.replace(/_/g, " ")}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send("DELETE")}
          className="mt-1 text-[12px] text-teal-700 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Put back
        </button>
        {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      </div>
    );
  }

  return (
    <div className="shrink-0 py-3.5 pr-4 text-right">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
        >
          Archive
        </button>
      ) : (
        <div className="flex max-w-[15rem] flex-wrap justify-end gap-1">
          {ARCHIVE_REASONS.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={busy}
              onClick={() => void send("POST", a.key)}
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 hover:border-gray-500 disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setOpen(false); setErr(null); }}
            className="px-1 text-[11px] text-gray-400 hover:text-gray-700"
          >
            Cancel
          </button>
          {err && <div className="w-full text-[11px] text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}

/** "+14693187159" -> "(469) 318-7159". Anything else is shown as stored. */
function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

/**
 * Their words only. Gmail snippets arrive HTML-escaped and run on into the
 * quoted thread ("… On Sun, Sep 20, 2026 at 12:21 AM Olera Support
 * &lt;support@olera.care&gt;"), which on a reply row reads as if they wrote it.
 */
function theirWords(text: string): string {
  const decoded = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  const cut = decoded.search(/\s(On\s(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|From:\s|-{2,}\s*Original Message)/);
  return (cut > 0 ? decoded.slice(0, cut) : decoded).trim();
}

const ORIGINS = ["city_ad", "ad_boost", "benefits", "provider_page", "unknown"] as const;
const DAY_CHOICES = [14, 45, 90, 180];
const PAGE = 50;

/**
 * Name, email, phone or place. Phone matches on digits alone, so "469 318"
 * finds +14693187159 however either side was typed.
 */
function matchesSearch(r: SeekerRelationshipRow, q: string): boolean {
  const needle = q.toLowerCase();
  const hay = [r.label, r.email, r.city, r.state, r.city_slug].filter(Boolean).join(" ").toLowerCase();
  if (hay.includes(needle)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(digits);
}

/**
 * WHICH QUEUE, WHICH ORIGIN AND HOW FAR BACK LIVE IN THE URL, NOT IN STATE.
 *
 * They were useState, so the list URL was the same string whatever you were
 * looking at. Open a family, press the browser back button, and you landed on
 * the unfiltered default and had to rebuild the view by hand. A filtered queue
 * IS a place; a place needs an address.
 *
 * Filter changes use router.replace, not push. With push, every chip you tried
 * would become a history entry and getting back out of the page would mean
 * pressing back once per chip.
 */
function AdminSeekerRelationshipsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<SeekerRelationshipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tab: Tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "reply") as Tab;
  // Where they came from, filtered independently of what needs doing. You
  // almost always want "the ad families in this queue", not one or the other.
  const origin = (ORIGINS as readonly string[]).includes(params.get("from") ?? "")
    ? (params.get("from") as SeekerRelationshipRow["origin"])
    : ("all" as const);
  const days = DAY_CHOICES.includes(Number(params.get("days"))) ? Number(params.get("days")) : 45;

  // Defaults are omitted from the URL so the address stays readable and the
  // bare route keeps meaning "the reply queue, everywhere, 45 days".
  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "/admin/relationships/families", { scroll: false });
    },
    [params, router],
  );
  const setTab = (t: Tab) => setQuery({ tab: t === "reply" ? null : t });
  const setOrigin = (o: "all" | SeekerRelationshipRow["origin"]) => setQuery({ from: o === "all" ? null : o });
  const setDays = (d: number) => setQuery({ days: d === 45 ? null : String(d) });
  // Carried onto each row so the in-page back link returns to this exact view.
  const listQuery = params.toString();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/seeker-touches?days=${days}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError("Failed to load care seeker relationships. Reload to try again.");
      setRows([]);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { reply: 0, call: 0, follow: 0, close: 0, record: 0, reach: 0, all: 0, archived: 0 };
    for (const r of rows ?? []) for (const t of TABS) if (matches(r, t.key)) c[t.key] += 1;
    return c;
  }, [rows]);

  // The facts true of most of the list live up here, so they never have to
  // appear on a row. This is what buys the rows their quiet.
  const stats = useMemo(() => {
    const all = rows ?? [];
    return {
      unanswered: all.filter((r) => r.flags.includes("awaiting_reply")).length,
      unreachable: all.filter((r) => r.flags.includes("unreachable")).length,
      withProvider: all.filter((r) => r.episode.state === "waiting").length,
      unnamed: all.filter((r) => r.label_is_fallback).length,
    };
  }, [rows]);

  // SEARCH LOOKS EVERYWHERE. Finding one person is a different job from
  // working a queue: the person you are looking for may be in any tab, or
  // archived, and making you guess which first is the scroll this replaces.
  const urlQ = params.get("q") ?? "";
  // The box owns what is typed; the URL follows a moment later. Reading the
  // box straight from the URL dropped keystrokes, because router.replace
  // lands after the next key, so typing "dawnavyn" left "n".
  const [draft, setDraft] = useState(urlQ);
  useEffect(() => {
    // Blank-but-spaces counts as empty, or it would re-replace forever.
    const want = draft.trim() ? draft : "";
    if (want === urlQ) return;
    const t = setTimeout(() => setQuery({ q: want || null }), 250);
    return () => clearTimeout(t);
  }, [draft, urlQ, setQuery]);
  const q = draft.trim();
  const searching = q.length > 0;
  const inTab = (rows ?? []).filter((r) => matches(r, tab)).length;
  const shown = searching
    ? (rows ?? []).filter((r) => matchesSearch(r, q))
    : (rows ?? []).filter((r) => matches(r, tab) && (origin === "all" || r.origin === origin));

  // Fifty at a time. The work queues are a dozen rows; All is ~400 and was one
  // long scroll. Paging the render, not the fetch: the load time is the
  // server assembling every family's history, which is the same for 50 rows
  // as for 400, so a paged API would add round trips and save nothing.
  const [limit, setLimit] = useState(PAGE);
  const viewKey = `${tab}|${origin}|${q}|${days}`;
  const [limitFor, setLimitFor] = useState(viewKey);
  if (limitFor !== viewKey) {
    setLimitFor(viewKey);
    setLimit(PAGE);
  }
  const visible = shown.slice(0, limit);

  // Counted against the CURRENT queue, so the chips say how many of these are
  // ad families rather than how many exist overall.
  const originCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows ?? []) if (matches(r, tab)) c[r.origin] = (c[r.origin] ?? 0) + 1;
    return c;
  }, [rows, tab]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">Care Seeker Relationships</h1>
          {/* Says what to DO, matching tabs that are now jobs rather than
              states. The old line described the page's contents; a queue
              should describe the work. */}
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Every family who needs something from us, grouped by what to do about it. Open one for the whole story.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* "Providers" alone also describes the directory at
              /admin/directory. Name the page it actually opens. */}
          <Link
            href="/admin/relationships"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Provider relationships
          </Link>
          <a
            href={`/api/admin/seeker-touches?days=${days}&format=md`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Read as text
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Four numbers before the first row. */}
        <div className="grid grid-cols-2 gap-px bg-gray-200 sm:grid-cols-4">
          {[
            { n: stats.unanswered, k: "wrote to us, still unanswered", tone: "text-orange-800" },
            { n: stats.unreachable, k: "no working way to reach", tone: "text-red-700" },
            { n: stats.withProvider, k: "handed over, outcome unknown", tone: "text-gray-900" },
            { n: stats.unnamed, k: "we don't know their name", tone: "text-gray-900" },
          ].map((s) => (
            <div key={s.k} className="bg-white px-3.5 py-3">
              <div className={`text-[25px] font-semibold leading-none tracking-tight tabular-nums ${s.tone}`}>
                {rows === null ? "—" : s.n}
              </div>
              <div className="mt-1.5 text-[11.5px] leading-tight text-gray-500">{s.k}</div>
            </div>
          ))}
        </div>

        {/* UNDERLINE TABS, NOT PILLS — the same strip /admin/connections uses.
            Six filled capsules were the loudest thing on the page and they
            competed with the coloured rails, which are the part that actually
            says something. They also wrapped: with ml-auto in the same wrapping
            flow, the window select was pushed onto a line of its own the moment
            the tabs filled the row. The strip scrolls sideways instead of
            wrapping, so the chrome is a fixed height at every width, and the
            select sits outside it and never moves. */}
        <div className="flex items-stretch gap-2 border-t border-gray-200 pl-2 pr-3.5">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t.label}
                {rows ? <span className={`ml-1.5 ${tab === t.key ? "text-gray-500" : "text-gray-300"}`}>{counts[t.key]}</span> : null}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="my-auto shrink-0 rounded border border-gray-200 bg-white px-1.5 py-1 font-mono text-[11px] text-gray-600"
            aria-label="How far back to look"
          >
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>

        {/* One line saying what this queue IS. The tab label is a verb; this is
            the rule behind it, so nobody has to infer why a row qualified. */}
        <p className="px-3.5 pb-2 text-[11.5px] leading-tight text-gray-500">{TAB_BLURB[tab]}</p>

        {/* Where they came from. Separate from the queue on purpose: the useful
            question is "the ad families in THIS queue". Provider page is the
            honest name for the big one — a connection records nothing about
            acquisition, so we know they enquired from a provider page and not
            how they got there. Paid counts are a floor, never a total. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-gray-200 px-3.5 pb-3 text-[11px]">
          <input
            id="family-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find anyone: name, email, phone, city"
            aria-label="Find a family"
            className="order-last w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-400 sm:order-none sm:ml-auto sm:w-64"
          />
          {searching ? (
            <span className="text-gray-500">
              Searching everyone, every tab and archived · {shown.length} found ·{" "}
              <button type="button" onClick={() => setDraft("")} className="font-medium text-teal-700 hover:underline">
                Clear
              </button>
            </span>
          ) : (
          <>
          <span className="mr-0.5 font-mono uppercase tracking-[0.1em] text-gray-400">From</span>
          <button
            type="button"
            onClick={() => setOrigin("all")}
            className={`font-medium ${origin === "all" ? "text-gray-900 underline underline-offset-2" : "text-gray-500 hover:text-gray-800"}`}
          >
            Anywhere
          </button>
          {/* Only origins that are actually in this queue. A greyed "Ad Boost 0"
              reads as "we have no Ad Boost families", when it means "none in
              this queue" — and half the row was that. An origin the filter is
              currently ON stays visible even at zero, or clicking it would make
              the control that produced the empty list disappear. */}
          {ORIGINS.filter((o) => originCounts[o] || origin === o).map((o) => (
            <span key={o} className="flex items-center gap-2">
              <span aria-hidden className="text-gray-300">
                ·
              </span>
              <button
                type="button"
                onClick={() => setOrigin(o)}
                className={`font-medium ${origin === o ? "text-gray-900 underline underline-offset-2" : "text-gray-500 hover:text-gray-800"}`}
              >
                {ORIGIN_LABEL[o]} {rows ? originCounts[o] ?? 0 : ""}
              </button>
            </span>
          ))}
          </>
          )}
        </div>

        <div className="flex gap-4 border-b border-gray-200 py-2.5 pl-[19px] pr-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          <span className="flex-1">Family</span>
          <span className="w-[150px] shrink-0 text-right">Where it stands</span>
        </div>

        {error && <p className="px-4 py-6 text-sm text-red-600">{error}</p>}
        {rows === null && !error && <p className="px-4 py-10 text-center text-sm text-gray-400">Loading…</p>}
        {rows !== null && searching && shown.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Nobody in the last {days} days matches &ldquo;{q}&rdquo;. Try a wider window.</p>
        )}
        {rows !== null && !searching && shown.length === 0 && (
          // An empty queue is the goal, not an error, and it should say where
          // the remaining work went rather than leaving a dead end.
          <div className="px-4 py-10 text-center">
            {/* "Nothing in this queue" is false when the queue has rows and the
                origin filter hid them — and it sends someone looking for work
                that is on screen behind a chip they forgot they clicked. */}
            {origin !== "all" && inTab > 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700">
                  No {ORIGIN_LABEL[origin].toLowerCase()} families in this queue.
                </p>
                <button
                  type="button"
                  onClick={() => setOrigin("all")}
                  className="mt-1 text-xs text-teal-700 underline-offset-2 hover:underline"
                >
                  Show all {inTab} from anywhere
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">
                  {tab === "all" ? "Nobody has a live episode in this window." : "Nothing in this queue."}
                </p>
                {tab !== "all" && (
                  <p className="mt-1 text-xs text-gray-500">
                    {openWorkCount(rows) === 0
                      ? "No family is waiting on anything right now."
                      : `${openWorkCount(rows)} still need something in the other queues.`}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {visible.map((r) => {
          const st = stateOf(r);
          const problem = problemLine(r);
          const consent = consentWarning(r);
          const next = nextLine(r);
          const retry = retryLine(r);
          // What you need to act without opening the row: the number on a
          // call, their own words on a reply.
          const showPhone =
            Boolean(r.phone) && (r.flags.includes("promise_owed") || r.flags.includes("tried_three") || r.flags.includes("unreachable"));
          const said = r.flags.includes("awaiting_reply") ? r.last_inbound : null;
          return (
            <div
              key={r.seeker_id}
              className={`flex items-start border-b border-l-[3px] border-b-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 ${RAIL[st.tone]}`}
            >
            <Link
              href={`/admin/relationships/families/${r.seeker_id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ""}`}
              className="flex min-w-0 flex-1 items-start gap-4 py-3.5 pl-4 pr-2"
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[15px] leading-snug tracking-[-0.01em] ${
                    r.label_is_fallback ? "font-normal text-gray-600" : "font-semibold text-gray-900"
                  }`}
                >
                  {r.label}
                  {/* Only where it earns the ink. "Provider page" on 330 of 394
                      rows is noise; the two paid origins and benefits are the
                      ones a person scans for. */}
                  {r.origin !== "provider_page" && r.origin !== "unknown" && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-gray-600">
                      {ORIGIN_LABEL[r.origin]}
                    </span>
                  )}
                </div>
                {detailLine(r) && (
                  <div className="mt-0.5 text-[12.5px] leading-normal text-gray-500">{detailLine(r)}</div>
                )}
                {problem && (
                  <div className={`mt-1.5 text-[13px] font-medium leading-snug ${PROBLEM_TONE[st.tone]}`}>{problem}</div>
                )}
                {showPhone && <div className="mt-1 font-mono text-[12.5px] text-gray-700">{formatPhone(r.phone!)}</div>}
                {said && (
                  <div className="mt-1.5 border-l-2 border-gray-200 pl-2 text-[13px] leading-snug text-gray-700">
                    <span className="font-medium">{theirWords(said.title)}</span>
                    {/* A text's detail is the matched keyword, not more of what they said. */}
                    {said.channel === "email" && said.detail && said.detail !== said.title && <span className="text-gray-500"> — {theirWords(said.detail)}</span>}
                  </div>
                )}
                {retry && <div className="mt-1.5 text-[12.5px] leading-snug text-gray-500">{retry}</div>}
                {next && <div className="mt-1.5 text-[13px] leading-snug text-teal-800">{next}</div>}
                {consent && <div className="mt-1 text-[11.5px] leading-snug text-gray-400">{consent}</div>}
              </div>
              <div className="w-[150px] shrink-0 text-right">
                <div className={`text-[13px] font-semibold leading-snug ${STATE_TONE[st.tone]}`}>{st.phrase}</div>
                {st.age && <div className="mt-0.5 font-mono text-[11px] text-gray-400">{st.age}</div>}
              </div>
            </Link>
            {/* Outside the Link on purpose: a button nested in an anchor is
                invalid, and every click on it would navigate instead. */}
            <ArchiveControl row={r} onDone={load} />
            </div>
          );
        })}
        {shown.length > visible.length && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-[12.5px]">
            <span className="text-gray-500">
              Showing {visible.length} of {shown.length}
            </span>
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Show {Math.min(PAGE, shown.length - visible.length)} more
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-3xl text-[11.5px] leading-relaxed text-gray-400">
        Derived at read time from connections, city leads, email, inbound texts, support@ threads and site activity.
        Nothing on this page is stored, so it cannot disagree with the events it is built from.
      </p>
    </div>
  );
}

export default function AdminSeekerRelationshipsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10 text-sm text-gray-400">Loading…</div>}>
      <AdminSeekerRelationshipsInner />
    </Suspense>
  );
}
