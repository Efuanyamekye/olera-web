"use client";

/**
 * CallbackBanner - Shows callbacks due today and overdue
 *
 * Displays a banner at the top of the In Progress tab showing
 * the count of callbacks that need attention today.
 */

import { useState, useEffect } from "react";
import type { CallbackDueEntry } from "@/lib/provider-growth/queries";

interface CallbackBannerProps {
  onProviderClick?: (trackingId: string) => void;
  /** Increment to trigger a refetch (e.g., after logging an activity) */
  refreshKey?: number;
}

export function CallbackBanner({ onProviderClick, refreshKey = 0 }: CallbackBannerProps) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<{
    dueToday: CallbackDueEntry[];
    overdue: CallbackDueEntry[];
    upcoming: CallbackDueEntry[];
    totalDue: number;
  } | null>(null);

  useEffect(() => {
    async function fetchCallbacks() {
      try {
        const res = await fetch("/api/admin/provider-growth/callbacks-due");
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (e) {
        console.error("Failed to fetch callbacks:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchCallbacks();
  }, [refreshKey]);

  if (loading) {
    return null; // Don't show loading state for banner
  }

  if (!data || data.totalDue === 0) {
    return null; // No callbacks due
  }

  const { dueToday, overdue, totalDue } = data;

  return (
    <div className="mb-4">
      {/* Summary banner */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
          overdue.length > 0
            ? "bg-red-50 border-red-200 hover:bg-red-100"
            : "bg-amber-50 border-amber-200 hover:bg-amber-100"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">
            {overdue.length > 0 ? "📞" : "📅"}
          </span>
          <div className="text-left">
            <span className={`font-medium ${overdue.length > 0 ? "text-red-800" : "text-amber-800"}`}>
              {totalDue} callback{totalDue !== 1 ? "s" : ""} due
            </span>
            <span className={`ml-2 text-sm ${overdue.length > 0 ? "text-red-600" : "text-amber-600"}`}>
              {overdue.length > 0 && `${overdue.length} overdue`}
              {overdue.length > 0 && dueToday.length > 0 && " · "}
              {dueToday.length > 0 && `${dueToday.length} today`}
            </span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""} ${
            overdue.length > 0 ? "text-red-500" : "text-amber-500"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="mt-2 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-red-50">
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                  Overdue
                </span>
              </div>
              {overdue.map((cb) => (
                <CallbackRow
                  key={`${cb.tracking_id}-${cb.callback_date}`}
                  callback={cb}
                  isOverdue
                  onClick={() => onProviderClick?.(cb.tracking_id)}
                />
              ))}
            </div>
          )}

          {/* Due today section */}
          {dueToday.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-amber-50">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  Due Today
                </span>
              </div>
              {dueToday.map((cb) => (
                <CallbackRow
                  key={`${cb.tracking_id}-${cb.callback_date}`}
                  callback={cb}
                  onClick={() => onProviderClick?.(cb.tracking_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CallbackRow({
  callback,
  isOverdue,
  onClick,
}: {
  callback: CallbackDueEntry;
  isOverdue?: boolean;
  onClick?: () => void;
}) {
  const formattedDate = new Date(callback.callback_date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">
            {callback.display_name || "Unknown Provider"}
          </span>
          {isOverdue && (
            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded">
              Overdue
            </span>
          )}
        </div>
        {callback.notes && (
          <p className="text-sm text-gray-500 truncate mt-0.5">{callback.notes}</p>
        )}
      </div>
      <div className="ml-4 flex items-center gap-2 flex-shrink-0">
        <span className={`text-sm ${isOverdue ? "text-red-600" : "text-gray-500"}`}>
          {formattedDate}
        </span>
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
