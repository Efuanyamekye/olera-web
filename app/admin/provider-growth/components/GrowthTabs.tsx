"use client";

/**
 * GrowthTabs - Tab navigation for provider growth pipeline
 *
 * Tab order: Claimed | Work Queue | Meetings | Follow-up | Converted | Paying
 *
 * Work Queue: Shows providers needing follow-up action (callbacks, retries, stale)
 * Claimed has subtabs: Not Contacted | In Progress (non-converted providers)
 * Converted has subtabs: Not Contacted | In Progress (providers on free trial)
 * Meetings has no subtabs - meeting focus is shown as a badge on each row
 * Follow-up has subtabs: Active (pitched) | No-show (no_show) | Not Interested (not_interested)
 * Paying has subtabs: Ads Only | MedJobs Only | Both | Churned
 */

import type { GrowthStats } from "@/lib/provider-growth/queries";
import type { PipelineStage } from "@/lib/provider-growth/stages";
export type ClaimedSubTab = "not_contacted" | "in_progress";
export type ConvertedSubTab = "not_contacted" | "in_progress" | "live" | "ended";
export type MeetingSubTab = "ads" | "medjobs" | "both";
export type FollowUpSubTab = "active" | "no_show" | "not_interested";
export type PayingSubTab = "ads_only" | "medjobs_only" | "both" | "churned";
export type WorkQueueSubTab = "returned_calls" | "overdue" | "due_today" | "needs_retry" | "stale";
export type ActiveTab =
  | { type: "pipeline"; stage: PipelineStage; subTab?: ClaimedSubTab | MeetingSubTab | FollowUpSubTab }
  | { type: "conversion"; tab: "converted"; subTab: ConvertedSubTab }
  | { type: "conversion"; tab: "paying"; subTab: PayingSubTab }
  | { type: "work_queue"; subTab: WorkQueueSubTab };

interface GrowthTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  stats: GrowthStats | null;
  claimedSubtabCounts?: { notContacted: number; inProgress: number };
  convertedSubtabCounts?: { notContacted: number; inProgress: number; live: number; ended: number };
  followUpSubtabCounts?: { active: number; noShow: number; notInterested: number };
  workQueueCount?: number;
  workQueueSubtabCounts?: { returnedCalls: number; overdue: number; dueToday: number; needsRetry: number; stale: number };
}

const CLAIMED_SUB_TABS: Array<{ id: ClaimedSubTab; label: string }> = [
  { id: "not_contacted", label: "Not Contacted" },
  { id: "in_progress", label: "In Progress" },
];

const CONVERTED_SUB_TABS: Array<{ id: ConvertedSubTab; label: string }> = [
  { id: "not_contacted", label: "Not Contacted" },
  { id: "in_progress", label: "In Progress" },
  { id: "live", label: "Live" },
  { id: "ended", label: "Ended" },
];

// Meeting Scheduled subtabs removed - meeting focus is shown as badge on each row

const FOLLOW_UP_SUB_TABS: Array<{ id: FollowUpSubTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "no_show", label: "No-show" },
  { id: "not_interested", label: "Not Interested" },
];

// Note: "pitched" stage is displayed as "Follow-up" tab with subtabs
// "not_interested" is now a subtab under Follow-up, not a standalone tab
// "in_progress" is now a subtab under both Claimed and Converted
const PIPELINE_TABS: Array<{ id: PipelineStage; label: string }> = [
  { id: "new_claim", label: "Claimed" },
  { id: "meeting_scheduled", label: "Meetings" },
  { id: "pitched", label: "Follow-up" },
];

const PAYING_SUB_TABS: Array<{ id: PayingSubTab; label: string }> = [
  { id: "ads_only", label: "Ads Only" },
  { id: "medjobs_only", label: "MedJobs Only" },
  { id: "both", label: "Both" },
  { id: "churned", label: "Churned" },
];

const WORK_QUEUE_SUB_TABS: Array<{ id: WorkQueueSubTab; label: string }> = [
  { id: "returned_calls", label: "Returned Calls" },
  { id: "overdue", label: "Overdue" },
  { id: "due_today", label: "Due Today" },
  { id: "needs_retry", label: "Needs Retry" },
  { id: "stale", label: "Stale" },
];

export function GrowthTabs({ activeTab, onTabChange, stats, claimedSubtabCounts, convertedSubtabCounts, followUpSubtabCounts, workQueueCount, workQueueSubtabCounts }: GrowthTabsProps) {
  const isWorkQueueActive = activeTab.type === "work_queue";

  const getWorkQueueSubTabCount = (id: WorkQueueSubTab): number => {
    if (!workQueueSubtabCounts) return 0;
    switch (id) {
      case "returned_calls": return workQueueSubtabCounts.returnedCalls;
      case "overdue": return workQueueSubtabCounts.overdue;
      case "due_today": return workQueueSubtabCounts.dueToday;
      case "needs_retry": return workQueueSubtabCounts.needsRetry;
      case "stale": return workQueueSubtabCounts.stale;
      default: return 0;
    }
  };

  const isWorkQueueSubTabActive = (id: WorkQueueSubTab) =>
    activeTab.type === "work_queue" && activeTab.subTab === id;
  const getCount = (tab: PipelineStage | "converted" | "paying" | PayingSubTab): number => {
    if (!stats) return 0;

    switch (tab) {
      case "new_claim":
        // Claimed tab shows notContacted + inProgress (non-converted only)
        if (claimedSubtabCounts) {
          return claimedSubtabCounts.notContacted + claimedSubtabCounts.inProgress;
        }
        return 0;
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
      case "converted":
        // Converted tab shows all subtabs combined
        if (convertedSubtabCounts) {
          return convertedSubtabCounts.notContacted + convertedSubtabCounts.inProgress + convertedSubtabCounts.live + convertedSubtabCounts.ended;
        }
        return stats.ads_free_intro + stats.medjobs_in_pilot + stats.medjobs_pilot_expired;
      case "paying":
        // Total paying: ads_only + medjobs_only + both (excludes churned)
        return (stats.ads_only ?? 0) + (stats.medjobs_only ?? 0) + stats.both_paying;
      case "ads_only":
        if (activeTab.type === "conversion") {
          return stats.ads_only ?? 0;
        }
        return 0;
      case "medjobs_only":
        if (activeTab.type === "conversion") {
          return stats.medjobs_only ?? 0;
        }
        return 0;
      case "both":
        if (activeTab.type === "conversion") {
          return stats.both_paying;
        }
        return 0;
      case "churned":
        if (activeTab.type === "conversion") {
          return stats.churned ?? 0;
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

  const isClaimedSubTabActive = (id: ClaimedSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "new_claim" && activeTab.subTab === id;

  // Meeting Scheduled subtabs removed

  // Follow-up subtabs map to different stages: active=pitched, no_show=no_show, not_interested=not_interested
  // But the main tab is always "pitched" in the activeTab.stage for Follow-up
  const isFollowUpSubTabActive = (id: FollowUpSubTab) =>
    activeTab.type === "pipeline" && activeTab.stage === "pitched" && activeTab.subTab === id;

  const getClaimedSubTabCount = (id: ClaimedSubTab): number => {
    if (!claimedSubtabCounts) return 0;
    if (id === "not_contacted") return claimedSubtabCounts.notContacted;
    return claimedSubtabCounts.inProgress;
  };

  const getConvertedSubTabCount = (id: ConvertedSubTab): number => {
    if (!convertedSubtabCounts) return 0;
    switch (id) {
      case "not_contacted": return convertedSubtabCounts.notContacted;
      case "in_progress": return convertedSubtabCounts.inProgress;
      case "live": return convertedSubtabCounts.live;
      case "ended": return convertedSubtabCounts.ended;
      default: return 0;
    }
  };

  const isConvertedTabActive = () =>
    activeTab.type === "conversion" && activeTab.tab === "converted";

  const isConvertedSubTabActive = (id: ConvertedSubTab) =>
    activeTab.type === "conversion" && activeTab.tab === "converted" && activeTab.subTab === id;

  return (
    <div className="mb-6">
      {/* Main tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {/* Claimed tab */}
        <button
          onClick={() => onTabChange({ type: "pipeline", stage: "new_claim", subTab: "not_contacted" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isPipelineActive("new_claim")
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Claimed
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isPipelineActive("new_claim")
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("new_claim")}
          </span>
        </button>

        {/* Work Queue tab - shows providers needing follow-up */}
        <button
          onClick={() => onTabChange({ type: "work_queue", subTab: "returned_calls" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isWorkQueueActive
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Work Queue
          {(workQueueCount ?? 0) > 0 && (
            <span
              className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                isWorkQueueActive
                  ? "bg-orange-100 text-orange-700"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              {workQueueCount}
            </span>
          )}
        </button>

        {/* Meetings tab */}
        <button
          onClick={() => onTabChange({ type: "pipeline", stage: "meeting_scheduled" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isPipelineActive("meeting_scheduled")
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Meetings
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isPipelineActive("meeting_scheduled")
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("meeting_scheduled")}
          </span>
        </button>

        {/* Follow-up tab */}
        <button
          onClick={() => onTabChange({ type: "pipeline", stage: "pitched", subTab: "active" })}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isPipelineActive("pitched")
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Follow-up
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isPipelineActive("pitched")
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("pitched")}
          </span>
        </button>

        {/* Converted tab (conversion type) */}
        <button
          onClick={() => {
            onTabChange({ type: "conversion", tab: "converted", subTab: "not_contacted" });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            isConvertedTabActive()
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
          }`}
        >
          Converted
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
              isConvertedTabActive()
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getCount("converted")}
          </span>
        </button>

        {/* Separator */}
        <div className="w-px bg-gray-200 mx-2 my-1" />

        {/* Paying tab */}
        <button
          onClick={() => {
            onTabChange({ type: "conversion", tab: "paying", subTab: "ads_only" });
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

      {/* Claimed sub-tabs (Not Contacted | In Progress) */}
      {activeTab.type === "pipeline" && activeTab.stage === "new_claim" && (
        <div className="flex gap-1 mt-2 pl-4">
          {CLAIMED_SUB_TABS.map((subTab) => (
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
                isClaimedSubTabActive(subTab.id)
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getClaimedSubTabCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Work Queue sub-tabs */}
      {activeTab.type === "work_queue" && (
        <div className="flex gap-1 mt-2 pl-4">
          {WORK_QUEUE_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "work_queue",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isWorkQueueSubTabActive(subTab.id)
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getWorkQueueSubTabCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Converted sub-tabs (Not Contacted / In Progress) */}
      {activeTab.type === "conversion" && activeTab.tab === "converted" && (
        <div className="flex gap-1 mt-2 pl-4">
          {CONVERTED_SUB_TABS.map((subTab) => (
            <button
              key={subTab.id}
              onClick={() =>
                onTabChange({
                  type: "conversion",
                  tab: "converted",
                  subTab: subTab.id,
                })
              }
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                isConvertedSubTabActive(subTab.id)
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {subTab.label}
              <span className="ml-1 text-[10px] opacity-70">
                ({getConvertedSubTabCount(subTab.id)})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Meeting Scheduled has no subtabs - meeting focus shown as badge on each row */}

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
