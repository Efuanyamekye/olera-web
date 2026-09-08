"use client";

/**
 * GrowthTabs - Tab navigation for provider growth pipeline
 *
 * Pipeline tabs: New Claims | Meeting Scheduled | Pitched | Not Interested
 * Conversion tabs: Converted | Upgrade Meeting | Paying (all with Ads/MedJobs subtabs)
 *
 * New Claims has subtabs: Not Contacted | In Progress
 * Upgrade Meeting is a pipeline stage but rendered in the conversion section
 */

import type { GrowthStats } from "@/lib/provider-growth/queries";
import type { PipelineStage } from "@/lib/provider-growth/stages";
export type NewClaimSubTab = "not_contacted" | "in_progress";
export type ConversionTab = "converted" | "paying";
export type ConversionSubTab = "ads" | "medjobs" | "both";
export type ActiveTab =
  | { type: "pipeline"; stage: PipelineStage; subTab?: NewClaimSubTab | ConversionSubTab }
  | { type: "conversion"; tab: ConversionTab; subTab: ConversionSubTab };

interface GrowthTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  stats: GrowthStats | null;
  newClaimSubtabCounts?: { notContacted: number; inProgress: number };
}

const NEW_CLAIM_SUB_TABS: Array<{ id: NewClaimSubTab; label: string }> = [
  { id: "not_contacted", label: "Not Contacted" },
  { id: "in_progress", label: "In Progress" },
];

const PIPELINE_TABS: Array<{ id: PipelineStage; label: string }> = [
  { id: "new_claim", label: "New Claims" },
  { id: "meeting_scheduled", label: "Meeting Scheduled" },
  { id: "pitched", label: "Pitched" },
  { id: "not_interested", label: "Not Interested" },
];

const CONVERSION_SUB_TABS: Array<{ id: ConversionSubTab; label: string }> = [
  { id: "ads", label: "Ads" },
  { id: "medjobs", label: "MedJobs" },
  { id: "both", label: "Both" },
];

export function GrowthTabs({ activeTab, onTabChange, stats, newClaimSubtabCounts }: GrowthTabsProps) {
  const getCount = (tab: PipelineStage | ConversionTab | ConversionSubTab): number => {
    if (!stats) return 0;

    switch (tab) {
      case "new_claim":
        return stats.new_claim;
      case "meeting_scheduled":
        return stats.meeting_scheduled;
      case "pitched":
        return stats.pitched;
      case "not_interested":
        return stats.not_interested;
      case "upgrade_meeting":
        return stats.upgrade_meeting;
      case "converted":
        return stats.ads_free_intro + stats.medjobs_in_pilot;
      case "paying":
        return stats.ads_subscribed + stats.medjobs_subscribed;
      case "ads":
        // Context-dependent: converted or paying
        if (activeTab.type === "conversion") {
          return activeTab.tab === "converted" ? stats.ads_free_intro : stats.ads_subscribed;
        }
        return 0;
      case "medjobs":
        if (activeTab.type === "conversion") {
          return activeTab.tab === "converted" ? stats.medjobs_in_pilot : stats.medjobs_subscribed;
        }
        return 0;
      case "both":
        // Providers with BOTH ads AND medjobs active
        if (activeTab.type === "conversion") {
          return activeTab.tab === "converted" ? stats.both_converted : stats.both_paying;
        }
        return 0;
      default:
        return 0;
    }
  };

  const isPipelineActive = (id: PipelineStage) =>
    activeTab.type === "pipeline" && activeTab.stage === id;

  const isConversionActive = (id: ConversionTab) =>
    activeTab.type === "conversion" && activeTab.tab === id;

  const isSubTabActive = (id: ConversionSubTab) =>
    activeTab.type === "conversion" && activeTab.subTab === id;

  const isNewClaimSubTabActive = (id: NewClaimSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "new_claim" && activeTab.subTab === id;

  const getNewClaimSubTabCount = (id: NewClaimSubTab): number => {
    if (!newClaimSubtabCounts) return 0;
    return id === "not_contacted" ? newClaimSubtabCounts.notContacted : newClaimSubtabCounts.inProgress;
  };

  return (
    <div className="mb-6">
      {/* Main tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {/* Pipeline tabs */}
        {PIPELINE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              // For new_claim, default to "not_contacted" subtab
              if (tab.id === "new_claim") {
                onTabChange({ type: "pipeline", stage: tab.id, subTab: "not_contacted" });
              } else {
                onTabChange({ type: "pipeline", stage: tab.id });
              }
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              isPipelineActive(tab.id)
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                isPipelineActive(tab.id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {getCount(tab.id)}
            </span>
          </button>
        ))}

        {/* Separator */}
        <div className="w-px bg-gray-200 mx-2 my-1" />

        {/* Converted tab */}
        <button
          onClick={() => {
            onTabChange({ type: "conversion", tab: "converted", subTab: "ads" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isConversionActive("converted")
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Converted
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isConversionActive("converted")
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("converted")}
          </span>
        </button>

        {/* Upgrade Meeting tab (pipeline stage, but rendered here) */}
        <button
          onClick={() => {
            onTabChange({ type: "pipeline", stage: "upgrade_meeting", subTab: "ads" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isPipelineActive("upgrade_meeting")
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Upgrade Meeting
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isPipelineActive("upgrade_meeting")
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("upgrade_meeting")}
          </span>
        </button>

        {/* Paying tab */}
        <button
          onClick={() => {
            onTabChange({ type: "conversion", tab: "paying", subTab: "ads" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isConversionActive("paying")
              ? "border-emerald-500 text-emerald-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Paying
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isConversionActive("paying")
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("paying")}
          </span>
        </button>
      </div>

      {/* New Claims sub-tabs */}
      {activeTab.type === "pipeline" && activeTab.stage === "new_claim" && (
        <div className="flex gap-1 mt-2 pl-4">
          {NEW_CLAIM_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "pipeline",
                  stage: "new_claim",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isNewClaimSubTabActive(subTab.id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getNewClaimSubTabCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Conversion sub-tabs */}
      {activeTab.type === "conversion" && (
        <div className="flex gap-1 mt-2 pl-4">
          {CONVERSION_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "conversion",
                  tab: activeTab.tab,
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isSubTabActive(subTab.id)
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Upgrade Meeting sub-tabs (Ads/MedJobs/Both) */}
      {/* Note: No counts shown because we'd need intersection stats (upgrade_meeting + ads_status) */}
      {activeTab.type === "pipeline" && activeTab.stage === "upgrade_meeting" && (
        <div className="flex gap-1 mt-2 pl-4">
          {CONVERSION_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "pipeline",
                  stage: "upgrade_meeting",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeTab.subTab === subTab.id
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
