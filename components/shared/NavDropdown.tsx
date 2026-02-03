"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { NavCategory } from "./NavMenuData";

interface NavDropdownProps {
  category: NavCategory;
  onNavigate?: () => void;
}

export default function NavDropdown({ category, onNavigate }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, [clearCloseTimer]);

  const handleEnter = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-gray-700 hover:text-primary-600 text-[15px] font-medium transition-colors focus:outline-none focus:underline py-1"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {category.label}
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
          {category.items.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="block px-5 py-3 hover:bg-gray-50 transition-colors group"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              <span className="block text-[15px] font-medium text-gray-900 group-hover:text-primary-600">
                {item.label}
              </span>
              <span className="block text-sm text-gray-500 mt-0.5">
                {item.description}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
