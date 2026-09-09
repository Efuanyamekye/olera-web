"use client";

/**
 * StatsHeader - Summary statistics for provider growth pipeline
 *
 * Shows key metrics: New Claims | Converted | Paying | Meetings Today
 * - Converted = Ads Free Trial + MedJobs Pilot
 * - Paying = Ads Subscribed + MedJobs Subscribed
 * - Meetings Today = Providers with meetings scheduled for today
 *
 * Note: All-time stats except "Meetings Today" which is dynamic.
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
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
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

  // Key metrics: Claims → Converted → Paying + Meetings Today
  const statItems = [
    {
      label: "New Claims",
      value: stats.new_claim,
      sublabel: "All time",
    },
    {
      label: "Converted",
      value: stats.ads_free_intro + stats.medjobs_in_pilot,
      sublabel: "All time",
    },
    {
      label: "Paying",
      value: stats.ads_subscribed + stats.medjobs_subscribed,
      sublabel: "All time",
    },
    {
      label: "Meetings Today",
      value: stats.meetings_today,
      sublabel: "Scheduled",
      highlight: stats.meetings_today > 0,
    },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-4 gap-3">
        {statItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-4 py-3 ${
              item.highlight
                ? "border-primary-200 bg-primary-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className={`text-2xl font-semibold tabular-nums ${
              item.highlight ? "text-primary-700" : "text-gray-900"
            }`}>
              {item.value.toLocaleString()}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className={`text-xs ${item.highlight ? "text-primary-600" : "text-gray-500"}`}>
                {item.label}
              </span>
              <span className="text-[10px] text-gray-400">
                {item.sublabel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
