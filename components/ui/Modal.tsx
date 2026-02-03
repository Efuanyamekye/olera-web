"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Maximum width of the modal content. Default: "md" */
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/**
 * Measure scrollbar width so we can compensate when hiding overflow.
 * Without this, hiding the scrollbar causes a ~17px layout shift.
 */
function getScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Stable ref for onClose — prevents useEffect from re-running
  // when onClose identity changes between renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Close on Escape key — uses ref so effect doesn't depend on onClose identity
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
    }
  }, []);

  // Keyboard listener + scroll lock — only re-runs when isOpen changes.
  // Compensates for scrollbar width to prevent layout shift.
  useEffect(() => {
    if (!isOpen) return;

    const scrollbarWidth = getScrollbarWidth();

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen, handleKeyDown]);

  // Auto-focus first focusable element — only on initial open
  useEffect(() => {
    if (!isOpen) return;

    // Small delay so the DOM has settled after render
    const timer = setTimeout(() => {
      const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button[type="submit"]'
      );
      firstFocusable?.focus();
    }, 50);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        // Close when clicking the overlay (not the content)
        if (e.target === overlayRef.current) {
          onCloseRef.current();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/50 animate-fade-in" />

      {/* Content */}
      <div
        ref={contentRef}
        className={[
          "relative bg-white rounded-xl shadow-xl w-full",
          "animate-slide-up",
          sizeClasses[size],
        ].join(" ")}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <button
              onClick={() => onCloseRef.current()}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>
  );
}
