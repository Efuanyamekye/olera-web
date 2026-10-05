"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import ScheduleInterviewModal, { type JobDetails } from "@/components/medjobs/ScheduleInterviewModal";
import TermsModal from "@/components/medjobs/TermsModal";
import { useAuth } from "@/components/auth/AuthProvider";
import { getStudentTimezone } from "@/lib/medjobs/timezone";
import { DEMAND_PROFILE_KEY, type DemandProfile } from "@/lib/medjobs/eligibility";
import { REQUIREMENTS_KEY, type MedjobsRequirements } from "@/lib/medjobs/hiring-needs-questions";
import type { StudentMetadata } from "@/lib/types";

const DUBOSE_AVATAR = "/images/for-providers/team/logan.jpg";

interface CandidateData {
  id: string;
  slug: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  imageUrl: string | null;
  city: string | null;
  state: string | null;
  metadata: StudentMetadata;
}

/**
 * ContactSection — the provider-facing CTA on a candidate detail page.
 *
 * The action is "Schedule interview" (opens ScheduleInterviewModal) for a real
 * candidate, or "Review Terms & Conditions" for a sample/demo profile (no real
 * student to interview yet). The only other state is a student/caregiver
 * previewing their own profile.
 */
export default function ContactSection({
  candidate,
  variant = "sidebar",
  isSample = false,
}: {
  candidate: CandidateData;
  variant?: "sidebar" | "sticky" | "inline";
  /** Sample profile — no live student behind it. */
  isSample?: boolean;
}) {
  const { profiles, refreshAccountData } = useAuth();
  const [showSchedule, setShowSchedule] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [placementStatus, setPlacementStatus] = useState<"offered" | "accepted" | "confirmed" | null>(null);
  const providerProfile = profiles.find(
    (p) => p.type === "organization" || p.type === "caregiver",
  );

  // Check if this provider has an active placement with this student
  useEffect(() => {
    if (!providerProfile?.id || !candidate.id || isSample) return;

    const checkPlacement = async () => {
      try {
        const res = await fetch("/api/medjobs/placements");
        if (!res.ok) return;
        const data = await res.json();
        // Find active placement with this specific student
        const activePlacement = data.placements?.find(
          (p: { student_profile_id: string; status: string }) =>
            p.student_profile_id === candidate.id &&
            ["offered", "accepted", "confirmed"].includes(p.status)
        );
        if (activePlacement) {
          setPlacementStatus(activePlacement.status);
        }
      } catch {
        // Ignore errors - just don't show placement status
      }
    };

    void checkPlacement();
  }, [providerProfile?.id, candidate.id, isSample]);
  const providerMeta = useMemo(
    () => (providerProfile?.metadata ?? {}) as Record<string, unknown>,
    [providerProfile?.metadata]
  );
  // Derive terms-accepted from the live profile metadata every render (not a
  // one-time useState seed) so it stays correct across candidate pages once the
  // provider has agreed anywhere. `agreedLocally` covers the same-page moment
  // right after agreeing, before the auth refresh propagates.
  const termsAcceptedFromMeta = !!providerMeta["interview_terms_accepted_at"];
  const [agreedLocally, setAgreedLocally] = useState(false);
  const termsAccepted = agreedLocally || termsAcceptedFromMeta;

  // Extract hiring defaults to pass to the schedule modal
  const jobDetails = useMemo((): JobDetails | undefined => {
    const demand = providerMeta[DEMAND_PROFILE_KEY] as Partial<DemandProfile> | undefined;
    const requirements = providerMeta[REQUIREMENTS_KEY] as MedjobsRequirements | undefined;
    if (!demand && !requirements) return undefined;
    return {
      job_description: demand?.job_description,
      coverage_buckets: demand?.coverage_buckets,
      prn_open: demand?.prn_open,
      requirements,
    };
  }, [providerMeta]);

  const firstName = candidate.displayName.split(" ")[0];

  // Caregiver/student viewing their own profile.
  const isViewingOwnProfile = profiles.some(
    (p) => (p.type === "student" || p.type === "caregiver") && p.slug === candidate.slug,
  );

  const stickyWrap =
    "fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3";
  const stickyStyle = { paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" } as const;
  const cardWrap = (inline: boolean, extra = "space-y-3") =>
    inline ? extra : `bg-white rounded-2xl shadow-sm border border-gray-100 p-5 ${extra}`;
  const duBose = (
    <Image
      src={DUBOSE_AVATAR}
      alt="Dr. Logan DuBose"
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm"
    />
  );

  // ── Own profile preview ──
  if (isViewingOwnProfile) {
    const editLink = (
      <Link
        href="/portal/medjobs"
        className="px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm font-medium text-white transition-colors"
      >
        Edit Profile
      </Link>
    );
    if (variant === "sticky") {
      return (
        <div className={stickyWrap} style={stickyStyle}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">Provider preview</span>
            {editLink}
          </div>
        </div>
      );
    }
    return (
      <div className={cardWrap(variant === "inline", "space-y-4")}>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">Provider preview</div>
        <div
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-200 rounded-xl text-sm font-semibold text-gray-400 cursor-not-allowed"
          aria-disabled="true"
        >
          <CalendarIcon />
          Invite to a video interview
        </div>
        <p className="text-xs text-gray-400 text-center">This is how providers see your profile</p>
      </div>
    );
  }

  // ── Everyone else (provider-facing) → the staged CTA ladder ──
  // Terms first (the one real commitment, recorded as the scheduling gate +
  // CRM Client flag). Once agreed: a real candidate → schedule; a sample → a
  // standing "we'll notify you" since there's no real student to book yet.
  const ctaClass =
    "flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white transition-colors";
  const scheduleModal = showSchedule && !isSample ? (
    <ScheduleInterviewModal
      studentProfileId={candidate.id}
      otherName={candidate.displayName}
      onClose={() => setShowSchedule(false)}
      onScheduled={() => setShowSchedule(false)}
      jobDetails={jobDetails}
      studentAvailability={candidate.metadata?.availability_schedule}
      studentTimezone={getStudentTimezone(candidate.metadata)}
    />
  ) : null;
  const termsModal = showTerms ? (
    <TermsModal
      profileId={providerProfile?.id}
      onClose={() => setShowTerms(false)}
      onAgreed={() => {
        setAgreedLocally(true);
        setShowTerms(false);
        // Refresh auth so the persisted interview_terms_accepted_at is reflected
        // on revisit (avoids a redundant re-accept on the next page load).
        void refreshAccountData();
      }}
    />
  ) : null;
  const modals = (
    <>
      {scheduleModal}
      {termsModal}
    </>
  );

  let cta: React.ReactNode;
  if (!providerProfile) {
    // No provider account yet (anon visitor, a cold provider arriving from a
    // "candidate ready" email, or a signed-in non-provider) — for BOTH real and
    // demo candidates: funnel through the hiring-needs screener, which
    // establishes the provider account before scheduling (submitting here would
    // 401). Same entry point as a real candidate's anon path.
    cta = (
      <Link href="/medjobs/candidates?activate=1" className={ctaClass}>
        Schedule an interview →
      </Link>
    );
  } else if (!isSample && placementStatus) {
    // Real candidate with active placement — show "Already hired" with link to interviews
    const hiredCtaClass =
      "flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold text-emerald-700 transition-colors";
    cta = (
      <Link href="/provider/caregivers" className={hiredCtaClass}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {placementStatus === "offered" ? "Offer pending" : "Already hired"} — View interviews
      </Link>
    );
  } else if (!isSample) {
    // Real candidate, signed-in provider: schedule directly — the Terms opt-in
    // lives in the modal.
    cta = (
      <button type="button" onClick={() => setShowSchedule(true)} className={ctaClass}>
        Schedule interview →
      </button>
    );
  } else if (termsAccepted) {
    // Sample candidate, terms agreed: primed + waiting for real supply.
    cta = (
      <div className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-center text-sm font-medium text-gray-500">
        We&apos;ll notify you when we have a candidate near you.
      </div>
    );
  } else {
    // Sample candidate: review + agree to terms while waiting.
    cta = (
      <button type="button" onClick={() => setShowTerms(true)} className={ctaClass}>
        Review Terms &amp; Conditions →
      </button>
    );
  }

  if (variant === "sticky") {
    return (
      <>
        <div className={stickyWrap} style={stickyStyle}>{cta}</div>
        {modals}
      </>
    );
  }
  return (
    <>
      <div className={cardWrap(variant === "inline")}>
        <div className="flex items-start gap-3">
          {duBose}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Want to hire {isSample ? "a caregiver like this" : firstName}?
            </p>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              {isSample
                ? "Review the program terms, then schedule interviews once your first students are ready."
                : "Schedule an interview to meet this student caregiver."}
            </p>
          </div>
        </div>
        {cta}
      </div>
      {modals}
    </>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}
