"use client";

/**
 * OutreachTimeline — split-section drawer timeline (v10, Phase 1 Bullet 5).
 *
 * Zone 4 of the unified drawer skeleton. Renders TWO sections:
 *   1. Upcoming      — pending tasks sorted by due_at ASC (soonest first)
 *   2. Past Activity — touchpoints sorted by created_at DESC (newest first)
 *
 * Replaces the v9 single-stream timeline (which used a "── now ──" divider
 * between merged rows). Sections are visually distinct so admin scans
 * "what's next" → "what's happened" without parsing a divider.
 *
 * Data sources:
 *   - touchpoints       (Past Activity: email_sent, call_logged, etc.)
 *   - pending_tasks     (Upcoming: queued emails, calls, custom)
 *
 * Engagement chips (per Phase 1 Pass C spec):
 *   - Each email_sent row in Past Activity renders engagement chips inline
 *   - Chips read from the touchpoint payload (open_count, click_count,
 *     clicked_ctas, last_opened_at) — see Smartlead webhook Bullet 3 for
 *     where these fields are written
 *   - Format: "👁 3 opens" / "🖱 1 click · Review {campus} student caregivers"
 *   - If both counts are 0: no chip line at all (the bare email_sent row)
 *   - Backward compat: falls back to legacy email_engagement[email_log_id]
 *     when the touchpoint payload doesn't carry counts (older rows)
 *
 * Past Activity collapse (long timelines):
 *   - If past events ≤ 5: show all
 *   - If past events > 5: default to last 3 + "Show all past activity ({N} earlier events)"
 *
 * Custom-event footer: "+ Add" form lets admin queue a manual
 * follow-up via the existing queue_manual_task action. Custom events
 * appear inline in the Upcoming section — no separate Task Board zone.
 *
 * Mounted by both Provider and Partner drawers. Stage-agnostic — it
 * doesn't care about Stage; it just renders what's there.
 */

import { useMemo, useState } from "react";
import type { DrawerContext } from "@/lib/student-outreach/types";
import { OUTREACH_DAYS_BY_TYPE, type CadenceKey } from "@/lib/student-outreach/cadence";
import { narrateTouchpoint } from "@/lib/student-outreach/narration";
import { CallFollowUpModal } from "@/components/admin/medjobs/CallFollowUpModal";

type ActionFn = (
  actionName: string,
  payload?: Record<string, unknown>,
) => Promise<DrawerContext>;

interface Props {
  ctx: DrawerContext;
  action: ActionFn;
  setError: (msg: string | null) => void;
}

interface FutureRow {
  kind: "future";
  key: string;
  whenIso: string;
  icon: string;
  title: string;
  subline: string | null;
  /**
   * v9 Phase 9: optional per-task call action. When present, the
   * timeline row renders an inline Log button that opens the shared
   * CallFollowUpModal scoped to this specific task. Other future
   * row types (email queued, custom event) leave this null.
   */
  callTask: {
    taskId: string;
    recipientName: string | null;
    recipientPhone: string | null;
    recipientRole: string | null;
    cadenceDay: number | null;
    script: string | null;
  } | null;
}

interface PastRow {
  kind: "past";
  key: string;
  whenIso: string;
  icon: string;
  title: string;
  subline: string | null;
  /** Show the row's timestamp as an explicit calendar date ("Jul 2, 2026")
   *  rather than the relative "2d ago" form. Set for email sends. */
  explicitDate: boolean;
  /** When the past event is an email_sent, this carries the
   *  email_log_id so the row can render engagement chips (legacy
   *  source — Bullet 5 prefers payload-based engagement). */
  emailLogId: string | null;
  /** v10 Bullet 5: when the past event is an email_sent, the full
   *  touchpoint payload travels with the row so EngagementChips can
   *  read open_count / click_count / clicked_ctas / last_opened_at
   *  directly (primary source, written by Smartlead webhook Bullet 3). */
  emailSentPayload: Record<string, unknown> | null;
  /** Admin who logged the event (relative to the system). */
  admin: string | null;
}

type TimelineRow = FutureRow | PastRow;

export function OutreachTimeline({ ctx, action, setError }: Props) {
  const adminFirstNames = useMemo(
    () => new Map(Object.entries(ctx.admin_first_names ?? {})),
    [ctx.admin_first_names],
  );
  const contactsById = useMemo(
    () => new Map(ctx.contacts.map((c) => [c.id, c])),
    [ctx.contacts],
  );

  // v10 Bullet 5: split into two sections. Past Activity sorts DESC
  // (newest first); Upcoming sorts ASC (soonest due first). Both
  // computed in one useMemo so deps are shared.
  const { futureRows, pastRows } = useMemo(() => {
    const future: FutureRow[] = [];
    const past: PastRow[] = [];

    // The earliest email_sent touchpoint is the initial outreach email; every
    // later one is a cadence follow-up. Rank up front so the loop can label
    // them "Initial outreach email sent" vs "Outreach email sent".
    const initialEmailSentId = ctx.touchpoints
      .filter((t) => t.touchpoint_type === "email_sent")
      .reduce<{ id: string; created_at: string } | null>(
        (earliest, t) =>
          !earliest || t.created_at < earliest.created_at
            ? { id: t.id, created_at: t.created_at }
            : earliest,
        null,
      )?.id ?? null;

    // Past events from touchpoints. narrateTouchpoint handles the
    // copy variants per type; we extract both the legacy email_log_id
    // AND the full payload so EngagementChips can prefer the new
    // per-touchpoint counters when present.
    for (const tp of ctx.touchpoints) {
      const n = narrateTouchpoint(tp, { adminFirstNames, contactsById });
      const isEmailSent = tp.touchpoint_type === "email_sent";
      const payload = (tp.payload as Record<string, unknown> | null) ?? null;
      const emailLogId = isEmailSent
        ? ((payload?.email_log_id as string | undefined) ?? null)
        : null;
      // Outreach emails get a plain, date-stamped label: the very first is the
      // "Initial outreach email sent"; the rest are cadence follow-ups.
      const title = isEmailSent
        ? tp.id === initialEmailSentId
          ? "Initial outreach email sent"
          : "Outreach email sent"
        : n.text;
      past.push({
        kind: "past",
        key: `tp-${tp.id}`,
        whenIso: tp.created_at,
        icon: iconForTouchpoint(tp.touchpoint_type),
        title,
        // n.detail owns the subline now — narration split title vs detail so a
        // free-form note is never rendered twice (it used to land in both).
        subline: n.detail,
        // Email sends show an explicit date ("Jul 2, 2026") instead of the
        // relative "2d ago" stamp used for other history rows.
        explicitDate: isEmailSent,
        emailLogId,
        emailSentPayload: isEmailSent ? payload : null,
        admin: n.admin ?? null,
      });
    }

    // Future events from pending tasks.
    for (const t of ctx.pending_tasks) {
      if (t.status !== "pending") continue;
      const payload = t.payload as Record<string, unknown> | null;
      const day = typeof payload?.day === "number" ? payload.day : null;
      const recipientName =
        typeof payload?.recipient_name === "string"
          ? (payload.recipient_name as string)
          : null;
      const title = futureTitleFor(t.task_type, payload, recipientName);
      const isCallTask = t.task_type === "outreach_followup_call";
      future.push({
        kind: "future",
        key: `task-${t.id}`,
        whenIso: t.due_at,
        icon: iconForTaskType(t.task_type),
        title,
        subline:
          t.task_type === "manual_followup" && payload?.reason === "custom"
            ? (typeof payload.notes === "string" ? payload.notes : null)
            : isCallTask &&
              typeof payload?.recipient_phone === "string" &&
              payload.recipient_phone
              ? `☎ ${payload.recipient_phone}`
              : null,
        callTask: isCallTask
          ? {
              taskId: t.id,
              recipientName,
              recipientPhone:
                typeof payload?.recipient_phone === "string"
                  ? (payload.recipient_phone as string)
                  : null,
              recipientRole:
                typeof payload?.recipient_role === "string"
                  ? (payload.recipient_role as string)
                  : null,
              cadenceDay: day,
              script:
                typeof payload?.script === "string"
                  ? (payload.script as string)
                  : null,
            }
          : null,
      });
    }

    // Smartlead owns the EMAIL drip, so queued emails aren't CRM tasks — only
    // the call days are. Synthesize the upcoming email steps from the active
    // cadence's schedule + enrollment anchor so "Upcoming" reflects the WHOLE
    // cadence (emails + calls), not just calls. Past/overdue steps are omitted
    // (they're already in Past Activity once Smartlead's webhook lands).
    future.push(...syntheticUpcomingEmailRows(ctx));

    // Future ASC (soonest first), past DESC (newest first).
    future.sort((a, b) => a.whenIso.localeCompare(b.whenIso));
    past.sort((a, b) => b.whenIso.localeCompare(a.whenIso));

    return { futureRows: future, pastRows: past };
  }, [ctx, adminFirstNames, contactsById]);

  // v10 Bullet 5: Past Activity collapse. If past has >5 events,
  // default to showing last 3 + "Show all" affordance.
  // Bias toward showing the relationship story: only collapse long histories,
  // and when we do, keep a generous default window before "Show all".
  const PAST_COLLAPSE_THRESHOLD = 8;
  const PAST_COLLAPSE_DEFAULT_SHOW = 5;
  const [showAllPast, setShowAllPast] = useState(false);
  const pastNeedsCollapse = pastRows.length > PAST_COLLAPSE_THRESHOLD;
  const visiblePastRows =
    pastNeedsCollapse && !showAllPast
      ? pastRows.slice(0, PAST_COLLAPSE_DEFAULT_SHOW)
      : pastRows;
  const hiddenPastCount = pastRows.length - visiblePastRows.length;

  // Per-task call logging state. When admin clicks Log on a call task row, we
  // open the shared CallFollowUpModal scoped to that specific task_id so
  // markCurrentCallTaskComplete claims THAT task (not the most-overdue
  // auto-pick). Same flow as the drawer's "Call to follow up" button.
  const [callLogTask, setCallLogTask] = useState<FutureRow["callTask"]>(null);

  const hasAnyActivity = futureRows.length > 0 || pastRows.length > 0;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Timeline
      </h3>

      {!hasAnyActivity && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            No outreach activity yet.
          </p>
        </div>
      )}

      {/* Upcoming section */}
      {futureRows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Upcoming
          </div>
          <ul className="divide-y divide-gray-100">
            {futureRows.map((r) => (
              <TimelineRowView
                key={r.key}
                row={r}
                engagement={null}
                onLogCall={
                  r.callTask ? () => setCallLogTask(r.callTask) : undefined
                }
              />
            ))}
          </ul>
        </div>
      )}

      {/* Past Activity section */}
      {pastRows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Past Activity
          </div>
          <ul className="divide-y divide-gray-100">
            {visiblePastRows.map((r) => (
              <TimelineRowView
                key={r.key}
                row={r}
                engagement={
                  r.emailLogId
                    ? ctx.email_engagement?.[r.emailLogId] ?? null
                    : null
                }
                onLogCall={undefined}
              />
            ))}
          </ul>
          {pastNeedsCollapse && !showAllPast && (
            <button
              onClick={() => setShowAllPast(true)}
              className="w-full border-t border-gray-100 px-4 py-2 text-left text-xs font-medium text-primary-700 hover:bg-gray-50"
            >
              + Show all past activity ({hiddenPastCount} earlier {hiddenPastCount === 1 ? "event" : "events"})
            </button>
          )}
        </div>
      )}

      {callLogTask && (
        <CallFollowUpModal
          ctx={ctx}
          action={action}
          script={callLogTask.script}
          scriptLabel={
            callLogTask.cadenceDay != null
              ? `Day ${callLogTask.cadenceDay} script`
              : "Call script"
          }
          taskId={callLogTask.taskId}
          cadenceDay={callLogTask.cadenceDay}
          onClose={() => setCallLogTask(null)}
          setError={setError}
        />
      )}
    </section>
  );
}

// ── Row renderer ─────────────────────────────────────────────────────────

/** v10 Bullet 5: renamed from TimelineRow (which conflicted with the
 *  type alias) and simplified — sections now provide structure, so the
 *  row renderer no longer needs a "── now ──" divider. */
function TimelineRowView({
  row,
  engagement,
  onLogCall,
}: {
  row: TimelineRow;
  engagement: NonNullable<DrawerContext["email_engagement"]>[string] | null;
  /** Inline Log button for per-task call rows. Optional — only
   *  attached when the row is a future call task. */
  onLogCall?: () => void;
}) {
  // Upcoming rows and email sends read as explicit dates ("Jul 2, 2026"); other
  // past-activity rows keep the compact relative "2d ago" stamp.
  const whenLabel =
    row.kind === "future" || row.explicitDate
      ? formatQueueDate(row.whenIso)
      : formatPast(row.whenIso);
  // Only surface the Log CTA when the task is actually due (due_at <=
  // now). Future-scheduled tasks render as queued items without the
  // button — admin shouldn't act early.
  const isDueNow =
    row.kind === "future" && new Date(row.whenIso).getTime() <= Date.now();
  const isCallTask = row.kind === "future" && row.callTask != null;
  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 text-base leading-5 ${
            row.kind === "future" ? "text-gray-400" : "text-gray-600"
          }`}
          aria-hidden
        >
          {row.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={
              row.kind === "future"
                ? "truncate text-gray-600"
                : "text-gray-800" // past rows wrap so the full descriptive line shows
            }
          >
            {row.title}
          </p>
          {row.subline && (
            <p
              className={`mt-0.5 text-xs italic text-gray-500 ${
                row.kind === "future" ? "truncate" : "whitespace-pre-line"
              }`}
            >
              {row.subline}
            </p>
          )}
          {row.kind === "past" && (
            <EngagementChips
              payload={row.emailSentPayload}
              legacy={engagement}
            />
          )}
        </div>
        <div className="shrink-0 whitespace-nowrap text-xs text-gray-400">
          {row.kind === "past" && row.admin && (
            <span className="mr-2 text-gray-500">{row.admin}</span>
          )}
          <span>{whenLabel}</span>
          {isCallTask && isDueNow && onLogCall && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLogCall();
              }}
              title="Log the outcome of this specific call."
              className="ml-3 rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700"
            >
              Log
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Engagement chips ─────────────────────────────────────────────────────
// v10 Bullet 5: prefers the Smartlead-webhook-written payload counters
// (open_count, click_count, clicked_ctas) — Bullet 3 wires these on every
// email_sent touchpoint. Falls back to the legacy email_engagement[] map
// (delivered_at, first_opened_at, etc.) for older rows that never went
// through the new webhook path.

function EngagementChips({
  payload,
  legacy,
}: {
  /** Primary source: email_sent touchpoint payload (Bullet 3 wires the
   *  fields). Carries counts + last_*_at timestamps + clicked_ctas. */
  payload: Record<string, unknown> | null;
  /** Legacy source: kept for backward compat with email_engagement[]
   *  rows that haven't been touched by the new webhook path. */
  legacy: NonNullable<DrawerContext["email_engagement"]>[string] | null;
}) {
  // Pass C3 spec: derive counts from payload, fall through to legacy bools.
  const openCount = Number(payload?.open_count ?? 0);
  const clickCount = Number(payload?.click_count ?? 0);
  const clickedCtas = (payload?.clicked_ctas as string[] | undefined) ?? [];
  const lastOpenedAt = payload?.last_opened_at as string | undefined;

  const chips: Array<{ label: string; tone: ChipTone }> = [];

  if (openCount > 0) {
    const labelBase = openCount === 1 ? "1 open" : `${openCount} opens`;
    const suffix =
      openCount > 1 && lastOpenedAt ? ` · last ${formatPast(lastOpenedAt)}` : "";
    chips.push({ label: `👁 ${labelBase}${suffix}`, tone: "blue" });
  } else if (legacy?.first_opened_at) {
    chips.push({ label: "👁 opened", tone: "blue" });
  }

  if (clickCount > 0) {
    const labelBase = clickCount === 1 ? "1 click" : `${clickCount} clicks`;
    // Show the first CTA label inline; "+ N others" if multiple distinct CTAs.
    const distinct = Array.from(new Set(clickedCtas)).filter(Boolean);
    let suffix = "";
    if (distinct.length > 0) {
      const first = formatCtaLabel(distinct[0]);
      suffix =
        distinct.length === 1
          ? ` · ${first}`
          : ` · ${first} (+ ${distinct.length - 1} other${distinct.length - 1 === 1 ? "" : "s"})`;
    }
    chips.push({ label: `🖱 ${labelBase}${suffix}`, tone: "blue" });
  } else if (legacy?.first_clicked_at) {
    chips.push({ label: "🖱 clicked", tone: "blue" });
  }

  if (legacy?.delivered_at && openCount === 0 && clickCount === 0 && !legacy.first_opened_at && !legacy.first_clicked_at) {
    chips.push({ label: "✓ delivered", tone: "emerald" });
  }
  if (legacy?.bounced_at) chips.push({ label: "⚠ bounced", tone: "red" });
  if (legacy?.complained_at) chips.push({ label: "⚠ complained", tone: "red" });

  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASSES[c.tone]}`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

type ChipTone = "emerald" | "blue" | "red";

const TONE_CLASSES: Record<ChipTone, string> = {
  emerald: "bg-primary-50 text-primary-700",
  blue: "bg-blue-50 text-blue-700",
  red: "bg-red-50 text-red-700",
};

/** Render a clicked CTA URL as a short human label. Smartlead tracker
 *  URLs (sl.smartlead.ai/...) get collapsed to "the link"; otherwise we
 *  show the human-recognizable last path segment or the host. */
function formatCtaLabel(url: string): string {
  try {
    const u = new URL(url);
    // Smartlead's click-tracking wraps the real destination — without
    // unwinding it we can't tell what was clicked, so just say "the link".
    if (u.hostname.includes("smartlead.ai") || u.hostname.includes("sl.")) {
      return "the link";
    }
    // For olera.care destinations, prefer a path-derived label.
    if (u.hostname.endsWith("olera.care")) {
      if (u.pathname.startsWith("/medjobs/m/")) return "welcome page";
      if (u.pathname.startsWith("/medjobs/candidates")) return "candidate board";
      if (u.pathname.startsWith("/api/medjobs/program-pdf")) return "program PDF";
      return u.pathname.replace(/^\/+/, "").replace(/\/+$/, "") || u.hostname;
    }
    return u.hostname;
  } catch {
    return "the link";
  }
}

// ── Synthetic upcoming Smartlead emails ──────────────────────────────────
//
// The Smartlead campaign sends the EMAIL drip, so queued emails never exist
// as CRM tasks (only the call days do). Without this, a phone-less office in
// an active cadence shows an empty "Upcoming" even though emails are queued.
// We reconstruct the upcoming email steps from the active cadence's schedule
// anchored at its enrollment time. Nominal dates (Smartlead actually sends
// within business hours, so real sends can lag a little); steps whose nominal
// time has passed are omitted — they're sent (in Past Activity) or about to be.

function syntheticUpcomingEmailRows(ctx: DrawerContext): FutureRow[] {
  const rd = ctx.outreach.research_data;
  if (!rd) return [];
  const status = ctx.outreach.status;

  // One cadence is active at a time. Pick it by stage so we never show stale
  // cold emails after activation/welcome takes over.
  let cadenceKey: CadenceKey | null = null;
  let anchorIso: string | null = null;
  if (status === "active_partner" && rd.smartlead_welcome?.enrolled_at) {
    cadenceKey = "partner_welcome";
    anchorIso = rd.smartlead_welcome.enrolled_at;
  } else if (status === "engaged" && rd.smartlead_activation?.enrolled_at) {
    cadenceKey = "activation";
    anchorIso = rd.smartlead_activation.enrolled_at;
  } else if (status === "outreach_sent" && rd.smartlead?.enrolled_at) {
    cadenceKey = ctx.outreach.kind === "provider" ? "provider" : ctx.outreach.stakeholder_type;
    anchorIso = rd.smartlead.enrolled_at;
  }
  if (!cadenceKey || !anchorIso) return [];

  const anchor = new Date(anchorIso).getTime();
  if (Number.isNaN(anchor)) return [];
  const now = Date.now();

  const rows: FutureRow[] = [];
  for (const day of OUTREACH_DAYS_BY_TYPE[cadenceKey]) {
    if (!day.steps.some((s) => s.channel === "email")) continue;
    const dueMs = anchor + day.day * 86_400_000;
    if (dueMs <= now) continue; // already sent / sending → lives in Past Activity
    rows.push({
      kind: "future",
      key: `sl-${cadenceKey}-${day.day}`,
      whenIso: new Date(dueMs).toISOString(),
      icon: "✉",
      title: "Email queued",
      subline: "via Smartlead",
      callTask: null,
    });
  }
  return rows;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function iconForTouchpoint(type: string): string {
  if (type.startsWith("email_")) return "✉";
  if (type.startsWith("call_")) return "☎";
  if (type.startsWith("meeting_")) return "📅";
  if (type === "post_meeting_followup") return "📝";
  if (type === "note_added") return "📝";
  if (type.startsWith("contact_")) return "👤";
  if (type.startsWith("approval_")) return "🔐";
  if (type === "redirect_initiated") return "↗";
  if (type === "stage_change") return "↗";
  if (type === "snoozed") return "💤";
  return "•";
}

function iconForTaskType(type: string): string {
  if (type === "outreach_email_send" || type === "outreach_followup_email")
    return "✉";
  if (type === "outreach_followup_call" || type === "outreach_day_0") return "☎";
  if (type === "manual_followup") return "⭐";
  if (type === "partner_share_update") return "📣";
  if (type === "partner_seasonal_checkin") return "🌱";
  if (type === "yearly_leadership_recheck") return "🔁";
  if (type === "approval_request_followup") return "🔐";
  return "•";
}

function futureTitleFor(
  taskType: string,
  payload: Record<string, unknown> | null,
  recipientName?: string | null,
): string {
  // No "Day N" prefix — the queued date (shown on the row) is the anchor the
  // admin reads, not the cadence day number.
  const recipientSuffix = recipientName ? ` to ${recipientName}` : "";
  switch (taskType) {
    case "outreach_email_send":
      return `Email queued${recipientSuffix}`;
    case "outreach_followup_email":
      return `Follow-up email queued${recipientSuffix}`;
    case "outreach_followup_call":
      return recipientName ? `Call to ${recipientName}` : "Call queued";
    case "outreach_day_0":
      return "Outreach queued";
    case "manual_followup": {
      const summary =
        typeof payload?.notes === "string"
          ? payload.notes
          : typeof payload?.description === "string"
            ? payload.description
            : "Custom event";
      return summary;
    }
    case "partner_share_update":
      return "Share update due";
    case "partner_seasonal_checkin":
      return "Seasonal check-in";
    case "yearly_leadership_recheck":
      return "Yearly leadership recheck";
    case "approval_request_followup":
      return "Approval follow-up";
    default:
      return taskType.replace(/_/g, " ");
  }
}

function formatPast(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Explicit calendar date for queued (future) rows and email sends —
// "Jul 2, 2026". Uses the browser's local day, matching the Calls-tab sections.
function formatQueueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
