"use client";

// Not reachable until auth is integrated.
// This state is built for visual completeness and future integration.
// When auth is ready, this will show for logged-in users who already have
// a care seeker profile — providing a compact summary with 1-click send.

import { useState } from "react";
import CompletedAnswer from "./CompletedAnswer";
import PhoneButton from "./PhoneButton";

interface ReturningUserStateProps {
  providerName: string;
  phone: string | null;
  // In the future, these will come from the user's profile:
  careType: string;
  careRecipient: string;
  urgency: string;
  contactInfo: string;
  additionalNotes: string;
  onSend: () => void;
  submitting: boolean;
}

export default function ReturningUserState({
  providerName,
  phone,
  careType,
  careRecipient,
  urgency,
  contactInfo,
  additionalNotes,
  onSend,
  submitting,
}: ReturningUserStateProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    // Collapsed — compact summary + Send
    return (
      <>
        <div className="px-3.5 py-3.5 bg-gray-50 rounded-[10px] mb-3.5 border border-gray-100">
          <p className="text-sm font-semibold text-gray-800">{careType}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {careRecipient} &middot; {urgency}
            <br />
            {contactInfo}
          </p>
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-primary-600 font-medium mt-2 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            Edit details
          </button>
        </div>

        <button
          onClick={onSend}
          disabled={submitting}
          className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 text-white border-none rounded-[10px] text-[15px] font-semibold cursor-pointer transition-colors"
        >
          {submitting ? "Sending..." : "Send Connection Request"}
        </button>

        <div className="mt-2.5">
          <PhoneButton phone={phone} revealed onReveal={() => {}} />
        </div>
      </>
    );
  }

  // Expanded — per-field editing
  return (
    <>
      <CompletedAnswer
        label="Who needs care"
        value={careRecipient}
        onEdit={() => {}}
      />
      <CompletedAnswer
        label="Type of help"
        value={careType}
        onEdit={() => {}}
      />
      <CompletedAnswer label="How soon" value={urgency} onEdit={() => {}} />
      <CompletedAnswer
        label="Contact preference"
        value={contactInfo}
        onEdit={() => {}}
      />

      <div className="mt-3 mb-3">
        <p className="text-[13px] font-medium text-gray-700 mb-1">
          Additional notes{" "}
          <span className="font-normal text-gray-400 italic">(optional)</span>
        </p>
        <textarea
          defaultValue={additionalNotes}
          className="w-full px-3 py-3 rounded-lg border border-gray-200 text-[13px] text-gray-700 resize-none h-14 outline-none focus:border-primary-600 transition-colors box-border"
        />
      </div>

      <button
        onClick={onSend}
        disabled={submitting}
        className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 text-white border-none rounded-[10px] text-[15px] font-semibold cursor-pointer transition-colors mt-3"
      >
        {submitting ? "Sending..." : "Send Connection Request"}
      </button>

      <button
        onClick={() => setExpanded(false)}
        className="block w-full text-center text-xs text-gray-400 mt-2.5 cursor-pointer bg-transparent border-none hover:text-gray-500 transition-colors"
      >
        &larr; Collapse
      </button>
    </>
  );
}
