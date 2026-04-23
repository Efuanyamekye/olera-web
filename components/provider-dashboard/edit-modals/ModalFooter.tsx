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
  /** Verification gating props */
  isVerified?: boolean;
  onVerifyClick?: () => void;
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
  isVerified = true,
  onVerifyClick,
}: ModalFooterProps) {
  const isLastStep = guidedStep >= guidedTotal;

  // In guided mode, gate saving only when there are changes and user is unverified
  const guidedShowVerifyToSave = !isVerified && hasChanges && onVerifyClick;

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
            {guidedShowVerifyToSave ? (
              <button
                type="button"
                onClick={onVerifyClick}
                className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
                Verify to save
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    );
  }

  // If unverified and has changes, show "Verify to save" button
  const showVerifyToSave = !isVerified && hasChanges && onVerifyClick;

  return (
    <div className="mt-6 pt-5 border-t border-warm-100 flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
      >
        Cancel
      </button>
      {showVerifyToSave ? (
        <button
          type="button"
          onClick={onVerifyClick}
          className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          Verify to save
        </button>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !hasChanges}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      )}
    </div>
  );
}
