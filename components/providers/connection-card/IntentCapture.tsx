"use client";

import StepIndicator from "./StepIndicator";
import CompletedAnswer from "./CompletedAnswer";
import Pill from "./Pill";
import {
  CARE_TYPE_LABELS,
  URGENCY_OPTIONS,
  RECIPIENT_OPTIONS,
  RECIPIENT_LABELS,
} from "./constants";
import type {
  IntentStep,
  IntentData,
  CareRecipient,
  CareTypeValue,
  UrgencyValue,
} from "./types";

interface IntentCaptureProps {
  providerName: string;
  intentStep: IntentStep;
  intentData: IntentData;
  availableCareTypes: CareTypeValue[];
  onSetRecipient: (val: CareRecipient) => void;
  onSetCareType: (val: CareTypeValue) => void;
  onSetUrgency: (val: UrgencyValue) => void;
  onSetNotes: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onEditStep: (step: IntentStep) => void;
}

export default function IntentCapture({
  providerName,
  intentStep,
  intentData,
  availableCareTypes,
  onSetRecipient,
  onSetCareType,
  onSetUrgency,
  onSetNotes,
  onNext,
  onBack,
  onEditStep,
}: IntentCaptureProps) {
  const { careRecipient, careType, urgency, additionalNotes } = intentData;

  const isResearching = urgency === "researching";

  // Determine if the Next/Continue button should be enabled
  const canProceed =
    intentStep === 0
      ? careRecipient !== null
      : intentStep === 1
      ? careType !== null
      : urgency !== null;

  return (
    <>
      <StepIndicator current={intentStep} total={3} />

      {/* Completed answers from previous steps */}
      {intentStep > 0 && careRecipient && (
        <CompletedAnswer
          label="Who needs care"
          value={RECIPIENT_LABELS[careRecipient] || careRecipient}
          onEdit={() => onEditStep(0)}
        />
      )}
      {intentStep > 1 && careType && (
        <CompletedAnswer
          label="Type of help"
          value={CARE_TYPE_LABELS[careType] || careType}
          onEdit={() => onEditStep(1)}
        />
      )}

      {/* Step 0: Who needs care? */}
      {intentStep === 0 && (
        <>
          <p className="text-[13px] font-medium text-gray-700 mt-1 mb-2.5">
            Who needs care?
          </p>
          <div className="flex gap-2 mb-4">
            {RECIPIENT_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                label={opt.label}
                selected={careRecipient === opt.value}
                onClick={() => onSetRecipient(opt.value)}
              />
            ))}
          </div>
          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`w-full py-3.5 border-none rounded-[10px] text-sm font-semibold cursor-pointer transition-all duration-200 ${
              canProceed
                ? "bg-primary-600 text-white hover:bg-primary-500"
                : "bg-gray-200 text-gray-400 cursor-default"
            }`}
          >
            Next
          </button>
        </>
      )}

      {/* Step 1: What kind of help? */}
      {intentStep === 1 && (
        <>
          <p className="text-[13px] font-medium text-gray-700 mt-1 mb-2.5">
            What kind of help are you looking for?
          </p>
          <div className="flex flex-col gap-1.5 mb-4">
            {availableCareTypes.map((ct) => (
              <Pill
                key={ct}
                label={CARE_TYPE_LABELS[ct] || ct}
                selected={careType === ct}
                onClick={() => onSetCareType(ct)}
              />
            ))}
          </div>
          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`w-full py-3.5 border-none rounded-[10px] text-sm font-semibold cursor-pointer transition-all duration-200 ${
              canProceed
                ? "bg-primary-600 text-white hover:bg-primary-500"
                : "bg-gray-200 text-gray-400 cursor-default"
            }`}
          >
            Next
          </button>
        </>
      )}

      {/* Step 2: How soon + anything else? */}
      {intentStep === 2 && (
        <>
          <p className="text-[13px] font-medium text-gray-700 mt-1 mb-2.5">
            How soon do you need care?
          </p>
          <div className="grid grid-cols-2 gap-1.5 mb-3.5">
            {URGENCY_OPTIONS.map((opt) => (
              <Pill
                key={opt.value}
                label={opt.label}
                selected={urgency === opt.value}
                onClick={() => onSetUrgency(opt.value)}
              />
            ))}
          </div>

          <p className="text-[13px] font-medium text-gray-700 mb-1">
            Anything else the provider should know?{" "}
            <span className="font-normal text-gray-400 italic">(optional)</span>
          </p>
          <textarea
            value={additionalNotes}
            onChange={(e) => onSetNotes(e.target.value)}
            maxLength={500}
            placeholder="e.g., My mom needs help 3 mornings a week, mostly with getting ready and meals..."
            className="w-full px-3 py-3 rounded-lg border border-gray-200 text-[13px] text-gray-700 resize-none h-16 outline-none focus:border-primary-600 transition-colors mb-4 box-border"
          />

          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`w-full py-3.5 border-none rounded-[10px] text-sm font-semibold cursor-pointer transition-all duration-200 ${
              canProceed
                ? "bg-primary-600 text-white hover:bg-primary-500"
                : "bg-gray-200 text-gray-400 cursor-default"
            }`}
          >
            {isResearching
              ? `Save ${providerName} for later`
              : "Continue"}
          </button>
        </>
      )}

      {/* Back link */}
      <button
        onClick={onBack}
        className="block w-full text-center text-xs text-gray-400 mt-3 cursor-pointer bg-transparent border-none hover:text-gray-500 transition-colors"
      >
        &larr; Back
      </button>
    </>
  );
}
