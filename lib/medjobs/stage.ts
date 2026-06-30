/**
 * Stage derivation — the canonical operational state for an outreach row.
 *
 * One outreach row has exactly one Stage at any moment, derived from
 * the row's current data. The Stage drives:
 *   - the stage pill on condensed cards
 *   - the Next Step Card content + CTA inside the drawer
 *   - tab membership predicates (which In Basket tab the row surfaces in)
 *   - sidebar fraction unread counts
 *
 * Stage is NEVER stored — always derived. Single source of truth. Any
 * surface needing the operational state imports `deriveStage` from here.
 *
 * Priority order (first match wins): the highest-priority signal becomes
 * the row's stage. This guarantees a row in multiple states (e.g. has a
 * pending call task AND a meeting scheduled) surfaces the most urgent
 * thing to act on.
 *
 *   1 closed          — terminal negative
 *   2 converted       — terminal positive (Client / Partner)
 *   3 bounce_fix      — outreach broken; admin must repair the contact
 *   4 call_due        — call task is currently due
 *   5 follow_up       — admin-queued custom event is overdue
 *   6 meeting_set     — meeting scheduled, or just held awaiting log
 *   7 in_outreach     — sequence active, no inbound signal (default post-launch)
 *   8 prospect        — pre-launch (default)
 *
 * Note: `reply_pending` is intentionally NOT a stage. Resend captures only
 * outbound events — inbound replies are admin-detected (via their own
 * inbox) and admin-classified. A row "awaiting reply classification"
 * stays in `in_outreach`; the admin's Log action transitions it.
 */

import { isClientMeta } from "@/lib/medjobs/partner-prospect-gate";

export type Stage =
  | "closed"
  | "converted"
  | "bounce_fix"
  | "call_due"
  | "follow_up"
  | "meeting_set"
  | "in_outreach"
  | "prospect";

const CLOSED_STATUSES = new Set<string>([
  "not_interested",
  "no_response_closed",
  "do_not_contact",
  "wrong_contact",
  "redirected",
  "archived",
]);

const OUTREACH_ACTIVE_STATUSES = new Set<string>(["outreach_sent", "engaged"]);

const PARTNER_STATUSES = new Set<string>([
  "active_partner",
  // legacy partner statuses
  "agreed",
  "distributed",
]);

const CALL_TASK_TYPES = new Set<string>(["outreach_followup_call", "outreach_day_0"]);

export interface StageInputTouchpoint {
  touchpoint_type: string;
  created_at: string;
  payload?: Record<string, unknown> | null;
}

export interface StageInputTask {
  task_type: string;
  due_at: string;
  status: string;
  payload?: Record<string, unknown> | null;
}

export interface StageInput {
  outreach: {
    status: string;
    /** kind = 'provider' uses business_profile for client detection. */
    kind?: string | null;
  };
  touchpoints: StageInputTouchpoint[];
  pendingTasks: StageInputTask[];
  /** Required only for provider rows — drives the converted-as-Client
   *  branch. Stakeholder rows ignore this. */
  businessProfile?: { metadata: Record<string, unknown> | null } | null;
  now?: Date;
}

export function deriveStage(input: StageInput): Stage {
  const now = (input.now ?? new Date()).getTime();
  const nowIso = new Date(now).toISOString();

  // 1 · closed — terminal. Status takes precedence over every other signal.
  if (CLOSED_STATUSES.has(input.outreach.status)) return "closed";

  // 2 · converted — terminal positive. Two paths:
  //   - stakeholder rows: status = active_partner (or legacy values)
  //   - provider rows: the underlying business_profile is a Client
  if (PARTNER_STATUSES.has(input.outreach.status)) return "converted";
  if (
    input.outreach.kind === "provider" &&
    input.businessProfile &&
    isClientMeta(input.businessProfile.metadata, now)
  ) {
    return "converted";
  }

  // 3 · bounce_fix — unresolved bounce. A bounce is "unresolved" until a
  //     newer `email_sent` touchpoint exists (admin fixed the address and
  //     re-launched). Otherwise the contact is broken and admin must act.
  const lastBounce = latestTouchpointAt(input.touchpoints, "email_bounced");
  if (lastBounce != null) {
    const lastSend = latestTouchpointAt(input.touchpoints, "email_sent");
    if (lastSend == null || lastSend <= lastBounce) {
      return "bounce_fix";
    }
  }

  // 4 · call_due — pending call task due now or earlier. Day-0 paired
  //     calls and standalone follow-up calls both count.
  for (const t of input.pendingTasks) {
    if (t.status !== "pending") continue;
    if (!CALL_TASK_TYPES.has(t.task_type)) continue;
    if (t.due_at <= nowIso) return "call_due";
  }

  // 5 · follow_up — admin-queued custom event overdue. Only custom events
  //     (manual_followup with reason='custom') count; system-queued
  //     follow-up tasks belong to call_due / cadence.
  for (const t of input.pendingTasks) {
    if (t.status !== "pending") continue;
    if (t.task_type !== "manual_followup") continue;
    if (t.payload?.reason !== "custom") continue;
    if (t.due_at <= nowIso) return "follow_up";
  }

  // 6 · meeting_set — meeting scheduled, or just held without a log.
  //     Logged meetings (post_meeting_followup touchpoint exists after
  //     the most-recent meeting_scheduled) drop out of this stage.
  const lastMeetingScheduled = latestTouchpointAt(input.touchpoints, "meeting_scheduled");
  const lastMeetingHeld = latestTouchpointAt(input.touchpoints, "meeting_held");
  const meetingMostRecent =
    lastMeetingScheduled != null && lastMeetingHeld != null
      ? Math.max(lastMeetingScheduled, lastMeetingHeld)
      : (lastMeetingScheduled ?? lastMeetingHeld);
  if (meetingMostRecent != null) {
    const lastFollowupLog = latestTouchpointAt(input.touchpoints, "post_meeting_followup");
    if (lastFollowupLog == null || lastFollowupLog <= meetingMostRecent) {
      return "meeting_set";
    }
  }

  // 7 · in_outreach — sequence active, no higher-priority signal.
  if (OUTREACH_ACTIVE_STATUSES.has(input.outreach.status)) return "in_outreach";

  // 8 · prospect — default pre-launch.
  return "prospect";
}

function latestTouchpointAt(
  touchpoints: StageInputTouchpoint[],
  type: string,
): number | null {
  let latest: number | null = null;
  for (const tp of touchpoints) {
    if (tp.touchpoint_type !== type) continue;
    const t = new Date(tp.created_at).getTime();
    if (isNaN(t)) continue;
    if (latest == null || t > latest) latest = t;
  }
  return latest;
}

/**
 * Display-friendly labels keyed to Stage. UI cards render these as the
 * stage pill. Tone tokens are recommendations — the consuming component
 * can map them to its own color system.
 */
export const STAGE_DISPLAY: Record<
  Stage,
  { label: string; tone: "emerald" | "amber" | "blue" | "purple" | "red" | "gray" | "green" }
> = {
  prospect: { label: "Prospect", tone: "green" },
  in_outreach: { label: "Outreach", tone: "emerald" },
  call_due: { label: "Call due", tone: "amber" },
  meeting_set: { label: "Meeting", tone: "purple" },
  follow_up: { label: "Follow-up", tone: "amber" },
  bounce_fix: { label: "Bounce — fix", tone: "red" },
  converted: { label: "Converted", tone: "blue" },
  closed: { label: "Closed", tone: "gray" },
};

/**
 * Adapter: derive Stage from a TabRow's pre-computed fields. The queue
 * endpoint already hydrates these (replies_state, meeting_state, due
 * call task, custom task indicator, status) — re-using them avoids a
 * per-row touchpoint refetch on every card render.
 *
 * Mirrors the priority order in deriveStage() above. Note: bounce_fix
 * cannot be derived from TabRow today — TabRow has no field for the
 * latest email_bounced touchpoint. Wiring lands when the Resend
 * webhook starts emitting touchpoints (per the build order). Until
 * then bounce_fix is silently absent for tab cards; the drawer can
 * still detect it via the full touchpoint stream.
 *
 * Imported by StakeholderCard.tsx for the canonical stage pill on
 * every row card across every tab.
 */
export function deriveStageForTabRow(row: {
  status: string;
  kind?: string | null;
  replies_state?: string | null;
  meeting_state?: "none" | "in_flight" | "scheduled" | null;
  has_custom_task?: boolean;
  due_call_task?: { id: string; due_at: string } | null;
}): Stage {
  if (CLOSED_STATUSES.has(row.status)) return "closed";
  if (PARTNER_STATUSES.has(row.status)) return "converted";
  // bounce_fix gap — see docstring above.
  if (row.due_call_task != null) return "call_due";
  if (row.has_custom_task === true) return "follow_up";
  if (row.meeting_state === "in_flight" || row.meeting_state === "scheduled") {
    return "meeting_set";
  }
  if (OUTREACH_ACTIVE_STATUSES.has(row.status)) return "in_outreach";
  return "prospect";
}
