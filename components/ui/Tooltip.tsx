"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface TooltipProps {
  /** The content to display in the tooltip */
  content: string;
  /** The element that triggers the tooltip */
  children: React.ReactNode;
  /** Position preference (will flip if not enough space) */
  position?: "top" | "bottom";
  /** Delay before showing tooltip on hover (ms) */
  delay?: number;
  /** Additional class for the wrapper */
  className?: string;
}

/**
 * A polished tooltip component that works on both desktop (hover) and mobile (tap).
 *
 * Features:
 * - Hover on desktop with configurable delay
 * - Tap to toggle on mobile (tap outside to close)
 * - Smart positioning (flips if not enough space)
 * - Smooth fade animation
 * - Apple-inspired design
 *
 * Usage:
 * ```tsx
 * <Tooltip content="This is a helpful explanation">
 *   <button>Hover me</button>
 * </Tooltip>
 * ```
 */
export function Tooltip({
  content,
  children,
  position = "top",
  delay = 300,
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchDevice = useRef(false);

  // Detect touch device
  useEffect(() => {
    isTouchDevice.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  // Calculate position and flip if needed
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 12; // Min distance from viewport edge

    // Vertical positioning - flip if needed
    if (position === "top") {
      const spaceAbove = triggerRect.top;
      if (spaceAbove < tooltipRect.height + padding) {
        setActualPosition("bottom");
      } else {
        setActualPosition("top");
      }
    } else {
      const spaceBelow = viewportHeight - triggerRect.bottom;
      if (spaceBelow < tooltipRect.height + padding) {
        setActualPosition("top");
      } else {
        setActualPosition("bottom");
      }
    }

    // Horizontal positioning - shift if overflowing
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const tooltipHalfWidth = tooltipRect.width / 2;

    // Check right overflow
    const rightEdge = triggerCenter + tooltipHalfWidth;
    if (rightEdge > viewportWidth - padding) {
      setHorizontalOffset(viewportWidth - padding - rightEdge);
    }
    // Check left overflow
    else if (triggerCenter - tooltipHalfWidth < padding) {
      setHorizontalOffset(padding - (triggerCenter - tooltipHalfWidth));
    }
    // No overflow - center it
    else {
      setHorizontalOffset(0);
    }
  }, [position]);

  // Update position when visible
  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isVisible, updatePosition]);

  // Handle click outside to close on mobile
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isVisible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // On touch devices, toggle visibility
    e.preventDefault();
    setIsVisible((prev) => !prev);
  }, []);

  const positionClasses = actualPosition === "top"
    ? "bottom-full mb-2"
    : "top-full mt-2";

  const arrowClasses = actualPosition === "top"
    ? "top-full border-t-gray-900"
    : "bottom-full border-b-gray-900 rotate-180";

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={!isTouchDevice.current ? showTooltip : undefined}
      onMouseLeave={!isTouchDevice.current ? hideTooltip : undefined}
      onTouchStart={handleTouchStart}
    >
      {children}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{
          transform: `translateX(calc(-50% + ${horizontalOffset}px)) ${isVisible ? "translateY(0)" : "translateY(4px)"}`,
        }}
        className={`
          absolute left-1/2 ${positionClasses}
          max-w-[280px] w-max px-3 py-2
          bg-gray-900 text-white text-[13px] leading-relaxed
          rounded-lg shadow-lg
          transition-all duration-150 ease-out
          ${isVisible
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
          }
          z-50
        `}
      >
        {content}

        {/* Arrow - stays centered on trigger */}
        <div
          style={{
            transform: `translateX(calc(-50% - ${horizontalOffset}px))`,
          }}
          className={`
            absolute left-1/2 ${arrowClasses}
            w-0 h-0
            border-l-[6px] border-r-[6px] border-t-[6px]
            border-l-transparent border-r-transparent
          `}
        />
      </div>
    </div>
  );
}

/**
 * A variant that shows tooltip on a subtle info icon next to the label.
 * Useful for form fields or compact UI where inline explanations are needed.
 */
export function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={content} delay={200}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="More info"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
      </button>
    </Tooltip>
  );
}
