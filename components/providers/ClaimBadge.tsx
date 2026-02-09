"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface ClaimBadgeProps {
  claimState: "unclaimed" | "pending" | "claimed" | "rejected";
  providerName: string;
  claimUrl: string;
}

export default function ClaimBadge({
  claimState,
  providerName,
  claimUrl,
}: ClaimBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const isClaimed = claimState === "claimed";

  // Calculate fixed position for tooltip so it escapes overflow-hidden
  useEffect(() => {
    if (showTooltip && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 8, // 8px gap below badge
        left: rect.left,
      });
    }
  }, [showTooltip]);

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Badge */}
      <button
        ref={badgeRef}
        type="button"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${
          isClaimed
            ? "bg-white/90 text-primary-700"
            : "bg-white/90 text-gray-600"
        }`}
      >
        {isClaimed ? (
          <svg
            className="w-3.5 h-3.5 text-primary-600"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        )}
        {isClaimed ? "Claimed" : "Unclaimed"}
      </button>

      {/* Tooltip — uses fixed positioning to escape overflow-hidden containers */}
      {showTooltip && (
        <div
          className="fixed z-50 w-64"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
          }}
        >
          <div className="bg-gray-900 text-white rounded-lg px-4 py-3 text-[13px] leading-relaxed shadow-lg">
            {isClaimed ? (
              <p>
                This listing is managed by{" "}
                <span className="font-medium">{providerName}</span>. Information
                is kept up to date by the provider.
              </p>
            ) : (
              <>
                <p className="mb-2">
                  This listing hasn&apos;t been claimed yet. Information may be
                  outdated.
                </p>
                <Link
                  href={claimUrl}
                  className="inline-flex items-center gap-1 text-primary-300 hover:text-primary-200 font-medium transition-colors"
                >
                  Are you the owner? Claim this page
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </>
            )}
            {/* Tooltip arrow — points up */}
            <div className="absolute bottom-full left-6 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-gray-900" />
          </div>
        </div>
      )}
    </div>
  );
}
