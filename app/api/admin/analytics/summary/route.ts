import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { isAcceptedEmail } from "@/lib/provider-comms/reporting";
import { getBotRejectsToday } from "@/lib/analytics/bot-filter";
import {
  REFERRER_CLASSES,
  type ReferrerClass,
} from "@/lib/analytics/referrer";
import {
  PROVIDER_EMAIL_FUNNEL_TYPES,
  bucketForEmailType,
  type ProviderEmailFunnelKey,
} from "@/lib/analytics/provider-email-funnels";
import { CTA_VARIANTS, type CTAVariant } from "@/lib/analytics/cta-variant";
import {
  MANAGED_ADS_VARIANTS,
  type ManagedAdsVariant,
} from "@/lib/analytics/managed-ads-variant";
import { resolveSlugsForRawIds, resolveCanonicalProviderKeys } from "@/lib/provider-id-variants";

const PROVIDER_EVENT_TYPES = [
  "page_view",
  "search_click",
  "benefits_started",
  "lead_received",
  "review_received",
  "question_received",
  "provider_saved",
] as const;

const SEEKER_EVENT_TYPES = [
  "benefits_completed",
  "matches_activated",
] as const;

// Events counted as DISTINCT providers (not raw events) for the Providers
// section. Two of the buckets are sub-filters on one_click_access since
// those flows only differ by the email link they came from (action param):
//   one_click_access AND metadata.action='question'  → Q&A sign-ins
//   one_click_access AND metadata.action='lead'      → engaged with leads
//   claim_completed  AND metadata.source='page'      → page-flow claims
const PROVIDER_DISTINCT_EVENT_TYPES = [
  "one_click_access",
  "claim_completed",
  "question_responded",
  "analytics_teaser_cta_clicked",
  "provider_picker_clicked",
  "provider_profile_edited",
  "dashboard_arrival",
] as const;

type ProviderEvent = (typeof PROVIDER_EVENT_TYPES)[number];
type SeekerEvent = (typeof SEEKER_EVENT_TYPES)[number];
type CountedEvent = ProviderEvent | SeekerEvent;

type WindowedCounts = Record<CountedEvent, number>;
type DistinctCounts = {
  qa_signins: number;
  page_claims: number;
  question_answerers: number;
  lead_engagers: number;
  teaser_clickers: number;
  qa_email_openers: number;
  /** Distinct providers who clicked a completion-tier CTA on the dashboard hero. */
  hero_clickers: number;
  /** Distinct providers who saved an edit to any profile section. */
  profile_editors: number;
  /** Distinct providers who arrived at /provider with `?from=qa-success` — auto-redirected after answering a question. Diagnostic for whether the redirect mechanic is working separately from whether the hero nudges them into action. */
  qa_success_arrivals: number;
};
// Cohort-anchored funnel for the provider question_received email. `sent`
// through `complained` are raw email-row counts (one row per send) over the
// window's email_log.created_at. `signed_in` and `answered` are distinct
// providers projected from provider_activity — anchored on activity event
// time, not the email send, so for short windows they may diverge slightly.
type ProviderQaFunnel = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  signed_in: number;
  answered: number;
  /** Distinct providers who arrived at /provider with `?from=qa-success` — auto-redirected after answering a question. Sits between answered and clicked_dashboard in the journey: did the redirect mechanic work? */
  qa_success_arrivals: number;
  /** Distinct providers who clicked any dashboard CTA in the window — union of analytics teaser on /onboard + dashboard hero on /provider. */
  clicked_dashboard: number;
  /** Distinct providers who saved an edit to any profile section in the window. Lagging activation indicator. */
  edited_profile: number;
  /** Per-source attribution for clicked_dashboard. A provider counted in multiple sources if they used multiple paths. */
  clicked_dashboard_by_source: {
    qa_teaser: number;
    hero: number;
  };
};
type QaEmailIssue = {
  reason: string;
  count: number;
  type: "bounced" | "complained";
};
// A/B variant split for the question_received email. Per-variant rollup
// of the same cohort dimensions. `unassigned` covers emails sent before
// the variant deploy (retroactive rows have no metadata.variant).
type ProviderQaVariantRow = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  phi_filtered: number;
};
type ProviderQaFunnelByVariant = {
  A: ProviderQaVariantRow;
  B: ProviderQaVariantRow;
  unassigned: ProviderQaVariantRow;
};
// Generalized provider-comms funnel — same shape as the Q&A funnel but across
// every provider-bound email_type bucket. Filter keys + email_type mapping
// live in lib/analytics/provider-email-funnels.ts. Sent/Delivered/Opened/Clicked
// are raw email_log row counts; the downstream four are distinct providers
// (approximate attribution: anchored on activity time in window, not on the
// email send). Engagement bounce = clicked-providers − any-success-event
// providers, per bucket.
type ProviderCommsFunnel = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  /** Distinct providers who clicked ≥1 email of this bucket in window — the proper denominator for engagement_bounces (clicked is a raw row count and would mix units). */
  distinct_clickers: number;
  signed_in: number;
  answered: number;
  clicked_dashboard: number;
  edited_profile: number;
  engagement_bounces: number;
  /** Top 10 most-recent engagement bouncers — providers who clicked an email of this bucket but produced none of the four downstream events in window. */
  top_bouncers: Array<{
    provider_id: string;
    last_clicked_email_type: string;
    last_clicked_at: string;
  }>;
};
type ProviderCommsFunnelByType = {
  all: ProviderCommsFunnel;
  question_received: ProviderCommsFunnel;
  weekly_digest: ProviderCommsFunnel;
  verification: ProviderCommsFunnel;
  onboarding: ProviderCommsFunnel;
  nudges: ProviderCommsFunnel;
  connections: ProviderCommsFunnel;
};
// Care-seeker benefits intake funnel. Distinct sessions per stage. Read from
// provider_activity (where session_id + variant are persisted on every event);
// seeker_activity.benefits_completed is unusable here because it carries
// neither field. The save-step's `benefits_step_completed step_name="save"`
// event fires immediately before the save-results POST, so it's the cleaner
// signal for the saved stage anyway.
type BenefitsFunnel = {
  // Distinct sessions that saw the module render on a provider page. Counted
  // for all four arms (benefits_entry_viewed for the 3 benefits arms,
  // outreach_module_impression for the outreach arm) so apples-to-apples
  // top-of-funnel comparison is possible. Without this, outreach's "started"
  // counted impressions while the benefits arms' counted card-clicks —
  // an instrumentation mismatch that made outreach look 100x bigger.
  impressions: number;
  started: number;
  care_need_completed: number;
  age_completed: number;
  financial_completed: number;
  saved: number;
};
// A/B variant split for the benefits intake. Variant arms come from
// lib/analytics/variant.ts (deterministic djb2 hash on session_id, mod 3):
// "availability" / "loss" / "empathic". The legacy "control" / "money_loss"
// arms shipped with the V2 5-step flow and are retained here for historical
// rows produced before the V3 cutover. `unassigned` covers events fired
// before any variant assignment.
type BenefitsVariantRow = BenefitsFunnel;
type BenefitsFunnelByVariant = {
  availability: BenefitsVariantRow;
  loss: BenefitsVariantRow;
  empathic: BenefitsVariantRow;
  outreach: BenefitsVariantRow;           // 4th arm: AI outreach module (H1 demand test)
  qa_email_capture: BenefitsVariantRow;   // 5th arm: inline Q&A answer expansion (H2 UX test)
  multi_provider: BenefitsVariantRow;     // 6th arm: multi-provider comparison
  multi_provider_v2: BenefitsVariantRow;  // 7th arm: multi-provider V2 (email-first)
  control: BenefitsVariantRow;            // legacy V2
  money_loss: BenefitsVariantRow;         // legacy V2
  unassigned: BenefitsVariantRow;
};
// CTA Variants A/B funnel. Distinct sessions per stage:
//   impression → CTA rendered on provider page (cta_variant_impression)
//   clicked    → user clicked to open form/sheet (cta_variant_clicked)
//   engaged    → user clicked "Save this comparison" (cta_variant_clicked with action=save_comparison_clicked)
//   converted  → lead submitted (lead_received with cta_variant in metadata)
type CTAFunnel = {
  impressions: number;
  clicked: number;
  engaged: number;
  converted: number;
};
// Per-variant breakdown. Dynamically supports all variants from CTA_VARIANTS.
type CTAVariantRow = CTAFunnel;
type CTAVariantKey = CTAVariant | "unassigned";
type CTAFunnelByVariant = Record<CTAVariantKey, CTAVariantRow>;
// Managed Ads pitch A/B funnel. Distinct providers per stage:
//   shown      → managed_ads_pitch_viewed
//   clicked    → managed_ads_cta_clicked
//   viewed     → managed_ads_boost_viewed in apply/gate state
//   requested  → managed_ads_requested
//   results_viewed   → managed_ads_results_viewed
//   plans_viewed     → managed_ads_plans_viewed
//   plan_selected    → managed_ads_plan_selected
//   checkout_started → managed_ads_checkout_started
//   subscribed       → managed_ads_subscribed (Stripe webhook)
type ManagedAdsFunnel = {
  shown: number;
  clicked: number;
  viewed: number;
  requested: number;
  results_viewed: number;
  plans_viewed: number;
  plan_selected: number;
  not_now: number;
  checkout_started: number;
  checkout_created: number;
  checkout_failed: number;
  subscribed: number;
};
type ManagedAdsVariantRow = ManagedAdsFunnel;
type ManagedAdsVariantKey = ManagedAdsVariant | "unassigned";
type ManagedAdsFunnelByVariant = Record<ManagedAdsVariantKey, ManagedAdsVariantRow>;
type ManagedAdsPlanIntent = Record<string, {
  selected: number;
  checkout_started: number;
  subscribed: number;
}>;
// Page-view referrer breakdown — counts page_view events by traffic class
// (ai_chat / search / social / olera_internal / direct / other). Lets us
// watch the AI-chat slice grow as ChatGPT/Claude/Gemini/Perplexity start
// citing Olera. Source field: provider_activity.metadata.referrer_class,
// populated server-side in /api/activity/track for anonymous events.
type ReferrerBreakdown = Record<ReferrerClass, number>;

type WindowResult = {
  counts: WindowedCounts;
  unique_sessions_page_view: number;
  provider_distinct_counts: DistinctCounts;
  banner_leaderboard: Array<{ banner: string; impressions: number; clicks: number; converted: number | null; convLabel: string }>;
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
  managed_ads_plan_intent: ManagedAdsPlanIntent;
  referrer_breakdown: ReferrerBreakdown;
};

const EMPTY_COUNTS = (): WindowedCounts => ({
  page_view: 0,
  search_click: 0,
  benefits_started: 0,
  lead_received: 0,
  review_received: 0,
  question_received: 0,
  provider_saved: 0,
  benefits_completed: 0,
  matches_activated: 0,
});
const EMPTY_DISTINCT = (): DistinctCounts => ({
  qa_signins: 0,
  page_claims: 0,
  question_answerers: 0,
  lead_engagers: 0,
  teaser_clickers: 0,
  qa_email_openers: 0,
  hero_clickers: 0,
  profile_editors: 0,
  qa_success_arrivals: 0,
});
const EMPTY_FUNNEL = (): ProviderQaFunnel => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  complained: 0,
  signed_in: 0,
  answered: 0,
  qa_success_arrivals: 0,
  clicked_dashboard: 0,
  edited_profile: 0,
  clicked_dashboard_by_source: {
    qa_teaser: 0,
    hero: 0,
  },
});
const EMPTY_VARIANT_ROW = (): ProviderQaVariantRow => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  phi_filtered: 0,
});
const EMPTY_FUNNEL_BY_VARIANT = (): ProviderQaFunnelByVariant => ({
  A: EMPTY_VARIANT_ROW(),
  B: EMPTY_VARIANT_ROW(),
  unassigned: EMPTY_VARIANT_ROW(),
});
const EMPTY_COMMS_FUNNEL = (): ProviderCommsFunnel => ({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  distinct_clickers: 0,
  signed_in: 0,
  answered: 0,
  clicked_dashboard: 0,
  edited_profile: 0,
  engagement_bounces: 0,
  top_bouncers: [],
});
const EMPTY_COMMS_FUNNEL_BY_TYPE = (): ProviderCommsFunnelByType => ({
  all: EMPTY_COMMS_FUNNEL(),
  question_received: EMPTY_COMMS_FUNNEL(),
  weekly_digest: EMPTY_COMMS_FUNNEL(),
  verification: EMPTY_COMMS_FUNNEL(),
  onboarding: EMPTY_COMMS_FUNNEL(),
  nudges: EMPTY_COMMS_FUNNEL(),
  connections: EMPTY_COMMS_FUNNEL(),
});
const EMPTY_BENEFITS_FUNNEL = (): BenefitsFunnel => ({
  impressions: 0,
  started: 0,
  care_need_completed: 0,
  age_completed: 0,
  financial_completed: 0,
  saved: 0,
});
const EMPTY_BENEFITS_FUNNEL_BY_VARIANT = (): BenefitsFunnelByVariant => ({
  availability: EMPTY_BENEFITS_FUNNEL(),
  loss: EMPTY_BENEFITS_FUNNEL(),
  empathic: EMPTY_BENEFITS_FUNNEL(),
  outreach: EMPTY_BENEFITS_FUNNEL(),           // 4th arm
  qa_email_capture: EMPTY_BENEFITS_FUNNEL(),   // 5th arm
  multi_provider: EMPTY_BENEFITS_FUNNEL(),     // 6th arm
  multi_provider_v2: EMPTY_BENEFITS_FUNNEL(),  // 7th arm
  control: EMPTY_BENEFITS_FUNNEL(),            // legacy V2
  money_loss: EMPTY_BENEFITS_FUNNEL(),         // legacy V2
  unassigned: EMPTY_BENEFITS_FUNNEL(),
});
const EMPTY_CTA_FUNNEL = (): CTAFunnel => ({
  impressions: 0,
  clicked: 0,
  engaged: 0,
  converted: 0,
});
const EMPTY_CTA_FUNNEL_BY_VARIANT = (): CTAFunnelByVariant => ({
  ...Object.fromEntries(CTA_VARIANTS.map(v => [v, EMPTY_CTA_FUNNEL()])),
  unassigned: EMPTY_CTA_FUNNEL(),
}) as CTAFunnelByVariant;
const EMPTY_MANAGED_ADS_FUNNEL = (): ManagedAdsFunnel => ({
  shown: 0,
  clicked: 0,
  viewed: 0,
  requested: 0,
  results_viewed: 0,
  plans_viewed: 0,
  plan_selected: 0,
  not_now: 0,
  checkout_started: 0,
  checkout_created: 0,
  checkout_failed: 0,
  subscribed: 0,
});
const EMPTY_MANAGED_ADS_FUNNEL_BY_VARIANT = (): ManagedAdsFunnelByVariant => ({
  ...Object.fromEntries(MANAGED_ADS_VARIANTS.map(v => [v, EMPTY_MANAGED_ADS_FUNNEL()])),
  unassigned: EMPTY_MANAGED_ADS_FUNNEL(),
}) as ManagedAdsFunnelByVariant;
const EMPTY_REFERRER_BREAKDOWN = (): ReferrerBreakdown => ({
  ai_chat: 0,
  search: 0,
  social: 0,
  olera_internal: 0,
  direct: 0,
  other: 0,
});
// ── Dashboard banner CONVERSION mapping ──
// Each hero banner is a next-best-action with one intended outcome. We map it to
// the existing provider_activity event that means "the provider did the thing the
// banner nudged" — no new event types, so no DB migration. view_spike has no CTA
// (reinforcement only) → no conversion. Completion banners are section-scoped:
// the edit only counts if it touched the section the banner pointed at.
const BANNER_OUTCOME_EVENTS = [
  "lead_opened",
  "question_responded",
  "matches_outreach_sent",
  "provider_profile_edited",
] as const;
function bannerConversion(
  banner: string,
): { event: string; label: string; section?: string } | null {
  if (banner.startsWith("completion:")) {
    return { event: "provider_profile_edited", label: "Section finished", section: banner.slice("completion:".length) };
  }
  switch (banner) {
    case "leads": return { event: "lead_opened", label: "Lead opened" };
    case "questions": return { event: "question_responded", label: "Answered" };
    case "find_families_live":
    case "find_families_intel": return { event: "matches_outreach_sent", label: "Reached out" };
    default: return null; // view_spike + anything unmapped → reinforcement, no conversion
  }
}
// Last-touch attribution window. The banner lives IN the dashboard, so the
// provider is already in-session with other paths to the same action — a tight
// 3-day window biases toward action we can plausibly credit to the banner
// (vs. the email digest's 14d, where the email is the only touchpoint). Tunable.
const BANNER_ATTRIBUTION_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * Distinct providers who, after seeing `banner`, fired its outcome event within
 * the attribution window. A provider counts once if ANY impression of theirs is
 * followed within BANNER_ATTRIBUTION_MS by a matching outcome event. Both maps
 * are keyed by CANONICAL provider id so the two id namespaces line up.
 */
function countBannerConverted(
  imprTimes: Map<string, number[]>,
  outcomeTimes: Map<string, number[]>,
): number {
  let converted = 0;
  for (const [pid, imps] of imprTimes) {
    const evs = outcomeTimes.get(pid);
    if (!evs || evs.length === 0) continue;
    imps.sort((a, b) => a - b);
    let credited = false;
    for (const e of evs) {
      for (let i = 0; i < imps.length && imps[i] < e; i++) {
        if (e - imps[i] <= BANNER_ATTRIBUTION_MS) { credited = true; break; }
      }
      if (credited) break;
    }
    if (credited) converted += 1;
  }
  return converted;
}

/**
 * Pull all relevant events for one date window and bucket them into the
 * three count shapes (raw counts, unique sessions, distinct-provider counts).
 * `from`/`to` may be null — null means no bound on that side.
 */
async function fetchWindow(
  db: ReturnType<typeof getServiceClient>,
  from: string | null,
  to: string | null,
): Promise<WindowResult | { error: string }> {
  let providerQ = db
    .from("provider_activity")
    .select("event_type, metadata")
    .in("event_type", [...PROVIDER_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) providerQ = providerQ.gte("created_at", from);
  if (to) providerQ = providerQ.lt("created_at", to);

  let seekerQ = db
    .from("seeker_activity")
    .select("event_type")
    .in("event_type", [...SEEKER_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) seekerQ = seekerQ.gte("created_at", from);
  if (to) seekerQ = seekerQ.lt("created_at", to);

  let distinctQ = db
    .from("provider_activity")
    .select("provider_id, event_type, metadata")
    .in("event_type", [...PROVIDER_DISTINCT_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) distinctQ = distinctQ.gte("created_at", from);
  if (to) distinctQ = distinctQ.lt("created_at", to);

  // Q&A email openers: distinct providers whose question_received notification
  // was first opened in the window. Anchored on email_log.first_opened_at
  // (denormalized from Resend webhooks or Olera's first-party open pixel)
  // so this stays a flat scan, no join.
  let openersQ = db
    .from("email_log")
    .select("provider_id")
    .eq("email_type", "question_received")
    .eq("recipient_type", "provider")
    .not("first_opened_at", "is", null)
    .order("first_opened_at", { ascending: false })
    .limit(50000);
  if (from) openersQ = openersQ.gte("first_opened_at", from);
  if (to) openersQ = openersQ.lt("first_opened_at", to);

  // Provider Q&A email funnel (cohort-anchored): every question_received
  // email sent in the window, then count downstream lifecycle on each row.
  // Uses denormalized email_log columns (delivered_at / first_opened_at /
  // first_clicked_at) populated by Resend webhooks plus first-party Olera
  // open/click tracking, so this stays a flat scan with no join. Limit 50000
  // ≈ 700 days at current ~70 emails/day.
  // Note: bounced/complained counts come from the event-anchored issues
  // query below, not from this cohort, so they stay aligned with the issues
  // list shown to admins.
  let funnelQ = db
    .from("email_log")
    .select("delivered_at, first_opened_at, first_clicked_at, metadata")
    .eq("email_type", "question_received")
    .eq("recipient_type", "provider")
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) funnelQ = funnelQ.gte("created_at", from);
  if (to) funnelQ = funnelQ.lt("created_at", to);

  // Provider Comms Funnel — generalized cohort: every provider-bound email
  // sent in the window, partitioned by email_type bucket. Carries provider_id
  // so engagement bounce can join client-side against the downstream-activity
  // sets built from `distinctRes`. Selects only the columns needed (no
  // metadata.variant — A/B variant analysis stays in the Q&A funnel above).
  // Limit 50000 ≈ years at current provider-email volume.
  let commsFunnelQ = db
    .from("email_log")
    .select("email_type, provider_id, status, error_message, resend_id, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at")
    .in("email_type", [...PROVIDER_EMAIL_FUNNEL_TYPES.all])
    .eq("recipient_type", "provider")
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) commsFunnelQ = commsFunnelQ.gte("created_at", from);
  if (to) commsFunnelQ = commsFunnelQ.lt("created_at", to);

  // Issues: bounce + complaint events in the window. We pull broadly here and
  // restrict to the Q&A cohort via a secondary email_log lookup below — volume
  // is tiny (single-digit per week at current send rate) so client-side join
  // is fine.
  let issuesEventsQ = db
    .from("email_events")
    .select("event_type, bounce_type, bounce_reason, email_log_id")
    .in("event_type", ["bounced", "complained"])
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (from) issuesEventsQ = issuesEventsQ.gte("occurred_at", from);
  if (to) issuesEventsQ = issuesEventsQ.lt("occurred_at", to);

  // Care-seeker benefits intake funnel: distinct sessions per stage. The four
  // upstream events all live on provider_activity with metadata.session_id +
  // metadata.variant. Stages distinguished by event_type for `started`, and
  // by metadata.step_name within `benefits_step_completed` for the rest.
  let benefitsQ = db
    .from("provider_activity")
    .select("event_type, metadata")
    .in("event_type", ["benefits_entry_viewed", "benefits_started", "benefits_step_completed"])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) benefitsQ = benefitsQ.gte("created_at", from);
  if (to) benefitsQ = benefitsQ.lt("created_at", to);

  // Outreach 4th-arm + qa_email_capture 5th-arm funnel. Different table
  // (seeker_activity), different shape from the SBF arms.
  //   outreach          — impression → card click → submit
  //   qa_email_capture  — impression → (question_asked from POST /api/questions)
  //                       → question_email_enriched
  // Both arm sets bucketed by event_type below; metadata.variant is set on
  // qa_email_capture events but not strictly needed for bucketing.
  let outreachQ = db
    .from("seeker_activity")
    .select("event_type, metadata")
    .in("event_type", [
      "outreach_module_impression",
      "outreach_card_clicked",
      "outreach_request_submitted",
      "qa_email_capture_impression",
      "question_email_enriched",
    ])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) outreachQ = outreachQ.gte("created_at", from);
  if (to) outreachQ = outreachQ.lt("created_at", to);

  // Multi-provider 6th-arm funnel. Lives in provider_activity (anonymous
  // events). Event mapping:
  //   multi_provider_viewed     → impressions        (wrapper mount in arm)
  //   multi_provider_card_shown → started            (card stack rendered after a question)
  //   multi_provider_engaged    → care_need_completed (first card interaction or expand click)
  //   multi_provider_converted  → saved              (email captured)
  // Other multi_provider_* events (asked, skipped, save_all) are kept in
  // the allowlist for downstream analysis but don't drive the canonical funnel.
  let multiProviderQ = db
    .from("provider_activity")
    .select("event_type, metadata")
    .in("event_type", ["multi_provider_viewed", "multi_provider_card_shown", "multi_provider_engaged", "multi_provider_converted"])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) multiProviderQ = multiProviderQ.gte("created_at", from);
  if (to) multiProviderQ = multiProviderQ.lt("created_at", to);

  // CTA Variants A/B funnel. impression → clicked → converted.
  // Events are on provider_activity: cta_variant_impression, cta_variant_clicked,
  // and lead_received (with metadata.cta_variant for attribution).
  // ORDER BY created_at DESC ensures "All time" includes most recent events first,
  // so the 50K limit doesn't cause recent conversions to be missed.
  let ctaQ = db
    .from("provider_activity")
    .select("event_type, metadata")
    .in("event_type", ["cta_variant_impression", "cta_variant_clicked", "lead_received"])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) ctaQ = ctaQ.gte("created_at", from);
  if (to) ctaQ = ctaQ.lt("created_at", to);

  // Managed Ads end-to-end funnel. Distinct provider-level stages from pitch
  // through the authoritative Stripe subscription event.
  let managedAdsQ = db
    .from("provider_activity")
    .select("provider_id, event_type, metadata")
    .in("event_type", [
      "managed_ads_pitch_viewed",
      "managed_ads_cta_clicked",
      "managed_ads_boost_viewed",
      "managed_ads_requested",
      "managed_ads_results_viewed",
      "managed_ads_plans_viewed",
      "managed_ads_plan_selected",
      "managed_ads_not_now",
      "managed_ads_checkout_started",
      "managed_ads_checkout_created",
      "managed_ads_checkout_failed",
      "managed_ads_subscribed",
    ])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) managedAdsQ = managedAdsQ.gte("created_at", from);
  if (to) managedAdsQ = managedAdsQ.lt("created_at", to);

  // Dashboard Banners leaderboard. The provider-dashboard hero is a contextual
  // next-best-action engine (one banner per visit, chosen by the provider's own
  // state — NOT a randomized A/B test). Every banner fires a
  // provider_picker_impression on show and a provider_picker_clicked on tap,
  // tagged with metadata.banner. We bucket by banner and count DISTINCT
  // providers per stage so a single provider's repeat visits don't skew the
  // click-through. Because banners are shown to different audiences, CTR is a
  // visibility signal (which banners get traction), not a controlled
  // comparison — the UI labels it as such.
  let bannerQ = db
    .from("provider_activity")
    .select("provider_id, event_type, metadata, created_at")
    .in("event_type", ["provider_picker_impression", "provider_picker_clicked"])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) bannerQ = bannerQ.gte("created_at", from);
  if (to) bannerQ = bannerQ.lt("created_at", to);

  // Downstream outcome events for the banner CONVERSION column. last-touch
  // attribution credits a banner impression if its outcome fires within
  // BANNER_ATTRIBUTION_MS AFTER it — so we fetch outcomes up to `to` + that
  // buffer, otherwise an impression near the window's end would have its
  // conversion truncated. Lower bound stays `from` (an outcome before the
  // window can't follow an in-window impression anyway).
  const bannerConvTo = to
    ? new Date(new Date(to).getTime() + BANNER_ATTRIBUTION_MS).toISOString()
    : null;
  let bannerConvQ = db
    .from("provider_activity")
    .select("provider_id, event_type, metadata, created_at")
    .in("event_type", [...BANNER_OUTCOME_EVENTS])
    .order("created_at", { ascending: false })
    .limit(50000);
  if (from) bannerConvQ = bannerConvQ.gte("created_at", from);
  if (bannerConvTo) bannerConvQ = bannerConvQ.lt("created_at", bannerConvTo);

  // Provider response rates — fetch connections with thread data to measure
  // whether providers are actually responding to leads generated by CTAs.
  // Only include "inquiry" connections (family→provider) for Provider Response Rates.
  // Matches (type="request", provider→family) are tracked separately on the Outreach page.
  // Messages in metadata.thread, provider responded = any message where
  // from_profile_id === to_profile_id AND is_auto_reply !== true.
  let connectionsQ = db
    .from("connections")
    .select(`
      id,
      from_profile_id,
      to_profile_id,
      metadata,
      created_at,
      from_profile:business_profiles!connections_from_profile_id_fkey(display_name),
      to_profile:business_profiles!connections_to_profile_id_fkey(display_name, slug, source_provider_id)
    `)
    .eq("type", "inquiry")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (from) connectionsQ = connectionsQ.gte("created_at", from);
  if (to) connectionsQ = connectionsQ.lt("created_at", to);

  const [providerRes, seekerRes, distinctRes, openersRes, funnelRes, commsFunnelRes, issuesEventsRes, benefitsRes, outreachRes, multiProviderRes, ctaRes, managedAdsRes, connectionsRes, bannerRes, bannerConvRes] = await Promise.all([
    providerQ,
    seekerQ,
    distinctQ,
    openersQ,
    funnelQ,
    commsFunnelQ,
    issuesEventsQ,
    benefitsQ,
    outreachQ,
    multiProviderQ,
    ctaQ,
    managedAdsQ,
    connectionsQ,
    bannerQ,
    bannerConvQ,
  ]);

  if (providerRes.error) return { error: "provider window query failed" };
  if (seekerRes.error) return { error: "seeker window query failed" };
  if (distinctRes.error) return { error: "distinct window query failed" };
  if (openersRes.error) return { error: "Q&A email openers query failed" };
  if (funnelRes.error) return { error: "Q&A funnel query failed" };
  if (commsFunnelRes.error) return { error: "Provider comms funnel query failed" };
  if (outreachRes.error) return { error: "outreach funnel query failed" };
  if (multiProviderRes.error) return { error: "multi_provider funnel query failed" };
  if (issuesEventsRes.error) return { error: "Q&A issues query failed" };
  if (benefitsRes.error) return { error: "benefits funnel query failed" };
  if (ctaRes.error) return { error: "CTA funnel query failed" };
  if (managedAdsRes.error) return { error: "managed ads funnel query failed" };
  if (connectionsRes.error) return { error: "connections query failed" };
  if (bannerRes.error) return { error: "dashboard banner query failed" };
  if (bannerConvRes.error) return { error: "dashboard banner conversion query failed" };

  // ── Canonicalize every provider id to one namespace (olera-providers.slug)
  // BEFORE bucketing. The Provider Comms Funnel intersects the click set
  // (email_log) with downstream-event sets (provider_activity). email_log
  // ids resolve via resolveSlugsForRawIds; dashboard-origin activity events
  // (provider_picker_clicked / provider_profile_edited) write the suffixed
  // business_profiles.slug. Without a shared key the "Clicked dashboard" /
  // "Edited profile" columns are structurally ~0 for claimed providers whose
  // BP slug differs from their OP slug. Resolve raw click ids first, then
  // canonicalize BOTH sides through one map (idempotent on OP/page slugs, so
  // the already-correct columns don't move).
  const rawClickedIds = new Set<string>();
  for (const r of (commsFunnelRes.data ?? []) as Array<{
    provider_id: string | null;
    first_clicked_at: string | null;
  }>) {
    if (r.first_clicked_at && r.provider_id) rawClickedIds.add(r.provider_id);
  }
  const slugByRawClickedId = await resolveSlugsForRawIds(db, rawClickedIds);

  const canonUniverse = new Set<string>();
  for (const r of (distinctRes.data ?? []) as Array<{ provider_id: string | null }>) {
    if (r.provider_id) canonUniverse.add(r.provider_id);
  }
  for (const raw of rawClickedIds) {
    canonUniverse.add(slugByRawClickedId.get(raw) ?? raw);
  }
  // Banner impressions + their downstream outcome events must canonicalize too,
  // so the conversion join below lines up across the two id namespaces (dashboard
  // events write the suffixed BP slug; some outcome events use the bare OP slug).
  for (const r of (bannerRes.data ?? []) as Array<{ provider_id: string | null }>) {
    if (r.provider_id) canonUniverse.add(r.provider_id);
  }
  for (const r of (bannerConvRes.data ?? []) as Array<{ provider_id: string | null }>) {
    if (r.provider_id) canonUniverse.add(r.provider_id);
  }
  for (const r of (managedAdsRes.data ?? []) as Array<{ provider_id: string | null }>) {
    if (r.provider_id) canonUniverse.add(r.provider_id);
  }
  const canonByKey = await resolveCanonicalProviderKeys(db, canonUniverse);
  const canon = (id: string): string => canonByKey.get(id) ?? id;

  const counts = EMPTY_COUNTS();
  const uniqueSessions = new Set<string>();
  const referrerBreakdown = EMPTY_REFERRER_BREAKDOWN();
  for (const r of (providerRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    if ((PROVIDER_EVENT_TYPES as readonly string[]).includes(r.event_type)) {
      counts[r.event_type as ProviderEvent] += 1;
    }
    if (r.event_type === "page_view") {
      const sid = r.metadata?.session_id;
      if (typeof sid === "string" && sid.length > 0) uniqueSessions.add(sid);
      // Bucket by referrer_class. Older rows (pre-instrumentation) have
      // no referrer_class field — those fall through and aren't counted,
      // which is fine: the breakdown is a forward-looking metric.
      const cls = r.metadata?.referrer_class;
      if (
        typeof cls === "string" &&
        (REFERRER_CLASSES as readonly string[]).includes(cls)
      ) {
        referrerBreakdown[cls as ReferrerClass] += 1;
      }
    }
  }
  for (const r of (seekerRes.data ?? []) as Array<{ event_type: string }>) {
    if ((SEEKER_EVENT_TYPES as readonly string[]).includes(r.event_type)) {
      counts[r.event_type as SeekerEvent] += 1;
    }
  }

  const distinct = EMPTY_DISTINCT();
  const sets = {
    qa_signins: new Set<string>(),
    page_claims: new Set<string>(),
    question_answerers: new Set<string>(),
    lead_engagers: new Set<string>(),
    teaser_clickers: new Set<string>(),
    hero_clickers: new Set<string>(),
    profile_editors: new Set<string>(),
    qa_success_arrivals: new Set<string>(),
    // Union of teaser + hero — feeds funnel.clicked_dashboard. Kept here
    // rather than derived later so a provider isn't double-counted when
    // they used both paths.
    any_dashboard_clickers: new Set<string>(),
    // Every one_click_access regardless of action (question | lead | review)
    // — feeds the generalized Provider Comms Funnel's `signed_in` column.
    // qa_signins / lead_engagers stay separate for the Q&A funnel and the
    // Providers strip.
    any_signin: new Set<string>(),
  };
  for (const r of (distinctRes.data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    if (!r.provider_id) continue;
    const pid = canon(r.provider_id);
    if (r.event_type === "one_click_access") {
      sets.any_signin.add(pid);
      const action = r.metadata?.action;
      if (action === "question") sets.qa_signins.add(pid);
      else if (action === "lead") sets.lead_engagers.add(pid);
    } else if (r.event_type === "claim_completed") {
      // Count all claims regardless of source. The legacy filter required
      // source==="page", but the page flow was superseded by instant-claim
      // (source="instant_claim") and email (source="email"); "page" is
      // effectively never emitted, so this tile silently read ~0.
      sets.page_claims.add(pid);
    } else if (r.event_type === "question_responded") {
      sets.question_answerers.add(pid);
    } else if (r.event_type === "analytics_teaser_cta_clicked") {
      sets.teaser_clickers.add(pid);
      sets.any_dashboard_clickers.add(pid);
    } else if (r.event_type === "provider_picker_clicked") {
      const source = r.metadata?.source;
      if (source === "hero") sets.hero_clickers.add(pid);
      sets.any_dashboard_clickers.add(pid);
    } else if (r.event_type === "provider_profile_edited") {
      sets.profile_editors.add(pid);
    } else if (r.event_type === "dashboard_arrival") {
      const source = r.metadata?.source;
      if (source === "qa-success") sets.qa_success_arrivals.add(pid);
    }
  }
  distinct.qa_signins = sets.qa_signins.size;
  distinct.page_claims = sets.page_claims.size;
  distinct.question_answerers = sets.question_answerers.size;
  distinct.lead_engagers = sets.lead_engagers.size;
  distinct.teaser_clickers = sets.teaser_clickers.size;
  distinct.hero_clickers = sets.hero_clickers.size;
  distinct.profile_editors = sets.profile_editors.size;
  distinct.qa_success_arrivals = sets.qa_success_arrivals.size;

  const qaOpeners = new Set<string>();
  for (const r of (openersRes.data ?? []) as Array<{ provider_id: string | null }>) {
    if (r.provider_id) qaOpeners.add(r.provider_id);
  }
  distinct.qa_email_openers = qaOpeners.size;

  const funnel = EMPTY_FUNNEL();
  const funnelByVariant = EMPTY_FUNNEL_BY_VARIANT();
  for (const r of (funnelRes.data ?? []) as Array<{
    delivered_at: string | null;
    first_opened_at: string | null;
    first_clicked_at: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    funnel.sent += 1;
    if (r.delivered_at) funnel.delivered += 1;
    if (r.first_opened_at) funnel.opened += 1;
    if (r.first_clicked_at) funnel.clicked += 1;

    const v = r.metadata?.variant;
    const bucket =
      v === "A" ? funnelByVariant.A : v === "B" ? funnelByVariant.B : funnelByVariant.unassigned;
    bucket.sent += 1;
    if (r.delivered_at) bucket.delivered += 1;
    if (r.first_opened_at) bucket.opened += 1;
    if (r.first_clicked_at) bucket.clicked += 1;
    if (r.metadata?.phi_filtered === true) bucket.phi_filtered += 1;
  }
  // signed_in / answered are activity-event-anchored, projected for display.
  funnel.signed_in = distinct.qa_signins;
  funnel.answered = distinct.question_answerers;
  // clicked_dashboard / edited_profile are also activity-event-anchored. Per-
  // source breakdown lets us compare the existing analytics teaser vs the
  // smart picker once both have been live long enough to generate signal.
  funnel.clicked_dashboard = sets.any_dashboard_clickers.size;
  funnel.edited_profile = distinct.profile_editors;
  funnel.qa_success_arrivals = distinct.qa_success_arrivals;
  funnel.clicked_dashboard_by_source = {
    qa_teaser: distinct.teaser_clickers,
    hero: distinct.hero_clickers,
  };
  // bounced / complained are populated below from the event-anchored issues
  // query so they stay in lockstep with the issues list.

  // Issues: filter the window's bounce/complaint events down to the Q&A cohort
  // via a secondary email_log lookup, then group by reason and take top 5.
  const issueRows = (issuesEventsRes.data ?? []) as Array<{
    event_type: "bounced" | "complained";
    bounce_type: string | null;
    bounce_reason: string | null;
    email_log_id: string | null;
  }>;
  const candidateLogIds = [
    ...new Set(issueRows.map((r) => r.email_log_id).filter((id): id is string => !!id)),
  ];
  const qaIssueLogIds = new Set<string>();
  if (candidateLogIds.length > 0) {
    const { data: qaLogs } = await db
      .from("email_log")
      .select("id")
      .in("id", candidateLogIds)
      .eq("email_type", "question_received")
      .eq("recipient_type", "provider");
    if (qaLogs) {
      for (const r of qaLogs as Array<{ id: string }>) {
        qaIssueLogIds.add(r.id);
      }
    }
  }
  const issueCounts = new Map<string, { count: number; type: "bounced" | "complained" }>();
  const bouncedLogs = new Set<string>();
  const complainedLogs = new Set<string>();
  for (const r of issueRows) {
    if (!r.email_log_id || !qaIssueLogIds.has(r.email_log_id)) continue;
    if (r.event_type === "bounced") bouncedLogs.add(r.email_log_id);
    else complainedLogs.add(r.email_log_id);
    const reason =
      r.bounce_reason || (r.event_type === "complained" ? "Marked as spam" : "(no reason given)");
    const existing = issueCounts.get(reason);
    if (existing) {
      existing.count += 1;
    } else {
      issueCounts.set(reason, { count: 1, type: r.event_type });
    }
  }
  funnel.bounced = bouncedLogs.size;
  funnel.complained = complainedLogs.size;
  const qaEmailIssues: QaEmailIssue[] = [...issueCounts.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, type: v.type }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Provider Comms Funnel rollup ────────────────────────────────────────
  // Generalize the Q&A funnel pattern across every provider-bound email
  // bucket. Sent/Delivered/Opened/Clicked are raw email_log row counts per
  // bucket. The downstream four are distinct providers in window who did the
  // event (approximate attribution — same model as the Q&A funnel above).
  // Engagement bounce per bucket = providers who clicked an email of that
  // bucket but produced none of the four downstream events in window.
  //
  // The `all` bucket is a union across the six specific buckets. A provider
  // who clicked emails of two different buckets is counted in each — that's
  // the price of approximate attribution; tooltip in the UI names it.
  const commsFunnel = EMPTY_COMMS_FUNNEL_BY_TYPE();
  type CommsBucketKey = Exclude<ProviderEmailFunnelKey, "all">;
  const SPECIFIC_BUCKETS: CommsBucketKey[] = ["onboarding", "question_received", "weekly_digest", "verification", "nudges", "connections"];
  // Per-bucket sets of provider_ids who clicked at least one email of that
  // bucket in window. The `all` set is the union, built incrementally.
  const clickedByBucket: Record<ProviderEmailFunnelKey, Set<string>> = {
    all: new Set(),
    question_received: new Set(),
    weekly_digest: new Set(),
    verification: new Set(),
    onboarding: new Set(),
    nudges: new Set(),
    connections: new Set(),
  };
  // Track per-provider their most-recent click (across all buckets) — feeds
  // the engagement-bouncer top-10 list. Per-bucket maps too so the bucket's
  // top-10 only lists providers who clicked an email of THAT bucket.
  type ClickRecord = { last_clicked_at: string; last_clicked_email_type: string };
  const lastClickByProviderByBucket: Record<ProviderEmailFunnelKey, Map<string, ClickRecord>> = {
    all: new Map(),
    question_received: new Map(),
    weekly_digest: new Map(),
    verification: new Map(),
    onboarding: new Map(),
    nudges: new Map(),
    connections: new Map(),
  };

  // rawClickedIds + slugByRawClickedId + canon were computed up-front so the
  // distinct-event sets above and the click set below share one namespace.
  for (const r of (commsFunnelRes.data ?? []) as Array<{
    email_type: string | null;
    provider_id: string | null;
    status: string | null;
    error_message: string | null;
    resend_id: string | null;
    bounced_at: string | null;
    complained_at: string | null;
    delivered_at: string | null;
    first_opened_at: string | null;
    first_clicked_at: string | null;
  }>) {
    const et = r.email_type ?? "";
    const bucket = bucketForEmailType(et);
    if (!bucket || !isAcceptedEmail(r)) continue;
    // Increment row counters in the specific bucket AND `all`.
    for (const k of [bucket, "all" as const] as ProviderEmailFunnelKey[]) {
      const f = commsFunnel[k];
      f.sent += 1;
      if (r.delivered_at) f.delivered += 1;
      if (r.first_opened_at) f.opened += 1;
      if (r.first_clicked_at) f.clicked += 1;
    }
    // Click-set + last-click tracking only when we have both a provider_id
    // and a click. Pre-migration rows lacking provider_id are still counted
    // in the row totals above, just not in engagement-bounce.
    if (r.first_clicked_at && r.provider_id) {
      // Fall through to raw id when the row's id is already a slug (some
      // older sends wrote slug directly) or doesn't resolve — better to
      // pass through than drop the row from the click set entirely. Then
      // canon() collapses it to the OP-slug namespace the activity sets use.
      const slug = canon(slugByRawClickedId.get(r.provider_id) ?? r.provider_id);
      clickedByBucket[bucket].add(slug);
      clickedByBucket.all.add(slug);
      for (const k of [bucket, "all" as const] as ProviderEmailFunnelKey[]) {
        const m = lastClickByProviderByBucket[k];
        const existing = m.get(slug);
        if (!existing || r.first_clicked_at > existing.last_clicked_at) {
          m.set(slug, { last_clicked_at: r.first_clicked_at, last_clicked_email_type: et });
        }
      }
    }
  }

  // Global success set — distinct providers who did any of the four downstream
  // events in window. Same source data as the Q&A funnel's projections, just
  // unioned. `any_signin` covers all one_click_access actions (question/lead/
  // review); `any_dashboard_clickers` covers teaser + hero union; the other
  // two are direct activity events.
  const successSet = new Set<string>();
  for (const pid of sets.any_signin) successSet.add(pid);
  for (const pid of sets.question_answerers) successSet.add(pid);
  for (const pid of sets.any_dashboard_clickers) successSet.add(pid);
  for (const pid of sets.profile_editors) successSet.add(pid);

  // Per-bucket: compute downstream counts as |clicked_set ∩ event_set| so
  // each column reads "of the providers who clicked an email of this bucket,
  // how many also did event X in window?" That's the more useful read than
  // a window-global distinct count: it ties the downstream column to the
  // bucket's cohort. The Q&A funnel above projects globally; this funnel
  // localizes, which is the point of having both.
  const intersect = (clicked: Set<string>, evt: Set<string>): number => {
    let n = 0;
    for (const pid of clicked) if (evt.has(pid)) n += 1;
    return n;
  };
  for (const k of (["all", ...SPECIFIC_BUCKETS] as ProviderEmailFunnelKey[])) {
    const f = commsFunnel[k];
    const clicked = clickedByBucket[k];
    f.distinct_clickers = clicked.size;
    f.signed_in = intersect(clicked, sets.any_signin);
    f.answered = intersect(clicked, sets.question_answerers);
    f.clicked_dashboard = intersect(clicked, sets.any_dashboard_clickers);
    f.edited_profile = intersect(clicked, sets.profile_editors);

    // Engagement bouncers — clicked, but in NONE of the four downstream sets.
    const bouncerIds: string[] = [];
    for (const pid of clicked) {
      if (!successSet.has(pid)) bouncerIds.push(pid);
    }
    f.engagement_bounces = bouncerIds.length;

    // Top 10 most-recent — sorted desc by last_clicked_at.
    const m = lastClickByProviderByBucket[k];
    f.top_bouncers = bouncerIds
      .map((pid) => {
        const rec = m.get(pid);
        return rec
          ? { provider_id: pid, last_clicked_at: rec.last_clicked_at, last_clicked_email_type: rec.last_clicked_email_type }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.last_clicked_at.localeCompare(a.last_clicked_at))
      .slice(0, 10);
  }

  // Benefits intake funnel rollup. Build per-stage Sets keyed on session_id —
  // distinct sessions, not raw events. A session that re-enters the form
  // counts once per stage. Per-variant Sets in parallel; the overall funnel
  // is the union (one session always carries the same variant).
  //
  // The age_completed / financial_completed stages are retained for
  // historical V2 5-step rows. V3 (2-step) events don't fire them — those
  // columns will read 0 going forward.
  type BenefitsBucket =
    | "availability"
    | "loss"
    | "empathic"
    | "outreach"           // 4th arm
    | "qa_email_capture"   // 5th arm
    | "multi_provider"     // 6th arm
    | "multi_provider_v2"  // 7th arm
    | "control"            // legacy V2
    | "money_loss"         // legacy V2
    | "unassigned";
  const emptyStages = (): Record<keyof BenefitsFunnel, Set<string>> => ({
    impressions: new Set(),
    started: new Set(),
    care_need_completed: new Set(),
    age_completed: new Set(),
    financial_completed: new Set(),
    saved: new Set(),
  });
  const benefitsStageSets = emptyStages();
  const benefitsByVariantSets: Record<BenefitsBucket, Record<keyof BenefitsFunnel, Set<string>>> = {
    availability: emptyStages(),
    loss: emptyStages(),
    empathic: emptyStages(),
    outreach: emptyStages(),
    qa_email_capture: emptyStages(),
    multi_provider: emptyStages(),
    multi_provider_v2: emptyStages(),
    control: emptyStages(),
    money_loss: emptyStages(),
    unassigned: emptyStages(),
  };
  // step_name → funnel-stage mapping. Pre-cutover the embedded module fired
  // care-need / age / financial / save; post-cutover the V3 2-step fires
  // care-need / contact (where contact is the email/SMS submission step).
  // Both contact and save map to the same `saved` stage so historical and
  // current data remain comparable end-to-end.
  const STEP_TO_STAGE: Record<string, keyof BenefitsFunnel | undefined> = {
    "care-need": "care_need_completed",
    age: "age_completed",
    financial: "financial_completed",
    save: "saved",
    contact: "saved",
  };
  const VARIANT_BUCKETS = new Set<BenefitsBucket>([
    "availability",
    "loss",
    "empathic",
    "qa_email_capture",
    "multi_provider",
    "multi_provider_v2",
    "control",
    "money_loss",
  ]);
  for (const r of (benefitsRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const sid = r.metadata?.session_id;
    if (typeof sid !== "string" || !sid) continue;
    const v = r.metadata?.variant;
    const bucket: BenefitsBucket =
      typeof v === "string" && VARIANT_BUCKETS.has(v as BenefitsBucket)
        ? (v as BenefitsBucket)
        : "unassigned";
    let stage: keyof BenefitsFunnel | undefined;
    if (r.event_type === "benefits_entry_viewed") {
      stage = "impressions";
    } else if (r.event_type === "benefits_started") {
      stage = "started";
    } else if (r.event_type === "benefits_step_completed") {
      const stepName = r.metadata?.step_name;
      if (typeof stepName === "string") stage = STEP_TO_STAGE[stepName];
    }
    if (!stage) continue;
    benefitsStageSets[stage].add(sid);
    benefitsByVariantSets[bucket][stage].add(sid);
  }
  // Bucket outreach + qa_email_capture events by distinct session_id into
  // their respective arm. These events are unique per arm (event_type IS
  // the variant signal). Stage mapping mirrors the SBF arms so the funnel
  // reads apples-to-apples on a shared impressions denominator:
  //
  //   outreach arm:
  //     outreach_module_impression   → impressions  (passive: module rendered)
  //     outreach_card_clicked        → started      (first interactive action)
  //     outreach_request_submitted   → saved        (form submitted)
  //
  //   qa_email_capture arm:
  //     qa_email_capture_impression  → impressions  (Q&A section rendered for arm)
  //     question_email_enriched      → saved        (email captured post-question)
  //     no `started` middle stage; arm collapses impressions → saved
  for (const r of (outreachRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const sid = typeof r.metadata?.session_id === "string" ? r.metadata.session_id : null;
    if (r.event_type === "outreach_module_impression") {
      if (sid) benefitsByVariantSets.outreach.impressions.add(sid);
    } else if (r.event_type === "outreach_card_clicked") {
      if (sid) benefitsByVariantSets.outreach.started.add(sid);
    } else if (r.event_type === "outreach_request_submitted") {
      if (sid) benefitsByVariantSets.outreach.saved.add(sid);
    } else if (r.event_type === "qa_email_capture_impression") {
      if (sid) benefitsByVariantSets.qa_email_capture.impressions.add(sid);
    } else if (r.event_type === "question_email_enriched") {
      // The PATCH route doesn't carry session_id directly when it lacks
      // a client; metadata.session_id is set by the client-side enrichment
      // call. Use question_id as the dedup fallback so each question's
      // enrichment counts once per question even when session_id is missing.
      const qid = typeof r.metadata?.question_id === "string" ? r.metadata.question_id : null;
      const key = qid || sid || `${r.event_type}-${Math.random()}`;
      benefitsByVariantSets.qa_email_capture.saved.add(key);
    }
  }

  // Multi-provider 6th/7th arms. Lives in provider_activity (anonymous events).
  // Event mapping:
  //   multi_provider_viewed     → impressions         (wrapper mount in arm)
  //   multi_provider_card_shown → started             (card stack rendered)
  //   multi_provider_engaged    → care_need_completed (first card interaction or expand click)
  //   multi_provider_converted  → saved               (email captured)
  // Both multi_provider and multi_provider_v2 use the same event types but
  // are distinguished by metadata.variant. V2 events carry "multi_provider_v2".
  for (const r of (multiProviderRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const sid = r.metadata?.session_id;
    if (typeof sid !== "string" || !sid) continue;
    const stage: keyof BenefitsFunnel | undefined =
      r.event_type === "multi_provider_viewed" ? "impressions"
      : r.event_type === "multi_provider_card_shown" ? "started"
      : r.event_type === "multi_provider_engaged" ? "care_need_completed"
      : r.event_type === "multi_provider_converted" ? "saved"
      : undefined;
    if (!stage) continue;
    // Route to the correct variant bucket based on metadata.variant
    const variantMeta = r.metadata?.variant;
    const isV2 = variantMeta === "multi_provider_v2";
    const bucket = isV2 ? "multi_provider_v2" : "multi_provider";
    benefitsByVariantSets[bucket][stage].add(sid);
  }

  // Top-line funnel = the 3 benefits arms only (the embedded form). The
  // outreach arm is an alternative entry-point on the same A/B test, but
  // it lives in seeker_activity and uses different events; surface it in
  // the per-variant table instead so the top-line stays a clean read of
  // "how is the benefits form performing?"
  const benefitsFunnel: BenefitsFunnel = {
    impressions: benefitsStageSets.impressions.size,
    started: benefitsStageSets.started.size,
    care_need_completed: benefitsStageSets.care_need_completed.size,
    age_completed: benefitsStageSets.age_completed.size,
    financial_completed: benefitsStageSets.financial_completed.size,
    saved: benefitsStageSets.saved.size,
  };
  const sizesFor = (b: BenefitsBucket): BenefitsVariantRow => ({
    impressions: benefitsByVariantSets[b].impressions.size,
    started: benefitsByVariantSets[b].started.size,
    care_need_completed: benefitsByVariantSets[b].care_need_completed.size,
    age_completed: benefitsByVariantSets[b].age_completed.size,
    financial_completed: benefitsByVariantSets[b].financial_completed.size,
    saved: benefitsByVariantSets[b].saved.size,
  });
  const benefitsFunnelByVariant: BenefitsFunnelByVariant = {
    availability: sizesFor("availability"),
    loss: sizesFor("loss"),
    empathic: sizesFor("empathic"),
    outreach: sizesFor("outreach"),
    qa_email_capture: sizesFor("qa_email_capture"),
    multi_provider: sizesFor("multi_provider"),
    multi_provider_v2: sizesFor("multi_provider_v2"),
    control: sizesFor("control"),
    money_loss: sizesFor("money_loss"),
    unassigned: sizesFor("unassigned"),
  };

  // CTA Variants A/B funnel rollup. Distinct sessions per stage.
  // impression → clicked → engaged (save_comparison_clicked) → converted (lead_received with cta_variant).
  // Dynamically supports all variants from CTA_VARIANTS.
  const emptyCtaStages = (): Record<keyof CTAFunnel, Set<string>> => ({
    impressions: new Set(),
    clicked: new Set(),
    engaged: new Set(),
    converted: new Set(),
  });
  const ctaStageSets = emptyCtaStages();
  // Build variant sets dynamically from CTA_VARIANTS
  const ctaByVariantSets: Record<CTAVariantKey, Record<keyof CTAFunnel, Set<string>>> = {
    ...Object.fromEntries(CTA_VARIANTS.map(v => [v, emptyCtaStages()])),
    unassigned: emptyCtaStages(),
  } as Record<CTAVariantKey, Record<keyof CTAFunnel, Set<string>>>;
  // Set of known variants for bucket assignment
  const CTA_VARIANT_BUCKETS = new Set<string>(CTA_VARIANTS);
  // Counter for events without session_id (each counts as unique session)
  let noSessionCtaCounter = 0;

  for (const r of (ctaRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    // Use session_id if available, otherwise generate unique placeholder
    // This ensures events without session_id are still counted (as individual conversions)
    const rawSid = r.metadata?.session_id;
    const sid = typeof rawSid === "string" && rawSid
      ? rawSid
      : `__no_session_cta_${noSessionCtaCounter++}`;

    // Determine the variant bucket
    let variant: string | null = null;
    if (r.event_type === "cta_variant_impression" || r.event_type === "cta_variant_clicked") {
      variant = r.metadata?.variant as string | null;
    } else if (r.event_type === "lead_received") {
      variant = r.metadata?.cta_variant as string | null;
    }

    const bucket: CTAVariantKey =
      typeof variant === "string" && CTA_VARIANT_BUCKETS.has(variant)
        ? (variant as CTAVariant)
        : "unassigned";

    // Determine stage
    let stage: keyof CTAFunnel | undefined;
    if (r.event_type === "cta_variant_impression") {
      stage = "impressions";
    } else if (r.event_type === "cta_variant_clicked") {
      // Check for "engaged" stage (save_comparison_clicked action)
      const action = r.metadata?.action as string | null;
      if (action === "save_comparison_clicked") {
        stage = "engaged";
      } else {
        stage = "clicked";
      }
    } else if (r.event_type === "lead_received") {
      // Count all lead_received as conversions - those without cta_variant go to "unassigned"
      stage = "converted";
    }

    if (!stage) continue;
    ctaStageSets[stage].add(sid);
    ctaByVariantSets[bucket][stage].add(sid);
  }

  const ctaFunnel: CTAFunnel = {
    impressions: ctaStageSets.impressions.size,
    clicked: ctaStageSets.clicked.size,
    engaged: ctaStageSets.engaged.size,
    converted: ctaStageSets.converted.size,
  };
  const ctaSizesFor = (b: CTAVariantKey): CTAVariantRow => ({
    impressions: ctaByVariantSets[b].impressions.size,
    clicked: ctaByVariantSets[b].clicked.size,
    engaged: ctaByVariantSets[b].engaged.size,
    converted: ctaByVariantSets[b].converted.size,
  });
  const ctaFunnelByVariant: CTAFunnelByVariant = {
    ...Object.fromEntries(CTA_VARIANTS.map(v => [v, ctaSizesFor(v)])),
    unassigned: ctaSizesFor("unassigned"),
  } as CTAFunnelByVariant;

  // Managed Ads pitch A/B funnel rollup. Distinct providers per stage.
  const emptyManagedAdsStages = (): Record<keyof ManagedAdsFunnel, Set<string>> => ({
    shown: new Set(),
    clicked: new Set(),
    viewed: new Set(),
    requested: new Set(),
    results_viewed: new Set(),
    plans_viewed: new Set(),
    plan_selected: new Set(),
    not_now: new Set(),
    checkout_started: new Set(),
    checkout_created: new Set(),
    checkout_failed: new Set(),
    subscribed: new Set(),
  });
  const managedAdsStageSets = emptyManagedAdsStages();
  const managedAdsPlanIntentSets = new Map<string, {
    selected: Set<string>;
    checkout_started: Set<string>;
    subscribed: Set<string>;
  }>();
  const managedAdsByVariantSets: Record<ManagedAdsVariantKey, Record<keyof ManagedAdsFunnel, Set<string>>> = {
    ...Object.fromEntries(MANAGED_ADS_VARIANTS.map(v => [v, emptyManagedAdsStages()])),
    unassigned: emptyManagedAdsStages(),
  } as Record<ManagedAdsVariantKey, Record<keyof ManagedAdsFunnel, Set<string>>>;
  const MANAGED_ADS_BUCKETS = new Set<string>(MANAGED_ADS_VARIANTS);
  let noProviderManagedAdsCounter = 0;

  for (const r of (managedAdsRes.data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const pid = r.provider_id ? canon(r.provider_id) : `__no_provider_managed_ads_${noProviderManagedAdsCounter++}`;
    const variant = r.metadata?.managed_ads_variant;
    const bucket: ManagedAdsVariantKey =
      typeof variant === "string" && MANAGED_ADS_BUCKETS.has(variant)
        ? (variant as ManagedAdsVariant)
        : "unassigned";

    const rawPlanValue = r.metadata?.plan_value;
    const numericPlanValue = typeof rawPlanValue === "number"
      ? rawPlanValue
      : typeof rawPlanValue === "string"
        ? Number(rawPlanValue)
        : NaN;
    if (
      Number.isFinite(numericPlanValue) &&
      numericPlanValue > 0 &&
      (r.event_type === "managed_ads_plan_selected" ||
        r.event_type === "managed_ads_checkout_started" ||
        r.event_type === "managed_ads_subscribed")
    ) {
      const planKey = String(numericPlanValue);
      let planSets = managedAdsPlanIntentSets.get(planKey);
      if (!planSets) {
        planSets = {
          selected: new Set(),
          checkout_started: new Set(),
          subscribed: new Set(),
        };
        managedAdsPlanIntentSets.set(planKey, planSets);
      }
      if (r.event_type === "managed_ads_plan_selected") planSets.selected.add(pid);
      else if (r.event_type === "managed_ads_checkout_started") planSets.checkout_started.add(pid);
      else planSets.subscribed.add(pid);
    }

    let stage: keyof ManagedAdsFunnel | undefined;
    if (r.event_type === "managed_ads_pitch_viewed") stage = "shown";
    else if (r.event_type === "managed_ads_cta_clicked") stage = "clicked";
    else if (
      r.event_type === "managed_ads_boost_viewed" &&
      (r.metadata?.state === "apply" || r.metadata?.state === "gate")
    ) stage = "viewed";
    else if (r.event_type === "managed_ads_requested") stage = "requested";
    else if (r.event_type === "managed_ads_results_viewed") stage = "results_viewed";
    else if (r.event_type === "managed_ads_plans_viewed") stage = "plans_viewed";
    else if (r.event_type === "managed_ads_plan_selected") stage = "plan_selected";
    else if (r.event_type === "managed_ads_not_now") stage = "not_now";
    else if (r.event_type === "managed_ads_checkout_started") stage = "checkout_started";
    else if (r.event_type === "managed_ads_checkout_created") stage = "checkout_created";
    else if (r.event_type === "managed_ads_checkout_failed") stage = "checkout_failed";
    else if (r.event_type === "managed_ads_subscribed") stage = "subscribed";
    if (!stage) continue;

    managedAdsStageSets[stage].add(pid);
    managedAdsByVariantSets[bucket][stage].add(pid);
  }

  const managedAdsFunnel: ManagedAdsFunnel = {
    shown: managedAdsStageSets.shown.size,
    clicked: managedAdsStageSets.clicked.size,
    viewed: managedAdsStageSets.viewed.size,
    requested: managedAdsStageSets.requested.size,
    results_viewed: managedAdsStageSets.results_viewed.size,
    plans_viewed: managedAdsStageSets.plans_viewed.size,
    plan_selected: managedAdsStageSets.plan_selected.size,
    not_now: managedAdsStageSets.not_now.size,
    checkout_started: managedAdsStageSets.checkout_started.size,
    checkout_created: managedAdsStageSets.checkout_created.size,
    checkout_failed: managedAdsStageSets.checkout_failed.size,
    subscribed: managedAdsStageSets.subscribed.size,
  };
  const managedAdsSizesFor = (b: ManagedAdsVariantKey): ManagedAdsVariantRow => ({
    shown: managedAdsByVariantSets[b].shown.size,
    clicked: managedAdsByVariantSets[b].clicked.size,
    viewed: managedAdsByVariantSets[b].viewed.size,
    requested: managedAdsByVariantSets[b].requested.size,
    results_viewed: managedAdsByVariantSets[b].results_viewed.size,
    plans_viewed: managedAdsByVariantSets[b].plans_viewed.size,
    plan_selected: managedAdsByVariantSets[b].plan_selected.size,
    not_now: managedAdsByVariantSets[b].not_now.size,
    checkout_started: managedAdsByVariantSets[b].checkout_started.size,
    checkout_created: managedAdsByVariantSets[b].checkout_created.size,
    checkout_failed: managedAdsByVariantSets[b].checkout_failed.size,
    subscribed: managedAdsByVariantSets[b].subscribed.size,
  });
  const managedAdsFunnelByVariant: ManagedAdsFunnelByVariant = {
    ...Object.fromEntries(MANAGED_ADS_VARIANTS.map(v => [v, managedAdsSizesFor(v)])),
    unassigned: managedAdsSizesFor("unassigned"),
  } as ManagedAdsFunnelByVariant;
  const managedAdsPlanIntent: ManagedAdsPlanIntent = Object.fromEntries(
    [...managedAdsPlanIntentSets.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([planValue, sets]) => [planValue, {
        selected: sets.selected.size,
        checkout_started: sets.checkout_started.size,
        subscribed: sets.subscribed.size,
      }]),
  );

  const connectionsRaw = (connectionsRes.data ?? []) as Array<{
    id: string;
    from_profile_id: string | null;
    to_profile_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    from_profile: Array<{ display_name: string | null }> | { display_name: string | null } | null;
    to_profile: Array<{ display_name: string | null; slug: string | null; source_provider_id: string | null }> | { display_name: string | null; slug: string | null; source_provider_id: string | null } | null;
  }>;

  // Normalize joined relations — Supabase returns arrays for foreign key joins
  const connections = connectionsRaw.map((c) => ({
    ...c,
    from_profile: Array.isArray(c.from_profile) ? c.from_profile[0] ?? null : c.from_profile,
    to_profile: Array.isArray(c.to_profile) ? c.to_profile[0] ?? null : c.to_profile,
  }));

  // ── Dashboard Banners leaderboard ──
  // Bucket hero impressions/clicks by banner, counting distinct providers per
  // stage (repeat visits by one provider don't inflate the row). All ids are
  // canonicalized so they line up with the conversion join below. We keep
  // per-provider impression TIMESTAMPS (not just a Set) because conversion is
  // attributed last-touch within BANNER_ATTRIBUTION_MS of an impression.
  const bannerImprTimes = new Map<string, Map<string, number[]>>(); // banner -> pid -> impression times
  const bannerClick = new Map<string, Set<string>>();
  for (const r of (bannerRes.data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>) {
    if (!r.provider_id) continue;
    const meta = r.metadata ?? {};
    if (meta.source !== "hero") continue; // hero-only — ignore the other provider_picker_* emitter
    const banner = typeof meta.banner === "string" ? meta.banner : null;
    if (!banner) continue; // pre-instrumentation rows had no banner tag — skip
    const pid = canon(r.provider_id);
    if (r.event_type === "provider_picker_clicked") {
      let set = bannerClick.get(banner);
      if (!set) { set = new Set<string>(); bannerClick.set(banner, set); }
      set.add(pid);
    } else {
      let byPid = bannerImprTimes.get(banner);
      if (!byPid) { byPid = new Map<string, number[]>(); bannerImprTimes.set(banner, byPid); }
      const t = new Date(r.created_at).getTime();
      const arr = byPid.get(pid);
      if (arr) arr.push(t); else byPid.set(pid, [t]);
    }
  }

  // Outcome events for the conversion column, keyed by canonical provider. Edits
  // are kept section-scoped so a completion:<section> banner only credits an edit
  // that touched THAT section.
  const outcomeTimes = new Map<string, Map<string, number[]>>(); // event_type -> pid -> times
  const editTimesBySection = new Map<string, Map<string, number[]>>(); // pid -> section -> times
  for (const r of (bannerConvRes.data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>) {
    if (!r.provider_id) continue;
    const pid = canon(r.provider_id);
    const t = new Date(r.created_at).getTime();
    if (r.event_type === "provider_profile_edited") {
      const section = typeof r.metadata?.section === "string" ? r.metadata.section : null;
      if (!section) continue; // untagged edits can't be matched to a section banner
      let bySection = editTimesBySection.get(pid);
      if (!bySection) { bySection = new Map<string, number[]>(); editTimesBySection.set(pid, bySection); }
      const arr = bySection.get(section);
      if (arr) arr.push(t); else bySection.set(section, [t]);
    } else {
      let byPid = outcomeTimes.get(r.event_type);
      if (!byPid) { byPid = new Map<string, number[]>(); outcomeTimes.set(r.event_type, byPid); }
      const arr = byPid.get(pid);
      if (arr) arr.push(t); else byPid.set(pid, [t]);
    }
  }

  const bannerLeaderboard = [...new Set([...bannerImprTimes.keys(), ...bannerClick.keys()])]
    .map((banner) => {
      const imprMap = bannerImprTimes.get(banner) ?? new Map<string, number[]>();
      const impressions = imprMap.size;
      const clicks = bannerClick.get(banner)?.size ?? 0;
      const conv = bannerConversion(banner);
      let converted: number | null = null;
      let convLabel = "";
      if (conv) {
        convLabel = conv.label;
        let outMap: Map<string, number[]>;
        if (conv.section) {
          // Project the section-scoped edit map down to pid -> times for this section.
          outMap = new Map<string, number[]>();
          for (const [pid, bySection] of editTimesBySection) {
            const arr = bySection.get(conv.section);
            if (arr) outMap.set(pid, arr);
          }
        } else {
          outMap = outcomeTimes.get(conv.event) ?? new Map<string, number[]>();
        }
        converted = countBannerConverted(imprMap, outMap);
      }
      return { banner, impressions, clicks, converted, convLabel };
    })
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  return {
    counts,
    unique_sessions_page_view: uniqueSessions.size,
    provider_distinct_counts: distinct,
    banner_leaderboard: bannerLeaderboard,
    qa_funnel: funnel,
    qa_funnel_by_variant: funnelByVariant,
    qa_email_issues: qaEmailIssues,
    provider_comms_funnel_by_type: commsFunnel,
    benefits_funnel: benefitsFunnel,
    benefits_funnel_by_variant: benefitsFunnelByVariant,
    cta_funnel: ctaFunnel,
    cta_funnel_by_variant: ctaFunnelByVariant,
    managed_ads_funnel: managedAdsFunnel,
    managed_ads_funnel_by_variant: managedAdsFunnelByVariant,
    managed_ads_plan_intent: managedAdsPlanIntent,
    referrer_breakdown: referrerBreakdown,
  };
}

/**
 * Pick the single most notable insight for the natural-language strip at
 * the top of the page. Looks across all metrics for the biggest swing
 * (absolute % change) and surfaces it. If nothing moved >= 25%, returns
 * a quieter "no major shifts" line so the strip never looks broken.
 *
 * Server-side so we can iterate the framing in one place without touching
 * the client.
 */
function pickInsight(
  current: WindowResult,
  prior: WindowResult,
  rangeLabel: string,
): string | null {
  type Candidate = { label: string; cur: number; prev: number; delta: number };
  const candidates: Candidate[] = [
    { label: "page views", cur: current.counts.page_view, prev: prior.counts.page_view, delta: 0 },
    { label: "unique sessions", cur: current.unique_sessions_page_view, prev: prior.unique_sessions_page_view, delta: 0 },
    { label: "card clicks", cur: current.counts.search_click, prev: prior.counts.search_click, delta: 0 },
    { label: "questions", cur: current.counts.question_received, prev: prior.counts.question_received, delta: 0 },
    { label: "leads", cur: current.counts.lead_received, prev: prior.counts.lead_received, delta: 0 },
    { label: "reviews", cur: current.counts.review_received, prev: prior.counts.review_received, delta: 0 },
    { label: "benefits intakes started", cur: current.counts.benefits_started, prev: prior.counts.benefits_started, delta: 0 },
    { label: "benefits intakes finished", cur: current.counts.benefits_completed, prev: prior.counts.benefits_completed, delta: 0 },
    { label: "providers signing in from Q&A", cur: current.provider_distinct_counts.qa_signins, prev: prior.provider_distinct_counts.qa_signins, delta: 0 },
    { label: "providers answering questions", cur: current.provider_distinct_counts.question_answerers, prev: prior.provider_distinct_counts.question_answerers, delta: 0 },
    { label: "providers opening Q&A emails", cur: current.provider_distinct_counts.qa_email_openers, prev: prior.provider_distinct_counts.qa_email_openers, delta: 0 },
  ];
  for (const c of candidates) {
    if (c.prev === 0 && c.cur === 0) {
      c.delta = 0;
    } else if (c.prev === 0) {
      c.delta = Number.POSITIVE_INFINITY;
    } else {
      c.delta = ((c.cur - c.prev) / c.prev) * 100;
    }
  }
  const sorted = candidates
    .filter((c) => c.cur >= 5 || c.prev >= 5) // ignore noisy low-base swings
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = sorted[0];
  if (!top) return null;
  if (Math.abs(top.delta) < 25) {
    return `No major shifts ${rangeLabel.toLowerCase()} — platform looks stable.`;
  }
  const dir = top.delta >= 0 ? "up" : "down";
  const pctRaw = Math.abs(top.delta);
  const pct = Number.isFinite(pctRaw) ? `${Math.round(pctRaw)}%` : "from zero";
  return `${capitalize(top.label)} ${dir} ${pct} ${rangeLabel.toLowerCase()} (${top.cur.toLocaleString()} vs ${top.prev.toLocaleString()} prior).`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * GET /api/admin/analytics/summary
 *
 * Powers everything on /admin/analytics that ISN'T the pulse chart (the
 * chart has its own /views/stats endpoint).
 *
 * Query params:
 *   date_from (ISO, inclusive). Omit for all-time (no lower bound).
 *   date_to   (ISO, exclusive). Omit for "up to now" (no upper bound).
 *   range_label (free text, optional). Used inside the natural-language
 *               insight string for nicer copy ("this week" vs "this period").
 *
 * Returns:
 *   - windowed:    counts + distinct counts for the current window
 *   - prior:       same shape, computed for the equivalent prior window
 *                  (same length, immediately before windowFrom). Powers
 *                  per-tile delta lines on the page. Null when no
 *                  windowFrom (all-time can't have a prior).
 *   - insight:     single-sentence summary highlighting the biggest mover
 *   - botRejects:  today's in-memory bot reject count + UTC date label
 *   - topProviders: top 10 providers by 7-day raw page_views (fixed window —
 *                   this card has its own semantics, not range-bound)
 *   - latestEvents: 50 most recent rows from provider_activity (fixed)
 *
 * NOTE: botRejects is per-Vercel-lambda-instance (in-memory). Numbers will
 * undercount across regions; acceptable for Phase 0 sanity-check.
 */

// ── Provider Activation ─────────────────────────────────────────────────────
// The honest "are providers activating" view, deliberately decoupled from the
// email-click-gated Comms Funnel. Forensic finding (2026-05-16): of every
// profile editor in a 7d window, 100% were notified by us but ~2/3 never had
// a click recorded (Apple MPP / proxies / one-click links / verification
// emails) — so the click-gated funnel structurally undercounts activation
// ~3x. This panel counts the activation events directly (server-side, not
// pixel-dependent), un-gated, on a fixed 30d rolling window independent of the
// page's date picker. It is a count + a named BD feed, NOT an attribution
// funnel. Claims are counted across ALL sources: the legacy page flow emits
// source="page" (now effectively dead), the email flow source="email", and
// the live instant-claim flow source="instant_claim" — the old funnel only
// matched "page", which is why claims read ~0.
type ActivationSignal = "claimed" | "edited" | "answered";
type ActivationFeedRow = {
  provider_id: string; // canonical (olera-providers.slug space)
  provider_name: string | null;
  signal: ActivationSignal;
  section: string | null; // edit section, when signal === "edited"
  when: string; // ISO timestamp
};
// Distinct providers per ISO week, oldest → newest, for the trend sparklines.
type ActivationWeeklyPoint = {
  week_start: string; // ISO date of the week bucket start
  claimed: number;
  profile_edits: number;
  owner_story: number;
  answered: number;
};
type ProviderActivation = {
  window_days: number;
  claimed: number;
  profile_edits: number;
  owner_story: number;
  answered: number;
  prior: { claimed: number; profile_edits: number; owner_story: number; answered: number };
  section_breakdown: Record<string, number>; // section → distinct providers (current window)
  weekly: ActivationWeeklyPoint[]; // trailing 12 ISO weeks, oldest → newest
  feed: ActivationFeedRow[];
  feed_total: number;
};

async function fetchProviderActivation(
  db: ReturnType<typeof getServiceClient>,
): Promise<ProviderActivation | { error: string }> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WINDOW_MS = 30 * DAY_MS;
  const WEEK_MS = 7 * DAY_MS;
  const WEEKS = 12;
  const now = Date.now();
  const since30 = new Date(now - WINDOW_MS).toISOString();
  const since60 = new Date(now - 2 * WINDOW_MS).toISOString();
  const since84 = new Date(now - WEEKS * WEEK_MS).toISOString();

  // One ~12-week scan covers the current (30d) + prior (30–60d) windows AND
  // the weekly trend sparklines. Volume is low (claims/edits/answers only,
  // no page_views), so this stays well under the row cap.
  const { data, error } = await db
    .from("provider_activity")
    .select("provider_id, event_type, metadata, created_at")
    .in("event_type", ["claim_completed", "provider_profile_edited", "question_responded"])
    .gte("created_at", since84)
    .order("created_at", { ascending: false })
    .limit(50000);
  if (error) return { error: "provider activation query failed" };

  const rows = (data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;

  // Canonicalize so one provider isn't split across id formats (bp.slug vs
  // op.slug vs UUID) — same helper the Comms Funnel uses post-#834.
  const rawIds = new Set<string>();
  for (const r of rows) if (r.provider_id) rawIds.add(r.provider_id);
  const canonMap = await resolveCanonicalProviderKeys(db, rawIds);
  const canon = (id: string): string => canonMap.get(id) ?? id;

  const cur = {
    claimed: new Set<string>(),
    edits: new Set<string>(),
    owner: new Set<string>(),
    answered: new Set<string>(),
  };
  const prv = {
    claimed: new Set<string>(),
    edits: new Set<string>(),
    owner: new Set<string>(),
    answered: new Set<string>(),
  };
  const sectionProviders = new Map<string, Set<string>>();
  // weekIdx 0 = oldest of the 12 weeks, WEEKS-1 = most recent. Distinct
  // providers per metric per week for the trend sparklines.
  const weeklySets = Array.from({ length: WEEKS }, () => ({
    claimed: new Set<string>(),
    edits: new Set<string>(),
    owner: new Set<string>(),
    answered: new Set<string>(),
  }));
  const weekIndexOf = (createdAtMs: number): number => {
    const idx = Math.floor((createdAtMs - (now - WEEKS * WEEK_MS)) / WEEK_MS);
    return Math.min(WEEKS - 1, Math.max(0, idx));
  };
  type RawFeed = { pid: string; signal: ActivationSignal; section: string | null; when: string };
  const feedRaw: RawFeed[] = [];

  for (const r of rows) {
    if (!r.provider_id) continue;
    const pid = canon(r.provider_id);
    const createdMs = new Date(r.created_at).getTime();
    const isCurrent = r.created_at >= since30;
    // bucket is current (<30d), prior (30–60d), or null for 60–84d rows —
    // those only feed the 12-week sparkline, never the KPI/delta counts.
    const bucket = isCurrent ? cur : r.created_at >= since60 ? prv : null;
    const wk = weeklySets[weekIndexOf(createdMs)];
    if (r.event_type === "claim_completed") {
      bucket?.claimed.add(pid);
      wk.claimed.add(pid);
      if (isCurrent) feedRaw.push({ pid, signal: "claimed", section: null, when: r.created_at });
    } else if (r.event_type === "provider_profile_edited") {
      bucket?.edits.add(pid);
      wk.edits.add(pid);
      const section =
        typeof r.metadata?.section === "string" ? (r.metadata.section as string) : null;
      if (section === "owner") {
        bucket?.owner.add(pid);
        wk.owner.add(pid);
      }
      if (isCurrent) {
        if (section) {
          if (!sectionProviders.has(section)) sectionProviders.set(section, new Set());
          sectionProviders.get(section)!.add(pid);
        }
        feedRaw.push({ pid, signal: "edited", section, when: r.created_at });
      }
    } else if (r.event_type === "question_responded") {
      bucket?.answered.add(pid);
      wk.answered.add(pid);
      if (isCurrent) feedRaw.push({ pid, signal: "answered", section: null, when: r.created_at });
    }
  }

  // Human-readable names for the feed (olera-providers first, then BP).
  const feedPids = [...new Set(feedRaw.map((f) => f.pid))];
  const nameByPid = new Map<string, string>();
  for (let i = 0; i < feedPids.length; i += 200) {
    const chunk = feedPids.slice(i, i + 200);
    const { data: opn } = await db
      .from("olera-providers")
      .select("slug, provider_name")
      .in("slug", chunk);
    for (const n of (opn ?? []) as Array<{ slug: string | null; provider_name: string | null }>) {
      if (n.slug && n.provider_name) nameByPid.set(n.slug, n.provider_name);
    }
  }
  const stillUnnamed = feedPids.filter((p) => !nameByPid.has(p));
  for (let i = 0; i < stillUnnamed.length; i += 200) {
    const chunk = stillUnnamed.slice(i, i + 200);
    const { data: bpn } = await db
      .from("business_profiles")
      .select("slug, display_name")
      .in("slug", chunk);
    for (const b of (bpn ?? []) as Array<{ slug: string | null; display_name: string | null }>) {
      if (b.slug && b.display_name) nameByPid.set(b.slug, b.display_name);
    }
  }

  feedRaw.sort((a, b) => b.when.localeCompare(a.when));
  const FEED_CAP = 60;
  const feed: ActivationFeedRow[] = feedRaw.slice(0, FEED_CAP).map((f) => ({
    provider_id: f.pid,
    provider_name: nameByPid.get(f.pid) ?? null,
    signal: f.signal,
    section: f.section,
    when: f.when,
  }));

  const section_breakdown: Record<string, number> = {};
  for (const [sec, set] of sectionProviders) section_breakdown[sec] = set.size;

  const weekly: ActivationWeeklyPoint[] = weeklySets.map((wk, i) => ({
    week_start: new Date(now - (WEEKS - i) * WEEK_MS).toISOString().slice(0, 10),
    claimed: wk.claimed.size,
    profile_edits: wk.edits.size,
    owner_story: wk.owner.size,
    answered: wk.answered.size,
  }));

  return {
    window_days: 30,
    claimed: cur.claimed.size,
    profile_edits: cur.edits.size,
    owner_story: cur.owner.size,
    answered: cur.answered.size,
    prior: {
      claimed: prv.claimed.size,
      profile_edits: prv.edits.size,
      owner_story: prv.owner.size,
      answered: prv.answered.size,
    },
    section_breakdown,
    weekly,
    feed,
    feed_total: feedRaw.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const windowFrom = searchParams.get("date_from");
    const windowTo = searchParams.get("date_to");
    const rangeLabel = searchParams.get("range_label") || "this period";

    const db = getServiceClient();

    // Compute the prior window of equal length. Only meaningful when we
    // have a windowFrom (otherwise "prior to all-time" is undefined).
    let priorFrom: string | null = null;
    let priorTo: string | null = null;
    if (windowFrom) {
      const fromMs = new Date(windowFrom).getTime();
      const toMs = windowTo ? new Date(windowTo).getTime() : Date.now();
      const length = toMs - fromMs;
      if (length > 0) {
        priorFrom = new Date(fromMs - length).toISOString();
        priorTo = windowFrom;
      }
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [windowedRes, priorRes, last7dViewsRes, latestRes, activationRes] = await Promise.all([
      fetchWindow(db, windowFrom, windowTo),
      priorFrom ? fetchWindow(db, priorFrom, priorTo) : Promise.resolve(null),
      // Top providers: 7d page_views only, anonymous (session_id present).
      db
        .from("provider_activity")
        .select("provider_id, created_at, metadata")
        .eq("event_type", "page_view")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(50000),
      // Latest rows table — broad fetch, all event types.
      db
        .from("provider_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      // Provider Activation panel — own fixed 30d window, click-gate-free.
      fetchProviderActivation(db),
    ]);

    if ("error" in windowedRes) {
      console.error("[admin/analytics/summary] windowed fetch failed:", windowedRes.error);
      return NextResponse.json({ error: "Failed to load windowed counts" }, { status: 500 });
    }
    if (priorRes && "error" in priorRes) {
      console.error("[admin/analytics/summary] prior fetch failed:", priorRes.error);
      // Non-fatal — page renders without deltas.
    }
    if (last7dViewsRes.error) {
      console.error("[admin/analytics/summary] 7d views query failed:", last7dViewsRes.error);
      return NextResponse.json({ error: "Failed to load top providers" }, { status: 500 });
    }
    if (latestRes.error) {
      console.error("[admin/analytics/summary] latest rows query failed:", latestRes.error);
      return NextResponse.json({ error: "Failed to load latest events" }, { status: 500 });
    }

    if ("error" in activationRes) {
      console.error("[admin/analytics/summary] activation fetch failed:", activationRes.error);
      // Non-fatal — the rest of the page still renders without the panel.
    }
    const activation: ProviderActivation | null =
      activationRes && !("error" in activationRes) ? activationRes : null;

    const prior: WindowResult | null = priorRes && !("error" in priorRes) ? priorRes : null;

    // Top providers by 7d raw page_views (anonymous events only).
    const last7dViews = (last7dViewsRes.data ?? []) as Array<{
      provider_id: string;
      created_at: string;
      metadata: Record<string, unknown> | null;
    }>;
    type ProviderAgg = {
      provider_id: string;
      raw: number;
      sessions: Set<string>;
      lastSeen: string;
    };
    const byProvider = new Map<string, ProviderAgg>();
    for (const r of last7dViews) {
      const sid = r.metadata?.session_id;
      if (typeof sid !== "string" || !sid) continue;
      const pid = String(r.provider_id);
      const entry = byProvider.get(pid) ?? {
        provider_id: pid,
        raw: 0,
        sessions: new Set<string>(),
        lastSeen: r.created_at,
      };
      entry.raw += 1;
      entry.sessions.add(sid);
      if (r.created_at > entry.lastSeen) entry.lastSeen = r.created_at;
      byProvider.set(pid, entry);
    }
    const topProviderIds = [...byProvider.values()]
      .sort((a, b) => b.raw - a.raw)
      .slice(0, 10);

    // Display-name lookup for the top-providers table — slugs alone aren't
    // human-readable. Best-effort; fall back to slug if the lookup fails.
    const slugs = topProviderIds.map((p) => p.provider_id);
    const nameBySlug = new Map<string, string>();
    if (slugs.length > 0) {
      const { data: nameRows } = await db
        .from("olera-providers")
        .select("slug, provider_name")
        .in("slug", slugs);
      if (nameRows) {
        for (const n of nameRows as Array<{ slug: string; provider_name: string | null }>) {
          if (n.slug && n.provider_name) nameBySlug.set(n.slug, n.provider_name);
        }
      }
    }

    const topProviders = topProviderIds.map((p) => ({
      provider_id: p.provider_id,
      provider_name: nameBySlug.get(p.provider_id) ?? null,
      raw_views_7d: p.raw,
      unique_sessions_7d: p.sessions.size,
      last_seen: p.lastSeen,
    }));

    const insight = prior ? pickInsight(windowedRes, prior, rangeLabel) : null;

    const botRejects = getBotRejectsToday();

    return NextResponse.json({
      windowed: {
        range: { from: windowFrom, to: windowTo },
        counts: windowedRes.counts,
        unique_sessions_page_view: windowedRes.unique_sessions_page_view,
        provider_distinct_counts: windowedRes.provider_distinct_counts,
        banner_leaderboard: windowedRes.banner_leaderboard,
        qa_funnel: windowedRes.qa_funnel,
        qa_funnel_by_variant: windowedRes.qa_funnel_by_variant,
        qa_email_issues: windowedRes.qa_email_issues,
        provider_comms_funnel_by_type: windowedRes.provider_comms_funnel_by_type,
        benefits_funnel: windowedRes.benefits_funnel,
        benefits_funnel_by_variant: windowedRes.benefits_funnel_by_variant,
        cta_funnel: windowedRes.cta_funnel,
        cta_funnel_by_variant: windowedRes.cta_funnel_by_variant,
        managed_ads_funnel: windowedRes.managed_ads_funnel,
        managed_ads_funnel_by_variant: windowedRes.managed_ads_funnel_by_variant,
        managed_ads_plan_intent: windowedRes.managed_ads_plan_intent,
        referrer_breakdown: windowedRes.referrer_breakdown,
      },
      prior: prior
        ? {
            counts: prior.counts,
            unique_sessions_page_view: prior.unique_sessions_page_view,
            provider_distinct_counts: prior.provider_distinct_counts,
            qa_funnel: prior.qa_funnel,
            qa_funnel_by_variant: prior.qa_funnel_by_variant,
            qa_email_issues: prior.qa_email_issues,
            provider_comms_funnel_by_type: prior.provider_comms_funnel_by_type,
            benefits_funnel: prior.benefits_funnel,
            benefits_funnel_by_variant: prior.benefits_funnel_by_variant,
            cta_funnel: prior.cta_funnel,
            cta_funnel_by_variant: prior.cta_funnel_by_variant,
            managed_ads_funnel: prior.managed_ads_funnel,
            managed_ads_funnel_by_variant: prior.managed_ads_funnel_by_variant,
            managed_ads_plan_intent: prior.managed_ads_plan_intent,
            referrer_breakdown: prior.referrer_breakdown,
          }
        : null,
      insight,
      botRejects,
      topProviders,
      provider_activation: activation,
      latestEvents: latestRes.data ?? [],
    });
  } catch (err) {
    console.error("[admin/analytics/summary] fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
