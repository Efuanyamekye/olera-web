"use client";

/**
 * StatsHeader - Summary statistics for provider growth pipeline
 *
 * Shows a simplified 3-box funnel: New Claims → Converted → Paying
 * - Converted = Ads Free Trial + MedJobs Pilot
 * - Paying = Ads Subscribed + MedJobs Subscribed
 *
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
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3 animate-pulse">
              <div className="h-7 w-16 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Simplified funnel: Claims → Converted (trial/pilot) → Paying
  const statItems = [
    { label: "New Claims", value: stats.new_claim },
    { label: "Converted", value: stats.ads_free_intro + stats.medjobs_in_pilot },
    { label: "Paying", value: stats.ads_subscribed + stats.medjobs_subscribed },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          All Time
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {item.value.toLocaleString()}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
