"use client";

/**
 * Admin Staffing Outreach — main page.
 *
 * Simplified MVP layout: 5 tabs, unified search/filter row.
 * Data comes from /api/admin/staffing-outreach/queue (batches + rows)
 * and /api/admin/staffing-outreach/[id] (drawer detail).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "./Drawer";
import type {
  DrawerContext,
  QueueRow,
  StaffingBatch,
} from "@/lib/staffing-outreach/types";

// Simplified 5-tab structure
const TABS: Array<{ key: string; label: string }> = [
  { key: "today", label: "Today" },
  { key: "to_call", label: "To Call" },
  { key: "in_progress", label: "In Progress" },
  { key: "enrolled", label: "Enrolled" },
  { key: "stopped", label: "Stopped" },
];

export default function StaffingOutreachPage() {
  const [batches, setBatches] = useState<StaffingBatch[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [tab, setTab] = useState("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openOutreachId, setOpenOutreachId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch queue (and batches on first load)
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (batchId) params.set("batch", batchId);
      if (tab) params.set("tab", tab);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/staffing-outreach/queue?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setBatches(data.batches ?? []);
      setRows(data.rows ?? []);
      setTabCounts(data.tabCounts ?? {});
      // Auto-select first batch if none chosen
      if (!batchId && data.batches?.[0]) {
        setBatchId(data.batches[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [batchId, tab, debouncedSearch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId],
  );

  const handleRowAction = useCallback(
    async (refreshedCtx: DrawerContext | null) => {
      // Calculate next item BEFORE refetch (rows will be stale after refetch)
      let nextId: string | null = null;
      if (refreshedCtx) {
        const idx = rows.findIndex((r) => r.id === refreshedCtx.outreach.id);
        const next = rows[idx + 1] ?? rows.find((r) => r.id !== refreshedCtx.outreach.id);
        nextId = next?.id ?? null;
      }

      // Refetch the queue to update statuses + tab counts
      await refetch();

      // Auto-advance to the next row (calculated before refetch)
      if (refreshedCtx) {
        setOpenOutreachId(nextId);
      }
    },
    [refetch, rows],
  );

  // Handle tab change - clear rows immediately to prevent stale flash
  const handleTabChange = useCallback((newTab: string) => {
    if (newTab === tab) return;
    setRows([]);
    setLoading(true);
    setTab(newTab);
  }, [tab]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Staffing Outreach</h1>
        <p className="text-lg text-gray-600 mt-1">
          Enroll home care agencies into the Student Caregiver Pilot.
        </p>
      </div>

      {/* Tabs - pill buttons like verification page */}
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => {
          const count = tabCounts[t.key];
          const active = t.key === tab;
          const isActionable = t.key === "today" || t.key === "to_call";
          const showBadge = isActionable && typeof count === "number" && count > 0;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTabChange(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                active
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
              {showBadge ? (
                <span className={`px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {count}
                </span>
              ) : typeof count === "number" ? (
                <span className={`text-xs ${
                  active ? "text-white/70" : "text-gray-400"
                }`}>
                  ({count})
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search + University dropdown + inline stats */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search - w-64 with icon */}
        <div className="relative w-full sm:w-64">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400"
          />
        </div>

        {/* University dropdown */}
        <select
          value={batchId ?? ""}
          onChange={(e) => {
            setRows([]);
            setLoading(true);
            setBatchId(e.target.value || null);
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          {batches.length === 0 && <option value="">No active batches</option>}
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.university_name}
            </option>
          ))}
        </select>

        {/* Inline stats */}
        {currentBatch && (
          <p className="text-sm text-gray-500 ml-auto">
            <span className="font-medium text-gray-700">
              {currentBatch.total_providers}
            </span>
            {" total · "}
            <span className="font-medium text-gray-700">
              {tabCounts.to_call ?? 0}
            </span>
            {" to call · "}
            <span className="font-medium text-emerald-700">
              {tabCounts.enrolled ?? 0}
            </span>
            {" enrolled"}
          </p>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">
          {batches.length === 0
            ? "No active batches yet. Run the seed script: npx tsx scripts/seed-staffing-outreach.ts --university <slug> --apply"
            : "Nothing in this tab."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => setOpenOutreachId(row.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {row.provider_name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[row.provider_city, row.provider_state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                    {row.provider_phone && ` · ${row.provider_phone}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.status} />
                  {row.next_action_due_at && (
                    <span className="hidden text-xs text-gray-400 sm:inline">
                      {formatDueDate(row.next_action_due_at)}
                    </span>
                  )}
                  {row.claimed_by && row.claimed_until && new Date(row.claimed_until) > new Date() && (
                    <span className="hidden text-xs text-amber-600 sm:inline">
                      claimed
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drawer */}
      {openOutreachId && (
        <Drawer
          outreachId={openOutreachId}
          onClose={() => setOpenOutreachId(null)}
          onAction={handleRowAction}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-gray-100 text-gray-700",
    pre_call_outreach: "bg-blue-50 text-blue-700",
    calling: "bg-blue-50 text-blue-700",
    connected_no_consent: "bg-amber-50 text-amber-700",
    consented: "bg-emerald-50 text-emerald-700",
    nurturing: "bg-emerald-50 text-emerald-700",
    activated: "bg-purple-50 text-purple-700",
    enrolled: "bg-purple-100 text-purple-800",
    do_not_contact: "bg-gray-100 text-gray-500",
    wrong_number: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    queued: "Queued",
    pre_call_outreach: "Pre-call",
    calling: "Calling",
    connected_no_consent: "No consent",
    consented: "Consented",
    nurturing: "Nurturing",
    activated: "Activated",
    enrolled: "Enrolled",
    do_not_contact: "DNC",
    wrong_number: "Wrong #",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function formatDueDate(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (diffMin < -60 * 24)
    return `${Math.round(-diffMin / (60 * 24))}d overdue`;
  if (diffMin < 0) return "due now";
  if (diffMin < 60) return `in ${diffMin}m`;
  if (diffMin < 60 * 24) return `in ${Math.round(diffMin / 60)}h`;
  return `in ${Math.round(diffMin / (60 * 24))}d`;
}
