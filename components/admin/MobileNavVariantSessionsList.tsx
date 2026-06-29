"use client";

/**
 * Sessions table for the Mobile Nav Variants admin drill-in.
 *
 * Lazy-fetches one A/B arm's sessions from /api/admin/analytics/mobile-nav-variant-sessions
 * on first expand and caches in component state. Pagination is "load more" —
 * each click appends the next page rather than replacing.
 *
 * Per-row trash icon hard-deletes the provider's variant tracking events from
 * provider_activity. Used for cleaning up admin test traffic.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Stage = "impression" | "converted";

type SessionRow = {
  session_id: string;
  furthest_stage: Stage;
  provider_name: string | null;
  provider_slug: string | null;
  first_seen: string;
  conversion_type: string | null;
};

type ApiResponse = {
  variant: string;
  total: number;
  sessions: SessionRow[];
};

const PAGE_SIZE = 50;

const STAGE_LABEL: Record<Stage, string> = {
  impression: "Impression",
  converted: "Converted",
};

const STAGE_BADGE_CLASS: Record<Stage, string> = {
  impression: "bg-gray-100 text-gray-600",
  converted: "bg-emerald-50 text-emerald-800",
};

const CONVERSION_LABEL: Record<string, string> = {
  question: "Q&A",
  lead: "Lead",
  review: "Review",
  boost: "Boost",
};

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function MobileNavVariantSessionsList({
  variant,
  dateFrom,
  dateTo,
}: {
  variant: string;
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");

  // Delete state
  const [pendingDelete, setPendingDelete] = useState<SessionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const isInitial = !append;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("variant", variant);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        if (stageFilter !== "all") params.set("stage", stageFilter);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        const res = await fetch(`/api/admin/analytics/mobile-nav-variant-sessions?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const data: ApiResponse = await res.json();
        setTotal(data.total);
        setSessions((prev) => (append ? [...prev, ...data.sessions] : data.sessions));
      } catch {
        setError("Couldn't load sessions. Try again.");
      } finally {
        if (isInitial) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [variant, dateFrom, dateTo, stageFilter],
  );

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/analytics/mobile-nav-variant-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: pendingDelete.session_id, variant }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete failed (${res.status})`);
      }
      // Remove the deleted row locally
      const removedId = pendingDelete.session_id;
      setSessions((prev) => prev.filter((s) => s.session_id !== removedId));
      setTotal((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, variant]);

  const hasMore = total !== null && sessions.length < total;

  const STAGE_CHIPS: Array<{ key: Stage | "all"; label: string }> = [
    { key: "all", label: "All" },
    { key: "impression", label: "Impression" },
    { key: "converted", label: "Converted" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="px-5 py-3 border-b border-gray-100 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Providers in this arm
          </div>
          {total !== null && (
            <div className="text-xs text-gray-600 mt-0.5">
              Showing {sessions.length} of {total}
              {stageFilter !== "all" && (
                <span className="text-gray-400"> · filtered to {STAGE_LABEL[stageFilter]}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_CHIPS.map(({ key, label }) => {
            const active = stageFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStageFilter(key)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                  active
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
      ) : error ? (
        <div className="px-5 py-6 text-center text-sm text-red-600">
          {error}
          <button
            type="button"
            onClick={() => fetchPage(0, false)}
            className="ml-3 underline underline-offset-2 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          No sessions in this window.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Conversion</th>
                  <th className="px-3 py-2 font-medium text-right">When</th>
                  <th className="px-2 py-2 font-medium w-8" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.session_id}
                    className="group border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40"
                  >
                    <td className="px-5 py-2">
                      <span
                        className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${STAGE_BADGE_CLASS[s.furthest_stage]}`}
                      >
                        {STAGE_LABEL[s.furthest_stage]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {s.provider_slug ? (
                        <Link
                          href={`/provider/${s.provider_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline"
                        >
                          {s.provider_name || s.provider_slug}
                        </Link>
                      ) : (
                        <span className="text-gray-400 font-mono text-[11px]">
                          {s.session_id.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {s.conversion_type ? (
                        <span className="text-emerald-700 font-medium">
                          {CONVERSION_LABEL[s.conversion_type] || s.conversion_type}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500 whitespace-nowrap">
                      {formatRelativeTime(s.first_seen)}
                    </td>
                    <td className="px-2 py-2 w-8 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteError(null); setPendingDelete(s); }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
                        aria-label="Delete this session"
                        title="Delete this provider's variant data"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={() => fetchPage(sessions.length, true)}
                disabled={loadingMore}
                className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
              >
                {loadingMore ? "Loading..." : `Load ${Math.min(PAGE_SIZE, total! - sessions.length)} more`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3
              id="delete-session-title"
              className="text-base font-semibold text-gray-900 mb-3"
            >
              Delete this provider&apos;s variant data?
            </h3>
            <dl className="text-sm text-gray-700 space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Provider</dt>
                <dd className="text-gray-900 break-all">
                  {pendingDelete.provider_name || pendingDelete.session_id.slice(0, 8) + "..."}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Arm</dt>
                <dd className="text-gray-900">{variant}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Stage</dt>
                <dd className="text-gray-900">
                  {STAGE_LABEL[pendingDelete.furthest_stage]}
                </dd>
              </div>
            </dl>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-5">
              Removes mobile_nav_variant_impression events for this provider + variant. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-[12px] text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setPendingDelete(null); setDeleteError(null); }}
                disabled={deleting}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
