"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import type { CandidateData } from "@/components/medjobs/CandidateRow";
import type { JobDetails } from "@/components/medjobs/ScheduleInterviewModal";
import {
  getTrackLabel,
  getActualCertifications,
  hasVideo,
  getYouTubeId,
  INTENDED_SCHOOL_LABELS,
  getMajorLabel,
  SEASON_LABELS,
  getSeasonalStatusLabel,
} from "@/lib/medjobs-helpers";
import { EMPLOYER_AGREEMENT_URL } from "@/lib/medjobs/eligibility";
import {
  type AvailabilitySchedule,
  TIME_SLOTS,
  getDateOptions,
  getAvailableTimeSlots,
  formatTimeSlot,
} from "@/lib/medjobs/availability-utils";
import { getStudentTimezone, dateTimeToISO, getTimezoneLabel } from "@/lib/medjobs/timezone";

type ViewState = "profile" | "schedule" | "success";

interface CandidateBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: CandidateData;
  /** Job details for the schedule form */
  jobDetails?: JobDetails;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Form Constants
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { value: "video" | "phone" | "in_person"; label: string }[] = [
  { value: "video", label: "Video" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
];

function formatExperienceDate(ym: string): string {
  const [year, month] = ym.split("-");
  if (!month) return year;
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatLastUpdated(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null; // Invalid date
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 14) return `Updated ${diffDays} days ago`;
  return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Grid Component
// ─────────────────────────────────────────────────────────────────────────────

const SCHED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SCHED_SLOTS = [
  { key: "8am", label: "8-10a" },
  { key: "10am", label: "10-12p" },
  { key: "12pm", label: "12-2p" },
  { key: "2pm", label: "2-4p" },
  { key: "4pm", label: "4-6p" },
  { key: "6pm", label: "6-8p" },
  { key: "8pm", label: "8p+" },
];

function ScheduleGrid({ grid: gridStr }: { grid: string }) {
  let grid: Record<string, boolean> = {};
  try {
    grid = JSON.parse(gridStr);
  } catch {
    return null;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <div className="min-w-[300px] px-1">
        <div className="grid grid-cols-[40px_repeat(5,1fr)] gap-0.5 mb-0.5">
          <div />
          {SCHED_DAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-gray-500 py-1">
              {d}
            </div>
          ))}
        </div>
        {SCHED_SLOTS.map((slot) => (
          <div key={slot.key} className="grid grid-cols-[40px_repeat(5,1fr)] gap-0.5 mb-0.5">
            <div className="flex items-center justify-end pr-1">
              <span className="text-[9px] text-gray-400">{slot.label}</span>
            </div>
            {SCHED_DAYS.map((day) => {
              const isClass = !!grid[`${day}-${slot.key}`];
              return (
                <div
                  key={day}
                  className={`h-5 rounded text-[9px] font-medium flex items-center justify-center ${
                    isClass ? "bg-gray-800 text-white" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {isClass ? "Class" : "Free"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CandidateBottomSheet({
  isOpen,
  onClose,
  candidate,
  jobDetails,
}: CandidateBottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<ViewState>("profile");
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Schedule form state
  const [type, setType] = useState<"video" | "in_person" | "phone">("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [showAltTime, setShowAltTime] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altTime, setAltTime] = useState("");
  const [notes, setNotes] = useState(jobDetails?.job_description ?? "");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const studentAvailability = candidate.metadata?.availability_schedule;
  const studentTimezone = getStudentTimezone(candidate.metadata);
  const dateOptions = useMemo(
    () => getDateOptions(studentAvailability, studentTimezone),
    [studentAvailability, studentTimezone]
  );
  const timeOptions = useMemo(() => {
    if (!date) {
      return TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
    }
    // Use UTC noon to avoid timezone day-boundary issues
    const selectedDate = new Date(date + "T12:00:00Z");
    const availableSlots = getAvailableTimeSlots(selectedDate, studentAvailability, studentTimezone);
    return availableSlots.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
  }, [date, studentAvailability, studentTimezone]);
  const altTimeOptions = useMemo(() => {
    if (!altDate) {
      return TIME_SLOTS.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
    }
    // Use UTC noon to avoid timezone day-boundary issues
    const selectedDate = new Date(altDate + "T12:00:00Z");
    const availableSlots = getAvailableTimeSlots(selectedDate, studentAvailability, studentTimezone);
    return availableSlots.map(slot => ({ value: slot, label: formatTimeSlot(slot) }));
  }, [altDate, studentAvailability, studentTimezone]);

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

  const meta = candidate.metadata;
  const firstName = candidate.display_name.split(" ")[0];
  const trackLabel = getTrackLabel(meta);
  const certs = getActualCertifications(meta.certifications);
  const videoAvailable = hasVideo(meta);
  const youtubeId = videoAvailable ? getYouTubeId(meta.video_intro_url!) : null;
  const candidateIsVerified = !!(meta.drivers_license_url && meta.car_insurance_url);

  // Check if sections have content
  const hasAbout = !!(meta.why_caregiving || candidate.description || meta.intended_professional_school);
  const hasCommitments = !!(meta.acknowledgments_completed || meta.ncns_pledge || meta.school_balance_pledge || meta.advance_notice_pledge || meta.prn_willing);
  const hasScenarios = !!(meta.scenario_responses && meta.scenario_responses.length > 0);
  const hasExperience = !!(meta.experience_entries && meta.experience_entries.length > 0);

  // Mount tracking for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when candidate changes or sheet opens
  useEffect(() => {
    if (isOpen) {
      setView("profile");
      setType("video");
      setDate("");
      setTime("");
      setShowAltTime(false);
      setAltDate("");
      setAltTime("");
      setNotes(jobDetails?.job_description ?? "");
      setAgreed(false);
      setError("");
    }
  }, [isOpen, candidate.id, jobDetails?.job_description]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
    }
  }, []);

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      const storedScrollY = parseInt(document.body.style.top || "0", 10) * -1;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => {
        window.scrollTo({ top: storedScrollY, behavior: "instant" });
      });
    };
  }, [isOpen, handleKeyDown]);

  // Close sheet when viewport switches to desktop
  useEffect(() => {
    if (!isOpen) return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) onCloseRef.current();
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isOpen]);

  // Scroll content to top when view changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [view]);

  // Handle schedule submission
  const handleSubmit = async () => {
    if (!date || !time) {
      setError("Please select a date and time.");
      return;
    }
    setError("");
    setSubmitting(true);

    // Interpret selected time in student's timezone, not browser's local timezone
    const proposedTime = dateTimeToISO(date, time, studentTimezone);
    const alternativeTime = altDate && altTime ? dateTimeToISO(altDate, altTime, studentTimezone) : undefined;

    try {
      // Record terms acceptance
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

      const res = await fetch("/api/medjobs/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: candidate.id,
          type,
          proposedTime,
          alternativeTime,
          notes: notes.trim() || undefined,
          jobDetails: jobDetails || undefined,
        }),
      });
      const data = await res.json();

      if (res.status === 402 || data.error === "upgrade_required") {
        setError("Please upgrade your subscription to schedule interviews.");
        setSubmitting(false);
        return;
      }
      if (data.error === "terms_required") {
        setError("Please accept the placement terms before scheduling.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to schedule.");
        setSubmitting(false);
        return;
      }

      setView("success");
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!date && !!time && !submitting && agreed;

  if (!isOpen || !mounted) return null;

  const sheetContent = (
    <div
      className="fixed inset-0 z-[60] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.display_name} profile`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl animate-sheet-up flex flex-col"
        style={{ maxHeight: "92dvh", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 shrink-0">
          {view === "profile" ? (
            <span className="text-sm font-medium text-gray-500">Student Profile</span>
          ) : view === "schedule" ? (
            <button
              type="button"
              onClick={() => setView("profile")}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to profile
            </button>
          ) : (
            <span className="text-sm font-medium text-emerald-600">Interview Scheduled</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain">
          {view === "profile" && (
            <ProfileContent
              candidate={candidate}
              meta={meta}
              firstName={firstName}
              trackLabel={trackLabel}
              certs={certs}
              videoAvailable={videoAvailable}
              youtubeId={youtubeId}
              candidateIsVerified={candidateIsVerified}
              hasAbout={hasAbout}
              hasCommitments={hasCommitments}
              hasScenarios={hasScenarios}
              hasExperience={hasExperience}
            />
          )}

          {view === "schedule" && (
            <ScheduleContent
              firstName={firstName}
              type={type}
              setType={setType}
              date={date}
              setDate={setDate}
              time={time}
              setTime={setTime}
              dateOptions={dateOptions}
              timeOptions={timeOptions}
              showAltTime={showAltTime}
              setShowAltTime={setShowAltTime}
              altDate={altDate}
              setAltDate={setAltDate}
              altTime={altTime}
              setAltTime={setAltTime}
              altTimeOptions={altTimeOptions}
              notes={notes}
              setNotes={setNotes}
              agreed={agreed}
              setAgreed={setAgreed}
              error={error}
              studentTimezone={studentTimezone}
            />
          )}

          {view === "success" && (
            <SuccessContent firstName={firstName} onClose={onClose} />
          )}
        </div>

        {/* Sticky Footer CTA */}
        {view === "profile" && (
          <div
            className="px-5 py-4 border-t border-gray-200 bg-white shrink-0"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {candidate.placementStatus ? (
              // Student is already hired by this provider
              <a
                href="/provider/caregivers"
                className="w-full py-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[15px] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {candidate.placementStatus === "offered" ? "Offer pending" : "Already hired"} — View interviews
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(""); // Clear any previous errors
                  setView("schedule");
                }}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-xl text-[15px] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Schedule interview
              </button>
            )}
          </div>
        )}

        {view === "schedule" && (
          <div
            className="px-5 py-4 border-t border-gray-200 bg-white shrink-0"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-[15px] font-semibold transition-colors"
            >
              {submitting ? "Sending..." : `Invite ${firstName}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheetContent, document.body);
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Content
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileContentProps {
  candidate: CandidateData;
  meta: CandidateData["metadata"];
  firstName: string;
  trackLabel: string | null;
  certs: string[];
  videoAvailable: boolean;
  youtubeId: string | null;
  candidateIsVerified: boolean;
  hasAbout: boolean;
  hasCommitments: boolean;
  hasScenarios: boolean;
  hasExperience: boolean;
}

function ProfileContent({
  candidate,
  meta,
  firstName,
  trackLabel,
  certs,
  videoAvailable,
  youtubeId,
  candidateIsVerified,
  hasAbout,
  hasCommitments,
  hasScenarios,
  hasExperience,
}: ProfileContentProps) {
  return (
    <div className="px-5 py-5 space-y-6">
      {/* Identity Header */}
      <div className="flex items-start gap-4">
        {candidate.image_url ? (
          <Image
            src={candidate.image_url}
            alt={candidate.display_name}
            width={72}
            height={72}
            className="w-[72px] h-[72px] rounded-full object-cover shadow-sm ring-2 ring-white shrink-0"
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center shadow-sm ring-2 ring-white shrink-0">
            <span className="text-2xl font-bold text-primary-600">
              {candidate.display_name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-display font-bold text-gray-900">{firstName}</h2>
          {meta.university && (
            <p className="text-sm text-gray-600 font-medium mt-0.5">{meta.university}</p>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {[trackLabel, candidate.city && candidate.state ? `${candidate.city}, ${candidate.state}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {meta.seeking_status === "actively_looking" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Ready to Start
              </span>
            )}
            {candidateIsVerified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verified
              </span>
            )}
            {videoAvailable && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Video
              </span>
            )}
            {formatLastUpdated(candidate.updated_at || candidate.created_at) && (
              <span className="text-xs text-gray-400">
                {formatLastUpdated(candidate.updated_at || candidate.created_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Video Section */}
      {videoAvailable && (
        <div className="rounded-xl overflow-hidden border border-gray-100">
          {youtubeId ? (
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`}
                title={`${firstName}'s intro video`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <a
              href={meta.video_intro_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 py-10 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary-600 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Watch Intro Video</p>
                <p className="text-xs text-gray-500">Hear from {firstName}</p>
              </div>
            </a>
          )}
        </div>
      )}

      {/* Weekly Schedule - Separate Section */}
      {meta.course_schedule_grid && (
        <Section title={`Weekly Schedule${meta.course_schedule_semester ? ` (${meta.course_schedule_semester})` : ""}`}>
          <ScheduleGrid grid={meta.course_schedule_grid} />
        </Section>
      )}

      {/* Availability & Commitment */}
      <Section title="Availability & Commitment">
        {meta.seeking_status === "actively_looking" && (
          <div className="bg-emerald-50 rounded-lg px-3 py-2.5 inline-flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-semibold text-emerald-700">Ready to start</span>
          </div>
        )}

        {/* Year-Round Availability */}
        {meta.year_round_availability && Object.keys(meta.year_round_availability).length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Year-Round</h4>
            <div className="grid grid-cols-4 gap-2">
              {(["spring", "summer", "fall", "winter"] as const).map((season) => {
                const data = meta.year_round_availability?.[season];
                if (!data) return null;
                return (
                  <div key={season} className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                    <p className="text-[10px] font-medium text-gray-400 uppercase">{SEASON_LABELS[season]}</p>
                    <p className="text-xs font-semibold text-gray-900 mt-0.5">{getSeasonalStatusLabel(data.status)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Commitment Statement */}
        {meta.commitment_statement && (
          <div className={`${meta.year_round_availability && Object.keys(meta.year_round_availability).length > 0 ? "mt-4 pt-4 border-t border-gray-100" : ""}`}>
            <h4 className="text-xs font-medium text-gray-500 mb-2">Commitment Statement</h4>
            <p className="text-sm text-gray-700 leading-relaxed italic">
              &ldquo;{meta.commitment_statement}&rdquo;
            </p>
          </div>
        )}

        {/* Availability Notes */}
        {meta.availability_notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Additional Notes</h4>
            <p className="text-sm text-gray-600 leading-relaxed">
              {meta.availability_notes}
            </p>
          </div>
        )}
      </Section>

      {/* Qualifications */}
      <Section title="Qualifications">
        {/* Verification Banner */}
        {candidateIsVerified && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 mb-4">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Verified Candidate</p>
              <p className="text-xs text-emerald-600">Driver&apos;s license and car insurance on file</p>
            </div>
          </div>
        )}

        {meta.university && (
          <div className="mb-4">
            <dt className="text-xs text-gray-500 font-medium">University</dt>
            <dd className="text-sm font-semibold text-gray-900 mt-0.5">{meta.university}</dd>
            {meta.major && <dd className="text-xs text-gray-500">{getMajorLabel(meta.major)}</dd>}
          </div>
        )}

        {/* Certifications */}
        {certs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <dt className="text-xs text-gray-500 font-medium mb-2">Certifications</dt>
            <div className="flex flex-wrap gap-1.5">
              {certs.map((cert) => (
                <span key={cert} className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold border border-primary-100">
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Verified Hours */}
        {(meta.total_verified_hours ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary-600">{meta.total_verified_hours}</p>
              <p className="text-[10px] text-gray-500 font-medium uppercase">Verified Hrs</p>
            </div>
            {(meta.verified_care_types?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {meta.verified_care_types!.map((type) => (
                  <span key={type} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-medium">
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Experience */}
      {hasExperience && (
        <Section title="Experience">
          <div className="space-y-3">
            {meta.experience_entries!
              .slice()
              .sort((a, b) => (b.start_date > a.start_date ? 1 : -1))
              .map((entry) => (
                <div key={entry.id} className="bg-gray-50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-200">
                      {entry.tag === "paid" ? "Paid" : entry.tag === "volunteer" ? "Volunteer" : entry.tag === "family" ? "Family" : entry.tag === "clinical" ? "Clinical" : entry.tag === "internship" ? "Internship" : "Other"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatExperienceDate(entry.start_date)} – {entry.end_date ? formatExperienceDate(entry.end_date) : "Present"}
                  </p>
                  {entry.description && (
                    <p className="text-sm text-gray-500 mt-1">{entry.description}</p>
                  )}
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* Commitments */}
      {hasCommitments && (
        <Section title={`${firstName}'s Commitments`}>
          <p className="text-xs text-gray-500 mb-3">Verified commitments this candidate has made</p>
          <div className="space-y-2.5">
            {meta.acknowledgments_completed && (
              <>
                <CommitmentItem text="I will be on time, professional, and communicate schedule changes 24+ hours in advance" />
                <CommitmentItem text="I consent to a background check and drug test upon hire" />
                <CommitmentItem text="I have reliable transportation and accept responsibility for transport costs" />
              </>
            )}
            {meta.ncns_pledge && <CommitmentItem text="I understand that a no-call no-show means a vulnerable person goes without care. I commit to never doing this." />}
            {meta.school_balance_pledge && <CommitmentItem text="I will maintain my scheduled shifts even during midterms and finals — I will plan ahead and communicate early if I need coverage." />}
            {meta.advance_notice_pledge && <CommitmentItem text="I will keep my availability and schedule updated regularly and work with office staff if anything changes." />}
            {meta.prn_willing && <CommitmentItem text="I am open to starting PRN/as-needed until we find the right ongoing fit." />}
          </div>
        </Section>
      )}

      {/* Screening Responses */}
      {hasScenarios && (
        <Section title="Screening Responses">
          <div className="space-y-4">
            {meta.scenario_responses!.map((sr, i) => (
              <div key={i} className="border-l-4 border-primary-200 pl-3">
                <p className="text-xs font-semibold text-gray-700 mb-1">&ldquo;{sr.question}&rdquo;</p>
                <p className="text-sm text-gray-600 leading-relaxed">{sr.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* About */}
      {hasAbout && (
        <Section title={`About ${firstName}`}>
          {meta.why_caregiving && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Why I Want to Be a Caregiver
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {meta.why_caregiving}
              </p>
            </div>
          )}
          {candidate.description && !meta.why_caregiving && (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {candidate.description}
            </p>
          )}
          {meta.intended_professional_school && (
            <p className="text-xs text-gray-600 mt-3">
              <span className="font-medium text-gray-900">Career Goal:</span>{" "}
              {INTENDED_SCHOOL_LABELS[meta.intended_professional_school]}
            </p>
          )}
        </Section>
      )}

      {/* Documents */}
      {meta.resume_url && (
        <Section title="Documents">
          <ResumeButton resumePath={meta.resume_url} profileId={candidate.id} />
        </Section>
      )}

      {/* Bottom padding for scroll */}
      <div className="h-4" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Content
// ─────────────────────────────────────────────────────────────────────────────

interface ScheduleContentProps {
  firstName: string;
  type: "video" | "in_person" | "phone";
  setType: (v: "video" | "in_person" | "phone") => void;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  dateOptions: { value: string; label: string }[];
  timeOptions: { value: string; label: string }[];
  showAltTime: boolean;
  setShowAltTime: (v: boolean) => void;
  altDate: string;
  setAltDate: (v: string) => void;
  altTime: string;
  setAltTime: (v: string) => void;
  altTimeOptions: { value: string; label: string }[];
  notes: string;
  setNotes: (v: string) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  error: string;
  studentTimezone: string;
}

function ScheduleContent({
  firstName,
  type,
  setType,
  date,
  setDate,
  time,
  setTime,
  dateOptions,
  timeOptions,
  showAltTime,
  setShowAltTime,
  altDate,
  setAltDate,
  altTime,
  setAltTime,
  altTimeOptions,
  notes,
  setNotes,
  agreed,
  setAgreed,
  error,
  studentTimezone,
}: ScheduleContentProps) {
  return (
    <div className="px-5 py-5 space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold text-gray-900">Schedule an interview</h2>
        <p className="text-sm text-gray-500 mt-1">Invite {firstName} to interview for a position.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Format */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
        <div className="flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                type === opt.value
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-700 border border-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
          <select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Select date</option>
            {dateOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Select time</option>
            {timeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        Times shown in {getTimezoneLabel(studentTimezone)}
      </p>

      {/* Alternative Time */}
      {!showAltTime ? (
        <button
          type="button"
          onClick={() => setShowAltTime(true)}
          className="text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          + Offer another time
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Alt Date</label>
            <select
              value={altDate}
              onChange={(e) => setAltDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">Select date</option>
              {dateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Alt Time</label>
            <select
              value={altTime}
              onChange={(e) => setAltTime(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">Select time</option>
              {altTimeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Job details, interview instructions..."
          rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Terms */}
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
            Terms & Conditions
          </a>
        </span>
      </label>

      {/* Bottom padding */}
      <div className="h-4" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success Content
// ─────────────────────────────────────────────────────────────────────────────

function SuccessContent({ firstName, onClose }: { firstName: string; onClose: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Interview scheduled!</h2>
      <p className="text-sm text-gray-500 mb-6">
        {firstName} will receive your invitation and can confirm or suggest a different time.
      </p>
      <div className="space-y-3">
        <button
          type="button"
          onClick={onClose}
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function CommitmentItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-gray-700">{text}</span>
    </div>
  );
}

function ResumeButton({ resumePath, profileId }: { resumePath: string; profileId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleViewResume = async () => {
    if (loading) return;
    setError(false);

    // If it's already a full URL, open directly
    if (resumePath.startsWith("http")) {
      window.open(resumePath, "_blank");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/medjobs/get-document-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: resumePath, studentProfileId: profileId }),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, "_blank");
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleViewResume}
      disabled={loading}
      className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors group disabled:opacity-70"
    >
      <div className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-gray-900 group-hover:text-red-600 transition-colors">
          {loading ? "Opening..." : error ? "Unable to load" : "Resume"}
        </p>
        <p className="text-xs text-gray-500">{error ? "Tap to try again" : "View or download PDF"}</p>
      </div>
      <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
    </button>
  );
}
