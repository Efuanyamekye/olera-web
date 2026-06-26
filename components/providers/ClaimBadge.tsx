"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

interface ClaimBadgeProps {
  displayState: "unclaimed" | "verified" | "claimed";
  providerName: string;
  claimUrl: string;
}

export default function ClaimBadge({
  displayState,
  providerName,
  claimUrl,
}: ClaimBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHoveringBadge, setIsHoveringBadge] = useState(false);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const [isTapped, setIsTapped] = useState(false); // Track if opened via tap
  const wrapperRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  // Show tooltip when hovering badge or tooltip, OR when tapped
  useEffect(() => {
    if (isHoveringBadge || isHoveringTooltip || isTapped) {
      // Clear any pending hide timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setShowTooltip(true);
    } else {
      // Small delay before hiding to allow mouse to travel from badge to tooltip
      hideTimeoutRef.current = setTimeout(() => {
        setShowTooltip(false);
      }, 100);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHoveringBadge, isHoveringTooltip, isTapped]);

  // Close tooltip on outside tap/click (for mobile)
  useEffect(() => {
    if (!isTapped) return;
    const handleOutsideClick = (e: TouchEvent | MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsTapped(false);
      }
    };
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isTapped]);

  // Handle tap/click on badge
  const handleBadgeClick = useCallback(() => {
    setIsTapped((prev) => !prev);
  }, []);

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

  const handleBadgeEnter = useCallback(() => setIsHoveringBadge(true), []);
  const handleBadgeLeave = useCallback(() => setIsHoveringBadge(false), []);
  const handleTooltipEnter = useCallback(() => setIsHoveringTooltip(true), []);
  const handleTooltipLeave = useCallback(() => setIsHoveringTooltip(false), []);

  // Badge configuration based on display state
  const badgeConfig = {
    unclaimed: {
      label: "Unclaimed",
      bgClass: "bg-white/90 text-gray-600",
      icon: (
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
      ),
    },
    verified: {
      label: "Verified",
      bgClass: "bg-white/90 text-primary-700",
      icon: (
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
      ),
    },
    claimed: {
      label: "Claimed",
      bgClass: "bg-white/90 text-gray-600",
      icon: (
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
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      ),
    },
  };

  const config = badgeConfig[displayState];

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleBadgeEnter}
      onMouseLeave={handleBadgeLeave}
    >
      {/* Badge */}
      <button
        ref={badgeRef}
        type="button"
        onClick={handleBadgeClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${config.bgClass}`}
      >
        {config.icon}
        {config.label}
      </button>

      {/* Tooltip — uses fixed positioning to escape overflow-hidden containers */}
      {showTooltip && (
        <div
          className="fixed z-50 w-64"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="bg-gray-900 text-white rounded-lg px-4 py-3 text-[13px] leading-relaxed shadow-lg">
            {displayState === "verified" ? (
              <p>
                This listing has been verified and is managed by{" "}
                <span className="font-medium">{providerName}</span>. Information
                is kept up to date.
              </p>
            ) : displayState === "claimed" ? (
              <>
                <p className="mb-2">
                  This listing is claimed but not yet verified.
                </p>
                <Link
                  href={claimUrl}
                  className="inline-flex items-center gap-1 text-primary-300 hover:text-primary-200 font-medium transition-colors"
                >
                  Are you the owner? Manage this page
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
                  Are you the owner? Manage this page
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
