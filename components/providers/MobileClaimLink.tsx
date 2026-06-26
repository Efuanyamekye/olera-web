"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface MobileClaimLinkProps {
  displayState: "unclaimed" | "verified" | "claimed";
  providerName: string;
  claimUrl: string;
}

export default function MobileClaimLink({
  displayState,
  providerName,
  claimUrl,
}: MobileClaimLinkProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside tap
  useEffect(() => {
    if (!showTooltip) return;
    const handleTap = (e: TouchEvent | MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("touchstart", handleTap);
    document.addEventListener("mousedown", handleTap);
    return () => {
      document.removeEventListener("touchstart", handleTap);
      document.removeEventListener("mousedown", handleTap);
    };
  }, [showTooltip]);

  // Configuration based on display state
  const stateConfig = {
    unclaimed: {
      label: "Unclaimed listing",
      textClass: "text-gray-500",
      icon: (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
    },
    verified: {
      label: "Verified listing",
      textClass: "text-primary-600",
      icon: (
        <svg className="w-4 h-4 text-primary-500" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307z" clipRule="evenodd" />
        </svg>
      ),
    },
    claimed: {
      label: "Claimed listing",
      textClass: "text-gray-500",
      icon: (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
    },
  };

  const config = stateConfig[displayState];

  return (
    <div className="md:hidden mt-3 relative inline-flex" ref={tooltipRef}>
      <button
        type="button"
        onClick={() => setShowTooltip((prev) => !prev)}
        className={`text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors ${config.textClass}`}
      >
        {config.icon}
        <span className="underline underline-offset-2 decoration-gray-300">
          {config.label}
        </span>
      </button>

      {showTooltip && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-w-[min(16rem,calc(100vw-2rem))]">
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-lg leading-relaxed">
            {displayState === "verified" ? (
              <p>
                This listing has been verified and is managed by{" "}
                <span className="font-medium">{providerName}</span>. Information is kept up to date.
              </p>
            ) : displayState === "claimed" ? (
              <>
                <p>This listing is claimed but not yet verified.</p>
                <Link
                  href={claimUrl}
                  className="inline-flex items-center gap-1 text-primary-300 hover:text-primary-200 font-medium mt-1.5 transition-colors"
                >
                  Are you the owner? Manage this page
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </>
            ) : (
              <>
                <p>This listing hasn&apos;t been claimed yet. Information may be outdated.</p>
                <Link
                  href={claimUrl}
                  className="inline-flex items-center gap-1 text-primary-300 hover:text-primary-200 font-medium mt-1.5 transition-colors"
                >
                  Are you the owner? Manage this page
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
