import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * v9.0 Phase 7 Commit K: In Basket hero stats.
 *
 * Three KPIs powering the In Basket hero panel:
 *   - queued_unread / queued_read: active items still in queue,
 *     split by unread state. The hero shows the sum + an
 *     unread/read sub-line. Includes student_outreach in active
 *     statuses + pending entity tasks (business_profile_tasks +
 *     site_tasks) so the total reflects all active operational work
 *     across visible/non-smart-hidden tabs.
 *   - logs_today: count of touchpoints + entity-task completions
 *     logged today, plus a per-type breakdown (calls / emails /
 *     meetings / replies / other).
 *   - streak_days: consecutive business days (Mon-Fri) ending
 *     today, where each day hit the daily target (STREAK_TARGET
 *     logs). Weekends are skipped, not streak-breaking. Today only
 *     breaks the streak once it's a past day — an in-progress today
 *     below target doesn't reset it.
 *   - daily_logs: per-business-day log counts over the lookback,
 *     ascending, for the Stats-page streak tracker.
 *
 * Single endpoint — one round-trip serves the whole hero.
 */

const STREAK_LOOKBACK_DAYS = 60;
/** Daily log target — a business day counts toward the streak at or above this. */
const STREAK_TARGET = 50;

const CLOSED_STATUSES = [
  "no_response_closed",
  "not_interested",
  "do_not_contact",
  "wrong_contact",
  "archived",
];

// Touchpoint type → hero breakdown bucket. Anything not mapped falls
// into "other" so the bucket count always sums to logs_today.
const TYPE_BUCKET: Record<string, "calls" | "emails" | "meetings" | "replies"> = {
  call_no_answer: "calls",
  call_voicemail: "calls",
  call_connected: "calls",
  call_wrong_number: "calls",
  email_sent: "emails",
  email_replied: "replies",
  ig_dm_sent: "emails",
  ig_dm_replied: "replies",
  meeting_scheduled: "meetings",
  meeting_held: "meetings",
  meeting_no_show: "meetings",
  meeting_rescheduled: "meetings",
};

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceClient();

  const now = new Date();
  const todayStart = startOfDayUTC(now);
  const lookbackStart = new Date(todayStart.getTime() - STREAK_LOOKBACK_DAYS * 86400_000);

  const [
    { data: touchpointsForStreak },
    { data: bpTaskDates },
    { data: siteTaskDates },
    { data: activeOutreach },
    { count: pendingBpTasks },
    { count: pendingSiteTasks },
  ] = await Promise.all([
    db
      .from("student_outreach_touchpoints")
      .select("touchpoint_type, created_at")
      .gte("created_at", lookbackStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
    db
      .from("business_profile_tasks")
      .select("completed_at")
      .eq("status", "completed")
      .gte("completed_at", lookbackStart.toISOString())
      .limit(5000),
    db
      .from("site_tasks")
      .select("completed_at")
      .eq("status", "completed")
      .gte("completed_at", lookbackStart.toISOString())
      .limit(5000),
    db
      .from("student_outreach")
      .select("viewed_at")
      .not("status", "in", `(${CLOSED_STATUSES.map((s) => `"${s}"`).join(",")})`),
    // Pending entity tasks count toward Queued (read bucket — entity
    // tasks don't have viewed_at; they're always task-driven, not
    // notification-driven).
    db
      .from("business_profile_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    db
      .from("site_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  // Queued: unread vs read split. Stakeholder rows split on viewed_at;
  // entity tasks all roll into the read bucket (no notification model).
  let queuedUnread = 0;
  let queuedRead = 0;
  for (const row of (activeOutreach ?? []) as Array<{ viewed_at: string | null }>) {
    if (row.viewed_at == null) queuedUnread += 1;
    else queuedRead += 1;
  }
  queuedRead += (pendingBpTasks ?? 0) + (pendingSiteTasks ?? 0);

  // Logs today + breakdown. logsByDate holds the per-day log count (not just
  // presence) so the streak can require a daily target and the tracker can
  // chart counts.
  const logsByDate = new Map<string, number>();
  let logsToday = 0;
  const breakdown = { calls: 0, emails: 0, meetings: 0, replies: 0, other: 0 };
  const todayKey = dateKey(todayStart);

  const noteDate = (iso: string | null, bucket?: keyof typeof breakdown) => {
    if (!iso) return;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return;
    const k = dateKey(startOfDayUTC(d));
    logsByDate.set(k, (logsByDate.get(k) ?? 0) + 1);
    if (k === todayKey) {
      logsToday += 1;
      if (bucket) breakdown[bucket] += 1;
    }
  };

  for (const row of (touchpointsForStreak ?? []) as Array<{
    touchpoint_type: string;
    created_at: string;
  }>) {
    const bucket = TYPE_BUCKET[row.touchpoint_type] ?? "other";
    noteDate(row.created_at, bucket);
  }
  for (const row of (bpTaskDates ?? []) as Array<{ completed_at: string | null }>) {
    noteDate(row.completed_at, "other");
  }
  for (const row of (siteTaskDates ?? []) as Array<{ completed_at: string | null }>) {
    noteDate(row.completed_at, "other");
  }

  // Streak: consecutive business days at or above the daily target. An
  // in-progress today below target is skipped (not counted, not breaking).
  const metTarget = (k: string) => (logsByDate.get(k) ?? 0) >= STREAK_TARGET;
  let streakDays = 0;
  let cursor = new Date(todayStart);
  if (!metTarget(todayKey) && !isWeekend(cursor)) {
    cursor = new Date(cursor.getTime() - 86400_000);
  }
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    if (isWeekend(cursor)) {
      cursor = new Date(cursor.getTime() - 86400_000);
      continue;
    }
    if (metTarget(dateKey(cursor))) {
      streakDays += 1;
      cursor = new Date(cursor.getTime() - 86400_000);
    } else {
      break;
    }
  }

  // Per-business-day counts over the lookback (ascending) for the tracker.
  const dailyLogs: { date: string; count: number }[] = [];
  for (
    let d = new Date(lookbackStart);
    d.getTime() <= todayStart.getTime();
    d = new Date(d.getTime() + 86400_000)
  ) {
    if (isWeekend(d)) continue;
    const k = dateKey(d);
    dailyLogs.push({ date: k, count: logsByDate.get(k) ?? 0 });
  }

  return NextResponse.json({
    queued_unread: queuedUnread,
    queued_read: queuedRead,
    logs_today: logsToday,
    logs_today_breakdown: breakdown,
    streak_days: streakDays,
    streak_target: STREAK_TARGET,
    daily_logs: dailyLogs,
  });
}
