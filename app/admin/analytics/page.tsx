"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PulseHeader from "@/components/admin/PulseHeader";
import {
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
import CTAVariantSessionsList from "@/components/admin/CTAVariantSessionsList";
import {
  PROVIDER_EMAIL_FUNNEL_LABELS,
  PROVIDER_EMAIL_FUNNEL_ORDER,
} from "@/lib/analytics/provider-email-funnels";

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

// Provider response rate tracking — closes the loop on CTA effectiveness
interface ProviderResponseMetrics {
  total_leads: number;
  responded_leads: number;
  response_rate_percent: number;
  median_response_time_hours: number | null;
  awaiting_response_count: number;
}

// Dynamically supports all CTA variants from CTA_VARIANTS
type ProviderResponseByVariant = Record<CTAVariantKeyWithUnassigned, ProviderResponseMetrics>;

interface ReferrerBreakdown {
  ai_chat: number;
  search: number;
  social: number;
  olera_internal: number;
  direct: number;
  other: number;
}

// SBF submissions bucketed by entry source. Both editorial AND provider
// mounts now tag entrySource — editorial passes /caregiver-support/{slug},
// provider passes /provider/{slug}. The query filters to NOT NULL so non-
// SBF account creations (auth callback, claim flows, listing creation)
// don't pollute the counts. Pre-tagging-deploy provider SBF rows are NULL
// and therefore invisible until enough time passes for tagged inserts to
// dominate the window.
interface EntrySourceBreakdown {
  total: number;
  editorial_total: number;
  provider_total: number;
  other_total: number;
  top_editorial_articles: Array<{ slug: string; count: number }>;
}

// Conversion sources breakdown — tracks which of the 7 conversion entry points
// performs best. Uses connection metadata (cta_variant, entry_point) to classify.
type ConversionSourceId =
  | "legacy_connect"
  | "compare"
  | "guide"
  | "custom_quote"
  | "book_consultation"
  | "message_host"
  | "qa_variants";

interface ConversionSourceRow {
  source_id: ConversionSourceId;
  label: string;
  count: number;
  percent: number;
}

interface ConversionSourcesBreakdown {
  total: number;
  by_source: ConversionSourceRow[];
}

interface SummaryResponse {
  windowed: {
    range: { from: string | null; to: string | null };
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
    referrer_breakdown: ReferrerBreakdown;
    entry_source_breakdown: EntrySourceBreakdown;
    provider_response: ProviderResponseMetrics;
    provider_response_by_variant: ProviderResponseByVariant;
    conversion_sources_breakdown: ConversionSourcesBreakdown;
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
    referrer_breakdown: ReferrerBreakdown;
    entry_source_breakdown: EntrySourceBreakdown;
    provider_response: ProviderResponseMetrics;
    provider_response_by_variant: ProviderResponseByVariant;
    conversion_sources_breakdown: ConversionSourcesBreakdown;
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
        title="Conversion Sources"
        storageKey="conversionSources"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <ConversionSourcesCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Provider Response Rates"
        storageKey="providerResponseRates"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <ProviderResponseCard summary={summary} loading={loading} range={range} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Submissions by Entry Source"
        storageKey="entrySource"
        defaultCollapsed={true}
        loading={loading && !!summary}
      >
        <EntrySourceCard summary={summary} loading={loading} range={range} />
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
                label="Page-flow claims"
                value={summary.windowed.provider_distinct_counts.page_claims}
                prior={summary.prior?.provider_distinct_counts.page_claims ?? null}
                tooltip="Distinct providers who claimed their listing from a public provider page (not from email)."
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
    { key: "outreach" as const, label: "outreach", description: "Our care team gets pricing, availability, and how to start from the top providers — in one email.", isOutreach: true },
    { key: "qa_email_capture" as const, label: "qa_email_capture", description: "No SBF / no outreach. Q&A enrichment ON with comparison-providers value-promise.", isOutreach: true },
    { key: "multi_provider" as const, label: "multi_provider", description: "Tinder-style card stack — send question to multiple similar providers.", isOutreach: true },
    { key: "multi_provider_v2" as const, label: "multi_provider_v2", description: "Email-first variant — shows email capture immediately after first question, optional card stack expansion.", isOutreach: true },
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
              <th className="px-3 py-2 font-medium tabular-nums text-right">Care need ✓</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Submitted</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {activeArms.map(({ key, label, description, isOutreach }) => {
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
                    {/* Outreach arm has no middle "care need" step — show — instead of 0. */}
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {isOutreach ? <span className="text-gray-300">—</span> : r.care_need_completed}
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

// ── Conversion Sources ─────────────────────────────────────────────────────
// Tracks which of the 7 conversion entry points performs best. Uses connection
// metadata (cta_variant, entry_point) to classify leads by source.
function ConversionSourcesCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-40 animate-pulse bg-gray-100 rounded-lg" />;
  }
  if (!summary) return null;

  const current = summary.windowed.conversion_sources_breakdown;
  const prior = summary.prior?.conversion_sources_breakdown ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Breakdown of leads by conversion entry point ({rangeLabel(range).toLowerCase()}).
        Higher-performing sources indicate which CTAs and buttons drive the most conversions.
      </p>

      {/* Top-level stat */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        <Stat
          label="Total Conversions"
          value={current.total}
          prior={prior?.total ?? null}
          tooltip="Guest accounts created via any conversion path"
        />
      </div>

      {/* Sources breakdown table */}
      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">Leads</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">% of Total</th>
              <th className="px-3 py-2 font-medium tabular-nums text-right">vs Prior</th>
            </tr>
          </thead>
          <tbody>
            {current.by_source.map((source) => {
              const priorSource = prior?.by_source.find((p) => p.source_id === source.source_id);
              const priorCount = priorSource?.count ?? 0;
              const deltaPercent =
                priorCount > 0
                  ? Math.round(((source.count - priorCount) / priorCount) * 100)
                  : source.count > 0
                    ? null // "new" case
                    : 0;

              return (
                <tr key={source.source_id} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="px-3 py-2 text-gray-700">{source.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{source.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{source.percent}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {deltaPercent !== null ? (
                      <span
                        className={
                          deltaPercent > 0
                            ? "text-green-600"
                            : deltaPercent < 0
                              ? "text-red-500"
                              : "text-gray-400"
                        }
                      >
                        {deltaPercent > 0 ? "↑" : deltaPercent < 0 ? "↓" : "→"} {Math.abs(deltaPercent)}%
                      </span>
                    ) : priorCount === 0 && source.count > 0 ? (
                      <span className="text-gray-400">new</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-medium">
              <td className="px-3 py-2 text-gray-900">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{current.total}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Provider Response Rates — tracks whether providers respond to leads generated
// by CTAs, closing the loop: Impression → Click → Lead → Provider Response.
function ProviderResponseCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  const { from: dateFrom, to: dateTo } = resolveRange(range);

  if (loading && !summary) {
    return <div className="h-48 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const r = summary.windowed.provider_response;
  const pr = summary.prior?.provider_response ?? null;
  const byVariant = summary.windowed.provider_response_by_variant;

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        Provider response metrics {rangeLabel(range).toLowerCase()} —
        tracks whether providers reply to family leads.
      </p>

      {/* Top-level stats */}
      <div className="grid grid-cols-3 gap-x-5 gap-y-4 mb-6">
        <PercentStat
          label="Response Rate"
          value={r.response_rate_percent}
          prior={pr?.response_rate_percent ?? null}
          tooltip="Percentage of leads where provider sent at least one message."
        />
        <ResponseTimeStat
          label="Median Response Time"
          hours={r.median_response_time_hours}
          priorHours={pr?.median_response_time_hours ?? null}
          tooltip="Median hours from lead creation to first provider message."
        />
        <Stat
          label="Awaiting Response"
          value={r.awaiting_response_count}
          prior={pr?.awaiting_response_count ?? null}
          tooltip="Leads with no provider reply yet."
        />
      </div>

      {/* By variant table */}
      <ProviderResponseVariantSplit byVariant={byVariant} />

      {/* Full lead list with filters and pagination */}
      <ResponseLeadsList dateFrom={dateFrom} dateTo={dateTo} />
    </>
  );
}

function PercentStat({
  label,
  value,
  prior,
  tooltip,
}: {
  label: string;
  value: number;
  prior: number | null;
  tooltip: string;
}) {
  const animated = useAnimatedCount(value, 600);
  const isZero = value === 0;
  const delta = computeDelta(value, prior);

  return (
    <div title={tooltip} className={`cursor-default ${isZero ? "opacity-50" : ""}`}>
      <div
        className={`text-[26px] font-semibold tabular-nums leading-none ${
          isZero ? "text-gray-400 font-medium" : "text-gray-900"
        }`}
      >
        {animated}%
      </div>
      <div className="text-xs text-gray-500 mt-1.5 leading-tight">{label}</div>
      <DeltaLine delta={delta} />
    </div>
  );
}

function ResponseTimeStat({
  label,
  hours,
  priorHours,
  tooltip,
}: {
  label: string;
  hours: number | null;
  priorHours: number | null;
  tooltip: string;
}) {
  const displayValue = hours != null ? `${hours.toFixed(1)} hrs` : "—";
  const isZero = hours === null;

  const delta = (() => {
    if (priorHours === null || hours === null) return { state: "noPrior" as const, pctText: "" };
    if (priorHours === 0 && hours === 0) return { state: "flat" as const, pctText: "no change" };
    if (priorHours === 0 && hours > 0) return { state: "newSignal" as const, pctText: "new" };
    const pct = ((hours - priorHours) / priorHours) * 100;
    const rounded = Math.round(pct);
    if (Math.abs(rounded) < 1) return { state: "flat" as const, pctText: "flat" };
    // For response time, lower is better, so we flip the direction
    return {
      state: (rounded < 0 ? "up" : "down") as "up" | "down",
      pctText: `${rounded < 0 ? "↓" : "↑"} ${Math.abs(rounded)}%`,
    };
  })();

  return (
    <div title={tooltip} className={`cursor-default ${isZero ? "opacity-50" : ""}`}>
      <div
        className={`text-[26px] font-semibold tabular-nums leading-none ${
          isZero ? "text-gray-400 font-medium" : "text-gray-900"
        }`}
      >
        {displayValue}
      </div>
      <div className="text-xs text-gray-500 mt-1.5 leading-tight">{label}</div>
      <DeltaLine delta={delta} />
    </div>
  );
}

function ProviderResponseVariantSplit({
  byVariant,
}: {
  byVariant: ProviderResponseByVariant;
}) {
  // Dynamically generate arms from CTA_VARIANTS for consistent coverage
  const arms: Array<{ key: keyof ProviderResponseByVariant; label: string }> = CTA_VARIANTS.map(v => ({
    key: v,
    label: ctaVariantLabel(v),
  }));

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-3">
        By CTA Variant
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Variant</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Leads</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Responded</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Rate</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Median Time</th>
            </tr>
          </thead>
          <tbody>
            {arms.map(({ key, label }) => {
              const v = byVariant[key];
              return (
                <tr key={key} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{v.total_leads}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{v.responded_leads}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {v.response_rate_percent}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                    {v.median_response_time_hours != null
                      ? `${v.median_response_time_hours.toFixed(1)} hrs`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ResponseLeadsList — paginated list of leads with filters and nudge functionality.
// Replaces the old static AwaitingResponseList with a full-featured drill-in.
type ResponseLeadFilter = "all" | "needs_attention" | "provider_nudged" | "family_nudged" | "responded" | "no_email";

interface FilterCounts {
  all: number;
  needs_attention: number;
  provider_nudged: number;
  family_nudged: number;
  responded: number;
  no_email: number;
}

interface ProfileCompleteness {
  percentage: number;
  missingFields: string[];
}

interface ResponseLead {
  connection_id: string;
  // Family info
  family_id: string;
  family_name: string;
  family_email: string | null;
  family_phone: string | null;
  family_completeness: ProfileCompleteness;
  family_is_published: boolean;
  family_nudged_at: string | null;
  family_publish_nudged_at: string | null;
  // Provider info
  provider_id: string;
  provider_name: string;
  provider_email: string | null;
  provider_phone: string | null;
  provider_slug: string;
  provider_completeness: ProfileCompleteness;
  provider_nudged_at: string | null;
  // Lead info
  message_preview: string;
  created_at: string;
  age_hours: number;
  responded: boolean;
  response_time_hours: number | null;
  provider_response: string | null;
  cta_variant: string | null;
}

const PAGE_SIZE = 50;

function ResponseLeadsList({
  dateFrom,
  dateTo,
}: {
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const [filter, setFilter] = useState<ResponseLeadFilter>("needs_attention");
  const [leads, setLeads] = useState<ResponseLead[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<FilterCounts | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nudge state: tracks which party (family/provider/familyPublish) is being nudged for which connection
  const [nudgingProvider, setNudgingProvider] = useState<string | null>(null);
  const [nudgingFamily, setNudgingFamily] = useState<string | null>(null);
  const [nudgingFamilyPublish, setNudgingFamilyPublish] = useState<string | null>(null);
  const [nudgeSuccess, setNudgeSuccess] = useState<{ id: string; type: "family" | "provider" | "familyPublish" } | null>(null);
  const [nudgeError, setNudgeError] = useState<string | null>(null);
  // Delete state
  const [pendingDelete, setPendingDelete] = useState<ResponseLead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Add email state (inline editing) - now tracks which party
  const [editingEmail, setEditingEmail] = useState<{ id: string; type: "family" | "provider" } | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailAddSuccess, setEmailAddSuccess] = useState<{ id: string; type: "family" | "provider" } | null>(null);
  const [emailAddError, setEmailAddError] = useState<string | null>(null);

  // Track timeout IDs for cleanup on unmount
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  // Cleanup timeouts on unmount
  useEffect(() => {
    const refs = timeoutRefs.current;
    return () => {
      refs.forEach((id) => clearTimeout(id));
      refs.clear();
    };
  }, []);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const isInitial = !append;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        params.set("filter", filter);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));

        const res = await fetch(`/api/admin/analytics/response-leads?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const data: { total: number; leads: ResponseLead[]; counts: FilterCounts; truncated?: boolean } = await res.json();
        setTotal(data.total);
        setCounts(data.counts);
        setTruncated(data.truncated ?? false);
        setLeads((prev) => (append ? [...prev, ...data.leads] : data.leads));
      } catch {
        setError("Couldn't load leads. Try again.");
      } finally {
        if (isInitial) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [dateFrom, dateTo, filter]
  );

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  // Nudge provider to respond to the lead
  const handleNudgeProvider = useCallback(async (connectionId: string) => {
    setNudgingProvider(connectionId);
    setNudgeError(null);
    setNudgeSuccess(null);

    try {
      const res = await fetch("/api/admin/send-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send nudge");
      }

      setNudgeSuccess({ id: connectionId, type: "provider" });
      // Refetch to update counts and move lead to correct tab
      fetchPage(0, false);
      // Clear "Sent" message after 3 seconds
      const successTimeout = setTimeout(() => setNudgeSuccess(null), 3000);
      timeoutRefs.current.add(successTimeout);
    } catch (err) {
      setNudgeError(err instanceof Error ? err.message : "Failed to send nudge");
      const errorTimeout = setTimeout(() => setNudgeError(null), 5000);
      timeoutRefs.current.add(errorTimeout);
    } finally {
      setNudgingProvider(null);
    }
  }, [fetchPage]);

  // Nudge family to complete their profile
  const handleNudgeFamily = useCallback(async (connectionId: string, familyId: string) => {
    setNudgingFamily(connectionId);
    setNudgeError(null);
    setNudgeSuccess(null);

    try {
      const res = await fetch("/api/admin/nudge-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId, family_profile_id: familyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send nudge");
      }

      setNudgeSuccess({ id: connectionId, type: "family" });
      // Refetch to update counts and move lead to correct tab
      fetchPage(0, false);
      // Clear "Sent" message after 3 seconds
      const successTimeout = setTimeout(() => setNudgeSuccess(null), 3000);
      timeoutRefs.current.add(successTimeout);
    } catch (err) {
      setNudgeError(err instanceof Error ? err.message : "Failed to send nudge");
      const errorTimeout = setTimeout(() => setNudgeError(null), 5000);
      timeoutRefs.current.add(errorTimeout);
    } finally {
      setNudgingFamily(null);
    }
  }, [fetchPage]);

  // Nudge family to publish their profile (when complete but not published)
  const handleNudgeFamilyPublish = useCallback(async (connectionId: string, familyId: string) => {
    setNudgingFamilyPublish(connectionId);
    setNudgeError(null);
    setNudgeSuccess(null);

    try {
      const res = await fetch("/api/admin/nudge-family-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId, family_profile_id: familyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send nudge");
      }

      setNudgeSuccess({ id: connectionId, type: "familyPublish" });
      // Refetch to update counts and move lead to correct tab
      fetchPage(0, false);
      // Clear "Sent" message after 3 seconds
      const successTimeout = setTimeout(() => setNudgeSuccess(null), 3000);
      timeoutRefs.current.add(successTimeout);
    } catch (err) {
      setNudgeError(err instanceof Error ? err.message : "Failed to send nudge");
      const errorTimeout = setTimeout(() => setNudgeError(null), 5000);
      timeoutRefs.current.add(errorTimeout);
    } finally {
      setNudgingFamilyPublish(null);
    }
  }, [fetchPage]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin/analytics/response-leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: pendingDelete.connection_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }
      // Remove the deleted row locally
      const removedId = pendingDelete.connection_id;
      setLeads((prev) => prev.filter((l) => l.connection_id !== removedId));
      setTotal((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  // Handle inline email add for either family or provider
  const handleAddEmail = useCallback(async (lead: ResponseLead, partyType: "family" | "provider") => {
    const profileId = partyType === "family" ? lead.family_id : lead.provider_id;
    if (!emailInput.trim() || !profileId) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) {
      setEmailAddError("Invalid email format");
      return;
    }

    setSavingEmail(true);
    setEmailAddError(null);

    try {
      const res = await fetch("/api/admin/leads/add-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          email: emailInput.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save email");
      }

      setEmailAddSuccess({ id: lead.connection_id, type: partyType });
      setEditingEmail(null);
      setEmailInput("");
      // Refetch to update counts and move lead to correct tab
      fetchPage(0, false);

      // Clear success message after 3 seconds
      const successTimeout = setTimeout(() => setEmailAddSuccess(null), 3000);
      timeoutRefs.current.add(successTimeout);
    } catch (err) {
      setEmailAddError(err instanceof Error ? err.message : "Failed to save");
      const errorTimeout = setTimeout(() => setEmailAddError(null), 5000);
      timeoutRefs.current.add(errorTimeout);
    } finally {
      setSavingEmail(false);
    }
  }, [emailInput, fetchPage]);

  const hasMore = total !== null && leads.length < total;

  const FILTER_TABS: Array<{ key: ResponseLeadFilter; label: string; description: string }> = [
    { key: "all", label: "All", description: "All leads" },
    { key: "needs_attention", label: "Needs Attention", description: "Ready to nudge" },
    { key: "provider_nudged", label: "Provider Nudged", description: "Waiting on provider" },
    { key: "family_nudged", label: "Family Nudged", description: "Waiting on family" },
    { key: "responded", label: "Responded", description: "Provider replied" },
    { key: "no_email", label: "No Email", description: "Need email first" },
  ];

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      {/* Header with filter chips */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Leads
          </div>
          {total !== null && (
            <div className="text-xs text-gray-500 mt-0.5">
              Showing {leads.length} of {total}
              {filter !== "all" && (
                <span className="text-gray-400">
                  {" "}
                  · {FILTER_TABS.find((t) => t.key === filter)?.description || filter}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map(({ key, label }) => {
            const active = filter === key;
            const count = counts?.[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors flex items-center gap-1.5 ${
                  active
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                }`}
              >
                {label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Truncation warning */}
      {truncated && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
          Results may be incomplete. Only the most recent 5,000 connections are analyzed.
        </div>
      )}

      {/* Error/success messages */}
      {nudgeError && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
          {nudgeError}
        </div>
      )}
      {emailAddError && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
          {emailAddError}
        </div>
      )}

      {/* Table */}
      {loading && leads.length === 0 ? (
        <div className="h-32 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />
      ) : error ? (
        <div className="px-5 py-6 text-center text-sm text-red-600 border border-gray-200 rounded-lg">
          {error}
          <button
            type="button"
            onClick={() => fetchPage(0, false)}
            className="ml-3 underline underline-offset-2 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400 border border-gray-200 rounded-lg">
          No leads in this window.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-[280px]">Family</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-[280px]">Provider</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Response</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600 w-20">Sent</th>
                <th className="px-2 py-2 font-medium w-8" aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isEditingFamilyEmail = editingEmail?.id === lead.connection_id && editingEmail.type === "family";
                const isEditingProviderEmail = editingEmail?.id === lead.connection_id && editingEmail.type === "provider";
                const familyEmailSuccess = emailAddSuccess?.id === lead.connection_id && emailAddSuccess.type === "family";
                const providerEmailSuccess = emailAddSuccess?.id === lead.connection_id && emailAddSuccess.type === "provider";
                const familyNudgeSuccess = nudgeSuccess?.id === lead.connection_id && nudgeSuccess.type === "family";
                const familyPublishNudgeSuccess = nudgeSuccess?.id === lead.connection_id && nudgeSuccess.type === "familyPublish";
                const providerNudgeSuccess = nudgeSuccess?.id === lead.connection_id && nudgeSuccess.type === "provider";

                return (
                  <tr
                    key={lead.connection_id}
                    className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/40"
                  >
                    {/* Family Column */}
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-2">
                        {/* Name and contact */}
                        <div>
                          <div className="text-gray-900 font-medium text-[13px]">{lead.family_name}</div>
                          {lead.family_email ? (
                            <div className="text-[11px] text-gray-400 truncate max-w-[200px]" title={lead.family_email}>
                              {lead.family_email}
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-500 italic">no email</div>
                          )}
                          {lead.family_phone && (
                            <div className="text-[11px] text-gray-400">{lead.family_phone}</div>
                          )}
                        </div>

                        {/* Completeness + action (inline) */}
                        <div className="text-[11px] text-gray-500">
                          {familyEmailSuccess ? (
                            <span className="text-emerald-600">Email added</span>
                          ) : isEditingFamilyEmail ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAddEmail(lead, "family");
                              }}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="email"
                                placeholder="email@example.com"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                className="w-28 px-2 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                                disabled={savingEmail}
                                autoFocus
                              />
                              <button
                                type="submit"
                                disabled={savingEmail || !emailInput.trim()}
                                className="text-[11px] text-gray-600 hover:text-gray-900 disabled:opacity-50"
                              >
                                {savingEmail ? "..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmail(null);
                                  setEmailInput("");
                                  setEmailAddError(null);
                                }}
                                className="text-[11px] text-gray-400 hover:text-gray-600"
                              >
                                ✕
                              </button>
                            </form>
                          ) : !lead.family_email ? (
                            <span>
                              {lead.family_completeness.percentage}% ·{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmail({ id: lead.connection_id, type: "family" });
                                  setEmailInput("");
                                  setEmailAddError(null);
                                }}
                                className="text-gray-600 hover:text-gray-900 underline underline-offset-2"
                              >
                                Add email
                              </button>
                            </span>
                          ) : lead.family_completeness.percentage < 80 ? (
                            <span>
                              {lead.family_completeness.percentage}% ·{" "}
                              {familyNudgeSuccess ? (
                                <span className="text-emerald-600">Sent</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleNudgeFamily(lead.connection_id, lead.family_id)}
                                  disabled={nudgingFamily === lead.connection_id}
                                  className="text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                                  title="Nudge family to complete profile"
                                >
                                  {nudgingFamily === lead.connection_id ? "..." : "Nudge"}
                                </button>
                              )}
                              {lead.family_nudged_at && (
                                <span className="text-gray-400 ml-1">
                                  ({formatLeadAge((Date.now() - new Date(lead.family_nudged_at).getTime()) / (1000 * 60 * 60))})
                                </span>
                              )}
                            </span>
                          ) : !lead.family_is_published ? (
                            <span>
                              {lead.family_completeness.percentage}% ·{" "}
                              {familyPublishNudgeSuccess ? (
                                <span className="text-emerald-600">Sent</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleNudgeFamilyPublish(lead.connection_id, lead.family_id)}
                                  disabled={nudgingFamilyPublish === lead.connection_id}
                                  className="text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                                  title="Nudge family to publish profile"
                                >
                                  {nudgingFamilyPublish === lead.connection_id ? "..." : "Publish"}
                                </button>
                              )}
                              {lead.family_publish_nudged_at && (
                                <span className="text-gray-400 ml-1">
                                  ({formatLeadAge((Date.now() - new Date(lead.family_publish_nudged_at).getTime()) / (1000 * 60 * 60))})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-emerald-600">Published ✓</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Provider Column */}
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-2">
                        {/* Name and contact */}
                        <div>
                          {lead.provider_slug ? (
                            <Link
                              href={`/admin/directory/${lead.provider_slug}`}
                              className="text-emerald-700 hover:text-emerald-800 font-medium text-[13px]"
                            >
                              {lead.provider_name}
                            </Link>
                          ) : (
                            <span className="text-gray-900 font-medium text-[13px]">{lead.provider_name}</span>
                          )}
                          {lead.provider_email ? (
                            <div className="text-[11px] text-gray-400 truncate max-w-[200px]" title={lead.provider_email}>
                              {lead.provider_email}
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-500 italic">no email</div>
                          )}
                          {lead.provider_phone && (
                            <div className="text-[11px] text-gray-400">{lead.provider_phone}</div>
                          )}
                        </div>

                        {/* Completeness + action (inline) */}
                        <div className="text-[11px] text-gray-500">
                          {lead.responded ? (
                            <span className="text-emerald-600">Replied ✓</span>
                          ) : providerEmailSuccess ? (
                            <span className="text-emerald-600">Email added</span>
                          ) : isEditingProviderEmail ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAddEmail(lead, "provider");
                              }}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="email"
                                placeholder="email@example.com"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                className="w-28 px-2 py-1 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                                disabled={savingEmail}
                                autoFocus
                              />
                              <button
                                type="submit"
                                disabled={savingEmail || !emailInput.trim()}
                                className="text-[11px] text-gray-600 hover:text-gray-900 disabled:opacity-50"
                              >
                                {savingEmail ? "..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmail(null);
                                  setEmailInput("");
                                  setEmailAddError(null);
                                }}
                                className="text-[11px] text-gray-400 hover:text-gray-600"
                              >
                                ✕
                              </button>
                            </form>
                          ) : !lead.provider_email ? (
                            <span>
                              {lead.provider_completeness.percentage}% ·{" "}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmail({ id: lead.connection_id, type: "provider" });
                                  setEmailInput("");
                                  setEmailAddError(null);
                                }}
                                className="text-gray-600 hover:text-gray-900 underline underline-offset-2"
                              >
                                Add email
                              </button>
                            </span>
                          ) : (
                            <span>
                              {lead.provider_completeness.percentage}% ·{" "}
                              {providerNudgeSuccess ? (
                                <span className="text-emerald-600">Sent</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleNudgeProvider(lead.connection_id)}
                                  disabled={nudgingProvider === lead.connection_id}
                                  className="text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50 disabled:no-underline"
                                  title="Nudge provider to respond"
                                >
                                  {nudgingProvider === lead.connection_id ? "..." : "Nudge"}
                                </button>
                              )}
                              {lead.provider_nudged_at && (
                                <span className="text-gray-400 ml-1">
                                  ({formatLeadAge((Date.now() - new Date(lead.provider_nudged_at).getTime()) / (1000 * 60 * 60))})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Response Column */}
                    <td className="px-4 py-3 align-top text-gray-600 max-w-[220px]">
                      {lead.provider_response ? (
                        <span className="text-xs block" title={lead.provider_response}>
                          &ldquo;{lead.provider_response.length > 80
                            ? lead.provider_response.substring(0, 77) + "..."
                            : lead.provider_response}&rdquo;
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">Awaiting response</span>
                      )}
                    </td>

                    {/* Sent Column */}
                    <td className="px-4 py-3 align-top text-right text-gray-500 whitespace-nowrap">
                      {formatLeadAge(lead.age_hours)}
                    </td>

                    {/* Delete Column */}
                    <td className="px-2 py-3 align-top w-8 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setPendingDelete(lead);
                        }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
                        aria-label="Delete this lead"
                        title="Delete this lead"
                      >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => fetchPage(leads.length, true)}
            disabled={loadingMore}
            className="text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : `Load ${Math.min(PAGE_SIZE, total! - leads.length)} more`}
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-lead-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3
              id="delete-lead-title"
              className="text-base font-semibold text-gray-900 mb-3"
            >
              Delete this lead?
            </h3>
            <dl className="text-sm text-gray-700 space-y-1.5 mb-4">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Family</dt>
                <dd className="text-gray-900">
                  {pendingDelete.family_name}
                  {pendingDelete.family_email && (
                    <span className="block text-xs text-gray-500">{pendingDelete.family_email}</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Provider</dt>
                <dd className="text-gray-900">
                  {pendingDelete.provider_name}
                  {pendingDelete.provider_email && (
                    <span className="block text-xs text-gray-500">{pendingDelete.provider_email}</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-gray-400">Sent</dt>
                <dd className="text-gray-900">{formatLeadAge(pendingDelete.age_hours)}</dd>
              </div>
            </dl>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-5">
              This will permanently delete the connection record. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-[12px] text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLeadAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Submissions bucketed by entry source. The benefits funnel above is
// provider_activity-driven and editorial mounts emit zero provider_activity,
// so editorial submissions are invisible there. This card reads accounts
// directly so editorial conversions surface — and so we can answer
// "did /caregiver-support/ produce signups?" without a SQL detour.
function EntrySourceCard({
  summary,
  loading,
  range,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  range: DateRangeValue;
}) {
  if (loading && !summary) {
    return <div className="h-32 rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 animate-pulse" />;
  }
  if (!summary) return null;

  const b = summary.windowed.entry_source_breakdown;
  const pb = summary.prior?.entry_source_breakdown ?? null;

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const delta = (curr: number, prior: number | null) => {
    if (prior === null) return null;
    if (prior === 0) return curr > 0 ? "new" : null;
    const change = Math.round(((curr - prior) / prior) * 100);
    return `${change >= 0 ? "+" : ""}${change}%`;
  };

  const editorialDelta = delta(b.editorial_total, pb?.editorial_total ?? null);
  const providerDelta = delta(b.provider_total, pb?.provider_total ?? null);

  return (
    <>
      <p className="text-xs text-gray-500 mb-5">
        SBF intake submissions {rangeLabel(range).toLowerCase()}, bucketed by{" "}
        <code className="text-[11px] bg-gray-50 px-1 rounded">accounts.signup_source</code>
        . Editorial mounts tag <code className="text-[11px] bg-gray-50 px-1 rounded">/caregiver-support/&#123;slug&#125;</code>; provider mounts tag <code className="text-[11px] bg-gray-50 px-1 rounded">/provider/&#123;slug&#125;</code>. Untagged accounts (auth callback, claim flows, etc.) are excluded. Provider SBF submissions made before the tagging deploy are also untagged → invisible until they roll out of the window.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 mb-5">
        <EntrySourceStat label="Total tagged" value={b.total} delta={null} />
        <EntrySourceStat
          label="Editorial"
          value={b.editorial_total}
          subLabel={pct(b.editorial_total, b.total)}
          delta={editorialDelta}
        />
        <EntrySourceStat
          label="Provider"
          value={b.provider_total}
          subLabel={pct(b.provider_total, b.total)}
          delta={providerDelta}
        />
        <EntrySourceStat label="Other" value={b.other_total} subLabel={pct(b.other_total, b.total)} delta={null} />
      </div>

      {b.top_editorial_articles.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2">
            Top editorial articles
          </div>
          <ul className="space-y-1.5">
            {b.top_editorial_articles.map(({ slug, count }) => (
              <li key={slug} className="flex items-baseline justify-between text-sm">
                <a
                  href={`/caregiver-support/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-700 hover:text-gray-900 truncate mr-3 underline-offset-2 hover:underline"
                >
                  /caregiver-support/{slug}
                </a>
                <span className="tabular-nums text-gray-900 font-medium flex-shrink-0">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : b.editorial_total === 0 ? (
        <p className="text-[11px] text-gray-400 mt-3">
          No editorial submissions yet in this window. Top articles by submission count appear here once <code className="text-[10px] bg-gray-50 px-1 rounded">/caregiver-support/[slug]</code> mounts start producing tagged accounts.
        </p>
      ) : null}
    </>
  );
}

function EntrySourceStat({
  label,
  value,
  subLabel,
  delta,
}: {
  label: string;
  value: number;
  subLabel?: string;
  delta: string | null;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-semibold tabular-nums text-gray-900">{value}</div>
        {subLabel && <div className="text-[12px] text-gray-500 tabular-nums">{subLabel}</div>}
      </div>
      {delta && <div className="text-[11px] text-gray-400 mt-0.5">{delta} vs prior</div>}
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
