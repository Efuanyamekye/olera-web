"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProviderProfile } from "@/hooks/useProviderProfile";
import { useProfileSectionEditor } from "@/hooks/useProfileSectionEditor";
import { useVerificationModal } from "@/lib/hooks/useVerificationModal";
import VerificationMethodModal from "@/components/provider/VerificationMethodModal";
import type { SectionId } from "@/components/provider-dashboard/edit-modals/types";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";
import { useManagedAdsVariant, isManagedAdsPreviewMode } from "@/hooks/use-managed-ads-variant";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";
import type {
  AdBoostEligibility,
  AdBoostMissingSection,
} from "@/lib/ad-boost/eligibility";
import {
  cacheBoostState,
  getCachedBoostState,
  type BoostRequest,
  type BoostStateResponse,
} from "@/lib/ad-boost/boost-state";
import {
  BUDGET_STOPS,
  BUDGET_HONEST_LINE,
  BUDGET_ESTIMATE_CAVEAT,
  DEFAULT_BUDGET,
  budgetStop,
  budgetLabel,
  estimateSummary,
  type BudgetStop,
} from "@/lib/ad-boost/estimate";

/**
 * Provider Ad Boost — Managed Lead-Gen (concierge v1).
 *
 * Where a provider requests a done-for-you external ad campaign (Google/Meta)
 * that drives families to their Olera page. This is NOT internal search
 * placement — it's paid acquisition we run on their behalf. Gated on profile
 * completeness (>=70%) so we don't spend driving families to a thin profile.
 *
 * All eligibility + request state comes from GET /api/provider/ad-boost/request
 * (authoritative server compute — no client/server drift). Auth is gated by
 * the /provider layout, so by the time this renders the user is signed in.
 *
 * To avoid the wrong-page flash (apply form → queued/live snap), we never render
 * a sub-view until the fetch resolves — and entry points prefetch the state into
 * an in-memory cache so the common in-app path initializes from it and paints
 * the correct page on the first frame (no loader, no snap). See lib/ad-boost/
 * boost-state.ts.
 */

const CHANNELS = [
  { value: "both", label: "Google + Meta" },
  { value: "google", label: "Google only" },
  { value: "meta", label: "Meta only" },
] as const;

const OPEN_STATUSES = ["requested", "scheduled", "live"];

export default function ProviderBoostPage() {
  const { isLoading, user, refreshAccountData } = useAuth();
  const providerProfile = useProviderProfile();
  // Initialize from the prefetch cache so a warm in-app navigation paints the
  // correct page on the first frame (no loader, no wrong-page snap). Cold load
  // starts null → the loader holds until the fetch resolves.
  const [state, setState] = useState<BoostStateResponse | null>(() => getCachedBoostState());
  const [loading, setLoading] = useState(() => !getCachedBoostState());
  const [error, setError] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>("both");
  // Pre-selected so the budget step opens with its estimate already visible
  // (anticipate the need, surface the payoff) — freely changeable.
  const [selectedBudget, setSelectedBudget] = useState<number | null>(DEFAULT_BUDGET);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const assignedVariant = useManagedAdsVariant(state?.provider.slug ?? null);
  const mobileNavVariant = useMobileNavVariant();

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/provider/ad-boost/request", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          // Transient — session cookie may not be set yet; the user dep retries.
          return;
        }
        setError("Failed to load");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as BoostStateResponse;
      cacheBoostState(json); // keep the cache warm for the next in-app nav
      setState(json);
      setLoading(false);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState, user?.id]);

  // Fire one managed_ads_boost_viewed event per load, once state resolves —
  // tags which funnel state they landed in (gate / apply / in_motion).
  const hasTrackedView = useRef(false);
  const hasTrackedPitch = useRef(false);
  useEffect(() => {
    if (!state || !assignedVariant) return;
    if (isManagedAdsPreviewMode()) return;
    if (!hasTrackedPitch.current) {
      hasTrackedPitch.current = true;
      trackProviderEvent(state.provider.slug, "managed_ads_pitch_viewed", {
        provider_name: state.provider.displayName,
        source: "boost",
        managed_ads_variant: assignedVariant,
        city: state.provider.city,
        region: state.provider.state,
        category: state.provider.category,
        local_demand: state.demand.count,
        demand_scope: state.demand.scope,
      });
    }
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    const open = !!state.request && OPEN_STATUSES.includes(state.request.status);
    const pending = state.request?.status === "pending_profile";
    const viewState = open
      ? "in_motion"
      : pending
        ? "queued"
        : state.eligibility.eligible
          ? "apply"
          : "gate";
    trackProviderEvent(state.provider.slug, "managed_ads_boost_viewed", {
      provider_name: state.provider.displayName,
      state: viewState,
      completeness: state.eligibility.overall,
      city: state.provider.city,
      region: state.provider.state,
      category: state.provider.category,
      local_demand: state.demand.count,
      demand_scope: state.demand.scope,
      managed_ads_variant: assignedVariant,
    });
  }, [assignedVariant, state]);

  // Next four Mondays — "select next week to set up".
  const weekOptions = useMemo(() => nextMondays(4), []);

  const submit = async () => {
    if (!selectedWeek) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/provider/ad-boost/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupWeek: selectedWeek,
          channel,
          intendedMonthlyBudget: selectedBudget,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 (already have a request) returns the existing one — fold it in.
        if (res.status === 409 && json.request) {
          setState((prev) => (prev ? { ...prev, request: json.request } : prev));
          return;
        }
        setSubmitError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setState((prev) => (prev ? { ...prev, request: json.request } : prev));
      if (state && !isManagedAdsPreviewMode()) {
        trackProviderEvent(state.provider.slug, "managed_ads_requested", {
          provider_name: state.provider.displayName,
          setup_week: selectedWeek,
          channel,
          city: state.provider.city,
          region: state.provider.state,
          category: state.provider.category,
          local_demand: state.demand.count,
          demand_scope: state.demand.scope,
          managed_ads_variant: assignedVariant ?? "direct_reach",
          // Intended monthly budget (non-binding); null if not chosen.
          intended_monthly_budget: selectedBudget,
          // Queued under 70% (standing order) vs. an eligible, actionable request.
          queued: !!json.queued,
        });
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Inline section editing — finish a profile section without leaving the boost
  // flow. On save, refresh the profile + re-fetch boost state (recomputes
  // eligibility + auto-promotes the queued campaign if they just crossed 70%).
  const handleSectionSaved = useCallback(async () => {
    await refreshAccountData();
    fetchState();
  }, [refreshAccountData, fetchState]);
  const { openEditor, editorModals } = useProfileSectionEditor(providerProfile, {
    onSaved: handleSectionSaved,
  });

  // Verification modal — final step after profile completion. On verify,
  // refresh state to trigger auto-promotion from pending_profile → requested.
  const {
    isOpen: isVerificationModalOpen,
    open: openVerificationModal,
    close: closeVerificationModal,
    handleSubmit: handleVerificationSubmit,
  } = useVerificationModal({
    profileId: providerProfile?.id ?? "",
    onVerified: () => {
      refreshAccountData();
      fetchState();
    },
  });

  if (error) {
    return (
      <Shell>
        <p className="text-gray-500">
          {error}{" "}
          <button onClick={fetchState} className="text-primary-600 font-medium underline-offset-2 hover:underline">
            Try again
          </button>
        </p>
      </Shell>
    );
  }

  // Hold on ONE calm loader until the fetch resolves, so we never flash a
  // guessed sub-view (the apply form) and then snap to another (queued / live).
  // A warm prefetch cache initializes `state` synchronously, so the common
  // in-app navigation skips this entirely and paints the right page instantly.
  if (isLoading || loading || !state) {
    return (
      <Shell>
        <div className="min-h-[55vh] flex items-center justify-center">
          <div className="animate-spin w-7 h-7 border-[3px] border-primary-500 border-t-transparent rounded-full" />
        </div>
      </Shell>
    );
  }

  // `state` is resolved below — pick exactly one view, once.
  const openRequest =
    state.request && OPEN_STATUSES.includes(state.request.status)
      ? state.request
      : null;
  const pendingRequest =
    state.request?.status === "pending_profile" ? state.request : null;

  // Committed states (queued / live) keep the focused single-column treatment.
  // The apply state is the redesign's two-column flow — action spine on the
  // left, a live "your campaign" summary on the right (Airbnb-style).
  if (openRequest) {
    return (
      <Shell>
        <div className="mt-2">
          <CampaignInMotion request={openRequest} campaignStats={state.campaignStats} />
        </div>
      </Shell>
    );
  }
  if (pendingRequest) {
    return (
      <Shell>
        <div className="mt-2">
          <PendingProfile
            request={pendingRequest}
            eligibility={state.eligibility}
            isVerified={state.isVerified ?? false}
            onEditSection={openEditor}
            onVerify={openVerificationModal}
          />
        </div>
        {/* Inline section editors — finish a section without leaving this page. */}
        {editorModals}
        {/* Verification modal — final step after profile completion. */}
        <VerificationMethodModal
          isOpen={isVerificationModalOpen}
          onClose={closeVerificationModal}
          onSubmit={handleVerificationSubmit}
          businessName={providerProfile?.display_name ?? ""}
          businessWebsite={providerProfile?.website}
          profileId={providerProfile?.id}
          userEmail={user?.email}
          userName={providerProfile?.display_name ?? undefined}
          allowDismiss={false}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <ApplyExperience
        eligible={state.eligibility.eligible}
        weekOptions={weekOptions}
        selectedWeek={selectedWeek}
        setSelectedWeek={setSelectedWeek}
        channel={channel}
        setChannel={setChannel}
        selectedBudget={selectedBudget}
        setSelectedBudget={setSelectedBudget}
        submitting={submitting}
        submitError={submitError}
          provider={state.provider}
          demand={state.demand}
          managedAdsVariant={assignedVariant ?? "direct_reach"}
          onSubmit={submit}
        />
    </Shell>
  );
}

// ───────────────────────────────────────────────────────────── States

function CampaignInMotion({
  request,
  campaignStats,
}: {
  request: BoostRequest;
  campaignStats: { visitors: number; leads: number; since: string } | null;
}) {
  const label: Record<string, string> = {
    requested: "Launch plan received",
    scheduled: "Setup scheduled",
    live: "Your campaign is live",
  };
  const isLive = request.status === "live";
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
        <span className="text-sm font-semibold text-primary-700">
          {label[request.status] ?? "In progress"}
        </span>
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900">
        {isLive ? "Your campaign is live." : "We’re on it."}
      </h2>
      <p className="text-gray-500 mt-3 leading-relaxed">
        {isLive
          ? "Here’s how your campaign is performing — and families arrive on your dashboard as they come in."
          : "We’ll send over the launch plan before anything goes live, confirm the details, then families arrive on your dashboard as they come in."}
      </p>

      {/* The campaign they committed to — week, channel, budget. */}
      <CampaignFacts request={request} />

      {/* When live, real performance — visitors + leads on their page since
          launch — is THE focal point (replaces the old benefits-only counter). */}
      {isLive && campaignStats && <CampaignPerformance stats={campaignStats} />}

      <Link
        href="/provider"
        className="inline-flex items-center gap-2 mt-8 text-primary-600 font-medium hover:gap-3 transition-all"
      >
        Back to dashboard
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

/** Live campaign performance — the real story: who visited, who converted.
 *  Visitors + leads on the provider's page since launch (see getCampaignStats),
 *  conversion = leads/visitors. "—" until there's traffic, so day-one shows an
 *  honest empty state rather than a fake 0%. */
function CampaignPerformance({
  stats,
}: {
  stats: { visitors: number; leads: number; since: string };
}) {
  // Cap at 100% — a lead can exist without a matching deduped page_view session
  // (bot-filtered load, tracker race, cross-session convert), which would
  // otherwise render a trust-eroding ">100%" to the provider.
  const conversion =
    stats.visitors > 0
      ? Math.min(100, Math.round((stats.leads / stats.visitors) * 100))
      : null;
  const cells: { label: string; value: string }[] = [
    { label: "Visitors", value: stats.visitors.toLocaleString() },
    { label: "Leads", value: stats.leads.toLocaleString() },
    { label: "Conversion", value: conversion === null ? "—" : `${conversion}%` },
  ];
  return (
    <div className="mt-8">
      <dl className="flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-primary-100/70 bg-primary-50/40 sm:flex-row sm:divide-x sm:divide-y-0 sm:divide-gray-100">
        {cells.map((c) => (
          <div key={c.label} className="flex-1 px-5 py-5">
            <dd className="text-4xl font-display font-bold text-gray-900 tabular-nums leading-none">
              {c.value}
            </dd>
            <dt className="mt-2 text-xs uppercase tracking-wide text-gray-500">
              {c.label}
            </dt>
          </div>
        ))}
      </dl>
      <p className="text-sm text-gray-500 mt-3">
        Since your campaign launched.{" "}
        {stats.leads > 0 ? (
          <>
            Find your leads on your{" "}
            <Link
              href="/provider/connections"
              className="text-primary-600 font-medium hover:underline"
            >
              leads page
            </Link>
            .
          </>
        ) : (
          <>Visitors and leads will appear here as families arrive.</>
        )}
      </p>
    </div>
  );
}

/** The campaign the provider committed to — week · channel · budget — as a clean
 *  hairline 3-up (Robinhood/Wise stat-row feel). Shared by the queued + in-motion
 *  states so the choices they just made are always visible. */
function CampaignFacts({ request }: { request: BoostRequest }) {
  const channelLabel = CHANNELS.find((c) => c.value === request.channel)?.label ?? null;
  const budget = budgetLabel(request.intended_monthly_budget);
  const facts: { label: string; value: string }[] = [
    { label: "Launch", value: `Week of ${formatWeek(request.requested_setup_week)}` },
  ];
  if (channelLabel) facts.push({ label: "Advertising on", value: channelLabel });
  if (budget) facts.push({ label: "Budget", value: budget });

  // Flex + flex-1 (not a fixed grid) so 1, 2, or 3 facts always fill the width
  // evenly — older requests with no channel/budget never leave empty cells.
  return (
    <dl className="mt-7 flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200/80 sm:flex-row sm:divide-x sm:divide-y-0">
      {facts.map((f) => (
        <div key={f.label} className="flex-1 px-4 py-3.5">
          <dt className="text-xs text-gray-400">{f.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-gray-900">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Standing order queued under 70% OR unverified. This is the page that used to
 * be the dead-end "CompletenessGate" — a flat chore list with no forward action.
 * Now the provider has already committed (picked a week + channel), so the same
 * completion work is reframed as the LAST step to launch a campaign they own.
 * One prominent next action (the highest-impact gap), the rest as a quiet
 * "what's left" list. When profile is complete, verification becomes the final
 * step. Momentum, not homework.
 */
function PendingProfile({
  request,
  eligibility,
  isVerified,
  onEditSection,
  onVerify,
}: {
  request: BoostRequest;
  eligibility: AdBoostEligibility;
  /** True if provider is verified or verification not required. */
  isVerified: boolean;
  /** Opens the section editor inline on this page (no navigation). */
  onEditSection: (sectionId: SectionId) => void;
  /** Opens the verification modal (final step after profile completion). */
  onVerify: () => void;
}) {
  const remaining = Math.max(0, eligibility.threshold - eligibility.overall);
  const topGap = eligibility.missingSections[0] ?? null;
  const restGaps = eligibility.missingSections.slice(1);
  const hasBoosters =
    eligibility.boosters.reviews === null || eligibility.boosters.responseRate === null;
  // Profile is complete (no missing sections) but not verified — verification is the final step.
  const needsVerification = !topGap && !isVerified;

  return (
    <div className="max-w-2xl">
      {/* Queued status — mirrors CampaignInMotion's pulse, distinct copy. */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
        <span className="text-sm font-semibold text-primary-700">
          You&apos;re in the queue
        </span>
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900">
        Your launch plan is queued.
      </h2>
      <p className="text-gray-500 mt-3 leading-relaxed">
        We’ll build around the timing and budget you picked, then launch once your page is ready to convert the families we send.
      </p>

      {/* The campaign they committed to — week · channel · budget. */}
      <CampaignFacts request={request} />

      {/* Progress toward launch — the actionable "to go" leads, big number
          matches the bar, target surfaced beneath (not buried in prose).
          When profile is complete but unverified, show verification as final step. */}
      {needsVerification ? (
        <>
          <div className="mt-8 flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </span>
            <span className="text-gray-900 font-medium">Profile complete</span>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            One last step: verify your account so we can launch your campaign.
          </p>
        </>
      ) : (
        <>
          <div className="mt-8 flex items-baseline gap-3">
            <span className="text-4xl font-display font-bold text-gray-900 tabular-nums leading-none">
              {eligibility.overall}%
            </span>
            <span className="text-gray-500">complete</span>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-warm-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${Math.min(100, eligibility.overall)}%` }}
            />
          </div>
          <p className="mt-2.5 text-sm text-gray-500">
            <span className="font-medium text-gray-900">{remaining}% to go</span> to launch
          </p>
        </>
      )}

      {/* THE single next action — the highest-impact gap. Opens the editor
          INLINE (no navigation), so they never leave the campaign-setup flow.
          When profile is complete, verification is the final step. */}
      {topGap ? (
        <button
          type="button"
          onClick={() => onEditSection(topGap.id as SectionId)}
          className="inline-flex items-center gap-2.5 mt-8 px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white text-[16px] font-semibold rounded-full active:scale-[0.98] transition-all duration-200"
        >
          Next: {topGap.label}
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      ) : needsVerification ? (
        <button
          type="button"
          onClick={onVerify}
          className="inline-flex items-center gap-2.5 mt-8 px-8 py-3.5 bg-gray-900 hover:bg-gray-800 text-white text-[16px] font-semibold rounded-full active:scale-[0.98] transition-all duration-200"
        >
          Verify your account
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
          </svg>
        </button>
      ) : null}

      {/* Everything else — secondary, scannable, no longer the hero. */}
      {restGaps.length > 0 && (
        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            What&apos;s left
          </p>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {restGaps.map((s) => (
              <MissingRow key={s.id} section={s} onEdit={onEditSection} />
            ))}
          </ul>
        </div>
      )}

      {/* Boost your results — reviews / response rate as carrots, never gating.
          Asking for reviews to RUN ads would be circular, so we frame them as
          conversion lift, not requirements. */}
      {hasBoosters && (
        <div className="mt-10 rounded-2xl border border-primary-100/70 bg-primary-50/40 px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">Boost your results</p>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">
            Not required to launch — but providers with reviews and fast replies
            convert more of the families we send.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {eligibility.boosters.reviews === null && (
              <Link
                href="/provider/reviews"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-3.5 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50/60 transition-colors"
              >
                Ask for reviews
              </Link>
            )}
            {eligibility.boosters.responseRate === null && (
              <Link
                href="/provider/qna"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-3.5 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50/60 transition-colors"
              >
                Answer questions fast
              </Link>
            )}
          </div>
        </div>
      )}

      <Link
        href="/provider"
        className="inline-flex items-center gap-2 mt-8 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function MissingRow({
  section,
  onEdit,
}: {
  section: AdBoostMissingSection;
  onEdit: (sectionId: SectionId) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(section.id as SectionId)}
        aria-label={`${section.label}, ${section.percent}% done`}
        className="flex w-full items-center gap-3.5 py-3.5 text-left group"
      >
        {/* A quiet completion ring replaces the repeated "X% done" text. */}
        <ProgressRing percent={section.percent} />
        <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
          {section.label}
        </span>
        {/* The chevron is the only affordance — no repeated "Improve" label. */}
        <svg
          className="w-4 h-4 shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </li>
  );
}

/** A tiny completion ring — calm visual status that replaces a repeated
 *  "X% done" text column. Empty track at 0%, a teal arc as the section fills. */
function ProgressRing({ percent }: { percent: number }) {
  const r = 8;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, percent));
  return (
    <svg className="w-[18px] h-[18px] shrink-0 -rotate-90" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-gray-200" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke="currentColor"
        className="text-primary-500"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - filled / 100)}
      />
    </svg>
  );
}

/**
 * The apply experience — a light three-beat flow (Airbnb-leaning), one decision
 * per screen, on a two-column transactional split:
 *
 *   LEFT  (action spine):   breadcrumb → the current step's single decision →
 *                           Back / Continue (or the submit CTA on Confirm).
 *   RIGHT (support, sticky): a live "Your campaign" summary that accumulates as
 *                           they go (week → channel → budget + estimate), with
 *                           the value props as quiet proof beneath it.
 *
 * The honesty model lives in the Budget step: as the budget rises the estimate
 * shifts from reach language to lead language (see lib/ad-boost/estimate.ts), so
 * "real leads need real spend" lands structurally — one honest line + one caveat,
 * no warning paragraph. Clean white ground + one elevated summary card + teal as
 * the single accent — a focused transaction, not an editorial pitch. On mobile
 * the columns stack; the summary card stacks below and a one-line echo on each
 * step keeps the payoff visible.
 */
function ApplyExperience({
  eligible,
  weekOptions,
  selectedWeek,
  setSelectedWeek,
  channel,
  setChannel,
  selectedBudget,
  setSelectedBudget,
  submitting,
  submitError,
  provider,
  demand,
  managedAdsVariant: _managedAdsVariant,
  onSubmit,
}: {
  /** True when the provider already clears the 70% gate. False → the submit
   *  queues a standing order (pending_profile) that launches once they finish. */
  eligible: boolean;
  weekOptions: { value: string; label: string }[];
  selectedWeek: string | null;
  setSelectedWeek: (v: string) => void;
  channel: string;
  setChannel: (v: string) => void;
  selectedBudget: number | null;
  setSelectedBudget: (v: number) => void;
  submitting: boolean;
  submitError: string | null;
  provider: BoostStateResponse["provider"];
  demand: BoostStateResponse["demand"];
  managedAdsVariant: "direct_reach" | "local_plan";
  onSubmit: () => void;
}) {
  const [step, setStep] = useState(0); // 0 Timing · 1 Budget · 2 Confirm
  const mobileNavVariant = useMobileNavVariant();
  const weekLabel = weekOptions.find((w) => w.value === selectedWeek)?.label ?? null;
  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? "Google + Meta";
  const stop = budgetStop(selectedBudget);

  const canAdvance = step === 0 ? !!selectedWeek : step === 1 ? !!stop : true;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-10 lg:gap-16 items-start">
      {/* ─────────── LEFT: action spine ─────────── */}
      <div className="min-w-0">
        {/* Mobile back link - above the banner for steps > 0 */}
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="sm:hidden inline-flex items-center gap-1.5 mb-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
        )}

        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600 mb-2">
          Managed Ads
        </p>

        {/* ── Step 0: Timing & channel ── */}
        {step === 0 && (
          <div>
            <h1 className="font-display font-bold text-[clamp(1.75rem,4vw,2.5rem)] text-gray-900 leading-[1.1] tracking-tight">
              When should we start?
            </h1>
            <p className="mt-3 text-gray-500 leading-relaxed max-w-lg">
              We'll run ads to bring families to your page.{" "}
              <span className="font-semibold text-primary-600">First $50 on us.</span>
            </p>
            <p className="mt-2 text-sm text-gray-400">
              {(() => {
                const category = humanCategoryLabel(provider.category);
                const place =
                  demand.scope === "city" && provider.city
                    ? provider.city
                    : provider.state
                      ? provider.state
                      : "your area";
                const timeframe = demand.windowDays === 7 ? "this week" : `in the last ${demand.windowDays} days`;

                return demand.count >= 5 ? (
                  <>
                    {demand.count} families in {place} searched for {category} {timeframe}.
                  </>
                ) : (
                  <>
                    Families in {place} are searching for {category}.
                  </>
                );
              })()}
            </p>

            <fieldset className="mt-8">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Start week</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {weekOptions.map((w) => {
                  const active = selectedWeek === w.value;
                  return (
                    <button
                      key={w.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedWeek(w.value)}
                      className={`rounded-2xl border px-3 py-4 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                        active
                          ? "border-primary-500 bg-primary-50/70"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
                      }`}
                    >
                      <span className={`block text-xs uppercase tracking-wide ${active ? "text-primary-600" : "text-gray-400"}`}>
                        Week of
                      </span>
                      <span className={`block text-base font-semibold mt-0.5 ${active ? "text-primary-700" : "text-gray-900"}`}>
                        {w.label.replace("Week of ", "")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-8">
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Where we'll advertise</legend>
              <div className="flex flex-wrap gap-2.5">
                {CHANNELS.map((c) => {
                  const active = channel === c.value;
                  const isRecommended = c.value === "both";
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setChannel(c.value)}
                      className={`relative rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                        active
                          ? "border-primary-500 bg-primary-50/70 text-primary-700"
                          : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50/70"
                      }`}
                    >
                      {c.label}
                      {isRecommended && (
                        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          active ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700"
                        }`}>
                          Recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}

        {/* ── Step 1: Budget ── */}
        {step === 1 && (
          <div>
            <h2 className="text-[clamp(1.5rem,4vw,2rem)] font-display font-bold text-gray-900 leading-tight">
              Choose your monthly budget
            </h2>
            <p className="mt-3 text-gray-500 leading-relaxed max-w-lg">
              What we'll spend each month finding you families. No card today — nothing goes live until we confirm with you.
            </p>

            <fieldset className="mt-8">
              <legend className="sr-only">Monthly budget</legend>
              {/* Desktop: horizontal row, Mobile: vertical stack */}
              <div className="hidden sm:grid sm:grid-cols-4 gap-3">
                {BUDGET_STOPS.map((b) => {
                  const active = selectedBudget === b.value;
                  return (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedBudget(b.value)}
                      className={`relative flex min-h-[5.25rem] flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                        active
                          ? "border-primary-500 bg-primary-50/70"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
                      }`}
                    >
                      {b.recommended && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm">
                          Recommended
                        </span>
                      )}
                      <span className={`text-2xl font-bold tracking-tight tabular-nums leading-none ${active ? "text-primary-700" : "text-gray-900"}`}>
                        {b.amount}
                      </span>
                      <span className={`mt-1.5 text-xs ${active ? "text-primary-600/80" : "text-gray-400"}`}>
                        {b.sublabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Mobile: vertical stack */}
              <div className="flex flex-col gap-3 sm:hidden">
                {BUDGET_STOPS.map((b) => {
                  const active = selectedBudget === b.value;
                  return (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedBudget(b.value)}
                      className={`relative flex items-center gap-3 rounded-2xl border px-5 py-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                        active
                          ? "border-primary-500 bg-primary-50/70"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70"
                      }`}
                    >
                      <span className={`text-2xl font-bold tracking-tight tabular-nums leading-none ${active ? "text-primary-700" : "text-gray-900"}`}>
                        {b.amount}
                      </span>
                      <span className={`text-sm ${active ? "text-primary-600/80" : "text-gray-400"}`}>
                        {b.sublabel}
                      </span>
                      {b.recommended && (
                        <span className="ml-auto rounded-full bg-primary-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Dynamic outcome text based on budget selection */}
            {stop && (
              <div key={stop.value} className="mt-8 animate-[fadeIn_180ms_ease-out]">
                <h3 className="font-display font-bold text-2xl text-gray-900">
                  {stop.kind === "leads" ? `${stop.headline} ${stop.unit}` : stop.headline}
                </h3>
                <p className="mt-1.5 text-gray-500">{stop.estimate}</p>
              </div>
            )}

            {/* Back link - desktop only */}
            <button
              type="button"
              onClick={() => setStep(0)}
              className="hidden sm:inline-flex items-center gap-1.5 mt-8 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
          </div>
        )}

        {/* ── Step 2: Review & confirm ── */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-display font-semibold text-gray-900">
              Get your launch plan
            </h2>
            <p className="mt-3 text-gray-500 leading-relaxed max-w-md">
              {eligible
                ? "We'll review this, confirm the budget with you, and send the plan before anything goes live."
                : "We'll queue this now, help you get the page ready, and send the plan before anything goes live."}
            </p>

            <dl className="mt-7 overflow-hidden rounded-2xl border border-gray-200/80 divide-y divide-gray-100">
              <ReviewRow label="Launch" value={weekLabel ?? "—"} />
              <ReviewRow label="Advertising on" value={channelLabel} />
              <ReviewRow label="Starting budget" value={stop?.label ?? "—"} />
            </dl>

            <p className="mt-6 text-sm text-gray-500 leading-relaxed max-w-md">
              This starts a concierge review. Advertising can drive more local
              families to your page; it doesn&apos;t guarantee a set number of leads.{" "}
              <Link
                href="/managed-ads-terms"
                target="_blank"
                className="text-primary-600 font-medium hover:underline"
              >
                How it works &amp; what we measure
              </Link>
              .
            </p>

            {/* Back link - desktop only */}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="hidden sm:inline-flex items-center gap-1.5 mt-8 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
          </div>
        )}

        {/* Mobile reassurance text - matches sidebar */}
        <p className="mt-8 sm:hidden text-xs text-gray-400 leading-relaxed">
          No card today. We confirm everything with you before your campaign goes live, and you can cancel anytime.
        </p>

        {/* Spacer for mobile sticky CTA */}
        <div className="h-32 sm:hidden" />
      </div>

      {/* ─────────── RIGHT: live summary + proof (sticky) ─────────── */}
      <aside className="lg:sticky lg:top-12 space-y-6 hidden sm:block">
        <CampaignSummary
          step={step}
          weekLabel={weekLabel}
          channelLabel={channelLabel}
          stop={stop}
          canAdvance={canAdvance}
          onContinue={() => setStep(step + 1)}
          onSubmit={onSubmit}
          submitting={submitting}
          submitError={submitError}
          eligible={eligible}
        />
      </aside>

      {/* Mobile sticky CTA - raised above bottom tabs when bottom_tabs variant is active */}
      <div
        className={`fixed left-0 right-0 z-50 sm:hidden bg-white border-t border-gray-200 px-4 py-4 ${
          mobileNavVariant === "bottom_tabs"
            ? ""
            : "bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        }`}
        style={mobileNavVariant === "bottom_tabs" ? { bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" } : undefined}
      >
        {step === 2 && submitError && (
          <p className="text-sm text-red-600 mb-3">{submitError}</p>
        )}
        {step === 1 ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Monthly budget</p>
              <p className="text-xl font-bold text-gray-900">{stop?.amount ?? "—"}</p>
            </div>
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => setStep(step + 1)}
              className="inline-flex items-center gap-2 px-8 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-full active:scale-[0.99] transition-all duration-200"
            >
              Continue
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            {step < 2 ? (
              <button
                type="button"
                disabled={!canAdvance}
                onClick={() => setStep(step + 1)}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-[16px] font-semibold rounded-full active:scale-[0.99] transition-all duration-200"
              >
                Continue
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={onSubmit}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[16px] font-semibold rounded-full active:scale-[0.99] transition-all duration-200"
              >
                {submitting ? "Sending…" : eligible ? "Get my launch plan" : "Queue my launch plan"}
                {!submitting && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </button>
            )}
            {step === 0 && (
              <p className="text-sm text-gray-400 text-center mt-3">
                Next: choose your budget
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 text-right">{value}</dd>
    </div>
  );
}


/** The live "Your campaign" card — accumulates as the provider picks (week →
 *  channel → budget + estimate). Contains the Continue button on desktop. */
function CampaignSummary({
  step,
  weekLabel,
  channelLabel,
  stop,
  canAdvance,
  onContinue,
  onSubmit,
  submitting,
  submitError,
  eligible,
}: {
  step: number;
  weekLabel: string | null;
  channelLabel: string;
  stop: BudgetStop | null;
  canAdvance: boolean;
  onContinue: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  eligible: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(42,24,16,0.12)]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
        {step >= 1 ? "Your launch plan" : "Your plan so far"}
      </p>

      <dl className="mt-4 space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-gray-500">{step >= 1 ? "Launch" : "Start week"}</dt>
          <dd className={`text-sm font-medium text-right ${weekLabel ? "text-gray-900" : "text-gray-300"}`}>
            {weekLabel ?? "Pick a week"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-gray-500">Advertising on</dt>
          <dd className="text-sm font-medium text-gray-900 text-right">{channelLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-gray-500">{step >= 1 ? "Monthly budget" : "Budget"}</dt>
          <dd className={`text-sm font-medium text-right ${step >= 1 && stop ? "text-gray-900" : "text-gray-300"}`}>
            {step >= 1 && stop ? stop.label : "Next step"}
          </dd>
        </div>
      </dl>

      {/* Reassurance text */}
      <p className="mt-4 text-xs text-gray-400 leading-relaxed">
        No card today. We confirm everything with you before your campaign goes live, and you can cancel anytime.
      </p>

      {/* Continue button - inside the card on desktop */}
      <div className="mt-5">
        {step === 2 && submitError && (
          <p className="text-sm text-red-600 mb-3">{submitError}</p>
        )}
        {step < 2 ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={onContinue}
            className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-[16px] font-semibold rounded-full active:scale-[0.99] transition-all duration-200"
          >
            Continue
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[16px] font-semibold rounded-full active:scale-[0.99] transition-all duration-200"
          >
            {submitting ? "Sending…" : eligible ? "Get my launch plan" : "Queue my launch plan"}
            {!submitting && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
        )}
        {step === 0 && (
          <p className="mt-3 text-sm text-gray-400 text-center">
            Next: choose your budget
          </p>
        )}
      </div>
    </div>
  );
}


function humanCategoryLabel(category: string | null): string {
  const labels: Record<string, string> = {
    assisted_living: "assisted living",
    memory_care: "memory care",
    nursing_home: "nursing home",
    independent_living: "independent living",
    home_care_agency: "home care",
    home_health_agency: "home health care",
  };
  return category ? labels[category] ?? category.replace(/[_-]+/g, " ") : "senior care";
}

// ───────────────────────────────────────────────────────────── Chrome

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-vanilla-50 via-white to-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 lg:pt-14 pb-24">
        {children}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────── Date helpers

/** The next `count` Mondays, starting with the upcoming one (never today). */
function nextMondays(count: number): { value: string; label: string }[] {
  const today = new Date();
  const day = today.getDay(); // 0 Sun … 6 Sat
  const daysUntilNextMonday = (8 - day) % 7 || 7; // always 1–7 days out
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilNextMonday + i * 7);
    out.push({ value: isoDate(d), label: `Week of ${shortDate(d)}` });
  }
  return out;
}

/** Local YYYY-MM-DD (avoids the UTC off-by-one toISOString would introduce). */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Render a stored YYYY-MM-DD week back to "Mon D" without TZ drift. */
function formatWeek(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split("-").map(Number);
  if (!y || !m || !d) return isoDateStr;
  return shortDate(new Date(y, m - 1, d));
}
