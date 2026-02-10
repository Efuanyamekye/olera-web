"use client";

import Link from "next/link";
import PhoneButton from "./PhoneButton";

interface ConfirmationStateProps {
  providerName: string;
  phone: string | null;
  responseTime: string | null;
  notificationEmail: string;
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary-600"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function ConfirmationState({
  providerName,
  phone,
  responseTime,
  notificationEmail,
}: ConfirmationStateProps) {
  return (
    <>
      {/* Success banner */}
      <div className="px-4 py-5 bg-primary-50 rounded-[10px] text-center mb-4">
        <div className="mb-2.5">
          <CheckIcon />
        </div>
        <p className="text-[15px] font-semibold text-gray-900 mb-2">
          Request sent to {providerName}
        </p>
        <p className="text-[13px] text-gray-600 leading-relaxed">
          {responseTime && (
            <>
              They usually respond within {responseTime}.
              <br />
            </>
          )}
          We&apos;ll notify you at {notificationEmail}
        </p>
      </div>

      {/* Phone — now fully revealed */}
      <PhoneButton phone={phone} revealed onReveal={() => {}} />

      {/* View connections */}
      <Link
        href="/portal/connections"
        className="block w-full mt-2 py-3 border border-gray-200 rounded-[10px] text-sm font-medium text-primary-600 text-center hover:bg-gray-50 transition-colors"
      >
        View Your Connections
      </Link>

      {/* Browse similar */}
      <Link
        href="/browse"
        className="block w-full text-center text-[13px] text-primary-600 font-medium mt-3.5 underline decoration-primary-600/25 underline-offset-2 hover:decoration-primary-600/50 transition-colors"
      >
        Browse similar providers nearby &rarr;
      </Link>
    </>
  );
}
