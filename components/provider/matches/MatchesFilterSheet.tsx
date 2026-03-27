"use client";

import Modal from "@/components/ui/Modal";
import {
  SERVICE_OPTIONS,
  PAYMENT_OPTIONS,
  TIMELINE_OPTIONS,
  type MatchesFilters,
} from "./MatchesFilterBar";

// ── Icons ──

function CheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ── Types ──

export type FilterSheetType = "services" | "payment" | "timeline";

interface MatchesFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: FilterSheetType;
  filters: MatchesFilters;
  onChange: (filters: MatchesFilters) => void;
  resultCount: number;
}

// ── Sheet Titles ──

const SHEET_TITLES: Record<FilterSheetType, string> = {
  services: "Services",
  payment: "Payment methods",
  timeline: "Timeline",
};

// ── Main Component ──

export default function MatchesFilterSheet({
  isOpen,
  onClose,
  type,
  filters,
  onChange,
  resultCount,
}: MatchesFilterSheetProps) {
  // Get title for header
  const title = SHEET_TITLES[type];

  // Clear handler for multi-select types
  const handleClear = () => {
    if (type === "services") {
      onChange({ ...filters, services: [] });
    } else if (type === "payment") {
      onChange({ ...filters, payment: [] });
    } else if (type === "timeline") {
      onChange({ ...filters, timeline: "all" });
    }
  };

  // Check if clear should be shown
  const showClear =
    (type === "services" && filters.services.length > 0) ||
    (type === "payment" && filters.payment.length > 0) ||
    (type === "timeline" && filters.timeline !== "all");

  // Toggle helpers
  const toggleService = (id: string) => {
    const newServices = filters.services.includes(id)
      ? filters.services.filter((s) => s !== id)
      : [...filters.services, id];
    onChange({ ...filters, services: newServices });
  };

  const togglePayment = (id: string) => {
    const newPayment = filters.payment.includes(id)
      ? filters.payment.filter((p) => p !== id)
      : [...filters.payment, id];
    onChange({ ...filters, payment: newPayment });
  };

  // Render content based on type
  const renderContent = () => {
    switch (type) {
      case "services":
        return (
          <div className="space-y-1 pt-2">
            {SERVICE_OPTIONS.map((opt) => {
              const isSelected = filters.services.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary-50 border border-primary-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-[15px] text-gray-900">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleService(opt.id)}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              );
            })}
          </div>
        );

      case "payment":
        return (
          <div className="space-y-1 pt-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const isSelected = filters.payment.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary-50 border border-primary-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-[15px] text-gray-900">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePayment(opt.id)}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              );
            })}
          </div>
        );

      case "timeline":
        return (
          <div className="space-y-1 pt-2">
            {TIMELINE_OPTIONS.map((opt) => {
              const isSelected = filters.timeline === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange({ ...filters, timeline: opt.id });
                    onClose();
                  }}
                  className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-left transition-colors ${
                    isSelected
                      ? "bg-primary-50 border border-primary-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className="text-[15px] text-gray-900">{opt.label}</span>
                  {isSelected && (
                    <CheckIcon className="w-5 h-5 text-primary-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  // Footer for multi-select types (services, payment)
  const showFooter = type === "services" || type === "payment";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        showFooter ? (
          <button
            type="button"
            onClick={onClose}
            disabled={resultCount === 0}
            className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-colors ${
              resultCount === 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-primary-600 text-white hover:bg-primary-700"
            }`}
          >
            Show {resultCount} {resultCount === 1 ? "match" : "matches"}
          </button>
        ) : undefined
      }
    >
      {/* Clear button for multi-select types */}
      {showClear && (
        <div className="flex justify-end -mt-2 mb-2">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Clear
          </button>
        </div>
      )}
      {renderContent()}
    </Modal>
  );
}
