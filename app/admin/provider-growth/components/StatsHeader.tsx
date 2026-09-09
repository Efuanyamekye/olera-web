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

  // Build sublabel for pending outcomes
  const pendingTodayCount = stats.pending_outcomes - stats.pending_outcomes_past;
  const pendingSublabel = stats.pending_outcomes_past > 0
    ? `${pendingTodayCount} today, ${stats.pending_outcomes_past} past`
    : `${stats.meetings_today} today`;

  // Key metrics: Claims → Converted → Paying + Pending Outcomes
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
      label: "Pending Outcomes",
      value: stats.pending_outcomes,
      sublabel: pendingSublabel,
      highlight: stats.pending_outcomes > 0,
      warning: stats.pending_outcomes_past > 0, // Warning color if past meetings need logging
    },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-4 gap-3">
        {statItems.map((item) => {
          // Determine card styling based on state
          let cardClass = "border-gray-200 bg-white";
          let valueClass = "text-gray-900";
          let labelClass = "text-gray-500";

          if (item.warning) {
            // Warning state: past meetings need logging
            cardClass = "border-amber-200 bg-amber-50";
            valueClass = "text-amber-700";
            labelClass = "text-amber-600";
          } else if (item.highlight) {
            // Highlight state: has pending items
            cardClass = "border-primary-200 bg-primary-50";
            valueClass = "text-primary-700";
            labelClass = "text-primary-600";
          }

          return (
            <div key={item.label} className={`rounded-xl border px-4 py-3 ${cardClass}`}>
              <div className={`text-2xl font-semibold tabular-nums ${valueClass}`}>
                {item.value.toLocaleString()}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`text-xs ${labelClass}`}>
                  {item.label}
                </span>
                <span className="text-[10px] text-gray-400">
                  {item.sublabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
