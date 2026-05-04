import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getBotRejectsToday } from "@/lib/analytics/bot-filter";

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
// Care-seeker benefits intake funnel. Distinct sessions per stage. Read from
// provider_activity (where session_id + variant are persisted on every event);
// seeker_activity.benefits_completed is unusable here because it carries
// neither field. The save-step's `benefits_step_completed step_name="save"`
// event fires immediately before the save-results POST, so it's the cleaner
// signal for the saved stage anyway.
type BenefitsFunnel = {
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
  outreach: BenefitsVariantRow;    // 4th arm: AI outreach module (H1 demand test)
  control: BenefitsVariantRow;     // legacy V2
  money_loss: BenefitsVariantRow;  // legacy V2
  unassigned: BenefitsVariantRow;
};
type WindowResult = {
  counts: WindowedCounts;
  unique_sessions_page_view: number;
  provider_distinct_counts: DistinctCounts;
  qa_funnel: ProviderQaFunnel;
  qa_funnel_by_variant: ProviderQaFunnelByVariant;
  qa_email_issues: QaEmailIssue[];
  benefits_funnel: BenefitsFunnel;
  benefits_funnel_by_variant: BenefitsFunnelByVariant;
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
const EMPTY_BENEFITS_FUNNEL = (): BenefitsFunnel => ({
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
  outreach: EMPTY_BENEFITS_FUNNEL(),    // 4th arm
  control: EMPTY_BENEFITS_FUNNEL(),     // legacy V2
  money_loss: EMPTY_BENEFITS_FUNNEL(),  // legacy V2
  unassigned: EMPTY_BENEFITS_FUNNEL(),
});

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
    .limit(50000);
  if (from) providerQ = providerQ.gte("created_at", from);
  if (to) providerQ = providerQ.lt("created_at", to);

  let seekerQ = db
    .from("seeker_activity")
    .select("event_type")
    .in("event_type", [...SEEKER_EVENT_TYPES])
    .limit(50000);
  if (from) seekerQ = seekerQ.gte("created_at", from);
  if (to) seekerQ = seekerQ.lt("created_at", to);

  let distinctQ = db
    .from("provider_activity")
    .select("provider_id, event_type, metadata")
    .in("event_type", [...PROVIDER_DISTINCT_EVENT_TYPES])
    .limit(50000);
  if (from) distinctQ = distinctQ.gte("created_at", from);
  if (to) distinctQ = distinctQ.lt("created_at", to);

  // Q&A email openers: distinct providers whose question_received notification
  // was first opened in the window. Anchored on email_log.first_opened_at
  // (denormalized from email_events by the resend-webhook function) so this
  // stays a flat scan, no join.
  let openersQ = db
    .from("email_log")
    .select("provider_id")
    .eq("email_type", "question_received")
    .eq("recipient_type", "provider")
    .not("first_opened_at", "is", null)
    .limit(50000);
  if (from) openersQ = openersQ.gte("first_opened_at", from);
  if (to) openersQ = openersQ.lt("first_opened_at", to);

  // Provider Q&A email funnel (cohort-anchored): every question_received
  // email sent in the window, then count downstream lifecycle on each row.
  // Uses denormalized email_log columns (delivered_at / first_opened_at /
  // first_clicked_at) populated by the resend webhook, so this stays a flat
  // scan with no join. Limit 50000 ≈ 700 days at current ~70 emails/day.
  // Note: bounced/complained counts come from the event-anchored issues
  // query below, not from this cohort, so they stay aligned with the issues
  // list shown to admins.
  let funnelQ = db
    .from("email_log")
    .select("delivered_at, first_opened_at, first_clicked_at, metadata")
    .eq("email_type", "question_received")
    .eq("recipient_type", "provider")
    .limit(50000);
  if (from) funnelQ = funnelQ.gte("created_at", from);
  if (to) funnelQ = funnelQ.lt("created_at", to);

  // Issues: bounce + complaint events in the window. We pull broadly here and
  // restrict to the Q&A cohort via a secondary email_log lookup below — volume
  // is tiny (single-digit per week at current send rate) so client-side join
  // is fine.
  let issuesEventsQ = db
    .from("email_events")
    .select("event_type, bounce_type, bounce_reason, email_log_id")
    .in("event_type", ["bounced", "complained"])
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
    .in("event_type", ["benefits_started", "benefits_step_completed"])
    .limit(50000);
  if (from) benefitsQ = benefitsQ.gte("created_at", from);
  if (to) benefitsQ = benefitsQ.lt("created_at", to);

  // Agent outreach 4th-arm funnel. Different table (seeker_activity) and
  // different shape — no middle steps, just impression → submission. Bucketed
  // into the `outreach` variant row by definition (the events are unique to
  // that arm, no metadata.variant needed).
  let outreachQ = db
    .from("seeker_activity")
    .select("event_type, metadata")
    .in("event_type", ["outreach_module_impression", "outreach_request_submitted"])
    .limit(50000);
  if (from) outreachQ = outreachQ.gte("created_at", from);
  if (to) outreachQ = outreachQ.lt("created_at", to);

  const [providerRes, seekerRes, distinctRes, openersRes, funnelRes, issuesEventsRes, benefitsRes, outreachRes] = await Promise.all([
    providerQ,
    seekerQ,
    distinctQ,
    openersQ,
    funnelQ,
    issuesEventsQ,
    benefitsQ,
    outreachQ,
  ]);

  if (providerRes.error) return { error: "provider window query failed" };
  if (seekerRes.error) return { error: "seeker window query failed" };
  if (distinctRes.error) return { error: "distinct window query failed" };
  if (openersRes.error) return { error: "Q&A email openers query failed" };
  if (funnelRes.error) return { error: "Q&A funnel query failed" };
  if (outreachRes.error) return { error: "outreach funnel query failed" };
  if (issuesEventsRes.error) return { error: "Q&A issues query failed" };
  if (benefitsRes.error) return { error: "benefits funnel query failed" };

  const counts = EMPTY_COUNTS();
  const uniqueSessions = new Set<string>();
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
  };
  for (const r of (distinctRes.data ?? []) as Array<{
    provider_id: string | null;
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const pid = r.provider_id;
    if (!pid) continue;
    if (r.event_type === "one_click_access") {
      const action = r.metadata?.action;
      if (action === "question") sets.qa_signins.add(pid);
      else if (action === "lead") sets.lead_engagers.add(pid);
    } else if (r.event_type === "claim_completed") {
      if (r.metadata?.source === "page") sets.page_claims.add(pid);
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
    | "outreach"     // 4th arm
    | "control"      // legacy V2
    | "money_loss"   // legacy V2
    | "unassigned";
  const emptyStages = (): Record<keyof BenefitsFunnel, Set<string>> => ({
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
    if (r.event_type === "benefits_started") {
      stage = "started";
    } else if (r.event_type === "benefits_step_completed") {
      const stepName = r.metadata?.step_name;
      if (typeof stepName === "string") stage = STEP_TO_STAGE[stepName];
    }
    if (!stage) continue;
    benefitsStageSets[stage].add(sid);
    benefitsByVariantSets[bucket][stage].add(sid);
  }
  // Bucket outreach impressions/submissions by distinct session_id into the
  // "outreach" arm. These events are unique to that arm (no metadata.variant
  // needed — the event_type is the variant).
  for (const r of (outreachRes.data ?? []) as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    const sid = r.metadata?.session_id;
    if (typeof sid !== "string" || !sid) continue;
    const stage: keyof BenefitsFunnel | undefined =
      r.event_type === "outreach_module_impression" ? "started"
      : r.event_type === "outreach_request_submitted" ? "saved"
      : undefined;
    if (!stage) continue;
    benefitsByVariantSets.outreach[stage].add(sid);
  }

  const benefitsFunnel: BenefitsFunnel = {
    started: benefitsStageSets.started.size,
    care_need_completed: benefitsStageSets.care_need_completed.size,
    age_completed: benefitsStageSets.age_completed.size,
    financial_completed: benefitsStageSets.financial_completed.size,
    saved: benefitsStageSets.saved.size,
  };
  const sizesFor = (b: BenefitsBucket): BenefitsVariantRow => ({
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
    control: sizesFor("control"),
    money_loss: sizesFor("money_loss"),
    unassigned: sizesFor("unassigned"),
  };

  return {
    counts,
    unique_sessions_page_view: uniqueSessions.size,
    provider_distinct_counts: distinct,
    qa_funnel: funnel,
    qa_funnel_by_variant: funnelByVariant,
    qa_email_issues: qaEmailIssues,
    benefits_funnel: benefitsFunnel,
    benefits_funnel_by_variant: benefitsFunnelByVariant,
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

    const [windowedRes, priorRes, last7dViewsRes, latestRes] = await Promise.all([
      fetchWindow(db, windowFrom, windowTo),
      priorFrom ? fetchWindow(db, priorFrom, priorTo) : Promise.resolve(null),
      // Top providers: 7d page_views only, anonymous (session_id present).
      db
        .from("provider_activity")
        .select("provider_id, created_at, metadata")
        .eq("event_type", "page_view")
        .gte("created_at", sevenDaysAgo)
        .limit(50000),
      // Latest rows table — broad fetch, all event types.
      db
        .from("provider_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
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
        qa_funnel: windowedRes.qa_funnel,
        qa_funnel_by_variant: windowedRes.qa_funnel_by_variant,
        qa_email_issues: windowedRes.qa_email_issues,
        benefits_funnel: windowedRes.benefits_funnel,
        benefits_funnel_by_variant: windowedRes.benefits_funnel_by_variant,
      },
      prior: prior
        ? {
            counts: prior.counts,
            unique_sessions_page_view: prior.unique_sessions_page_view,
            provider_distinct_counts: prior.provider_distinct_counts,
            qa_funnel: prior.qa_funnel,
            qa_funnel_by_variant: prior.qa_funnel_by_variant,
            qa_email_issues: prior.qa_email_issues,
            benefits_funnel: prior.benefits_funnel,
            benefits_funnel_by_variant: prior.benefits_funnel_by_variant,
          }
        : null,
      insight,
      botRejects,
      topProviders,
      latestEvents: latestRes.data ?? [],
    });
  } catch (err) {
    console.error("[admin/analytics/summary] fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
