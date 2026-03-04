"use client";

import { useState } from "react";
import {
  CARE_TYPE_LABELS,
  RECIPIENT_OPTIONS,
  URGENCY_OPTIONS,
} from "@/components/providers/connection-card/constants";

interface CareRequestData {
  careType: string | null;
  careRecipient: string | null;
  urgency: string | null;
  additionalNotes: string | null;
  seekerName: string | null;
}

interface EditCareRequestModalProps {
  careRequest: CareRequestData;
  connectionId: string;
  onClose: () => void;
  onSaved: (message: string, metadata: Record<string, unknown>) => void;
}

const CARE_TYPE_OPTIONS = Object.entries(CARE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

export default function EditCareRequestModal({
  careRequest,
  connectionId,
  onClose,
  onSaved,
}: EditCareRequestModalProps) {
  const [careType, setCareType] = useState(careRequest.careType || "");
  const [careRecipient, setCareRecipient] = useState(careRequest.careRecipient || "");
  const [urgency, setUrgency] = useState(careRequest.urgency || "");
  const [notes, setNotes] = useState(careRequest.additionalNotes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    careType !== (careRequest.careType || "") ||
    careRecipient !== (careRequest.careRecipient || "") ||
    urgency !== (careRequest.urgency || "") ||
    notes !== (careRequest.additionalNotes || "");

  async function handleSave() {
    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/connections/update-intent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          careType: careType || null,
          careRecipient: careRecipient || null,
          urgency: urgency || null,
          additionalNotes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }

      const data = await res.json();
      onSaved(data.message, data.metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop — standard gray overlay, no blur */}
      <div
        className="absolute inset-0 bg-gray-900/50"
        onClick={onClose}
      />

      {/* Bottom sheet on mobile, centered modal on desktop */}
      <div className="relative w-full sm:max-w-md sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95 duration-200">
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header — standard white with gray close button */}
        <div className="flex items-center gap-3 px-5 sm:px-6 pt-4 pb-0 shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 flex-1">Edit Care Request</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          {/* Care Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Care Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CARE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCareType(opt.value)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    careType === opt.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Who Needs Care
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RECIPIENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCareRecipient(opt.value)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    careRecipient === opt.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Timeline
            </label>
            <div className="grid grid-cols-2 gap-2">
              {URGENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUrgency(opt.value)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    urgency === opt.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Additional Notes
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details you'd like to share..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/20 resize-none transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="min-h-[44px] px-5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
