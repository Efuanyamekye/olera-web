"use client";

import Link from "next/link";
import PhoneButton from "./PhoneButton";

interface PendingStateProps {
  providerName: string;
  phone: string | null;
  requestDate: string | null;
}

export default function PendingState({
  providerName,
  phone,
  requestDate,
}: PendingStateProps) {
  const dateStr = requestDate
    ? new Date(requestDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "recently";

  return (
    <>
      {/* Status banner */}
      <div className="px-4 py-5 bg-gray-50 rounded-[10px] text-center mb-4 border border-gray-100">
        <p className="text-sm font-semibold text-gray-800 mb-1.5">
          &check; Request sent {dateStr}
        </p>
        <p className="text-[13px] text-gray-500">
          Waiting for {providerName} to respond
        </p>
      </div>

      {/* Phone — fully revealed (already connected) */}
      <PhoneButton phone={phone} revealed onReveal={() => {}} />

      {/* View connections */}
      <Link
        href="/portal/connections"
        className="block w-full mt-2 py-3 border border-gray-200 rounded-[10px] text-sm font-medium text-primary-600 text-center hover:bg-gray-50 transition-colors"
      >
        View Your Connections
      </Link>
    </>
  );
}
