"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import UpgradeModal from "@/components/medjobs/UpgradeModal";
import ApprovalBlockModal from "@/components/medjobs/ApprovalBlockModal";
import { EMPLOYER_AGREEMENT_URL, type DemandProfile } from "@/lib/medjobs/eligibility";
import type { MedjobsRequirements } from "@/lib/medjobs/hiring-needs-questions";
import type { ApprovalBlock } from "@/app/api/medjobs/check-approval/route";
import {
  type AvailabilitySchedule,
  TIME_SLOTS,
  getDateOptions,
  getAvailableTimeSlots,
  formatTimeSlot,
} from "@/lib/medjobs/availability-utils";
import { getTimezoneLabel, DEFAULT_TIMEZONE, dateTimeToISO } from "@/lib/medjobs/timezone";

export interface ScheduleFormData {
  type: "video" | "in_person" | "phone";
  date: string;
  time: string;
  altDate?: string;
  altTime?: string;
  notes?: string;
  termsAccepted?: boolean;
}

/** Job details snapshot sent with interview and stored in interviews.metadata. */
export interface JobDetails {
  job_description?: string;
  coverage_buckets?: DemandProfile["coverage_buckets"];
  prn_open?: DemandProfile["prn_open"];
  requirements?: MedjobsRequirements;
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
  /** Called when interview scheduled but pending verification (student not notified yet) */
  onScheduledUnverified?: () => void;
  /** Provider's hiring defaults — job description pre-fills Notes, all fields stored with interview. */
  jobDetails?: JobDetails;
  /** Student's availability schedule - used to filter date/time options (provider → student only) */
  studentAvailability?: AvailabilitySchedule;
  /** Student's timezone (IANA format) - displayed for clarity. Defaults to America/Chicago. */
  studentTimezone?: string;
}

const FORMAT_OPTIONS: { value: "video" | "phone" | "in_person"; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
];

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
  onScheduledUnverified,
  jobDetails,
  studentAvailability,
  studentTimezone,
}: ScheduleInterviewModalProps) {
  // Pre-fill notes with job description if provided and no initial notes
  const defaultNotes = initialValues?.notes ?? jobDetails?.job_description ?? "";
  const [type, setType] = useState<"video" | "in_person" | "phone">(initialValues?.type ?? "video");
  const [date, setDate] = useState(initialValues?.date ?? "");
  const [time, setTime] = useState(initialValues?.time ?? "");
  const [showAltTime, setShowAltTime] = useState(!!initialValues?.altDate);
  const [altDate, setAltDate] = useState(initialValues?.altDate ?? "");
  const [altTime, setAltTime] = useState(initialValues?.altTime ?? "");
  const [notes, setNotes] = useState(defaultNotes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [approvalBlock, setApprovalBlock] = useState<ApprovalBlock | null>(null);

  const isStudentInitiated = !!providerProfileId;
  const firstName = otherName.split(" ")[0];

  // Date and time options for dropdowns - filtered by student availability when provided
  // Use student's timezone to determine "today" and day-of-week correctly
  const tz = studentTimezone ?? DEFAULT_TIMEZONE;
  const dateOptions = useMemo(
    () => getDateOptions(studentAvailability, tz),
    [studentAvailability, tz]
  );

  // Time options filtered by selected date's availability windows
  const timeOptions = useMemo(() => {
    if (!date) {
      // No date selected yet - show all times (will be filtered once date is picked)
      return TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
    }
    // Use UTC noon to avoid timezone day-boundary issues
    const selectedDate = new Date(date + "T12:00:00Z");
    const availableSlots = getAvailableTimeSlots(selectedDate, studentAvailability, tz);
    return availableSlots.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
  }, [date, studentAvailability, tz]);

  // Time options for alternative time (same filtering logic)
  const altTimeOptions = useMemo(() => {
    if (!altDate) {
      return TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
    }
    // Use UTC noon to avoid timezone day-boundary issues
    const selectedDate = new Date(altDate + "T12:00:00Z");
    const availableSlots = getAvailableTimeSlots(selectedDate, studentAvailability, tz);
    return availableSlots.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
  }, [altDate, studentAvailability, tz]);

  // Clear time selection if it's no longer valid after date change
  useEffect(() => {
    if (time && !timeOptions.some(opt => opt.value === time)) {
      setTime("");
    }
  }, [time, timeOptions]);

  useEffect(() => {
    if (altTime && !altTimeOptions.some(opt => opt.value === altTime)) {
      setAltTime("");
    }
  }, [altTime, altTimeOptions]);

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

    // NOTE: We no longer block submission for unverified providers.
    // Instead, the interview is saved with is_pending_verification=true
    // and the student is notified after verification completes.

    setSubmitting(true);

    // For student-initiated requests, check approval status before proceeding
    if (isStudentInitiated) {
      try {
        const checkRes = await fetch("/api/medjobs/check-approval");
        const checkData = await checkRes.json();
        if (checkData.blocked && checkData.block) {
          setApprovalBlock(checkData.block);
          setSubmitting(false);
          return;
        }
      } catch {
        setError("Could not verify approval status. Please try again.");
        setSubmitting(false);
        return;
      }
    }

    // Interpret selected date/time in the student's timezone, not browser's local timezone
    const tz = studentTimezone ?? DEFAULT_TIMEZONE;
    const proposedTime = dateTimeToISO(date, time, tz);
    const alternativeTime = altDate && altTime ? dateTimeToISO(altDate, altTime, tz) : undefined;

    try {
      // Provider → student: record the one-time Terms acceptance (the scheduling
      // gate) before proposing. Student → provider doesn't agree to provider terms.
      if (!isStudentInitiated) {
        const tRes = await fetch("/api/medjobs/accept-terms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!tRes.ok) {
          setError("Could not record your agreement. Please try again.");
          setSubmitting(false);
          return;
        }
      }

      const res = await fetch("/api/medjobs/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(studentProfileId ? { studentProfileId } : { providerProfileId }),
          type,
          proposedTime,
          alternativeTime,
          notes: notes.trim() || undefined,
          // Include job details snapshot for storage in interview metadata
          jobDetails: jobDetails || undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 402 || data.error === "upgrade_required") {
        setShowUpgradeModal(true);
        return;
      }
      if (data.error === "terms_required") {
        setError("Please accept the placement terms before scheduling.");
        return;
      }
      if (!res.ok) { setError(data.error || "Failed to schedule."); return; }
      // If interview is pending verification, notify parent so it can show appropriate CTA
      if (data.isPendingVerification && onScheduledUnverified) {
        onScheduledUnverified();
      }
      // Show success state instead of closing immediately
      setShowSuccess(true);
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  // Provider → student must agree to the placement Terms before scheduling
  // (the only gate). Student → provider has no provider-terms checkbox.
  const canSubmit = !!date && !!time && !submitting && (isStudentInitiated || agreed);

  // Footer with T&C opt-in and submit button - always visible at bottom
  const footer = (
    <div className="space-y-3 pt-2">
      {!isStudentInitiated && (
        <label className="flex items-start gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            I agree to the{" "}
            <a href={EMPLOYER_AGREEMENT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-700 hover:underline">
              Terms &amp; Conditions
            </a>
          </span>
        </label>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-400 rounded-xl text-sm font-semibold text-white transition-colors min-h-[48px]"
      >
        {submitting ? "Sending..." : isStudentInitiated ? `Request interview with ${firstName}` : `Invite ${firstName}`}
      </button>
    </div>
  );

  // Show approval block modal for students who need to take action
  if (approvalBlock) {
    return (
      <ApprovalBlockModal
        block={approvalBlock}
        onClose={() => {
          setApprovalBlock(null);
          onClose();
        }}
      />
    );
  }

  if (showUpgradeModal) {
    return <UpgradeModal creditsUsed={3} onClose={onClose} />;
  }

  // Success state - show confirmation before closing
  if (showSuccess) {
    return (
      <Modal isOpen onClose={onScheduled} size="lg" hideHeader>
        <div className="py-8 px-4 text-center">
          {/* Success icon */}
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isStudentInitiated ? "Interview requested!" : "Interview scheduled!"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {isStudentInitiated
              ? `${firstName} will be notified of your request.`
              : `${firstName} will receive your invitation and can confirm or suggest a different time.`}
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={onScheduled}
              className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-sm font-semibold text-white transition-colors"
            >
              Done
            </button>
            <Link
              href="/provider/caregivers"
              className="block w-full py-3 text-sm font-medium text-primary-700 hover:text-primary-800 transition-colors"
            >
              View all interviews &rarr;
            </Link>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isStudentInitiated ? "Request an interview" : "Schedule an interview"}
      size="lg"
      footer={footer}
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

        {/* Timezone indicator */}
        <p className="text-xs text-gray-500 -mt-3">
          Times shown in {getTimezoneLabel(studentTimezone ?? DEFAULT_TIMEZONE)}
        </p>

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
                options={altTimeOptions}
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

      </div>
    </Modal>
  );
}
