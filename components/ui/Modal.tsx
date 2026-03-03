"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Maximum width of the modal content. Default: "md" */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Optional back button handler. Shows a small circular back arrow in the header. */
  onBack?: () => void;
  /** Sticky footer content (pinned below scrollable body). */
  footer?: ReactNode;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-[640px]",
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
  footer,
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

  // Blur active element before closing to prevent scroll-to-footer.
  // When React removes the portal while an element inside has focus,
  // the browser scrolls to the next focusable element (footer links).
  // Blurring first means no focused element = no scroll.
  // See: docs/POSTMORTEMS.md "2026-02-25: Modal close scrolls page to footer"
  const handleClose = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== document.body) {
      (active as HTMLElement).blur();
    }
    onCloseRef.current();
  }, []);

  // Close on Escape key — uses ref so effect doesn't depend on onClose identity
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  }, [handleClose]);

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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
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
            handleClose();
          }
        }}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className={[
          "relative bg-white shadow-2xl w-full flex flex-col",
          // Mobile: bottom sheet
          "rounded-t-2xl max-h-[92vh] animate-sheet-up",
          // Desktop: centered modal
          "sm:rounded-2xl sm:min-h-[50vh] sm:max-h-[85vh] sm:animate-modal-pop",
          sizeClasses[size],
        ].join(" ")}
      >
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header — pinned top */}
        <div className="flex items-center gap-3 px-5 sm:px-7 pt-4 sm:pt-6 pb-0 shrink-0">
          {/* Back button */}
          {onBack && (
            <button
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
              aria-label="Go back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Title (left-aligned) */}
          {title ? (
            <h2 className="text-xl sm:text-[28px] font-semibold text-gray-900 flex-1">{title}</h2>
          ) : (
            <div className="flex-1" />
          )}

          {/* Close button */}
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className={`px-5 sm:px-7 pt-2 flex-1 min-h-0 overflow-y-auto ${footer ? "" : "pb-5 sm:pb-7"}`}>
          {children}
        </div>

        {/* Sticky footer — pinned bottom */}
        {footer && (
          <div className="px-5 sm:px-7 pb-5 sm:pb-7 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );

  // Portal to document.body so the modal is never inside a CSS-transformed
  // ancestor. CSS transforms create a new containing block, which causes
  // position:fixed to behave like position:absolute relative to that ancestor.
  return createPortal(modalContent, document.body);
}
