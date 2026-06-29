"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProviderDashboardData } from "@/hooks/useProviderDashboardData";
import { useProviderDashboardV2Data } from "@/hooks/useProviderDashboardV2Data";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGuidedOnboarding } from "@/hooks/useGuidedOnboarding";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";
import {
  calculateProfileCompleteness,
  type ExtendedMetadata,
} from "@/lib/profile-completeness";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import type { SectionId } from "./edit-modals/types";
import ProfileOverviewCard from "./ProfileOverviewCard";
import GalleryCard from "./GalleryCard";
import CareServicesCard from "./CareServicesCard";
import StaffScreeningCard from "./StaffScreeningCard";
import AboutCard from "./AboutCard";
import PricingCard from "./PricingCard";
import PaymentInsuranceCard from "./PaymentInsuranceCard";
import OwnerCard from "./OwnerCard";
import HireCaregiversCard from "./HireCaregiversCard";
import VerificationStatusCard from "./VerificationStatusCard";
import PostEditAdsNudge from "@/components/provider/PostEditAdsNudge";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import EditOverviewModal from "./edit-modals/EditOverviewModal";
import EditGalleryModal from "./edit-modals/EditGalleryModal";
import EditCareServicesModal from "./edit-modals/EditCareServicesModal";
import EditStaffScreeningModal from "./edit-modals/EditStaffScreeningModal";
import EditAboutModal from "./edit-modals/EditAboutModal";
import EditPricingModal from "./edit-modals/EditPricingModal";
import EditPaymentModal from "./edit-modals/EditPaymentModal";
import EditOwnerModal from "./edit-modals/EditOwnerModal";
import EditHireCaregiversModal from "./edit-modals/EditHireCaregiversModal";
import DashboardHero, { type HeroAction } from "./v2/DashboardHero";
import DashboardHeroSkeleton from "./v2/DashboardHeroSkeleton";
import FamilyViewPreview from "./FamilyViewPreview";

// Editable profile sections a `?edit=<section>` deep-link may target (e.g. from
// completion-carrot emails). Mirrors the SectionId union; needed at runtime to
// validate the URL param since SectionId is a compile-time type only.
const EDITABLE_SECTIONS: readonly SectionId[] = [
  "overview",
  "gallery",
  "services",
  "screening",
  "about",
  "pricing",
  "payment",
  "owner",
  "hire_caregivers",
];

export default function DashboardPage() {
  // The business_profile is the canonical, hydrated provider record (the
  // directory row is copied in at claim time), so read it directly.
  const profile = useProviderProfile();
  const { metadata } = useProviderDashboardData(profile);
  const { user, refreshAccountData } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Passing user?.id makes the hook refetch when auth resolves — covers the
  // first-load-401 race where the session cookie lands after mount.
  const v2 = useProviderDashboardV2Data("30d", true, user?.id);

  // Modal state
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);

  // Arrival tracking: when the dashboard mounts with `?from=qa-success`, the
  // provider just answered a question on /provider/[slug]/onboard and was
  // auto-redirected here. Fire one dashboard_arrival event so the admin Q&A
  // funnel can measure whether the redirect mechanic is working separately
  // from whether the dashboard hero successfully nudges them into action
  // (the existing edited_profile column tracks the latter). Strip the param
  // so reloads don't replay; ref-guarded so a re-render doesn't double-fire.
  const firedArrival = useRef(false);
  useEffect(() => {
    if (firedArrival.current) return;
    if (!profile) return;
    const fromParam = searchParams.get("from");
    if (!fromParam) return;
    firedArrival.current = true;
    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        actor_type: "provider",
        provider_id: profile.slug,
        event_type: "dashboard_arrival",
        metadata: { source: fromParam },
      }),
    }).catch(() => {
      /* fire-and-forget */
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("from");
    router.replace(url.pathname + (url.search ? url.search : ""));
  }, [profile, searchParams, router]);

  // Deep-link to a specific edit modal: a `?edit=<section>` link (the
  // completion-carrot email CTA, after /api/claim-complete mints the session)
  // lands the provider here with the relevant editor already open — "sell the
  // output, then drop them straight into filling it." Validate against the
  // editable sections, open once (ref-guarded), then strip the param so a
  // reload/back doesn't re-pop the modal.
  const openedEditParam = useRef(false);
  useEffect(() => {
    if (openedEditParam.current) return;
    if (!profile) return;
    const editParam = searchParams.get("edit");
    if (!editParam) return;
    if (!EDITABLE_SECTIONS.includes(editParam as SectionId)) return;
    openedEditParam.current = true;
    setEditingSection(editParam as SectionId);
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    router.replace(url.pathname + (url.search ? url.search : ""));
  }, [profile, searchParams, router]);

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
                className="animate-pulse bg-white rounded-2xl border border-gray-200/80 p-6"
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
            <div className="animate-pulse bg-white rounded-2xl border border-gray-200/80 p-6">
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

  // Pass reviews + response-rate summaries into the completeness calculation so
  // the sidebar shows 9 sections instead of 7. When the dashboard endpoint is
  // still loading we fall back to 7 sections; score tightens up once data
  // arrives (one-time transition, not janky because the sidebar itself updates
  // without rearranging other sections).
  const reviewsSummary = v2.data
    ? { count: v2.data.reviews.count, avgRating: v2.data.reviews.avgRating }
    : undefined;
  const responseRateSummary = v2.data
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
      v2Data={v2.data}
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
}: {
  profile: NonNullable<ReturnType<typeof useProviderProfile>>;
  meta: ExtendedMetadata;
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  sectionPercent: (id: string) => number;
  editingSection: SectionId | null;
  setEditingSection: (s: SectionId | null) => void;
  refreshAccountData: () => Promise<void>;
  userEmail?: string;
  v2Data: import("@/hooks/useProviderDashboardV2Data").ProviderDashboardV2Data | null;
}) {
  const guided = useGuidedOnboarding(completeness);
  const mobileNavVariant = useMobileNavVariant();
  const [showCompletenessSheet, setShowCompletenessSheet] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  // Mirrors the hero's chosen next-action so the mobile sticky bar shows the
  // same CTA the hero landed on this visit (set via DashboardHero's callback).
  const [heroAction, setHeroAction] = useState<HeroAction | null>(null);
  // "See your page as families do" — swaps the edit cards for the family-framed
  // ghosted preview (FamilyViewPreview). Ghost CTAs reuse handleEdit, so tapping
  // a gap opens that section's editor right over the preview.
  const [previewMode, setPreviewMode] = useState(false);

  // Post-edit Managed Ads nudge: shown once per session after a profile save.
  // Suppressed when the hero already resolved to the managed-ads banner this
  // visit, so the two managed-ads prompts never stack on one screen.
  const [showEditNudge, setShowEditNudge] = useState(false);
  const editNudgeShownRef = useRef(false);
  const [heroBannerId, setHeroBannerId] = useState<string | null>(null);

  // Verification modal state (for the verification feature, not edit gating)
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModal,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
    handleDismiss: handleVerificationDismiss,
  } = useVerificationModal({
    profileId: profile.id,
    onVerified: async () => {
      // Refresh profile data to get updated verification state
      await refreshAccountData();
    },
  });

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
    let finishedEditing = false;
    if (guided.isGuidedActive && editingSection) {
      const next = guided.getNextSection(editingSection);
      if (next) {
        setEditingSection(next);
      } else {
        // Guided run fully complete — that's a finish too.
        setEditingSection(null);
        guided.stopGuided();
        finishedEditing = true;
      }
    } else {
      setEditingSection(null);
      finishedEditing = true;
    }
    // Just-polished-my-page moment: surface the Managed Ads nudge once per
    // session. Editing is the one in-app action the engaged minority takes, so
    // it's the earned, high-intent time to pitch getting the page seen — vs an
    // always-on sidebar fixture.
    if (finishedEditing && !editNudgeShownRef.current && !previewMode) {
      editNudgeShownRef.current = true;
      setShowEditNudge(true);
    }
  }, [refreshAccountData, guided, editingSection, setEditingSection, previewMode]);

  const handleGuidedBack = useCallback(() => {
    if (editingSection) {
      const prev = guided.getPrevSection(editingSection);
      if (prev) {
        setEditingSection(prev);
      }
    }
  }, [editingSection, guided, setEditingSection]);

  // Verification state for status display (VerificationStatusCard)
  const verificationState = profile.verification_state as string | null;

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
    <div className="min-h-[100dvh] bg-gradient-to-b from-vanilla-50 via-white to-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8">
      <MobileCompletenessSheet
        isOpen={showCompletenessSheet}
        onClose={() => setShowCompletenessSheet(false)}
        completeness={completeness}
        lastUpdated={profile.updated_at}
      />

      {/* Page header — actions live in a utility bar ABOVE the title (never beside
          it), so the H1 is a full-width block and can't ladder one-word-per-line.
          In preview mode the editing header is hidden: the provider's name inside
          the preview is the de-facto title (it's their page). */}
      <div className="mb-6">
        {/* Preview-as-families is desktop-only: on mobile the "View public
            profile" link in the overview card opens the real live page — a
            better, more honest preview than the in-app ghost — so this button
            is redundant chrome stealing prime top space. hidden lg:flex keeps
            it off phones and collapses the row so the title leads cleanly. */}
        <div className={previewMode ? "hidden lg:flex lg:justify-start" : "hidden lg:flex lg:justify-end"}>
          <button
            onClick={() => setPreviewMode((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 lg:px-4 py-2.5 text-sm font-medium text-gray-600 shadow-xs transition-all hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          >
            {previewMode ? (
              <>
                <span aria-hidden>&larr;</span>
                <span>Back to editing</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="hidden sm:inline">Preview as families</span>
                <span className="sm:hidden">Preview</span>
              </>
            )}
          </button>
        </div>
        {!previewMode && (
          <div className="lg:mt-4">
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 font-display mb-0.5 lg:mb-1">
              Your profile
            </h1>
            <p className="text-sm lg:text-[15px] text-gray-500">
              Manage your profile and how families find you
            </p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT
          - LEFT: Hero + all profile cards (scrolls)
          - RIGHT: Stats + Activity + Completeness (sticky)
          ═══════════════════════════════════════════════════════════════════ */}
      {previewMode ? (
        <FamilyViewPreview profile={profile} meta={meta} onEdit={handleEdit} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">

        {/* ─── LEFT COLUMN: scrollable profile content ─── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero banner — single dynamic moment per surface. Picks one
              headline + CTA across engagement signals (leads, Qs, view
              spikes) and completion gaps (highest-impact incomplete section
              when engagement is sparse). See DashboardHero for the priority
              stack.

              Inline skeleton holds the slot at the same dimensions until
              v2Data arrives, so the swap is content-only — no layout shift,
              no half-second of empty space. The "Hey {firstName}" greeting
              renders inside the skeleton too, so the loading moment is
              partial-content rather than pure shimmer. */}
          {v2Data ? (
            <div style={{ animation: "card-enter 0.25s ease-out both" }}>
              <DashboardHero
                firstName={deriveFirstName(profile.display_name)}
                data={v2Data}
                completeness={completeness}
                category={profile.category}
                onOpenSection={setEditingSection}
                providerSlug={profile.slug}
                onHeroAction={setHeroAction}
                onBannerResolved={setHeroBannerId}
                hasActiveBoostRequest={v2Data.hasActiveBoostRequest}
              />
            </div>
          ) : (
            <DashboardHeroSkeleton
              firstName={deriveFirstName(profile.display_name)}
            />
          )}

          {/* Post-edit Managed Ads nudge — fires once per session after a save,
              not as an always-on card. The earned, high-intent moment. Hidden
              when the hero already resolved to the managed-ads banner, so the
              pitch never doubles on one screen. */}
          {showEditNudge && heroBannerId !== "managed_ads" && !v2Data?.hasActiveBoostRequest && (
            <PostEditAdsNudge
              providerSlug={profile.slug}
              providerName={profile.display_name}
              onDismiss={() => setShowEditNudge(false)}
            />
          )}

          {/* Mobile completeness + verification (lg:hidden) — these sit in the
              desktop sticky sidebar; on mobile they live here, just under the
              hero, so the flow reads: numbers → next action → your progress.
              Progress banner hidden in preview (it's editing chrome). */}
          {!previewMode && (
            <MobileProgressBanner
              completeness={completeness}
              onTap={() => setShowCompletenessSheet(true)}
            />
          )}
          {(() => {
            const m = profile.metadata as { badge_approved?: boolean; badge_rejected?: boolean; verification_submission?: unknown } | null;
            const wasRejected = m?.badge_rejected === true;
            const hasSubmission = !!m?.verification_submission;
            const shouldShowMobileBadgeCard = !m?.badge_approved && (!hasSubmission || wasRejected);
            return shouldShowMobileBadgeCard ? (
              <div className="lg:hidden">
                <MobileBadgeRequestCard onRequestBadge={() => openVerificationModal()} wasRejected={wasRejected} />
              </div>
            ) : null;
          })()}

          {/* Recent Activity card in left column */}
          {v2Data && v2Data.recentActivity.length > 0 && (
            <div style={{ animation: "card-enter 0.25s ease-out both", animationDelay: "60ms" }}>
              <LeftColumnActivityCard
                activities={v2Data.recentActivity}
                onSeeAll={() => setShowActivityModal(true)}
              />
            </div>
          )}

          {/* Questions engagement (mobile only) — the desktop copy lives in the
              sticky sidebar; on phones the sidebar is hidden, so surface it here
              in the flow. Top hairline separates it from the activity block. */}
          {v2Data && v2Data.questions.received > 0 && (
            <div
              className="lg:hidden"
              style={{ animation: "card-enter 0.25s ease-out both", animationDelay: "90ms" }}
            >
              <QuestionsCard
                questions={v2Data.questions}
                className="border-t border-gray-100 pt-4"
              />
            </div>
          )}

          {/* Profile sections. On mobile they're a flat list: chromeless
              sections separated by hairlines (divide-y) + whitespace — the
              narrow screen is the container. On desktop they're carded with
              space-y-6 gaps. */}
          <div className="divide-y divide-gray-100 lg:divide-y-0 lg:space-y-6">
          {[
            <ProfileOverviewCard
              key="overview"
              profile={profile}
              completionPercent={sectionPercent("overview")}
              onEdit={() => handleEdit("overview")}
              onVerifyClick={openVerificationModal}
              slug={profile.slug}
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
            <HireCaregiversCard
              key="hire_caregivers"
              metadata={meta}
              onEdit={() => handleEdit("hire_caregivers")}
            />,
            <NotificationPreferencesCard key="notifications" profileSlug={profile.slug} profileMetadata={meta} />,
          ].map((card, i) => (
            <div
              key={i}
              style={{
                animation: "card-enter 0.25s ease-out both",
                animationDelay: `${(i + 1) * 60}ms`,
              }}
            >
              {card}
            </div>
          ))}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: Sticky stats & completeness ─── */}
        {/* self-stretch ensures this column matches left column height, enabling sticky */}
        <div className="hidden lg:block lg:col-span-1 self-stretch">
          <div
            className="sticky top-24 space-y-4"
            style={{
              animation: "card-enter 0.25s ease-out both",
              animationDelay: "100ms",
            }}
          >
            {/* Stats card (activity is in left column) */}
            {v2Data && (
              <StatsOnlyCard
                data={v2Data}
                profileSlug={profile.slug}
              />
            )}

            {/* Questions engagement — persistent count + click-through to the
                answer flow. Only when they've ever received one (no empty card).
                Hairline separates it from the bare stats block above. */}
            {v2Data && (v2Data.questions?.received ?? 0) > 0 && (
              <QuestionsCard
                questions={v2Data.questions}
                className="border-t border-gray-100 pt-4"
              />
            )}

            {/* Badge request card - shown if form not submitted or was rejected */}
            <VerificationStatusCard
              metadata={profile.metadata as { verification_submission?: { name: string; role: string; phone?: string | null; submitted_at: string }; badge_approved?: boolean; badge_rejected?: boolean } | null}
              verificationState={verificationState}
              onRequestVerification={openVerificationModal}
            />

            {/* Profile completeness - collapsible (expanded for new providers < 30%) */}
            <CollapsibleProfileCompleteness
              completeness={completeness}
              defaultExpanded={completeness.overall < 30}
              lastUpdated={profile.updated_at}
            />
          </div>
        </div>
      </div>
      )}

      {/* Spacer so the last card clears the fixed mobile action bar.
          Not needed when bottom tabs are active (layout handles spacing). */}
      {!previewMode && heroAction && mobileNavVariant !== "bottom_tabs" && (
        <div className="lg:hidden h-20" aria-hidden />
      )}

      {/* Edit Modals */}
      {editingSection === "overview" && <EditOverviewModal {...modalProps} />}
      {editingSection === "gallery" && <EditGalleryModal {...modalProps} />}
      {editingSection === "services" && <EditCareServicesModal {...modalProps} />}
      {editingSection === "screening" && <EditStaffScreeningModal {...modalProps} />}
      {editingSection === "about" && <EditAboutModal {...modalProps} />}
      {editingSection === "pricing" && <EditPricingModal {...modalProps} />}
      {editingSection === "payment" && <EditPaymentModal {...modalProps} />}
      {editingSection === "owner" && <EditOwnerModal {...modalProps} />}
      {editingSection === "hire_caregivers" && <EditHireCaregiversModal {...modalProps} />}

      {/* Verification Modal */}
      <VerificationMethodModal
        isOpen={isVerificationModalOpen}
        onClose={closeVerificationModal}
        onSubmit={handleVerificationSubmit}
        onDismiss={handleVerificationDismiss}
        businessName={profile.display_name}
        profileId={profile.id}
      />

      {/* Activity Modal */}
      {v2Data && (
        <ActivityModal
          isOpen={showActivityModal}
          onClose={() => setShowActivityModal(false)}
          activities={v2Data.recentActivity}
        />
      )}

      {/* Sticky mobile action bar — keeps the hero's chosen next-action in
          thumb reach across the whole scroll (Airbnb Reserve / Wise Send /
          Robinhood Buy). Hidden in preview, when bottom tabs are active
          (they replace this bar), and when the tier carries no CTA. */}
      {!previewMode && heroAction && mobileNavVariant !== "bottom_tabs" && (
        <MobileActionBar action={heroAction} onOpenSection={setEditingSection} />
      )}

    </div>
    </div>
  );
}

// ── Sticky mobile action bar (mirrors the hero's chosen next-action) ──

function MobileActionBar({
  action,
  onOpenSection,
}: {
  action: HeroAction;
  onOpenSection: (s: SectionId) => void;
}) {
  const className =
    "flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-transform active:scale-[0.98]";
  const arrow = (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden border-t border-gray-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
      style={{ animation: "slide-up 0.3s ease-out both" }}
    >
      {action.kind === "section" && action.sectionId ? (
        <button
          type="button"
          onClick={() => onOpenSection(action.sectionId as SectionId)}
          className={className}
        >
          {action.label}
          {arrow}
        </button>
      ) : (
        <Link href={action.href ?? "#"} className={className}>
          {action.label}
          {arrow}
        </Link>
      )}
      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
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
      className="lg:hidden w-full bg-vanilla-50/70 rounded-2xl px-4 py-3.5 text-left active:bg-vanilla-100 transition-colors"
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
    <div className={`rounded-2xl p-4 ${wasRejected ? "bg-amber-50/60" : "bg-primary-50/50"}`}>
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
    <div className="bg-white rounded-2xl border border-gray-200/80 p-6">
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

      <div className="mt-2 pt-4 border-t border-gray-100">
        <Link
          href="/portal/analytics"
          className="block text-sm text-gray-700 hover:text-gray-900 transition-colors"
        >
          See full traffic report →
        </Link>
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
 * Collapsible Profile Completeness Card
 *
 * Shows a condensed progress bar when collapsed, expands to full checklist.
 * Starts expanded on first visit, remembers collapsed state via localStorage.
 */
function CollapsibleProfileCompleteness({
  completeness,
  lastUpdated,
  defaultExpanded = false,
}: {
  completeness: ReturnType<typeof calculateProfileCompleteness>;
  lastUpdated: string;
  defaultExpanded?: boolean;
}) {
  // Check localStorage for saved preference, fall back to defaultExpanded prop
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return defaultExpanded;
    const saved = localStorage.getItem("olera-completeness-expanded");
    // Use localStorage if set, otherwise use defaultExpanded prop
    return saved === null ? defaultExpanded : saved === "true";
  });

  const handleToggle = () => {
    const newValue = !isExpanded;
    setIsExpanded(newValue);
    localStorage.setItem("olera-completeness-expanded", String(newValue));
  };

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

  return (
    <div className="bg-gradient-to-b from-white to-vanilla-50 rounded-2xl border border-gray-200/80 overflow-hidden">
      {/* Header - always visible, clickable to toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-vanilla-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base font-display font-bold text-gray-900">
            Profile completeness
          </h3>
          {!isExpanded && (
            <span className="text-sm font-semibold text-primary-600">
              {completeness.overall}%
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Collapsed state - compact progress bar */}
      {!isExpanded && (
        <div className="px-5 pb-4 -mt-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${completeness.overall}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {completeness.sections.filter((s) => s.percent >= 100).length} of{" "}
            {completeness.sections.length} sections complete
          </p>
        </div>
      )}

      {/* Expanded state - full donut + checklist */}
      {isExpanded && (
        <div className="px-5 pb-5 -mt-2">
          {/* Circular progress */}
          <div className="flex justify-center mb-2">
            <div className="relative w-[90px] h-[90px]">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#199087"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${completeness.overall * 2.64} 264`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-gray-900">
                  {completeness.overall}%
                </span>
              </div>
            </div>
          </div>

          {/* Status text */}
          <p className="text-center text-xs font-semibold tracking-wide uppercase text-gray-900 font-display mb-0.5">
            {getStatusText(completeness.overall)}
          </p>
          <p className="text-center text-[11px] text-gray-400 mb-4">
            Last updated: {formattedDate}
          </p>

          {/* Section checklist - compact */}
          <div className="space-y-0.5">
            {completeness.sections.map((section) => {
              const isComplete = section.percent >= 100;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-vanilla-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <div className="w-4 h-4 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${
                        isComplete
                          ? "text-primary-600 font-medium"
                          : "text-gray-700"
                      }`}
                    >
                      {section.label}
                    </span>
                  </div>
                  {!isComplete && (
                    <span className="text-xs font-medium text-primary-600">
                      {section.percent}%
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Format a timestamp as relative time (1m, 2h, 3d, etc.)
 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "now";
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks}w`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Version 2: Recent Activity card for the LEFT column
 * Shows 2-3 items with "See all" link that opens the modal
 */
function LeftColumnActivityCard({
  activities,
  onSeeAll,
}: {
  activities: Array<{
    id: string;
    kind: string;
    timestamp: string;
    title: string;
    detail?: string;
    actorName?: string;
  }>;
  onSeeAll: () => void;
}) {
  const displayItems = activities.slice(0, 3);

  return (
    <div className="py-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Recent activity
      </p>
      <ul className="space-y-3">
        {displayItems.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <time className="text-xs text-gray-400 tabular-nums w-8 shrink-0 pt-0.5">
              {formatRelativeTime(item.timestamp)}
            </time>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] text-gray-700 leading-snug line-clamp-2">
                {item.detail ? `"${item.detail}"` : item.title}
              </p>
              {item.actorName && (
                <p className="text-xs text-gray-400 mt-0.5">{item.actorName}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {activities.length > 3 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          See all {activities.length} →
        </button>
      )}
    </div>
  );
}

/**
 * Version 2: Stats-only card for the RIGHT column (no activity section)
 */
function StatsOnlyCard({
  data,
  profileSlug,
}: {
  data: import("@/hooks/useProviderDashboardV2Data").ProviderDashboardV2Data;
  profileSlug: string | null;
}) {
  const { views, reviews } = data;
  const [copied, setCopied] = useState(false);

  const starCount = reviews.avgRating !== null ? Math.round(reviews.avgRating) : 0;
  const fullStars = "★".repeat(starCount) + "☆".repeat(Math.max(0, 5 - starCount));

  const handleShare = () => {
    if (!profileSlug) return;
    const url = `${window.location.origin}/provider/${profileSlug}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        window.prompt("Copy this link:", url);
      });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-display font-bold text-gray-900">
        This month
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Views */}
        <div className="space-y-1">
          <p className="font-display text-[32px] font-semibold text-gray-900 leading-none tabular-nums tracking-tight">
            {views.thisPeriod.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500">profile views</p>
          <button
            type="button"
            onClick={handleShare}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {copied ? "Link copied!" : "Share profile"}
          </button>
        </div>

        {/* Reviews */}
        <div className="space-y-1">
          {reviews.avgRating !== null ? (
            <>
              <div className="flex items-baseline gap-1">
                <p className="font-display text-[32px] font-semibold text-gray-900 leading-none tabular-nums tracking-tight">
                  {reviews.avgRating.toFixed(1)}
                </p>
                <span className="text-amber-500 text-xs tracking-tight">{fullStars}</span>
              </div>
              <p className="text-sm text-gray-500">
                {reviews.count} {reviews.count === 1 ? "review" : "reviews"}
              </p>
              <a
                href="/provider/reviews"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                Get more reviews
              </a>
            </>
          ) : (
            <>
              <p className="font-display text-[32px] font-semibold text-gray-300 leading-none">—</p>
              <p className="text-sm text-gray-500">no reviews yet</p>
              <a
                href="/provider/reviews"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                Get more reviews
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent Questions card. Surfaces lifetime question engagement and the
 * action number (unanswered) at a glance, with a click-through to the existing
 * answer flow (/provider/qna). Only rendered when the provider has ever
 * received a question — no empty "0 questions" card for the majority who
 * haven't, matching the activity card's `length > 0` gate.
 *
 * Bare block (no card chrome) to sit cleanly beside the equally-bare
 * StatsOnlyCard in the desktop sidebar and among the chromeless mobile flow.
 * The hero already surfaces unanswered as its Priority-2 banner, but that's a
 * single rotating slot — when a fresher lead wins the hero, questions fall off
 * it entirely. This card keeps the count persistently in reach.
 */
function QuestionsCard({
  questions,
  className = "",
}: {
  questions: { received: number; answered: number; unanswered: number };
  className?: string;
}) {
  const { received, answered, unanswered } = questions;
  const hasUnanswered = unanswered > 0;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-display font-bold text-gray-900">
          Questions
        </h3>
        <span className="text-xs text-gray-400 tabular-nums">
          {received} asked
        </span>
      </div>

      {hasUnanswered ? (
        <div className="space-y-1">
          <p className="font-display text-[32px] font-semibold text-gray-900 leading-none tabular-nums tracking-tight">
            {unanswered}
          </p>
          <p className="text-sm text-gray-500">
            {unanswered === 1 ? "question" : "questions"} waiting for your reply
          </p>
          <Link
            href="/provider/qna"
            className="inline-block text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Answer now →
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="font-display text-[20px] font-semibold text-gray-900 leading-tight">
            All caught up
          </p>
          <p className="text-sm text-gray-500">
            {answered === received
              ? `You've answered all ${received === 1 ? "your question" : `${received} questions`}`
              : `You've answered ${answered} of ${received}`}
          </p>
          <Link
            href="/provider/qna"
            className="inline-block text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            View questions →
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Activity Modal - shows all recent activity in a scrollable modal
 */
function ActivityModal({
  isOpen,
  onClose,
  activities,
}: {
  isOpen: boolean;
  onClose: () => void;
  activities: Array<{
    id: string;
    kind: string;
    timestamp: string;
    title: string;
    detail?: string;
    actorName?: string;
    actionHref?: string;
  }>;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        style={{ animation: "fade-in 0.15s ease-out both" }}
      />

      {/* Modal */}
      <div
        className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[80vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col"
        style={{ animation: "scale-in 0.2s ease-out both" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-display font-bold text-gray-900">
            Recent activity
          </h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <ul className="space-y-4">
            {activities.map((item) => (
              <li key={item.id} className="flex items-start gap-4">
                <time className="text-xs text-gray-400 tabular-nums w-12 shrink-0 pt-0.5">
                  {formatRelativeTime(item.timestamp)}
                </time>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] text-gray-900 leading-snug">
                    {item.detail ? `"${item.detail}"` : item.title}
                  </p>
                  {item.actorName && (
                    <p className="text-sm text-gray-500 mt-1">{item.actorName}</p>
                  )}
                  {item.actionHref && (
                    <a
                      href={item.actionHref}
                      className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      View details →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  );
}
