"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The directory's ledger: what the system did to listings (archived closed
 * businesses, applied cosmetic renames) and what it wants a person to decide
 * (temporary closures, substantive renames). Every applied action has Undo;
 * every flag has Done. Reads and writes /api/admin/directory/health.
 */

type Action = {
  id: string;
  provider_id: string;
  kind: string;
  source: string;
  evidence: Record<string, unknown>;
  applied_at: string | null;
  resolved_at: string | null;
  undone_at: string | null;
  created_at: string;
  provider_name: string | null;
  slug: string | null;
};

type Summary = {
  byKind: Record<string, number>;
  openFlags: number;
  checked: number;
  unchecked: number;
  lastActionAt: string | null;
};

const KIND_LABEL: Record<string, string> = {
  closed_archived: "Archived: Google says permanently closed",
  closed_temporarily: "Google says temporarily closed",
  rename_applied: "Renamed to match Google",
  rename_flagged: "Google has a different name",
  closed_flagged: "Google says permanently closed (archive waits for you)",
  website_dead: "Website unreachable",
  category_flagged: "Category looks wrong",
  duplicate_flagged: "Possible duplicate",
};

function evidenceLine(a: Action): string {
  const e = a.evidence ?? {};
  if (a.kind === "rename_applied") return `${String(e.from ?? "")} → ${String(e.to ?? "")}`;
  if (a.kind === "rename_flagged") return `Olera: ${String(e.stored ?? "")} · Google: ${String(e.google ?? "")}`;
  if (a.kind === "closed_archived" || a.kind === "closed_temporarily") return String(e.google_name ?? e.provider_name ?? "");
  return Object.entries(e).map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DirectoryHealthPage() {
  const [actions, setActions] = useState<Action[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/directory/health${showAll ? "?all=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load");
      setActions(data.actions ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [showAll]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: "undo" | "resolve") => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/directory/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "That didn't go through");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through");
    } finally {
      setBusy(null);
    }
  };

  const total = summary ? summary.checked + summary.unchecked : 0;
  const coverage = total ? Math.round(((summary?.checked ?? 0) / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Directory health</h1>
      <p className="mt-1 text-sm text-gray-600">What the system did to listings and what it wants you to decide. Archives and renames can be undone; flags are closed with Done.</p>

      {summary && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Checked against Google" value={`${coverage}%`} sub={`${summary.checked.toLocaleString()} of ${total.toLocaleString()}`} />
          <Stat label="Archived this week" value={String(summary.byKind.closed_archived ?? 0)} />
          <Stat label="Renamed this week" value={String(summary.byKind.rename_applied ?? 0)} />
          <Stat label="Waiting on you" value={String(summary.openFlags)} />
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{showAll ? "Everything" : "Open"}</h2>
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm text-teal-700 hover:underline">
          {showAll ? "Show open only" : "Show everything"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {actions.length === 0 && <li className="px-4 py-6 text-sm text-gray-500">Nothing here.</li>}
        {actions.map((a) => {
          const applied = !!a.applied_at;
          const closed = !!a.resolved_at || !!a.undone_at;
          return (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {a.slug ? <a href={`/provider/${a.slug}`} target="_blank" rel="noreferrer" className="hover:underline">{a.provider_name ?? a.provider_id}</a> : (a.provider_name ?? a.provider_id)}
                </p>
                <p className="text-sm text-gray-700">{KIND_LABEL[a.kind] ?? a.kind}</p>
                <p className="mt-0.5 text-xs text-gray-500">{evidenceLine(a)} · {a.source.replace(/_/g, " ")} · {when(a.created_at)}{a.undone_at ? " · undone" : a.resolved_at ? " · done" : ""}</p>
              </div>
              {!closed && (
                <div className="flex gap-2">
                  {applied ? (
                    <button type="button" disabled={busy === a.id} onClick={() => act(a.id, "undo")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50">Undo</button>
                  ) : (
                    <>
                      <a href={`/admin/directory/${encodeURIComponent(a.provider_id)}`} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">Open</a>
                      <button type="button" disabled={busy === a.id} onClick={() => act(a.id, "resolve")} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm text-white hover:bg-teal-800 disabled:opacity-50">Done</button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
