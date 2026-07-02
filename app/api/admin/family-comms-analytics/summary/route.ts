import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { FAMILY_NUDGE_EMAIL_TYPES } from "@/lib/email-governance";
import { type ConnectionLike } from "@/lib/connection-temperature";
import { computeFamilyOutcome, tallyFamilyOutcomes, type FamilyOutcome } from "@/lib/family-comms/outcome";

/**
 * Family Comms learn-signals — the first-principles family-engagement +
 * email-observability surface behind /admin/family-comms.
 *
 * The question it answers: how do families move through our funnel, and how is
 * every family email performing (deliver → open → click → convert), so we can
 * iterate on copy/CTAs by data instead of vibes. The compare-led flywheel
 * (project_family_help_cascade) is the spine; the cutover lens is secondary.
 *
 * All metrics read from data we already capture — no new instrumentation:
 *   - email_log               → per-type sent/delivered/opened/clicked/bounced
 *                               (Resend webhooks denormalize first_*_at columns)
 *   - seeker_activity         → conversions: connection_outcome_reported,
 *                               compare_cta_converted, guide_cta_converted,
 *                               benefits_started/completed, profile_published
 *
 * GET-only, admin-guarded, browser-triggerable (the WAF blocks curl).
 * Query: ?date_from=ISO&date_to=ISO  (default: last 30 days).
 */

export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const TREND_WEEKS = 8;

// The cutover anchor — when family-comms-coordinator took over the 6 inquiry
// crons (cron_config flip, no deploy). Used only by the secondary cutover lens.
const CUTOVER_ANCHOR_ISO = "2026-06-24T00:00:00.000Z";

// Conversion events we read out of seeker_activity, in funnel order.
const CONVERSION_EVENTS = [
  "connection_outcome_reported", // outcome-check answered (the sensor)
  "compare_cta_converted", // saved a compared alternative provider
  "guide_cta_converted", // saved a guide
  "benefits_started", // opened the /benefits/finder quiz
  "benefits_completed", // finished the quiz
  "profile_published", // WENT LIVE — the North Star proxy
] as const;

// Human labels for the family email types (fallback = the raw type).
const TYPE_LABELS: Record<string, string> = {
  family_outcome_check: "Outcome check (sensor)",
  family_provider_silent: "Provider silent → compare",
  family_never_engaged: "Never engaged → compare",
  family_provider_silent_guidance: "Provider silent → guidance (thin market)",
  day_10_awaiting: "Awaiting match → how-to-choose",
  family_reach_out_nudge: "Pending reach-out",
  family_nudge: "Stuck → completion value-exchange",
  go_live_reminder: "Go-live reminder",
  post_connection_followup: "Post-connection follow-up",
  stale_conversation: "Stale conversation",
  matches_nudge: "Matches nudge",
  provider_still_silent: "Provider STILL silent (trust recovery)",
  dormant_reengagement: "Dormant re-engagement",
  completion_nudge_1: "Completion nudge 1",
  completion_nudge_2: "Completion nudge 2",
  completion_nudge_3: "Completion nudge 3",
  completion_nudge_4: "Completion nudge 4",
  completion_maintenance: "Completion maintenance",
  publish_nudge_1: "Publish nudge 1",
  publish_nudge_2: "Publish nudge 2",
  publish_nudge_3: "Publish nudge 3",
  publish_nudge_4: "Publish nudge 4",
  publish_maintenance: "Publish maintenance",
  monthly_recommendations: "Monthly recommendations",
  inactivity_reengagement: "Inactivity re-engagement",
};

// The compare-bearing rungs — the ones whose body carries alternative-provider
// cards, so a /provider/ click on them is a "compare click".
const COMPARE_BEARING = new Set([
  "family_provider_silent",
  "family_never_engaged",
  "day_10_awaiting",
]);

// ── Per-family OUTCOME (Phase 0) ─────────────────────────────────────────────
// The outcome distribution is a rolling snapshot of the recent funnel, NOT the
// email date-range: a family that connected two months ago is still connected.
// We classify every family that inquired in this lookback (bounds the query and
// gives a meaningful denominator). Independent of the date picker by design —
// noted in the UI.
const OUTCOME_LOOKBACK_DAYS = 90;
// seeker_activity events that mean the family engaged the GUIDANCE journey
// (compare alternatives / saved a guide / benefits quiz) — the "guided" signal.
const GUIDANCE_EVENTS = [
  "compare_cta_converted",
  "guide_cta_converted",
  "benefits_started",
  "benefits_completed",
] as const;

interface EmailRow {
  email_type: string;
  created_at: string;
  status: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  metadata: Record<string, unknown> | null;
}

// The thin-market Guidance branch reuses the family_never_engaged email TYPE
// (governed, no new type), but is a distinct rung. Split it into its own
// performance row via the coordinator_rung stamped on email_log.metadata, so the
// Guidance send never hides inside the never-engaged compare numbers.
const GUIDANCE_RUNG = "provider_silent_guidance";
const GUIDANCE_PERF_TYPE = "family_provider_silent_guidance";
function effectiveEmailType(r: EmailRow): string {
  if (r.email_type === "family_never_engaged" && r.metadata?.coordinator_rung === GUIDANCE_RUNG) {
    return GUIDANCE_PERF_TYPE;
  }
  return r.email_type;
}

interface ActivityRow {
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function rate(numer: number, denom: number): number {
  return denom > 0 ? numer / denom : 0;
}

/** Index of the trailing 7-day bucket [0..TREND_WEEKS-1] for `ts`, relative to `end`. */
function weekBucket(ts: number, end: number): number {
  const ago = end - ts;
  if (ago < 0) return -1;
  const idx = TREND_WEEKS - 1 - Math.floor(ago / WEEK);
  return idx >= 0 && idx < TREND_WEEKS ? idx : -1;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const now = Date.now();

  // ── Window ────────────────────────────────────────────────────────────
  const dateFrom = request.nextUrl.searchParams.get("date_from");
  const dateTo = request.nextUrl.searchParams.get("date_to");
  const fromMs = dateFrom ? Date.parse(dateFrom) : now - 30 * DAY;
  const toMs = dateTo ? Date.parse(dateTo) : now;
  const fromISO = new Date(fromMs).toISOString();
  const toISO = new Date(toMs).toISOString();

  // Trend needs 8 weeks; fetch from the earlier of (window start, 8 weeks ago).
  const trendEnd = toMs;
  const trendStart = trendEnd - TREND_WEEKS * WEEK;
  const fetchStartMs = Math.min(fromMs, trendStart);
  const familyTypes = Array.from(FAMILY_NUDGE_EMAIL_TYPES);

  // ── email_log (one pass covers both window stats and the trend) ─────────
  // Scope to recipient_type='family'. Some FAMILY_NUDGE_EMAIL_TYPES are also
  // emitted to providers (dormant_reengagement is 100% provider; stale_conversation
  // is a dual-sided nudge sent to BOTH provider and family). Filtering on type
  // alone counted those provider sends as family email, inflating the dashboard
  // and mislabeling provider emails as "best-performing family" copy. The family
  // type-list still narrows the scan; recipient_type makes it honest.
  const { data: emailData, error: emailErr } = await db
    .from("email_log")
    .select(
      "email_type, created_at, status, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at, metadata",
    )
    .in("email_type", familyTypes)
    .eq("recipient_type", "family")
    .gte("created_at", new Date(fetchStartMs).toISOString())
    .lte("created_at", toISO)
    .limit(100000);
  if (emailErr) {
    console.error("[family-comms-analytics] email_log query failed:", emailErr);
    return NextResponse.json({ error: "email_log query failed" }, { status: 500 });
  }
  const emails = (emailData || []) as EmailRow[];

  // ── seeker_activity conversions in the window ───────────────────────────
  const { data: actData, error: actErr } = await db
    .from("seeker_activity")
    .select("event_type, created_at, metadata")
    .in("event_type", CONVERSION_EVENTS as unknown as string[])
    .gte("created_at", new Date(trendStart).toISOString())
    .lte("created_at", toISO)
    .limit(100000);
  if (actErr) {
    console.error("[family-comms-analytics] seeker_activity query failed:", actErr);
    return NextResponse.json({ error: "seeker_activity query failed" }, { status: 500 });
  }
  const acts = (actData || []) as ActivityRow[];

  // ── One-tap intro requests in the window (B2) ───────────────────────────
  // The clearest signal that the curated shortlist drove ACTION: a family tapped
  // "Introduce me" on a compare card, creating a real inquiry. Tagged
  // source=one_tap_intro on the connection_sent activity event (distinct from the
  // normal form-based inquiry). This is the connection-driver metric B2 exists for.
  const { count: introRequestedCount, error: introErr } = await db
    .from("seeker_activity")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "connection_sent")
    .eq("metadata->>source", "one_tap_intro")
    .gte("created_at", fromISO)
    .lte("created_at", toISO);
  if (introErr) console.error("[family-comms-analytics] intro-requested query failed:", introErr);
  const introRequested = introRequestedCount ?? 0;

  // ── Per-type email performance (window) + per-type weekly send trend ────
  type Perf = {
    type: string;
    label: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    weeklySends: number[];
    compareBearing: boolean;
  };
  const perfByType = new Map<string, Perf>();
  const ensure = (t: string): Perf => {
    let p = perfByType.get(t);
    if (!p) {
      p = {
        type: t,
        label: TYPE_LABELS[t] || t,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        weeklySends: new Array(TREND_WEEKS).fill(0),
        compareBearing: COMPARE_BEARING.has(t),
      };
      perfByType.set(t, p);
    }
    return p;
  };

  const totals = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
  let compareSends = 0;
  let compareSendsOpened = 0;
  let compareSendsClicked = 0;

  for (const r of emails) {
    const ts = Date.parse(r.created_at);
    const inWindow = ts >= fromMs && ts <= toMs;
    const effType = effectiveEmailType(r);
    const p = ensure(effType);

    // weekly send trend (independent of the window)
    const wb = weekBucket(ts, trendEnd);
    if (wb >= 0) p.weeklySends[wb] += 1;

    if (!inWindow) continue;
    const failed = r.status === "failed";
    if (failed) continue; // only count real sends

    p.sent += 1;
    totals.sent += 1;
    if (r.delivered_at) { p.delivered += 1; totals.delivered += 1; }
    if (r.first_opened_at) { p.opened += 1; totals.opened += 1; }
    if (r.first_clicked_at) { p.clicked += 1; totals.clicked += 1; }
    if (r.bounced_at) { p.bounced += 1; totals.bounced += 1; }
    if (r.complained_at) { p.complained += 1; totals.complained += 1; }

    if (COMPARE_BEARING.has(effType)) {
      compareSends += 1;
      if (r.first_opened_at) compareSendsOpened += 1;
      if (r.first_clicked_at) compareSendsClicked += 1;
    }
  }

  const emailPerformance = Array.from(perfByType.values())
    .map((p) => ({
      ...p,
      deliveryRate: rate(p.delivered, p.sent),
      openRate: rate(p.opened, p.delivered || p.sent),
      clickRate: rate(p.clicked, p.opened || p.sent),
      bounceRate: rate(p.bounced, p.sent),
    }))
    .filter((p) => p.sent > 0 || p.weeklySends.some((n) => n > 0))
    .sort((a, b) => b.sent - a.sent);

  // ── Conversions (window) from seeker_activity ───────────────────────────
  const inWin = (r: ActivityRow) => {
    const ts = Date.parse(r.created_at);
    return ts >= fromMs && ts <= toMs;
  };
  const winActs = acts.filter(inWin);

  const sensor = { sent: 0, answered: 0, yes: 0, no: 0, notYet: 0, responseRate: 0, yesRate: 0 };
  // outcome-check sends in window = the sensor denominator
  sensor.sent = perfByType.get("family_outcome_check")?.sent ?? 0;
  for (const r of winActs) {
    if (r.event_type !== "connection_outcome_reported") continue;
    sensor.answered += 1;
    const v = (r.metadata?.value as string | undefined) || "";
    if (v === "yes") sensor.yes += 1;
    else if (v === "no") sensor.no += 1;
    else if (v === "not_yet") sensor.notYet += 1;
  }
  sensor.responseRate = rate(sensor.answered, sensor.sent);
  sensor.yesRate = rate(sensor.yes, sensor.answered);

  const count = (ev: string) => winActs.filter((r) => r.event_type === ev).length;
  const conversions = {
    compareSaved: count("compare_cta_converted"),
    guideSaved: count("guide_cta_converted"),
    benefitsStarted: count("benefits_started"),
    benefitsCompleted: count("benefits_completed"),
    published: count("profile_published"),
  };

  // ── Flywheel funnel (family-level, window) ──────────────────────────────
  // Honest framing surfaced in the UI: emailed/opened/clicked are exact per-send
  // email metrics; the later steps are window totals of the action, not strictly
  // attributed to a specific send (no per-family join in v1).
  const funnel = {
    emailed: totals.sent,
    opened: totals.opened,
    clicked: totals.clicked,
    introRequested,
    answered: sensor.answered,
    engaged: conversions.compareSaved + conversions.guideSaved,
    benefitsStarted: conversions.benefitsStarted,
    benefitsCompleted: conversions.benefitsCompleted,
    published: conversions.published,
  };

  // ── Secondary: cutover lens (weekly sends + weekly go-lives, 8 wk) ───────
  const sendsWeekly = new Array(TREND_WEEKS).fill(0);
  for (const r of emails) {
    if (r.status === "failed") continue;
    const wb = weekBucket(Date.parse(r.created_at), trendEnd);
    if (wb >= 0) sendsWeekly[wb] += 1;
  }
  const goLivesWeekly = new Array(TREND_WEEKS).fill(0);
  for (const r of acts) {
    if (r.event_type !== "profile_published") continue;
    const wb = weekBucket(Date.parse(r.created_at), trendEnd);
    if (wb >= 0) goLivesWeekly[wb] += 1;
  }
  const anchorMs = Date.parse(CUTOVER_ANCHOR_ISO);
  const weekStartsISO = new Array(TREND_WEEKS)
    .fill(0)
    .map((_, i) => new Date(trendEnd - (TREND_WEEKS - 1 - i) * WEEK).toISOString());
  const cutoverWeekIndex = weekStartsISO.findIndex((iso) => Date.parse(iso) >= anchorMs);

  // ── Per-family OUTCOME distribution (Phase 0) ───────────────────────────
  // "We measure sends, not outcomes" — the fix. For every family that inquired
  // in the lookback, derive connected / active / guided / stalled from signals
  // we already have (connection threads + self-report + guidance activity).
  const outcomeStartISO = new Date(now - OUTCOME_LOOKBACK_DAYS * DAY).toISOString();
  const outcomes = { total: 0, connected: 0, active: 0, guided: 0, stalled: 0, lookbackDays: OUTCOME_LOOKBACK_DAYS };
  {
    // Inquiry connections drive the population; group by the family (from_profile_id).
    const { data: connData, error: connErr } = await db
      .from("connections")
      .select("id, status, created_at, from_profile_id, to_profile_id, metadata")
      .eq("type", "inquiry")
      .gte("created_at", outcomeStartISO)
      .lte("created_at", toISO)
      .limit(20000);
    if (connErr) {
      // Non-load-bearing: the outcome panel is additive. On failure, leave the
      // distribution empty rather than fail the whole dashboard.
      console.error("[family-comms-analytics] connections query failed (outcome panel off):", connErr);
    } else {
      // Which families engaged the guidance journey in the lookback → the
      // "guided" signal. One narrow read, keyed by family profile_id.
      const guidedFamilies = new Set<string>();
      const { data: guideActs, error: guideErr } = await db
        .from("seeker_activity")
        .select("profile_id")
        .in("event_type", GUIDANCE_EVENTS as unknown as string[])
        .gte("created_at", outcomeStartISO)
        .lte("created_at", toISO)
        .limit(100000);
      if (guideErr) {
        console.error("[family-comms-analytics] guidance-activity query failed (guided undercounted):", guideErr);
      } else {
        for (const r of (guideActs as { profile_id: string | null }[]) || []) {
          if (r.profile_id) guidedFamilies.add(r.profile_id);
        }
      }

      const byFamily = new Map<string, ConnectionLike[]>();
      for (const r of (connData as unknown as ConnectionLike[]) || []) {
        const fid = r.from_profile_id;
        if (!fid) continue;
        const list = byFamily.get(fid);
        if (list) list.push(r);
        else byFamily.set(fid, [r]);
      }

      const perFamily: FamilyOutcome[] = [];
      for (const [familyId, inquiries] of byFamily) {
        perFamily.push(
          computeFamilyOutcome({ inquiries, guidanceEngaged: guidedFamilies.has(familyId) }, now),
        );
      }
      const tally = tallyFamilyOutcomes(perFamily);
      outcomes.total = perFamily.length;
      outcomes.connected = tally.connected;
      outcomes.active = tally.active;
      outcomes.guided = tally.guided;
      outcomes.stalled = tally.stalled;
    }
  }

  return NextResponse.json({
    range: { from: fromISO, to: toISO },
    generatedAt: new Date(now).toISOString(),
    totals,
    compareClick: {
      sends: compareSends,
      opened: compareSendsOpened,
      clicked: compareSendsClicked,
      openRate: rate(compareSendsOpened, compareSends),
      clickRate: rate(compareSendsClicked, compareSendsOpened || compareSends),
    },
    emailPerformance,
    funnel,
    sensor,
    conversions,
    outcomes,
    cutover: {
      anchor: CUTOVER_ANCHOR_ISO,
      cutoverWeekIndex, // which trend bucket the flip falls in (-1 if outside)
      weekStartsISO,
      sendsWeekly,
      goLivesWeekly,
    },
  });
}
