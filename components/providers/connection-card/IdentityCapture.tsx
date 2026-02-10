"use client";

import Pill from "./Pill";
import { CONTACT_OPTIONS, CARE_TYPE_LABELS, URGENCY_LABELS, RECIPIENT_LABELS } from "./constants";
import type { IntentData, IdentityData, ContactPreference } from "./types";

interface IdentityCaptureProps {
  providerName: string;
  intentData: IntentData;
  identityData: IdentityData;
  submitting: boolean;
  error: string;
  onEditIntent: () => void;
  onSetEmail: (val: string) => void;
  onSetFirstName: (val: string) => void;
  onSetLastName: (val: string) => void;
  onSetContactPref: (val: ContactPreference) => void;
  onSetPhone: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function IdentityCapture({
  providerName,
  intentData,
  identityData,
  submitting,
  error,
  onEditIntent,
  onSetEmail,
  onSetFirstName,
  onSetLastName,
  onSetContactPref,
  onSetPhone,
  onSubmit,
  onBack,
}: IdentityCaptureProps) {
  const { email, firstName, lastName, contactPreference, phone } = identityData;

  const needsPhone = contactPreference === "call" || contactPreference === "text";
  const canSubmit =
    email.trim() !== "" &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    contactPreference !== null &&
    (!needsPhone || phone.trim() !== "");

  // Build intent summary text
  const summaryLines = [
    intentData.careType ? CARE_TYPE_LABELS[intentData.careType] : null,
    [
      intentData.urgency ? URGENCY_LABELS[intentData.urgency] : null,
      intentData.careRecipient ? RECIPIENT_LABELS[intentData.careRecipient] : null,
    ]
      .filter(Boolean)
      .join(" \u00B7 "),
    intentData.additionalNotes || null,
  ].filter(Boolean);

  return (
    <>
      {/* Intent summary (collapsed) */}
      <div className="px-3 py-3 bg-gray-50 rounded-lg border border-gray-100 mb-4">
        {summaryLines.map((line, i) => (
          <p
            key={i}
            className={`text-[13px] ${
              i === 0 ? "font-semibold text-gray-800" : "text-gray-500"
            } ${i > 0 ? "mt-0.5" : ""} leading-relaxed`}
          >
            {line}
          </p>
        ))}
        <button
          onClick={onEditIntent}
          className="text-xs text-primary-600 font-medium mt-2 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors bg-transparent border-none cursor-pointer p-0"
        >
          Edit
        </button>
      </div>

      {/* Email */}
      <div className="mb-3">
        <label className="block text-[13px] font-medium text-gray-700 mb-1">
          Your email
        </label>
        <p className="text-[11px] text-gray-400 mb-1.5">
          So {providerName} can reach you
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => onSetEmail(e.target.value)}
          placeholder="email@example.com"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none focus:border-primary-600 transition-colors box-border"
        />
      </div>

      {/* AUTH_INTEGRATION_POINT
       * When auth is ready, insert verification step here.
       * Input: email address (string)
       * Expected output: verified session + existing profile data (if returning user)
       * If returning user with profile: skip profile basics, go to note + send
       * If new user: continue to profile basics
       */}

      {/* Name fields */}
      <div className="mb-3">
        <label className="block text-[13px] font-medium text-gray-700 mb-1">
          Your name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={firstName}
            onChange={(e) => onSetFirstName(e.target.value)}
            placeholder="First name"
            className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none focus:border-primary-600 transition-colors box-border"
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => onSetLastName(e.target.value)}
            placeholder="Last name"
            className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none focus:border-primary-600 transition-colors box-border"
          />
        </div>
      </div>

      {/* Contact preference */}
      <div className="mb-3">
        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
          How should the provider contact you?
        </label>
        <div className="flex gap-1.5">
          {CONTACT_OPTIONS.map((opt) => (
            <Pill
              key={opt.value}
              label={opt.label}
              selected={contactPreference === opt.value}
              onClick={() => onSetContactPref(opt.value)}
              small
            />
          ))}
        </div>
      </div>

      {/* Conditional phone field */}
      {needsPhone && (
        <div className="mb-4">
          <label className="block text-[13px] font-medium text-gray-700 mb-1">
            Phone number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => onSetPhone(e.target.value)}
            placeholder="(___) ___-____"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 outline-none focus:border-primary-600 transition-colors box-border"
          />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 text-red-700 px-3 py-2.5 rounded-lg text-[13px] mb-3">
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className={`w-full py-3.5 border-none rounded-[10px] text-[15px] font-semibold cursor-pointer transition-all duration-200 ${
          canSubmit && !submitting
            ? "bg-primary-600 text-white hover:bg-primary-500"
            : "bg-gray-200 text-gray-400 cursor-default"
        }`}
      >
        {submitting ? "Sending..." : "Send Connection Request"}
      </button>

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
