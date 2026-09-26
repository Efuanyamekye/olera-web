import Anthropic from "@anthropic-ai/sdk";
import type { WarRoomProposalEvidence } from "@/lib/war-room/types";

/**
 * The first line of the brief: one thing to do.
 *
 * Sixty scans produced six proposals and one answer out of thirteen questions,
 * and the executor never fired. The brief opened on probe headlines and a cost
 * line and never said what to do, so the founder stopped reading it. What he
 * does answer is a message that names a person, an action and a reason it has
 * to be today, with the words already written.
 *
 * Choosing the move is deterministic. Wording it is a model call, because the
 * proposal row says "the one paying provider" while its evidence says Liz Hoop,
 * and only a reader of the whole record can name her. The model never picks
 * what to do, and when it fails the move goes out in plain words from the row.
 */

export type MoveCandidate = {
  kind: "provider_moment" | "approved_not_done" | "decision_waiting";
  title: string;
  why_now: string;
  decision_required: string | null;
  assigned_owner: string | null;
  action_kind: string | null;
  proposed_solution: string | null;
  finding: string | null;
  execution_plan: Array<{ label: string; detail: string }> | null;
  evidence: WarRoomProposalEvidence[] | null;
  since: string | null;
  /** When the row's why_now was written; its day counts are relative to this. */
  written?: string | null;
  /** For a provider moment: the founder's latest reply, read at brief time and not stored. */
  founderReply?: { at: string; text: string } | null;
  /** For a provider moment: what they wrote that nobody has answered, newest first. */
  unansweredFromThem?: Array<{ at: string; text: string }>;
  /** For a provider moment: the founder's reply before those, already sent. */
  founderEarlierReply?: { at: string; text: string } | null;
};

export type BriefMove = {
  /** One sentence: the action, who or which account, why now. */
  line: string;
  /** Words the named person could send as-is. Null when nobody is being contacted. */
  draft: string | null;
};

/**
 * Which one, when there are several.
 *
 * Approved work nobody carried out comes first. It is already decided, so the
 * only thing between it and done is someone doing it, and it is the kind with a
 * clock on it: the first proposal ever approved (2026-09-21) was a call to the
 * one paying provider before her renewal, and it sat untouched while the brief
 * reported probe headlines. A decision still waiting is second.
 *
 * A provider moment outranks both. Partnership signals are the founder's top
 * priority and surface the same day; on 2026-09-25 one sat in the support
 * inbox, summarised and matched, while the brief led with something else.
 * Moments arrive already ranked, so the first one wins.
 */
export function pickMove(
  approvedOpen: MoveCandidate[],
  waiting: MoveCandidate[],
  moments: MoveCandidate[] = [],
): MoveCandidate | null {
  const oldest = (rows: MoveCandidate[]) =>
    [...rows].sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""))[0] ?? null;
  return moments[0] ?? oldest(approvedOpen) ?? oldest(waiting);
}

/**
 * How the brief talks. Kept here rather than in the company model because the
 * company model changes by migration, and this is expected to be tuned often.
 */
export const BRIEF_VOICE = `Voice: plain and direct, like a sharp teammate texting the founder. Contractions are fine. Say the true thing even when it stings; no cushioning, no reassurance, no hedging paragraphs. No metric soup: one number at most, and only if it is the reason it has to be today. Never use em dashes. Never explain what Olera is or what you are.`;

function firstSentence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^.+?[.!?](\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

/** The move in plain words from the row alone. Used when the model is unavailable. */
export function fallbackMove(move: MoveCandidate): BriefMove {
  const reason = firstSentence(move.why_now || move.decision_required || "");
  const verb = move.kind === "decision_waiting" ? "Decide" : move.kind === "provider_moment" ? "Provider email" : "Do";
  // Titles are sometimes questions ("...are they being opened at all?"), and
  // "?." reads as a typo in the one line he is meant to act on.
  const title = /[.!?]$/.test(move.title.trim()) ? move.title.trim() : `${move.title.trim()}.`;
  const owner = move.kind === "approved_not_done" && move.assigned_owner ? ` Owner: ${move.assigned_owner}.` : "";
  return { line: toFounder(cleanText(`${verb}: ${title}${owner} ${reason}`.trim())), draft: null };
}

/**
 * Voice rules the model slips on, enforced in code: no em dashes, and no
 * asterisks, which would close the Slack bold the line is wrapped in.
 */
export function cleanText(text: string) {
  return text.replace(/\s*[—–]\s*/g, ", ").replace(/\*/g, "");
}

/**
 * The line is read by the founder, so it says "you", never "TJ". The prompt
 * says so, and 1 of 2 live renders on 2026-09-27 still wrote "TJ offered
 * Robbie ...". Only the line: the draft is his own message and may sign off.
 */
export function toFounder(line: string) {
  return line.replace(/^TJ's\b/, "Your").replace(/^TJ\b/, "You").replace(/\bTJ's\b/g, "your").replace(/\bTJ\b/g, "you");
}

const MOVE_MODEL =process.env.WAR_ROOM_BRIEF_MODEL || "claude-sonnet-5";

const SYSTEM = `You write the first line of a founder's daily brief. The line is one move: an action, the named person or account involved, and why it has to happen now. The move has already been chosen; you only word it. Do not change what it is.

Rules:
- "line" is one sentence, under 200 characters. Name the real person or business: if the evidence names them (for example "Call Liz Hoop"), use that name, never a description like "the paying provider".
- If the status says approved, it is already approved. The action is getting it done: who does what, by when. Never write "approve" for it.
- If the status says waiting on the founder's decision, the action is his decision; say in plain words what he would be approving.
- If a provider emailed: this is the one move; leave out anything else the summary mentions. Talk to the founder as "you", never by name. Name the person and business and say what they want. If the founder already replied (founder_reply), say what he offered and what happens next, quoting his times and dates exactly as he wrote them, and set draft to null. If they wrote since (their_unanswered_messages), the draft answers what they actually said, naming their specifics, and does not re-offer anything in founder_earlier_reply (if he already proposed times, confirm or chase those instead of proposing a new call).
- "draft" is only for a move that means contacting someone. Write the message the named teammate or the founder would send, two or three short sentences, ready to paste. If nobody is being contacted, draft is null.
- The whole record is record_days_old days old. Every "N days" in it (why_now, finding, evidence) was counted then. Subtract record_days_old from any count you repeat; "30 days" in a 5-day-old record is 25 days now.
- company_rules include the founder's own corrections ("Founder correction, ..."). If the move is something a correction rules out, still word it but say plainly in the line that it conflicts with his correction.
- Who does it: company_rules outrank the proposal, and assigned_owner outranks any name in the plan. If the plan names someone the rules say does not do this kind of work, use who the rules and assigned_owner name instead. Proposals drafted before a correction still carry the old name.
- Only facts in the record. Never invent a date, number, name or phone number.

${BRIEF_VOICE}

Reply with JSON only: {"line": "...", "draft": "..." or null}`;

function recordFor(move: MoveCandidate, rules: string[]) {
  return JSON.stringify({
    company_rules: rules,
    status: move.kind === "provider_moment"
      ? `A provider emailed support@olera.care${move.since ? ` on ${move.since.slice(0, 10)}` : ""}. ${move.decision_required ?? ""}`
      : move.kind === "approved_not_done"
        ? `Approved${move.since ? ` on ${move.since.slice(0, 10)}` : ""}, not yet carried out.`
        : `Waiting on the founder's decision${move.since ? ` since ${move.since.slice(0, 10)}` : ""}.`,
    title: move.title,
    why_now: move.why_now,
    record_days_old: move.written
      ? Math.max(0, Math.floor((Date.now() - new Date(move.written).getTime()) / 86_400_000))
      : 0,
    decision_required: move.decision_required,
    assigned_owner: move.assigned_owner,
    action_kind: move.action_kind,
    finding: move.finding,
    founder_reply: move.founderReply ?? null,
    their_unanswered_messages: move.unansweredFromThem ?? [],
    founder_earlier_reply: move.founderEarlierReply ?? null,
    proposed_solution: move.proposed_solution,
    execution_plan: move.execution_plan,
    evidence: (move.evidence ?? []).slice(0, 12).map((item) => item.detail.slice(0, 600)),
  });
}

/** Parse and bound the model's reply. Anything malformed is a fallback, not an error. */
export function parseMoveReply(raw: string): BriefMove | null {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { line?: unknown; draft?: unknown };
    // The voice rule bans em dashes and the model slips anyway, so enforce it here.
    const line = typeof parsed.line === "string" ? toFounder(cleanText(parsed.line.replace(/\s+/g, " ").trim())) : "";
    if (line.length < 12 || line.length > 260) return null;
    const draft = typeof parsed.draft === "string" && parsed.draft.trim().length > 8
      ? cleanText(parsed.draft.trim()).slice(0, 600)
      : null;
    return { line, draft };
  } catch {
    return null;
  }
}

/**
 * `rules` are the company model's constraints. They carry who does what, and a
 * proposal row can be older than the correction: on 2026-09-25 an approved
 * plan still said "Chantel takes the call" after the model had said she no
 * longer calls providers, and the brief repeated it.
 */
export async function phraseMove(move: MoveCandidate, rules: string[] = []): Promise<BriefMove> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackMove(move);
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: MOVE_MODEL,
      // Sonnet 5 thinks by default, and thinking counts against this cap.
      max_tokens: 2_000,
      system: SYSTEM,
      messages: [{ role: "user", content: recordFor(move, rules) }],
    }, {
      // This runs inside the delivery step. The SDK default is ten minutes with
      // two retries, which outlives the function, and a killed step sends no
      // brief at all. A plain move beats a late one.
      timeout: 45_000,
      maxRetries: 0,
    });
    const text = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    return parseMoveReply(text) ?? fallbackMove(move);
  } catch {
    // The brief goes out either way. A plain move beats no brief.
    return fallbackMove(move);
  }
}
