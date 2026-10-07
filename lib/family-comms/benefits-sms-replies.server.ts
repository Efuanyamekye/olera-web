import type {
  BenefitsCascadeMeta,
  BenefitsApplicationStatus,
} from "@/lib/family-comms/benefits-cascade.server";

export interface BenefitsSmsReplyResult {
  cascade: BenefitsCascadeMeta;
  response: string;
  needsHuman: boolean;
  label: string;
}

function withStatus(
  existing: BenefitsCascadeMeta,
  status: BenefitsApplicationStatus,
  keyword: string,
  at: string,
  extra: Partial<BenefitsCascadeMeta> = {},
): BenefitsCascadeMeta {
  return {
    ...existing,
    ...extra,
    application_status: status,
    application_status_at: at,
    last_sms_reply: keyword,
    last_sms_reply_at: at,
  };
}

/**
 * Turn a small, explicit SMS vocabulary into durable benefits progress.
 * The webhook remains responsible for persistence and human alerts; keeping
 * this interpretation pure makes the family-facing contract easy to test.
 */
export function interpretBenefitsSmsReply(
  keyword: string,
  existing: BenefitsCascadeMeta,
  at: string,
): BenefitsSmsReplyResult | null {
  const firstStepDone = existing.first_step_done_at || at;
  const firstStepDoneProgram =
    existing.first_step_done_program_id || existing.first_step_program_id;

  switch (keyword) {
    case "CALLED":
      return {
        cascade: withStatus(existing, "called", keyword, at, {
          first_step_done_at: firstStepDone,
          first_step_done_program_id: firstStepDoneProgram,
        }),
        response: "Olera: Nice work. What happened next? Reply APPLIED, NEED DOCS, WAITING, or STUCK.",
        needsHuman: false,
        label: "called the program",
      };
    case "NOANSWER":
      return {
        cascade: withStatus(existing, "no_answer", keyword, at),
        response: "Olera: Thanks for telling us. Try again during the hours on your plan. Reply STUCK if you need another route.",
        needsHuman: false,
        label: "could not reach the program",
      };
    case "NEEDDOCS":
      return {
        cascade: withStatus(existing, "needs_docs", keyword, at, {
          first_step_done_at: firstStepDone,
          first_step_done_program_id: firstStepDoneProgram,
        }),
        response: "Olera: Got it. Your document checklist is on your plan. Reply with what they asked for, or STUCK if you need help.",
        needsHuman: false,
        label: "needs documents",
      };
    case "APPLIED":
      return {
        cascade: withStatus(existing, "applied", keyword, at, {
          first_step_done_at: firstStepDone,
          first_step_done_program_id: firstStepDoneProgram,
          outcome: "moving",
          outcome_at: at,
        }),
        response: "Olera: Your application is marked submitted. Reply with an update when you hear back, or STUCK if the process stops.",
        needsHuman: false,
        label: "submitted an application",
      };
    case "WAITING":
      return {
        cascade: withStatus(existing, "waiting", keyword, at, {
          ...(existing.applied ? { applied: { ...existing.applied, decision: "waiting" as const, decision_at: at } } : {}),
          first_step_done_at: firstStepDone,
          first_step_done_program_id: firstStepDoneProgram,
          outcome: "moving",
          outcome_at: at,
        }),
        response: "Olera: We marked that you're waiting on the agency. Reply with an update when you hear back, or STUCK if you need help.",
        needsHuman: false,
        label: "is waiting on the agency",
      };
    case "APPROVED":
      return {
        cascade: withStatus(existing, "approved", keyword, at, {
          first_step_done_at: firstStepDone,
          first_step_done_program_id: firstStepDoneProgram,
          outcome: "moving",
          outcome_at: at,
          ...(existing.applied ? { applied: { ...existing.applied, decision: "approved" as const, decision_at: at } } : {}),
        }),
        response: "Olera: That's wonderful news. We marked it approved. If anything about it doesn't look right, reply STUCK and a person will help.",
        needsHuman: false,
        label: "was approved",
      };
    case "NOTELIGIBLE":
      return {
        cascade: withStatus(existing, "not_eligible", keyword, at, {
          ...(existing.applied ? { applied: { ...existing.applied, decision: "denied" as const, decision_at: at } } : {}),
          outcome: "wrong_program",
          outcome_at: at,
          outcome_reason: "not_eligible",
        }),
        response: "Olera: Thanks for telling us. We marked that program as not a fit. Your other matches are still in your plan.",
        needsHuman: false,
        label: "was told the program is not a fit",
      };
    case "STUCK":
      return {
        cascade: withStatus(existing, "stuck", keyword, at, {
          ...(existing.applied ? { applied: { ...existing.applied, decision: "stuck" as const, decision_at: at } } : {}),
          outcome: "wants_help",
          outcome_at: at,
        }),
        // Plain words, and a promise the owned help case backs (owner + due
        // time + overdue escalation, lib/family-comms/benefits-help-cases.server.ts).
        response:
          "Olera: Got it, you're stuck. A person on our team will text or email you, usually within 2 business days. You can reply here with what happened so far.",
        needsHuman: true,
        label: "asked Olera for help",
      };
    default:
      return null;
  }
}
