"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import ScheduleInterviewModal, { ScheduleFormData } from "@/components/medjobs/ScheduleInterviewModal";
import UpgradeModal from "@/components/medjobs/UpgradeModal";
import type { AccessTier } from "@/lib/medjobs-access";

interface ProviderContactSectionProps {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  studentPhone: string | null;
  studentSlug: string;
  variant?: "sidebar" | "sticky" | "inline";
  /** Pre-fetched: whether an interview has already been scheduled */
  initialScheduled?: boolean;
  /** Provider's access tier for paywall gating */
  accessTier?: AccessTier;
  /** Provider's credits used count for upgrade modal */
  creditsUsed?: number;
  /** Provider verification status */
  isVerified?: boolean;
  /** Called when unverified provider tries to schedule */
  onVerifyClick?: () => void;
}

export default function ProviderContactSection({
  studentId,
  studentName,
  studentEmail,
  studentPhone,
  studentSlug,
  variant = "sidebar",
  initialScheduled = false,
  accessTier,
  creditsUsed = 0,
  isVerified,
  onVerifyClick,
}: ProviderContactSectionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, openAuth } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [scheduled, setScheduled] = useState(initialScheduled);
  // Store form data when verification is triggered, so we can restore it after
  const [pendingFormData, setPendingFormData] = useState<ScheduleFormData | null>(null);
  // Track previous verification state to detect when user becomes verified
  const wasVerifiedRef = useRef(isVerified);

  const isFreeExhausted = accessTier === "free_exhausted";

  // Re-open schedule modal with saved form data after user verifies
  useEffect(() => {
    // Detect transition from unverified to verified
    if (isVerified && !wasVerifiedRef.current && pendingFormData) {
      setShowModal(true);
      // Note: pendingFormData is passed as initialValues below
    }
    wasVerifiedRef.current = isVerified;
  }, [isVerified, pendingFormData]);

  // Wrapped callback that closes schedule modal before opening verification modal
  const handleVerifyWithFormData = useCallback((formData?: ScheduleFormData) => {
    if (formData) {
      setPendingFormData(formData);
    }
    setShowModal(false); // Close schedule modal first
    // Small delay to prevent visual stacking
    setTimeout(() => {
      onVerifyClick?.();
    }, 100);
  }, [onVerifyClick]);

  // If initial state changes (e.g., parent fetched interviews), update
  useEffect(() => {
    if (initialScheduled) setScheduled(true);
  }, [initialScheduled]);

  // Auto-open schedule modal when arriving from inline onboarding flow
  const hasHandledScheduleParam = useRef(false);
  useEffect(() => {
    if (hasHandledScheduleParam.current) return;

    const scheduleParam = searchParams.get("schedule");
    if (scheduleParam === "true" && user) {
      hasHandledScheduleParam.current = true;

      // Clear the query param from URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete("schedule");
      const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(newUrl, { scroll: false });

      // Open the schedule modal
      setShowModal(true);
    }
  }, [searchParams, user, pathname, router]);

  const requiresAuth = !user;

  const handleAuthRequired = useCallback(() => {
    openAuth({
      intent: "provider",
      headline: `Connect with ${studentName.split(" ")[0]}`,
      subline: "Sign in with your business email for instant verification",
      deferred: {
        action: "hire-candidate",
        returnUrl: pathname,
      },
    });
  }, [openAuth, studentName, pathname]);

  const handleScheduleClick = useCallback(() => {
    if (requiresAuth) {
      handleAuthRequired();
      return;
    }
    if (isFreeExhausted) {
      setShowUpgradeModal(true);
      return;
    }
    setShowModal(true);
  }, [requiresAuth, handleAuthRequired, isFreeExhausted]);

  const firstName = studentName.split(" ")[0];

  // ── Sticky mobile bar ──
  if (variant === "sticky") {
    return (
      <>
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 safe-area-pb">
          <div className="flex gap-2">
            <button
              onClick={handleScheduleClick}
              disabled={scheduled}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-emerald-600 rounded-xl text-sm font-semibold text-white transition-colors"
            >
              <CalendarIcon />
              {scheduled ? "Interview Requested!" : "Schedule Interview"}
            </button>
            {/* Phone button */}
            {studentPhone && (
              <a
                href={`tel:${studentPhone}`}
                className="w-12 h-12 flex items-center justify-center bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </a>
            )}
          </div>
        </div>
        {showModal && (
          <ScheduleInterviewModal
            studentProfileId={studentId}
            otherName={studentName}
            onClose={() => { setShowModal(false); setPendingFormData(null); }}
            onScheduled={() => { setShowModal(false); setScheduled(true); setPendingFormData(null); }}
            isVerified={isVerified}
            onVerifyClick={handleVerifyWithFormData}
            initialValues={pendingFormData || undefined}
          />
        )}
        {showUpgradeModal && (
          <UpgradeModal creditsUsed={creditsUsed} onClose={() => setShowUpgradeModal(false)} />
        )}
      </>
    );
  }

  // ── Sidebar/Inline variant (desktop) ──
  const isInline = variant === "inline";
  const wrapperClass = isInline
    ? "space-y-4"
    : "bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4";

  // If not authenticated at all, show auth-gated UI
  if (requiresAuth) {
    return (
      <div className={wrapperClass}>
        <div className={isInline ? "" : "text-center py-2"}>
          <p className={`text-sm text-gray-500 ${isInline ? "mb-3" : "mb-4"}`}>
            Sign in to contact {firstName} and schedule an interview
          </p>
          <button
            onClick={handleAuthRequired}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-sm font-semibold text-white transition-colors"
          >
            <CalendarIcon />
            Schedule Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* Contact Info */}
      {(studentEmail || studentPhone) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Contact Info</h3>
          {studentEmail && (
            <a
              href={`mailto:${studentEmail}`}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span className="truncate">{studentEmail}</span>
            </a>
          )}
          {studentPhone && (
            <a
              href={`tel:${studentPhone}`}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {studentPhone}
            </a>
          )}
        </div>
      )}

      {/* Primary CTA - Schedule Interview */}
      {scheduled ? (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium text-center">
          Interview request sent to {firstName}!
        </div>
      ) : (
        <button
          onClick={handleScheduleClick}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-900 hover:bg-gray-800 rounded-xl text-sm font-semibold text-white transition-colors"
        >
          <CalendarIcon />
          Schedule Interview
        </button>
      )}

      {showModal && (
        <ScheduleInterviewModal
          studentProfileId={studentId}
          otherName={studentName}
          onClose={() => { setShowModal(false); setPendingFormData(null); }}
          onScheduled={() => { setShowModal(false); setScheduled(true); setPendingFormData(null); }}
          isVerified={isVerified}
          onVerifyClick={handleVerifyWithFormData}
          initialValues={pendingFormData || undefined}
        />
      )}
      {showUpgradeModal && (
        <UpgradeModal creditsUsed={1} onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
