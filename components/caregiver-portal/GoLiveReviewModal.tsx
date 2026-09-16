"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import type { CompletenessSection } from "@/lib/medjobs-completeness";

interface GoLiveReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  sections: CompletenessSection[];
  onGoLive: () => void;
}

export default function GoLiveReviewModal({
  isOpen,
  onClose,
  profileId,
  sections,
  onGoLive,
}: GoLiveReviewModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowSuccess(false);
      setError(null);
    }
  }, [isOpen]);

  // Calculate completeness - all sections must be 100% to request review
  const incompleteSections = sections.filter((s) => !s.done);
  const completeSections = sections.filter((s) => s.done);
  const allComplete = incompleteSections.length === 0;
  const completenessPercent = sections.length > 0
    ? Math.round(sections.reduce((sum, s) => sum + s.percent, 0) / sections.length)
    : 0;

  async function handleRequestReview() {
    if (!allComplete) {
      setError("Please complete all sections before requesting review.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/medjobs/request-review", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }
      setShowSuccess(true);
      // Notify parent after a brief moment
      setTimeout(() => {
        onGoLive();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  if (showSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} hideHeader size="md">
        <div className="text-center py-12 px-6 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-6 left-10 w-16 h-16 rounded-full bg-primary-100/40 animate-scale-in" />
            <div className="absolute top-14 right-8 w-10 h-10 rounded-full bg-amber-100/40 animate-scale-in" style={{ animationDelay: "100ms" }} />
            <div className="absolute bottom-20 left-14 w-8 h-8 rounded-full bg-primary-100/50 animate-scale-in" style={{ animationDelay: "200ms" }} />
          </div>

          {/* Clock icon for pending review */}
          <div className="relative z-10 w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-200">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h2 className="relative z-10 text-2xl font-bold text-gray-900 mb-2">Review Requested!</h2>
          <p className="relative z-10 text-gray-600 mb-8 max-w-sm mx-auto leading-relaxed">
            Your profile is now under review. We&apos;ll notify you once it&apos;s approved and visible to providers.
          </p>

          <div className="relative z-10 space-y-3">
            <button
              type="button"
              onClick={onClose}
              className="block w-full px-6 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all hover:shadow-lg text-center"
            >
              Got it
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} hideHeader size="md">
      <div className="py-8 px-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-900 flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Request Profile Review</h2>
          <p className="text-sm text-gray-500 mt-1">
            {allComplete
              ? "Your profile is complete! Submit it for review to go live."
              : "Complete all sections to request a review."}
          </p>
        </div>

        {/* Progress indicator when not complete */}
        {!allComplete && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Profile Completeness</span>
              <span className="text-sm font-semibold text-gray-900">{completenessPercent}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${completenessPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Complete sections */}
        {completeSections.length > 0 && (
          <div className="mb-4">
            <div className="space-y-1">
              {completeSections.map((section) => (
                <div key={section.id} className="flex items-center gap-2.5 py-2 px-3 rounded-lg">
                  <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">{section.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incomplete sections - now required, not optional */}
        {incompleteSections.length > 0 && (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-900">Required to request review</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Complete these sections before your profile can be reviewed.
                  </p>
                </div>
              </div>
              <div className="space-y-1 ml-7">
                {incompleteSections.map((section) => (
                  <div key={section.id} className="flex items-center gap-2.5 py-1.5">
                    <div className="w-4 h-4 rounded-full border-2 border-amber-300 shrink-0" />
                    <span className="text-sm text-amber-800">{section.label}</span>
                    {section.percent > 0 && (
                      <span className="text-xs text-amber-500">{section.percent}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600 text-center">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleRequestReview}
            disabled={saving || !allComplete}
            className={`w-full px-6 py-3.5 font-semibold rounded-xl transition-all disabled:cursor-not-allowed ${
              allComplete
                ? "bg-gray-900 hover:bg-gray-800 text-white hover:shadow-lg disabled:opacity-50"
                : "bg-gray-200 text-gray-400"
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : allComplete ? (
              "Request Review"
            ) : (
              "Complete profile to request review"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full px-6 py-2.5 text-gray-500 hover:text-gray-900 font-medium transition-colors disabled:opacity-50"
          >
            {allComplete ? "Cancel" : "Go back and complete profile"}
          </button>
        </div>

        {/* Info note */}
        {allComplete && (
          <p className="mt-4 text-xs text-gray-400 text-center">
            After you request review, our team will verify your profile before making it visible to providers.
          </p>
        )}
      </div>
    </Modal>
  );
}
