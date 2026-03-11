"use client";

import { useState, useCallback } from "react";
import StepIndicator from "./StepIndicator";
import { RECIPIENT_LABELS, URGENCY_LABELS } from "./constants";
import type { IntentData } from "./types";

interface EmailCaptureProps {
  intentData: IntentData;
  onSubmit: (email: string) => void;
  onBack: () => void;
  submitting?: boolean;
  error?: string;
}

export default function EmailCapture({
  intentData,
  onSubmit,
  onBack,
  submitting,
  error,
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [localError, setLocalError] = useState("");

  const recipientLabel = intentData.careRecipient
    ? RECIPIENT_LABELS[intentData.careRecipient]
    : "";
  const urgencyLabel = intentData.urgency
    ? URGENCY_LABELS[intentData.urgency]
    : "";

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = useCallback(() => {
    setLocalError("");

    // Honeypot check — if filled, silently "succeed" but don't submit
    if (honeypot) {
      return;
    }

    if (!email.trim()) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (!validateEmail(email)) {
      setLocalError("Please enter a valid email address.");
      return;
    }

    onSubmit(email.trim().toLowerCase());
  }, [email, honeypot, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, submitting]
  );

  const canSubmit = email.trim().length > 0 && !submitting;
  const displayError = error || localError;

  return (
    <>
      <StepIndicator current={2} total={3} />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {recipientLabel && (
          <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
            {recipientLabel}
          </span>
        )}
        {urgencyLabel && (
          <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
            {urgencyLabel}
          </span>
        )}
      </div>

      <p className="text-[15px] font-semibold text-gray-800 mb-3">
        How can we reach you?
      </p>

      {/* Email input */}
      <div className="mb-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Email address"
          autoComplete="email"
          autoFocus
          className={`w-full px-4 py-3 border rounded-[10px] text-[15px] text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-all ${
            displayError ? "border-red-300" : "border-gray-200"
          }`}
        />

        {/* Honeypot field — hidden from users, filled by bots */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ display: "none" }}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />

        {displayError && (
          <p className="text-xs text-red-600 mt-1.5" role="alert">
            {displayError}
          </p>
        )}
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-500 mb-3">
        We&apos;ll email you a link.
      </p>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3.5 border-none rounded-[10px] text-[15px] font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 ${
          canSubmit
            ? "bg-primary-600 text-white hover:bg-primary-500"
            : "bg-gray-100 text-gray-400 cursor-default"
        }`}
      >
        {submitting && (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {submitting ? "Connecting..." : "Connect"}
      </button>

      {/* Back link */}
      <button
        onClick={onBack}
        disabled={submitting}
        className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer"
      >
        Edit details
      </button>
    </>
  );
}
