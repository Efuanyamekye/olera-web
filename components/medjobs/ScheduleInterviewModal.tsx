"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Modal from "@/components/ui/Modal";
import UpgradeModal from "@/components/medjobs/UpgradeModal";

export interface ScheduleFormData {
  type: "video" | "in_person" | "phone";
  date: string;
  time: string;
  altDate?: string;
  altTime?: string;
  notes?: string;
}

interface ScheduleInterviewModalProps {
  /** Provider → Student: pass the student's profile ID */
  studentProfileId?: string;
  /** Student → Provider: pass the provider's profile ID */
  providerProfileId?: string;
  /** Name of the other party (shown in the modal header) */
  otherName: string;
  onClose: () => void;
  onScheduled: () => void;
  /** If true, user needs auth before submitting */
  requiresAuth?: boolean;
  /** Called when unauthenticated user tries to submit - saves form data and triggers auth */
  onAuthRequired?: (data: ScheduleFormData) => void;
  /** Pre-fill form with saved data (e.g., after returning from auth) */
  initialValues?: ScheduleFormData;
  /** Provider verification status */
  isVerified?: boolean;
  /** Called when unverified provider tries to submit */
  onVerifyClick?: () => void;
}

const FORMAT_OPTIONS: { value: "video" | "phone" | "in_person"; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
];

// Generate date options for next 30 days (dropdown format)
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

// Time slots from 8 AM to 6 PM in 30-min increments
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00",
];

function formatTimeSlot(time24: string): string {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes === 0 ? `${hour12}:00 ${period}` : `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Dropdown Component (matching QuickScheduleModal style)
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

export default function ScheduleInterviewModal({
  studentProfileId,
  providerProfileId,
  otherName,
  onClose,
  onScheduled,
  requiresAuth = false,
  onAuthRequired,
  initialValues,
  isVerified,
  onVerifyClick,
}: ScheduleInterviewModalProps) {
  const [type, setType] = useState<"video" | "in_person" | "phone">(initialValues?.type ?? "video");
  const [date, setDate] = useState(initialValues?.date ?? "");
  const [time, setTime] = useState(initialValues?.time ?? "");
  const [showAltTime, setShowAltTime] = useState(!!initialValues?.altDate);
  const [altDate, setAltDate] = useState(initialValues?.altDate ?? "");
  const [altTime, setAltTime] = useState(initialValues?.altTime ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const isStudentInitiated = !!providerProfileId;
  const firstName = otherName.split(" ")[0];

  // Date and time options for dropdowns
  const dateOptions = useMemo(() => getDateOptions(), []);
  const timeOptions = useMemo(() => TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) })), []);

  const handleSubmit = async () => {
    if (!date || !time) { setError("Please select a date and time."); return; }
    setError("");

    // If user needs auth, save form data and trigger auth flow
    if (requiresAuth && onAuthRequired) {
      onAuthRequired({
        type,
        date,
        time,
        altDate: altDate || undefined,
        altTime: altTime || undefined,
        notes: notes.trim() || undefined,
      });
      return;
    }

    // Check verification before scheduling (provider scheduling interviews)
    if (isVerified === false && onVerifyClick) {
      onVerifyClick();
      return;
    }

    setSubmitting(true);

    const proposedTime = new Date(`${date}T${time}`).toISOString();
    const alternativeTime = altDate && altTime ? new Date(`${altDate}T${altTime}`).toISOString() : undefined;

    try {
      const res = await fetch("/api/medjobs/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(studentProfileId ? { studentProfileId } : { providerProfileId }),
          type,
          proposedTime,
          alternativeTime,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402 || data.error === "upgrade_required") {
        setShowUpgradeModal(true);
        return;
      }
      if (!res.ok) { setError(data.error || "Failed to schedule."); return; }
      onScheduled();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = date && time && !submitting;

  if (showUpgradeModal) {
    return <UpgradeModal creditsUsed={3} onClose={onClose} />;
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isStudentInitiated ? "Request an interview" : "Schedule an interview"}
      size="lg"
    >
      <div className="py-4 space-y-6">
        {/* Subtitle */}
        <p className="text-sm text-gray-500">
          {isStudentInitiated
            ? `Request a time to speak with ${firstName} about opportunities.`
            : `Invite ${firstName} to interview for a position.`}
        </p>

        {error && (
          <div className="p-3 bg-error-50 border border-error-100 rounded-xl text-sm text-error-700">
            {error}
          </div>
        )}

        {/* Format - pill style buttons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Format
          </label>
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all min-h-[44px] ${
                  type === opt.value
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time - side by side dropdowns */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Date
            </label>
            <StyledDropdown
              options={dateOptions}
              value={date}
              onChange={setDate}
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
              value={time}
              onChange={setTime}
              placeholder="Select time"
              label="Select time"
            />
          </div>
        </div>

        {/* Alternative time - progressive disclosure */}
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

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isStudentInitiated
              ? "Introduce yourself briefly or mention what interests you about this role..."
              : "Share any details about the position or what you'd like to discuss..."}
            rows={2}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
          />
        </div>

        {/* Submit button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
          >
            {submitting ? "Sending..." : isStudentInitiated ? `Request interview with ${firstName}` : `Invite ${firstName}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
