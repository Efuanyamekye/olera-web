"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TouchForm from "@/components/admin/TouchForm";
import { CHANNEL_LABEL, type RelationshipFlag, type RelationshipRow } from "@/lib/touches/types";

/**
 * Relationships — the Tuesday list.
 *
 * One row per provider we are in a relationship with. Overdue at the top, then by
 * due date, then by how long they have been quiet. "Last touch" is whatever happened
 * most recently on any channel, from anyone, human or system, and says which.
 *
 * Nothing on this page is stored. Every column is derived from provider_touches,
 * email_log and ad_campaign_requests at read time.
 *
 * Drawn like the case page and Care Seeker Relationships (28 Sep): one sentence
 * that names what is overdue, underline tabs, and one row per provider that
 * reads top to bottom (who, the next step, the last contact) with the due date
 * on the right. It was a four-column table in typewriter type with up to three
 * coloured tag pills per provider; now at most one flag shows, in words, and
 * "overdue" is a dot and a red date.
 */

/** The one flag worth a row's ink, most consequential first. Overdue is the dot. */
const FLAG_PRIORITY: RelationshipFlag[] = [
  "complaint_on_file",
  "comms_paused",
  "awaiting_reply",
  "blocked_on_ask",
  "unopened_streak",
  "never_human",
  "prefers_text",
];

const FLAG_LABEL: Record<RelationshipFlag, string> = {
  overdue: "overdue",
  awaiting_reply: "they wrote, no reply yet",
  blocked_on_ask: "we asked, still waiting",
  comms_paused: "our email to them is paused on purpose",
  never_human: "only ever got automated email",
  complaint_on_file: "spam complaint on file",
  prefers_text: "prefers text",
  unopened_streak: "3 unopened in a row",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function fmtDue(due: string | null): string {
  if (!due) return "—";
  const [y, m, d] = due.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function actorWord(a: "out" | "in" | "system"): string {
  return a === "out" ? "You" : a === "in" ? "Them" : "System";
}

export default function AdminRelationshipsPage() {
  const [rows, setRows] = useState<RelationshipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Opens on what needs doing; All is one tab away.
  const [filter, setFilter] = useState<"all" | "due" | "blocked" | "quiet">("due");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/touches");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError("Failed to load relationships.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (rows ?? []).filter((r) => {
    if (filter === "due") return !!r.open_action;
    if (filter === "blocked") return r.flags.includes("blocked_on_ask");
    if (filter === "quiet") return r.flags.includes("never_human") || (r.days_quiet ?? 0) >= 14;
    return true;
  });
  const overdue = (rows ?? []).filter((r) => r.flags.includes("overdue")).length;
  const neverHuman = (rows ?? []).filter((r) => r.flags.includes("never_human")).length;
  const blocked = (rows ?? []).filter((r) => r.flags.includes("blocked_on_ask")).length;

  const count = {
    due: (rows ?? []).filter((r) => !!r.open_action).length,
    quiet: (rows ?? []).filter((r) => r.flags.includes("never_human") || (r.days_quiet ?? 0) >= 14).length,
    all: rows?.length ?? 0,
    blocked,
  };
  const tabs = (
    [
      ["due", "Something to do"],
      ["quiet", "Quiet or never contacted"],
      ["all", "All"],
      ["blocked", "Call list"],
    ] as const
  ).filter(([k]) => k !== "blocked" || blocked > 0 || filter === "blocked");
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const daysOver = (due: string) =>
    Math.max(0, Math.round((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        {/* The name matches the nav. Two pages called "Relationships",
            told apart by an eyebrow, meant search returned two identical
            rows and clicking one landed you somewhere titled neither. */}
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-gray-950">Provider Relationships</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-full bg-gray-900 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-gray-800"
        >
          Log a touch
        </button>
      </div>
      <p className="mt-1.5 text-[18px] font-semibold leading-snug text-gray-900 [text-wrap:balance]">
        {rows === null ? (
          <span className="text-gray-400">Loading…</span>
        ) : overdue > 0 ? (
          <>
            <span className="text-[#b54708]">
              {overdue} {overdue === 1 ? "provider is" : "providers are"}
            </span>{" "}
            past their follow-up date.
          </>
        ) : (
          "Nobody is past their follow-up date."
        )}
      </p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-500">
        {rows !== null && neverHuman > 0 && (
          <button type="button" onClick={() => setFilter("quiet")} className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
            {neverHuman} have only ever had automated email
          </button>
        )}
        {/* Named for where it goes. "Care seekers" is also a DIFFERENT page
            in the nav, the records list at /admin/care-seekers. */}
        <Link href="/admin/relationships/families" className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
          Care seeker relationships
        </Link>
        <a href="/api/admin/touches?format=md" target="_blank" rel="noreferrer" className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
          Read as text
        </a>
      </p>

      {showForm && rows && (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <TouchForm
            providers={rows.map((r) => ({ provider_id: r.provider_id, display_name: r.display_name, contact_name: r.contact_name }))}
            onSaved={() => {
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-gray-200">
        {tabs.map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-3 text-[14.5px] transition-colors ${
              filter === k ? "border-gray-900 font-semibold text-gray-900" : "border-transparent font-medium text-gray-500 hover:text-gray-800"
            }`}
          >
            {lbl}
            {rows ? <span className={`ml-1.5 text-[13px] ${filter === k ? "text-gray-500" : "text-gray-400"}`}>{count[k]}</span> : null}
          </button>
        ))}
      </div>

      {error && <p className="py-4 text-sm text-red-600">{error}</p>}
      {rows === null && !error && <p className="py-10 text-center text-sm text-gray-400">Loading…</p>}
      {rows !== null && shown.length === 0 && <p className="py-12 text-center text-[15px] font-semibold text-gray-800">All clear here.</p>}

      <div className="mt-2">
        {shown.map((r) => {
          const isOverdue = r.flags.includes("overdue");
          const flag = FLAG_PRIORITY.find((f) => r.flags.includes(f));
          const initials =
            r.display_name
              .replace(/[^A-Za-z0-9 ]/g, " ")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase() || "?";
          const where = [[r.city, r.state].filter(Boolean).join(", "), r.contact_name].filter(Boolean).join(" · ");
          const due = r.open_action?.due ?? null;
          return (
            <div key={r.provider_id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-3.5 border-b border-gray-100 py-4 sm:grid-cols-[44px_minmax(0,1fr)_auto]">
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold sm:h-11 sm:w-11 ${
                  isOverdue ? "bg-[#f4e9dc] text-[#8a5a2b]" : "bg-[#edf7f7] text-[#417272]"
                }`}
              >
                {initials}
                {isOverdue && <span className="absolute -right-px -top-px h-3 w-3 rounded-full border-2 border-white bg-[#b54708]" aria-label="Overdue" />}
              </span>
              <div className="min-w-0">
                <Link href={`/admin/relationships/${r.provider_id}`} className="block truncate text-[15.5px] font-semibold text-gray-950 hover:underline">
                  {r.display_name}
                </Link>
                <div className="mt-0.5 truncate text-[13.5px] text-gray-500">
                  {where}
                  {r.campaign_request_id ? (
                    <>
                      {where ? " · " : ""}
                      <Link href={`/admin/ad-boost/${r.campaign_request_id}`} className="underline decoration-gray-300 underline-offset-[3px] hover:text-gray-800">
                        campaign{r.campaign_status ? ` ${r.campaign_status}` : ""}
                      </Link>
                    </>
                  ) : r.campaign_status ? (
                    `${where ? " · " : ""}campaign ${r.campaign_status}`
                  ) : null}
                </div>
                {r.open_action && (
                  <div className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-gray-900 sm:line-clamp-1">
                    <span className="text-gray-500">Next · </span>
                    {r.open_action.text}
                    {r.open_action.owner && <span className="text-gray-500"> · {r.open_action.owner}</span>}
                  </div>
                )}
                <div className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-gray-600 sm:line-clamp-1">
                  <span className="text-gray-500">Last · </span>
                  {r.last_touch ? (
                    <>
                      {r.last_touch.actor === "system"
                        ? `Automated ${CHANNEL_LABEL[r.last_touch.channel as keyof typeof CHANNEL_LABEL]?.toLowerCase() ?? r.last_touch.channel}`
                        : `${actorWord(r.last_touch.actor)} by ${CHANNEL_LABEL[r.last_touch.channel as keyof typeof CHANNEL_LABEL]?.toLowerCase() ?? r.last_touch.channel}`}
                      : {r.last_touch.title} · {fmtDate(r.last_touch.occurred_at)}
                      {r.last_touch.status ? `, ${r.last_touch.status}` : ""}
                    </>
                  ) : (
                    "No touch on record"
                  )}
                </div>
                {/* Automated mail keeps "days quiet" small while an ask we made
                    goes unanswered for a month. */}
                {r.open_ask && (
                  <div className="mt-1 text-[13px] text-gray-600">
                    Asked for {r.open_ask.kind} {fmtDate(r.open_ask.asked_at)}, {r.open_ask.days_open} days unanswered
                  </div>
                )}
                {flag && (
                  <div className={`mt-1 text-[12.5px] font-semibold ${flag === "complaint_on_file" || flag === "awaiting_reply" ? "text-[#b54708]" : "text-gray-500"}`}>
                    {FLAG_LABEL[flag].charAt(0).toUpperCase() + FLAG_LABEL[flag].slice(1)}
                  </div>
                )}
              </div>
              <div className="whitespace-nowrap pt-0.5 text-right text-[13px] text-gray-500">
                {due ? `Due ${fmtDue(due)}` : r.days_quiet !== null ? `${r.days_quiet}d quiet` : ""}
                {isOverdue && due && <span className="mt-0.5 block text-[12.5px] font-semibold text-[#b54708]">{daysOver(due)} days over</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
