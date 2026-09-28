"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SeekerRelationshipRow } from "@/lib/seeker-touches/types";
import { TABS, TAB_BLURB, matches, openWorkCount, type Tab } from "@/lib/seeker-touches/queues";
import { ORIGIN_LABEL, consentWarning, detailLine, nextLine, problemLine, stateOf } from "@/lib/seeker-touches/present";

/**
 * Relationships — care seekers.
 *
 * NOT A TABLE. The first version was a four-column grid and every cell stacked
 * two or three lines of its own, so one family became a small page: eleven text
 * objects, four type sizes, three font families, nine forced wrap points. It
 * read as chaos however few chips were on it.
 *
 * So: one row per family, in the case page's language (28 Sep). An avatar,
 * the name, one muted line of context, and one line that says what they wrote
 * or what to do; the time on the right. Only "act now" rows are marked, with a
 * dot on the avatar and the state in amber: when every row was tinted and
 * railed, nothing stood out. The page opens on one sentence naming what is
 * waiting, the tabs hide empty queues, and search sits behind an icon.
 *
 * Nothing here is stored. Every value is derived at read time in
 * lib/seeker-touches/timeline.server.ts and put into words in ./present.
 */

/** "{N} families …" — what the open queue is waiting on, in plain words. */
const TAB_SENTENCE: Record<Tab, string> = {
  urgent: "told us something is urgent at home",
  reply: "wrote to us and are waiting on a reply",
  letter: "have a letter waiting for your read",
  help: "asked for a person",
  call: "are waiting on a call from us",
  follow: "need a follow-up",
  close: "have been tried three times",
  record: "say the provider never got back to them",
  reach: "have no working way to reach them",
  all: "have something open in this window",
  archived: "are archived",
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
    const c: Record<Tab, number> = { urgent: 0, reply: 0, letter: 0, help: 0, call: 0, follow: 0, close: 0, record: 0, reach: 0, all: 0, archived: 0 };
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

  // THE TABS SHOW WHAT HAS WORK IN IT. Empty queues are hidden (a row of
  // zeros read as a wall of alarms), the first five with work are shown, and
  // the rest sit under More. The open tab always shows, even when it empties.
  const workTabs = TABS.filter((t) => t.key !== "all" && t.key !== "archived");
  const withWork = workTabs.filter((t) => counts[t.key] > 0 || t.key === tab);
  const shownTabs = withWork.slice(0, 5);
  const moreTabs = [...withWork.slice(5), ...TABS.filter((t) => t.key === "all" || t.key === "archived")].filter(
    (t) => !shownTabs.some((x) => x.key === t.key),
  );
  const [moreOpen, setMoreOpen] = useState(false);
  // Search, the window and where-they-came-from sit behind one icon: they are
  // for finding someone, not for working a queue. Open while any is in use.
  const [findOpen, setFindOpen] = useState(false);
  const findActive = searching || origin !== "all" || days !== 45;
  const n = counts[tab];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-[26px] font-bold tracking-[-0.02em] text-gray-950">Care Seeker Relationships</h1>
      {/* One sentence that says what is waiting, in the open queue's words. */}
      <p className="mt-1.5 text-[18px] font-semibold leading-snug text-gray-900 [text-wrap:balance]">
        {rows === null ? (
          <span className="text-gray-400">Loading…</span>
        ) : n === 0 ? (
          "Nothing is waiting here."
        ) : (
          <>
            <span className="text-[#b54708]">
              {n} {n === 1 ? "family" : "families"}
            </span>{" "}
            {TAB_SENTENCE[tab]}.
          </>
        )}
      </p>
      {/* The facts true of most of the list, as quiet links, so they never
          have to appear on a row. */}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-500">
        {rows !== null && stats.unreachable > 0 && (
          <button type="button" onClick={() => setTab("reach")} className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
            {stats.unreachable} with no working way to reach
          </button>
        )}
        {rows !== null && <span>{stats.withProvider} handed over, outcome unknown</span>}
        {rows !== null && <span>{stats.unnamed} with no name</span>}
        <Link href="/admin/relationships" className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
          Provider relationships
        </Link>
        <a
          href={`/api/admin/seeker-touches?days=${days}&format=md`}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800"
        >
          Read as text
        </a>
      </p>

      {/* Underline tabs: only the open one is dark; counts are small and grey. */}
      <div className="mt-6 flex items-end gap-3 border-b border-gray-200">
        <div className="-mb-px flex min-w-0 flex-1 gap-6 overflow-x-auto [mask-image:linear-gradient(90deg,#000_88%,transparent)] sm:[mask-image:none]">
          {shownTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 pb-3 text-[14.5px] transition-colors ${
                tab === t.key ? "border-gray-900 font-semibold text-gray-900" : "border-transparent font-medium text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
              {rows ? <span className={`ml-1.5 text-[13px] ${tab === t.key ? "text-gray-500" : "text-gray-400"}`}>{counts[t.key]}</span> : null}
            </button>
          ))}
        </div>
        {/* Outside the scrolling strip on purpose: a scrolling box clips
            anything that opens below it, and the menu was invisible. */}
          {moreTabs.length > 0 && (
            <div className="relative -mb-px shrink-0">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className={`whitespace-nowrap border-b-2 pb-3 text-[14.5px] font-medium ${
                  moreTabs.some((t) => t.key === tab) ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {moreTabs.find((t) => t.key === tab)?.label ?? "More"} <span aria-hidden="true">▾</span>
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-max min-w-[15rem] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg">
                  {moreTabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setTab(t.key);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-6 whitespace-nowrap px-3.5 py-2 text-left text-[14px] text-gray-800 hover:bg-gray-50"
                    >
                      {t.label}
                      <span className="text-[13px] text-gray-400">{rows ? counts[t.key] : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        <button
          type="button"
          onClick={() => setFindOpen((o) => !o)}
          aria-label="Find someone"
          aria-expanded={findOpen || findActive}
          className={`mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
            findActive ? "border-gray-900 text-gray-900" : "border-gray-200 text-gray-500 hover:text-gray-800"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
      </div>

      {(findOpen || findActive) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 py-3 text-[13px]">
          <input
            id="family-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Find anyone: name, email, phone, city"
            aria-label="Find a family"
            autoFocus={findOpen && !findActive}
            className="w-full rounded-full border border-gray-200 bg-white px-4 py-2 text-[14px] text-gray-900 placeholder:text-gray-400 sm:w-72"
          />
          {searching ? (
            <span className="text-gray-500">
              Searching everyone, every tab and archived · {shown.length} found ·{" "}
              <button type="button" onClick={() => setDraft("")} className="font-medium text-gray-900 underline underline-offset-2">
                Clear
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-500">
              <span>From</span>
              <button
                type="button"
                onClick={() => setOrigin("all")}
                className={origin === "all" ? "font-semibold text-gray-900" : "hover:text-gray-800"}
              >
                Anywhere
              </button>
              {ORIGINS.filter((o) => originCounts[o] || origin === o).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrigin(o)}
                  className={origin === o ? "font-semibold text-gray-900" : "hover:text-gray-800"}
                >
                  · {ORIGIN_LABEL[o]} {rows ? originCounts[o] ?? 0 : ""}
                </button>
              ))}
            </span>
          )}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700"
            aria-label="How far back to look"
          >
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The rule behind the queue, in a line. */}
      {!searching && <p className="mt-3 text-[13px] text-gray-500">{TAB_BLURB[tab]}</p>}

      {error && <p className="py-6 text-sm text-red-600">{error}</p>}
      {rows === null && !error && <p className="py-10 text-center text-sm text-gray-400">Loading…</p>}
      {rows !== null && searching && shown.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">Nobody in the last {days} days matches &ldquo;{q}&rdquo;. Try a wider window.</p>
      )}
      {rows !== null && !searching && shown.length === 0 && (
        // An empty queue is the goal, not an error, and it should say where
        // the remaining work went rather than leaving a dead end.
        <div className="py-12 text-center">
          {origin !== "all" && inTab > 0 ? (
            <>
              <p className="text-[15px] font-semibold text-gray-800">No {ORIGIN_LABEL[origin].toLowerCase()} families in this queue.</p>
              <button type="button" onClick={() => setOrigin("all")} className="mt-1 text-[13px] text-gray-900 underline underline-offset-2">
                Show all {inTab} from anywhere
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold text-gray-800">{tab === "all" ? "Nobody has a live episode in this window." : "All clear here."}</p>
              {tab !== "all" && (
                <p className="mt-1 text-[13px] text-gray-500">
                  {openWorkCount(rows) === 0
                    ? "No family is waiting on anything right now."
                    : `${openWorkCount(rows)} still need something in the other queues.`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-2">
        {visible.map((r) => {
          const st = stateOf(r);
          const problem = problemLine(r);
          const consent = consentWarning(r);
          const next = nextLine(r);
          // What you need to act without opening the row: the number on a
          // call, their own words on a reply.
          const showPhone =
            Boolean(r.phone) && (r.flags.includes("promise_owed") || r.flags.includes("tried_three") || r.flags.includes("unreachable"));
          const said = r.flags.includes("awaiting_reply") ? r.last_inbound : null;
          // One line of context: where, what, where they came from, and the
          // number when a call is the job.
          const meta = [
            detailLine(r),
            r.origin !== "provider_page" && r.origin !== "unknown" ? ORIGIN_LABEL[r.origin] : null,
            showPhone ? formatPhone(r.phone!) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          // The one line that tells you what to do or what they said, most
          // useful first.
          const saidText = said
            ? theirWords(said.channel === "email" && said.detail && said.detail !== said.title ? said.detail : said.title)
            : null;
          const initial = (r.label.replace(/[^A-Za-z0-9]/g, "").charAt(0) || "?").toUpperCase();
          // Mixed views need the state named; inside one queue the queue says it.
          const mixed = searching || tab === "all" || tab === "archived";
          return (
            <div key={r.seeker_id} className="group flex items-start gap-2 border-b border-gray-100">
              <Link
                href={`/admin/relationships/families/${r.seeker_id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ""}`}
                className="grid min-w-0 flex-1 grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3.5 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
              >
                <span
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold sm:h-11 sm:w-11 ${
                    st.tone === "act" ? "bg-[#f4e9dc] text-[#8a5a2b]" : "bg-[#edf7f7] text-[#417272]"
                  }`}
                >
                  {initial}
                  {st.tone === "act" && (
                    <span className="absolute -right-px -top-px h-3 w-3 rounded-full border-2 border-white bg-[#b54708]" aria-label="Needs you now" />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-[15.5px] ${r.label_is_fallback ? "font-medium text-gray-700" : "font-semibold text-gray-950"}`}
                  >
                    {r.label}
                  </span>
                  {meta && <span className="mt-0.5 block truncate text-[13.5px] text-gray-500">{meta}</span>}
                  {saidText ? (
                    <span className="mt-1.5 line-clamp-2 block text-[14px] leading-snug text-gray-700 sm:line-clamp-1">&ldquo;{saidText}&rdquo;</span>
                  ) : problem ? (
                    <span className={`mt-1.5 line-clamp-2 block text-[14px] leading-snug sm:line-clamp-1 ${st.tone === "act" ? "text-[#b54708]" : "text-gray-700"}`}>
                      {problem}
                    </span>
                  ) : next ? (
                    <span className="mt-1.5 line-clamp-2 block text-[14px] leading-snug text-gray-700 sm:line-clamp-1">{next}</span>
                  ) : null}
                  {consent && <span className="mt-1 block text-[12.5px] text-gray-400">{consent}</span>}
                </span>
                <span className="whitespace-nowrap pt-0.5 text-right text-[13px] text-gray-500">
                  {st.age}
                  {(st.tone === "act" || mixed) && (
                    <span className={`mt-0.5 block text-[12.5px] font-semibold ${st.tone === "act" ? "text-[#b54708]" : "text-gray-600"}`}>
                      {st.phrase}
                    </span>
                  )}
                </span>
              </Link>
              {/* Outside the Link on purpose: a button nested in an anchor is
                  invalid, and every click on it would navigate instead. Shown
                  on hover on a laptop; left off phones, where it sat beside
                  every row's time and squeezed the name. */}
              <div className="hidden transition-opacity sm:block sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                <ArchiveControl row={r} onDone={load} />
              </div>
            </div>
          );
        })}
      </div>
      {shown.length > visible.length && (
        <div className="flex items-center justify-between py-4 text-[13px]">
          <span className="text-gray-500">
            Showing {visible.length} of {shown.length}
          </span>
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-semibold text-gray-900 hover:border-gray-900"
          >
            Show {Math.min(PAGE, shown.length - visible.length)} more
          </button>
        </div>
      )}

      <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-gray-400">
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
