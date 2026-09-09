"use client";

/**
 * GrowthTabs - Tab navigation for provider growth pipeline
 *
 * Pipeline tabs: New Claims | Meeting Scheduled | Follow-up | Paying
 *
 * New Claims has subtabs: Not Contacted | Converted | In Progress
 * Meeting Scheduled has subtabs: Ads | MedJobs | Both (filters by meeting_focus)
 * Follow-up has subtabs: Active (pitched) | No-show (no_show) | Not Interested (not_interested)
 * Paying has subtabs: Ads | MedJobs | Both
 */

import type { GrowthStats } from "@/lib/provider-growth/queries";
import type { PipelineStage } from "@/lib/provider-growth/stages";
export type NewClaimSubTab = "not_contacted" | "converted" | "in_progress";
export type MeetingSubTab = "ads" | "medjobs" | "both";
export type FollowUpSubTab = "active" | "no_show" | "not_interested";
export type PayingSubTab = "ads" | "medjobs" | "both";
export type ActiveTab =
  | { type: "pipeline"; stage: PipelineStage; subTab?: NewClaimSubTab | MeetingSubTab | FollowUpSubTab | PayingSubTab }
  | { type: "conversion"; tab: "paying"; subTab: PayingSubTab };

interface GrowthTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  stats: GrowthStats | null;
  newClaimSubtabCounts?: { notContacted: number; converted: number; inProgress: number };
  followUpSubtabCounts?: { active: number; noShow: number; notInterested: number };
}

const NEW_CLAIM_SUB_TABS: Array<{ id: NewClaimSubTab; label: string }> = [
  { id: "not_contacted", label: "Not Contacted" },
  { id: "converted", label: "Converted" },
  { id: "in_progress", label: "In Progress" },
];

const MEETING_SUB_TABS: Array<{ id: MeetingSubTab; label: string }> = [
  { id: "ads", label: "Ads" },
  { id: "medjobs", label: "MedJobs" },
  { id: "both", label: "Both" },
];

const FOLLOW_UP_SUB_TABS: Array<{ id: FollowUpSubTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "no_show", label: "No-show" },
  { id: "not_interested", label: "Not Interested" },
];

// Note: "pitched" stage is displayed as "Follow-up" tab with subtabs
// "not_interested" is now a subtab under Follow-up, not a standalone tab
const PIPELINE_TABS: Array<{ id: PipelineStage; label: string }> = [
  { id: "new_claim", label: "New Claims" },
  { id: "meeting_scheduled", label: "Meeting Scheduled" },
  { id: "pitched", label: "Follow-up" },
];

const PAYING_SUB_TABS: Array<{ id: PayingSubTab; label: string }> = [
  { id: "ads", label: "Ads" },
  { id: "medjobs", label: "MedJobs" },
  { id: "both", label: "Both" },
];

export function GrowthTabs({ activeTab, onTabChange, stats, newClaimSubtabCounts, followUpSubtabCounts }: GrowthTabsProps) {
  const getCount = (tab: PipelineStage | "paying" | PayingSubTab): number => {
    if (!stats) return 0;

    switch (tab) {
      case "new_claim":
        return stats.new_claim;
      case "meeting_scheduled":
        // Combined count: meeting_scheduled + upgrade_meeting (unified tab)
        return stats.meeting_scheduled + stats.upgrade_meeting;
      case "pitched":
        // Follow-up tab shows combined count of pitched + no_show + not_interested
        return stats.pitched + (stats.no_show ?? 0) + stats.not_interested;
      case "not_interested":
        return stats.not_interested;
      case "upgrade_meeting":
        return stats.upgrade_meeting;
      case "paying":
        return stats.ads_subscribed + stats.medjobs_subscribed;
      case "ads":
        if (activeTab.type === "conversion") {
          return stats.ads_subscribed;
        }
        return 0;
      case "medjobs":
        if (activeTab.type === "conversion") {
          return stats.medjobs_subscribed;
        }
        return 0;
      case "both":
        if (activeTab.type === "conversion") {
          return stats.both_paying;
        }
        return 0;
      default:
        return 0;
    }
  };

  const getFollowUpSubTabCount = (id: FollowUpSubTab): number => {
    if (followUpSubtabCounts) {
      if (id === "active") return followUpSubtabCounts.active;
      if (id === "no_show") return followUpSubtabCounts.noShow;
      return followUpSubtabCounts.notInterested;
    }
    // Fallback to stats if subtab counts not provided
    if (!stats) return 0;
    if (id === "active") return stats.pitched;
    if (id === "no_show") return stats.no_show ?? 0;
    return stats.not_interested;
  };

  const isPipelineActive = (id: PipelineStage) =>
    activeTab.type === "pipeline" && activeTab.stage === id;

  const isConversionActive = (id: "paying") =>
    activeTab.type === "conversion" && activeTab.tab === id;

  const isPayingSubTabActive = (id: PayingSubTab) =>
    activeTab.type === "conversion" && activeTab.tab === "paying" && activeTab.subTab === id;

  const isNewClaimSubTabActive = (id: NewClaimSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "new_claim" && activeTab.subTab === id;

  const isMeetingSubTabActive = (id: MeetingSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "meeting_scheduled" && activeTab.subTab === id;

  // Follow-up subtabs map to different stages: active=pitched, no_show=no_show, not_interested=not_interested
  // But the main tab is always "pitched" in the activeTab.stage for Follow-up
  const isFollowUpSubTabActive = (id: FollowUpSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "pitched" && activeTab.subTab === id;

  const getNewClaimSubTabCount = (id: NewClaimSubTab): number => {
    if (!newClaimSubtabCounts) return 0;
    if (id === "not_contacted") return newClaimSubtabCounts.notContacted;
    if (id === "converted") return newClaimSubtabCounts.converted;
    return newClaimSubtabCounts.inProgress;
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
              // For meeting_scheduled, default to "ads" subtab
              } else if (tab.id === "meeting_scheduled") {
                onTabChange({ type: "pipeline", stage: tab.id, subTab: "ads" });
              // For pitched (Follow-up), default to "active" subtab
              } else if (tab.id === "pitched") {
                onTabChange({ type: "pipeline", stage: tab.id, subTab: "active" });
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

      {/* Meeting Scheduled sub-tabs (Ads/MedJobs/Both - filters by meeting_focus) */}
      {activeTab.type === "pipeline" && activeTab.stage === "meeting_scheduled" && (
        <div className="flex gap-1 mt-2 pl-4">
          {MEETING_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "pipeline",
                  stage: "meeting_scheduled",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isMeetingSubTabActive(subTab.id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
            </button>
          ))}
        </div>
      )}

      {/* Follow-up sub-tabs (Active / No-show / Not Interested) */}
      {activeTab.type === "pipeline" && activeTab.stage === "pitched" && (
        <div className="flex gap-1 mt-2 pl-4">
          {FOLLOW_UP_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "pipeline",
                  stage: "pitched",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isFollowUpSubTabActive(subTab.id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getFollowUpSubTabCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Paying sub-tabs (Ads/MedJobs/Both) */}
      {activeTab.type === "conversion" && activeTab.tab === "paying" && (
        <div className="flex gap-1 mt-2 pl-4">
          {PAYING_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "conversion",
                  tab: "paying",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isPayingSubTabActive(subTab.id)
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
    </div>
  );
}
