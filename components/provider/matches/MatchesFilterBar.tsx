"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useCitySearch } from "@/hooks/use-city-search";

// ── Filter Types ──

export interface MatchesFilters {
  location: string | null; // null = all locations, string = specific city
  services: string[];
  payment: string[];
  timeline: "all" | "immediate" | "within_1_month" | "exploring";
}

export const DEFAULT_FILTERS: MatchesFilters = {
  location: null,
  services: [],
  payment: [],
  timeline: "all",
};

// ── Filter Options ──

export const SERVICE_OPTIONS = [
  { id: "home_care", label: "Home Care" },
  { id: "memory_care", label: "Memory Care" },
  { id: "assisted_living", label: "Assisted Living" },
  { id: "skilled_nursing", label: "Skilled Nursing" },
  { id: "independent_living", label: "Independent Living" },
  { id: "respite_care", label: "Respite Care" },
  { id: "hospice", label: "Hospice" },
  { id: "adult_day_care", label: "Adult Day Care" },
];

export const PAYMENT_OPTIONS = [
  { id: "medicaid", label: "Medicaid" },
  { id: "private_pay", label: "Private Pay" },
  { id: "va_benefits", label: "VA Benefits" },
  { id: "medicare", label: "Medicare" },
  { id: "long_term_care_insurance", label: "Long-Term Care Insurance" },
  { id: "aid_attendance", label: "Aid & Attendance" },
];

export const TIMELINE_OPTIONS = [
  { id: "all", label: "All timelines" },
  { id: "immediate", label: "Immediate" },
  { id: "within_1_month", label: "Within 1 month" },
  { id: "exploring", label: "Exploring" },
] as const;

export const SORT_OPTIONS = [
  { id: "best_match", label: "Best match" },
  { id: "most_recent", label: "Most recent" },
  { id: "most_urgent", label: "Most urgent" },
] as const;

export type SortOption = typeof SORT_OPTIONS[number]["id"];

// ── State Abbreviations (for geolocation) ──

const STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

// ── Icons ──

function ChevronDownIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function LocationIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CurrentLocationIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

// ── Dropdown Menu Component ──

interface DropdownProps {
  trigger: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  align?: "left" | "right";
}

function Dropdown({ trigger, isOpen, onOpenChange, children, align = "left" }: DropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => onOpenChange(false), isOpen);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      {trigger}
      {isOpen && (
        <div
          className={`absolute top-[calc(100%+8px)] ${align === "right" ? "right-0" : "left-0"} w-72 bg-white rounded-2xl shadow-lg border border-gray-200/80 py-2 z-50 animate-fade-in`}
          style={{ maxHeight: "320px", overflowY: "auto" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ── Filter Chip Button ──

interface FilterChipProps {
  label: string;
  icon?: React.ReactNode;
  isActive: boolean;
  badgeCount?: number;
  onClick: () => void;
}

function FilterChip({ label, icon, isActive, badgeCount, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        // Mobile: compact pills | Desktop: roomier
        "relative px-3.5 lg:px-5 py-2.5 lg:py-2.5 rounded-xl text-[13px] lg:text-sm font-medium whitespace-nowrap",
        "transition-all duration-200 ease-out min-h-[40px] lg:min-h-[44px] flex items-center gap-1.5 lg:gap-2",
        "bg-white border",
        "active:scale-[0.98]",
        isActive
          ? "text-gray-900 border-2 border-primary-400"
          : "text-gray-600 border-gray-300 hover:border-gray-400",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
      <ChevronDownIcon className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-gray-500" : "text-gray-400"}`} />
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
          {badgeCount}
        </span>
      )}
    </button>
  );
}

// ── Main Component ──

interface MatchesFilterBarProps {
  filters: MatchesFilters;
  onChange: (filters: MatchesFilters) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  providerLocation: string | null; // e.g., "Houston, TX"
  onOpenSheet?: (type: "location" | "services" | "payment" | "timeline") => void;
}

export default function MatchesFilterBar({
  filters,
  onChange,
  sortBy,
  onSortChange,
  providerLocation,
  onOpenSheet,
}: MatchesFilterBarProps) {
  // Desktop dropdown states
  const [locationOpen, setLocationOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Location search state
  const [locationQuery, setLocationQuery] = useState("");
  const [isGeolocating, setIsGeolocating] = useState(false);
  const locationInputRef = useRef<HTMLInputElement>(null);

  // City search hook
  const { results: cityResults, preload: preloadCities } = useCitySearch(locationQuery);

  // Geolocation handler
  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&countrycodes=us`
          );
          const data = await response.json();

          const country = data.address?.country_code?.toUpperCase();
          if (country !== "US") {
            setIsGeolocating(false);
            return;
          }

          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            "Unknown";
          const stateName = data.address?.state || "";
          const stateAbbr =
            STATE_ABBREVIATIONS[stateName] || stateName.substring(0, 2).toUpperCase();
          const locationString = `${city}, ${stateAbbr}`;
          onChange({ ...filters, location: locationString });
          setLocationQuery("");
          setLocationOpen(false);
        } catch {
          // Silently fail
        }
        setIsGeolocating(false);
      },
      () => {
        setIsGeolocating(false);
      }
    );
  }, [filters, onChange]);

  const closeAll = useCallback(() => {
    setLocationOpen(false);
    setServicesOpen(false);
    setPaymentOpen(false);
    setTimelineOpen(false);
    setSortOpen(false);
  }, []);

  // Check if any filters are active
  const hasActiveFilters =
    filters.location !== null ||
    filters.services.length > 0 ||
    filters.payment.length > 0 ||
    filters.timeline !== "all";

  const clearAllFilters = () => {
    onChange(DEFAULT_FILTERS);
  };

  // Location labels (short for mobile, full for desktop)
  const fullLocation = filters.location || providerLocation || "All locations";
  const shortLocation = fullLocation === "All locations"
    ? "Location"
    : fullLocation.split(",")[0]; // Just city name

  // Timeline labels (short for mobile)
  const fullTimeline = TIMELINE_OPTIONS.find((t) => t.id === filters.timeline)?.label || "All timelines";
  const shortTimeline = filters.timeline === "all" ? "Timeline" : fullTimeline;

  // Services label
  const servicesLabel =
    filters.services.length === 0
      ? "Services"
      : filters.services.length === 1
        ? SERVICE_OPTIONS.find((s) => s.id === filters.services[0])?.label || "1 service"
        : `${filters.services.length} services`;

  // Payment label
  const paymentLabel =
    filters.payment.length === 0
      ? "Payment"
      : filters.payment.length === 1
        ? PAYMENT_OPTIONS.find((p) => p.id === filters.payment[0])?.label || "1 method"
        : `${filters.payment.length} methods`;

  // Toggle helpers for multi-select
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

  // Mobile: detect and use bottom sheets
  const handleMobileClick = (type: "location" | "services" | "payment" | "timeline") => {
    if (onOpenSheet) {
      onOpenSheet(type);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Main filter row */}
      <div className="flex items-center justify-between gap-3">
        {/* Desktop: dropdown triggers */}
        <div className="hidden lg:flex items-center gap-2.5 flex-1">
          {/* Location */}
          <Dropdown
            isOpen={locationOpen}
            onOpenChange={(open) => {
              if (open) {
                closeAll();
                preloadCities();
              }
              setLocationOpen(open);
              if (!open) setLocationQuery("");
            }}
            trigger={
              <FilterChip
                label={fullLocation}
                icon={<LocationIcon className="w-4 h-4 text-gray-400" />}
                isActive={filters.location !== null}
                onClick={() => {
                  closeAll();
                  setLocationOpen(!locationOpen);
                  if (!locationOpen) {
                    preloadCities();
                    setTimeout(() => locationInputRef.current?.focus(), 50);
                  }
                }}
              />
            }
          >
            <div className="py-2">
              {/* Search input */}
              <div className="px-3 pb-2">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 transition-colors">
                  <LocationIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    ref={locationInputRef}
                    type="text"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && cityResults.length > 0 && locationQuery.trim()) {
                        onChange({ ...filters, location: cityResults[0].full });
                        setLocationQuery("");
                        setLocationOpen(false);
                      }
                    }}
                    placeholder="Search city or ZIP..."
                    className="flex-1 bg-transparent border-none text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>

              {/* Use current location */}
              <button
                type="button"
                onClick={detectLocation}
                disabled={isGeolocating}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-sm text-primary-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isGeolocating ? (
                  <SpinnerIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <CurrentLocationIcon className="w-4 h-4 shrink-0" />
                )}
                <span className="font-medium">{isGeolocating ? "Detecting..." : "Use my current location"}</span>
              </button>

              {/* Divider */}
              <div className="mx-3 my-2 h-px bg-gray-100" />

              {/* Quick options */}
              <div className="px-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...filters, location: null });
                    setLocationQuery("");
                    setLocationOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors ${
                    filters.location === null ? "bg-primary-50 text-primary-700" : "text-gray-900"
                  }`}
                >
                  {filters.location === null && <CheckIcon className="w-4 h-4 text-primary-600 shrink-0" />}
                  {filters.location !== null && <span className="w-4" />}
                  All locations
                </button>
                {providerLocation && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ ...filters, location: providerLocation });
                      setLocationQuery("");
                      setLocationOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors ${
                      filters.location === providerLocation ? "bg-primary-50 text-primary-700" : "text-gray-900"
                    }`}
                  >
                    {filters.location === providerLocation && <CheckIcon className="w-4 h-4 text-primary-600 shrink-0" />}
                    {filters.location !== providerLocation && <span className="w-4" />}
                    {providerLocation}
                  </button>
                )}
              </div>

              {/* City suggestions */}
              {locationQuery.trim() && cityResults.length > 0 && (
                <>
                  <div className="mx-3 my-2 h-px bg-gray-100" />
                  <div className="px-2">
                    {cityResults.slice(0, 5).map((city, index) => (
                      <button
                        key={city.full}
                        type="button"
                        onClick={() => {
                          onChange({ ...filters, location: city.full });
                          setLocationQuery("");
                          setLocationOpen(false);
                        }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                          index === 0 ? "bg-gray-50 text-gray-900" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <LocationIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                        <span>{city.full}</span>
                        {index === 0 && (
                          <span className="ml-auto text-xs text-gray-400">Enter</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* No results */}
              {locationQuery.trim() && cityResults.length === 0 && (
                <div className="px-4 py-3 text-center">
                  <p className="text-sm text-gray-500">No locations found</p>
                  <p className="text-xs text-gray-400 mt-1">Try a city name or ZIP code</p>
                </div>
              )}
            </div>
          </Dropdown>

          {/* Services */}
          <Dropdown
            isOpen={servicesOpen}
            onOpenChange={(open) => {
              if (open) closeAll();
              setServicesOpen(open);
            }}
            trigger={
              <FilterChip
                label={servicesLabel}
                isActive={filters.services.length > 0}
                badgeCount={filters.services.length > 0 ? filters.services.length : undefined}
                onClick={() => {
                  closeAll();
                  setServicesOpen(!servicesOpen);
                }}
              />
            }
          >
            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Services
                </p>
                {filters.services.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, services: [] })}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              {SERVICE_OPTIONS.map((opt) => {
                const isSelected = filters.services.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleService(opt.id)}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-900">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </Dropdown>

          {/* Payment */}
          <Dropdown
            isOpen={paymentOpen}
            onOpenChange={(open) => {
              if (open) closeAll();
              setPaymentOpen(open);
            }}
            trigger={
              <FilterChip
                label={paymentLabel}
                isActive={filters.payment.length > 0}
                badgeCount={filters.payment.length > 0 ? filters.payment.length : undefined}
                onClick={() => {
                  closeAll();
                  setPaymentOpen(!paymentOpen);
                }}
              />
            }
          >
            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Payment
                </p>
                {filters.payment.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...filters, payment: [] })}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              {PAYMENT_OPTIONS.map((opt) => {
                const isSelected = filters.payment.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePayment(opt.id)}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-900">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </Dropdown>

          {/* Timeline */}
          <Dropdown
            isOpen={timelineOpen}
            onOpenChange={(open) => {
              if (open) closeAll();
              setTimelineOpen(open);
            }}
            trigger={
              <FilterChip
                label={fullTimeline}
                isActive={filters.timeline !== "all"}
                onClick={() => {
                  closeAll();
                  setTimelineOpen(!timelineOpen);
                }}
              />
            }
          >
            <div className="px-2 py-1">
              <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Timeline
              </p>
              {TIMELINE_OPTIONS.map((opt) => {
                const isSelected = filters.timeline === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange({ ...filters, timeline: opt.id });
                      setTimelineOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-primary-50 text-primary-700" : "text-gray-900"
                    }`}
                  >
                    {isSelected && <CheckIcon className="w-4 h-4 text-primary-600 shrink-0" />}
                    {!isSelected && <span className="w-4" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Dropdown>

          {/* Spacer to push sort to the right */}
          <div className="flex-1" />

          {/* Sort dropdown */}
          <Dropdown
            isOpen={sortOpen}
            onOpenChange={(open) => {
              if (open) closeAll();
              setSortOpen(open);
            }}
            align="right"
            trigger={
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  setSortOpen(!sortOpen);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap bg-white border border-gray-300 text-gray-600 hover:border-gray-400 transition-all duration-200 ease-out min-h-[44px] active:scale-[0.98]"
              >
                <span className="text-gray-400 font-normal">Sort:</span>
                <span className="text-gray-700">{SORT_OPTIONS.find((s) => s.id === sortBy)?.label}</span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
              </button>
            }
          >
            <div className="px-2 py-1">
              {SORT_OPTIONS.map((opt) => {
                const isSelected = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSortChange(opt.id);
                      setSortOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-primary-50 text-primary-700" : "text-gray-900"
                    }`}
                  >
                    {isSelected && <CheckIcon className="w-4 h-4 text-primary-600 shrink-0" />}
                    {!isSelected && <span className="w-4" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Dropdown>
        </div>

        {/* Mobile: horizontal scroll filter chips */}
        <div className="lg:hidden overflow-x-auto -mx-4 px-4 scrollbar-hide flex-1">
          <div className="flex gap-2 w-max">
            {/* Location */}
            <FilterChip
              label={shortLocation}
              icon={<LocationIcon className="w-3.5 h-3.5 text-gray-400" />}
              isActive={filters.location !== null}
              onClick={() => handleMobileClick("location")}
            />

            {/* Services */}
            <FilterChip
              label={filters.services.length === 0 ? "Services" : `${filters.services.length} services`}
              isActive={filters.services.length > 0}
              onClick={() => handleMobileClick("services")}
            />

            {/* Payment */}
            <FilterChip
              label={filters.payment.length === 0 ? "Payment" : `${filters.payment.length} selected`}
              isActive={filters.payment.length > 0}
              onClick={() => handleMobileClick("payment")}
            />

            {/* Timeline */}
            <FilterChip
              label={shortTimeline}
              isActive={filters.timeline !== "all"}
              onClick={() => handleMobileClick("timeline")}
            />
          </div>
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden lg:inline">Clear all</span>
            <span className="lg:hidden">Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
