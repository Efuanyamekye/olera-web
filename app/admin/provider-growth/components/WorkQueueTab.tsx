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

interface WorkQueueTabProps {
  data: WorkQueueResult | null;
  loading: boolean;
  error: string | null;
  subTab: WorkQueueSubTab;
  onProviderClick: (trackingId: string) => void;
}

export function WorkQueueTab({ data, loading, error, subTab, onProviderClick }: WorkQueueTabProps) {
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

  // Get the right list based on subtab
  const getEntries = (): WorkQueueEntry[] | ReturnedCallEntry[] => {
    switch (subTab) {
      case "returned_calls":
        return data.returnedCalls;
      case "overdue":
        return data.overdueCallbacks;
      case "due_today":
        return data.dueToday;
      case "needs_retry":
        return data.needsRetry;
      case "stale":
        return data.stale;
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

  return (
    <div
      onClick={onClick}
      className="group px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Provider info */}
        <div className="min-w-0 flex-1">
          {/* Line 1: Name + stage badge */}
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
            <StageBadge stage={entry.pipeline_stage} isConverted={entry.is_converted} />
          </div>

          {/* Line 2: Location */}
          {location && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{location}</p>
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

        {/* Right: Queue reason info */}
        <div className="flex shrink-0 flex-col items-end gap-1">
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
          {/* Line 1: Name + stage badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClick}
              className="truncate text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors text-left"
            >
              {entry.display_name || "Unnamed Provider"}
            </button>
            <StageBadge stage={entry.pipeline_stage} isConverted={entry.is_converted} />
          </div>

          {/* Line 2: Location + phone */}
          {(location || entry.phone) && (
            <p className="mt-0.5 text-xs text-gray-500">
              {location && <span>{location}</span>}
              {location && entry.phone && <span className="text-gray-400"> · </span>}
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

        {/* Right: Time info */}
        <div className="flex shrink-0 flex-col items-end gap-1">
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
  if (isConverted) {
    return (
      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
        Converted
      </span>
    );
  }

  const stageLabels: Record<string, string> = {
    new_claim: "Claimed",
    meeting_scheduled: "Meeting",
    pitched: "Pitched",
    no_show: "No-show",
  };

  const stageColors: Record<string, string> = {
    new_claim: "bg-blue-100 text-blue-700",
    meeting_scheduled: "bg-purple-100 text-purple-700",
    pitched: "bg-purple-100 text-purple-700",
    no_show: "bg-orange-100 text-orange-700",
  };

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${stageColors[stage] || "bg-gray-100 text-gray-600"}`}>
      {stageLabels[stage] || stage}
    </span>
  );
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
