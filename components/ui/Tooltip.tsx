"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

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
 * - Renders via portal to avoid clipping by parent containers
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
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [actualPosition, setActualPosition] = useState(position);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchDevice = useRef(false);

  // Only render portal on client
  useEffect(() => {
    setMounted(true);
    isTouchDevice.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  // Calculate position using fixed positioning
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 12; // Min distance from viewport edge
    const gap = 8; // Gap between trigger and tooltip

    // Vertical positioning - flip if needed
    let verticalPosition = position;
    if (position === "top") {
      const spaceAbove = triggerRect.top;
      if (spaceAbove < tooltipRect.height + gap + padding) {
        verticalPosition = "bottom";
      }
    } else {
      const spaceBelow = viewportHeight - triggerRect.bottom;
      if (spaceBelow < tooltipRect.height + gap + padding) {
        verticalPosition = "top";
      }
    }
    setActualPosition(verticalPosition);

    // Calculate vertical position
    let top: number;
    if (verticalPosition === "top") {
      top = triggerRect.top - tooltipRect.height - gap;
    } else {
      top = triggerRect.bottom + gap;
    }

    // Horizontal positioning - center on trigger, but clamp to viewport
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    let left = triggerCenter - tooltipRect.width / 2;

    // Clamp to viewport edges
    if (left < padding) {
      left = padding;
    } else if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - padding - tooltipRect.width;
    }

    // Calculate arrow position (always points to trigger center)
    const arrowLeft = triggerCenter - left;

    setTooltipStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? "translateY(0)" : "translateY(4px)",
      pointerEvents: isVisible ? "auto" : "none",
    });

    setArrowStyle({
      left: `${arrowLeft}px`,
    });
  }, [position, isVisible]);

  // Update position when visible
  useEffect(() => {
    if (isVisible) {
      // Initial position calculation
      updatePosition();
      // Recalculate on scroll/resize
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

  const arrowClasses = actualPosition === "top"
    ? "top-full border-t-gray-900"
    : "bottom-full border-b-gray-900 rotate-180";

  // Tooltip element - rendered via portal to escape clipping containers
  const tooltipElement = (
    <div
      ref={tooltipRef}
      role="tooltip"
      style={tooltipStyle}
      className={`
        max-w-[280px] w-max px-3 py-2
        bg-gray-900 text-white text-[13px] leading-relaxed
        rounded-lg shadow-lg
        transition-all duration-150 ease-out
        z-[9999]
      `}
    >
      {content}

      {/* Arrow - positioned to point at trigger */}
      <div
        style={arrowStyle}
        className={`
          absolute ${arrowClasses}
          -translate-x-1/2
          w-0 h-0
          border-l-[6px] border-r-[6px] border-t-[6px]
          border-l-transparent border-r-transparent
        `}
      />
    </div>
  );

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={!isTouchDevice.current ? showTooltip : undefined}
      onMouseLeave={!isTouchDevice.current ? hideTooltip : undefined}
      onTouchStart={handleTouchStart}
    >
      {children}

      {/* Render tooltip via portal to document.body */}
      {mounted && createPortal(tooltipElement, document.body)}
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
