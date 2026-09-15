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
 */

const FLAG_LABEL: Record<RelationshipFlag, string> = {
  overdue: "overdue",
  awaiting_reply: "they wrote, no reply yet",
  never_human: "never had a human touch",
  complaint_on_file: "spam complaint on file",
  prefers_text: "prefers text",
  unopened_streak: "3 unopened in a row",
};

const FLAG_STYLE: Record<RelationshipFlag, string> = {
  overdue: "bg-orange-50 text-orange-800",
  awaiting_reply: "bg-rose-50 text-rose-800",
  never_human: "bg-red-50 text-red-700",
  complaint_on_file: "bg-red-50 text-red-700",
  prefers_text: "bg-sky-50 text-sky-800",
  unopened_streak: "bg-amber-50 text-amber-800",
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
  const [filter, setFilter] = useState<"all" | "due" | "quiet">("all");

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
    if (filter === "quiet") return r.flags.includes("never_human") || (r.days_quiet ?? 0) >= 14;
    return true;
  });
  const overdue = (rows ?? []).filter((r) => r.flags.includes("overdue")).length;
  const neverHuman = (rows ?? []).filter((r) => r.flags.includes("never_human")).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Providers</p>
          <h1 className="text-2xl font-semibold text-gray-950">Relationships</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Who is due, and who has gone quiet. Every touch on every channel, from anyone. Open the provider for the whole story.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/relationships/families" className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Care seekers
          </Link>
          <a href="/api/admin/touches?format=md" target="_blank" rel="noreferrer" className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Read as text
          </a>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Log a touch
          </button>
        </div>
      </div>

      {showForm && rows && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        {(
          [
            ["all", `All · ${rows?.length ?? 0}`],
            ["due", "With a next action"],
            ["quiet", "Quiet or never contacted"],
          ] as const
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 font-medium ${filter === k ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {lbl}
          </button>
        ))}
        {rows && (
          <span className="ml-auto font-mono text-[11px] text-gray-500">
            {overdue} overdue · {neverHuman} never had a human touch
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <th className="px-4 py-2.5">Provider</th>
              <th className="px-4 py-2.5">Last touch</th>
              <th className="px-4 py-2.5">Next action</th>
              <th className="px-4 py-2.5">Due</th>
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
              const isOverdue = r.flags.includes("overdue");
              return (
                <tr key={r.provider_id} className={`border-b border-gray-100 align-top last:border-b-0 ${isOverdue ? "bg-orange-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/relationships/${r.provider_id}`} className="font-semibold text-gray-900 hover:underline">
                      {r.display_name}
                    </Link>
                    <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                      {[r.city, r.state].filter(Boolean).join(", ")}
                      {r.contact_name ? ` · ${r.contact_name}` : ""}
                      {r.campaign_request_id ? (
                        <>
                          {" · "}
                          <Link href={`/admin/ad-boost/${r.campaign_request_id}`} className="text-teal-700 hover:underline">
                            campaign{r.campaign_status ? ` · ${r.campaign_status}` : ""} →
                          </Link>
                        </>
                      ) : r.campaign_status ? (
                        ` · ${r.campaign_status}`
                      ) : (
                        ""
                      )}
                    </div>
                    {r.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.flags.map((f) => (
                          <span key={f} className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${FLAG_STYLE[f]}`}>
                            {FLAG_LABEL[f]}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.last_touch ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${r.last_touch.actor === "system" ? "border-transparent bg-gray-100 text-gray-500" : "border-gray-200 text-gray-600"}`}>
                            {r.last_touch.actor === "system" ? "system" : CHANNEL_LABEL[r.last_touch.channel as keyof typeof CHANNEL_LABEL] ?? r.last_touch.channel}
                          </span>
                          <span className="text-gray-900">
                            {actorWord(r.last_touch.actor)}: {r.last_touch.title}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                          {fmtDate(r.last_touch.occurred_at)}
                          {r.last_touch.status ? ` · ${r.last_touch.status}` : ""}
                          {r.days_quiet !== null && r.days_quiet >= 7 ? ` · ${r.days_quiet} days quiet` : ""}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">No touch on record</span>
                    )}
                  </td>
                  <td className="max-w-[38ch] px-4 py-3 text-gray-800">
                    {r.open_action ? r.open_action.text : <span className="text-gray-400">—</span>}
                    {r.open_action?.owner && <span className="ml-1 font-mono text-[11px] text-gray-500">· {r.open_action.owner}</span>}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 font-mono text-xs ${isOverdue ? "font-semibold text-orange-800" : "text-gray-700"}`}>
                    {fmtDue(r.open_action?.due ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
