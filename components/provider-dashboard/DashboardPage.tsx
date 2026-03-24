"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderDashboardData } from "@/hooks/useProviderDashboardData";
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
import EditOverviewModal from "./edit-modals/EditOverviewModal";
import EditGalleryModal from "./edit-modals/EditGalleryModal";
import EditCareServicesModal from "./edit-modals/EditCareServicesModal";
import EditStaffScreeningModal from "./edit-modals/EditStaffScreeningModal";
import EditAboutModal from "./edit-modals/EditAboutModal";
import EditPricingModal from "./edit-modals/EditPricingModal";
import EditPaymentModal from "./edit-modals/EditPaymentModal";
import EditOwnerModal from "./edit-modals/EditOwnerModal";

export default function DashboardPage() {
  const profile = useProviderProfile();
  const { metadata } = useProviderDashboardData(profile);
  const { refreshAccountData } = useAuth();

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
  const completeness = calculateProfileCompleteness(profile, meta);

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
}: {
  profile: NonNullable<ReturnType<typeof useProviderProfile>>;
  meta: ExtendedMetadata;
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  sectionPercent: (id: string) => number;
  editingSection: SectionId | null;
  setEditingSection: (s: SectionId | null) => void;
  refreshAccountData: () => Promise<void>;
}) {
  const guided = useGuidedOnboarding(completeness);
  const [showCompletenessSheet, setShowCompletenessSheet] = useState(false);

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
      <DashboardHeader slug={profile.slug} />

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
            className="sticky top-24"
            style={{
              animation: "card-enter 0.25s ease-out both",
              animationDelay: "450ms",
            }}
          >
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
    </div>
    </div>
  );
}

// ── Page header with action buttons ──

function DashboardHeader({ slug }: { slug: string | null }) {
  const [copied, setCopied] = useState(false);

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
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 font-display">Dashboard</h1>
        <p className="text-sm lg:text-[15px] text-gray-500 mt-0.5 lg:mt-1">Manage your listing and track your profile</p>
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
