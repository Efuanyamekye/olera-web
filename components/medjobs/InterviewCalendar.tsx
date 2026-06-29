"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import InternshipAgreementModal from "@/components/medjobs/InternshipAgreementModal";
import type { Interview } from "@/lib/types";
import type { AccessTier } from "@/lib/medjobs-access";
import type { Placement } from "@/lib/medjobs/placements";

/* ── Types ── */

type InterviewWithProfiles = Interview & {
  provider?: {
    id: string;
    display_name: string;
    image_url?: string;
    city?: string;
    state?: string;
    email?: string;
    phone?: string;
  };
  student?: {
    id: string;
    slug?: string;
    display_name: string;
    image_url?: string;
    email?: string;
    metadata?: Record<string, unknown>;
  };
};

/** "provider" = org viewing candidates, "student" = caregiver viewing orgs */
type Perspective = "provider" | "student";

interface InterviewCalendarProps {
  interviews: InterviewWithProfiles[];
  perspective: Perspective;
  loading: boolean;
  onUpdateStatus: (interviewId: string, status: string, newTime?: string) => Promise<void>;
  actionLoading: string | null;
  /** Provider's access tier — used to show upgrade banner when exhausted */
  accessTier?: AccessTier;
  /** If set, auto-open the detail modal for this interview id once it arrives */
  initialSelectedId?: string;
  /** Provider verification status */
  isVerified?: boolean;
  /** Called when unverified provider tries to confirm interview */
  onVerifyClick?: () => void;
  /** Placements (offers) for these interviews, matched by interview_id. */
  placements?: Placement[];
  /** Student accept/decline of a placement offer. */
  onPlacementAction?: (placementId: string, action: "accept" | "decline") => Promise<void>;
}

/* ── Helpers ── */

const STATUS_LABELS: Record<string, string> = {
  proposed: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
  rescheduled: "Rescheduled",
  pending_verification: "Awaiting Verification",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  proposed: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  confirmed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  completed: { bg: "bg-gray-50", text: "text-gray-500", dot: "bg-gray-300" },
  cancelled: { bg: "bg-gray-50", text: "text-gray-400", dot: "bg-gray-300" },
  no_show: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" },
  rescheduled: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-400" },
  // Used for provider's view of their pending verification interviews
  pending_verification: { bg: "bg-primary-50", text: "text-primary-700", dot: "bg-primary-500" },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isToday(date: Date) {
  return isSameDay(date, new Date());
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatShortTime(dateStr: string) {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

function typeLabel(type: string) {
  return type === "video" ? "Video call" : type === "in_person" ? "In person" : "Phone call";
}

function typeIcon(type: string) {
  if (type === "video") return "M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z";
  if (type === "in_person") return "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z";
  return "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── Main Calendar Component ── */

export default function InterviewCalendar({
  interviews,
  perspective,
  loading,
  onUpdateStatus,
  actionLoading,
  accessTier,
  initialSelectedId,
  isVerified,
  onVerifyClick,
  placements,
  onPlacementAction,
}: InterviewCalendarProps) {
  const pathname = usePathname();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<InterviewWithProfiles | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Direct checkout - goes straight to Stripe
  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/medjobs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: pathname }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Silently fail - user can retry
    } finally {
      setUpgradeLoading(false);
    }
  };

  // Auto-open the detail modal when arriving from the magic-link claim
  // redirect. Fires once: after the interview actually appears in the list
  // the user can close the modal without it re-opening.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || !initialSelectedId) return;
    const match = interviews.find((iv) => iv.id === initialSelectedId);
    if (!match) return;
    autoOpenedRef.current = true;
    setSelected(match);
    // Jump the calendar view to the month of that interview so the user
    // sees the highlighted day when they close the modal.
    const d = new Date(match.confirmed_time || match.proposed_time);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }, [initialSelectedId, interviews]);

  // Count pending inbound requests (for upgrade banner)
  const pendingInboundCount = useMemo(() => {
    if (perspective !== "provider" || accessTier !== "free_exhausted") return 0;
    return interviews.filter(
      (iv) => iv.status === "proposed" && iv.proposed_by !== iv.provider_profile_id
    ).length;
  }, [interviews, perspective, accessTier]);

  // Group interviews by date string "YYYY-MM-DD"
  const byDate = useMemo(() => {
    const map = new Map<string, InterviewWithProfiles[]>();
    for (const iv of interviews) {
      const d = new Date(iv.confirmed_time || iv.proposed_time);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(iv);
    }
    return map;
  }, [interviews]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm">Loading interviews...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upgrade banner for exhausted providers with pending requests */}
      {pendingInboundCount > 0 && (
        <div className="bg-white border border-gray-200/80 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#199087]/10 flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-[#199087]">{pendingInboundCount}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-gray-900">
                {pendingInboundCount === 1 ? "Interview request" : "Interview requests"} waiting
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                Upgrade to respond and start hiring
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={upgradeLoading}
            className="shrink-0 px-5 py-2.5 bg-[#199087] hover:bg-[#157a72] disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            {upgradeLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              "Upgrade"
            )}
          </button>
        </div>
      )}

      {/* Calendar card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden">
        {/* Header with month nav */}
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Next month"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-2 pb-2">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid — no borders, just spacing */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
          {/* Leading blanks */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-[90px] sm:min-h-[110px] bg-gray-50" />
          ))}

          {/* Actual days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateObj = new Date(year, month, day);
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayInterviews = byDate.get(key) || [];
            const today = isToday(dateObj);

            return (
              <div
                key={day}
                className="min-h-[90px] sm:min-h-[110px] bg-white p-2"
              >
                {/* Date number */}
                <div className="flex items-center justify-center mb-1">
                  <span
                    className={`w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full ${
                      today
                        ? "bg-primary-500 text-white"
                        : "text-gray-700"
                    }`}
                  >
                    {day}
                  </span>
                </div>

                {/* Interview chips */}
                <div className="space-y-1">
                  {dayInterviews.slice(0, 2).map((iv) => {
                    const name = perspective === "provider"
                      ? iv.student?.display_name || "Unknown"
                      : iv.provider?.display_name || "Unknown";
                    const firstName = name.split(" ")[0];
                    const shortName = firstName.length > 10 ? firstName.slice(0, 8) + "…" : firstName;
                    // For providers: show distinct style if interview is pending their verification
                    const isPendingVerification = perspective === "provider" && iv.is_pending_verification;
                    const styleKey = isPendingVerification ? "pending_verification" : iv.status;
                    const styles = STATUS_STYLES[styleKey] || STATUS_STYLES.completed;
                    const time = formatShortTime(iv.confirmed_time || iv.proposed_time);

                    return (
                      <button
                        key={iv.id}
                        type="button"
                        onClick={() => setSelected(iv)}
                        className={`w-full px-2 py-1 rounded-md text-left transition-all hover:scale-[1.02] ${styles.bg}`}
                      >
                        <p className={`text-xs font-medium truncate ${styles.text}`}>
                          {shortName}
                        </p>
                        <p className={`text-[10px] ${styles.text} opacity-75`}>
                          {time}
                        </p>
                      </button>
                    );
                  })}
                  {dayInterviews.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setSelected(dayInterviews[2])}
                      className="w-full text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      +{dayInterviews.length - 2} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Trailing blanks */}
          {(() => {
            const totalCells = firstDay + daysInMonth;
            const remainder = totalCells % 7;
            if (remainder === 0) return null;
            return Array.from({ length: 7 - remainder }).map((_, i) => (
              <div key={`trail-${i}`} className="min-h-[90px] sm:min-h-[110px] bg-gray-50" />
            ));
          })()}
        </div>

        {/* Legend — integrated at bottom */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            Confirmed
          </span>
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            Pending
          </span>
          {perspective === "provider" && (
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-primary-500" />
              Needs Verification
            </span>
          )}
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="w-3 h-3 rounded-full bg-gray-300" />
            Past
          </span>
        </div>
      </div>

      {/* Empty state */}
      {interviews.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
          <Image
            src="/interview.png"
            alt="No interviews scheduled"
            width={180}
            height={180}
            className="mb-6"
          />
          <h3 className="text-[17px] font-display font-bold text-gray-900 mb-2">
            No interviews scheduled yet
          </h3>
          <p className="text-[15px] text-gray-500 max-w-sm leading-relaxed mb-6">
            {perspective === "provider"
              ? "Browse caregivers and schedule interviews to connect with pre-vetted healthcare students."
              : "When you request or receive interview invitations, they'll appear here on your calendar."}
          </p>
          <Link
            href={perspective === "provider" ? "/provider/medjobs/candidates" : "/portal/medjobs/jobs"}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {perspective === "provider" ? "Browse caregivers" : "See families hiring near you"}
          </Link>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <InterviewDetailModal
          interview={selected}
          perspective={perspective}
          onClose={() => setSelected(null)}
          onUpdateStatus={onUpdateStatus}
          actionLoading={actionLoading}
          isVerified={isVerified}
          onVerifyClick={onVerifyClick}
          placements={placements}
          onPlacementAction={onPlacementAction}
        />
      )}
    </div>
  );
}

/* ── Detail Modal ── */

function InterviewDetailModal({
  interview,
  perspective,
  onClose,
  onUpdateStatus,
  actionLoading,
  isVerified,
  onVerifyClick,
  placements,
  onPlacementAction,
}: {
  interview: InterviewWithProfiles;
  perspective: Perspective;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string, newTime?: string) => Promise<void>;
  actionLoading: string | null;
  isVerified?: boolean;
  onVerifyClick?: () => void;
  placements?: Placement[];
  onPlacementAction?: (placementId: string, action: "accept" | "decline") => Promise<void>;
}) {
  const time = new Date(interview.confirmed_time || interview.proposed_time);
  const isLoading = actionLoading === interview.id;

  // Who the "other person" is depends on perspective
  const other = perspective === "provider" ? interview.student : interview.provider;
  const otherName = other?.display_name || "Unknown";
  const otherImage = other?.image_url;

  // Student metadata for context line and contact info (provider view only)
  const studentMeta = (interview.student?.metadata || {}) as Record<string, unknown>;
  const studentEmail = interview.student?.email;
  const studentPhone = studentMeta.phone as string | undefined;
  const university = studentMeta.university as string | undefined;
  const track = studentMeta.intended_professional_school as string | undefined;
  const certifications = (studentMeta.certifications || []) as string[];
  const linkedinUrl = studentMeta.linkedin_url as string | undefined;
  const resumeStoragePath = studentMeta.resume_url as string | undefined;
  const videoUrl = studentMeta.video_intro_url as string | undefined;

  // State for signed document URLs
  const [signedResumeUrl, setSignedResumeUrl] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [placementBusy, setPlacementBusy] = useState(false);
  const offeredPlacement = placements?.find(
    (p) => p.interview_id === interview.id && p.status === "offered",
  );
  const confirmedPlacement = placements?.find(
    (p) => p.interview_id === interview.id && p.status === "confirmed",
  );
  const runPlacement = async (action: "accept" | "decline") => {
    if (!offeredPlacement || !onPlacementAction) return;
    setPlacementBusy(true);
    try {
      await onPlacementAction(offeredPlacement.id, action);
    } finally {
      setPlacementBusy(false);
    }
  };

  // Fetch signed URL for resume when needed (provider view, confirmed interview)
  const fetchResumeUrl = async () => {
    if (!resumeStoragePath || resumeLoading) return;

    // If we already have the URL cached, just open it
    if (signedResumeUrl) {
      window.open(signedResumeUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setResumeLoading(true);
    setResumeError(false);
    try {
      const res = await fetch("/api/medjobs/get-document-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: resumeStoragePath,
          studentProfileId: interview.student_profile_id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setSignedResumeUrl(data.url);
        // Open in new tab
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        setResumeError(true);
      }
    } catch {
      setResumeError(true);
    } finally {
      setResumeLoading(false);
    }
  };

  // Build context line for provider view
  const contextParts: string[] = [];
  if (university) contextParts.push(university);
  if (track) {
    const trackLabels: Record<string, string> = {
      medical: "Pre-Med",
      nursing: "Nursing",
      pa: "Pre-PA",
      pt: "Pre-PT",
      ot: "Pre-OT",
      dental: "Pre-Dental",
      pharmacy: "Pre-Pharm",
      public_health: "Public Health",
      other: "Healthcare",
    };
    contextParts.push(trackLabels[track] || track);
  }
  if (certifications.length > 0) contextParts.push(certifications[0]);
  const contextLine = contextParts.join(" · ");

  // Check if we should show connect section (confirmed interview, provider view)
  const showConnectSection = perspective === "provider" && interview.status === "confirmed";
  const hasContactInfo = studentEmail || studentPhone || resumeStoragePath || videoUrl || linkedinUrl;

  // Link to the other person's profile
  const profileHref = perspective === "provider" && interview.student?.slug
    ? `/medjobs/candidates/${interview.student.slug}`
    : null;

  const handleAction = async (status: string) => {
    // Check verification before confirming inbound interviews (provider receiving request)
    if (status === "confirmed" && perspective === "provider" && isVerified === false && onVerifyClick) {
      onVerifyClick();
      return;
    }
    await onUpdateStatus(interview.id, status);
    onClose();
  };

  // Reschedule ("Propose another time") — works in both directions. Sends a new
  // proposed_time back to the other party, who reviews it like a fresh request.
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const todayStr = new Date().toISOString().split("T")[0];
  const canReschedule = !!rescheduleDate && !!rescheduleTime && !isLoading;
  const handleReschedule = async () => {
    if (!canReschedule) return;
    const iso = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
    await onUpdateStatus(interview.id, "rescheduled", iso);
    onClose();
  };

  // Determine if "I" am the proposer
  const myProfileId = perspective === "provider"
    ? interview.provider_profile_id
    : interview.student_profile_id;
  const iProposed = interview.proposed_by === myProfileId;

  // For providers: show distinct style if interview is pending their verification
  const isPendingVerification = perspective === "provider" && interview.is_pending_verification;
  const styleKey = isPendingVerification ? "pending_verification" : interview.status;
  const styles = STATUS_STYLES[styleKey] || STATUS_STYLES.completed;
  const statusLabel = isPendingVerification ? STATUS_LABELS.pending_verification : (STATUS_LABELS[interview.status] || interview.status);

  // Reusable "Propose another time" trigger + the inline reschedule panel.
  const rescheduleTrigger = (
    <button
      type="button"
      onClick={() => setShowReschedule(true)}
      disabled={isLoading}
      className="w-full py-3 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
    >
      Propose another time
    </button>
  );

  // Build footer actions
  const footerActions = (() => {
    // Reschedule panel takes over the footer while open (both directions).
    if (showReschedule && interview.status === "proposed") {
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="date"
              min={todayStr}
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="button"
            onClick={handleReschedule}
            disabled={!canReschedule}
            className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-xl text-base font-semibold text-white transition-colors"
          >
            {isLoading ? "Sending..." : "Send new time"}
          </button>
          <button
            type="button"
            onClick={() => setShowReschedule(false)}
            className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      );
    }

    if (interview.status === "proposed") {
      if (iProposed) {
        // Provider scheduled this interview
        if (isPendingVerification && onVerifyClick) {
          // Pending verification - show verify CTA with withdraw option
          return (
            <div className="space-y-3">
              <button
                type="button"
                onClick={onVerifyClick}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-base font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify to Notify {otherName.split(" ")[0]}
              </button>
              <button
                type="button"
                onClick={() => handleAction("cancelled")}
                disabled={isLoading}
                className="w-full py-3 text-gray-500 hover:text-red-600 text-sm font-medium transition-colors"
              >
                {isLoading ? "Withdrawing..." : "Withdraw Request"}
              </button>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            {rescheduleTrigger}
            <button
              type="button"
              onClick={() => handleAction("cancelled")}
              disabled={isLoading}
              className="w-full py-3.5 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 rounded-xl text-base font-semibold text-gray-700 transition-colors"
            >
              {isLoading ? "Withdrawing..." : "Withdraw Request"}
            </button>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleAction("confirmed")}
            disabled={isLoading}
            className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-xl text-base font-semibold text-white transition-colors"
          >
            {isLoading ? "Confirming..." : "Confirm Interview"}
          </button>
          {rescheduleTrigger}
          <button
            type="button"
            onClick={() => handleAction("cancelled")}
            disabled={isLoading}
            className="w-full py-3 text-gray-500 hover:text-red-600 text-sm font-medium transition-colors"
          >
            Decline
          </button>
        </div>
      );
    }

    if (interview.status === "confirmed") {
      return (
        <div className="space-y-3">
          {confirmedPlacement ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
              Placement confirmed.
            </p>
          ) : perspective === "provider" ? (
            offerSent || offeredPlacement ? (
              <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
                Offer sent. {otherName.split(" ")[0]} will be notified to accept.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowOffer(true)}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-base font-semibold text-white transition-colors"
              >
                Offer to hire {otherName.split(" ")[0]}
              </button>
            )
          ) : offeredPlacement ? (
            <div className="space-y-2 rounded-xl border border-primary-200 bg-primary-50/60 p-3">
              <p className="text-sm font-medium text-gray-900">
                {otherName} offered to bring you on as a caregiver.
              </p>
              <button
                type="button"
                onClick={() => runPlacement("accept")}
                disabled={placementBusy}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-xl text-base font-semibold text-white transition-colors"
              >
                {placementBusy ? "Accepting…" : "Accept offer"}
              </button>
              <button
                type="button"
                onClick={() => runPlacement("decline")}
                disabled={placementBusy}
                className="w-full py-2 text-gray-500 hover:text-red-600 text-sm font-medium transition-colors"
              >
                Decline
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => handleAction("cancelled")}
            disabled={isLoading}
            className="w-full py-3.5 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 rounded-xl text-base font-semibold text-gray-700 transition-colors"
          >
            {isLoading ? "Cancelling..." : "Cancel Interview"}
          </button>
        </div>
      );
    }

    return null;
  })();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Interview Details"
      size="md"
      footer={footerActions ? <div className="pt-2">{footerActions}</div> : undefined}
    >
      <div className="py-4 space-y-6">
        {showOffer && (
          <InternshipAgreementModal
            studentProfileId={interview.student_profile_id}
            studentName={interview.student?.display_name}
            interviewId={interview.id}
            onClose={() => setShowOffer(false)}
            onOffered={() => {
              setShowOffer(false);
              setOfferSent(true);
            }}
          />
        )}
        {/* Pending verification banner - provider scheduled but hasn't verified yet */}
        {isPendingVerification && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-800">Interview saved, not sent yet</p>
                <p className="text-sm text-amber-700 mt-1">
                  {otherName.split(" ")[0]} will be notified once you complete verification.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Person card */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="w-14 h-14 rounded-full bg-gray-200 overflow-hidden shrink-0">
            {otherImage ? (
              <Image src={otherImage} alt={otherName} width={56} height={56} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-medium text-gray-400">
                {otherName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {profileHref ? (
              <Link
                href={profileHref}
                className="text-lg font-semibold text-gray-900 hover:text-primary-600 transition-colors"
                onClick={onClose}
              >
                {otherName}
              </Link>
            ) : (
              <p className="text-lg font-semibold text-gray-900">{otherName}</p>
            )}
            {/* Context line - university, track, certification */}
            {perspective === "provider" && contextLine && (
              <p className="text-sm text-gray-500 mt-0.5 truncate">{contextLine}</p>
            )}
            <span className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles.bg} ${styles.text}`}>
              <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4">
          {/* Date & Time */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="text-sm text-gray-500">
                {formatTime(interview.confirmed_time || interview.proposed_time)}
                {interview.duration_minutes && ` · ${interview.duration_minutes} min`}
              </p>
            </div>
          </div>

          {/* Type */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={typeIcon(interview.type)} />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Interview type</p>
              <p className="text-sm font-medium text-gray-900">{typeLabel(interview.type)}</p>
              {interview.location && (
                <p className="text-sm text-gray-500">{interview.location}</p>
              )}
            </div>
          </div>

          {/* Alternative time */}
          {interview.alternative_time && interview.status === "proposed" && (
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Alternative time</p>
                <p className="text-sm text-gray-500">{formatTime(interview.alternative_time)}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {interview.notes && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Note</p>
              <p className="text-sm text-gray-700">{interview.notes}</p>
            </div>
          )}
        </div>

        {/* Connect section - for providers with confirmed interviews */}
        {showConnectSection && hasContactInfo && (
          <div className="pt-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Connect</p>
            <div className="flex flex-wrap gap-2">
              {/* Primary actions - Email & Phone */}
              {studentEmail && (
                <a
                  href={`mailto:${studentEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-all duration-200"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  Email
                </a>
              )}
              {studentPhone && (
                <a
                  href={`tel:${studentPhone}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-all duration-200"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  Call
                </a>
              )}
              {/* Secondary actions - icon only pills */}
              {videoUrl && (
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all duration-200"
                  title="Watch Video Intro"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </a>
              )}
              {linkedinUrl && (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 bg-gray-100 hover:bg-[#0A66C2]/10 rounded-xl transition-all duration-200 group"
                  title="View LinkedIn"
                >
                  <svg className="w-4 h-4 text-gray-500 group-hover:text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
