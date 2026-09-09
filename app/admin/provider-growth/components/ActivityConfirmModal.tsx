"use client";

/**
 * ActivityConfirmModal - Confirmation modal for stage-changing activities
 *
 * Shows when an admin selects an activity outcome that will change the
 * provider's pipeline stage. Displays the current and target stage,
 * and requires explicit confirmation before proceeding.
 */

import type { PipelineStage, ActivityOutcome } from "@/lib/provider-growth/stages";
import {
  PIPELINE_STAGE_LABELS,
  ACTIVITY_OUTCOME_LABELS,
  OUTCOME_DESCRIPTIONS,
} from "@/lib/provider-growth/stages";

interface ActivityConfirmModalProps {
  outcome: ActivityOutcome;
  currentStage: PipelineStage;
  targetStage: PipelineStage | null;
  notes: string;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export function ActivityConfirmModal({
  outcome,
  currentStage,
  targetStage,
  notes,
  onConfirm,
  onCancel,
  submitting,
}: ActivityConfirmModalProps) {
  const outcomeLabel = ACTIVITY_OUTCOME_LABELS[outcome];
  const description = OUTCOME_DESCRIPTIONS[outcome];
  const currentLabel = PIPELINE_STAGE_LABELS[currentStage];
  const targetLabel = targetStage ? PIPELINE_STAGE_LABELS[targetStage] : null;

  // Determine styling based on outcome type
  const isNegative = outcome === "not_interested" || outcome === "no_show";
  const bgColor = isNegative ? "bg-red-50" : "bg-blue-50";
  const borderColor = isNegative ? "border-red-200" : "border-blue-200";
  const iconColor = isNegative ? "text-red-500" : "text-blue-500";
  const confirmBg = isNegative
    ? "bg-red-600 hover:bg-red-700"
    : "bg-primary-600 hover:bg-primary-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${bgColor} flex items-center justify-center`}>
            {isNegative ? (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Confirm: {outcomeLabel}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {description}
            </p>
          </div>
        </div>

        {/* Stage transition display */}
        {targetStage && targetStage !== currentStage && (
          <div className={`p-4 ${bgColor} border ${borderColor} rounded-lg mb-4`}>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Stage Change
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-gray-700">{currentLabel}</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <span className="font-medium text-gray-900">{targetLabel}</span>
            </div>
          </div>
        )}

        {/* Notes preview if any */}
        {notes.trim() && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Notes
            </div>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {notes}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`px-4 py-2 text-sm font-medium text-white ${confirmBg} rounded-lg transition-colors disabled:opacity-50`}
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
