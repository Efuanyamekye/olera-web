"use client";

/**
 * Admin Staffing Outreach — main page.
 *
 * Five-tab navigation (no urgency toggle):
 *   1. Action Needed   — Cross-stage to-do list (nurturing statuses with due <= now)
 *   2. Initial Contact — Not yet contacted (queued)
 *   3. Nurturing       — In progress (pre_call_outreach, calling, etc.)
 *   4. Enrolled        — Success
 *   5. Closed          — Dead ends
 *
 * Data comes from /api/admin/staffing-outreach/queue (batches + rows)
 * and /api/admin/staffing-outreach/[id] (drawer detail).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "./Drawer";
import Select from "@/components/ui/Select";
import type {
  DrawerContext,
  QueueRow,
  StaffingBatch,
} from "@/lib/staffing-outreach/types";

// 5 tabs with clear purposes
const STAGE_TABS: Array<{ key: string; label: string }> = [
  { key: "action_needed", label: "Action Needed" },
  { key: "initial_contact", label: "Initial Contact" },
  { key: "nurturing", label: "Nurturing" },
  { key: "enrolled", label: "Enrolled" },
  { key: "closed", label: "Closed" },
];

type Stage = "action_needed" | "initial_contact" | "nurturing" | "enrolled" | "closed";

const PAGE_SIZE = 50;

export default function StaffingOutreachPage() {
  const [batches, setBatches] = useState<StaffingBatch[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("action_needed");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openOutreachId, setOpenOutreachId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0); // Reset to first page on search
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch queue (and batches on first load)
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (batchId) params.set("batch", batchId);
      params.set("stage", stage);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/staffing-outreach/queue?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setBatches(data.batches ?? []);
      setRows(data.rows ?? []);
      setTabCounts(data.tabCounts ?? {});
      setTotal(data.total ?? 0);
      // Auto-select first batch if none chosen
      if (!batchId && data.batches?.[0]) {
        setBatchId(data.batches[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [batchId, stage, debouncedSearch, page]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const currentBatch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId],
  );

  // Convert batches to Select options
  const batchOptions = useMemo(
    () => batches.map((b) => ({ value: b.id, label: b.university_name })),
    [batches],
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

  // Handle stage change - clear rows immediately to prevent stale flash
  const handleStageChange = useCallback((newStage: Stage) => {
    if (newStage === stage) return;
    setRows([]);
    setLoading(true);
    setPage(0);
    setStage(newStage);
  }, [stage]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Staffing Outreach</h1>
        <p className="text-lg text-gray-600 mt-1">
          Enroll home care agencies into the Student Caregiver Pilot.
        </p>
      </div>

      {/* Row 1: Search | University dropdown | Stats */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
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
        <div className="w-72">
          <Select
            options={batchOptions}
            value={batchId ?? ""}
            onChange={(value) => {
              setRows([]);
              setLoading(true);
              setPage(0);
              setBatchId(value || null);
            }}
            placeholder="Select university..."
            size="sm"
            searchable
            searchPlaceholder="Search universities..."
          />
        </div>

        {/* Inline stats */}
        {currentBatch && (
          <p className="text-sm text-gray-500 ml-auto">
            <span className="font-medium text-gray-700">
              {currentBatch.total_providers}
            </span>
            {" total"}
          </p>
        )}
      </div>

      {/* Row 2: Stage tabs (funnel stages) */}
      <div className="flex gap-2 mb-6">
        {STAGE_TABS.map((t) => {
          const count = tabCounts[t.key];
          const active = t.key === stage;

          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleStageChange(t.key as Stage)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                active
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t.label}
              {typeof count === "number" && (
                <span className={`text-xs ${
                  active ? "text-white/70" : "text-gray-400"
                }`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
          {batches.length === 0 ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">No active batches</p>
              <p className="mt-1 text-sm text-gray-500">
                Run the seed script: npx tsx scripts/seed-staffing-outreach.ts --university {"<slug>"} --apply
              </p>
            </>
          ) : stage === "action_needed" ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">All caught up!</p>
              <p className="mt-1 text-sm text-gray-500">No providers need follow-up right now.</p>
            </>
          ) : stage === "initial_contact" ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                <svg className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">No providers waiting</p>
              <p className="mt-1 text-sm text-gray-500">No providers waiting for initial contact.</p>
            </>
          ) : stage === "nurturing" ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">No providers in progress</p>
              <p className="mt-1 text-sm text-gray-500">No providers in the nurturing stage yet.</p>
            </>
          ) : stage === "enrolled" ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
                <svg className="h-7 w-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">No enrolled providers</p>
              <p className="mt-1 text-sm text-gray-500">No providers have enrolled in the pilot yet.</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">No closed providers</p>
              <p className="mt-1 text-sm text-gray-500">No providers marked as closed or do-not-contact.</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {rows.map((row) => {
              const dueInfo = row.next_action_due_at ? getDueInfo(row.next_action_due_at) : null;
              const isClaimed = row.claimed_by && row.claimed_until && new Date(row.claimed_until) > new Date();

              return (
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
                        {/* Show university in Action Needed tab (cross-university view) */}
                        {stage === "action_needed" && row.university_name && (
                          <span className="font-medium text-gray-600">{row.university_name} · </span>
                        )}
                        {[row.provider_city, row.provider_state]
                          .filter(Boolean)
                          .join(", ") || "—"}
                        {row.provider_phone && ` · ${row.provider_phone}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={row.status} />
                      {dueInfo && (
                        <span className={`hidden text-xs sm:inline ${
                          dueInfo.isOverdue ? "text-amber-600 font-medium" : "text-gray-400"
                        }`}>
                          {dueInfo.label}
                        </span>
                      )}
                      {isClaimed && (
                        <span className="hidden text-xs text-blue-600 sm:inline">
                          claimed
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
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

function getDueInfo(iso: string): { label: string; isOverdue: boolean } {
  const due = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((due.getTime() - now.getTime()) / 60_000);

  if (diffMin < -60 * 24) {
    return { label: `${Math.round(-diffMin / (60 * 24))}d overdue`, isOverdue: true };
  }
  if (diffMin < -60) {
    return { label: `${Math.round(-diffMin / 60)}h overdue`, isOverdue: true };
  }
  if (diffMin < 0) {
    return { label: "due now", isOverdue: true };
  }
  if (diffMin < 60) {
    return { label: `in ${diffMin}m`, isOverdue: false };
  }
  if (diffMin < 60 * 24) {
    return { label: `in ${Math.round(diffMin / 60)}h`, isOverdue: false };
  }
  return { label: `in ${Math.round(diffMin / (60 * 24))}d`, isOverdue: false };
}
