"use client";

/**
 * ActivityLog - Unified activity logging for provider growth tracking
 *
 * Replaces separate CallLogSection and Admin Activity sections with a single
 * unified interface. Shows context-aware dropdown options based on the current
 * pipeline stage, with confirmation modals for stage-changing actions.
 */

import { useState, useEffect, useCallback } from "react";
import type { PipelineStage, ActivityOutcome } from "@/lib/provider-growth/stages";
import {
  STAGE_OUTCOMES,
  STAGE_CHANGING_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  OUTCOME_DESCRIPTIONS,
  OUTCOME_STAGE_TRANSITIONS,
  PIPELINE_STAGE_LABELS,
} from "@/lib/provider-growth/stages";
import { ActivityConfirmModal } from "./ActivityConfirmModal";

interface ActivityEntry {
  id: string;
  tracking_id: string;
  touchpoint_type: string;
  outcome: ActivityOutcome | null;
  notes: string | null;
  admin_id: string | null;
  admin_name: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

interface ActivityLogProps {
  trackingId: string;
  businessProfileId: string;
  pipelineStage: PipelineStage;
  onActivityLogged?: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </div>
  );
}

export function ActivityLog({
  trackingId,
  businessProfileId,
  pipelineStage,
  onActivityLogged,
}: ActivityLogProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const availableOutcomes = STAGE_OUTCOMES[pipelineStage] || [];
  const [selectedOutcome, setSelectedOutcome] = useState<ActivityOutcome>(
    availableOutcomes[0] || "note"
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation modal state
  const [pendingOutcome, setPendingOutcome] = useState<ActivityOutcome | null>(null);

  // Reset state when tracking or stage changes
  useEffect(() => {
    setActivities([]);
    setNotes("");
    setError(null);
    setPendingOutcome(null);
    // Reset to first available outcome for new stage
    const outcomes = STAGE_OUTCOMES[pipelineStage] || [];
    setSelectedOutcome(outcomes[0] || "note");
  }, [trackingId, pipelineStage]);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/provider-growth/activities?tracking_id=${trackingId}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (e) {
      console.error("Failed to fetch activities:", e);
    } finally {
      setLoading(false);
    }
  }, [trackingId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleSubmit = useCallback(async (outcome: ActivityOutcome, notesText: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/provider-growth/log-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_id: trackingId,
          business_profile_id: businessProfileId,
          outcome,
          notes: notesText.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to log activity");
      }

      const data = await res.json();

      // Add the new activity to the top of the list
      if (data.activity) {
        setActivities((prev) => [data.activity, ...prev]);
      }
      setNotes("");
      // Reset to first outcome
      const outcomes = STAGE_OUTCOMES[pipelineStage] || [];
      setSelectedOutcome(outcomes[0] || "note");
      setPendingOutcome(null);

      // Notify parent to refresh (for stage changes)
      onActivityLogged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log activity");
    } finally {
      setSubmitting(false);
    }
  }, [trackingId, businessProfileId, pipelineStage, submitting, onActivityLogged]);

  const handleLogClick = () => {
    // Check if this outcome changes the stage
    if (STAGE_CHANGING_OUTCOMES.includes(selectedOutcome)) {
      setPendingOutcome(selectedOutcome);
    } else {
      handleSubmit(selectedOutcome, notes);
    }
  };

  const handleConfirm = () => {
    if (pendingOutcome) {
      handleSubmit(pendingOutcome, notes);
    }
  };

  const handleCancel = () => {
    setPendingOutcome(null);
  };

  // Get the target stage for display in confirmation modal
  const getTargetStage = (outcome: ActivityOutcome): PipelineStage | null => {
    const transitions = OUTCOME_STAGE_TRANSITIONS[outcome];
    if (!transitions) return null;
    return transitions[pipelineStage] || null;
  };

  return (
    <div>
      <SectionHeader>Activity Log</SectionHeader>

      {/* Log activity form */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value as ActivityOutcome)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            disabled={submitting}
          >
            {availableOutcomes.map((outcome) => (
              <option key={outcome} value={outcome}>
                {ACTIVITY_OUTCOME_LABELS[outcome]}
                {STAGE_CHANGING_OUTCOMES.includes(outcome) ? " →" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleLogClick}
            disabled={submitting}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "..." : "Log"}
          </button>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={submitting}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleLogClick();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setNotes("");
            }
          }}
        />
        {/* Show description for selected outcome */}
        <p className="mt-1.5 text-xs text-gray-500">
          {OUTCOME_DESCRIPTIONS[selectedOutcome]}
        </p>
        {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>

      {/* Activity history */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <span className="w-4 h-4 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No activity yet</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {activities.map((activity) => (
            <ActivityEntry key={activity.id} activity={activity} />
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {pendingOutcome && (
        <ActivityConfirmModal
          outcome={pendingOutcome}
          currentStage={pipelineStage}
          targetStage={getTargetStage(pendingOutcome)}
          notes={notes}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          submitting={submitting}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Entry Display
// ─────────────────────────────────────────────────────────────────────────────

function ActivityEntry({ activity }: { activity: ActivityEntry }) {
  const outcomeLabel = activity.outcome
    ? ACTIVITY_OUTCOME_LABELS[activity.outcome]
    : activity.touchpoint_type;

  // Determine if this was a stage change
  const details = activity.details || {};
  const isStageChange = Boolean(details.previous_stage && details.new_stage);

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs text-gray-400">
          {formatTimestamp(activity.created_at)}
        </span>
        <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${getOutcomeColor(activity.outcome, activity.touchpoint_type)}`}>
          {outcomeLabel}
        </span>
        {isStageChange && (
          <span className="text-xs text-gray-400">
            → {PIPELINE_STAGE_LABELS[details.new_stage as PipelineStage] || String(details.new_stage)}
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {activity.admin_name || "System"}
        </span>
      </div>
      {activity.notes ? (
        <p className="text-gray-600 whitespace-pre-wrap">{activity.notes}</p>
      ) : null}
    </div>
  );
}

function getOutcomeColor(outcome: ActivityOutcome | null, touchpointType: string): string {
  // Color based on outcome category
  if (outcome) {
    // Stage-changing outcomes
    if (STAGE_CHANGING_OUTCOMES.includes(outcome)) {
      if (outcome === "not_interested") return "bg-red-100 text-red-800";
      if (outcome === "no_show") return "bg-amber-100 text-amber-800";
      return "bg-blue-100 text-blue-800"; // meeting_scheduled, interested, meeting_rescheduled
    }
    // Call outcomes
    if (["voicemail", "hung_up", "callback_requested", "left_message"].includes(outcome)) {
      return "bg-gray-100 text-gray-800";
    }
    // Note
    return "bg-slate-100 text-slate-800";
  }

  // Fallback for touchpoint types without outcome
  if (touchpointType === "meeting_no_show") return "bg-amber-100 text-amber-800";
  if (touchpointType === "stage_changed") return "bg-blue-100 text-blue-800";
  if (touchpointType.includes("meeting")) return "bg-purple-100 text-purple-800";
  if (touchpointType.includes("converted") || touchpointType.includes("upgraded")) {
    return "bg-emerald-100 text-emerald-800";
  }
  return "bg-gray-100 text-gray-800";
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
