"use client";

/**
 * PitchLogger - Form for logging pitch meeting outcomes
 *
 * Records what was pitched (Ads/MedJobs), interest level, notes,
 * and whether to mark as not interested.
 */

import { useState } from "react";
import {
  INTEREST_LEVELS,
  INTEREST_LEVEL_LABELS,
  INTEREST_LEVEL_COLORS,
  NOT_INTERESTED_REASONS,
  type InterestLevel,
  type NotInterestedReason,
} from "@/lib/provider-growth/stages";

interface PitchLoggerProps {
  onSubmit: (data: PitchLogData) => Promise<void>;
  onCancel: () => void;
  providerName: string;
  medjobsEligible?: boolean;
}

export interface PitchLogData {
  pitched_ads: boolean;
  pitched_medjobs: boolean;
  interest_level: InterestLevel | null;
  notes: string;
  mark_not_interested: boolean;
  not_interested_reason?: NotInterestedReason;
}

export function PitchLogger({
  onSubmit,
  onCancel,
  providerName,
  medjobsEligible = false,
}: PitchLoggerProps) {
  const [pitchedAds, setPitchedAds] = useState(true);
  const [pitchedMedjobs, setPitchedMedjobs] = useState(medjobsEligible);
  const [interestLevel, setInterestLevel] = useState<InterestLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [markNotInterested, setMarkNotInterested] = useState(false);
  const [notInterestedReason, setNotInterestedReason] = useState<NotInterestedReason | "">("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await onSubmit({
        pitched_ads: pitchedAds,
        pitched_medjobs: pitchedMedjobs,
        interest_level: interestLevel,
        notes,
        mark_not_interested: markNotInterested,
        not_interested_reason: markNotInterested && notInterestedReason
          ? notInterestedReason as NotInterestedReason
          : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Log pitch for {providerName}
        </h3>
      </div>

      {/* What was pitched */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What was pitched?
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pitchedAds}
              onChange={(e) => setPitchedAds(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Ads</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pitchedMedjobs}
              onChange={(e) => setPitchedMedjobs(e.target.checked)}
              disabled={!medjobsEligible}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
            />
            <span className={`text-sm ${medjobsEligible ? "text-gray-700" : "text-gray-400"}`}>
              MedJobs {!medjobsEligible && "(not eligible)"}
            </span>
          </label>
        </div>
      </div>

      {/* Interest level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Interest level
        </label>
        <div className="flex flex-wrap gap-2">
          {INTEREST_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setInterestLevel(level)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                interestLevel === level
                  ? INTEREST_LEVEL_COLORS[level]
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {INTEREST_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Key points from the meeting, follow-up items, etc."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Mark not interested */}
      <div className="border-t border-gray-200 pt-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={markNotInterested}
            onChange={(e) => setMarkNotInterested(e.target.checked)}
            className="rounded border-gray-300 text-gray-600 focus:ring-gray-500"
          />
          <span className="text-sm text-gray-700">Mark as not interested</span>
        </label>

        {markNotInterested && (
          <div className="mt-3 ml-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason
            </label>
            <select
              value={notInterestedReason}
              onChange={(e) => setNotInterestedReason(e.target.value as NotInterestedReason)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select a reason...</option>
              {NOT_INTERESTED_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || (!pitchedAds && !pitchedMedjobs)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving..." : "Log Pitch"}
        </button>
      </div>
    </form>
  );
}
