/**
 * SMS variant registry — the texting sibling of lib/email-samples.ts. Renders
 * every outbound SMS from the LIVE templates (lib/sms/templates.ts) with
 * canned, PII-free fixtures. Powers the "SMS messages" panel + drawer on
 * /admin/family-comms.
 *
 * Unlike the email registry this is pure strings with no server dependencies,
 * so the admin page imports it directly — no sample API route needed.
 *
 * Constraints: fixtures MUST be deterministic and PII-free (mirror the
 * email-samples cast: Maria / Evergreen Senior Care / Killeen).
 */
import { journeysForCron } from "@/lib/family-comms/journey";
import {
  providerReachOutSms,
  connectionResponseSms,
  newInquirySms,
  pendingInquirySms,
  benefitsResultsSms,
  benefitsFirstStepSms,
  benefitsCheckInSms,
  benefitsApplyCheckSms,
  medjobsApplicationSms,
  verificationCodeSms,
  smsHelpReply,
} from "@/lib/sms/templates";

export interface SmsVariant {
  /** Stable slug. */
  id: string;
  /** Who the text goes to. */
  audience: "family" | "provider";
  /** Display grouping in the panel. */
  group: string;
  label: string;
  /**
   * Underlying email_type written to email_log (channel='sms') — or null when
   * the call site sends without one, meaning the send is NOT in the app log
   * (Twilio still has it; the delivery panel reads Twilio directly).
   */
  emailType: string | null;
  /** Short, glanceable journey position shown beside the live preview. */
  timing?: string;
  /** One-sentence explanation of why this version sends at that moment. */
  situation?: string;
  /** What fires it, in plain terms — most SMS are event-driven, not cron-driven. */
  trigger: string;
  /** Automations-registry id that owns this text (for the per-job preview), mirroring EmailVariant.cron. */
  cron?: string;
  /** Additional registry ids that also send this exact text (mirrors
   *  EmailVariant.alsoCrons) — their detail pages preview it too. */
  alsoCrons?: string[];
  /** Who receives this — the eligibility, in plain terms. */
  who?: string;
  /** Why we send it — the intent behind the copy. */
  why?: string;
  /** Gates the send path applies before the text goes out (shown in the drawer). */
  gates?: string[];
  /** Renders the LIVE template with sample fixtures → the exact body text. */
  render: () => string;
}

/** Approximate GSM-7 charset: printable ASCII + newline + the common accented set
 *  (our bodies are plain ASCII in practice — this only needs to catch emoji/smart
 *  quotes sneaking in and flipping the whole message to 70-char UCS-2 segments). */
const GSM7 = /^[ -~\n\r€£¥èéùìòÇØøÅåÆæßÉÄÖÑÜäöñüà]*$/;

/** Character / segment / encoding math for a body — how carriers will bill it. */
export function smsSegmentInfo(body: string): { chars: number; segments: number; encoding: "GSM-7" | "UCS-2" } {
  const gsm = GSM7.test(body);
  const chars = body.length;
  const perSegment = gsm ? (chars <= 160 ? 160 : 153) : chars <= 70 ? 70 : 67;
  return { chars, segments: Math.max(1, Math.ceil(chars / perSegment)), encoding: gsm ? "GSM-7" : "UCS-2" };
}

const REACTIVE_GATES = [
  "Quiet hours: outside 8am–8pm recipient-local, the text queues (sms_queue) and delivers at the next window open",
  "Daily safety cap: max 6 reactive texts to one number per day",
  "Hard-blocked if the family texted STOP (phone_validity = opted_out)",
  "Skipped silently when the profile has no usable US phone",
];

export const SMS_VARIANTS: SmsVariant[] = [
  // ─────────────── Family · Reply alerts (Tier 1 reactive) ───────────────
  {
    id: "sms_provider_reach_out",
    cron: "family-reply-alert-texts",
    audience: "family",
    group: "Family · Reply alerts",
    label: "Provider reached out",
    emailType: "provider_reach_out",
    trigger: "A provider sends a reach-out message to a family's care request (matches flow)",
    who: "The family, the moment a provider reaches out about their care needs. Transactional — the family initiated the search, so no express opt-in is required and it's exempt from the governed nudge cap.",
    why: "SMS is the reactive nervous system: this is the exact event the family is waiting on, and a text reaches them hours before an unopened email. The link is the stable inbox URL (guest-token aware), never a 1-hour magic link, because a quiet-hours-queued text can land the next morning.",
    gates: REACTIVE_GATES,
    render: () =>
      providerReachOutSms({
        providerName: "Evergreen Senior Care",
        providerCity: "Killeen",
        url: "https://olera.care/portal/inbox?id=sample",
      }),
  },
  {
    id: "sms_connection_response",
    cron: "family-reply-alert-texts",
    audience: "family",
    group: "Family · Reply alerts",
    label: "Provider responded to inquiry",
    emailType: "connection_response",
    trigger: "A provider ACCEPTS the family's inquiry (accept-only — a decline stays email-only)",
    who: "A family whose own inquiry just got a provider response. Same Tier-1 transactional lane as the reach-out alert.",
    why: "Closes the asymmetry: we already text providers on new inquiries, so the family should hear just as fast when the provider gets back to them. Accept-only because a decline is a poor first text.",
    gates: REACTIVE_GATES,
    render: () =>
      connectionResponseSms({
        providerName: "Evergreen Senior Care",
        url: "https://olera.care/portal/inbox?id=sample",
      }),
  },

  // ─────────────── Provider · New lead alerts ───────────────
  {
    id: "sms_new_inquiry",
    cron: "provider-lead-alert-texts",
    audience: "provider",
    group: "Provider · Lead alerts",
    label: "New care inquiry",
    emailType: null,
    trigger: "A family submits a connection request to the provider (guest and signed-in paths)",
    who: "The provider on the receiving end of a fresh family inquiry, at their business_profiles phone (falling back to the directory-scraped olera-providers number).",
    why: "Speed-to-lead: an inquiry answered within minutes converts at a different rate than one answered the next day. Respects the provider's new_leads notification preference.",
    gates: [
      "Respects the provider's new_leads notification preference",
      "Skipped when no phone can be found or normalized",
      "Directory-scraped fallback numbers are often landlines — the delivery panel's 'bad number' bucket is mostly these",
    ],
    render: () =>
      newInquirySms({ familyName: "Maria", url: "https://olera.care/provider/connections" }),
  },
  {
    id: "sms_pending_inquiry",
    cron: "provider-lead-alert-texts",
    audience: "provider",
    group: "Provider · Lead alerts",
    label: "Pending inquiry delivered",
    emailType: null,
    trigger: "A held/pending connection is released to the recipient's inbox (deliver-pending-connections)",
    who: "The recipient of a connection that was created while undeliverable (e.g. unclaimed profile) and has now been released.",
    why: "The inquiry is only now actionable for them, so the alert fires at release time, not creation time.",
    gates: ["Respects the recipient's new_leads notification preference", "Skipped when no phone normalizes"],
    render: () => pendingInquirySms({ fromName: "Maria G", url: "https://olera.care/portal/inbox" }),
  },
  {
    id: "sms_medjobs_application",
    cron: "provider-lead-alert-texts",
    audience: "provider",
    group: "Provider · Lead alerts",
    label: "New MedJobs application",
    emailType: null,
    trigger: "A student applies to the provider through MedJobs",
    who: "A provider with an open MedJobs presence, when a student submits an application.",
    why: "Applications go stale fast — the text links straight to the candidate profile so the provider can respond while the student is still looking.",
    render: () =>
      medjobsApplicationSms({
        studentName: "Jordan Lee",
        university: "Texas A&M University",
        url: "https://olera.care/medjobs/candidates/jordan-lee",
      }),
  },

  // ─────────────── Family · Benefits results ───────────────
  {
    id: "sms_benefits_match",
    cron: "benefits-results-texts",
    audience: "family",
    group: "Family · Benefits results",
    label: "Benefits results — matches found",
    emailType: "benefits_results_sms",
    timing: "Day 0 · immediately after intake",
    situation: "Sent when the quiz finds at least one match and the family supplied a phone. It delivers the private Olera plan while their request is still fresh.",
    trigger: "A new family completes the benefits quiz with ≥1 program match and supplies a phone under the SMS disclosure",
    who: "A new family who finished the benefits quiz, matched at least one program, and gave a phone number (phone-as-optional V3 flow).",
    why: "The care team leads with a bounded human question while keeping the plan available for families who prefer to self-serve. It says the team replies within 2 business days when the family responds and carries Reply STOP because this is the first text.",
    render: () =>
      benefitsResultsSms({ matchCount: 4, url: "https://olera.care/m/sample" }),
  },
  {
    id: "sms_benefits_saved",
    cron: "benefits-results-texts",
    audience: "family",
    group: "Family · Benefits results",
    label: "Benefits results — no strong match yet",
    emailType: "benefits_results_sms",
    timing: "Day 0 · immediately after intake",
    situation: "The zero-match version of the same receipt. It confirms Olera created the family's private plan and will keep checking instead of leaving them with silence.",
    trigger: "Benefits quiz completed with zero program matches and a phone provided",
    who: "Same moment as the match text, for families whose answers matched no program yet.",
    why: "An honest zero-state: Olera created a private plan and will keep checking, rather than leading with the awkward claim that a search was 'saved.'",
    render: () =>
      benefitsResultsSms({ matchCount: 0, url: "https://olera.care/m/sample" }),
  },

  // ─────────────── Family · Benefits cascade (coordinator B1/B2 mirrors) ───────────────
  {
    id: "sms_benefits_first_step",
    cron: "family-comms-coordinator",
    // The hourly scheduler fires TJ-scheduled letters through the same send
    // path, so its detail page previews this companion text too.
    alsoCrons: ["benefits-navigator-scheduler"],
    audience: "family",
    group: "Family · Benefits cascade",
    label: "First step — navigator text (fallback sample)",
    emailType: "benefits_first_step_sms",
    timing: "B1 · after the care team approves the first step",
    situation: "Usually drafted 2–10 days after intake, then sent only when the care team approves it or at the scheduled hour. It accompanies email or becomes the primary delivery for a text-only family.",
    trigger: "The care team approves and sends (or schedules) a navigator draft and the family has stored sms_consent. It accompanies email when available and becomes the primary B1 delivery for text-only families.",
    who: "A benefits-intake family who supplied a phone under the SMS disclosure during intake or a later benefits phone-capture step.",
    why: "The reviewed first step in the channel families actually open. It always carries the program's phone number: a per-family draft is used only when it includes that number, otherwise this template is sent.",
    gates: [
      "Requires stored phone + explicit sms_consent (10DLC posture) — never phone presence alone",
      "Skipped when phone_validity = opted_out (family texted STOP)",
      "Sends after the care team approves it, or automatically at the next hourly run once its verdict routes `auto` (fresh letters only)",
      "Can be the primary delivery when no email exists; otherwise it accompanies the governed email touch",
    ],
    render: () =>
      benefitsFirstStepSms({
        programShortName: "LIHEAP",
        phone: "1-877-555-0142",
        url: "https://olera.care/m/sample",
      }),
  },
  {
    id: "sms_benefits_check_in",
    cron: "family-comms-coordinator",
    audience: "family",
    group: "Family · Benefits cascade",
    label: "Check-in (B1 +3–14d) — action request",
    emailType: "benefits_check_in_sms",
    timing: "B2 · 3–14 days after B1 is delivered",
    situation: "Sent once when the family has not reported an outcome. It asks whether they called and lets their reply update the same living plan.",
    trigger: "The coordinator's B2 rung fires 3–14 days after the first step and the family is text-reachable; it accompanies email when available or stands alone for text-only families",
    who: "The same consent-gated audience as B1, three to fourteen days after the first step was actually delivered.",
    why: "The family can answer in the thread with CALLED, NO ANSWER, or STUCK. Olera immediately acknowledges the reply and writes it to the living plan; the link remains as a second path.",
    gates: [
      "Requires stored phone + explicit sms_consent (10DLC posture)",
      "Skipped when phone_validity = opted_out",
      "Sends with the B2 email when available, or by itself for a text-only family",
    ],
    render: () =>
      benefitsCheckInSms({ programShortName: "LIHEAP", url: "https://olera.care/m/sample", done: false }),
  },
  {
    id: "sms_benefits_apply_check",
    cron: "family-comms-coordinator",
    audience: "family",
    group: "Family · Benefits cascade",
    label: "Apply-along check-in — has a letter come?",
    emailType: "benefits_apply_check_sms",
    timing: "B3 · about a week after the family sent the Extra Help form",
    situation: "The family told us they sent Social Security's Extra Help form through the apply-along, which also starts the state's Medicare Savings application.",
    trigger: "The coordinator's B3 rung, 7–21 days after benefits_cascade.applied.at, once",
    who: "Consent-gated benefits families who applied through the apply-along and haven't told us a decision.",
    why: "Social Security usually decides within a few weeks. The reply words (WAITING, APPROVED, DENIED, STUCK) update the living plan, and STUCK reaches a person.",
    gates: [
      "Requires stored phone + explicit sms_consent (10DLC posture)",
      "Skipped once the family reported APPROVED, DENIED or STUCK",
      "A second check (about five weeks) asks what was decided",
    ],
    render: () => benefitsApplyCheckSms({ stage: "letter", url: "https://olera.care/m/sample" }),
  },
  {
    id: "sms_benefits_check_in_done",
    cron: "family-comms-coordinator",
    audience: "family",
    group: "Family · Benefits cascade",
    label: "Check-in — already made the call (retargeted)",
    emailType: "benefits_check_in_sms",
    timing: "B2 · 3–14 days after B1, call already recorded",
    situation: "Used when the family already marked the call complete. Instead of asking again, Olera asks for the real next state: applied, needs documents, waiting, or stuck.",
    trigger: "B2 fires for a family who already tapped \"I made the call\" on their /m plan — congratulate instead of asking",
    who: "The consent-gated B2 audience whose benefits_cascade.first_step_done_at is set.",
    why: "Asking whether they called after they already told us they did reads as not listening. This branch asks for the real next status: APPLIED, NEED DOCS, WAITING, or STUCK.",
    gates: [
      "Requires stored phone + explicit sms_consent (10DLC posture)",
      "Skipped when phone_validity = opted_out",
      "Sends with the retargeted B2 email when available, or by itself for a text-only family",
    ],
    render: () =>
      benefitsCheckInSms({ programShortName: "LIHEAP", url: "https://olera.care/m/sample", done: true }),
  },

  // ─────────────── Transactional & auto-replies ───────────────
  {
    id: "sms_claim_code",
    cron: "transactional-texts",
    audience: "provider",
    group: "Transactional & auto-replies",
    label: "Claim verification code",
    emailType: null,
    trigger: "A provider claiming their listing chooses SMS verification",
    who: "A provider mid-claim who picked 'text me a code' over email.",
    why: "Proves control of the listing's phone number. Pure transactional; expires in 10 minutes.",
    render: () => verificationCodeSms("482916"),
  },
  {
    id: "sms_help_reply",
    cron: "transactional-texts",
    audience: "family",
    group: "Transactional & auto-replies",
    label: "HELP auto-reply",
    emailType: null,
    trigger: "Anyone texts HELP or INFO to our number (Twilio webhook, TwiML reply)",
    who: "Any inbound sender — TCPA requires a HELP response describing the program and the STOP path.",
    why: "Compliance keyword handling; the copy here is also what carriers and 10DLC reviewers see as our help message.",
    render: () => smsHelpReply(),
  },
];

/** Some automations deliver texts owned by another entry (the queue flush drains
 *  the reply alerts) — alias them so their detail page previews the same bodies. */
const SMS_CRON_ALIASES: Record<string, string> = {
  "sms-queue-flush": "family-reply-alert-texts",
};

/** Texts sent by a given automations-registry id (for the per-job preview). */
export function smsVariantsForCron(cronId: string): SmsVariant[] {
  const target = SMS_CRON_ALIASES[cronId] ?? cronId;
  return SMS_VARIANTS.filter((v) => v.cron === target || v.alsoCrons?.includes(target));
}

/** Label for an sms email_type (for per-type breakdown rows). */
export function smsLabelForType(smsType: string): string | null {
  return SMS_VARIANTS.find((v) => v.emailType === smsType)?.label ?? null;
}

/**
 * ALL texts a page's journeys touch, in journey order — so an automation page
 * shows the family's full text sequence (results → first step → check-in),
 * not just the texts this one cron fires. Ownership is described per-variant
 * in the drawer (SmsSamplesBlock shows "sent by" for other crons' texts).
 * Falls back to the cron's own texts when it has no journeys.
 */
export function smsVariantsForJourneys(cronId: string): SmsVariant[] {
  const journeys = journeysForCron(cronId);
  // Time-ordered journeys first, so the pill order reads as the family
  // experiences it (the priority ladder repeats the same types).
  const ordered = [...journeys].sort((a, b) => (a.ordering === "time" ? 0 : 1) - (b.ordering === "time" ? 0 : 1));
  const journeyTypes: string[] = [];
  for (const j of ordered) {
    for (const s of j.steps) {
      if (s.smsType && !journeyTypes.includes(s.smsType)) journeyTypes.push(s.smsType);
    }
  }
  const out: SmsVariant[] = [];
  for (const t of journeyTypes) {
    for (const v of SMS_VARIANTS) {
      if (v.emailType === t && !out.includes(v)) out.push(v);
    }
  }
  // Texts this cron sends that no journey step names keep their spot at the end.
  for (const v of smsVariantsForCron(cronId)) {
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** Display order for panel groups. */
export const SMS_GROUP_ORDER = [
  "Family · Reply alerts",
  "Provider · Lead alerts",
  "Family · Benefits results",
  "Family · Benefits cascade",
  "Transactional & auto-replies",
] as const;
