"use client";

import StepIndicator from "./StepIndicator";
import Pill from "./Pill";
import {
  URGENCY_OPTIONS,
  RECIPIENT_OPTIONS,
} from "./constants";
import type {
  IntentStep,
  IntentData,
  CareRecipient,
  UrgencyValue,
} from "./types";

interface IntentCaptureProps {
  intentStep: IntentStep;
  intentData: IntentData;
  onSelectRecipient: (val: CareRecipient) => void;
  onSelectUrgency: (val: UrgencyValue) => void;
  onConnect: () => void;
  submitting?: boolean;
  /** Total number of steps (2 for logged-in, 3 for guest) */
  totalSteps?: number;
}

export default function IntentCapture({
  intentStep,
  intentData,
  onSelectRecipient,
  onSelectUrgency,
  onConnect,
  submitting,
  totalSteps = 2,
}: IntentCaptureProps) {
  const { careRecipient, urgency } = intentData;

  const canConnect = urgency !== null && !submitting;

  return (
    <>
      <StepIndicator current={intentStep} total={totalSteps} />

      {/* Step 0: Who needs care? */}
      {intentStep === 0 && (
        <>
          <p className="text-[15px] font-semibold text-gray-800 mb-3">
            Who needs care?
          </p>
          <div className="flex flex-col gap-1.5 mb-4">
            {RECIPIENT_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                label={opt.label}
                selected={careRecipient === opt.value}
                onClick={() => onSelectRecipient(opt.value)}
              />
            ))}
          </div>
        </>
      )}

      {/* Step 1: When do you need care? */}
      {intentStep === 1 && (
        <>
          <p className="text-[15px] font-semibold text-gray-800 mb-3">
            When do you need care?
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {URGENCY_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                label={opt.label}
                selected={urgency === opt.value}
                onClick={() => onSelectUrgency(opt.value)}
              />
            ))}
          </div>
        </>
      )}

      {/* Connect button — visible on all steps */}
      <button
        onClick={onConnect}
        disabled={!canConnect}
        className={`w-full py-3.5 border-none rounded-[10px] text-[15px] font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 ${
          canConnect
            ? "bg-primary-600 text-white hover:bg-primary-500"
            : "bg-gray-100 text-gray-400 cursor-default"
        }`}
      >
        {submitting && (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {submitting ? "Connecting..." : "Connect"}
      </button>
    </>
  );
}
