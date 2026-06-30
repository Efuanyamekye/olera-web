/**
 * Care-seeker SMS channel policy — the single source of truth for which family
 * message types may go out as a text, and on what terms.
 *
 * The model (locked 2026-06-30, see Notion "Care-Seeker SMS — Channel Strategy"):
 *   - Email = the proactive editorial layer (options, education, drips).
 *   - SMS  = the reactive nervous system (events the family is waiting on).
 * So we do NOT mirror the email ladder onto SMS. Only the types listed here are
 * SMS-eligible; everything else is email-only by default (the safe default — a
 * stray email is a minor annoyance, an unwanted text is a complaint/TCPA risk).
 *
 * SMS intensity tracks family HEAT: reactive/transactional alerts ride the hot
 * lane (the family initiated the inquiry → wanted + TCPA-defensible as
 * transactional); proactive SMS is opt-in only and counts against the governed
 * cross-channel cap.
 */

export type ChannelPolicy =
  | "email_only" // never SMS (default for unlisted types)
  | "sms_reactive" // transactional alert; SMS-preferred when phone+consent; cap-exempt
  | "sms_proactive"; // proactive nudge; SMS only with explicit opt-in; governed by the cap

interface PolicyEntry {
  policy: ChannelPolicy;
  /**
   * Transactional sends are exempt from the governed nudge cap (the family is
   * waiting on this). A small per-recipient/day throttle still applies in the
   * caller so a reply-storm can't flood. Proactive sends are NOT transactional.
   */
  transactional: boolean;
}

/**
 * SMS-eligible family types. Anything absent is `email_only`.
 *
 * Tier 1 (reactive, transactional) — the first SMS moment. A provider actually
 *   got back to the family. We already text the provider on inquiry; this closes
 *   the asymmetry on the family side.
 * Tier 2 (proactive / sensor) — opt-in, governed. Phase 2.
 */
const SMS_ELIGIBLE: Record<string, PolicyEntry> = {
  // ── Tier 1: reactive reply-alerts (transactional, cap-exempt) ──
  provider_reach_out: { policy: "sms_reactive", transactional: true },
  connection_response: { policy: "sms_reactive", transactional: true },
  new_message_to_family: { policy: "sms_reactive", transactional: true },

  // ── Tier 2: proactive, opt-in, governed (Phase 2 — listed for completeness) ──
  family_outcome_check: { policy: "sms_proactive", transactional: false },
  family_provider_silent: { policy: "sms_proactive", transactional: false },
  family_reach_out_nudge: { policy: "sms_proactive", transactional: false },
};

/** The channel policy for a family message type. Unlisted → email-only. */
export function channelPolicyFor(emailType: string | undefined | null): ChannelPolicy {
  if (!emailType) return "email_only";
  return SMS_ELIGIBLE[emailType]?.policy ?? "email_only";
}

/** True when this type may be delivered via SMS at all. */
export function isSmsEligible(emailType: string | undefined | null): boolean {
  return channelPolicyFor(emailType) !== "email_only";
}

/** True when an SMS of this type is transactional (cap-exempt, hot-lane). */
export function isTransactionalSms(emailType: string | undefined | null): boolean {
  if (!emailType) return false;
  return SMS_ELIGIBLE[emailType]?.transactional ?? false;
}
