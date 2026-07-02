import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { CRON_REGISTRY, isEmailJob } from "@/lib/crons/registry";

/**
 * GET /api/admin/automations  — powers the /admin/automations cockpit:
 *   - `summary` — top-of-page health line (counts + 30-day deliverability)
 *   - `jobs[]`  — the registry joined with each job's latest run + 30-day run
 *                 count + 30-day email rollup + pause state
 *
 * Open/click come from Resend's pixel + link tracking, inflated by Apple Mail
 * Privacy Protection — absolute numbers soft, trend real. cron_runs / cron_config
 * may be absent (migration 082 not applied) — fail soft.
 *
 * POST /api/admin/automations  { job_id, action: "pause" | "resume", reason?, days? }
 *   Pause (default auto-expiry 30 days) or resume a job. Paused jobs still run on
 *   schedule and log a `skipped_paused` cron_runs row each cycle.
 */

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ERROR_RECENCY_MS = 7 * 24 * 60 * 60 * 1000;

interface RunRow {
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  summary: Record<string, unknown> | null;
  error: string | null;
  triggered_by: string;
}
interface ConfigRow {
  job_id: string;
  enabled: boolean;
  paused_at: string | null;
  paused_by: string | null;
  paused_reason: string | null;
  paused_until: string | null;
}
interface EmailLogRow {
  email_type: string;
  delivered_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}
type Rollup = { sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number };
const emptyRollup = (): Rollup => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 });

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const now = Date.now();

  // ── cron_runs (fail soft) ──
  const runsByJob = new Map<string, { latest: RunRow | null; count: number; errors: number }>();
  try {
    const { data } = await db
      .from("cron_runs")
      .select("job_id, started_at, finished_at, status, summary, error, triggered_by")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(50000);
    for (const r of (data ?? []) as RunRow[]) {
      const b = runsByJob.get(r.job_id) ?? { latest: null, count: 0, errors: 0 };
      if (!b.latest) b.latest = r;
      b.count += 1;
      if (r.status === "error") b.errors += 1;
      runsByJob.set(r.job_id, b);
    }
  } catch {
    /* table absent */
  }

  // ── cron_config (fail soft) ──
  const configByJob = new Map<string, ConfigRow>();
  try {
    const { data } = await db.from("cron_config").select("job_id, enabled, paused_at, paused_by, paused_reason, paused_until");
    for (const c of (data ?? []) as ConfigRow[]) configByJob.set(c.job_id, c);
  } catch {
    /* table absent */
  }

  // ── 30-day email rollup by email_type ──
  const byType = new Map<string, Rollup>();
  try {
    const { data } = await db
      .from("email_log")
      .select("email_type, delivered_at, first_opened_at, first_clicked_at, bounced_at, complained_at")
      .gte("created_at", since)
      .limit(200000);
    for (const e of (data ?? []) as EmailLogRow[]) {
      const t = e.email_type || "unknown";
      const b = byType.get(t) ?? emptyRollup();
      b.sent += 1;
      if (e.delivered_at) b.delivered += 1;
      if (e.first_opened_at) b.opened += 1;
      if (e.first_clicked_at) b.clicked += 1;
      if (e.bounced_at) b.bounced += 1;
      if (e.complained_at) b.complained += 1;
      byType.set(t, b);
    }
  } catch {
    /* email_log unreadable */
  }

  // ── account-wide complaint/bounce EVENTS (30d) ──
  // Numerator for the deliverability rate. Sourced from email_events (one row per
  // real Resend webhook delivery) — NOT email_log.complained_at, which can fan a
  // single complaint across every send to that recipient and overstate the rate.
  // Account-wide on purpose: Resend's AUP thresholds apply to the whole account,
  // not just cron-sent mail. Indexed by (event_type, occurred_at). Fail soft.
  let complaintEvents30d = 0;
  let bounceEvents30d = 0;
  try {
    const { data } = await db
      .from("email_events")
      .select("event_type")
      .in("event_type", ["complained", "bounced"])
      .gte("occurred_at", since)
      .limit(200000);
    for (const e of (data ?? []) as Array<{ event_type: string }>) {
      if (e.event_type === "complained") complaintEvents30d += 1;
      else if (e.event_type === "bounced") bounceEvents30d += 1;
    }
  } catch {
    /* email_events unreadable */
  }

  const jobs = CRON_REGISTRY.map((job) => {
    const runs = runsByJob.get(job.id);
    const cfg = configByJob.get(job.id);
    const pausedActive = !!cfg && cfg.enabled === false && (!cfg.paused_until || new Date(cfg.paused_until).getTime() > now);

    let rollup: Rollup | null = null;
    if (job.emailTypes.length > 0) {
      rollup = emptyRollup();
      for (const t of job.emailTypes) {
        const b = byType.get(t);
        if (!b) continue;
        rollup.sent += b.sent;
        rollup.delivered += b.delivered;
        rollup.opened += b.opened;
        rollup.clicked += b.clicked;
        rollup.bounced += b.bounced;
        rollup.complained += b.complained;
      }
    }

    const lastRun = runs?.latest
      ? { startedAt: runs.latest.started_at, finishedAt: runs.latest.finished_at, status: runs.latest.status, summary: runs.latest.summary, error: runs.latest.error, triggeredBy: runs.latest.triggered_by }
      : null;

    return {
      id: job.id,
      name: job.name,
      description: job.description,
      recipientCohort: job.recipientCohort,
      audience: job.audience,
      fn: job.fn,
      schedule: job.schedule,
      humanSchedule: job.humanSchedule,
      path: job.path,
      emailTypes: job.emailTypes,
      successSignal: job.successSignal ?? null,
      relatedAdminPath: job.relatedAdminPath ?? null,
      isEmail: isEmailJob(job),
      paused: pausedActive,
      pause: pausedActive ? { reason: cfg!.paused_reason, by: cfg!.paused_by, at: cfg!.paused_at, until: cfg!.paused_until } : null,
      lastRun,
      runs30d: runs?.count ?? 0,
      errors30d: runs?.errors ?? 0,
      rollup30d: rollup,
    };
  });

  // ── summary ──
  const cronEmailTypes = new Set(CRON_REGISTRY.flatMap((j) => j.emailTypes));
  let sends30d = 0;
  let bounces30d = 0;
  let complaints30d = 0;
  for (const [t, b] of byType) {
    if (!cronEmailTypes.has(t)) continue;
    sends30d += b.sent;
    bounces30d += b.bounced;
    complaints30d += b.complained;
  }
  const pausedCount = jobs.filter((j) => j.paused).length;
  const erroredCount = jobs.filter((j) => j.lastRun?.status === "error" && now - new Date(j.lastRun.startedAt).getTime() < ERROR_RECENCY_MS).length;

  // Account-wide deliverability rates (30d), computed over ALL email types —
  // Resend judges the whole account, so the cron-only sends30d above would
  // understate it. Numerators are real webhook events (above). Denominators
  // match Resend's own definitions: complaint rate is complaints / delivered
  // (you can only complain about mail you received), bounce rate is bounces /
  // sent (bounced mail is by definition NOT in delivered). The event cohort
  // (email_events.occurred_at) and email_log cohort (created_at) differ slightly
  // at the window edge — fine for a directional health KPI, not billing.
  let deliveredAll30d = 0;
  let sentAll30d = 0;
  for (const b of byType.values()) {
    sentAll30d += b.sent;
    deliveredAll30d += b.delivered;
  }
  const complaintRate30d = deliveredAll30d ? complaintEvents30d / deliveredAll30d : 0;
  const bounceRate30d = sentAll30d ? bounceEvents30d / sentAll30d : 0;

  return NextResponse.json({
    windowDays: 30,
    summary: {
      total: jobs.length,
      paused: pausedCount,
      errored: erroredCount,
      active: jobs.length - pausedCount - erroredCount,
      sends30d,
      bounces30d,
      complaints30d,
      // account-wide deliverability health
      deliveredAll30d,
      sentAll30d,
      complaintEvents30d,
      bounceEvents30d,
      complaintRate30d,
      bounceRate30d,
    },
    jobs,
    note: "Open and click rates come from Resend's tracking pixel and link wrapper, which Apple Mail Privacy Protection inflates (it prefetches the pixel and rewrites links). The absolute numbers are soft; the trend over time is the signal.",
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  let body: { job_id?: string; action?: string; reason?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { job_id, action } = body;
  const job = job_id ? CRON_REGISTRY.find((j) => j.id === job_id) : undefined;
  if (!job_id || !job) {
    return NextResponse.json({ error: "Unknown job_id" }, { status: 400 });
  }
  if (!job.path.startsWith("/api/cron/")) {
    return NextResponse.json({ error: "Only scheduled cron jobs can be paused or resumed" }, { status: 400 });
  }
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
  }

  const db = getServiceClient();
  const nowIso = new Date().toISOString();

  try {
    if (action === "pause") {
      const days = Number.isFinite(body.days) && (body.days as number) > 0 ? Math.min(body.days as number, 365) : 30;
      const pausedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await db.from("cron_config").upsert(
        { job_id, enabled: false, paused_at: nowIso, paused_by: user.email ?? "admin", paused_reason: (body.reason ?? "").slice(0, 500) || null, paused_until: pausedUntil, updated_at: nowIso },
        { onConflict: "job_id" },
      );
      return NextResponse.json({ ok: true, job_id, paused: true, paused_until: pausedUntil });
    }
    await db.from("cron_config").upsert({ job_id, enabled: true, paused_at: null, paused_by: null, paused_reason: null, paused_until: null, updated_at: nowIso }, { onConflict: "job_id" });
    return NextResponse.json({ ok: true, job_id, paused: false });
  } catch (err) {
    console.error("[admin/automations] pause/resume failed:", err);
    return NextResponse.json({ error: "Failed to update — has migration 082 (cron_config) been applied?" }, { status: 500 });
  }
}
