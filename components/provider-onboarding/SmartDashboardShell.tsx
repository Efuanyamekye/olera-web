"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Provider } from "@/lib/types/provider";
import type { Profile, OrganizationMetadata } from "@/lib/types";
import { parseProviderImages, getPrimaryImage } from "@/lib/types/provider";
import {
  calculateProfileCompleteness,
  type ExtendedMetadata,
} from "@/lib/profile-completeness";
import { useNavbar } from "@/components/shared/NavbarContext";

// Dashboard card components (reused in preview mode)
import ProfileOverviewCard from "@/components/provider-dashboard/ProfileOverviewCard";
import GalleryCard from "@/components/provider-dashboard/GalleryCard";
import CareServicesCard from "@/components/provider-dashboard/CareServicesCard";
import StaffScreeningCard from "@/components/provider-dashboard/StaffScreeningCard";
import AboutCard from "@/components/provider-dashboard/AboutCard";
import PricingCard from "@/components/provider-dashboard/PricingCard";
import PaymentInsuranceCard from "@/components/provider-dashboard/PaymentInsuranceCard";
import ProfileCompletenessSidebar from "@/components/provider-dashboard/ProfileCompletenessSidebar";

// Onboarding components
import OnboardingWizard from "./OnboardingWizard";
import ActionCard, { type ActionCardState } from "./ActionCard";
import NotificationBanner, { type NotificationData } from "./NotificationBanner";

// ============================================================
// Onboarding Header (replaces main navbar during claim flow)
// ============================================================

function OnboardingHeader({ providerName }: { providerName: string }) {
  const handleBack = () => {
    // Go back to previous page
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 shrink-0">
            <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
            <span className="text-xl font-bold text-gray-900">Olera</span>
          </Link>

          {/* Center: Claiming context */}
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <span className="text-gray-400">Claiming:</span>
            <span className="font-medium text-gray-700 truncate max-w-[200px] md:max-w-[300px]">
              {providerName}
            </span>
          </div>

          {/* Right: Back button - outlined style matching "Save & exit" */}
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-base font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Mobile: Show provider name below */}
      <div className="sm:hidden border-t border-gray-50 px-4 py-2 bg-gray-50/50">
        <p className="text-xs text-gray-400">
          Claiming: <span className="font-medium text-gray-600">{providerName}</span>
        </p>
      </div>
    </header>
  );
}

// ============================================================
// Mobile Progress Banner (matches DashboardPage)
// ============================================================

function MobileProgressBanner({
  completeness,
}: {
  completeness: ReturnType<typeof calculateProfileCompleteness>;
}) {
  const completedCount = completeness.sections.filter(
    (s) => s.percent >= 100
  ).length;
  const totalSections = completeness.sections.length;

  return (
    <div className="lg:hidden w-full mb-5 bg-white rounded-xl border border-gray-200/80 shadow-sm px-4 py-3">
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

        {/* Info icon (non-interactive in preview) */}
        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper: Convert iOS Provider to Profile shape
// ============================================================

const iosCategoryMap: Record<string, Profile["category"]> = {
  "Home Care (Non-medical)": "home_care_agency",
  "Home Health Care": "home_health_agency",
  "Assisted Living": "assisted_living",
  "Independent Living": "independent_living",
  "Memory Care": "memory_care",
  "Nursing Home": "nursing_home",
  "Hospice": "hospice_agency",
  "Assisted Living | Independent Living": "assisted_living",
  "Memory Care | Assisted Living": "memory_care",
};

function providerToProfile(provider: Provider): Profile {
  const images = parseProviderImages(provider.provider_images);
  const primaryImage = getPrimaryImage(provider);

  const isHourly =
    provider.provider_category === "Home Care (Non-medical)" ||
    provider.provider_category === "Home Health Care";

  const priceRange =
    provider.lower_price != null || provider.upper_price != null
      ? `$${provider.lower_price ?? "?"} - $${provider.upper_price ?? "?"}${isHourly ? "/hr" : "/mo"}`
      : undefined;

  const metadata: OrganizationMetadata & ExtendedMetadata = {
    price_range: priceRange,
    images: images.length > 0 ? images : primaryImage ? [primaryImage] : [],
  };

  const careTypes: string[] = [provider.provider_category];
  if (provider.main_category && provider.main_category !== provider.provider_category) {
    careTypes.push(provider.main_category);
  }

  return {
    id: provider.provider_id,
    account_id: null,
    source_provider_id: provider.provider_id,
    slug: provider.slug || provider.provider_id,
    type: "organization",
    category: iosCategoryMap[provider.provider_category] || "assisted_living",
    display_name: provider.provider_name,
    description: provider.provider_description,
    image_url: primaryImage,
    phone: provider.phone,
    email: provider.email,
    website: provider.website,
    address: provider.address,
    city: provider.city,
    state: provider.state,
    zip: provider.zipcode?.toString() || null,
    lat: provider.lat,
    lng: provider.lon,
    service_area: provider.city && provider.state ? `${provider.city}, ${provider.state}` : null,
    care_types: careTypes,
    metadata,
    claim_state: "unclaimed",
    verification_state: "unverified",
    source: "seeded",
    is_active: !provider.deleted,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ============================================================
// Component Props
// ============================================================

interface SmartDashboardShellProps {
  provider: Provider;
  claimSession: string;
  onVerificationComplete: () => void;
  /** Initial state for the action card */
  initialActionState?: ActionCardState;
  /** If provided, user came from email campaign link and is pre-verified */
  preVerifiedEmail?: string;
  /** Notification data (lead/review/question) that brought the user here */
  notificationData?: NotificationData | null;
}

// ============================================================
// Main Component
// ============================================================

export default function SmartDashboardShell({
  provider,
  claimSession,
  onVerificationComplete,
  initialActionState = "verify-form",
  preVerifiedEmail,
  notificationData,
}: SmartDashboardShellProps) {
  const { setForceHidden } = useNavbar();

  // Convert provider to profile shape
  const profile = useMemo(() => providerToProfile(provider), [provider]);
  const metadata = profile.metadata as ExtendedMetadata;

  // Calculate completeness from public data
  const completeness = useMemo(
    () => calculateProfileCompleteness(profile, metadata),
    [profile, metadata]
  );

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardComplete, setWizardComplete] = useState(
    // Skip wizard if already showing verification states
    initialActionState !== "verify-form" || !!preVerifiedEmail
  );
  const [highlightAction, setHighlightAction] = useState(false);

  // Action card state - derived from initial + wizard completion
  const [actionCardState, setActionCardState] = useState<ActionCardState>(
    preVerifiedEmail ? "pre-verified" : initialActionState
  );

  // Handle wizard completion
  const handleWizardComplete = useCallback(() => {
    setWizardComplete(true);
  }, []);

  // Hide main navbar only after wizard completes
  useEffect(() => {
    if (wizardComplete) {
      setForceHidden(true);
    }
    return () => setForceHidden(false);
  }, [wizardComplete, setForceHidden]);

  // Handle click on preview cards - scroll to top and highlight ActionCard
  const handlePreviewCardClick = useCallback(() => {
    setHighlightAction(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Reset highlight after animation
  useEffect(() => {
    if (highlightAction) {
      const timer = setTimeout(() => setHighlightAction(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightAction]);

  // Helper to get section completion percent
  const sectionPercent = (id: string) =>
    completeness.sections.find((s) => s.id === id)?.percent ?? 0;

  // Determine which elements are highlighted based on wizard step
  const isSidebarHighlighted = !wizardComplete && wizardStep === 0;
  const isWizardActive = !wizardComplete;

  return (
    <div className={`min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white ${wizardComplete ? "pt-16" : ""}`}>
      {/* Custom Onboarding Header - only shown after wizard completes (fixed position) */}
      {wizardComplete && <OnboardingHeader providerName={provider.provider_name} />}

      {/* Main Content - py-8 matches provider dashboard spacing */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile Progress Banner */}
        <MobileProgressBanner completeness={completeness} />

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main Content - Cards */}
          <div className={`lg:col-span-2 space-y-6 ${isWizardActive ? "opacity-40 blur-[2px]" : ""}`}>
            {/* Notification Banner - shows why they're here (lead/review/question) */}
            {notificationData && (
              <NotificationBanner
                data={notificationData}
                providerName={provider.provider_name}
              />
            )}

            {/* Action Card - verification/claim flow */}
            <ActionCard
              provider={provider}
              claimSession={claimSession}
              initialState={actionCardState}
              onVerificationComplete={onVerificationComplete}
              preVerifiedEmail={preVerifiedEmail}
              highlighted={highlightAction}
            />

            {/* Dashboard Cards - clickable to trigger verification prompt */}
            {[
              <ProfileOverviewCard
                key="overview"
                profile={profile}
                completionPercent={sectionPercent("overview")}
                onEdit={undefined}
              />,
              <GalleryCard
                key="gallery"
                metadata={metadata}
                completionPercent={sectionPercent("gallery")}
                onEdit={undefined}
              />,
              <CareServicesCard
                key="services"
                profile={profile}
                completionPercent={sectionPercent("services")}
                onEdit={undefined}
              />,
              <StaffScreeningCard
                key="screening"
                metadata={metadata}
                completionPercent={sectionPercent("screening")}
                onEdit={undefined}
              />,
              <AboutCard
                key="about"
                profile={profile}
                metadata={metadata}
                completionPercent={sectionPercent("about")}
                onEdit={undefined}
              />,
              <PricingCard
                key="pricing"
                metadata={metadata}
                completionPercent={sectionPercent("pricing")}
                onEdit={undefined}
              />,
              <PaymentInsuranceCard
                key="payment"
                metadata={metadata}
                completionPercent={sectionPercent("payment")}
                onEdit={undefined}
              />,
            ].map((card, i) => (
              <div
                key={i}
                onClick={handlePreviewCardClick}
                className="cursor-pointer"
                style={{
                  animation: "card-enter 0.25s ease-out both",
                  animationDelay: `${(i + 2) * 60}ms`,
                }}
              >
                {card}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div
            data-wizard-target="sidebar"
            className={`hidden lg:block lg:col-span-1 ${isWizardActive && !isSidebarHighlighted ? "opacity-40 blur-[2px]" : ""} ${isSidebarHighlighted ? "relative z-50" : ""}`}
          >
            <div
              className={`sticky top-24 ${isSidebarHighlighted ? "ring-2 ring-primary-400 ring-offset-4 rounded-2xl" : ""}`}
              style={{
                animation: "card-enter 0.25s ease-out both",
                animationDelay: "540ms",
              }}
            >
              <ProfileCompletenessSidebar
                completeness={completeness}
                lastUpdated={profile.updated_at}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Wizard (only when wizard not complete) */}
      {!wizardComplete && (
        <OnboardingWizard
          step={wizardStep}
          onNext={() => {
            if (wizardStep < 2) {
              setWizardStep(wizardStep + 1);
            } else {
              handleWizardComplete();
            }
          }}
          onComplete={handleWizardComplete}
        />
      )}
    </div>
  );
}
