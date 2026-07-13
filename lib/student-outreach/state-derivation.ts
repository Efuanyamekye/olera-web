/**
 * Shared server-side state derivation for student-outreach rows.
 *
 * Walks a row's touchpoints (DESC, newest first) and derives:
 *   - meeting_state: in_flight / scheduled / none
 *   - meeting_at, followup_notes/at/author
 *   - awaiting_callback_at + kind (voicemail / promised)
 *   - last_email_sent_at, last_reply_at, last_activity_at
 *
 * Plus `deriveRepliesState` which collapses the above into one of seven
 * sub-states for the Replies tab and the drawer's Next Step panel.
 *
 * Used by both:
 *   - app/api/admin/student-outreach/queue/route.ts (per-row hydration)
 *   - app/api/admin/student-outreach/[id]/route.ts (drawer loader)
 */

import type {
  AwaitingCallbackKind,
  RepliesState,
} from "@/lib/student-outreach/types";

export const STALE_DAYS = 4;

export interface TouchpointRow {
  outreach_id: string;
  touchpoint_type: string;
  payload: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface DerivedState {
  meeting_state: "none" | "in_flight" | "scheduled";
  meeting_at: string | null;
  followup_notes: string | null;
  followup_author: string | null;
  followup_at: string | null;
  awaiting_callback_at: string | null;
  awaiting_callback_kind: AwaitingCallbackKind | null;
  last_email_sent_at: string | null;
  last_reply_at: string | null;
  last_activity_at: string | null;
}

// ── Post-outreach sequence cutoff ─────────────────────────────────────────
// When a reply to one cadence triggers a NEW cadence (activation today; custom
// sequences later), the reply that triggered it belongs to the finished phase.
// `currentSequenceStartedAt` marks the boundary — replies before it are
// consumed, so the row reads "awaiting reply to the new cadence" everywhere
// (tab, card, drawer), the moment the new cadence launches (not when its first
// email sends). Forward-structured: add a launch reason here and every surface
// picks it up.
export const SEQUENCE_LAUNCH_REASONS = ["activation_launched"] as const;
export const SEQUENCE_STOP_REASONS = ["activation_stopped", "outreach_stopped"] as const;

type ReasonTouchpoint = {
  touchpoint_type: string;
  payload: unknown;
  created_at: string;
};

/** Newest `note_added` timestamp among `launchReasons` that hasn't since been
 *  superseded by one among `stopReasons`, or null. Order-independent. */
function runningSequenceStartedAt(
  touchpoints: ReadonlyArray<ReasonTouchpoint>,
  launchReasons: readonly string[],
  stopReasons: readonly string[],
): string | null {
  const reasonOf = (p: unknown): string | null => {
    if (p && typeof p === "object" && "reason" in p) {
      const r = (p as Record<string, unknown>).reason;
      return typeof r === "string" ? r : null;
    }
    return null;
  };
  const latestFor = (reasons: readonly string[]): string | null => {
    let latest: string | null = null;
    for (const tp of touchpoints) {
      if (tp.touchpoint_type !== "note_added") continue;
      const r = reasonOf(tp.payload);
      if (r != null && reasons.includes(r) && (latest === null || tp.created_at > latest)) {
        latest = tp.created_at;
      }
    }
    return latest;
  };
  const launchedAt = latestFor(launchReasons);
  if (!launchedAt) return null;
  const stoppedAt = latestFor(stopReasons);
  return !stoppedAt || stoppedAt < launchedAt ? launchedAt : null;
}

/**
 * The moment the CURRENT post-outreach sequence started (any launch reason), or
 * null when none is running. The cutoff for "which reply counts."
 */
export function currentSequenceStartedAt(
  touchpoints: ReadonlyArray<ReasonTouchpoint>,
): string | null {
  return runningSequenceStartedAt(touchpoints, SEQUENCE_LAUNCH_REASONS, SEQUENCE_STOP_REASONS);
}

/**
 * Whether the ACTIVATION cadence specifically is running. Stays
 * activation-specific (only the "activation_launched" marker) so that when
 * custom sequences ship, "activation running" doesn't fire for them — the
 * general cutoff above still covers every sequence.
 */
export function activationSequenceRunning(
  touchpoints: ReadonlyArray<ReasonTouchpoint>,
): boolean {
  return runningSequenceStartedAt(touchpoints, ["activation_launched"], SEQUENCE_STOP_REASONS) != null;
}

/**
 * Single source of truth for per-row state derivation. Walks touchpoints
 * DESC and picks the first event in each category. Newer events
 * naturally override older ones.
 *
 * "Resolution" of awaiting-callback: a more-recent (DESC: earlier in
 * scan) email_replied / ig_dm_replied / contact_form_submitted /
 * call_connected without awaiting_callback clears the state.
 */
export function deriveStateFromTouchpoints(touchpoints: TouchpointRow[]): DerivedState {
  // Boundary of the current cadence: a reply from before the newest sequence
  // launch belongs to the finished phase and no longer counts as "the reply."
  const seqStartedAt = currentSequenceStartedAt(touchpoints);

  let meeting_state: DerivedState["meeting_state"] = "none";
  let meeting_at: string | null = null;
  let meetingDecided = false;

  let followup_notes: string | null = null;
  let followup_author: string | null = null;
  let followup_at: string | null = null;

  let awaiting_callback_at: string | null = null;
  let awaiting_callback_kind: AwaitingCallbackKind | null = null;
  let callbackResolved = false;

  let last_email_sent_at: string | null = null;
  let last_reply_at: string | null = null;
  let last_activity_at: string | null = null;

  for (const tp of touchpoints) {
    if (last_activity_at === null) last_activity_at = tp.created_at;

    const reason = (tp.payload?.reason as string | undefined) ?? null;
    const awaitingCallbackFlag = tp.payload?.awaiting_callback === true;

    if (!meetingDecided) {
      if (tp.touchpoint_type === "meeting_scheduled") {
        meeting_state = "scheduled";
        meeting_at = (tp.payload?.meeting_at as string) ?? null;
        meetingDecided = true;
      } else if (tp.touchpoint_type === "note_added" && reason === "meeting_in_flight") {
        meeting_state = "in_flight";
        meetingDecided = true;
      } else if (
        tp.touchpoint_type === "meeting_held" ||
        tp.touchpoint_type === "meeting_no_show" ||
        tp.touchpoint_type === "meeting_rescheduled" ||
        (tp.touchpoint_type === "note_added" && reason === "post_meeting_followup")
      ) {
        meeting_state = "none";
        meetingDecided = true;
      }
    }

    if (
      followup_at === null &&
      tp.touchpoint_type === "note_added" &&
      reason === "post_meeting_followup"
    ) {
      followup_notes = (tp.payload?.notes as string) ?? tp.notes ?? "";
      followup_author = tp.created_by;
      followup_at = tp.created_at;
    }

    const isReply =
      tp.touchpoint_type === "email_replied" ||
      tp.touchpoint_type === "ig_dm_replied" ||
      tp.touchpoint_type === "contact_form_submitted";
    const isConnectedNoCallback =
      tp.touchpoint_type === "call_connected" && !awaitingCallbackFlag;
    // v8.8: removed `note_added{reason:resume_outreach}` resolver — that
    // touchpoint is no longer generated (handleResumeOutreach was dropped
    // along with the manual "Try again" affordance).

    if (
      isReply &&
      last_reply_at === null &&
      (seqStartedAt === null || tp.created_at > seqStartedAt)
    ) {
      last_reply_at = tp.created_at;
    }

    if (!callbackResolved && (isReply || isConnectedNoCallback)) {
      callbackResolved = true;
    }

    if (awaiting_callback_at === null && !callbackResolved) {
      if (tp.touchpoint_type === "call_voicemail") {
        awaiting_callback_at = tp.created_at;
        awaiting_callback_kind = "voicemail";
      } else if (tp.touchpoint_type === "call_connected" && awaitingCallbackFlag) {
        awaiting_callback_at = tp.created_at;
        awaiting_callback_kind = "promised";
      }
    }

    if (last_email_sent_at === null && tp.touchpoint_type === "email_sent") {
      last_email_sent_at = tp.created_at;
    }
  }

  return {
    meeting_state,
    meeting_at,
    followup_notes,
    followup_author,
    followup_at,
    awaiting_callback_at,
    awaiting_callback_kind,
    last_email_sent_at,
    last_reply_at,
    last_activity_at,
  };
}

/**
 * Replies-tab sub-state derivation. Single source of truth — UI
 * renders one of seven cards from this enum. Precedence:
 * needs_followup > booked > wants_meeting > awaiting_callback >
 * stale > engaged > mid_cadence.
 */
export function deriveRepliesState(
  state: DerivedState,
  hasPendingEmailTask: boolean,
): RepliesState {
  if (state.followup_at) return "needs_followup";
  if (state.meeting_state === "scheduled") return "booked";
  if (state.meeting_state === "in_flight") return "wants_meeting";
  if (state.awaiting_callback_at) return "awaiting_callback";

  const lastEmail = state.last_email_sent_at;
  const lastReply = state.last_reply_at;
  const replyAfterEmail =
    lastReply && lastEmail && new Date(lastReply) > new Date(lastEmail);
  if (replyAfterEmail) return "engaged";
  if (lastReply && !lastEmail) return "engaged";

  if (lastEmail && !hasPendingEmailTask) {
    const days = (Date.now() - new Date(lastEmail).getTime()) / 86_400_000;
    if (days >= STALE_DAYS) return "stale";
  }

  return "mid_cadence";
}

/**
 * Compute days-since-last-email when no reply landed after it; otherwise
 * null. Used by the Replies-tab card pill / footnote and by the cron
 * sweep for cadence-end detection.
 */
export function computeStaleDays(
  lastEmailSent: string | null,
  lastReply: string | null,
): number | null {
  if (!lastEmailSent) return null;
  if (lastReply && new Date(lastReply) > new Date(lastEmailSent)) return null;
  const days = Math.floor(
    (Date.now() - new Date(lastEmailSent).getTime()) / 86_400_000,
  );
  return days >= STALE_DAYS ? days : null;
}
