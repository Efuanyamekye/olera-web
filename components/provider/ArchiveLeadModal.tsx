"use client";

import { useState, useEffect } from "react";

const ARCHIVE_REASONS = [
  { value: "not_a_fit", label: "Not a good fit" },
  { value: "not_accepting_clients", label: "Not accepting new clients" },
  { value: "unable_to_reach", label: "Unable to reach" },
  { value: "other", label: "Other" },
];

interface ArchiveLeadModalProps {
  leadName: string;
  onClose: () => void;
  onSubmit: (reason: string, message: string) => Promise<void>;
}

export default function ArchiveLeadModal({
  leadName,
  onClose,
  onSubmit,
}: ArchiveLeadModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Handle close with animation
  function handleClose() {
    if (submitting) return;
    setIsVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSubmit() {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await onSubmit(selectedReason, message.trim());
      // onSubmit will close the modal, so no need to reset submitting
    } catch (error) {
      console.error("[ArchiveLeadModal] Submit failed:", error);
      setSubmitting(false);
      alert("Failed to archive lead. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Desktop: Centered modal */}
      <div className="hidden lg:flex items-center justify-center h-full">
        <div
          className={`relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden z-[90] transition-all duration-200 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Decline this inquiry</h2>
              <button
                onClick={handleClose}
                disabled={submitting}
                className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              We'll let <span className="font-medium text-gray-700">{leadName}</span> know you've declined and suggest other providers who might be a better fit.
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-3">
            {ARCHIVE_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                onClick={() => setSelectedReason(reason.value)}
                className={`w-full text-left px-4 py-3 rounded-xl text-[15px] border transition-all flex items-center gap-3 ${
                  selectedReason === reason.value
                    ? "bg-primary-50 border-primary-200 text-primary-900"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    selectedReason === reason.value
                      ? "border-primary-500 bg-primary-500"
                      : "border-gray-300"
                  }`}
                >
                  {selectedReason === reason.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
                {reason.label}
              </button>
            ))}

            {/* Message text area — shows when a reason is selected */}
            {selectedReason && (
              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Optional message for the care seeker
                  <span className="text-gray-400 font-normal ml-1">(helps them find a better fit)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a note to help them understand why this isn't the right match..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-300 focus:ring-1 focus:ring-gray-200 resize-none transition-all"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedReason || submitting}
              className="px-5 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {submitting ? "Declining..." : "Decline lead"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      <div className="lg:hidden flex items-end h-full">
        <div
          className={`relative w-full bg-white rounded-t-2xl shadow-2xl overflow-hidden z-[90] transition-transform duration-200 ease-out ${
            isVisible ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 pt-2 pb-4">
            <h2 className="text-xl font-bold text-gray-900">Decline this inquiry</h2>
            <p className="text-[15px] text-gray-500 mt-1">
              We'll let <span className="font-medium text-gray-700">{leadName}</span> know you've declined and suggest other providers who might be a better fit.
            </p>
          </div>

          {/* Body */}
          <div className="px-5 pb-4 space-y-2.5 max-h-[50vh] overflow-y-auto">
            {ARCHIVE_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                onClick={() => setSelectedReason(reason.value)}
                className={`w-full text-left px-4 py-3.5 rounded-xl text-[16px] border transition-all flex items-center gap-3 ${
                  selectedReason === reason.value
                    ? "bg-primary-50 border-primary-200 text-primary-900"
                    : "bg-white border-gray-200 text-gray-700 active:bg-gray-50"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    selectedReason === reason.value
                      ? "border-primary-500 bg-primary-500"
                      : "border-gray-300"
                  }`}
                >
                  {selectedReason === reason.value && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </span>
                {reason.label}
              </button>
            ))}

            {/* Message text area — shows when a reason is selected */}
            {selectedReason && (
              <div className="pt-2">
                <label className="block text-[15px] font-medium text-gray-700 mb-1.5">
                  Optional message
                  <span className="text-gray-400 font-normal ml-1">(helps them find a better fit)</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-300 focus:ring-1 focus:ring-gray-200 resize-none transition-all"
                />
              </div>
            )}
          </div>

          {/* Footer - safe area padding for iOS */}
          <div className="px-5 pt-3 pb-5 bg-gray-50 border-t border-gray-100 flex gap-3 safe-area-bottom">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-3.5 text-[15px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl active:bg-gray-50 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedReason || submitting}
              className="flex-1 px-4 py-3.5 bg-gray-900 active:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-xl transition-colors"
            >
              {submitting ? "Declining..." : "Decline lead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
