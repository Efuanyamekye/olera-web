"use client";

/**
 * WorkQueueTab - Shows providers needing follow-up action
 *
 * Subtabs (controlled by parent):
 * - Returned Calls: Voicemails from providers in growth pipeline
 * - Overdue: callback_date < today
 * - Due Today: callback_date = today
 * - Needs Retry: voicemail/hung_up/left_message, stale > 2 days
 * - Stale: no activity in 7+ days
 */

import Link from "next/link";
import type { WorkQueueEntry, WorkQueueResult, ReturnedCallEntry } from "@/lib/provider-growth/queries";
import type { WorkQueueSubTab } from "./GrowthTabs";
import type { ProviderFiltersValue } from "./ProviderFilters";
import { EligibilityBadges } from "./EligibilityBadges";
import { CARE_TYPE_FILTER_MAPPING } from "@/lib/provider-growth/stages";

interface WorkQueueTabProps {
  data: WorkQueueResult | null;
  loading: boolean;
  error: string | null;
  subTab: WorkQueueSubTab;
  onProviderClick: (trackingId: string) => void;
  // Filters
  search?: string;
  assignedTo?: string | null;
  filters?: ProviderFiltersValue;
}

export function WorkQueueTab({
  data,
  loading,
  error,
  subTab,
  onProviderClick,
  search,
  assignedTo,
  filters,
}: WorkQueueTabProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-red-500">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Common filter logic for both entry types
  const matchesFilters = (e: WorkQueueEntry | ReturnedCallEntry): boolean => {
    // Search filter (match display_name)
    if (search?.trim()) {
      const searchLower = search.toLowerCase().trim();
      if (!e.display_name?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }

    // Assigned to filter (only for WorkQueueEntry which has assigned_to)
    if (assignedTo && "assigned_to" in e) {
      if ((e as WorkQueueEntry).assigned_to !== assignedTo) {
        return false;
      }
    }

    // Profile completeness filter
    if (filters?.completenessMin !== undefined) {
      if ((e.profile_completeness ?? 0) < filters.completenessMin) {
        return false;
      }
    }
    if (filters?.completenessMax !== undefined) {
      if ((e.profile_completeness ?? 0) > filters.completenessMax) {
        return false;
      }
    }

    // Care types filter (matches main query logic exactly)
    if (filters?.careTypes && filters.careTypes.length > 0) {
      if (!e.care_types || e.care_types.length === 0) return false;

      // Build set of all known care types for "other" detection
      const knownCareTypes = new Set(
        Object.values(CARE_TYPE_FILTER_MAPPING).flat().map((ct) => ct.toLowerCase())
      );

      const hasMatch = filters.careTypes.some((filterType) => {
        if (filterType === "other") {
          // Match if provider has any care type not in known categories
          return e.care_types!.some(
            (pct) => !knownCareTypes.has(pct.toLowerCase())
          );
        }
        // Match if provider has any care type in the mapped values (exact match)
        const mappedValues = CARE_TYPE_FILTER_MAPPING[filterType] || [];
        return e.care_types!.some((pct) =>
          mappedValues.some((mv) => mv.toLowerCase() === pct.toLowerCase())
        );
      });

      if (!hasMatch) return false;
    }

    return true;
  };

  // Get the filtered list based on subtab
  const getEntries = (): WorkQueueEntry[] | ReturnedCallEntry[] => {
    switch (subTab) {
      case "returned_calls":
        return data.returnedCalls.filter(matchesFilters);
      case "overdue":
        return data.overdueCallbacks.filter(matchesFilters);
      case "due_today":
        return data.dueToday.filter(matchesFilters);
      case "needs_retry":
        return data.needsRetry.filter(matchesFilters);
      case "stale":
        return data.stale.filter(matchesFilters);
      default:
        return [];
    }
  };

  const entries = getEntries();

  if (entries.length === 0) {
    const emptyMessages: Record<WorkQueueSubTab, string> = {
      returned_calls: "No returned calls",
      overdue: "No overdue callbacks",
      due_today: "No callbacks due today",
      needs_retry: "No providers need retry",
      stale: "No stale providers",
    };

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500">{emptyMessages[subTab]}</p>
      </div>
    );
  }

  // Render different row types based on subtab
  if (subTab === "returned_calls") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {(entries as ReturnedCallEntry[]).map((entry) => (
          <ReturnedCallRow
            key={entry.thread_id}
            entry={entry}
            onClick={() => onProviderClick(entry.tracking_id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {(entries as WorkQueueEntry[]).map((entry) => (
        <WorkQueueRow
          key={entry.tracking_id}
          entry={entry}
          onClick={() => onProviderClick(entry.tracking_id)}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Work Queue Row (Standard entry)
// ─────────────────────────────────────────────────────────────────────────────

interface WorkQueueRowProps {
  entry: WorkQueueEntry;
  onClick: () => void;
}

function WorkQueueRow({ entry, onClick }: WorkQueueRowProps) {
  const location = [entry.city, entry.state].filter(Boolean).join(", ");
  const category = entry.care_types?.slice(0, 2).join(", ") || null;
  const locationCategory = [location, category].filter(Boolean).join(" · ");

  return (
    <div
      onClick={onClick}
      className="group px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Provider info */}
        <div className="min-w-0 flex-1">
          {/* Line 1: Name + verification badge + stage badge */}
          <div className="flex items-center gap-2">
            {entry.slug ? (
              <Link
                href={`/admin/directory/${entry.slug}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors"
              >
                {entry.display_name || "Unnamed Provider"}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-gray-900">
                {entry.display_name || "Unnamed Provider"}
              </span>
            )}
            <VerificationBadge state={entry.verification_state} providerName={entry.display_name} />
            <StageBadge stage={entry.pipeline_stage} isConverted={entry.is_converted} />
          </div>

          {/* Line 2: Location · Category */}
          {locationCategory && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{locationCategory}</p>
          )}

          {/* Line 3: Contact info */}
          {(entry.phone || entry.email) && (
            <p className="mt-0.5 text-xs text-gray-500">
              {entry.phone && (
                <a
                  href={`tel:${entry.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {entry.phone}
                </a>
              )}
              {entry.phone && entry.email && <span className="text-gray-400"> · </span>}
              {entry.email && <span>{entry.email}</span>}
            </p>
          )}
        </div>

        {/* Right: Eligibility badges + Queue reason info */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Eligibility badges */}
          <div className="flex items-center gap-2">
            <EligibilityBadges
              adsEligible={entry.ads_eligible}
              medjobsEligible={entry.medjobs_eligible}
              medjobsUniversity={entry.medjobs_catchment_university}
            />
          </div>
          <QueueReasonBadge entry={entry} />
          {entry.last_activity_outcome && (
            <span className="text-xs text-gray-400">
              Last: {getOutcomeLabel(entry.last_activity_outcome)}
            </span>
          )}
          {entry.last_activity_at && (
            <span className="text-xs text-gray-400">
              {timeAgo(entry.last_activity_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Returned Call Row (Voicemail from Growth Provider)
// ─────────────────────────────────────────────────────────────────────────────

interface ReturnedCallRowProps {
  entry: ReturnedCallEntry;
  onClick: () => void;
}

function ReturnedCallRow({ entry, onClick }: ReturnedCallRowProps) {
  const location = [entry.city, entry.state].filter(Boolean).join(", ");
  const category = entry.care_types?.slice(0, 2).join(", ") || null;
  const locationCategory = [location, category].filter(Boolean).join(" · ");
  const hasAudio = entry.audio_message_id && entry.audio_attachment_id;

  // Build audio URL for playback
  const audioUrl = hasAudio
    ? `/api/admin/support-email/${encodeURIComponent(entry.thread_id)}/attachments/${encodeURIComponent(entry.audio_message_id!)}/` +
      `${encodeURIComponent(entry.audio_attachment_id!)}`
    : null;

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Provider info */}
        <div className="min-w-0 flex-1">
          {/* Line 1: Name + verification badge + stage badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClick}
              className="truncate text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors text-left"
            >
              {entry.display_name || "Unnamed Provider"}
            </button>
            <VerificationBadge state={entry.verification_state} providerName={entry.display_name} />
            <StageBadge stage={entry.pipeline_stage} isConverted={entry.is_converted} />
          </div>

          {/* Line 2: Location · Category + phone */}
          {(locationCategory || entry.phone) && (
            <p className="mt-0.5 text-xs text-gray-500">
              {locationCategory && <span>{locationCategory}</span>}
              {locationCategory && entry.phone && <span className="text-gray-400"> · </span>}
              {entry.phone && (
                <a
                  href={`tel:${entry.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {entry.phone}
                </a>
              )}
            </p>
          )}

          {/* Line 3: Voicemail summary */}
          {entry.voicemail_summary && (
            <p className="mt-1.5 text-xs text-gray-600 line-clamp-2">
              {entry.voicemail_summary}
            </p>
          )}

          {/* Audio player */}
          {audioUrl && (
            <div className="mt-2 flex items-center gap-2">
              <audio
                controls
                preload="metadata"
                className="h-8 min-w-0 flex-1 max-w-xs"
                src={audioUrl}
                onClick={(e) => e.stopPropagation()}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>

        {/* Right: Eligibility badges + Time info */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {/* Eligibility badges */}
          <div className="flex items-center gap-2">
            <EligibilityBadges
              adsEligible={entry.ads_eligible}
              medjobsEligible={entry.medjobs_eligible}
              medjobsUniversity={entry.medjobs_catchment_university}
            />
          </div>
          <span className="text-xs text-gray-400">
            {timeAgo(entry.voicemail_at)}
          </span>
          {entry.callback_number && (
            <a
              href={`tel:${entry.callback_number}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              {entry.callback_number}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function StageBadge({ stage, isConverted }: { stage: string; isConverted: boolean }) {
  // Show "Converted" badge for free trial providers
  if (isConverted) {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
        Converted
      </span>
    );
  }

  // Only show badges for meaningful pipeline states
  // Skip "new_claim" - all providers here are claimed by definition, showing it is noise
  const stageLabels: Record<string, string> = {
    meeting_scheduled: "Meeting",
    pitched: "Pitched",
    no_show: "No-show",
    not_interested: "Not Interested",
  };

  const stageColors: Record<string, string> = {
    meeting_scheduled: "bg-purple-100 text-purple-700",
    pitched: "bg-purple-100 text-purple-700",
    no_show: "bg-orange-100 text-orange-700",
    not_interested: "bg-gray-100 text-gray-600",
  };

  // No badge for new_claim - it's the default state, no need to show it
  if (stage === "new_claim") {
    return null;
  }

  // Only render badge if we have a label for this stage
  if (!stageLabels[stage]) {
    return null;
  }

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${stageColors[stage] || "bg-gray-100 text-gray-600"}`}>
      {stageLabels[stage]}
    </span>
  );
}

function VerificationBadge({ state, providerName }: { state: string | null; providerName: string | null }) {
  const verificationLink = `/admin/verification?search=${encodeURIComponent(providerName || "")}`;

  // Verified or not_required: show green checkmark
  if (state === "verified" || state === "not_required") {
    return (
      <a
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="text-emerald-600 hover:text-emerald-700 transition-colors"
        title="Verified — click to view"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      </a>
    );
  }

  // Pending verification: show amber badge
  if (state === "pending") {
    return (
      <a
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
        title="Click to review verification"
      >
        Pending Verification
      </a>
    );
  }

  // Unverified: show orange badge
  if (state === "unverified") {
    return (
      <a
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
        title="Click to verify this provider"
      >
        Unverified
      </a>
    );
  }

  // Rejected: show red badge
  if (state === "rejected") {
    return (
      <a
        href={verificationLink}
        onClick={(e) => e.stopPropagation()}
        className="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
        title="Verification rejected — click for details"
      >
        Rejected
      </a>
    );
  }

  return null;
}

function QueueReasonBadge({ entry }: { entry: WorkQueueEntry }) {
  if (entry.queue_reason === "overdue_callback" || entry.queue_reason === "due_today") {
    const callbackDate = entry.callback_date ? formatCallbackDate(entry.callback_date) : "—";

    return (
      <span className="text-xs text-gray-500">
        Callback: {callbackDate}
      </span>
    );
  }

  return null;
}

function getOutcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    voicemail: "Voicemail",
    hung_up: "Hung up",
    callback_requested: "Callback requested",
    left_message: "Left message",
    note: "Note",
    interested: "Interested",
    not_interested: "Not interested",
    no_show: "No-show",
  };
  return labels[outcome] || outcome;
}

function formatCallbackDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
