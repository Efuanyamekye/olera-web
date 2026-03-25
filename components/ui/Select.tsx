"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

// ============================================================
// Types
// ============================================================

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  /** Options - can be strings or objects with value/label */
  options: (string | SelectOption)[];
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text when no value selected */
  placeholder?: string;
  /** Optional label above the select */
  label?: string;
  /** Show required indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Error state */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Additional class for the container */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Force dropdown direction (auto by default) */
  dropdownDirection?: "auto" | "down" | "up";
}

// ============================================================
// Helper to normalize options
// ============================================================

function normalizeOptions(options: (string | SelectOption)[]): SelectOption[] {
  return options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );
}

// ============================================================
// Component
// ============================================================

export default function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
  className = "",
  size = "md",
  dropdownDirection = "auto",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const labelId = useId();
  const listboxId = useId();

  const normalizedOptions = normalizeOptions(options);
  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Size classes
  const sizeClasses = {
    sm: "px-3 py-2 text-sm min-h-[40px]",
    md: "px-4 py-3 text-base min-h-[48px]",
    lg: "px-4 py-3.5 text-lg min-h-[52px]",
  };

  const optionSizeClasses = {
    sm: "px-3 py-2.5 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-4 py-3.5 text-lg",
  };

  // ────────────────────────────────────────────────────────────
  // Positioning
  // ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      if (dropdownDirection === "down") {
        setOpenUpward(false);
      } else if (dropdownDirection === "up") {
        setOpenUpward(true);
      } else {
        // Auto: calculate based on available space
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = Math.min(normalizedOptions.length * 48 + 16, 320);
        setOpenUpward(spaceBelow < dropdownHeight && rect.top > dropdownHeight);
      }
    }
  }, [isOpen, normalizedOptions.length, dropdownDirection]);

  // ────────────────────────────────────────────────────────────
  // Click outside
  // ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // ────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen && focusedIndex >= 0) {
            const opt = normalizedOptions[focusedIndex];
            if (!opt.disabled) {
              onChange(opt.value);
              setIsOpen(false);
              setFocusedIndex(-1);
              triggerRef.current?.focus();
            }
          } else {
            setIsOpen(!isOpen);
            if (!isOpen) {
              const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
              setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
            }
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setFocusedIndex(-1);
          triggerRef.current?.focus();
          break;

        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
            setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
          } else {
            setFocusedIndex((prev) => {
              let next = prev + 1;
              while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
                next++;
              }
              return next < normalizedOptions.length ? next : prev;
            });
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
            setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
          } else {
            setFocusedIndex((prev) => {
              let next = prev - 1;
              while (next >= 0 && normalizedOptions[next].disabled) {
                next--;
              }
              return next >= 0 ? next : prev;
            });
          }
          break;

        case "Home":
          e.preventDefault();
          if (isOpen) {
            const firstEnabled = normalizedOptions.findIndex((opt) => !opt.disabled);
            setFocusedIndex(firstEnabled >= 0 ? firstEnabled : 0);
          }
          break;

        case "End":
          e.preventDefault();
          if (isOpen) {
            let lastEnabled = normalizedOptions.length - 1;
            while (lastEnabled >= 0 && normalizedOptions[lastEnabled].disabled) {
              lastEnabled--;
            }
            setFocusedIndex(lastEnabled >= 0 ? lastEnabled : normalizedOptions.length - 1);
          }
          break;

        case "Tab":
          if (isOpen) {
            setIsOpen(false);
            setFocusedIndex(-1);
          }
          break;
      }
    },
    [disabled, isOpen, focusedIndex, normalizedOptions, value, onChange]
  );

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [isOpen, focusedIndex]);

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Label */}
      {label && (
        <label
          id={labelId}
          className="block text-base font-semibold text-gray-900 mb-2"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) {
              const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
              setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
            }
          }
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={[
          "w-full pr-10 rounded-xl border text-left transition-all cursor-pointer",
          sizeClasses[size],
          isOpen
            ? "border-primary-500 ring-2 ring-primary-500 bg-white"
            : error
              ? "border-red-300 bg-white"
              : "border-gray-200 bg-white hover:border-gray-300",
          disabled
            ? "opacity-50 cursor-not-allowed bg-gray-50"
            : "",
          !value ? "text-gray-400" : "text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
        ].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label ? labelId : undefined}
        aria-controls={listboxId}
        aria-invalid={error}
      >
        {selectedOption?.label || placeholder}
      </button>

      {/* Chevron icon */}
      <svg
        className={`absolute right-3.5 ${label ? "top-[calc(50%+12px)]" : "top-1/2"} -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-activedescendant={focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
          className={[
            "absolute left-0 right-0 z-50 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden max-h-[280px] overflow-y-auto",
            openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5",
          ].join(" ")}
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          {normalizedOptions.map((option, index) => {
            const isSelected = value === option.value;
            const isFocused = focusedIndex === index;

            return (
              <button
                key={option.value}
                ref={(el) => { optionRefs.current[index] = el; }}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                    setFocusedIndex(-1);
                    triggerRef.current?.focus();
                  }
                }}
                onMouseEnter={() => setFocusedIndex(index)}
                className={[
                  "w-full text-left transition-colors focus:outline-none",
                  optionSizeClasses[size],
                  isSelected
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : isFocused
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50",
                  option.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "",
                  index === 0 ? "rounded-t-xl" : "",
                  index === normalizedOptions.length - 1 ? "rounded-b-xl" : "",
                ].filter(Boolean).join(" ")}
              >
                <span className="flex items-center gap-2.5">
                  {isSelected ? (
                    <svg
                      className="w-4 h-4 text-primary-600 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{option.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error message */}
      {error && errorMessage && (
        <p className="mt-1.5 text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
