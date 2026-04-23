"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderDashboardData } from "@/hooks/useProviderDashboardData";
import { useProviderDashboardV2Data } from "@/hooks/useProviderDashboardV2Data";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGuidedOnboarding } from "@/hooks/useGuidedOnboarding";
import {
  calculateProfileCompleteness,
  type ExtendedMetadata,
} from "@/lib/profile-completeness";
import type { SectionId } from "./edit-modals/types";
import ProfileOverviewCard from "./ProfileOverviewCard";
import GalleryCard from "./GalleryCard";
import CareServicesCard from "./CareServicesCard";
import StaffScreeningCard from "./StaffScreeningCard";
import AboutCard from "./AboutCard";
import PricingCard from "./PricingCard";
import PaymentInsuranceCard from "./PaymentInsuranceCard";
import OwnerCard from "./OwnerCard";
import ProfileCompletenessSidebar from "./ProfileCompletenessSidebar";
import VerificationStatusCard from "./VerificationStatusCard";
import VerificationFormModal from "@/components/provider/VerificationFormModal";
import type { VerificationSubmission, ExistingVerificationData } from "@/components/provider/VerificationFormModal";
import EditOverviewModal from "./edit-modals/EditOverviewModal";
import EditGalleryModal from "./edit-modals/EditGalleryModal";
import EditCareServicesModal from "./edit-modals/EditCareServicesModal";
import EditStaffScreeningModal from "./edit-modals/EditStaffScreeningModal";
import EditAboutModal from "./edit-modals/EditAboutModal";
import EditPricingModal from "./edit-modals/EditPricingModal";
import EditPaymentModal from "./edit-modals/EditPaymentModal";
import EditOwnerModal from "./edit-modals/EditOwnerModal";
import DashboardHero from "./v2/DashboardHero";
import RecentActivityCard from "./v2/RecentActivityCard";
import CohortContextCard from "./v2/CohortContextCard";
import ReviewInvitationsCard from "./v2/ReviewInvitationsCard";
import TrafficSummaryCard from "./v2/TrafficSummaryCard";

// Phase 2 redesign gate — same flag the Phase 1 onboard teaser uses, so
// the onboard teaser's "See your analytics →" CTA and the new dashboard
// experience flip on together.
const DASHBOARD_V2_ENABLED =
  process.env.NEXT_PUBLIC_FF_PROVIDER_ANALYTICS_ONBOARD === "true";

export default function DashboardPage() {
  const profile = useProviderProfile();
  const { metadata } = useProviderDashboardData(profile);
  const { user, refreshAccountData } = useAuth();

  // Phase 2 dashboard data (greeting, activity, reviews, cohort) — only
  // fetched when the feature flag is on, to avoid a wasted network round-trip
  // for providers still on the old layout.
  // Passing user?.id makes the hook refetch when auth resolves — covers the
  // first-load-401 race where the session cookie lands after mount.
  const v2 = useProviderDashboardV2Data("30d", DASHBOARD_V2_ENABLED, user?.id);

  // Modal state
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);

  // Only show skeleton if we don't have a profile yet
  // Metadata is returned immediately (base data), enrichment happens in background
  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main content skeleton */}
          <div className="lg:col-span-2 space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6"
              >
                <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
                <div className="space-y-3">
                  <div className="h-4 w-full bg-gray-100 rounded" />
                  <div className="h-4 w-3/4 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
          {/* Sidebar skeleton */}
          <div className="lg:col-span-1">
            <div className="animate-pulse bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
              <div className="h-5 w-44 bg-gray-200 rounded mb-6" />
              <div className="flex justify-center mb-6">
                <div className="w-[100px] h-[100px] rounded-full bg-gray-100" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-4 bg-gray-100 rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  }

  const meta = metadata as ExtendedMetadata;

  // Under FF: pass reviews + response-rate summaries into the completeness
  // calculation so the sidebar shows 9 sections instead of 7. When the
  // dashboard endpoint is still loading we fall back to 7 sections; score
  // tightens up once data arrives (one-time transition, not janky because
  // the sidebar itself updates without rearranging other sections).
  const reviewsSummary = DASHBOARD_V2_ENABLED && v2.data
    ? { count: v2.data.reviews.count, avgRating: v2.data.reviews.avgRating }
    : undefined;
  const responseRateSummary = DASHBOARD_V2_ENABLED && v2.data
    ? {
        totalQuestions: v2.data.responseRate.totalQuestions,
        answeredCount: v2.data.responseRate.answeredCount,
      }
    : undefined;

  const completeness = calculateProfileCompleteness(
    profile,
    meta,
    reviewsSummary,
    responseRateSummary,
  );

  // Helper to get a specific section's percent
  const sectionPercent = (id: string) =>
    completeness.sections.find((s) => s.id === id)?.percent ?? 0;

  return (
    <DashboardContent
      profile={profile}
      meta={meta}
      completeness={completeness}
      sectionPercent={sectionPercent}
      editingSection={editingSection}
      setEditingSection={setEditingSection}
      refreshAccountData={refreshAccountData}
      userEmail={user?.email}
      v2Data={DASHBOARD_V2_ENABLED ? v2.data : null}
      v2Loading={DASHBOARD_V2_ENABLED && v2.loading && !v2.data}
    />
  );
}

// Extracted to a separate component so hooks (useGuidedOnboarding) can be called
// after completeness is computed (hooks can't be called conditionally).
function DashboardContent({
  profile,
  meta,
  completeness,
  sectionPercent,
  editingSection,
  setEditingSection,
  refreshAccountData,
  userEmail,
  v2Data,
  v2Loading,
}: {
  profile: NonNullable<ReturnType<typeof useProviderProfile>>;
  meta: ExtendedMetadata;
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  sectionPercent: (id: string) => number;
  editingSection: SectionId | null;
  setEditingSection: (s: SectionId | null) => void;
  userEmail?: string;
  refreshAccountData: () => Promise<void>;
  v2Data: import("@/hooks/useProviderDashboardV2Data").ProviderDashboardV2Data | null;
  v2Loading: boolean;
}) {
  const guided = useGuidedOnboarding(completeness);
  const [showCompletenessSheet, setShowCompletenessSheet] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationExistingData, setVerificationExistingData] = useState<ExistingVerificationData | undefined>();
  const [isVerificationUpdate, setIsVerificationUpdate] = useState(false);

  // Open verification modal (can be called with existing data for updates)
  const handleOpenVerificationModal = useCallback((existingData?: ExistingVerificationData) => {
    setVerificationExistingData(existingData);
    setIsVerificationUpdate(!!existingData);
    setShowVerificationModal(true);
  }, []);

  // Handle verification submission
  const handleVerificationSubmit = useCallback(async (data: VerificationSubmission) => {
    const response = await fetch("/api/provider/verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        submission: data,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to submit verification");
    }

    // Refresh profile data to get updated verification state
    await refreshAccountData();
    setShowVerificationModal(false);
    // Reset state for next time
    setVerificationExistingData(undefined);
    setIsVerificationUpdate(false);
  }, [profile.id, refreshAccountData]);

  const handleEdit = useCallback(
    (sectionId: SectionId) => setEditingSection(sectionId),
    [setEditingSection]
  );

  const handleCloseModal = useCallback(() => {
    setEditingSection(null);
    if (guided.isGuidedActive) {
      guided.stopGuided();
    }
  }, [setEditingSection, guided]);

  const handleSaved = useCallback(async () => {
    await refreshAccountData();
    if (guided.isGuidedActive && editingSection) {
      const next = guided.getNextSection(editingSection);
      if (next) {
        setEditingSection(next);
      } else {
        setEditingSection(null);
        guided.stopGuided();
      }
    } else {
      setEditingSection(null);
    }
  }, [refreshAccountData, guided, editingSection, setEditingSection]);

  const handleGuidedBack = useCallback(() => {
    if (editingSection) {
      const prev = guided.getPrevSection(editingSection);
      if (prev) {
        setEditingSection(prev);
      }
    }
  }, [editingSection, guided, setEditingSection]);

  // Shared modal props
  const modalProps = {
    profile,
    metadata: meta,
    onClose: handleCloseModal,
    onSaved: handleSaved,
    guidedMode: guided.isGuidedActive,
    guidedStep: editingSection ? guided.getStepNumber(editingSection) : 1,
    guidedTotal: guided.totalSteps,
    onGuidedBack: editingSection && guided.getPrevSection(editingSection)
      ? handleGuidedBack
      : undefined,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <DashboardHeader profile={profile} />

      {/* Guided onboarding banner */}
      {guided.shouldPrompt && !guided.isGuidedActive && (
        <div
          className="mb-6 bg-gradient-to-r from-primary-50 to-vanilla-50 rounded-2xl border border-primary-100/60 p-5 flex items-center justify-between"
          style={{ animation: "card-enter 0.25s ease-out both" }}
        >
          <div>
            <p className="text-[15px] font-semibold text-gray-900">
              Complete your profile to attract more families
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              We&apos;ll guide you through each section step by step.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={guided.dismiss}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors px-3 py-2 min-h-[44px] flex items-center"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                guided.startGuided();
                if (guided.firstIncompleteSection) {
                  setEditingSection(guided.firstIncompleteSection);
                }
              }}
              className="px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors min-h-[44px] flex items-center"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Mobile badge request card - hidden on desktop, shown if badge not approved and (no submission OR rejected) */}
      {(() => {
        const meta = profile.metadata as { badge_approved?: boolean; badge_rejected?: boolean; verification_submission?: unknown } | null;
        const wasRejected = meta?.badge_rejected === true;
        const hasSubmission = !!meta?.verification_submission;
        // Show if: not approved AND (no submission OR was rejected)
        const shouldShowMobileBadgeCard = !meta?.badge_approved && (!hasSubmission || wasRejected);
        return shouldShowMobileBadgeCard ? (
          <div className="lg:hidden mb-4">
            <MobileBadgeRequestCard onRequestBadge={() => handleOpenVerificationModal()} wasRejected={wasRejected} />
          </div>
        ) : null;
      })()}

      {/* Phase 2 pillars. Render a skeleton while v2 is loading so the page
          doesn't flash the old layout first (which looks like a regression). */}
      {v2Loading && <DashboardPillarsSkeleton />}
      {v2Data && (
        <>
          <DashboardHero
            firstName={deriveFirstName(profile.display_name)}
            data={v2Data}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mb-2">
            <div className="lg:col-span-2 space-y-6">
              <RecentActivityCard data={v2Data} />
              <CohortContextCard data={v2Data} />
            </div>
            <div className="lg:col-span-1 space-y-6">
              <TrafficSummaryCard data={v2Data} />
              <ReviewInvitationsCard data={v2Data} />
            </div>
          </div>
        </>
      )}

      {/* Mobile progress banner - hidden on desktop */}
      <MobileProgressBanner
        completeness={completeness}
        onTap={() => setShowCompletenessSheet(true)}
      />

      {/* Mobile completeness bottom sheet */}
      <MobileCompletenessSheet
        isOpen={showCompletenessSheet}
        onClose={() => setShowCompletenessSheet(false)}
        completeness={completeness}
        lastUpdated={profile.updated_at}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Main content — staggered entrance */}
        <div className="lg:col-span-2 space-y-6">
          {[
            <ProfileOverviewCard
              key="overview"
              profile={profile}
              completionPercent={sectionPercent("overview")}
              onEdit={() => handleEdit("overview")}
              onVerifyClick={() => handleOpenVerificationModal()}
            />,
            <GalleryCard
              key="gallery"
              metadata={meta}
              completionPercent={sectionPercent("gallery")}
              onEdit={() => handleEdit("gallery")}
            />,
            <CareServicesCard
              key="services"
              profile={profile}
              completionPercent={sectionPercent("services")}
              onEdit={() => handleEdit("services")}
            />,
            <StaffScreeningCard
              key="screening"
              metadata={meta}
              completionPercent={sectionPercent("screening")}
              onEdit={() => handleEdit("screening")}
            />,
            <AboutCard
              key="about"
              profile={profile}
              metadata={meta}
              completionPercent={sectionPercent("about")}
              onEdit={() => handleEdit("about")}
            />,
            <PricingCard
              key="pricing"
              metadata={meta}
              completionPercent={sectionPercent("pricing")}
              onEdit={() => handleEdit("pricing")}
            />,
            <PaymentInsuranceCard
              key="payment"
              metadata={meta}
              completionPercent={sectionPercent("payment")}
              onEdit={() => handleEdit("payment")}
            />,
            <OwnerCard
              key="owner"
              metadata={meta}
              onEdit={() => handleEdit("owner")}
            />,
            <NotificationPreferencesCard key="notifications" profileSlug={profile.slug} profileMetadata={meta} />,
          ].map((card, i) => (
            <div
              key={i}
              style={{
                animation: "card-enter 0.25s ease-out both",
                animationDelay: `${i * 60}ms`,
              }}
            >
              {card}
            </div>
          ))}
        </div>

        {/* Sidebar - hidden on mobile */}
        <div className="hidden lg:block lg:col-span-1">
          <div
            className="sticky top-24 space-y-4"
            style={{
              animation: "card-enter 0.25s ease-out both",
              animationDelay: "450ms",
            }}
          >
            {/* Badge request card - shown if form not submitted or was rejected */}
            <VerificationStatusCard
              metadata={profile.metadata as { verification_submission?: { name: string; role: string; phone?: string | null; submitted_at: string }; badge_approved?: boolean; badge_rejected?: boolean } | null}
              onRequestVerification={handleOpenVerificationModal}
            />

            <ProfileCompletenessSidebar
              completeness={completeness}
              lastUpdated={profile.updated_at}
            />
          </div>
        </div>
      </div>

      {/* Edit Modals */}
      {editingSection === "overview" && <EditOverviewModal {...modalProps} />}
      {editingSection === "gallery" && <EditGalleryModal {...modalProps} />}
      {editingSection === "services" && <EditCareServicesModal {...modalProps} />}
      {editingSection === "screening" && <EditStaffScreeningModal {...modalProps} />}
      {editingSection === "about" && <EditAboutModal {...modalProps} />}
      {editingSection === "pricing" && <EditPricingModal {...modalProps} />}
      {editingSection === "payment" && <EditPaymentModal {...modalProps} />}
      {editingSection === "owner" && <EditOwnerModal {...modalProps} />}

      {/* Verification Modal */}
      <VerificationFormModal
        isOpen={showVerificationModal}
        onClose={() => {
          setShowVerificationModal(false);
          setVerificationExistingData(undefined);
          setIsVerificationUpdate(false);
        }}
        onSubmit={handleVerificationSubmit}
        businessName={profile.display_name}
        userEmail={userEmail}
        allowDismiss={!isVerificationUpdate}
        onDismiss={() => {
          setShowVerificationModal(false);
          setVerificationExistingData(undefined);
          setIsVerificationUpdate(false);
        }}
        existingData={verificationExistingData}
        isUpdate={isVerificationUpdate}
      />

    </div>
    </div>
  );
}

// ── Page header with action buttons ──

interface DashboardHeaderProps {
  profile: NonNullable<ReturnType<typeof useProviderProfile>>;
}

function DashboardHeader({ profile }: DashboardHeaderProps) {
  const [copied, setCopied] = useState(false);
  const slug = profile.slug;

  const handleShare = () => {
    if (!slug) return;
    const url = `${window.location.origin}/provider/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 lg:gap-4 mb-4 lg:mb-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 font-display mb-0.5 lg:mb-1">Your profile</h1>
        <p className="text-sm lg:text-[15px] text-gray-500">Manage your profile and how families find you</p>
      </div>

      {slug && (
        <div className="flex items-center gap-2 lg:gap-3 w-full sm:w-auto">
          <Link
            href={`/provider/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl px-3 lg:px-4 py-2.5 shadow-xs hover:bg-gray-50 transition-all duration-200 min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="hidden sm:inline">Public view</span>
            <span className="sm:hidden">View</span>
          </Link>
          <button
            onClick={handleShare}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl px-3 lg:px-4 py-2.5 shadow-sm transition-all duration-200 min-h-[44px]"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden sm:inline">Share profile</span>
                <span className="sm:hidden">Share</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Mobile progress banner (visible only on mobile) ──

function MobileProgressBanner({
  completeness,
  onTap,
}: {
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  onTap: () => void;
}) {
  const completedCount = completeness.sections.filter(
    (s) => s.percent >= 100
  ).length;
  const totalSections = completeness.sections.length;

  return (
    <button
      type="button"
      onClick={onTap}
      className="lg:hidden w-full mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3 text-left active:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        {/* Progress ring */}
        <div className="relative w-10 h-10 shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle
              cx="20" cy="20" r="16" fill="none"
              stroke="#199087"
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${completeness.overall * 1.005} 100.5`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
            {completeness.overall}%
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Profile completeness</p>
          <p className="text-xs text-gray-500">{completedCount} of {totalSections} sections</p>
        </div>

        {/* Chevron */}
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ── Mobile badge request card (visible only on mobile when badge not requested/approved yet) ──

function MobileBadgeRequestCard({
  onRequestBadge,
  wasRejected = false,
}: {
  onRequestBadge: () => void;
  wasRejected?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${wasRejected ? "bg-amber-100" : "bg-primary-100"}`}>
          <svg className={`w-5 h-5 ${wasRejected ? "text-amber-600" : "text-primary-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-gray-900">
            {wasRejected ? "Resubmit for Badge" : "Get Verified Badge"}
          </h4>
          <p className="text-sm text-gray-500 mt-0.5">
            {wasRejected ? "Your previous request needs attention" : "Stand out to families with a trust badge"}
          </p>
          <button
            type="button"
            onClick={onRequestBadge}
            className="mt-3 w-full py-2.5 text-sm font-semibold rounded-xl transition-colors text-white bg-gray-900 hover:bg-gray-800"
          >
            {wasRejected ? "Resubmit Request" : "Get Verified"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mobile completeness bottom sheet ──

function MobileCompletenessSheet({
  isOpen,
  onClose,
  completeness,
  lastUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  lastUpdated: string;
}) {
  const formattedDate = new Date(lastUpdated).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const getStatusText = (percent: number): string => {
    if (percent >= 100) return "ALL DONE!";
    if (percent >= 76) return "NEARLY COMPLETE!";
    if (percent >= 51) return "LOOKING GOOD!";
    if (percent >= 26) return "ALMOST THERE!";
    return "JUST GETTING STARTED";
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 lg:hidden"
        onClick={onClose}
        style={{ animation: "fade-in 0.2s ease-out both" }}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden bg-white rounded-t-3xl shadow-xl max-h-[85dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        style={{ animation: "slide-up 0.3s ease-out both" }}
      >
        {/* Handle */}
        <div className="sticky top-0 bg-white pt-3 pb-2 px-6 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-display font-bold text-gray-900">
              Profile completeness
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Circular progress */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-28 h-28 mb-3">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#199087"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${completeness.overall * 2.64} 264`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{completeness.overall}%</span>
              </div>
            </div>
            <p className="text-sm font-semibold tracking-wide uppercase text-gray-900 font-display">
              {getStatusText(completeness.overall)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Last updated: {formattedDate}
            </p>
          </div>

          {/* Section checklist */}
          <div className="space-y-1">
            {completeness.sections.map((section) => {
              const isComplete = section.percent >= 100;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={onClose}
                  className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl hover:bg-vanilla-50 active:bg-vanilla-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isComplete ? (
                      <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0" />
                    )}
                    <span className={`text-[15px] ${isComplete ? "text-primary-600 font-medium" : "text-gray-700"}`}>
                      {section.label}
                    </span>
                  </div>
                  {!isComplete && (
                    <span className="text-sm font-medium text-primary-600">
                      {section.percent}%
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>

        {/* Safe area padding for iPhone */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ── Notification preferences card ──

function NotificationPreferencesCard({
  profileSlug,
  profileMetadata,
}: {
  profileSlug: string | null;
  profileMetadata: ExtendedMetadata;
}) {
  const [unsubscribed, setUnsubscribed] = useState(!!(profileMetadata as Record<string, unknown>)?.leads_unsubscribed);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (!profileSlug) return;
    setSaving(true);
    const newValue = !unsubscribed;
    try {
      const res = await fetch("/api/providers/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: profileSlug, unsubscribe: newValue }),
      });
      if (res.ok) {
        setUnsubscribed(newValue);
      }
    } catch {
      // revert on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
      <h3 className="text-lg font-display font-bold text-gray-900 mb-1">Email preferences</h3>
      <p className="text-sm text-gray-400 mb-5">Control which emails you receive from Olera.</p>

      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-[15px] font-medium text-gray-900">Lead notifications</p>
          <p className="text-sm text-gray-400 mt-0.5">
            Get notified when families reach out to your listing
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!unsubscribed}
          onClick={handleToggle}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${
            !unsubscribed ? "bg-primary-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              !unsubscribed ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function deriveFirstName(displayName: string | null): string {
  if (!displayName) return "there";
  const first = displayName.trim().split(/\s+/)[0];
  // Business names often come first (e.g. "Aggie Assisted Living" → "Aggie").
  // That reads slightly weirdly as a greeting but it's better than "there" for
  // most providers. True personalization awaits a provider-name field.
  return first || "there";
}

/**
 * Placeholder for the Phase 2 pillars while v2Data is loading. Matches the
 * grid shape of the real layout (hero row + 2/3 + 1/3 columns) so the page
 * doesn't shift when real content lands.
 */
function DashboardPillarsSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      {/* Hero */}
      <div className="rounded-2xl bg-white border border-gray-100 p-6 mb-6">
        <div className="h-3 w-40 bg-gray-100 rounded mb-4" />
        <div className="h-7 w-80 max-w-full bg-gray-100 rounded mb-3" />
        <div className="h-4 w-64 max-w-full bg-gray-100 rounded mb-5" />
        <div className="h-4 w-32 bg-gray-100 rounded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mb-2">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-white border border-gray-100 p-6">
            <div className="h-3 w-32 bg-gray-100 rounded mb-5" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-gray-100 rounded" />
                    <div className="h-3 w-1/2 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-6">
            <div className="h-3 w-36 bg-gray-100 rounded mb-4" />
            <div className="h-5 w-64 max-w-full bg-gray-100 rounded mb-2" />
            <div className="h-4 w-48 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-2xl bg-white border border-gray-100 p-6">
            <div className="h-3 w-16 bg-gray-100 rounded mb-4" />
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="h-7 w-12 bg-gray-100 rounded" />
              <div className="h-7 w-12 bg-gray-100 rounded" />
            </div>
            <div className="h-4 w-40 bg-gray-100 rounded pt-4 border-t border-gray-100" />
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-6">
            <div className="h-3 w-28 bg-gray-100 rounded mb-3" />
            <div className="h-7 w-20 bg-gray-100 rounded mb-3" />
            <div className="h-4 w-full bg-gray-100 rounded mb-2" />
            <div className="h-4 w-2/3 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
