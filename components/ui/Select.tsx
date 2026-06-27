"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";

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
  /** Accessible label for screen readers (when no visible label) */
  ariaLabel?: string;
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
  /** Enable search/filter input in the dropdown */
  searchable?: boolean;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
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
  ariaLabel,
  required = false,
  disabled = false,
  error = false,
  errorMessage,
  className = "",
  size = "md",
  dropdownDirection = "auto",
  searchable = false,
  searchPlaceholder = "Search...",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  // Track client-side mount for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const labelId = useId();
  const listboxId = useId();

  const normalizedOptions = normalizeOptions(options);
  const filteredOptions = searchable && searchQuery
    ? normalizedOptions.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : normalizedOptions;
  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Size classes - matched to common input styling
  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2.5 text-base",
    lg: "px-4 py-3 text-lg",
  };

  const optionSizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2.5 text-base",
    lg: "px-4 py-3 text-lg",
  };

  // ────────────────────────────────────────────────────────────
  // Positioning
  // ────────────────────────────────────────────────────────────

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    } else if (searchable) {
      // Focus search input when opening
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = Math.min(filteredOptions.length * 48 + (searchable ? 56 : 16), 320);

      let shouldOpenUpward = false;
      if (dropdownDirection === "down") {
        shouldOpenUpward = false;
      } else if (dropdownDirection === "up") {
        shouldOpenUpward = true;
      } else {
        // Auto: calculate based on available space
        const spaceBelow = window.innerHeight - rect.bottom;
        shouldOpenUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
      }

      setOpenUpward(shouldOpenUpward);

      // Calculate fixed position for portal
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        ...(shouldOpenUpward
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    }
  }, [isOpen, filteredOptions.length, dropdownDirection, searchable]);

  // ────────────────────────────────────────────────────────────
  // Click outside
  // ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside BOTH the container AND the dropdown list
      // The dropdown is rendered via portal, so it's not inside containerRef
      const clickedInsideContainer = containerRef.current?.contains(e.target as Node);
      const clickedInsideDropdown = listRef.current?.contains(e.target as Node);

      if (!clickedInsideContainer && !clickedInsideDropdown) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    // Close dropdown when page scrolls to prevent floating dropdown issue.
    // But ignore scroll events from inside the dropdown itself (e.g., scrolling
    // through a long list of options).
    const handleScroll = (e: Event) => {
      const scrolledInsideDropdown = listRef.current?.contains(e.target as Node);
      if (!scrolledInsideDropdown) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  // ────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          if (isOpen && focusedIndex >= 0) {
            const opt = filteredOptions[focusedIndex];
            if (!opt.disabled) {
              onChange(opt.value);
              setIsOpen(false);
              setFocusedIndex(-1);
              triggerRef.current?.focus();
            }
          } else {
            setIsOpen(!isOpen);
            if (!isOpen) {
              const currentIndex = filteredOptions.findIndex((opt) => opt.value === value);
              setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
            }
          }
          break;

        case " ":
          // Don't intercept space when typing in search
          if (searchable && isOpen) return;
          e.preventDefault();
          if (isOpen && focusedIndex >= 0) {
            const opt = filteredOptions[focusedIndex];
            if (!opt.disabled) {
              onChange(opt.value);
              setIsOpen(false);
              setFocusedIndex(-1);
              triggerRef.current?.focus();
            }
          } else {
            setIsOpen(!isOpen);
            if (!isOpen) {
              const currentIndex = filteredOptions.findIndex((opt) => opt.value === value);
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
            const currentIndex = filteredOptions.findIndex((opt) => opt.value === value);
            setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
          } else {
            setFocusedIndex((prev) => {
              let next = prev + 1;
              while (next < filteredOptions.length && filteredOptions[next].disabled) {
                next++;
              }
              return next < filteredOptions.length ? next : prev;
            });
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            const currentIndex = filteredOptions.findIndex((opt) => opt.value === value);
            setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
          } else {
            setFocusedIndex((prev) => {
              let next = prev - 1;
              while (next >= 0 && filteredOptions[next].disabled) {
                next--;
              }
              return next >= 0 ? next : prev;
            });
          }
          break;

        case "Home":
          e.preventDefault();
          if (isOpen) {
            const firstEnabled = filteredOptions.findIndex((opt) => !opt.disabled);
            setFocusedIndex(firstEnabled >= 0 ? firstEnabled : 0);
          }
          break;

        case "End":
          e.preventDefault();
          if (isOpen) {
            let lastEnabled = filteredOptions.length - 1;
            while (lastEnabled >= 0 && filteredOptions[lastEnabled].disabled) {
              lastEnabled--;
            }
            setFocusedIndex(lastEnabled >= 0 ? lastEnabled : filteredOptions.length - 1);
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
    [disabled, isOpen, focusedIndex, filteredOptions, value, onChange, searchable]
  );

  // Scroll focused option into view (within the dropdown only, not the page)
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex] && listRef.current) {
      const option = optionRefs.current[focusedIndex];
      const list = listRef.current.querySelector('[class*="overflow-y-auto"]');
      if (option && list) {
        const optionRect = option.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();

        if (optionRect.top < listRect.top) {
          option.scrollIntoView({ block: "start", behavior: "instant" });
        } else if (optionRect.bottom > listRect.bottom) {
          option.scrollIntoView({ block: "end", behavior: "instant" });
        }
      }
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
          className="block text-[13px] font-semibold text-gray-700 mb-1.5"
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
          "w-full pr-10 rounded-lg border text-left transition-all cursor-pointer truncate",
          sizeClasses[size],
          isOpen
            ? "border-primary-400 ring-2 ring-primary-100 bg-white"
            : error
              ? "border-red-300 bg-white"
              : "border-gray-200 bg-white hover:border-gray-300",
          disabled
            ? "opacity-50 cursor-not-allowed bg-gray-100"
            : "",
          !value ? "text-gray-400" : "text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400",
        ].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={!label ? ariaLabel : undefined}
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

      {/* Dropdown menu - rendered in portal to escape overflow containers */}
      {isOpen && mounted && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-activedescendant={focusedIndex >= 0 ? `${listboxId}-option-${focusedIndex}` : undefined}
          className="z-[100] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden max-h-[320px] flex flex-col"
          style={{ ...dropdownStyle, animation: "fade-in 0.15s ease-out" }}
        >
          {/* Search input */}
          {searchable && (
            <div className="px-2 py-2 border-b border-gray-100 shrink-0">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setFocusedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 placeholder:text-gray-400"
                aria-label="Filter options"
              />
            </div>
          )}

          <div className="overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
            ) : (
              filteredOptions.map((option, index) => {
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
                      !searchable && index === 0 ? "rounded-t-lg" : "",
                      index === filteredOptions.length - 1 ? "rounded-b-lg" : "",
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
              })
            )}
          </div>
        </div>,
        document.body
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
