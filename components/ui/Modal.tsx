"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Maximum width of the modal content. Default: "md" */
  size?: "sm" | "md" | "lg";
  /** Optional back button handler. Shows a small circular back arrow in the header. */
  onBack?: () => void;
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
  onBack,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Stable ref for onClose — prevents useEffect from re-running
  // when onClose identity changes between renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Track client-side mount for createPortal (SSR-safe)
  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop - uses onMouseDown to prevent drag-and-release closes */}
      <div
        className="absolute inset-0 bg-gray-900/50 animate-fade-in"
        onMouseDown={(e) => {
          // Only close if the mousedown started on the backdrop itself
          if (e.target === e.currentTarget) {
            onCloseRef.current();
          }
        }}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className={[
          "relative bg-white rounded-2xl shadow-2xl w-full",
          "animate-slide-up",
          sizeClasses[size],
        ].join(" ")}
      >
        {/* Header — always show back/close buttons */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          {/* Back button (left) */}
          {onBack ? (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Go back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div className="w-8" />
          )}

          {/* Title (center) */}
          {title ? (
            <h2 className="text-xl font-semibold text-gray-900 text-center flex-1">{title}</h2>
          ) : (
            <div className="flex-1" />
          )}

          {/* Close button (right) */}
          <button
            onClick={() => onCloseRef.current()}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-7 pb-7 pt-2">{children}</div>
      </div>
    </div>
  );

  // Portal to document.body so the modal is never inside a CSS-transformed
  // ancestor. CSS transforms create a new containing block, which causes
  // position:fixed to behave like position:absolute relative to that ancestor.
  return createPortal(modalContent, document.body);
}
