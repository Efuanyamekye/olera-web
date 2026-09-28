"use client";

/**
 * ProviderFilters - Filter popover for lead scoring and care type filtering
 *
 * Allows filtering providers by:
 * - Profile completeness bands: 70%+ (Hot), 50-69% (Warm), <50% (Cold)
 * - Care types: Home Care, Assisted Living, Nursing Home, Other (multi-select)
 * - AccuType preset: Home Care + 70%+ (the ideal lead profile)
 */

import { useEffect, useRef, useState } from "react";

export interface ProviderFiltersValue {
  completenessMin?: number;
  completenessMax?: number;
  careTypes: string[];
}

const CARE_TYPE_OPTIONS = [
  { value: "home_care", label: "Home Care" },
  { value: "assisted_living", label: "Assisted Living" },
  { value: "nursing_home", label: "Nursing Home" },
  { value: "other", label: "Other" },
] as const;

interface ProviderFiltersProps {
  value: ProviderFiltersValue;
  onChange: (next: ProviderFiltersValue) => void;
}

function getActiveFilterCount(value: ProviderFiltersValue): number {
  let count = 0;
  if (value.completenessMin !== undefined || value.completenessMax !== undefined) {
    count++;
  }
  if (value.careTypes.length > 0) {
    count++;
  }
  return count;
}

function getFilterLabel(value: ProviderFiltersValue): string {
  const count = getActiveFilterCount(value);
  if (count === 0) return "Filters";
  return `Filters (${count})`;
}

export function ProviderFilters({ value, onChange }: ProviderFiltersProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local draft state for the popover
  const [draftCompleteness, setDraftCompleteness] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [draftCareTypes, setDraftCareTypes] = useState<string[]>([]);

  // Sync draft state when opening
  useEffect(() => {
    if (open) {
      // Determine completeness band from value
      if (value.completenessMin === 70) {
        setDraftCompleteness("hot");
      } else if (value.completenessMin === 50 && value.completenessMax === 69) {
        setDraftCompleteness("warm");
      } else if (value.completenessMax !== undefined && value.completenessMax < 50) {
        setDraftCompleteness("cold");
      } else {
        setDraftCompleteness("all");
      }
      setDraftCareTypes(value.careTypes);
    }
  }, [open, value]);

  // Close on outside click or escape
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handleCompletenessChange = (band: "all" | "hot" | "warm" | "cold") => {
    setDraftCompleteness(band);
  };

  const handleCareTypeToggle = (careType: string) => {
    setDraftCareTypes((prev) =>
      prev.includes(careType) ? prev.filter((ct) => ct !== careType) : [...prev, careType]
    );
  };

  const applyFilters = () => {
    let completenessMin: number | undefined;
    let completenessMax: number | undefined;

    if (draftCompleteness === "hot") {
      completenessMin = 70;
    } else if (draftCompleteness === "warm") {
      completenessMin = 50;
      completenessMax = 69;
    } else if (draftCompleteness === "cold") {
      completenessMax = 49;
    }

    onChange({
      completenessMin,
      completenessMax,
      careTypes: draftCareTypes,
    });
    setOpen(false);
  };

  const applyAccuType = () => {
    // AccuType preset: Home Care + 70%+
    setDraftCompleteness("hot");
    setDraftCareTypes(["home_care"]);
    onChange({
      completenessMin: 70,
      completenessMax: undefined,
      careTypes: ["home_care"],
    });
    setOpen(false);
  };

  const clearFilters = () => {
    setDraftCompleteness("all");
    setDraftCareTypes([]);
    onChange({
      completenessMin: undefined,
      completenessMax: undefined,
      careTypes: [],
    });
    setOpen(false);
  };

  const hasActiveFilters = getActiveFilterCount(value) > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 h-9 px-3.5 text-sm font-medium bg-white border rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/10 focus-visible:ring-offset-2 ${
          hasActiveFilters
            ? "text-primary-700 border-primary-300 hover:border-primary-400"
            : "text-gray-900 border-gray-200 hover:border-gray-300"
        }`}
      >
        <svg
          className={`w-3.5 h-3.5 ${hasActiveFilters ? "text-primary-500" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        {getFilterLabel(value)}
        <svg
          className={`w-3 h-3 ${hasActiveFilters ? "text-primary-400" : "text-gray-400"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]"
          role="dialog"
          aria-label="Filter providers"
        >
          {/* Profile Completeness Section */}
          <div className="px-4 pt-3 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Profile Completeness
            </p>
            <div className="space-y-1">
              {[
                { id: "all", label: "All" },
                { id: "hot", label: "70%+ (Hot)", color: "text-emerald-600" },
                { id: "warm", label: "50-69% (Warm)", color: "text-amber-600" },
                { id: "cold", label: "<50% (Cold)", color: "text-gray-500" },
              ].map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <input
                    type="radio"
                    name="completeness"
                    checked={draftCompleteness === option.id}
                    onChange={() => handleCompletenessChange(option.id as typeof draftCompleteness)}
                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 focus:ring-primary-500"
                  />
                  <span className={`text-sm ${option.color || "text-gray-700"}`}>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Care Type Section */}
          <div className="px-4 py-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Care Type
            </p>
            <div className="space-y-1">
              {CARE_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={draftCareTypes.includes(option.value)}
                    onChange={() => handleCareTypeToggle(option.value)}
                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AccuType Preset */}
          <div className="px-4 py-2 border-t border-gray-100">
            <button
              type="button"
              onClick={applyAccuType}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <span className="text-base">🔥</span>
              AccuType Only
            </button>
            <p className="mt-1.5 text-[11px] text-gray-400 text-center">
              Home Care + 70%+ profile
            </p>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-black transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
