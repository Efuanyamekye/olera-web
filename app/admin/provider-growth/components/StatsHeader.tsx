"use client";

/**
 * StatsHeader - Summary statistics for provider growth pipeline
 *
 * Shows counts for each pipeline stage and conversion status.
 * Note: Stats are always "all time" regardless of date filter.
 */

import type { GrowthStats } from "@/lib/provider-growth/queries";

interface StatsHeaderProps {
  stats: GrowthStats | null;
  loading?: boolean;
}

export function StatsHeader({ stats, loading }: StatsHeaderProps) {
  if (loading) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 animate-pulse">
              <div className="h-6 w-12 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    { label: "New Claims", value: stats.new_claim, color: "text-gray-900" },
    { label: "Meeting Scheduled", value: stats.meeting_scheduled, color: "text-blue-600" },
    { label: "Pitched", value: stats.pitched, color: "text-indigo-600" },
    { label: "Not Interested", value: stats.not_interested, color: "text-gray-500" },
    { label: "Ads Free Trial", value: stats.ads_free_intro, color: "text-amber-600", highlight: true },
    { label: "Ads Paying", value: stats.ads_subscribed, color: "text-emerald-600", highlight: true },
    { label: "MedJobs Pilot", value: stats.medjobs_in_pilot, color: "text-purple-600", highlight: true },
    { label: "MedJobs Paying", value: stats.medjobs_subscribed, color: "text-emerald-600", highlight: true },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          All Time
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-3 py-2.5 ${
              item.highlight
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className={`text-xl font-semibold tabular-nums ${item.color}`}>
              {item.value.toLocaleString()}
            </div>
            <div className="mt-0.5 text-xs text-gray-500 truncate" title={item.label}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
