"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import UpgradeModal from "@/components/medjobs/UpgradeModal";
import { useCitySearch } from "@/hooks/use-city-search";
import OrganizationSearch, { type SelectedOrg } from "@/components/shared/OrganizationSearch";
import type { StudentMetadata } from "@/lib/types";
import { getStudentTimezone, dateTimeToISO, getTimezoneLabel } from "@/lib/medjobs/timezone";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Step = "schedule" | "info" | "confirmation";

type InterviewFormat = "video" | "phone" | "in_person" | "flexible";

interface CandidateInfo {
  id: string;
  slug: string;
  displayName: string;
  imageUrl: string | null;
  city: string | null;
  state: string | null;
  metadata: StudentMetadata;
}

interface QuickScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: () => void;
  candidate: CandidateInfo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_STORAGE_PREFIX = "medjobs_quick_schedule_draft_";

function getDraftKey(candidateId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${candidateId}`;
}

// Check if a date string (YYYY-MM-DD) is today or in the future
function isDateValid(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + "T00:00:00");
  return date >= today;
}

const FORMAT_OPTIONS: { value: InterviewFormat; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
  { value: "flexible", label: "Flexible" },
];

// Time slots from 8 AM to 6 PM in 30-min increments
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getFirstName(name: string): string {
  return name?.split(" ")[0] || "This candidate";
}

function formatTimeSlot(time24: string): string {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes === 0 ? `${hour12}:00 ${period}` : `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Generate date options for next 30 days
function getDateOptions(): { value: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const options: { value: string; label: string }[] = [];

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    let label: string;
    if (i === 0) {
      label = "Today";
    } else if (i === 1) {
      label = "Tomorrow";
    } else {
      label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
      });
    }

    options.push({ value: dateStr, label });
  }

  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Dropdown Component
// ─────────────────────────────────────────────────────────────────────────────

interface DropdownOption {
  value: string;
  label: string;
}

function StyledDropdown({
  options,
  value,
  onChange,
  placeholder,
  label,
}: {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white border border-gray-200 rounded-xl px-4 py-3
          text-left text-sm transition-all min-h-[48px]
          hover:border-gray-300
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500
          ${selectedOption ? "text-gray-900" : "text-gray-500"}
        `}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: position.width,
          }}
          className="bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-[100] max-h-[280px] overflow-y-auto overscroll-contain"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`
                w-full px-4 py-3 text-left text-sm transition-colors min-h-[44px]
                ${opt.value === value
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function QuickScheduleModal({
  isOpen,
  onClose,
  onScheduled,
  candidate,
}: QuickScheduleModalProps) {
  // Step state
  const [step, setStep] = useState<Step>("schedule");

  // Step 1: Schedule data
  const [format, setFormat] = useState<InterviewFormat>("video");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [showAltTime, setShowAltTime] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altTime, setAltTime] = useState("");
  const [notes, setNotes] = useState("");

  // Step 2: Provider info
  const [organization, setOrganization] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<SelectedOrg | null>(null);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [email, setEmail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);

  // Track if we've loaded the draft to avoid overwriting on first render
  const draftLoadedRef = useRef(false);

  // Load draft from localStorage on mount (candidate-specific)
  useEffect(() => {
    if (draftLoadedRef.current) return;
    try {
      const draftKey = getDraftKey(candidate.id);
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.format) setFormat(draft.format);
        // Only restore dates if they're still valid (not in the past)
        if (draft.selectedDate && isDateValid(draft.selectedDate)) {
          setSelectedDate(draft.selectedDate);
        }
        if (draft.selectedTime) setSelectedTime(draft.selectedTime);
        if (draft.showAltTime) setShowAltTime(draft.showAltTime);
        // Only restore alt date if valid
        if (draft.altDate && isDateValid(draft.altDate)) {
          setAltDate(draft.altDate);
        }
        if (draft.altTime) setAltTime(draft.altTime);
        if (draft.notes) setNotes(draft.notes);
        if (draft.organization) setOrganization(draft.organization);
        // Restore selectedOrg object for proper org linking
        if (draft.selectedOrg) setSelectedOrg(draft.selectedOrg);
        if (draft.city) setCity(draft.city);
        if (draft.state) setState(draft.state);
        if (draft.email) setEmail(draft.email);
        // Don't restore termsAccepted - user must re-accept each session
        // Don't restore step - always start from beginning
      }
    } catch {
      // Ignore parse errors
    }
    draftLoadedRef.current = true;
  }, [candidate.id]);

  // Save draft to localStorage when form changes (candidate-specific)
  useEffect(() => {
    // Don't save until we've loaded the draft
    if (!draftLoadedRef.current) return;
    // Don't save if on confirmation step (submission successful)
    if (step === "confirmation") return;

    const draft = {
      format,
      selectedDate,
      selectedTime,
      showAltTime,
      altDate,
      altTime,
      notes,
      organization,
      selectedOrg, // Persist org selection for proper linking
      city,
      state,
      email,
    };

    try {
      const draftKey = getDraftKey(candidate.id);
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Ignore storage errors
    }
  }, [
    candidate.id,
    step,
    format,
    selectedDate,
    selectedTime,
    showAltTime,
    altDate,
    altTime,
    notes,
    organization,
    selectedOrg,
    city,
    state,
    email,
  ]);

  // City search
  const { results: cityResults } = useCitySearch(city);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const [cityDropdownPosition, setCityDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update city dropdown position
  useEffect(() => {
    if (showCityDropdown && cityInputRef.current) {
      const rect = cityInputRef.current.getBoundingClientRect();
      setCityDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [showCityDropdown]);

  // Close city dropdown on click outside
  useEffect(() => {
    if (!showCityDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        cityInputRef.current?.contains(e.target as Node) ||
        cityDropdownRef.current?.contains(e.target as Node)
      ) return;
      setShowCityDropdown(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCityDropdown]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Date options
  const dateOptions = useMemo(() => getDateOptions(), []);
  const timeOptions = useMemo(() => TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) })), []);

  // Candidate info
  const candidateFirstName = getFirstName(candidate.displayName);

  // Validation
  const canProceedToStep2 = selectedDate && selectedTime;
  const canSubmit = organization.trim() && city.trim() && email.trim() && email.includes("@") && termsAccepted;

  // Handlers
  const handleNext = useCallback(() => {
    if (canProceedToStep2) {
      setStep("info");
      setError("");
    }
  }, [canProceedToStep2]);

  const handleBack = useCallback(() => {
    setStep("schedule");
    setError("");
  }, []);

  // Get student timezone for proper timestamp creation
  const studentTimezone = getStudentTimezone(candidate.metadata);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    try {
      // Interpret selected time in student's timezone, not browser's local timezone
      const proposedTime = dateTimeToISO(selectedDate, selectedTime, studentTimezone);
      const alternativeTime = altDate && altTime ? dateTimeToISO(altDate, altTime, studentTimezone) : undefined;

      const res = await fetch("/api/medjobs/interviews/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: candidate.id,
          type: format === "flexible" ? "video" : format,
          proposedTime,
          alternativeTime,
          notes: notes.trim() || undefined,
          termsAcceptedAt, // Send T&C acceptance timestamp for audit trail
          provider: {
            email: email.trim().toLowerCase(),
            organization: organization.trim(),
            city: city.trim(),
            state: state.trim(),
            // Include selected org info for linking
            selectedOrgSlug: selectedOrg?.slug || null,
            selectedOrgSource: selectedOrg?.source || null,
            selectedOrgProviderId: selectedOrg?.providerId || null,
          },
        }),
      });

      const data = await res.json();

      if (res.status === 402 || data.error === "upgrade_required") {
        setShowUpgradeModal(true);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to send request. Please try again.");
        return;
      }

      // Clear draft on successful submission
      try {
        localStorage.removeItem(getDraftKey(candidate.id));
      } catch {
        // Ignore storage errors
      }
      setStep("confirmation");
      onScheduled?.();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, selectedDate, selectedTime, altDate, altTime, format, notes, candidate.id, email, organization, city, state, selectedOrg, termsAcceptedAt, studentTimezone]);

  const handleCitySelect = useCallback((selectedCity: string, selectedState: string) => {
    setCity(selectedCity);
    setState(selectedState);
    setShowCityDropdown(false);
  }, []);

  // Handle organization selection from autocomplete
  const handleOrgSelect = useCallback((org: SelectedOrg | null) => {
    setSelectedOrg(org);
    if (org) {
      // Auto-fill city from selected org
      if (org.city && org.state) {
        setCity(org.city);
        setState(org.state);
      } else {
        // Org doesn't have city/state - clear fields so user knows to fill them
        setCity("");
        setState("");
      }
    } else {
      // "Create new" selected - clear city/state so user must enter them
      setCity("");
      setState("");
    }
  }, []);

  // Reset on close
  const handleClose = useCallback(() => {
    onClose();
    // Reset after animation
    setTimeout(() => {
      setStep("schedule");
      setFormat("video");
      setSelectedDate("");
      setSelectedTime("");
      setShowAltTime(false);
      setAltDate("");
      setAltTime("");
      setNotes("");
      setOrganization("");
      setSelectedOrg(null);
      setCity("");
      setState("");
      setEmail("");
      setTermsAccepted(false);
      setTermsAcceptedAt(null);
      setError("");
      setShowUpgradeModal(false);
    }, 200);
  }, [onClose]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Step 1 - Schedule
  // ─────────────────────────────────────────────────────────────────────────────

  const renderScheduleStep = () => (
    <div className="pt-4 pb-4">
      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-900 mt-4">
        Schedule an interview
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {candidateFirstName} will confirm within 24 hours.
      </p>

      {/* Format */}
      <div className="mt-7">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Format
        </label>
        <div className="flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all min-h-[44px] ${
                format === opt.value
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Time - side by side */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Date
          </label>
          <StyledDropdown
            options={dateOptions}
            value={selectedDate}
            onChange={setSelectedDate}
            placeholder="Select date"
            label="Select date"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Time
          </label>
          <StyledDropdown
            options={timeOptions}
            value={selectedTime}
            onChange={setSelectedTime}
            placeholder="Select time"
            label="Select time"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        Times shown in {getTimezoneLabel(studentTimezone)}
      </p>

      {/* Alternative time - progressive disclosure */}
      <div className="mt-6">
        {!showAltTime ? (
          <button
            type="button"
            onClick={() => setShowAltTime(true)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Offer another time
          </button>
        ) : (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                Alternative time
              </label>
              <button
                type="button"
                onClick={() => { setShowAltTime(false); setAltDate(""); setAltTime(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StyledDropdown
                options={dateOptions}
                value={altDate}
                onChange={setAltDate}
                placeholder="Select date"
                label="Select alternative date"
              />
              <StyledDropdown
                options={timeOptions}
                value={altTime}
                onChange={setAltTime}
                placeholder="Select time"
                label="Select alternative time"
              />
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you'd like to discuss..."
          rows={2}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
        />
      </div>
    </div>
  );

  const renderScheduleFooter = () => (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleNext}
        disabled={!canProceedToStep2}
        className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
      >
        Continue
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Step 2 - Provider Info
  // ─────────────────────────────────────────────────────────────────────────────

  const renderInfoStep = () => (
    <div className="pt-4 pb-4">
      {/* Step indicator */}
      {renderStepIndicator()}

      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-900 mt-4">
        Your organization
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        We&apos;ll send confirmation to your email.
      </p>

      {error && (
        <div className="mt-5 p-3 bg-error-50 border border-error-100 rounded-xl text-sm text-error-700">
          {error}
        </div>
      )}

      {/* Organization - Autocomplete */}
      <div className="mt-7">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Organization
        </label>
        <OrganizationSearch
          value={organization}
          onChange={(value) => {
            setOrganization(value);
            // Clear selected org when user types
            if (selectedOrg && value !== selectedOrg.name) {
              setSelectedOrg(null);
            }
          }}
          onSelect={handleOrgSelect}
          placeholder="Search or create new..."
        />
        {selectedOrg && (
          <p className="mt-2 text-sm text-primary-600 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Selected: {selectedOrg.name}
          </p>
        )}
      </div>

      {/* City - auto-fills from org or manual entry */}
      <div className="mt-5">
        <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-3">
          City
        </label>
        <div className="relative">
          <div className="relative">
            <input
              ref={cityInputRef}
              id="city"
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setState("");
                setShowCityDropdown(true);
              }}
              onFocus={() => setShowCityDropdown(true)}
              placeholder="Start typing..."
              autoComplete="off"
              className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors min-h-[48px]"
            />
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {showCityDropdown && cityResults.length > 0 && createPortal(
            <div
              ref={cityDropdownRef}
              style={{
                position: "fixed",
                top: cityDropdownPosition.top,
                left: cityDropdownPosition.left,
                width: cityDropdownPosition.width,
              }}
              className="bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-[100] max-h-[200px] overflow-y-auto overscroll-contain"
            >
              {cityResults.map((c) => (
                <button
                  key={`${c.city}-${c.state}`}
                  type="button"
                  onClick={() => handleCitySelect(c.city, c.state)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                  <span className="text-gray-700">{c.city}, {c.state}</span>
                </button>
              ))}
            </div>,
            document.body
          )}
          {state && (
            <p className="mt-2 text-sm text-gray-500">{city}, {state}</p>
          )}
        </div>
      </div>

      {/* Work email */}
      <div className="mt-5">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-3">
          Work email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@organization.com"
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors min-h-[48px]"
        />
        <p className="mt-2 text-xs text-gray-500">We&apos;ll send interview details here</p>
      </div>

    </div>
  );

  const renderInfoFooter = () => (
    <div className="pt-2 space-y-4">
      {/* Terms & Conditions - in footer so always visible with submit button */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => {
              const checked = e.target.checked;
              setTermsAccepted(checked);
              // Record timestamp when user accepts T&C
              setTermsAcceptedAt(checked ? new Date().toISOString() : null);
            }}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-primary-600 focus:ring-primary-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600 leading-snug">
            I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary-600 hover:text-primary-700 underline underline-offset-2"
            >
              Terms & Conditions
            </a>{" "}
            for using Olera&apos;s interview scheduling service.
          </span>
        </label>
      </div>

      {/* Button row - Back (secondary) + Send (primary) */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="px-5 py-3.5 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium transition-colors min-h-[48px]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="flex-1 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
        >
          {submitting ? "Sending..." : "Send request"}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Confirmation
  // ─────────────────────────────────────────────────────────────────────────────

  const renderConfirmation = () => (
    <div className="py-8 text-center">
      {/* Email icon */}
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-900">
        Check your email
      </h2>
      <p className="mt-2 text-sm text-gray-500 max-w-[300px] mx-auto">
        We sent a verification link to{" "}
        <span className="font-semibold text-gray-900">{email}</span>.
        Click it to access your account and manage your interviews.
      </p>

      {/* Interview summary card */}
      <div className="mt-6 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-left">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-semibold text-emerald-800">Request sent to {candidateFirstName}</span>
        </div>
        <div className="space-y-1.5 text-sm text-emerald-700">
          <div className="flex justify-between">
            <span>When</span>
            <span className="font-medium">{formatDateDisplay(selectedDate)}, {formatTimeSlot(selectedTime)}</span>
          </div>
          {altDate && altTime && (
            <div className="flex justify-between">
              <span>Alternative</span>
              <span className="font-medium">{formatDateDisplay(altDate)}, {formatTimeSlot(altTime)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Format</span>
            <span className="font-medium capitalize">{format === "in_person" ? "In person" : format}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderConfirmationFooter = () => (
    <div className="pt-2">
      <button
        type="button"
        onClick={handleClose}
        className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
      >
        Got it
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  // Step indicator dots component
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 pb-2">
      <div className={`w-2 h-2 rounded-full transition-colors ${step === "schedule" ? "bg-gray-900" : "bg-gray-200"}`} />
      <div className={`w-2 h-2 rounded-full transition-colors ${step === "info" ? "bg-gray-900" : "bg-gray-200"}`} />
    </div>
  );

  if (showUpgradeModal && isOpen) {
    return <UpgradeModal creditsUsed={3} onClose={handleClose} />;
  }

  // Get the appropriate footer for current step
  const currentFooter = (() => {
    if (step === "schedule") return renderScheduleFooter();
    if (step === "info") return renderInfoFooter();
    if (step === "confirmation") return renderConfirmationFooter();
    return undefined;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      hideHeader
      footer={currentFooter}
    >
      {step === "schedule" && renderScheduleStep()}
      {step === "info" && renderInfoStep()}
      {step === "confirmation" && renderConfirmation()}
    </Modal>
  );
}
