/**
 * Provider communications frequency governance.
 *
 * Provider email is sent by ~27 independent senders (crons + inline event sends) with NO global
 * coordination — a single provider could receive 2-9 emails/week, with duplicates, threatening
 * olera.care's sender reputation (already brushed Resend's <4% bounce ceiling once). This caps
 * PROACTIVE NUDGES (digests, reminders, re-engagement) at a small budget per provider per rolling
 * window. TRANSACTIONAL / real-time mail (a family asked a question, a lead came in, verification)
 * is never a governed nudge → always sends and never counts.
 *
 * The cap is enforced inside sendEmail() — the single chokepoint every send flows through — so it
 * cannot be bypassed by any sender. Rollout scope is controlled by NUDGE_EMAIL_TYPES: start with
 * the highest-volume senders and expand deliberately. See plans/provider-comms-gate.md.
 */

/** Max governed-nudge emails per provider per rolling window. Transactional mail is exempt. */
export const NUDGE_WEEKLY_CAP = 3;

/** Rolling window (days) the cap is measured over. */
export const NUDGE_WINDOW_DAYS = 7;

/**
 * email_type values that count as governed nudges. Phase 1 starts with the three highest-volume
 * senders (weekly digest, unread reminders, the lead-followup sequence). Everything else —
 * including all transactional/real-time mail AND any unlisted type — sends freely (safe default:
 * a stray send is a minor annoyance; wrongly suppressing a real notification is not).
 *
 * Full nudge catalog to migrate in later (add one line each, watching volume): provider_nudge,
 * stale_conversation, dormant_reengagement, provider_still_silent, post_connection_followup,
 * matches_nudge, matches_encouragement, provider_incomplete_profile, profile_incomplete_nudge,
 * go_live_reminder, review_request, provider_milestone, provider_anniversary.
 */
export const NUDGE_EMAIL_TYPES = new Set<string>([
  "weekly_analytics_digest",
  "unread_reminder",
  "provider_followup_day1",
  "provider_followup_day3",
  "provider_followup_day6",
  "provider_followup", // Catch-all for any provider followup variants
]);

/** True when this email_type is a governed nudge (subject to the per-provider weekly cap). */
export function isGovernedNudge(emailType: string | undefined | null): boolean {
  return !!emailType && NUDGE_EMAIL_TYPES.has(emailType);
}

/**
 * Family-side communications frequency governance.
 *
 * Care-seeker (family) email is sent by 7 independent crons (outcome-check, provider-silent,
 * never-engaged, day-10-awaiting, family-nudges, matches-family-nudge, lead-family-nudge) plus
 * inline sends, with NO global coordination — the same firehose risk we governed on the provider
 * side. This caps PROACTIVE FAMILY NUDGES per family over a rolling window. TRANSACTIONAL /
 * real-time mail (a provider replied, a question was answered, matches went live, verification,
 * a user-requested benefits report) is never a governed nudge → always sends, never counts.
 *
 * Enforced inside sendEmail() alongside the provider gate. Families have no stable provider_id,
 * so the family cap keys on the recipient email + recipient_type='family'. Safe default: any
 * email_type NOT listed here sends freely (a stray send is a minor annoyance; wrongly suppressing
 * a real notification is not). See plans/family-comms-system.md.
 */

/** Max governed family nudges per family per rolling window (reuses NUDGE_WINDOW_DAYS). */
export const FAMILY_NUDGE_WEEKLY_CAP = 3;

/**
 * Max governed family nudges per family per UTC calendar day. The weekly cap alone lets all 3
 * land on the same day (two engines run 1-3h apart: coordinator 17:00, family-nudges 18:00,
 * plus the dual-audience crons' family branches). One governed email per day is the cadence
 * floor; which engine wins the day is decided by run order (coordinator first).
 */
export const FAMILY_NUDGE_DAILY_CAP = 1;

/**
 * How far back (minutes) a 'pending' email_log reservation still counts toward the family caps.
 * Same-minute crons race the caps: both read the 'sent' count before either send completes, so
 * counting only 'sent' rows lets two concurrent invocations each pass the gate. Recent pending
 * reservations close that window; older pendings are treated as zombies from crashed invocations
 * and ignored so they can never suppress mail forever. The in-flight send's OWN reservation is
 * excluded by id at the check site.
 */
export const PENDING_COUNT_WINDOW_MINUTES = 15;

/**
 * email_type values that count as governed FAMILY nudges (proactive re-engagement). Transactional
 * / real-time family mail is intentionally excluded so it never gets capped:
 *   new_message, question_answered, question_confirmation, question_received, matches_live,
 *   compare_save_welcome, guide_download, guide_save, inline_answer_welcome, welcome,
 *   returning_signin, care_report, checklist, daily_digest, provider_reach_out,
 *   reach_out_confirmation, reach_out_auto_declined, review_request, connection_sent,
 *   connection_request, completion_celebration, verification_*.
 */
export const FAMILY_NUDGE_EMAIL_TYPES = new Set<string>([
  // Help-cascade rungs (connection-triggered)
  "family_outcome_check",
  // The placement check (coordinator rung 0.5). It reaches families the ladder
  // has otherwise stopped on, which is exactly why it has to sit under the same
  // cap as every other family nudge rather than beside it.
  "family_placement_check",
  // Archetype first-touch (intent/urgency self-sort) — the guidance journey's
  // clean opener; family_archetype = the rung, archetype_intro = the one-time
  // campaign to the existing base. Both governed so every cap applies.
  "family_archetype",
  "archetype_intro",
  "paying_for_care",
  // One-time orientation campaign to the existing base (admin-triggered,
  // /api/admin/orientation-campaign) — governed so every cap applies
  "orientation_intro",
  "family_provider_silent",
  "family_never_engaged",
  // Benefits Cascade rungs (coordinator B1/B2): the ten-minute first step and
  // the check-in that's an offer — governed so the per-family cap applies
  "benefits_first_step",
  "benefits_check_in",
  "day_10_awaiting",
  // 7-day outcome check on a researched answer (family-answers cron)
  "family_answer_followup",
  "family_reach_out_nudge",
  "family_nudge",
  // go_live_reminder RETIRED 2026-07-04 (publish-funnel kill, TJ) — historical
  // email_log rows keep the type string; nothing sends it anymore.
  "post_connection_followup",
  // Dual-audience crons' family branch
  "stale_conversation",
  "matches_nudge",
  "provider_still_silent",
  "dormant_reengagement",
  // family-nudges profile-state sequences (the demoted publish/completion funnel)
  "completion_nudge_1",
  "completion_nudge_2",
  "completion_nudge_3",
  "completion_nudge_4",
  "completion_maintenance",
  "publish_nudge_1",
  "publish_nudge_2",
  "publish_nudge_3",
  "publish_nudge_4",
  "publish_maintenance",
  "monthly_recommendations",
  "inactivity_reengagement",
]);

/**
 * Marketplace profile nudges: the "finish / publish your profile" machine and
 * its monthly tails. Written for families shopping for a provider.
 */
export const MARKETPLACE_PROFILE_NUDGE_TYPES = new Set<string>([
  "completion_nudge_1",
  "completion_nudge_2",
  "completion_nudge_3",
  "completion_nudge_4",
  "completion_maintenance",
  "publish_nudge_1",
  "publish_nudge_2",
  "publish_nudge_3",
  "publish_nudge_4",
  "publish_maintenance",
  "monthly_recommendations",
  "inactivity_reengagement",
]);

/** The benefits cascade's family touches (B1 letter, B2 check-in). */
export const BENEFITS_CASCADE_EMAIL_TYPES = new Set<string>(["benefits_first_step", "benefits_check_in"]);

/**
 * Which sends count against the cap for THIS send. A benefits touch is not
 * blocked by marketplace profile nudges: in the 2026-09 audit, ~970 of those
 * went to benefits families and filled the weekly cap ahead of 57 check-ins
 * the families had actually asked for. The benefits touches still count
 * against each other and against every other help-cascade message, and
 * marketplace nudges still count benefits touches, so no family gets more
 * mail overall than the caps allow from any one sender's point of view.
 */
export function capCountedTypesFor(emailType: string | undefined | null): string[] {
  const all = [...FAMILY_NUDGE_EMAIL_TYPES];
  if (emailType && BENEFITS_CASCADE_EMAIL_TYPES.has(emailType)) {
    return all.filter((t) => !MARKETPLACE_PROFILE_NUDGE_TYPES.has(t));
  }
  return all;
}

/**
 * Help, not nudges: the outcome check ("did the provider reach you?") and the
 * provider-silent rescue (other providers near you). Exempt from the WEEKLY
 * family cap, still under the daily one, and still counted against every other
 * family nudge, so they push nudges out rather than the other way round.
 *
 * Why (6 Oct 2026): the rescue was blocked by family_nudge_cap 9 times out of
 * 18 since July, because "finish your profile" reminders had used up each
 * family's three-a-week first (completion_nudge_2: 494 sent, 7 clicks in 30
 * days). A family whose provider never called was getting profile reminders
 * instead of another provider.
 */
export const FAMILY_HELP_EMAIL_TYPES = new Set<string>(["family_outcome_check", "family_provider_silent"]);

export function isFamilyHelpEmail(emailType: string | undefined | null): boolean {
  return !!emailType && FAMILY_HELP_EMAIL_TYPES.has(emailType);
}

/** True when this email_type is a governed FAMILY nudge (subject to the per-family weekly cap). */
export function isGovernedFamilyNudge(emailType: string | undefined | null): boolean {
  return !!emailType && FAMILY_NUDGE_EMAIL_TYPES.has(emailType);
}

/**
 * sendEmail skip reasons that are TRANSIENT — the recipient is fine, only this attempt was
 * blocked (frequency caps), so a caller should NOT advance its sequence state and may retry
 * on a later run. Every other skip reason (do_not_contact, suppressed, preference_disabled)
 * is terminal for the recipient: the send will never succeed, so callers should advance
 * their state exactly as if the email were handled — otherwise they retry daily forever,
 * writing one failed email_log row per recipient per day.
 */
export const TRANSIENT_SKIP_REASONS = new Set<string>(["family_nudge_cap", "family_daily_cap", "nudge_cap"]);

/** True when a sendEmail skip should be retried later instead of advancing sequence state. */
export function isTransientSkip(skipReason: string | undefined | null): boolean {
  return !!skipReason && TRANSIENT_SKIP_REASONS.has(skipReason);
}
