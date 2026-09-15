"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SEEKER_FLAG_LABEL, type SeekerFlag, type SeekerRelationshipRow } from "@/lib/seeker-touches/types";

/**
 * Relationships — care seekers.
 *
 * The family half of /admin/relationships. Same bones as the provider list:
 * one row per family, last touch on any channel from anyone, whoever is waiting
 * on us at the top, and nothing on the page is stored.
 *
 * Three columns the provider list has no reason to carry, because a family is
 * not a business: whether we can reach them at all, what we are allowed to do,
 * and who we are blocked on.
 */

const FLAG_STYLE: Record<SeekerFlag, string> = {
  awaiting_reply: "bg-rose-50 text-rose-800",
  unreachable: "bg-red-50 text-red-700",
  opted_out: "bg-gray-100 text-gray-600",
  provider_silent: "bg-amber-50 text-amber-800",
  outcome_reported: "bg-emerald-50 text-emerald-800",
  never_human: "bg-gray-100 text-gray-600",
  no_name: "bg-gray-100 text-gray-500",
  promise_owed: "bg-orange-50 text-orange-800",
};

const EPISODE_STYLE: Record<string, string> = {
  open: "text-gray-900",
  waiting: "text-amber-800",
  dormant: "text-gray-400",
  closed: "text-gray-400",
};

type Tab = "needs_you" | "open" | "unreachable" | "waiting" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "needs_you", label: "Waiting on us" },
  { key: "open", label: "Open" },
  { key: "unreachable", label: "Can't reach" },
  { key: "waiting", label: "Provider has it" },
  { key: "all", label: "All" },
];

function matches(r: SeekerRelationshipRow, tab: Tab): boolean {
  switch (tab) {
    case "needs_you":
      // Opted out is never "waiting on us": there is no channel left to answer
      // on, so leaving them here just pads the one tab that is meant to be a
      // to-do list.
      if (r.flags.includes("opted_out")) return false;
      return (
        r.flags.includes("awaiting_reply") ||
        r.flags.includes("promise_owed") ||
        r.flags.includes("outcome_reported")
      );
    case "open":
      return r.episode.state === "open";
    case "unreachable":
      return r.flags.includes("unreachable");
    case "waiting":
      return r.episode.state === "waiting";
    default:
      return true;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/** Provider names run long enough to push the column past the card's edge. */
function shorten(s: string | null, n: number): string {
  if (!s) return "a provider";
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function actorWord(a: "out" | "in" | "system"): string {
  return a === "out" ? "You" : a === "in" ? "Them" : "System";
}

/** What we are allowed to do, in words a person can act on. */
function consentText(r: SeekerRelationshipRow): { text: string; tone: string } {
  switch (r.consent) {
    case "opted_out":
      return { text: "Opted out — no channel", tone: "text-red-700" };
    case "olera_only":
      return { text: "Olera only — no handoff without a spoken yes", tone: "text-amber-800" };
    case "provider_ok":
      return { text: "Asked to be contacted by providers", tone: "text-gray-500" };
    default:
      return { text: "No consent record", tone: "text-gray-400" };
  }
}

/** Reachability, said plainly. This is the column that earns the page. */
function reachText(r: SeekerRelationshipRow): { text: string; tone: string } {
  if (r.reach.open.length === 0) {
    return { text: r.reach.note ?? "No working contact", tone: "text-red-700" };
  }
  if (r.reach.note) {
    return { text: `${r.reach.open.join(" + ")} only — ${r.reach.note}`, tone: "text-amber-800" };
  }
  return { text: r.reach.open.join(" + "), tone: "text-gray-500" };
}

export default function AdminSeekerRelationshipsPage() {
  const [rows, setRows] = useState<SeekerRelationshipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("needs_you");
  const [days, setDays] = useState(45);

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
    const c: Record<Tab, number> = { needs_you: 0, open: 0, unreachable: 0, waiting: 0, all: 0 };
    for (const r of rows ?? []) for (const t of TABS) if (matches(r, t.key)) c[t.key] += 1;
    return c;
  }, [rows]);

  const shown = (rows ?? []).filter((r) => matches(r, tab));
  const awaiting = (rows ?? []).filter((r) => r.flags.includes("awaiting_reply")).length;
  const noName = (rows ?? []).filter((r) => r.flags.includes("no_name")).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Care seekers</p>
          <h1 className="text-2xl font-semibold text-gray-950">Relationships</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Who is waiting on us, who we cannot reach, and who has gone quiet. Every touch on every channel, from
            anyone. Open a family for the whole story.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/relationships"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Providers
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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1 font-medium ${
              tab === t.key
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label} {rows ? `· ${counts[t.key]}` : ""}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-gray-500">
          {rows && (
            <>
              <span>
                {awaiting} unanswered · {noName} with no name
              </span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600"
                aria-label="How far back to look"
              >
                <option value={14}>14 days</option>
                <option value={45}>45 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
            </>
          )}
        </span>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <th className="w-[27%] px-4 py-2.5">Family</th>
              <th className="w-[33%] px-4 py-2.5">Last touch</th>
              <th className="w-[22%] px-4 py-2.5">Can we reach them</th>
              <th className="w-[18%] px-4 py-2.5">Episode</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Nothing here.
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const urgent = r.flags.includes("awaiting_reply") || r.flags.includes("promise_owed");
              const dead = r.flags.includes("unreachable");
              const reach = reachText(r);
              const consent = consentText(r);
              return (
                <tr
                  key={r.seeker_id}
                  className={`border-b border-gray-100 align-top last:border-b-0 ${
                    dead ? "bg-red-50/40" : urgent ? "bg-orange-50/40" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/relationships/families/${r.seeker_id}`}
                      className={`hover:underline ${
                        r.label_is_fallback ? "font-normal italic text-gray-500" : "font-semibold text-gray-900"
                      }`}
                    >
                      {r.label}
                    </Link>
                    <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                      {[r.city, r.state].filter(Boolean).join(", ")}
                      {r.timeline ? ` · ${r.timeline.replace(/_/g, " ")}` : ""}
                      {r.payment.length ? ` · ${r.payment.join(", ")}` : ""}
                      {r.city_slug ? (
                        <>
                          {" · "}
                          <Link href="/admin/city-ads" className="text-teal-700 hover:underline">
                            city lead →
                          </Link>
                        </>
                      ) : null}
                    </div>
                    {r.situation && (
                      <p className="mt-1 line-clamp-2 text-[12px] italic leading-snug text-gray-600" title={r.situation}>
                        “{r.situation}”
                      </p>
                    )}
                    {r.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.flags.map((f) => (
                          <span key={f} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${FLAG_STYLE[f]}`}>
                            {SEEKER_FLAG_LABEL[f]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {r.last_touch ? (
                      <>
                        <div className="flex items-start gap-1.5">
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                              r.last_touch.actor === "system"
                                ? "border-transparent bg-gray-100 text-gray-500"
                                : r.last_touch.actor === "in"
                                  ? "border-emerald-200 text-emerald-700"
                                  : "border-gray-200 text-gray-600"
                            }`}
                          >
                            {actorWord(r.last_touch.actor)}
                          </span>
                          <span className="line-clamp-2 text-gray-900" title={r.last_touch.title}>
                            {r.last_touch.title}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                          {fmtDate(r.last_touch.occurred_at)}
                          {r.last_touch.status ? ` · ${r.last_touch.status}` : ""}
                          {r.days_quiet !== null && r.days_quiet >= 3 ? ` · ${r.days_quiet}d quiet` : ""}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">Nothing on record</span>
                    )}
                  </td>

                  <td className="max-w-[28ch] px-4 py-3">
                    <div className={`text-[13px] ${reach.tone}`}>{reach.text}</div>
                    <div className={`mt-1 text-[11px] ${consent.tone}`}>{consent.text}</div>
                  </td>

                  <td className="px-4 py-3">
                    <div
                      className={`text-[13px] font-medium ${EPISODE_STYLE[r.episode.state] ?? "text-gray-700"}`}
                      title={r.episode.blocked_on ?? undefined}
                    >
                      {r.episode.state === "waiting" ? `Waiting on ${shorten(r.episode.blocked_on, 20)}` : r.episode.state}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                      {r.episode.closed_reason
                        ? r.episode.closed_reason
                        : r.episode.age_days !== null
                          ? `day ${r.episode.age_days + 1}`
                          : "—"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl font-mono text-[11px] leading-relaxed text-gray-400">
        Derived at read time from connections, city_leads, city_lead_messages, email_log, sms_inbound,
        support_email_messages and seeker_activity. Nothing on this page is stored, so it cannot disagree with the
        events it is built from.
      </p>
    </div>
  );
}
