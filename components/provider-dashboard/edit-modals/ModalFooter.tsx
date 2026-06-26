interface ModalFooterProps {
  saving: boolean;
  hasChanges: boolean;
  onClose: () => void;
  onSave: () => void;
  /** Guided mode props */
  guidedMode?: boolean;
  guidedStep?: number;
  guidedTotal?: number;
  onGuidedBack?: () => void;
  /**
   * Show notice that edits won't be visible until verified.
   * Only set to true for directory-claimed providers (with source_provider_id)
   * who are unverified — their public page shows original directory data.
   * Native profiles (no source_provider_id) always show their data, so no notice needed.
   */
  showPendingVerificationNotice?: boolean;
}

export default function ModalFooter({
  saving,
  hasChanges,
  onClose,
  onSave,
  guidedMode,
  guidedStep = 1,
  guidedTotal = 1,
  onGuidedBack,
  showPendingVerificationNotice,
}: ModalFooterProps) {
  const isLastStep = guidedStep >= guidedTotal;

  if (guidedMode) {
    return (
      <div className="mt-6 border-t border-warm-100">
        {/* Progress segments */}
        <div className="flex gap-0.5 px-1 pt-4">
          {Array.from({ length: guidedTotal }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${
                i + 1 <= guidedStep ? "bg-primary-600" : "bg-warm-100"
              }`}
            />
          ))}
        </div>
        {showPendingVerificationNotice && (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Changes will be visible to families once verified.
          </p>
        )}
        <div className="flex items-center justify-between pt-4 pb-1">
          <div className="flex items-center gap-3">
            {onGuidedBack ? (
              <button
                type="button"
                onClick={onGuidedBack}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Skip
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-warm-400">
              {guidedStep} of {guidedTotal}
            </span>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving
                ? "Saving..."
                : isLastStep
                  ? "Finish"
                  : hasChanges
                    ? "Save & Next"
                    : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-5 border-t border-warm-100">
      {showPendingVerificationNotice && (
        <p className="text-xs text-amber-600 mb-3 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Changes will be visible to families once verified.
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !hasChanges}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
