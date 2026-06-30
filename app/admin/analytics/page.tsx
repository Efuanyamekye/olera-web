"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PulseHeader from "@/components/admin/PulseHeader";
import DateRangePopover, {
  resolveRange,
  rangeLabel,
  type DateRangeValue,
} from "@/components/admin/DateRangePopover";
import { useAnimatedCount } from "@/hooks/use-animated-count";
import VariantSessionsList from "@/components/admin/VariantSessionsList";
import CollapsibleSection, { bulkCollapse } from "@/components/admin/CollapsibleSection";
import { INTAKE_VARIANTS, type IntakeVariant } from "@/lib/analytics/variant";
import { variantSurfaceLabel, variantSubLabel } from "@/lib/analytics/variant-copy";
import { CTA_VARIANTS, type CTAVariant } from "@/lib/analytics/cta-variant";
import { ctaVariantLabel, ctaVariantSubLabel } from "@/lib/analytics/cta-variant-copy";
import {
  MANAGED_ADS_VARIANTS,
  type ManagedAdsVariant,
} from "@/lib/analytics/managed-ads-variant";
import {
  managedAdsVariantLabel,
  managedAdsVariantSubLabel,
} from "@/lib/analytics/managed-ads-variant-copy";
import {
  MOBILE_NAV_VARIANTS,
  type MobileNavVariant,
} from "@/lib/analytics/mobile-nav-variant";
import {
  mobileNavVariantLabel,
  mobileNavVariantSubLabel,
} from "@/lib/analytics/mobile-nav-variant-copy";
import CTAVariantSessionsList from "@/components/admin/CTAVariantSessionsList";
import MobileNavVariantSessionsList from "@/components/admin/MobileNavVariantSessionsList";
import {
  PROVIDER_EMAIL_FUNNEL_LABELS,
  PROVIDER_EMAIL_FUNNEL_ORDER,
} from "@/lib/analytics/provider-email-funnels";
import { HeroCard, buildBannerPreviews } from "@/components/provider-dashboard/v2/DashboardHero";

// Pitch Touchpoints — ad pitch surface engagement tracking
interface TouchpointData {
  touchpoint: string;
  label: string;
  viewed: number;
  clicked: number;
  dismissed: number;
  ctr: number;
}

interface TouchpointsResponse {
  range: { from: string; to: string };
  touchpoints: TouchpointData[];
  totals: { viewed: number; clicked: number; dismissed: number };
}

interface WindowedCounts {
  page_view: number;
  search_click: number;
  benefits_started: number;
  lead_received: number;
  review_received: number;
  question_received: number;
  provider_saved: number;
  benefits_completed: number;
  matches_activated: number;
}

interface ProviderDistinctCounts {
  qa_signins: number;
  page_claims: number;
  question_answerers: number;
  lead_engagers: number;
  teaser_clickers: number;
  qa_email_openers: number;
}

interface ProviderQaFunnel {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  signed_in: number;
  answered: number;
  qa_success_arrivals: number;
  clicked_dashboard: number;
  edited_profile: number;
  clicked_dashboard_by_source: {
    qa_teaser: number;
    hero: number;
  };
}

interface ProviderQaVariantRow {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  phi_filtered: number;
}

interface ProviderQaFunnelByVariant {
  A: ProviderQaVariantRow;
  B: ProviderQaVariantRow;
  unassigned: ProviderQaVariantRow;
}

interface QaEmailIssue {
  reason: string;
  count: number;
  type: "bounced" | "complained";
}

// Generalized provider-comms funnel — same data shape used by every email_type
// bucket (Q&A, weekly digest, verification reminders, claim flow, profile
// nudges, connections, plus `all` which is the union). Sent/Delivered/Opened/
// Clicked are raw email_log row counts; the downstream four are
// |clicked_set ∩ event_set| in window (approximate attribution — anchored on
// activity time, not email send time). Engagement bounce = clicked but did
// none of the four downstream events.
interface ProviderCommsFunnel {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  // Distinct providers who clicked ≥1 email of this bucket — the proper
  // denominator for engagement_bounces (clicked is a raw row count).
  distinct_clickers: number;
  signed_in: number;
  answered: number;
  clicked_dashboard: number;
  edited_profile: number;
  engagement_bounces: number;
  top_bouncers: Array<{
    provider_id: string;
    last_clicked_email_type: string;
    last_clicked_at: string;
  }>;
}

interface ProviderCommsFunnelByType {
  all: ProviderCommsFunnel;
  question_received: ProviderCommsFunnel;
  weekly_digest: ProviderCommsFunnel;
  verification: ProviderCommsFunnel;
  nudges: ProviderCommsFunnel;
  connections: ProviderCommsFunnel;
}

interface BenefitsFunnel {
  // Distinct sessions that saw the module render. Apples-to-apples top-of-
  // funnel for all four arms (benefits_entry_viewed for the 3 form arms,
  // outreach_module_impression for the outreach arm).
  impressions: number;
  started: number;
  care_need_completed: number;
  age_completed: number;
  financial_completed: number;
  saved: number;
}

interface BenefitsFunnelByVariant {
  // V3 active arms (post-cutover)
  availability: BenefitsFunnel;
  loss: BenefitsFunnel;
  empathic: BenefitsFunnel;
  // 4th arm — H1 demand-test surface, replaces SBF for 20% of provider-page
  // visitors. Populates impressions, started (card click), and saved (form
  // submission); middle "care need" step is N/A and renders as "—".
  outreach: BenefitsFunnel;
  // 5th arm (since 2026-05-05) — Q&A enrichment ON, SBF + outreach OFF.
  // Populates impressions (QASectionV2 mount in arm) and saved (post-question
  // email enrichment). Middle stages N/A → "—".
  qa_email_capture: BenefitsFunnel;
  // 6th arm (since 2026-05-07) — Multi-provider comparison. Tinder-style card
  // stack lets user send the same question to similar providers. Populates
  // impressions and saved (email capture after card flow). Middle stages N/A.
  multi_provider: BenefitsFunnel;
  // 7th arm (since 2026-05-15) — Multi-provider V2 (email-first). Shows email
  // capture immediately after first question, with option to expand to card
  // stack. A/B testing against multi_provider variant.
  multi_provider_v2: BenefitsFunnel;
  // Legacy V2 arms — historical, retained for the rollup window when V2 data
  // exists. Frozen after cutover.
  control: BenefitsFunnel;
  money_loss: BenefitsFunnel;
  unassigned: BenefitsFunnel;
}

interface CTAFunnel {
  impressions: number;
  clicked: number;
  engaged: number;
  converted: number;
}

// Dynamically supports all CTA variants from CTA_VARIANTS
type CTAVariantKeyWithUnassigned = CTAVariant | "unassigned";
type CTAFunnelByVariant = Record<CTAVariantKeyWithUnassigned, CTAFunnel>;

interface ManagedAdsFunnel {
  shown: number;
  clicked: number;
  viewed: number;
  requested: number;
}

type ManagedAdsVariantKeyWithUnassigned = ManagedAdsVariant | "unassigned";
type ManagedAdsFunnelByVariant = Record<ManagedAdsVariantKeyWithUnassigned, ManagedAdsFunnel>;

interface ReferrerBreakdown {
  ai_chat: number;
  search: number;
  social: number;
  olera_internal: number;
  direct: number;
  other: number;
}

// One row of the Dashboard Banners leaderboard — distinct providers shown vs.
// clicked, per hero banner. CTR is derived client-side.
interface BannerLeaderboardRow {
  banner: string;
  impressions: number;
  clicks: number;
  /** Distinct providers who did the banner's intended action within 3d of seeing
   *  it. null = the banner has no action (view_spike → reinforcement only). */
  converted: number | null;
  /** Verb for the conversion ("Answered", "Lead opened", …). "" when no action. */
  convLabel: string;
}

interface SummaryResponse {
  windowed: {
    range: { from: string | null; to: string | null };
    counts: WindowedCounts;
    unique_sessions_page_view: number;
    provider_distinct_counts: ProviderDistinctCounts;
    banner_leaderboard: BannerLeaderboardRow[];
    qa_funnel: ProviderQaFunnel;
    qa_funnel_by_variant: ProviderQaFunnelByVariant;
    qa_email_issues: QaEmailIssue[];
    provider_comms_funnel_by_type: ProviderCommsFunnelByType;
    benefits_funnel: BenefitsFunnel;
    benefits_funnel_by_variant: BenefitsFunnelByVariant;
    cta_funnel: CTAFunnel;
    cta_funnel_by_variant: CTAFunnelByVariant;
    managed_ads_funnel: ManagedAdsFunnel;
    managed_ads_funnel_by_variant: ManagedAdsFunnelByVariant;
    referrer_breakdown: ReferrerBreakdown;
  };
  prior: {
    counts: WindowedCounts;
    unique_sessions_page_view: number;
    provider_distinct_counts: ProviderDistinctCounts;
    qa_funnel: ProviderQaFunnel;
    qa_funnel_by_variant: ProviderQaFunnelByVariant;
    qa_email_issues: QaEmailIssue[];
    provider_comms_funnel_by_type: ProviderCommsFunnelByType;
    benefits_funnel: BenefitsFunnel;
    benefits_funnel_by_variant: BenefitsFunnelByVariant;
    cta_funnel: CTAFunnel;
    cta_funnel_by_variant: CTAFunnelByVariant;
    managed_ads_funnel: ManagedAdsFunnel;
    managed_ads_funnel_by_variant: ManagedAdsFunnelByVariant;
    referrer_breakdown: ReferrerBreakdown;
  } | null;
  insight: string | null;
  botRejects: { count: number; date: string };
  topProviders: Array<{
    provider_id: string;
    provider_name: string | null;
    raw_views_7d: number;
    unique_sessions_7d: number;
    last_seen: string;
  }>;
  provider_activation: {
    window_days: number;
    claimed: number;
    profile_edits: number;
    owner_story: number;
    answered: number;
    prior: { claimed: number; profile_edits: number; owner_story: number; answered: number };
    section_breakdown: Record<string, number>;
    weekly: Array<{
      week_start: string;
      claimed: number;
      profile_edits: number;
      owner_story: number;
      answered: number;
    }>;
    feed: Array<{
      provider_id: string;
      provider_name: string | null;
      signal: "claimed" | "edited" | "answered";
      section: string | null;
      when: string;
    }>;
    feed_total: number;
  } | null;
  latestEvents: Array<{
    id: string;
    provider_id: string;
    event_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
}

const DEFAULT_RANGE: DateRangeValue = {
  preset: "7d",
  customFrom: "",
  customTo: "",
};

function rangeFromSearch(sp: ReturnType<typeof useSearchParams>): DateRangeValue {
  const preset = sp.get("preset");
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  if (preset === "custom") return { preset: "custom", customFrom: from, customTo: to };
  const valid = ["all", "today", "yesterday", "7d", "30d", "90d", "1y"] as const;
  if (preset && (valid as readonly string[]).includes(preset)) {
    return { preset: preset as DateRangeValue["preset"], customFrom: "", customTo: "" };
  }
  return DEFAULT_RANGE;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const range = useMemo(() => rangeFromSearch(searchParams), [searchParams]);
  const setRange = useCallback(
    (next: DateRangeValue) => {
      // Merge into existing params so other URL state (notably ?variant=
      // for the Family Intake drill-in expansion) survives a date-range
      // change. Replacing the URLSearchParams wholesale would silently
      // collapse any open drill-in.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("preset");
      params.delete("from");
      params.delete("to");
      params.set("preset", next.preset);
      if (next.preset === "custom") {
        if (next.customFrom) params.set("from", next.customFrom);
        if (next.customTo) params.set("to", next.customTo);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/analytics?${qs}` : "/admin/analytics", { scroll: false });
    },
    [router, searchParams],
  );

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { from, to } = resolveRange(range);
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    params.set("range_label", rangeLabel(range));
    fetch(`/api/admin/analytics/summary?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div>
      <PulseHeader
        title="Analytics"
        kpiSuffix="page views"
        statsPath="/api/admin/analytics/views/stats"
        range={range}
        onRangeChange={setRange}
      />

      <InsightStrip insight={summary?.insight ?? null} loading={loading} />

      <BulkCollapseToolbar />

      {/* Section order is curation: Family Intake and Provider Comms Funnel
          carry the highest-leverage operator decisions, so they sit up top.
          The windowed KPI roll-up and the legacy Q&A funnel are reference
          tables — useful but not where the eye should land first. */}
      <CollapsibleSection
        title="Family Intake"
        storageKey="benefitsFunnel"
        defaultCollapsed={true}
        forceOpen={!!searchParams.get("variant")}
        loading={loading && !!summary}
      >
        <BenefitsFunnelCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Activation (last 30 days)"
        storageKey="providerActivation"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <ProviderActivationCard summary={summary} loading={loading} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Comms Funnel"
        storageKey="providerCommsFunnel"
        defaultCollapsed={true}
        forceOpen={!!searchParams.get("comms_filter")}
        loading={loading && !!summary}
      >
        <ProviderCommsFunnelCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      {/* WindowedCard's section title is the date range itself, matching the
          existing in-card heading so the operator's mental anchor doesn't
          change. */}
      <CollapsibleSection
        title={rangeLabel(range)}
        storageKey="windowed"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <WindowedCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Q&A Email Funnel"
        storageKey="qaFunnel"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <QaFunnelCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="CTA Variants"
        storageKey="ctaFunnel"
        defaultCollapsed={true}
        forceOpen={!!searchParams.get("cta_variant")}
        loading={loading && !!summary}
      >
        <CTAVariantsCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Managed Ads Variants"
        storageKey="managedAdsFunnel"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <ManagedAdsVariantsCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Hub Mobile Nav"
        storageKey="mobileNavVariants"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <MobileNavVariantsCard />
      </CollapsibleSection>

      <CollapsibleSection
        title="Dashboard Banners"
        storageKey="dashboardBanners"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <DashboardBannersCard summary={summary} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Ads Pitch Touchpoints"
        storageKey="pitchTouchpoints"
        defaultCollapsed={true}
      >
        <PitchTouchpointsCard />
      </CollapsibleSection>

      <CollapsibleSection
        title="Top providers (last 7 days)"
        storageKey="topProviders"
        defaultCollapsed={true}
      >
        <TopProvidersCard summary={summary} loading={loading} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Latest 50 events"
        storageKey="latestEvents"
        defaultCollapsed={true}
      >
        <LatestEventsCard summary={summary} loading={loading} />
      </CollapsibleSection>

      <FootNote summary={summary} />
    </div>
  );
}

// ── Bulk collapse toolbar ────────────────────────────────────────────────
//
// Two text buttons aligned right, minimal chrome. Sits above the first
// CollapsibleSection so it reads as section-level control rather than
// page-level chrome.

function BulkCollapseToolbar() {
  return (
    <div className="flex justify-end gap-3 mb-3 -mt-1">
      <button
        type="button"
        onClick={() => bulkCollapse(false)}
        className="text-[11px] text-gray-500 hover:text-gray-900 underline underline-offset-2"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={() => bulkCollapse(true)}
        className="text-[11px] text-gray-500 hover:text-gray-900 underline underline-offset-2"
      >
        Collapse all
      </button>
    </div>
  );
}

// ── Insight strip ────────────────────────────────────────────────────────

function InsightStrip({ insight, loading }: { insight: string | null; loading: boolean }) {
  if (loading) return <div className="h-10 mb-6 rounded-xl bg-gray-50 animate-pulse" />;
  if (!insight) return null;
  return (
    <div className="mb-6 rounded-xl border border-gray-100 bg-gradient-to-br from-emerald-50/40 to-white px-5 py-3.5">
      <div className="flex items-start gap-2.5">
        <span className="text-emerald-700 text-sm leading-relaxed select-none">✦</span>
        <p className="text-sm text-gray-800 leading-relaxed">{insight}</p>
      </div>
    </div>
  );
}

// ── Windowed (KPI strip) ─────────────────────────────────────────────────

function WindowedCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-72 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) {
    return <p className="text-sm text-gray-400">Failed to load.</p>;
  }
  return (
    <div className="space-y-8">
          <AudienceGroup label="Care seekers" tint="bg-amber-50/70">
            <SubRow label="Discovery">
              <Stat
                label="Page views"
                value={summary.windowed.counts.page_view}
                prior={summary.prior?.counts.page_view ?? null}
                tooltip="Total provider page views in the window. Bots filtered server-side."
              />
              <Stat
                label="Unique sessions"
                value={summary.windowed.unique_sessions_page_view}
                prior={summary.prior?.unique_sessions_page_view ?? null}
                tooltip="Distinct anonymous browser sessions that viewed at least one provider page."
              />
              <Stat
                label="Card clicks"
                value={summary.windowed.counts.search_click}
                prior={summary.prior?.counts.search_click ?? null}
                tooltip="Click-throughs from a provider card on a results/browse page (NOT home-page Search button)."
              />
            </SubRow>
            <SubRow label="Traffic source" cols={6}>
              <Stat
                label="AI chat"
                value={summary.windowed.referrer_breakdown.ai_chat}
                prior={summary.prior?.referrer_breakdown.ai_chat ?? null}
                tooltip="Page views referred from ChatGPT, Claude, Gemini, Perplexity, or Copilot. The H2 capture target — should grow as llms.txt + JSON-LD land."
              />
              <Stat
                label="Search"
                value={summary.windowed.referrer_breakdown.search}
                prior={summary.prior?.referrer_breakdown.search ?? null}
                tooltip="Page views referred from Google, Bing, DuckDuckGo, Yahoo, or Brave search."
              />
              <Stat
                label="Social"
                value={summary.windowed.referrer_breakdown.social}
                prior={summary.prior?.referrer_breakdown.social ?? null}
                tooltip="Page views referred from Facebook, X, LinkedIn, Reddit, YouTube, TikTok, Instagram, or Pinterest."
              />
              <Stat
                label="Internal"
                value={summary.windowed.referrer_breakdown.olera_internal}
                prior={summary.prior?.referrer_breakdown.olera_internal ?? null}
                tooltip="Page views from olera.care itself — same-tab navigation between Olera pages."
              />
              <Stat
                label="Direct"
                value={summary.windowed.referrer_breakdown.direct}
                prior={summary.prior?.referrer_breakdown.direct ?? null}
                tooltip="Page views with no referrer — typed URLs, bookmarks, app webviews, or referrer-stripping browsers."
              />
              <Stat
                label="Other"
                value={summary.windowed.referrer_breakdown.other}
                prior={summary.prior?.referrer_breakdown.other ?? null}
                tooltip="Page views from any other external host. Long tail."
              />
            </SubRow>
            <SubRow label="Engagement">
              <Stat
                label="Questions"
                value={summary.windowed.counts.question_received}
                prior={summary.prior?.counts.question_received ?? null}
                href="/admin/questions"
                tooltip="New questions submitted by care seekers on provider pages."
              />
              <Stat
                label="Leads"
                value={summary.windowed.counts.lead_received}
                prior={summary.prior?.counts.lead_received ?? null}
                href="/admin/leads"
                tooltip="New connection requests from care seekers to providers."
              />
              <Stat
                label="Reviews"
                value={summary.windowed.counts.review_received}
                prior={summary.prior?.counts.review_received ?? null}
                href="/admin/reviews"
                tooltip="New reviews submitted on provider pages."
              />
              <Stat
                label="Saved"
                value={summary.windowed.counts.provider_saved}
                prior={summary.prior?.counts.provider_saved ?? null}
                tooltip="Providers saved by care seekers (guest + authenticated)."
              />
            </SubRow>
            <SubRow label="Family funnel">
              <Stat
                label="Benefits started"
                value={summary.windowed.counts.benefits_started}
                prior={summary.prior?.counts.benefits_started ?? null}
                tooltip="Care seekers who began the benefits intake on a provider page."
              />
              <Stat
                label="Benefits finished"
                value={summary.windowed.counts.benefits_completed}
                prior={summary.prior?.counts.benefits_completed ?? null}
                href="/admin/activity?actor=families"
                tooltip="Care seekers who completed the benefits intake and saved results."
              />
              <Stat
                label="Profiles published"
                value={summary.windowed.counts.matches_activated}
                prior={summary.prior?.counts.matches_activated ?? null}
                href="/admin/care-seekers"
                tooltip="Care seeker profiles flipped to active — visible to providers via matches."
              />
            </SubRow>
          </AudienceGroup>

          <AudienceGroup label="Providers" tint="bg-sky-50/70">
            <SubRow cols={6}>
              <Stat
                label="Opened Q&A emails"
                value={summary.windowed.provider_distinct_counts.qa_email_openers}
                prior={summary.prior?.provider_distinct_counts.qa_email_openers ?? null}
                tooltip="Distinct providers whose question-notification email was opened in this window. Apple Mail Privacy Protection prefetches images on receipt, inflating opens 30-50% for that cohort — click-through (Sign-ins from Q&A) is the cleaner signal."
              />
              <Stat
                label="Sign-ins from Q&A"
                value={summary.windowed.provider_distinct_counts.qa_signins}
                prior={summary.prior?.provider_distinct_counts.qa_signins ?? null}
                href="/admin/activity?actor=providers"
                tooltip="Distinct providers who clicked through a question-notification email and auto-signed in."
              />
              <Stat
                label="Claimed"
                value={summary.windowed.provider_distinct_counts.page_claims}
                prior={summary.prior?.provider_distinct_counts.page_claims ?? null}
                tooltip="Distinct providers who claimed their listing in this window (any source — email, instant-claim, or legacy page flow)."
              />
              <Stat
                label="Answered questions"
                value={summary.windowed.provider_distinct_counts.question_answerers}
                prior={summary.prior?.provider_distinct_counts.question_answerers ?? null}
                href="/admin/questions"
                tooltip="Distinct providers who responded to ≥1 question."
              />
              <Stat
                label="Engaged with leads"
                value={summary.windowed.provider_distinct_counts.lead_engagers}
                prior={summary.prior?.provider_distinct_counts.lead_engagers ?? null}
                href="/admin/leads"
                tooltip="Distinct providers who clicked through a lead-notification email."
              />
              <Stat
                label="Clicked dashboard CTA"
                value={summary.windowed.provider_distinct_counts.teaser_clickers}
                prior={summary.prior?.provider_distinct_counts.teaser_clickers ?? null}
                href="/admin/activity?actor=providers"
                tooltip="Distinct providers who clicked the analytics-teaser CTA on the welcome card."
              />
            </SubRow>
          </AudienceGroup>
    </div>
  );
}

// ── Q&A Email Funnel ─────────────────────────────────────────────────────

function QaFunnelCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const f = summary.windowed.qa_funnel;
  const pf = summary.prior?.qa_funnel ?? null;
  const issues = summary.windowed.qa_email_issues;

  // Funnel stages — `prev` is the count of the immediate prior stage, used
  // to compute step-to-step conversion. `Sent` has no prior stage.
  const stages: Array<{
    label: string;
    value: number;
    prior: number | null;
    prev: number | null;
    tooltip: string;
  }> = [
    {
      label: "Sent",
      value: f.sent,
      prior: pf?.sent ?? null,
      prev: null,
      tooltip:
        "Provider question_received emails dispatched in this window (cohort denominator). One row per send in email_log.",
    },
    {
      label: "Delivered",
      value: f.delivered,
      prior: pf?.delivered ?? null,
      prev: f.sent,
      tooltip:
        "Resend confirmed acceptance by recipient mailserver. % shown is delivery rate (delivered / sent).",
    },
    {
      label: "Opened",
      value: f.opened,
      prior: pf?.opened ?? null,
      prev: f.delivered,
      tooltip:
        "Provider opened the email (Resend webhook 'opened' event). Apple Mail Privacy Protection prefetches images on receipt, inflating opens 30-50% for that cohort — clicks are the cleaner signal. % shown is open rate (opened / delivered).",
    },
    {
      label: "Clicked",
      value: f.clicked,
      prior: pf?.clicked ?? null,
      prev: f.opened,
      tooltip:
        "Provider clicked a tracked link in the email. % shown is click-to-open rate (CTOR).",
    },
    {
      label: "Signed in",
      value: f.signed_in,
      prior: pf?.signed_in ?? null,
      prev: f.clicked,
      tooltip:
        "Distinct providers who auto-signed in via the email's one-click link (provider_activity event). Approximate attribution — anchored on activity time, not the email's send time, so for short windows this can diverge from the email cohort above.",
    },
    {
      label: "Answered",
      value: f.answered,
      prior: pf?.answered ?? null,
      prev: f.signed_in,
      tooltip:
        "Distinct providers who responded to ≥1 question in this window. Same approximate-attribution caveat as Signed in.",
    },
    {
      label: "Arrived (qa-success)",
      value: f.qa_success_arrivals,
      prior: pf?.qa_success_arrivals ?? null,
      prev: f.answered,
      tooltip:
        "Distinct providers who answered a question and were auto-redirected to /provider with ?from=qa-success. Diagnostic for the redirect mechanic — separates 'did they reach the dashboard?' (this column) from 'did the dashboard hero nudge them into action?' (Edited profile, below). Should be ≈ Answered when the redirect is healthy.",
    },
    {
      label: "Clicked dashboard",
      value: f.clicked_dashboard,
      prior: pf?.clicked_dashboard ?? null,
      prev: f.qa_success_arrivals,
      tooltip:
        `Distinct providers who clicked a dashboard CTA in this window — union of the analytics teaser on /onboard (${f.clicked_dashboard_by_source.qa_teaser}) + dashboard hero CTA, engagement OR completion tier (${f.clicked_dashboard_by_source.hero}). A provider counted once even if they used multiple paths. Activity-anchored, not strictly subset of Arrived.`,
    },
    {
      label: "Edited profile",
      value: f.edited_profile,
      prior: pf?.edited_profile ?? null,
      prev: f.clicked_dashboard,
      tooltip:
        "Distinct providers who saved an edit to any profile section in this window. Lagging activation indicator — measures whether dashboard nudges convert into real profile work.",
    },
  ];

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        Cohort: {`question_received`} emails sent {rangeLabel(range).toLowerCase()}. Step % is conversion from the previous step.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4">
        {stages.map((s) => (
          <FunnelStat key={s.label} {...s} />
        ))}
      </div>

      <VariantSplit byVariant={summary.windowed.qa_funnel_by_variant} />

      <div className="mt-6 pt-5 border-t border-gray-100">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
          Bounces & complaints
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Counted by event time in window (may reference Q&A emails sent earlier).
        </p>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 mb-4 max-w-md">
          <Stat
            label="Bounced"
            value={f.bounced}
            prior={pf?.bounced ?? null}
            tooltip="Distinct Q&A emails that bounced (hard or soft) in this window. Hard bounces should be triaged — typo addresses, dead domains."
          />
          <Stat
            label="Complained"
            value={f.complained}
            prior={pf?.complained ?? null}
            tooltip="Distinct Q&A emails recipients marked as spam in this window. Hurts sender reputation across all email."
          />
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-gray-400">No bounces or complaints in window.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {issues.map((iss, i) => (
              <li key={i} className="flex items-baseline gap-3">
                <span
                  className={`inline-flex w-20 shrink-0 text-[10px] font-medium uppercase tracking-wide ${
                    iss.type === "bounced" ? "text-rose-600" : "text-amber-700"
                  }`}
                >
                  {iss.type}
                </span>
                <span
                  className="flex-1 truncate text-gray-700"
                  title={iss.reason}
                >
                  {iss.reason}
                </span>
                <span className="tabular-nums text-gray-500">×{iss.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function VariantSplit({ byVariant }: { byVariant: ProviderQaFunnelByVariant }) {
  const a = byVariant.A;
  const b = byVariant.B;
  const totalAssigned = a.sent + b.sent;
  const waitingForFirstSend = totalAssigned === 0;

  const rate = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
        A/B Test — subject + preheader
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        A = production control (generic subject, no preheader). B = real question as subject + Olera-attributed preheader. Random 50/50 at send. PHI-filtered B falls back to a non-question subject when the question text mentions a health condition.
      </p>
      {waitingForFirstSend && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
          Waiting for the first variant-tagged send. The numbers below populate once a new <code className="text-[11px] bg-white/60 px-1 rounded">question_received</code> email fires post-deploy.
        </p>
      )}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Sent</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Delivered</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Opened</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Open rate</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Clicked</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">CTR (open→click)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="px-3 py-2 font-medium text-gray-700">A (control)</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">{a.sent}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{a.delivered}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{a.opened}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{rate(a.opened, a.delivered)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{a.clicked}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{rate(a.clicked, a.opened)}</td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-gray-700">
                B (question-as-subject)
                {b.phi_filtered > 0 && (
                  <span
                    className="ml-2 text-[10px] text-amber-600 font-normal"
                    title={`${b.phi_filtered} of ${b.sent} B emails fell back to non-question subject due to PHI keyword in question text`}
                  >
                    · {b.phi_filtered} PHI-filtered
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-900">{b.sent}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.delivered}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.opened}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{rate(b.opened, b.delivered)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{b.clicked}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{rate(b.clicked, b.opened)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {byVariant.unassigned.sent > 0 && (
        <p className="text-[11px] text-gray-400 mt-3">
          {byVariant.unassigned.sent} pre-deploy emails in window with no variant assigned (sent before A/B was wired up).
        </p>
      )}
    </div>
  );
}

// ── Provider Comms Funnel ────────────────────────────────────────────────
//
// The Q&A funnel above is the focused report for one email type. This card
// is the across-types view: pick an email-type bucket (or "All provider
// email") and see the same funnel walk + the engagement-bounce panel.
//
// Filter is client-side state — the API returns every bucket on a single
// /summary call so switching is instant. URL param `?comms_filter=` syncs
// it for cross-links from the automations page.

type ProviderCommsFilterKey = keyof ProviderCommsFunnelByType;

function isCommsFilterKey(s: string | null): s is ProviderCommsFilterKey {
  return !!s && (PROVIDER_EMAIL_FUNNEL_ORDER as readonly string[]).includes(s);
}

function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  const w = 60;
  const h = 16;
  const pad = 1.5;
  if (points.length < 2) return <div style={{ width: w, height: h }} className={className} />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (p - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className={className} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type DrillMetric = "claimed" | "profile_edits" | "answered" | "owner_story";
type DrillProvider = {
  provider_id: string;
  provider_name: string | null;
  last_at: string;
  count: number;
  sections: string[];
};

function ActivationDrillModal({
  metric,
  label,
  onClose,
}: {
  metric: DrillMetric;
  label: string;
  onClose: () => void;
}) {
  const [range, setRangeState] = useState<DateRangeValue>({
    preset: "30d",
    customFrom: "",
    customTo: "",
  });
  const [providers, setProviders] = useState<DrillProvider[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const LIMIT = 50;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Changing range resets pagination; offset changes append.
  const setRange = useCallback((next: DateRangeValue) => {
    setRangeState(next);
    setOffset(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const { from, to } = resolveRange(range);
    const params = new URLSearchParams({
      metric,
      offset: String(offset),
      limit: String(LIMIT),
    });
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    fetch(`/api/admin/analytics/activation-drill?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setProviders((prev) =>
          offset === 0 ? data.providers : [...prev, ...data.providers],
        );
        setTotal(data.total);
        setHasMore(data.has_more);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, range, offset]);

  const detailText = (p: DrillProvider): string => {
    if (metric === "profile_edits" || metric === "owner_story") {
      return p.sections.length > 0 ? p.sections.join(", ") : "profile";
    }
    return p.count > 1 ? `×${p.count}` : "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/30 backdrop-blur-[1px] p-4 sm:p-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl mt-8 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-50">
          <div>
            <div className="text-base font-semibold text-gray-900">{label}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {loading && providers.length === 0
                ? "Loading…"
                : `${total.toLocaleString()} provider${total === 1 ? "" : "s"} · ${rangeLabel(range)}`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DateRangePopover value={range} onChange={setRange} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {error ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Couldn&apos;t load this cohort. Try again.
            </p>
          ) : loading && providers.length === 0 ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No providers in this range.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {providers.map((p, i) => (
                <div
                  key={`${p.provider_id}-${i}`}
                  className="flex items-baseline justify-between gap-4 py-2.5"
                >
                  <Link
                    href={`/admin/directory/${p.provider_id}`}
                    className="text-[15px] text-gray-800 hover:text-teal-700 transition-colors truncate"
                  >
                    {p.provider_name ?? p.provider_id}
                  </Link>
                  <div className="flex items-baseline gap-4 shrink-0">
                    {detailText(p) && (
                      <span className="text-sm text-gray-500">{detailText(p)}</span>
                    )}
                    <span
                      className="text-xs tabular-nums text-gray-400 w-14 text-right"
                      title={new Date(p.last_at).toLocaleString()}
                    >
                      {timeAgoShort(p.last_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && !loading && (
            <button
              onClick={() => setOffset((o) => o + LIMIT)}
              className="mt-3 text-xs text-gray-500 hover:text-teal-700 transition-colors"
            >
              Show more
            </button>
          )}
          {loading && providers.length > 0 && (
            <p className="mt-3 text-xs text-gray-400">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderActivationCard({
  summary,
  loading,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [drill, setDrill] = useState<{ metric: DrillMetric; label: string } | null>(null);

  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const a = summary.provider_activation;
  if (!a) {
    return (
      <p className="text-sm text-gray-400">
        Provider activation not available in this response — server may be on an older deploy.
      </p>
    );
  }

  const tiles: Array<{
    metric: DrillMetric;
    label: string;
    value: number;
    prior: number;
    series: number[];
  }> = [
    { metric: "claimed", label: "Claimed", value: a.claimed, prior: a.prior.claimed, series: a.weekly.map((w) => w.claimed) },
    { metric: "profile_edits", label: "Profile edits", value: a.profile_edits, prior: a.prior.profile_edits, series: a.weekly.map((w) => w.profile_edits) },
    { metric: "answered", label: "Answered", value: a.answered, prior: a.prior.answered, series: a.weekly.map((w) => w.answered) },
    { metric: "owner_story", label: "Owner stories", value: a.owner_story, prior: a.prior.owner_story, series: a.weekly.map((w) => w.owner_story) },
  ];

  const signalLabel = (s: "claimed" | "edited" | "answered", section: string | null): string => {
    if (s === "claimed") return "Claimed listing";
    if (s === "answered") return "Answered a question";
    return section ? `Edited · ${section}` : "Edited profile";
  };

  const visible = showAll ? a.feed : a.feed.slice(0, 8);
  const sections = Object.entries(a.section_breakdown).sort((x, y) => y[1] - x[1]);

  return (
    <div className="space-y-7">
      <p className="text-xs text-gray-400">
        Distinct providers acting on their listing, server-side. Fixed {a.window_days}-day
        window — independent of the date filter above; activation is low-volume, a stable
        window keeps the trend readable.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-6">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setDrill({ metric: t.metric, label: t.label })}
            className="group text-left rounded-lg -m-1.5 p-1.5 hover:bg-gray-50/70 transition-colors"
            title={`See the providers behind "${t.label}"`}
          >
            <Stat label={t.label} value={t.value} prior={t.prior} />
            <Sparkline
              points={t.series}
              className="text-teal-600/45 group-hover:text-teal-600/70 transition-colors mt-3"
            />
          </button>
        ))}
      </div>

      {sections.length > 0 && (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2.5">
            What they&apos;re editing
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {sections.map(([sec, n]) => (
              <span key={sec} className="text-gray-700">
                <span className="tabular-nums font-medium">{n}</span>{" "}
                <span className="text-gray-400">{sec}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-3">
          Recent activity
        </div>
        {a.feed.length === 0 ? (
          <p className="text-sm text-gray-400">No activation in window.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map((r, i) => (
              <div
                key={`${r.provider_id}-${r.when}-${i}`}
                className="flex items-baseline justify-between gap-4 py-2.5"
              >
                <Link
                  href={`/admin/directory/${r.provider_id}`}
                  className="text-[15px] text-gray-800 hover:text-teal-700 transition-colors truncate"
                >
                  {r.provider_name ?? r.provider_id}
                </Link>
                <div className="flex items-baseline gap-4 shrink-0">
                  <span className="text-sm text-gray-500">
                    {signalLabel(r.signal, r.section)}
                  </span>
                  <span
                    className="text-xs tabular-nums text-gray-400 w-14 text-right"
                    title={new Date(r.when).toLocaleString()}
                  >
                    {timeAgoShort(r.when)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {a.feed.length > 8 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs text-gray-500 hover:text-teal-700 transition-colors"
          >
            {showAll
              ? "Show less"
              : a.feed_total > a.feed.length
                ? `Show ${a.feed.length} more recent (of ${a.feed_total})`
                : `Show all ${a.feed.length}`}
          </button>
        )}
      </div>

      {drill && (
        <ActivationDrillModal
          metric={drill.metric}
          label={drill.label}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

function ProviderCommsFunnelCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlFilter = searchParams.get("comms_filter");
  const initial: ProviderCommsFilterKey = isCommsFilterKey(urlFilter) ? urlFilter : "all";
  const [filter, setFilter] = useState<ProviderCommsFilterKey>(initial);

  // Keep state in sync if the URL changes (back/forward, cross-link from
  // another surface). When the URL drops the param entirely, reset to "all"
  // so the dropdown doesn't lie about the rendered view.
  useEffect(() => {
    if (isCommsFilterKey(urlFilter)) {
      if (urlFilter !== filter) setFilter(urlFilter);
    } else if (urlFilter === null && filter !== "all") {
      setFilter("all");
    }
    // intentionally not depending on `filter` — we only react to URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilter]);

  const onChangeFilter = (next: ProviderCommsFilterKey) => {
    setFilter(next);
    // Write to URL so the section's state survives reloads and is shareable.
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("comms_filter");
    else params.set("comms_filter", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  // Defensive: if the server response predates this field (stale cache or
  // partial deploy), bail with a quiet placeholder rather than crashing on
  // [filter] indexing into undefined.
  if (!summary.windowed.provider_comms_funnel_by_type) {
    return <p className="text-sm text-gray-400">Provider comms funnel not available in this response — server may be on an older deploy.</p>;
  }

  const f = summary.windowed.provider_comms_funnel_by_type[filter];
  const pf = summary.prior?.provider_comms_funnel_by_type?.[filter] ?? null;

  const stages: Array<{ label: string; value: number; prior: number | null; prev: number | null; tooltip: string; subscript?: string }> = [
    { label: "Sent", value: f.sent, prior: pf?.sent ?? null, prev: null,
      tooltip: "Provider-bound emails of this type dispatched in this window (cohort denominator). One row per send in email_log." },
    { label: "Delivered", value: f.delivered, prior: pf?.delivered ?? null, prev: f.sent,
      tooltip: "Resend confirmed acceptance by recipient mailserver. % shown is delivery rate (delivered / sent)." },
    { label: "Opened", value: f.opened, prior: pf?.opened ?? null, prev: f.delivered,
      tooltip: "Provider opened the email (Resend webhook 'opened'). Apple Mail Privacy Protection prefetches images on receipt, inflating opens 30-50% for that cohort — clicks are the cleaner signal. % shown is open rate (opened / delivered)." },
    // The four downstream rows are distinct-provider counts. Comparing them
    // against the raw email_log click row count produced misleading % drops
    // (e.g. 374 click rows → 54 distinct signed-in providers reads as "14%
    // of prev" but lots of those 374 are scanner prefetches or re-clicks).
    // Showing distinct_clickers as the Clicked value, and using it as the
    // denominator for the four downstream rows, keeps the cascade unit-
    // consistent. Raw rows still surface in the subscript + tooltip.
    { label: "Clicked", value: f.distinct_clickers, prior: pf?.distinct_clickers ?? null, prev: f.opened,
      subscript: `${f.clicked.toLocaleString()} raw clicks`,
      tooltip: `Distinct providers who clicked a tracked link in the email. Raw click rows: ${f.clicked.toLocaleString()} (a single provider may click multiple times, and email security scanners often prefetch links, both of which inflate the raw row count). % shown is rough click-through (distinct clickers / raw opens) — opens are also raw rows so the rate is approximate.` },
    { label: "Signed in", value: f.signed_in, prior: pf?.signed_in ?? null, prev: f.distinct_clickers,
      tooltip: "Distinct providers who both clicked an email in this bucket AND did a one-click sign-in in window (any action: question / lead / review). Approximate attribution — anchored on activity time, not the email send. A provider who got multiple email types in the window may be counted in each bucket they clicked. % shown is sign-in rate among distinct clickers. NOTE: the gap between Clicked and Signed in mostly reflects corporate email security (Mimecast, Microsoft Defender, Proofpoint, Barracuda) auto-prefetching links to scan for malware — those prefetches register as clicks but never reach the sign-in page. Empirically ~78% of recorded clicks fire within 60s of delivery (scanner signature). Real human click → sign-in conversion is close to 100%." },
    { label: "Answered", value: f.answered, prior: pf?.answered ?? null, prev: f.distinct_clickers,
      tooltip: "Distinct providers who clicked an email in this bucket AND answered ≥1 question in window. Same approximate-attribution caveat as Signed in. % shown is answer rate among distinct clickers." },
    { label: "Clicked dashboard", value: f.clicked_dashboard, prior: pf?.clicked_dashboard ?? null, prev: f.distinct_clickers,
      tooltip: "Distinct providers who clicked an email in this bucket AND clicked any dashboard CTA in window — union of the analytics teaser on /onboard and the dashboard hero on /provider. % shown is dashboard-click rate among distinct clickers." },
    { label: "Edited profile", value: f.edited_profile, prior: pf?.edited_profile ?? null, prev: f.distinct_clickers,
      tooltip: "Distinct providers who clicked an email in this bucket AND saved a profile edit in window. Lagging activation indicator. % shown is profile-edit rate among distinct clickers." },
  ];

  // Denominator is distinct clickers, not raw click rows — engagement_bounces
  // is distinct providers, so mixing units (bounces / raw clicks) would over-
  // count clicks when a provider clicked multiple emails in the same bucket.
  const bouncePct = f.distinct_clickers > 0 ? Math.round((f.engagement_bounces / f.distinct_clickers) * 100) : null;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500">
          Cohort: provider emails sent {rangeLabel(range).toLowerCase()}, filtered to{" "}
          <span className="font-medium text-gray-700">{PROVIDER_EMAIL_FUNNEL_LABELS[filter]}</span>.
          Step % is conversion from the previous stage. Clicked is distinct providers (raw click rows shown in the tooltip); the four downstream rows compare against that distinct-clicker denominator.
        </p>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">Filter</span>
          <select
            value={filter}
            onChange={(e) => onChangeFilter(e.target.value as ProviderCommsFilterKey)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
          >
            {PROVIDER_EMAIL_FUNNEL_ORDER.map((k) => (
              <option key={k} value={k}>{PROVIDER_EMAIL_FUNNEL_LABELS[k]}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Two-grid layout with a hinge line between: the first row is email-
          tracking metrics (Resend webhooks — noisy because corporate mail
          security prefetches every URL); the second row is on-page activity
          (only fires on a real browser load, so it's the clean human signal).
          Splitting them lets the caveat live exactly where the units shift,
          rather than floating below as a generic disclaimer. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-4">
        {stages.slice(0, 4).map((s) => <FunnelStat key={s.label} {...s} />)}
      </div>

      <div
        className="mt-5 mb-5 flex items-start gap-2 text-[11px] italic leading-relaxed text-gray-400"
        title="Empirically, ~78% of recorded clicks fire within 60 seconds of email delivery — the signature of automated link-scanning. Corporate email security tools (Mimecast, Microsoft Defender, Proofpoint, Barracuda) auto-prefetch every URL in incoming mail to scan for malware. Each prefetch hits Resend's tracking pixel and registers as a click, even though no one ever visited the page. One-click sign-in (the `one_click_access` event) only fires after the onboard page loads in a real browser, which filters out scanner traffic — so real human click → sign-in conversion is much closer to 100% than the displayed % suggests."
      >
        <span aria-hidden="true" className="text-gray-300 select-none">↓</span>
        <span>
          Click counts above include automated mail-security prefetches (Mimecast, Defender, Proofpoint, Barracuda auto-fetching every URL). The activity metrics below only fire when a real browser loads the page &mdash; that&rsquo;s the human signal.
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-4">
        {stages.slice(4).map((s) => <FunnelStat key={s.label} {...s} />)}
      </div>

      {/* Engagement bounce panel ─────────────────────────────────────── */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
          Engagement bounces
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          Providers who clicked an email of this bucket but produced none of the four downstream events in window. The diagnostic for &ldquo;they came in &mdash; what happened?&rdquo;
        </p>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 mb-4 max-w-md">
          <div title="Distinct providers who clicked but did nothing measurable on-site.">
            <div className="text-[26px] font-semibold tabular-nums leading-none text-gray-900">{f.engagement_bounces.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1.5 leading-tight">Clicked &amp; bounced</div>
            <div className="text-[10.5px] tabular-nums mt-1.5 leading-none">
              {bouncePct !== null ? (
                <span className="text-gray-500 font-medium">{bouncePct}% of {f.distinct_clickers.toLocaleString()} clickers</span>
              ) : <span className="invisible">.</span>}
            </div>
          </div>
        </div>

        {f.top_bouncers.length === 0 ? (
          <p className="text-sm text-gray-400">No engagement bounces in window.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/60 text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">Last clicked email</th>
                  <th className="px-3 py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {f.top_bouncers.map((b) => (
                  <tr key={b.provider_id} className="text-gray-700">
                    <td className="px-3 py-2">
                      <Link href={`/admin/directory/${b.provider_id}`} className="text-teal-700 hover:underline">{b.provider_id}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{b.last_clicked_email_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500" title={new Date(b.last_clicked_at).toLocaleString()}>
                      {timeAgoShort(b.last_clicked_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Compact "Nm/Nh/Nd ago" formatter used by the engagement-bouncers table.
function timeAgoShort(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Family Intake ────────────────────────────────────────────────────────

function BenefitsFunnelCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const f = summary.windowed.benefits_funnel;
  const pf = summary.prior?.benefits_funnel ?? null;

  // Distinct sessions per stage. `impressions` is the cohort denominator (the
  // module rendered on a provider page). `started` is the first interactive
  // step (care-need card click). Each subsequent stage is a session that
  // fired benefits_step_completed for that step. The save step's completion
  // is the conversion event — it fires immediately before the save-results
  // POST in BenefitsDiscoveryModule.
  const stages: Array<{
    label: string;
    value: number;
    prior: number | null;
    prev: number | null;
    tooltip: string;
  }> = [
    {
      label: "Impressions",
      value: f.impressions,
      prior: pf?.impressions ?? null,
      prev: null,
      tooltip:
        "Distinct sessions that saw the intake module render on a provider page (cohort denominator). Mirrors the outreach module's impression event so the four A/B arms can be compared apples-to-apples.",
    },
    {
      label: "Started",
      value: f.started,
      prior: pf?.started ?? null,
      prev: f.impressions,
      tooltip:
        "Distinct sessions that took the first interactive action — clicked a care-need card on the benefits form, or clicked a recommended provider card on the outreach module. % shown is conversion from Impressions (engagement rate).",
    },
    {
      label: "Care need ✓",
      value: f.care_need_completed,
      prior: pf?.care_need_completed ?? null,
      prev: f.started,
      tooltip:
        "Distinct sessions that completed step 1 (care need). % shown is conversion from Started.",
    },
    {
      label: "Age ✓",
      value: f.age_completed,
      prior: pf?.age_completed ?? null,
      prev: f.care_need_completed,
      tooltip:
        "Distinct sessions that completed step 2 (age). % shown is conversion from Care need.",
    },
    {
      label: "Financial ✓",
      value: f.financial_completed,
      prior: pf?.financial_completed ?? null,
      prev: f.age_completed,
      tooltip:
        "Distinct sessions that completed step 3 (medicaid + income). % shown is conversion from Age.",
    },
    {
      label: "Submitted email",
      value: f.saved,
      prior: pf?.saved ?? null,
      prev: f.financial_completed,
      tooltip:
        "Distinct sessions that clicked submit on the final step with a valid email. Event fires immediately before the backend save POST, so a rare backend failure won't reduce this count. % shown is conversion from Financial.",
    },
  ];

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        Top-line tracks the embedded benefits-help form on a provider page {rangeLabel(range).toLowerCase()} — distinct sessions per step, with % showing conversion from the previous step. The 6-arm A/B comparison below adds outreach, qa_email_capture, and multi_provider so all variants can be compared on a shared Impressions denominator.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4">
        {stages.map((s) => (
          <FunnelStat key={s.label} {...s} />
        ))}
      </div>

      <TrafficAllocationControl />

      <BenefitsVariantSplit byVariant={summary.windowed.benefits_funnel_by_variant} range={range} />
    </>
  );
}

// Live dial for the intake A/B traffic split. Reads the current weights
// + version from /api/admin/analytics/variant-weights on mount, lets
// the operator edit per-arm percentages, and POSTs back when sum is
// exactly 100. Saving bumps the version on the server side, which
// reshuffles returning sessions on their next visit (assignment hash
// is namespaced by version — see lib/analytics/variant.ts).
//
// Arm list is derived from INTAKE_VARIANTS so adding/removing a code-
// level arm flows into this UI automatically. Layout uses an auto-fit
// grid so 4 / 5 / 6+ arms all flow naturally without leaving a dangling
// last card.
//
// Use cases this supports cleanly:
//   - Even split (default).
//   - Two-arm head-to-head: zero out the others.
//   - Single-arm rollout: 100 on one, 0 elsewhere.
//   - Off-but-keep-the-code-path: any 0 leaves the variant assignable
//     in code without taking traffic.

function buildEqualSplit(): Record<IntakeVariant, number> {
  // Distribute 100 across N arms. Floor each share, then assign the
  // remainder (100 - N*floor) to the first arm so the sum stays at
  // exactly 100. With 4 arms this is 25/25/25/25; with 3 it's 34/33/33;
  // with 7 it's 16/14/14/14/14/14/14. Always lands on integers, always
  // sums to 100 — i.e. always passes the save validator without
  // additional fiddling.
  const n = INTAKE_VARIANTS.length;
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  const out = Object.fromEntries(
    INTAKE_VARIANTS.map((v, i) => [v, base + (i === 0 ? remainder : 0)]),
  ) as Record<IntakeVariant, number>;
  return out;
}

function TrafficAllocationControl() {
  const [loaded, setLoaded] = useState(false);
  const initial = useMemo(buildEqualSplit, []);
  const [weights, setWeights] = useState<Record<IntakeVariant, number>>(initial);
  // Saved snapshot. Used to detect "is the form dirty?" so Save is only
  // enabled when something has actually changed AND the new sum is 100.
  const [savedWeights, setSavedWeights] = useState<Record<IntakeVariant, number>>(initial);
  const [version, setVersion] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Always reach a loaded state — even on auth failure or 500 — so the
    // form isn't a dead zone. Show error feedback so the operator knows
    // why the inputs hold the equal-split fallback instead of the live row.
    fetch("/api/admin/analytics/variant-weights", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFeedback({ kind: "err", msg: `Failed to load current allocation (${r.status}).` });
          setLoaded(true);
          return;
        }
        const data = await r.json().catch(() => null);
        if (!data) {
          setFeedback({ kind: "err", msg: "Failed to parse current allocation." });
          setLoaded(true);
          return;
        }
        const w = (data.weights ?? {}) as Partial<Record<IntakeVariant, number>>;
        // Mirror the server's coerceWeights semantics: missing keys mean
        // 0%. If a new arm has been added in code but the DB row doesn't
        // carry it yet, the dial shows the new arm at 0 (and the existing
        // arms still sum to 100). Operator deliberately turns it on by
        // re-balancing and saving.
        const merged = Object.fromEntries(
          INTAKE_VARIANTS.map((v) => [v, typeof w[v] === "number" ? (w[v] as number) : 0]),
        ) as Record<IntakeVariant, number>;
        setWeights(merged);
        setSavedWeights(merged);
        setVersion(typeof data.version === "number" ? data.version : 0);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFeedback({ kind: "err", msg: "Network error loading allocation — try refreshing." });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sum = INTAKE_VARIANTS.reduce((s, v) => s + (weights[v] || 0), 0);
  const sumIsValid = sum === 100;
  const isDirty = INTAKE_VARIANTS.some((v) => weights[v] !== savedWeights[v]);
  const canSave = loaded && sumIsValid && isDirty && !saving;

  const setArm = (arm: IntakeVariant, raw: string) => {
    // Allow empty string while editing; coerce to integer 0-100 on commit.
    const n = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    setWeights((prev) => ({ ...prev, [arm]: Math.max(0, Math.min(100, n)) }));
    if (feedback?.kind === "ok") setFeedback(null); // clear stale "Saved" once they edit again
  };

  const reset = () => {
    setWeights(savedWeights);
    setFeedback(null);
  };

  const equalize = () => {
    setWeights(buildEqualSplit());
    if (feedback?.kind === "ok") setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/analytics/variant-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ kind: "err", msg: body?.error || `Save failed (${res.status})` });
      } else {
        const w = (body?.weights ?? {}) as Partial<Record<IntakeVariant, number>>;
        const merged = { ...weights };
        for (const v of INTAKE_VARIANTS) {
          if (typeof w[v] === "number") merged[v] = w[v] as number;
        }
        setSavedWeights(merged);
        setWeights(merged);
        setVersion(typeof body?.version === "number" ? body.version : version + 1);
        setFeedback({ kind: "ok", msg: "Saved — returning sessions reshuffle on their next visit." });
      }
    } catch {
      setFeedback({ kind: "err", msg: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Traffic allocation
        </div>
        <div className="text-[11px] text-gray-400 tabular-nums">
          v{version}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Live dial for the {INTAKE_VARIANTS.length}-arm intake split. Set any arm to 0 to dark it out without removing the code path; concentrate to 100 on a single arm to ramp a winner. Saves apply to new + returning sessions on their next visit (version bump invalidates the prior assignment).
      </p>

      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        {INTAKE_VARIANTS.map((v) => (
          <label
            key={v}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-[11px] font-medium text-gray-700">{variantSurfaceLabel(v)}</span>
            <span className="text-[10px] text-gray-400 leading-tight">{variantSubLabel(v)}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!loaded || saving}
                value={weights[v]}
                onChange={(e) => setArm(v, e.target.value)}
                className="w-16 text-right tabular-nums text-base font-medium text-gray-900 bg-transparent border-b border-gray-200 focus:border-gray-900 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-gray-400">%</span>
              <a
                href={previewUrl(v)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                title="Open the test provider page with this arm forced. Events + submissions disabled."
              >
                Preview ↗
              </a>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[12px] tabular-nums px-2 py-0.5 rounded ${
            sumIsValid
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          Sum: {sum} / 100{sumIsValid ? "" : ` (${sum > 100 ? "+" : ""}${sum - 100})`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            canSave
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save allocation"}
        </button>
        <button
          type="button"
          onClick={equalize}
          disabled={!loaded || saving}
          className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:text-gray-300 disabled:no-underline"
        >
          Reset to equal split
        </button>
        {isDirty && !saving && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            Discard changes
          </button>
        )}
        {feedback && (
          <span
            className={`text-[11px] ${
              feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

type VariantKey = keyof BenefitsFunnelByVariant;
const DRILLABLE_VARIANTS: ReadonlySet<VariantKey> = new Set([
  "availability",
  "loss",
  "empathic",
  "outreach",
  "qa_email_capture",
  "multi_provider",
  "multi_provider_v2",
  "control",
  "money_loss",
]);

// Stable test provider used as the canvas for arm previews. Hardcoded
// because the only person clicking these links is internal product
// staff who want a consistent baseline page across arms — a slug
// picker would be churn for v1. Aggie Assisted Living lives in TX,
// so the {state} interpolations in the benefits-arm copy render
// correctly. Update if the test page is ever migrated.
const PREVIEW_PROVIDER_SLUG = "aggie-assisted-living-college-station-tx-t66r";

function previewUrl(arm: string): string {
  return `/provider/${PREVIEW_PROVIDER_SLUG}?preview_arm=${encodeURIComponent(arm)}`;
}

function BenefitsVariantSplit({
  byVariant,
  range,
}: {
  byVariant: BenefitsFunnelByVariant;
  range: DateRangeValue;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read the expanded variant from the URL so the state survives reload
  // and is shareable via link. Validates against the known set so a stray
  // ?variant=foo doesn't try to render a missing arm.
  const expandedRaw = searchParams.get("variant");
  const expandedVariant: VariantKey | null =
    expandedRaw && DRILLABLE_VARIANTS.has(expandedRaw as VariantKey)
      ? (expandedRaw as VariantKey)
      : null;

  const toggleVariant = useCallback(
    (key: VariantKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (expandedVariant === key) {
        params.delete("variant");
      } else {
        params.set("variant", key);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/analytics?${qs}` : "/admin/analytics", { scroll: false });
    },
    [searchParams, expandedVariant, router],
  );

  const resolved = resolveRange(range);
  const dateFrom = resolved.from ?? null;
  const dateTo = resolved.to ?? null;

  const totalAssigned =
    byVariant.availability.impressions +
    byVariant.loss.impressions +
    byVariant.empathic.impressions +
    byVariant.outreach.impressions +
    byVariant.qa_email_capture.impressions +
    byVariant.multi_provider.impressions +
    byVariant.multi_provider_v2.impressions +
    byVariant.control.impressions +
    byVariant.money_loss.impressions;
  const waitingForFirstImpression = totalAssigned === 0;

  const rate = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  // Active arms. Empty rows are still shown so the layout stays stable as
  // data trickles in.
  const activeArms = [
    { key: "availability" as const, label: "availability", description: "There's help paying for care in {state}." },
    { key: "loss" as const, label: "loss", description: "Most {state} families miss out on help paying for care." },
    { key: "empathic" as const, label: "empathic (single-step D)", description: "Single-step capture w/ value preview. Question-anchored copy." },
    { key: "outreach" as const, label: "outreach", description: "Our care team gets pricing, availability, and how to start from the top providers — in one email.", skipEngaged: true },
    { key: "qa_email_capture" as const, label: "qa_email_capture", description: "No SBF / no outreach. Q&A enrichment ON with comparison-providers value-promise.", skipEngaged: true },
    { key: "multi_provider" as const, label: "multi_provider", description: "Tinder-style card stack — send question to multiple similar providers." },
    { key: "multi_provider_v2" as const, label: "multi_provider_v2", description: "Email-first variant — shows email capture immediately after first question, optional card stack expansion." },
  ];
  // Legacy V2 arms only render when they have data in the window — once the
  // historical window rolls past V2, these rows disappear automatically.
  const legacyCandidates = [
    { key: "control" as const, label: "control (legacy V2)" },
    { key: "money_loss" as const, label: "money_loss (legacy V2)" },
  ];
  // Legacy V2 rows predate the benefits_entry_viewed instrumentation, so
  // they'll have started > 0 but impressions == 0. Keep them visible while
  // any signal exists in either column so the historical funnel doesn't
  // disappear from the dashboard mid-window.
  const legacyArms = legacyCandidates.filter(
    (a) => byVariant[a.key].started > 0 || byVariant[a.key].impressions > 0,
  );

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
        A/B Test — entry-point module (6-arm)
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Deterministic split by session id (djb2 hash, weighted-bucket lookup against the live allocation set above) — 3 benefits-help copy arms + 1 AI agent outreach arm + 1 qa_email_capture arm + 1 multi_provider arm. Impressions = module rendered on a provider page; Started = first interactive action (care-need click for benefits, recommended-card click for outreach, N/A for non-benefits arms); Submitted = email/form submission. Conversion % = Submitted / Impressions, so all six arms compare on the same denominator. Variant copy strings + commentary live in the{" "}
        <a
          href="https://app.notion.com/p/ec27110d1c6a4cc1a76bdf991344f63d"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-gray-600"
        >
          SBF Copy Variants Notion DB
        </a>
        .
      </p>
      {waitingForFirstImpression && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
          Waiting for the first variant-tagged impression. The numbers below populate once a new module impression fires in this window.
        </p>
      )}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Impressions</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Started</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Engaged / Care Need</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Submitted</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {activeArms.map(({ key, label, description, skipEngaged }) => {
              const r = byVariant[key];
              const isExpanded = expandedVariant === key;
              return (
                <Fragment key={key}>
                  <tr
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${
                      isExpanded ? "bg-gray-50/60" : "hover:bg-gray-50/40"
                    }`}
                    onClick={() => toggleVariant(key)}
                    aria-expanded={isExpanded}
                  >
                    <td className="px-3 py-2 font-medium text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                        <span>{label}</span>
                        <a
                          href={previewUrl(key)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                          title="Open the test provider page with this arm forced. Events + submissions disabled."
                        >
                          Preview ↗
                        </a>
                      </div>
                      <div className="text-[11px] font-normal text-gray-400 truncate max-w-[280px] pl-4">{description}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.impressions}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.started}</td>
                    {/* Outreach/qa_email_capture have no engaged step — show — instead of 0. */}
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {skipEngaged ? <span className="text-gray-300">—</span> : r.care_need_completed}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.saved}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{rate(r.saved, r.impressions)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/30">
                      <td colSpan={6} className="px-3 py-4">
                        <VariantSessionsList variant={key} dateFrom={dateFrom} dateTo={dateTo} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {legacyArms.length > 0 && (
              <>
                <tr>
                  <td colSpan={6} className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-gray-400">
                    Legacy V2 (historical)
                  </td>
                </tr>
                {legacyArms.map(({ key, label }) => {
                  const r = byVariant[key];
                  const isExpanded = expandedVariant === key;
                  // Legacy V2 rows predate the benefits_entry_viewed event,
                  // so they have impressions=0 even when they have meaningful
                  // started/saved counts. Fall back to saved/started so the
                  // historical conversion rate stays visible until those
                  // rows roll out of the window entirely.
                  const legacyConversion =
                    r.impressions > 0 ? rate(r.saved, r.impressions) : rate(r.saved, r.started);
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${
                          isExpanded ? "bg-gray-50/60" : "hover:bg-gray-50/40 opacity-60"
                        }`}
                        onClick={() => toggleVariant(key)}
                        aria-expanded={isExpanded}
                      >
                        <td className="px-3 py-2 font-medium text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              aria-hidden="true"
                            >
                              ›
                            </span>
                            <span>{label}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                          {r.impressions > 0 ? r.impressions : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.started}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.care_need_completed}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.saved}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{legacyConversion}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50/30">
                          <td colSpan={6} className="px-3 py-4">
                            <VariantSessionsList variant={key} dateFrom={dateFrom} dateTo={dateTo} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
      {byVariant.unassigned.impressions > 0 && (
        <p className="text-[11px] text-gray-400 mt-3">
          {byVariant.unassigned.impressions} sessions in window with no variant assigned (events fired before any A/B was wired).
        </p>
      )}
    </div>
  );
}

// ── Dashboard Banners ─────────────────────────────────────────────────────
// Leaderboard of the provider-dashboard hero banners by click-through. Unlike
// CTA Variants (a randomized A/B test), the hero is a contextual next-best-
// action engine: each provider sees one banner chosen by their own state. So
// CTR here is a visibility signal (which banners get traction), NOT a
// controlled comparison — banners are shown to different audiences. The caption
// says so to keep the numbers from being over-read.

/** Human label for a hero bannerId. Completion sections (`completion:<id>`) are
 *  expanded; everything else maps to a fixed friendly name. */
function bannerLabel(banner: string): string {
  if (banner.startsWith("completion:")) {
    const section = banner.slice("completion:".length);
    return `Complete profile — ${section.charAt(0).toUpperCase()}${section.slice(1)}`;
  }
  const map: Record<string, string> = {
    leads: "New inquiries",
    questions: "Unanswered questions",
    find_families_live: "Find Families — family near you",
    view_spike: "View spike",
    find_families_intel: "Find Families — market intel",
    reviews: "Collect reviews",
  };
  return map[banner] ?? banner;
}

/** Who each banner reaches. Shown as a muted sub-line so conversion rates are
 *  read within-cohort — never as a cross-banner ranking (the cascade routes by
 *  provider state, so the audiences aren't comparable). */
function bannerCohort(banner: string): string {
  if (banner.startsWith("completion:")) return "incomplete profiles";
  const map: Record<string, string> = {
    leads: "engaged — has new inquiries",
    questions: "has open questions",
    find_families_live: "no inbound — live family nearby",
    find_families_intel: "quiet — complete profile, no leads",
    view_spike: "rising views — reinforcement",
    reviews: "has active ads — reviews nudge",
  };
  return map[banner] ?? "";
}

function DashboardBannersCard({ summary }: { summary: SummaryResponse | null }) {
  const rows = summary?.windowed.banner_leaderboard ?? [];
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalConverted = rows.reduce((sum, r) => sum + (r.converted ?? 0), 0);
  // Which banner the preview lightbox opened on (null = closed). Any row opens
  // it; ‹ › then flip through every banner, so it doubles as the full gallery.
  const [previewBanner, setPreviewBanner] = useState<string | null>(null);

  const tiles: Array<{ label: string; value: number; hint: string }> = [
    { label: "Shown to", value: totalImpressions, hint: "distinct providers" },
    { label: "Clicked through", value: totalClicks, hint: "tapped the CTA" },
    { label: "Converted", value: totalConverted, hint: "did the action ≤3d" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-200/70 p-5 sm:p-6">
      <p className="text-[13px] text-gray-500 leading-relaxed mb-1">
        Which dashboard hero banners providers see, how many click through, and how many go on to
        do the action the banner nudged. Counts are{" "}
        <span className="font-medium text-gray-700">distinct providers</span> per banner in this window.
      </p>
      <p className="text-[11px] text-gray-400 mb-4">
        Contextual nudges, not a controlled A/B test — each provider sees one banner chosen by
        their own state, so banners reach different audiences (the cohort is noted under each row).
        Read these <span className="italic">within</span> a banner, not as a ranking across banners.
        Converted = did the action within 3 days of seeing the banner; it&rsquo;s a last-touch signal,
        not proof the banner caused it.
      </p>
      {totalImpressions > 0 && (
        <p className="text-[11px] text-gray-400 mb-4">
          Click any row to preview the actual banner — copy, photo, and CTA exactly as the provider
          sees it. Use <span className="font-medium text-gray-600">‹ ›</span> to flip through every
          banner.
        </p>
      )}

      {totalImpressions === 0 ? (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2">
          No banner impressions in this window yet. Rows populate once providers load their
          dashboard and a provider_picker_impression fires.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                <div className="text-2xl font-semibold tabular-nums text-gray-900">{t.value}</div>
                <div className="text-[12px] text-gray-600 mt-0.5">{t.label}</div>
                <div className="text-[10px] text-gray-400">{t.hint}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-3 py-2 font-medium">Banner</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">Shown to</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">Clicked</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">CTR</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">Converted</th>
                  <th className="px-3 py-2 font-medium tabular-nums text-right">Conv. rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ctr = r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 100) : 0;
                  const hasConv = r.converted !== null;
                  const convRate =
                    hasConv && r.impressions > 0
                      ? Math.round(((r.converted as number) / r.impressions) * 100)
                      : null;
                  return (
                    <tr
                      key={r.banner}
                      onClick={() => setPreviewBanner(r.banner)}
                      className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50/70 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="text-gray-900">{bannerLabel(r.banner)}</div>
                        <div className="text-[11px] text-gray-400">{bannerCohort(r.banner)}</div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-gray-700 align-top">{r.impressions}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right text-gray-700 align-top">{r.clicks}</td>
                      <td className="px-3 py-2.5 tabular-nums text-right font-medium text-gray-900 align-top">
                        {r.impressions > 0 ? `${ctr}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        {hasConv ? (
                          <div>
                            <span className="tabular-nums font-medium text-emerald-700">{r.converted}</span>
                            {r.convLabel && (
                              <div className="text-[11px] text-emerald-600/80">{r.convLabel.toLowerCase()}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300" title="No CTA — reinforcement only">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-right font-medium text-gray-900 align-top">
                        {convRate !== null ? `${convRate}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {previewBanner && (
        <BannerPreviewLightbox
          startBanner={previewBanner}
          onClose={() => setPreviewBanner(null)}
        />
      )}
    </div>
  );
}

/**
 * Unframed banner preview. Container discipline (Lens 7): the hero card is the
 * ONE surface — it floats on a dimmed field with nothing wrapping it. Chrome is
 * reduced to quiet text: a label line, bare ‹ › arrows flanking the card, and a
 * Desktop · Mobile text toggle. No panel, no header bar, no metadata strip.
 * Renders the real <HeroCard> so the preview is the actual component.
 */
function BannerPreviewLightbox({
  startBanner,
  onClose,
}: {
  startBanner: string;
  onClose: () => void;
}) {
  const previews = useMemo(() => buildBannerPreviews(), []);
  const startIdx = Math.max(0, previews.findIndex((p) => p.bannerId === startBanner));
  const [idx, setIdx] = useState(startIdx);
  const [surface, setSurface] = useState<"desktop" | "mobile">("desktop");

  const go = useCallback(
    (delta: number) => setIdx((i) => (i + delta + previews.length) % previews.length),
    [previews.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const current = previews[idx];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-warm-950/85 backdrop-blur-sm px-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Banner preview"
    >
      {/* ‹ › flank the whole field, Airbnb photo-tap style — bare glyphs, no box */}
      <button
        onClick={(e) => { e.stopPropagation(); go(-1); }}
        className="absolute left-3 sm:left-8 top-1/2 -translate-y-1/2 text-4xl leading-none text-white/40 hover:text-white transition-colors"
        aria-label="Previous banner"
      >
        ‹
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); go(1); }}
        className="absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 text-4xl leading-none text-white/40 hover:text-white transition-colors"
        aria-label="Next banner"
      >
        ›
      </button>

      {/* label — a quiet caption, not a header bar */}
      <p className="text-[13px] font-medium text-white/85 mb-1">{bannerLabel(current.bannerId)}</p>
      <p className="text-[11px] text-white/40 mb-6">{bannerCohort(current.bannerId)}</p>

      {/* the one surface: the real card. stop propagation so a click on it
          (e.g. the CTA) doesn't close the field */}
      <div
        className={surface === "mobile" ? "w-[380px] max-w-[88vw]" : "w-[680px] max-w-[92vw]"}
        onClick={(e) => e.stopPropagation()}
      >
        <HeroCard firstName="Maria" hook={current.hook} surface={surface} />
      </div>

      {/* Desktop · Mobile — text toggle, not a boxed button group */}
      <div className="mt-6 flex items-center gap-3 text-[12px]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setSurface("desktop")}
          className={surface === "desktop" ? "text-white font-medium" : "text-white/40 hover:text-white/70 transition-colors"}
        >
          Desktop
        </button>
        <span className="text-white/20">·</span>
        <button
          onClick={() => setSurface("mobile")}
          className={surface === "mobile" ? "text-white font-medium" : "text-white/40 hover:text-white/70 transition-colors"}
        >
          Mobile
        </button>
      </div>
      <p className="mt-3 text-[11px] text-white/30">
        {idx + 1} / {previews.length} · Esc to close
      </p>
    </div>
  );
}

// ── CTA Variants ──────────────────────────────────────────────────────────

function CTAVariantsCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const f = summary.windowed.cta_funnel;
  const pf = summary.prior?.cta_funnel ?? null;

  const stages: Array<{
    label: string;
    value: number;
    prior: number | null;
    prev: number | null;
    tooltip: string;
  }> = [
    {
      label: "Impressions",
      value: f.impressions,
      prior: pf?.impressions ?? null,
      prev: null,
      tooltip: "Distinct sessions that saw a CTA variant render on a provider page.",
    },
    {
      label: "Clicked",
      value: f.clicked,
      prior: pf?.clicked ?? null,
      prev: f.impressions,
      tooltip: "Distinct sessions that clicked the CTA to open the form/sheet.",
    },
    {
      label: "Engaged",
      value: f.engaged,
      prior: pf?.engaged ?? null,
      prev: f.clicked,
      tooltip: "Distinct sessions that clicked 'Save this comparison' (compare variant only).",
    },
    {
      label: "Converted",
      value: f.converted,
      prior: pf?.converted ?? null,
      prev: f.clicked, // Use clicked as baseline since it's the common step across all variants
      tooltip: "Distinct sessions that submitted a lead (lead_received with cta_variant attribution).",
    },
  ];

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        CTA A/B testing funnel {rangeLabel(range).toLowerCase()} — distinct sessions per stage. Impressions = CTA rendered; Clicked = form/sheet opened; Engaged = 'Save comparison' clicked; Converted = lead submitted.
      </p>

      <div className="grid grid-cols-4 gap-x-5 gap-y-4 mb-6">
        {stages.map((s) => (
          <FunnelStat key={s.label} {...s} />
        ))}
      </div>

      <CTATrafficAllocationControl />

      <CTAVariantSplit byVariant={summary.windowed.cta_funnel_by_variant} range={range} />
    </>
  );
}

// Traffic allocation control for CTA variants
function buildCTAEqualSplit(): Record<CTAVariant, number> {
  const n = CTA_VARIANTS.length;
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  const out = Object.fromEntries(
    CTA_VARIANTS.map((v, i) => [v, base + (i === 0 ? remainder : 0)]),
  ) as Record<CTAVariant, number>;
  return out;
}

function CTATrafficAllocationControl() {
  const [loaded, setLoaded] = useState(false);
  const initial = useMemo(buildCTAEqualSplit, []);
  const [weights, setWeights] = useState<Record<CTAVariant, number>>(initial);
  const [savedWeights, setSavedWeights] = useState<Record<CTAVariant, number>>(initial);
  const [version, setVersion] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics/cta-variant-weights", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFeedback({ kind: "err", msg: `Failed to load current allocation (${r.status}).` });
          setLoaded(true);
          return;
        }
        const data = await r.json().catch(() => null);
        if (!data) {
          setFeedback({ kind: "err", msg: "Failed to parse current allocation." });
          setLoaded(true);
          return;
        }
        const w = (data.weights ?? {}) as Partial<Record<CTAVariant, number>>;
        const merged = Object.fromEntries(
          CTA_VARIANTS.map((v) => [v, typeof w[v] === "number" ? (w[v] as number) : 0]),
        ) as Record<CTAVariant, number>;
        setWeights(merged);
        setSavedWeights(merged);
        setVersion(typeof data.version === "number" ? data.version : 0);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFeedback({ kind: "err", msg: "Network error loading allocation — try refreshing." });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sum = CTA_VARIANTS.reduce((s, v) => s + (weights[v] || 0), 0);
  const sumIsValid = sum === 100;
  const isDirty = CTA_VARIANTS.some((v) => weights[v] !== savedWeights[v]);
  const canSave = loaded && sumIsValid && isDirty && !saving;

  const setArm = (arm: CTAVariant, raw: string) => {
    const n = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    setWeights((prev) => ({ ...prev, [arm]: Math.max(0, Math.min(100, n)) }));
    if (feedback?.kind === "ok") setFeedback(null);
  };

  const reset = () => {
    setWeights(savedWeights);
    setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/analytics/cta-variant-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ kind: "err", msg: body?.error || `Save failed (${res.status})` });
      } else {
        const w = (body?.weights ?? {}) as Partial<Record<CTAVariant, number>>;
        const merged = { ...weights };
        for (const v of CTA_VARIANTS) {
          if (typeof w[v] === "number") merged[v] = w[v] as number;
        }
        setSavedWeights(merged);
        setWeights(merged);
        setVersion(typeof body?.version === "number" ? body.version : version + 1);
        setFeedback({ kind: "ok", msg: "Saved — returning sessions reshuffle on their next visit." });
      }
    } catch {
      setFeedback({ kind: "err", msg: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Traffic allocation
        </div>
        <div className="text-[11px] text-gray-400 tabular-nums">
          v{version}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Live dial for the CTA variant split. Set any arm to 0 to dark it out. Saves apply to new + returning sessions on their next visit.
      </p>

      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
      >
        {CTA_VARIANTS.map((v) => (
          <label
            key={v}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-[11px] font-medium text-gray-700">{ctaVariantLabel(v)}</span>
            <span className="text-[10px] text-gray-400 leading-tight">{ctaVariantSubLabel(v)}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!loaded || saving}
                value={weights[v]}
                onChange={(e) => setArm(v, e.target.value)}
                className="w-16 text-right tabular-nums text-base font-medium text-gray-900 bg-transparent border-b border-gray-200 focus:border-gray-900 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-gray-400">%</span>
              <a
                href={ctaPreviewUrl(v)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                title="Open the test provider page with this CTA variant forced."
              >
                Preview ↗
              </a>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[12px] tabular-nums px-2 py-0.5 rounded ${
            sumIsValid
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          Sum: {sum} / 100{sumIsValid ? "" : ` (${sum > 100 ? "+" : ""}${sum - 100})`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            canSave
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save allocation"}
        </button>
        {isDirty && !saving && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            Discard changes
          </button>
        )}
        {feedback && (
          <span
            className={`text-[11px] ${
              feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// Same test provider slug for CTA previews
const CTA_PREVIEW_PROVIDER_SLUG = "aggie-assisted-living-college-station-tx-t66r";

function ctaPreviewUrl(arm: string): string {
  return `/provider/${CTA_PREVIEW_PROVIDER_SLUG}?preview_cta=${encodeURIComponent(arm)}`;
}

type CTAVariantKey = keyof CTAFunnelByVariant;

function CTAVariantSplit({
  byVariant,
  range,
}: {
  byVariant: CTAFunnelByVariant;
  range: DateRangeValue;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expandedRaw = searchParams.get("cta_variant");
  // Valid keys: all CTA_VARIANTS + "unassigned"
  const validKeys = new Set<string>([...CTA_VARIANTS, "unassigned"]);
  const expandedVariant: CTAVariantKey | null =
    expandedRaw && validKeys.has(expandedRaw)
      ? (expandedRaw as CTAVariantKey)
      : null;

  const toggleVariant = useCallback(
    (key: CTAVariantKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (expandedVariant === key) {
        params.delete("cta_variant");
      } else {
        params.set("cta_variant", key);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/analytics?${qs}` : "/admin/analytics", { scroll: false });
    },
    [searchParams, expandedVariant, router],
  );

  const resolved = resolveRange(range);
  const dateFrom = resolved.from ?? null;
  const dateTo = resolved.to ?? null;

  // Sum impressions across all actual CTA variants (not unassigned)
  const totalAssigned = CTA_VARIANTS.reduce((sum, v) => sum + (byVariant[v]?.impressions ?? 0), 0);
  const waitingForFirstImpression = totalAssigned === 0;

  const rate = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  // Variants that track the "engaged" step (save_comparison_clicked)
  const ENGAGED_VARIANTS = new Set<CTAVariantKey>(["compare"]);

  // Dynamically generate arms from CTA_VARIANTS for consistent coverage
  const arms: Array<{ key: CTAVariantKey; label: string; description: string }> = CTA_VARIANTS.map(v => ({
    key: v,
    label: ctaVariantLabel(v),
    description: ctaVariantSubLabel(v),
  }));

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
        A/B Test — CTA Variants
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Deterministic split by session id (djb2 hash, weighted-bucket lookup). Impressions = CTA rendered; Clicked = form/sheet opened; Engaged = 'Save comparison' clicked; Converted = lead submitted.
      </p>
      {waitingForFirstImpression && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
          Waiting for the first CTA variant impression. The numbers below populate once a cta_variant_impression fires in this window.
        </p>
      )}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Impressions</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Clicked</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Engaged</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Converted</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Conv%</th>
            </tr>
          </thead>
          <tbody>
            {arms.map(({ key, label, description }) => {
              const r = byVariant[key];
              const isExpanded = expandedVariant === key;
              return (
                <Fragment key={key}>
                  <tr
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${
                      isExpanded ? "bg-gray-50/60" : "hover:bg-gray-50/40"
                    }`}
                    onClick={() => toggleVariant(key)}
                    aria-expanded={isExpanded}
                  >
                    <td className="px-3 py-2 font-medium text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                        <span>{label}</span>
                        <a
                          href={ctaPreviewUrl(key)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                          title="Open the test provider page with this CTA variant forced."
                        >
                          Preview ↗
                        </a>
                      </div>
                      <div className="text-[11px] font-normal text-gray-400 truncate max-w-[340px] pl-4">{description}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.impressions}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.clicked}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {ENGAGED_VARIANTS.has(key) ? r.engaged : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.converted}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{rate(r.converted, r.impressions)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/30">
                      <td colSpan={6} className="px-3 py-4">
                        <CTAVariantSessionsList variant={key} dateFrom={dateFrom} dateTo={dateTo} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {byVariant.unassigned.impressions > 0 && (
        <p className="text-[11px] text-gray-400 mt-3">
          {byVariant.unassigned.impressions} sessions in window with no variant assigned (events fired before CTA A/B was wired).
        </p>
      )}
    </div>
  );
}

// ── Managed Ads Variants ───────────────────────────────────────────────────

function ManagedAdsVariantsCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const f = summary.windowed.managed_ads_funnel;
  const pf = summary.prior?.managed_ads_funnel ?? null;
  const stages: Array<{
    label: string;
    value: number;
    prior: number | null;
    prev: number | null;
    tooltip: string;
  }> = [
    {
      label: "Shown",
      value: f.shown,
      prior: pf?.shown ?? null,
      prev: null,
      tooltip: "Distinct providers who saw a managed-ads pitch surface.",
    },
    {
      label: "Clicked",
      value: f.clicked,
      prior: pf?.clicked ?? null,
      prev: f.shown,
      tooltip: "Distinct providers who clicked toward the managed-ads launch plan.",
    },
    {
      label: "Viewed Plan",
      value: f.viewed,
      prior: pf?.viewed ?? null,
      prev: f.clicked,
      tooltip: "Distinct providers who landed on /provider/boost.",
    },
    {
      label: "Requested",
      value: f.requested,
      prior: pf?.requested ?? null,
      prev: f.viewed,
      tooltip: "Distinct providers who submitted a managed-ads request.",
    },
  ];

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        Managed Ads A/B testing funnel {rangeLabel(range).toLowerCase()} — distinct providers per stage. Shown = pitch rendered; Clicked = launch-plan CTA clicked; Viewed Plan = /provider/boost viewed; Requested = campaign request submitted.
      </p>

      <div className="grid grid-cols-4 gap-x-5 gap-y-4 mb-6">
        {stages.map((s) => (
          <FunnelStat key={s.label} {...s} />
        ))}
      </div>

      <ManagedAdsTrafficAllocationControl />
      <ManagedAdsVariantSplit byVariant={summary.windowed.managed_ads_funnel_by_variant} />
    </>
  );
}

function buildManagedAdsEqualSplit(): Record<ManagedAdsVariant, number> {
  const n = MANAGED_ADS_VARIANTS.length;
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  return Object.fromEntries(
    MANAGED_ADS_VARIANTS.map((v, i) => [v, base + (i === 0 ? remainder : 0)]),
  ) as Record<ManagedAdsVariant, number>;
}

function ManagedAdsTrafficAllocationControl() {
  const [loaded, setLoaded] = useState(false);
  const initial = useMemo(buildManagedAdsEqualSplit, []);
  const [weights, setWeights] = useState<Record<ManagedAdsVariant, number>>(initial);
  const [savedWeights, setSavedWeights] = useState<Record<ManagedAdsVariant, number>>(initial);
  const [version, setVersion] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics/managed-ads-variant-weights", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFeedback({ kind: "err", msg: `Failed to load current allocation (${r.status}).` });
          setLoaded(true);
          return;
        }
        const data = await r.json().catch(() => null);
        if (!data) {
          setFeedback({ kind: "err", msg: "Failed to parse current allocation." });
          setLoaded(true);
          return;
        }
        const w = (data.weights ?? {}) as Partial<Record<ManagedAdsVariant, number>>;
        const merged = Object.fromEntries(
          MANAGED_ADS_VARIANTS.map((v) => [v, typeof w[v] === "number" ? (w[v] as number) : 0]),
        ) as Record<ManagedAdsVariant, number>;
        setWeights(merged);
        setSavedWeights(merged);
        setVersion(typeof data.version === "number" ? data.version : 0);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFeedback({ kind: "err", msg: "Network error loading allocation — try refreshing." });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sum = MANAGED_ADS_VARIANTS.reduce((s, v) => s + (weights[v] || 0), 0);
  const sumIsValid = sum === 100;
  const isDirty = MANAGED_ADS_VARIANTS.some((v) => weights[v] !== savedWeights[v]);
  const canSave = loaded && sumIsValid && isDirty && !saving;

  const setArm = (arm: ManagedAdsVariant, raw: string) => {
    const n = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    setWeights((prev) => ({ ...prev, [arm]: Math.max(0, Math.min(100, n)) }));
    if (feedback?.kind === "ok") setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/analytics/managed-ads-variant-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ kind: "err", msg: body?.error || `Save failed (${res.status})` });
      } else {
        const w = (body?.weights ?? {}) as Partial<Record<ManagedAdsVariant, number>>;
        const merged = { ...weights };
        for (const v of MANAGED_ADS_VARIANTS) {
          if (typeof w[v] === "number") merged[v] = w[v] as number;
        }
        setSavedWeights(merged);
        setWeights(merged);
        setVersion(typeof body?.version === "number" ? body.version : version + 1);
        setFeedback({ kind: "ok", msg: "Saved — providers reshuffle on their next visit." });
      }
    } catch {
      setFeedback({ kind: "err", msg: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Traffic allocation
        </div>
        <div className="text-[11px] text-gray-400 tabular-nums">v{version}</div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Live dial for the provider-level managed-ads pitch split. Set any arm to 0 to dark it out.
      </p>

      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {MANAGED_ADS_VARIANTS.map((v) => (
          <label
            key={v}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-[11px] font-medium text-gray-700">{managedAdsVariantLabel(v)}</span>
            <span className="text-[10px] text-gray-400 leading-tight">{managedAdsVariantSubLabel(v)}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!loaded || saving}
                value={weights[v]}
                onChange={(e) => setArm(v, e.target.value)}
                className="w-16 text-right tabular-nums text-base font-medium text-gray-900 bg-transparent border-b border-gray-200 focus:border-gray-900 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-gray-400">%</span>
              <a
                href={managedAdsPreviewUrl(v)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                title="Open the boost page with this managed-ads variant forced."
              >
                Preview ↗
              </a>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[12px] tabular-nums px-2 py-0.5 rounded ${
            sumIsValid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          Sum: {sum} / 100{sumIsValid ? "" : ` (${sum > 100 ? "+" : ""}${sum - 100})`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            canSave
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save allocation"}
        </button>
        {isDirty && !saving && (
          <button
            type="button"
            onClick={() => {
              setWeights(savedWeights);
              setFeedback(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            Discard changes
          </button>
        )}
        {feedback && (
          <span className={`text-[11px] ${feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function managedAdsPreviewUrl(arm: string): string {
  return `/provider/boost?preview_managed_ads=${encodeURIComponent(arm)}`;
}

function ManagedAdsVariantSplit({
  byVariant,
}: {
  byVariant: ManagedAdsFunnelByVariant;
}) {
  const totalAssigned = MANAGED_ADS_VARIANTS.reduce((sum, v) => sum + (byVariant[v]?.shown ?? 0), 0);
  const waitingForFirstShown = totalAssigned === 0;
  const rate = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
        A/B Test — Managed Ads Variants
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Deterministic split by provider id. Shown = pitch rendered; Clicked = launch-plan CTA clicked; Viewed Plan = /provider/boost viewed; Requested = managed-ads request submitted.
      </p>
      {waitingForFirstShown && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
          Waiting for the first managed-ads pitch view. The numbers below populate once managed_ads_pitch_viewed fires in this window.
        </p>
      )}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-3 py-2 font-medium">Variant</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Shown</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Clicked</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Viewed Plan</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Requested</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Req%</th>
            </tr>
          </thead>
          <tbody>
            {MANAGED_ADS_VARIANTS.map((key) => {
              const r = byVariant[key];
              return (
                <tr key={key} className="border-b border-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-700">
                    <div className="flex items-center gap-1.5">
                      <span>{managedAdsVariantLabel(key)}</span>
                      <a
                        href={managedAdsPreviewUrl(key)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                        title="Open the boost page with this managed-ads variant forced."
                      >
                        Preview ↗
                      </a>
                    </div>
                    <div className="text-[11px] font-normal text-gray-400 truncate max-w-[340px]">
                      {managedAdsVariantSubLabel(key)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">{r.shown}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.clicked}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.viewed}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.requested}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{rate(r.requested, r.shown)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {byVariant.unassigned.shown > 0 && (
        <p className="text-[11px] text-gray-400 mt-3">
          {byVariant.unassigned.shown} providers in window with no managed-ads variant assigned.
        </p>
      )}
    </div>
  );
}

function FunnelStat({
  label,
  value,
  prior,
  prev,
  tooltip,
  subscript,
}: {
  label: string;
  value: number;
  prior: number | null;
  prev: number | null;
  tooltip: string;
  /** Optional faint secondary line under the % row — used to surface a
   *  second-unit count (e.g. raw click rows under the distinct-clicker
   *  value) without needing a tooltip hover. */
  subscript?: string;
}) {
  const animated = useAnimatedCount(value, 600);
  const isZero = value === 0;
  const stepPct = prev !== null && prev > 0 ? Math.round((value / prev) * 100) : null;
  const delta = computeDelta(value, prior);

  return (
    <div title={tooltip} className={`cursor-default ${isZero ? "opacity-50" : ""}`}>
      <div
        className={`text-[26px] font-semibold tabular-nums leading-none ${
          isZero ? "text-gray-400 font-medium" : "text-gray-900"
        }`}
      >
        {animated.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1.5 leading-tight">{label}</div>
      <div className="text-[10.5px] tabular-nums mt-1.5 leading-none">
        {stepPct !== null ? (
          <span className="text-gray-500 font-medium">{stepPct}% of prev</span>
        ) : delta.state === "noPrior" ? (
          <span className="invisible">.</span>
        ) : (
          <span
            className={
              delta.state === "up" || delta.state === "newSignal"
                ? "text-emerald-700 font-medium"
                : delta.state === "down"
                ? "text-rose-600 font-medium"
                : "text-gray-400 font-medium"
            }
          >
            {delta.pctText}
          </span>
        )}
      </div>
      {subscript && (
        <div className="text-[10px] tabular-nums mt-1 leading-none text-gray-400">
          {subscript}
        </div>
      )}
    </div>
  );
}

function AudienceGroup({
  label,
  tint,
  children,
}: {
  label: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl ${tint} p-5`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-4">
        {label}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function SubRow({
  label,
  cols = 3,
  children,
}: {
  label?: string;
  cols?: 3 | 5 | 6;
  children: React.ReactNode;
}) {
  const colsClass =
    cols === 6 ? "lg:grid-cols-6" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-3";
  return (
    <div>
      {label && (
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2.5">
          {label}
        </div>
      )}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${colsClass} gap-x-5 gap-y-4`}>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  prior,
  href,
  tooltip,
}: {
  label: string;
  value: number;
  prior: number | null;
  href?: string;
  tooltip?: string;
}) {
  const animated = useAnimatedCount(value, 600);
  const isZero = value === 0;
  const delta = computeDelta(value, prior);

  const inner = (
    <div className={isZero ? "opacity-50" : ""}>
      <div
        className={`text-[26px] font-semibold tabular-nums leading-none ${
          isZero ? "text-gray-400 font-medium" : "text-gray-900"
        }`}
      >
        {animated.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 mt-1.5 leading-tight">{label}</div>
      <DeltaLine delta={delta} />
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={tooltip}
        className="block rounded-md -m-1 p-1 hover:bg-white/80 transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div title={tooltip} className="cursor-default">
      {inner}
    </div>
  );
}

type DeltaState = "up" | "down" | "flat" | "newSignal" | "noPrior";

function computeDelta(
  value: number,
  prior: number | null,
): { state: DeltaState; pctText: string } {
  if (prior === null) return { state: "noPrior", pctText: "" };
  if (prior === 0 && value === 0) return { state: "flat", pctText: "no change" };
  if (prior === 0 && value > 0) return { state: "newSignal", pctText: "new" };
  const pct = ((value - prior) / prior) * 100;
  const rounded = Math.round(pct);
  if (Math.abs(rounded) < 1) return { state: "flat", pctText: "flat" };
  return {
    state: rounded > 0 ? "up" : "down",
    pctText: `${rounded > 0 ? "↑" : "↓"} ${Math.abs(rounded)}%`,
  };
}

function DeltaLine({ delta }: { delta: { state: DeltaState; pctText: string } }) {
  if (delta.state === "noPrior") return <div className="h-3.5 mt-1.5" />;
  const tone =
    delta.state === "up"
      ? "text-emerald-700"
      : delta.state === "down"
      ? "text-rose-600"
      : delta.state === "newSignal"
      ? "text-emerald-700"
      : "text-gray-400";
  return (
    <div className={`text-[10.5px] font-medium tabular-nums mt-1.5 ${tone} leading-none`}>
      {delta.pctText}
    </div>
  );
}

// ── Top providers ────────────────────────────────────────────────────────

type SortKey = "raw" | "unique" | "last";

function TopProvidersCard({
  summary,
  loading,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("unique");
  const sorted = useMemo(() => {
    if (!summary) return [];
    const rows = [...summary.topProviders];
    if (sortKey === "raw") rows.sort((a, b) => b.raw_views_7d - a.raw_views_7d);
    else if (sortKey === "unique") rows.sort((a, b) => b.unique_sessions_7d - a.unique_sessions_7d);
    else if (sortKey === "last") rows.sort((a, b) => (b.last_seen > a.last_seen ? 1 : -1));
    return rows;
  }, [summary, sortKey]);

  return (
    <>
      {loading && !summary ? (
        <div className="h-32 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />
      ) : !summary || sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No page views logged yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">Provider</th>
                <SortableTh
                  current={sortKey}
                  k="unique"
                  setSort={setSortKey}
                  align="right"
                  label="Unique sessions"
                />
                <SortableTh
                  current={sortKey}
                  k="raw"
                  setSort={setSortKey}
                  align="right"
                  label="Raw views"
                />
                <SortableTh current={sortKey} k="last" setSort={setSortKey} label="Last seen" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.provider_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-6 py-2.5">
                    <Link
                      href={`/admin/directory/${p.provider_id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {p.provider_name || p.provider_id}
                    </Link>
                    {p.provider_name && (
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                        {p.provider_id}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-2.5 tabular-nums text-right text-gray-900">
                    {p.unique_sessions_7d.toLocaleString()}
                  </td>
                  <td className="px-6 py-2.5 tabular-nums text-right text-gray-500">
                    {p.raw_views_7d.toLocaleString()}
                  </td>
                  <td
                    className="px-6 py-2.5 text-gray-500 whitespace-nowrap"
                    title={new Date(p.last_seen).toLocaleString()}
                  >
                    {formatRelative(p.last_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SortableTh({
  current,
  k,
  setSort,
  label,
  align,
}: {
  current: SortKey;
  k: SortKey;
  setSort: (k: SortKey) => void;
  label: string;
  align?: "right";
}) {
  const isActive = current === k;
  return (
    <th
      className={`px-6 py-2 font-medium tabular-nums ${align === "right" ? "text-right" : ""}`}
    >
      <button
        onClick={() => setSort(k)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 transition-colors ${
          isActive ? "text-gray-900" : "text-gray-500"
        }`}
      >
        {label}
        {isActive && <span className="text-[9px]">▼</span>}
      </button>
    </th>
  );
}

// ── Latest events ────────────────────────────────────────────────────────

function LatestEventsCard({
  summary,
  loading,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
}) {
  return (
    <>
      {loading && !summary ? (
        <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />
      ) : !summary || summary.latestEvents.length === 0 ? (
        <p className="text-sm text-gray-400">No events yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 font-medium">When</th>
                <th className="px-6 py-2 font-medium">Event</th>
                <th className="px-6 py-2 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody>
              {summary.latestEvents.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 align-top hover:bg-gray-50/60">
                  <td
                    className="px-6 py-2 text-gray-500 whitespace-nowrap"
                    title={new Date(e.created_at).toLocaleString()}
                  >
                    {formatRelative(e.created_at)}
                  </td>
                  <td className="px-6 py-2">
                    <EventBadge type={e.event_type} />
                  </td>
                  <td className="px-6 py-2 font-mono text-xs">
                    <Link
                      href={`/admin/directory/${e.provider_id}`}
                      className="text-emerald-700 hover:underline break-all"
                    >
                      {e.provider_id}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EventBadge({ type }: { type: string }) {
  const tone = EVENT_TONE[type] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${tone}`}
    >
      {type}
    </span>
  );
}

const EVENT_TONE: Record<string, string> = {
  page_view: "bg-emerald-50 text-emerald-700",
  search_click: "bg-sky-50 text-sky-700",
  cta_click_public: "bg-violet-50 text-violet-700",
  benefits_started: "bg-teal-50 text-teal-700",
  claim_completed: "bg-indigo-50 text-indigo-700",
  lead_received: "bg-amber-50 text-amber-700",
  review_received: "bg-yellow-50 text-yellow-800",
  question_received: "bg-blue-50 text-blue-700",
  email_click: "bg-gray-100 text-gray-600",
  one_click_access: "bg-gray-100 text-gray-600",
  reviews_cta_clicked: "bg-pink-50 text-pink-700",
  contact_revealed: "bg-orange-50 text-orange-700",
  suspicious_claim: "bg-rose-50 text-rose-700",
  lead_opened: "bg-gray-100 text-gray-600",
  question_responded: "bg-gray-100 text-gray-600",
  review_viewed: "bg-gray-100 text-gray-600",
  provider_saved: "bg-pink-50 text-pink-700",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Footer ───────────────────────────────────────────────────────────────

// ── Pitch Touchpoints ─────────────────────────────────────────────────────
// Ad pitch surface engagement — which nudges/banners drive providers toward
// the boost page. Separate from the managed-ads funnel (which tracks conversion).

function PitchTouchpointsCard() {
  const [data, setData] = useState<TouchpointsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ad-boost/touchpoints")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  if (!data) {
    return <p className="text-gray-400 text-sm">Failed to load touchpoint data.</p>;
  }

  if (data.touchpoints.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-4">
        No touchpoint data yet. Events will appear once providers see the pitch surfaces.
      </p>
    );
  }

  return (
    <>
      <p className="text-xs text-gray-500 mb-3">
        Last 30 days · Distinct providers per touchpoint · CTR = Clicked ÷ Viewed
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-4 text-xs font-medium uppercase tracking-wide text-gray-400">
                Touchpoint
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                Viewed
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                Clicked
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                CTR
              </th>
              <th className="text-right py-2 pl-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                Dismissed
              </th>
            </tr>
          </thead>
          <tbody>
            {data.touchpoints.map((t) => (
              <tr key={t.touchpoint} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 pr-4 text-gray-900">{t.label}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{t.viewed}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{t.clicked}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">
                  {t.viewed > 0 ? `${t.ctr}%` : "—"}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums text-gray-500">{t.dismissed}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td className="py-2.5 pr-4 font-medium text-gray-900">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">
                {data.totals.viewed}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">
                {data.totals.clicked}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">
                {data.totals.viewed > 0
                  ? `${Math.round((data.totals.clicked / data.totals.viewed) * 100)}%`
                  : "—"}
              </td>
              <td className="py-2.5 pl-3 text-right tabular-nums font-medium text-gray-500">
                {data.totals.dismissed}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function FootNote({ summary }: { summary: SummaryResponse | null }) {
  return (
    <div className="mt-6 flex items-center justify-between text-xs text-gray-400">
      <p>
        Phase 0 sanity-check view. Counts are raw — nightly aggregation tables run at 8 AM UTC.
      </p>
      {summary && (
        <span
          className="tabular-nums whitespace-nowrap"
          title="Per-instance counter (in-memory). Resets at UTC midnight. Undercounts across multi-region deploys."
        >
          Bot rejects today:{" "}
          <span className="font-medium text-gray-600">
            {summary.botRejects.count.toLocaleString()}
          </span>
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Hub Mobile Nav — A/B test for provider dashboard mobile navigation
// ─────────────────────────────────────────────────────────────────────────────

function MobileNavVariantsCard() {
  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        A/B test for Provider Hub mobile navigation. Tests different layouts (hamburger menu vs bottom tab bar) for logged-in providers on mobile devices.
      </p>
      <MobileNavTrafficAllocationControl />
      <div className="mt-8 pt-6 border-t border-gray-100">
        <MobileNavAnalytics />
      </div>
    </>
  );
}

function buildMobileNavEqualSplit(): Record<MobileNavVariant, number> {
  const n = MOBILE_NAV_VARIANTS.length;
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  return Object.fromEntries(
    MOBILE_NAV_VARIANTS.map((v, i) => [v, base + (i === 0 ? remainder : 0)]),
  ) as Record<MobileNavVariant, number>;
}

// Preview URL for mobile nav variants — uses provider dashboard
const MOBILE_NAV_PREVIEW_URL = "/provider";

function mobileNavPreviewUrl(arm: string): string {
  return `${MOBILE_NAV_PREVIEW_URL}?preview_mobile_nav=${encodeURIComponent(arm)}`;
}

function MobileNavTrafficAllocationControl() {
  const [loaded, setLoaded] = useState(false);
  const initial = useMemo(buildMobileNavEqualSplit, []);
  const [weights, setWeights] = useState<Record<MobileNavVariant, number>>(initial);
  const [savedWeights, setSavedWeights] = useState<Record<MobileNavVariant, number>>(initial);
  const [version, setVersion] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics/mobile-nav-variant-weights", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setFeedback({ kind: "err", msg: `Failed to load current allocation (${r.status}).` });
          setLoaded(true);
          return;
        }
        const data = await r.json().catch(() => null);
        if (!data) {
          setFeedback({ kind: "err", msg: "Failed to parse current allocation." });
          setLoaded(true);
          return;
        }
        const w = (data.weights ?? {}) as Partial<Record<MobileNavVariant, number>>;
        const merged = Object.fromEntries(
          MOBILE_NAV_VARIANTS.map((v) => [v, typeof w[v] === "number" ? (w[v] as number) : 0]),
        ) as Record<MobileNavVariant, number>;
        setWeights(merged);
        setSavedWeights(merged);
        setVersion(typeof data.version === "number" ? data.version : 0);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFeedback({ kind: "err", msg: "Network error loading allocation — try refreshing." });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sum = MOBILE_NAV_VARIANTS.reduce((s, v) => s + (weights[v] || 0), 0);
  const sumIsValid = sum === 100;
  const isDirty = MOBILE_NAV_VARIANTS.some((v) => weights[v] !== savedWeights[v]);
  const canSave = loaded && sumIsValid && isDirty && !saving;

  const setArm = (arm: MobileNavVariant, raw: string) => {
    const n = raw === "" ? 0 : parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    setWeights((prev) => ({ ...prev, [arm]: Math.max(0, Math.min(100, n)) }));
    if (feedback?.kind === "ok") setFeedback(null);
  };

  const reset = () => {
    setWeights(savedWeights);
    setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/analytics/mobile-nav-variant-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ kind: "err", msg: body?.error || `Save failed (${res.status})` });
      } else {
        const w = (body?.weights ?? {}) as Partial<Record<MobileNavVariant, number>>;
        const merged = { ...weights };
        for (const v of MOBILE_NAV_VARIANTS) {
          if (typeof w[v] === "number") merged[v] = w[v] as number;
        }
        setSavedWeights(merged);
        setWeights(merged);
        setVersion(typeof body?.version === "number" ? body.version : version + 1);
        setFeedback({ kind: "ok", msg: "Saved — returning sessions reshuffle on their next visit." });
      }
    } catch {
      setFeedback({ kind: "err", msg: "Network error — try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Traffic allocation
        </div>
        <div className="text-[11px] text-gray-400 tabular-nums">v{version}</div>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">
        Live dial for the mobile nav variant split. Set any arm to 0 to dark it out. Saves apply to new + returning provider sessions on their next mobile visit.
      </p>

      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        {MOBILE_NAV_VARIANTS.map((v) => (
          <label
            key={v}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2"
          >
            <span className="text-[11px] font-medium text-gray-700">{mobileNavVariantLabel(v)}</span>
            <span className="text-[10px] text-gray-400 leading-tight">{mobileNavVariantSubLabel(v)}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!loaded || saving}
                value={weights[v]}
                onChange={(e) => setArm(v, e.target.value)}
                className="w-16 text-right tabular-nums text-base font-medium text-gray-900 bg-transparent border-b border-gray-200 focus:border-gray-900 focus:outline-none disabled:opacity-50"
              />
              <span className="text-xs text-gray-400">%</span>
              <a
                href={mobileNavPreviewUrl(v)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 underline underline-offset-2"
                title="Open the provider dashboard with this mobile nav variant forced."
              >
                Preview ↗
              </a>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`text-[12px] tabular-nums px-2 py-0.5 rounded ${
            sumIsValid
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          Sum: {sum} / 100{sumIsValid ? "" : ` (${sum > 100 ? "+" : ""}${sum - 100})`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            canSave
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Saving…" : "Save allocation"}
        </button>
        {isDirty && !saving && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
          >
            Discard changes
          </button>
        )}
        {feedback && (
          <span
            className={`text-[11px] ${
              feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Nav Analytics — Device breakdown and variant funnel metrics
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceBreakdown {
  ua_class: string;
  visit_count: number;
  unique_providers: number;
}

interface VariantFunnelRow {
  variant: string;
  impressions: number;
  families_clicked: number;
  hire_clicked: number;
  questions_answered: number;
  leads_connected: number;
  reviews_shared: number;
  boost_requested: number;
}

interface MobileNavStatsResponse {
  range: { from: string; to: string };
  deviceBreakdown: DeviceBreakdown[];
  variantFunnel: VariantFunnelRow[];
}

function MobileNavAnalytics() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<MobileNavStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded variant for drill-in
  const expandedRaw = searchParams.get("mobile_nav_variant");
  const validKeys = new Set<string>(MOBILE_NAV_VARIANTS);
  const expandedVariant = expandedRaw && validKeys.has(expandedRaw) ? expandedRaw : null;

  const toggleVariant = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (expandedVariant === key) {
        params.delete("mobile_nav_variant");
      } else {
        params.set("mobile_nav_variant", key);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/analytics?${qs}` : "/admin/analytics", { scroll: false });
    },
    [searchParams, expandedVariant, router],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics/mobile-nav-stats", { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(`Failed to load stats (${r.status})`);
          setLoading(false);
          return;
        }
        const json = await r.json().catch(() => null);
        if (!json) {
          setError("Failed to parse response");
          setLoading(false);
          return;
        }
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error loading stats");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Date range for sessions list (last 30 days)
  const now = new Date();
  const dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dateTo = now.toISOString();

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-rose-600">{error}</div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Device Breakdown */}
      <div>
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-3">
          Device Breakdown (Last 30 Days)
        </h4>
        {data.deviceBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No data yet</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {data.deviceBreakdown.map((row) => (
              <div
                key={row.ua_class}
                className="rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1">
                  {row.ua_class === "mobile" ? "Mobile" : row.ua_class === "desktop" ? "Desktop" : row.ua_class === "tablet" ? "Tablet" : row.ua_class}
                </div>
                <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                  {row.unique_providers.toLocaleString()}
                </div>
                <div className="text-[11px] text-gray-400">
                  unique providers ({row.visit_count.toLocaleString()} visits)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variant Funnel */}
      <div>
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-3">
          Variant Conversion Funnel (Last 30 Days)
        </h4>
        {data.variantFunnel.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No variant impressions yet. Set bottom_tabs to &gt;0% to start collecting data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-[11px] font-medium text-gray-500">Variant</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Impressions</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Families</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Hire</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Questions</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Leads</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Reviews</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-gray-500">Boost</th>
                </tr>
              </thead>
              <tbody>
                {data.variantFunnel.map((row) => {
                  const fRate = row.impressions > 0 ? (((row.families_clicked ?? 0) / row.impressions) * 100).toFixed(1) : "—";
                  const hRate = row.impressions > 0 ? (((row.hire_clicked ?? 0) / row.impressions) * 100).toFixed(1) : "—";
                  const qRate = row.impressions > 0 ? ((row.questions_answered / row.impressions) * 100).toFixed(1) : "—";
                  const lRate = row.impressions > 0 ? ((row.leads_connected / row.impressions) * 100).toFixed(1) : "—";
                  const rRate = row.impressions > 0 ? ((row.reviews_shared / row.impressions) * 100).toFixed(1) : "—";
                  const bRate = row.impressions > 0 ? ((row.boost_requested / row.impressions) * 100).toFixed(1) : "—";
                  const isExpanded = expandedVariant === row.variant;
                  return (
                    <Fragment key={row.variant}>
                      <tr
                        className="border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 transition-colors"
                        onClick={() => toggleVariant(row.variant)}
                      >
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-medium text-gray-900">{mobileNavVariantLabel(row.variant as MobileNavVariant)}</span>
                          </div>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums text-gray-700">
                          {row.impressions.toLocaleString()}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.families_clicked ?? 0}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({fRate}%)</span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.hire_clicked ?? 0}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({hRate}%)</span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.questions_answered}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({qRate}%)</span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.leads_connected}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({lRate}%)</span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.reviews_shared}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({rRate}%)</span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <span className="text-gray-900">{row.boost_requested}</span>
                          <span className="text-gray-400 text-[10px] ml-1">({bRate}%)</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-4 bg-gray-50/40">
                            <MobileNavVariantSessionsList variant={row.variant} dateFrom={dateFrom} dateTo={dateTo} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          Families = clicked Find Families, Hire = clicked Hire Caregivers, Questions = answered, Leads = contacted (inbox/phone/email), Reviews = CTA clicked, Boost = ads requested
        </p>
      </div>
    </div>
  );
}
