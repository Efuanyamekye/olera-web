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

  // Sections that are incomplete (skip verification — that's separate)
  const incompleteSections = sections.filter(
    (s) => !s.done && s.id !== "verification"
  );
  const completeSections = sections.filter((s) => s.done);
  const allComplete = incompleteSections.length === 0;

  async function handleGoLive() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/medjobs/go-live", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
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
            <div className="absolute top-6 left-10 w-16 h-16 rounded-full bg-emerald-100/40 animate-scale-in" />
            <div className="absolute top-14 right-8 w-10 h-10 rounded-full bg-primary-100/40 animate-scale-in" style={{ animationDelay: "100ms" }} />
            <div className="absolute bottom-20 left-14 w-8 h-8 rounded-full bg-amber-100/50 animate-scale-in" style={{ animationDelay: "200ms" }} />
          </div>

          {/* Check icon */}
          <div className="relative z-10 w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="relative z-10 text-2xl font-bold text-gray-900 mb-2">You&apos;re live!</h2>
          <p className="relative z-10 text-gray-600 mb-8 max-w-sm mx-auto leading-relaxed">
            Providers can now see your profile and will reach out when they have opportunities that match.
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">One last look before you go live</h2>
          <p className="text-sm text-gray-500 mt-1">Review your profile and make sure everything looks good.</p>
        </div>

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

        {/* Incomplete sections with recommendation */}
        {incompleteSections.length > 0 && (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-900">Recommended but not required</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Completing these will help you get more matches with providers.
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
            onClick={handleGoLive}
            disabled={saving}
            className="w-full px-6 py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Going live...
              </span>
            ) : allComplete ? (
              "Go Live"
            ) : (
              "Skip & Go Live"
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full px-6 py-2.5 text-gray-500 hover:text-gray-900 font-medium transition-colors disabled:opacity-50"
          >
            Go back and complete profile
          </button>
        </div>
      </div>
    </Modal>
  );
}
