import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackAlert, sendSlackDirectMessage } from "@/lib/slack";
import { getSiteUrl } from "@/lib/site-url";
import { loadWarRoomBriefing, warRoomScanCost } from "@/lib/war-room/briefing.server";
import { isFounderAnswerable, pickQuestionForFounder, recordFounderAsk, type FounderQuestion } from "@/lib/war-room/founder-loop.server";
import { phraseMove, pickMove, type BriefMove, type MoveCandidate } from "@/lib/war-room/brief-move.server";
import { loadProviderMoments, type ProviderMoment } from "@/lib/war-room/provider-moments.server";
import { loadPaidRenewal, type PaidRenewal } from "@/lib/war-room/renewals.server";
import { withoutStaleRenewalCounts } from "@/lib/war-room/stale-counts";
import { correctionLines, loadCorrections } from "@/lib/war-room/corrections.server";
import { closeExchange } from "@/lib/war-room/conversation.server";
import { loadBlindSpots, loadLookupGaps } from "@/lib/war-room/lookups.server";
import type { WarRoomDiscoveryRun, WarRoomProbeReading } from "@/lib/war-room/types";

/**
 * The mouth.
 *
 * War Room had none. It wrote a correct, specific company read every morning to
 * `/admin/war-room`, a page nobody opens, and there was no Slack, email or SMS
 * path anywhere in the module. The founder's stated problem was "I get busy,
 * overwhelmed, distracted, or simply forget", and the answer to it required him
 * to remember to visit a page.
 *
 * Two rules shape everything below.
 *
 * **A failed scan is reported as loudly as a successful one.** On 2026-09-20 the
 * 10:30 run died at the dossier step and nobody knew for six hours, because the
 * only way to find out was to query the table. It was the fourth failure of that
 * exact kind and the gaps are closing (13, 11, then 9 days). A brief that only
 * speaks on success is a nicer-looking version of the silence it replaces.
 *
 * **Delivery never fails the scan.** A Slack outage must not turn a completed
 * company read into a failed run.
 */

const DELIVERY_STATE_KEY = "brief_delivery";

/**
 * Days the full scan runs, as US Eastern weekdays (0 Sunday .. 6 Saturday).
 *
 * The founder's condition for running it three days a week was that renewals
 * and provider moments are still checked every day. They are: on the other
 * days the cron sends a brief built from live data alone (provider emails,
 * approvals, the renewal) and skips only the model passes.
 */
export const SWEEP_DAYS = (process.env.WAR_ROOM_SWEEP_DAYS ?? "1,3,5")
  .split(",").map((day) => Number(day.trim())).filter((day) => day >= 0 && day <= 6);
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SWEEP_DAY_LABEL = SWEEP_DAYS.map((day) => WEEKDAY_NAMES[day]).join(", ");

export function easternDay(now = new Date()): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: WEEKDAY_NAMES.indexOf(get("weekday")) };
}

export function isSweepDay(now = new Date()) {
  return SWEEP_DAYS.includes(easternDay(now).weekday);
}

const RENEWAL_WINDOW_DAYS = 30;

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Slack renders a single asterisk as bold and needs `<url|label>` for links. */
function link(siteUrl: string, path: string, label: string) {
  return `<${siteUrl}${path}|${label}>`;
}

function readingLine(reading: WarRoomProbeReading, scanDate: string) {
  const measured = shortDate(reading.measuredAt);
  // Each reading states when it was measured. loadWarRoomBriefing returns the
  // latest answer per probe across all scans, so a probe that did not run today
  // still appears. Dating it is what stops a stale answer reading as today's.
  const age = measured === scanDate ? "" : ` _(measured ${measured})_`;
  // What it was, not just what it is. A number on its own is a fact; a number
  // next to the one it replaced is the thing worth reading.
  const from = reading.movement === "moved" && reading.previousHeadline
    ? `\n  _was: ${reading.previousHeadline}_`
    : "";
  return `• *${reading.label}* ${reading.headline}${age}${from}`;
}

type ProposalRow = { title: string; why_now: string; decision_required: string; created_at?: string };
type ApprovedRow = { title: string; approved_at: string | null; assigned_owner: string | null };

/** Everything the move's wording needs, so it can name the person the row only describes. */
const MOVE_COLUMNS = "title, why_now, decision_required, created_at, approved_at, assigned_owner, action_kind, proposed_solution, finding, execution_plan, evidence";
type MoveRow = ProposalRow & ApprovedRow & Omit<MoveCandidate, "kind" | "since">;

export function momentCandidate(moment: ProviderMoment): MoveCandidate {
  const who = moment.provider ?? "A provider";
  return {
    kind: "provider_moment",
    title: `${who}: ${moment.kind === "partnership" ? "wants a deeper partnership" : "waiting on a reply"}`,
    why_now: moment.summary,
    decision_required: moment.kind === "partnership"
      ? "It is a partnership or expansion signal, which the founder wants surfaced the same day. The line is only about that signal; leave out anything else the summary mentions, such as a family referral."
      : "They wrote and nobody has replied yet.",
    assigned_owner: "TJ",
    action_kind: "provider_reply",
    proposed_solution: null,
    finding: moment.subject ? `Subject: ${moment.subject}` : null,
    execution_plan: null,
    evidence: null,
    since: moment.lastInboundAt,
    written: moment.lastInboundAt,
    founderReply: moment.reply,
    unansweredFromThem: moment.unanswered,
    founderEarlierReply: moment.earlierReply,
  };
}

function toCandidate(row: MoveRow, kind: MoveCandidate["kind"]): MoveCandidate {
  return {
    kind,
    title: row.title,
    why_now: row.why_now,
    decision_required: row.decision_required,
    assigned_owner: row.assigned_owner,
    action_kind: row.action_kind,
    proposed_solution: row.proposed_solution,
    finding: row.finding,
    execution_plan: row.execution_plan,
    evidence: row.evidence,
    since: kind === "approved_not_done" ? row.approved_at : row.created_at ?? null,
    written: row.created_at ?? null,
  };
}

/**
 * Approved human work older than this, still not marked carried out, gets a
 * line in every brief until it is.
 *
 * Approval used to be the end of the record. `measurement_due_at` is only set
 * when someone clicks "Mark carried out", so approved work nobody closed was
 * never measured and never mentioned again. The first proposal ever approved
 * (2026-09-21, the Hoop Cares call) had no logged touch two days later and
 * nothing anywhere would have noticed.
 */
const APPROVED_NUDGE_DAYS = 3;
type InvestigationRow = { status: string };

/**
 * The question, if it is one only the founder can answer.
 *
 * `pickQuestionForFounder` already filters most candidates, but the stalled-
 * condition question and anything added later reach the brief by other routes.
 * This is the last check before anything is sent, so a question that fails it
 * is never asked, never recorded, and never costs him the one interruption.
 */
export function sendableQuestion(question: FounderQuestion | null | undefined): FounderQuestion | null {
  if (!question) return null;
  return isFounderAnswerable(question.question).ok ? question : null;
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function renewalText(renewal: PaidRenewal | null | undefined): string | null {
  if (!renewal) return null;
  if (renewal.renewsOn && renewal.daysUntilRenewal !== null) {
    if (renewal.daysUntilRenewal > RENEWAL_WINDOW_DAYS) return null;
    const amount = renewal.amount ? ` ($${renewal.amount})` : "";
    const flight = renewal.flightEndsOn && renewal.flightEndsOn !== renewal.renewsOn
      ? ` Her ad flight ends ${shortDate(renewal.flightEndsOn)}.`
      : "";
    return `_${renewal.name} renews ${shortDate(renewal.renewsOn)}${amount}, in ${plural(renewal.daysUntilRenewal)}.${flight}_`;
  }
  // Stripe could not be read: say what the date is, not that it is a renewal.
  if (renewal.flightEndsOn && renewal.daysUntilFlightEnd !== null && renewal.daysUntilFlightEnd <= RENEWAL_WINDOW_DAYS) {
    return `_${renewal.name}'s ad flight ends ${shortDate(renewal.flightEndsOn)}, in ${plural(renewal.daysUntilFlightEnd)}. Billing date unread._`;
  }
  return null;
}

/**
 * Pure: takes already-fetched data and returns the Slack text.
 *
 * Split out from the delivery path so the exact message can be rendered offline
 * against a real run before it is ever sent to a human. A brief nobody has read
 * in its final form is a brief nobody has reviewed.
 *
 * Shape, top to bottom: one move, at most one question, then a divider and
 * everything Cortex measured. The brief used to open on the measurements and
 * never say what to do; sixty scans in, the founder had stopped reading it. The
 * data is all still here, below the line, for when he wants it.
 */
export function buildWarRoomBriefText(input: {
  run: Pick<WarRoomDiscoveryRun, "status" | "created_at" | "error_message" | "source_summary">;
  siteUrl: string;
  readings: WarRoomProbeReading[];
  proposals: ProposalRow[];
  approvedOpen?: ApprovedRow[];
  open: number;
  watching: number;
  costUsd: number | null;
  move?: (BriefMove & { title: string; kind?: MoveCandidate["kind"] }) | null;
  /** Provider emails from the last 48 hours other than the one leading as the move. */
  moments?: Array<{ title: string }>;
  /** The paying provider's flight end, shown every day it is within RENEWAL_WINDOW_DAYS. */
  renewal?: PaidRenewal | null;
  /** A day without a full scan: the brief is built from live data only. */
  briefOnly?: boolean;
  question?: FounderQuestion | null;
  unanswerable?: string[];
  blindSpots?: string[];
}): string {
  const { run, siteUrl } = input;
  const date = shortDate(run.created_at);
  const href = link(siteUrl, "/admin/war-room", "Cortex page");

  if (run.status === "failed") {
    const failure = (run.source_summary?.failure ?? {}) as { stage?: string; detail?: string };
    return [
      `:rotating_light: *Cortex scan failed, ${date}*`,
      failure.stage ? `Stage: ${failure.stage}` : null,
      failure.detail || run.error_message || "No failure detail recorded.",
      "",
      `There is no company read for today. ${href}`,
    ].filter(Boolean).join("\n");
  }

  const lines: string[] = [];
  const question = sendableQuestion(input.question);

  if (input.move) {
    lines.push(`*${input.move.line}*`);
    if (input.move.draft) {
      lines.push("", "_Draft:_", ...input.move.draft.split("\n").map((line) => `> ${line}`));
    }
    // Approved work stays the move until it is marked carried out, because an
    // approval nobody closes is never measured.
    if (input.move.kind === "approved_not_done") {
      lines.push("", `_Already done? Mark it carried out on the ${href}._`);
    }
  }

  // One question, never a list, and only one he alone can answer. A brief
  // ending in six questions gets none of them answered. Replying in the DM is
  // what makes the answer evidence on the next scan.
  if (question) {
    if (lines.length) lines.push("");
    lines.push(`*Only you can answer this.* ${withoutStaleRenewalCounts(question.title)}: ${question.question}`);
    lines.push("_Just reply here. Your answer becomes evidence on tomorrow's scan._");
  }

  // Silence is not an option here: the brief is also how he learns the scan
  // ran at all, and a missing message looks exactly like a broken one. So a
  // quiet day says so in one line, and the numbers stay below it.
  // The renewal is checked every day, scan or not. It is the one date where
  // being a day late is the whole cost. The renewal is Stripe's next charge;
  // the ad flight's end is a different date and is named as one.
  const renewalLine = renewalText(input.renewal);
  if (renewalLine) {
    if (lines.length) lines.push("");
    lines.push(renewalLine);
  }

  if (!lines.length) lines.push("Nothing needs you today.");

  lines.push("", "───────────", `_Below the line: what I measured, ${date}. ${href}_`);

  // Only what moved. A number earns a line by having changed; six unchanged
  // numbers is proof the query ran, not a report of the company.
  const movers = input.readings.filter((reading) => reading.movement !== "steady");
  if (movers.length) {
    lines.push("", "*What moved*");
    lines.push(...movers.slice(0, 3).map((reading) => readingLine(reading, date)));
  }

  const moveTitle = input.move?.title;
  const otherMoments = (input.moments ?? []).filter((moment) => moment.title !== moveTitle);
  if (otherMoments.length) {
    lines.push("", "*Provider emails, last 48 hours*");
    for (const moment of otherMoments.slice(0, 4)) lines.push(`• ${moment.title}`);
  }
  const otherProposals = input.proposals.filter((proposal) => proposal.title !== moveTitle);
  if (otherProposals.length) {
    lines.push("", "*Also waiting on you*");
    for (const proposal of otherProposals) {
      // Keyed on age, not run id: a re-drafted proposal takes the new run's id.
      const waiting = proposal.created_at && proposal.created_at.slice(0, 10) < run.created_at.slice(0, 10)
        ? ` _(since ${shortDate(proposal.created_at)})_`
        : "";
      lines.push(`• ${proposal.title}${waiting}`);
    }
  } else if (!input.proposals.length) {
    lines.push("", `${input.open} case${input.open === 1 ? "" : "s"} open, ${input.watching} watching.`);
  }

  // Approved, then silence. Named until it is marked carried out, because an
  // approval nobody closes is never measured and so teaches the system nothing.
  const otherApproved = (input.approvedOpen ?? []).filter((row) => row.title !== moveTitle);
  if (otherApproved.length) {
    lines.push("", "*Approved, not yet marked done*");
    for (const row of otherApproved.slice(0, 3)) {
      const owner = row.assigned_owner ? `, ${row.assigned_owner}` : "";
      lines.push(`• ${row.title} _(approved ${row.approved_at ? shortDate(row.approved_at) : "earlier"}${owner})_`);
    }
    lines.push(`_Done? Mark it carried out on the ${href} so its outcome gets measured._`);
  }

  // Where my copy is behind the real thing. Shown every morning it is true,
  // because a stale reader otherwise looks exactly like a quiet company.
  if (input.blindSpots?.length) {
    lines.push("", "*Where my copy is behind*");
    for (const item of input.blindSpots.slice(0, 5)) lines.push(`• ${item}`);
    if (input.blindSpots.length > 5) lines.push(`_…and ${input.blindSpots.length - 5} more on the Cortex page._`);
  }

  // A lookup nobody knows is missing never gets built.
  if (input.unanswerable?.length) {
    lines.push("", "*What I could not look up*");
    for (const item of input.unanswerable.slice(0, 4)) lines.push(`• ${item}`);
  }

  // "Scan 2.39." was read as a scan number, not a price. Say it's dollars.
  lines.push("", input.briefOnly
    ? `_No full scan today; it runs ${SWEEP_DAY_LABEL}. Provider emails, the renewal and approvals were checked._`
    : input.costUsd != null ? `_This scan cost $${input.costUsd.toFixed(2)}._` : "_Scan cost unknown._");
  return lines.join("\n");
}

/**
 * Questions Cortex could not answer with any lookup.
 *
 * Slack misses since the last brief, every day they occur. The scan's open
 * cases whose next probe is "none" only on Mondays (Eastern): they persist
 * across scans, so a daily list would repeat itself into noise.
 */
async function loadUnanswerable(db: SupabaseClient, lastBriefAt: string | null): Promise<string[]> {
  const since = lastBriefAt ?? new Date(Date.now() - 86_400_000).toISOString();
  const conversation = (await loadLookupGaps(db, since))
    .map((gap) => `You asked: ${gap.question} Needed: ${gap.needed}`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date());
  if (weekday !== "Mon") return conversation;
  const { data } = await db.from("war_room_investigations")
    .select("title, next_probe")
    .in("status", ["investigating", "watchlist"])
    .eq("next_probe->>kind", "none")
    .limit(5);
  const scan = ((data ?? []) as Array<{ title: string; next_probe: { question?: string } | null }>)
    .map((row) => `${row.title}: ${row.next_probe?.question ?? "no lookup fits"}`);
  return [...conversation, ...scan];
}

/**
 * Send the brief for a finished scan (pass its run id), or, on a day without a
 * full scan, the brief built from live data alone (pass `{ briefOnly: true }`).
 */
export async function deliverWarRoomBrief(
  db: SupabaseClient,
  target: string | { briefOnly: true },
): Promise<{ delivered: boolean; reason?: string; channel?: "dm" | "webhook"; dmError?: string | null }> {
  const briefOnly = typeof target !== "string";
  const runId = typeof target === "string" ? target : null;
  const day = easternDay().date;
  try {
    // Durable steps retry. Without this guard a retried step sends the founder
    // the same brief twice, which is exactly the kind of noise that trains
    // someone to stop reading a channel.
    const { data: state } = await db.from("war_room_source_state")
      .select("metadata, last_success_at")
      .eq("source_key", DELIVERY_STATE_KEY)
      .maybeSingle();
    const delivered = (state?.metadata ?? null) as { run_id?: string; day?: string; brief_only?: boolean } | null;
    if (runId && delivered?.run_id === runId) {
      return { delivered: false, reason: "already delivered for this run" };
    }
    // A brief-only day sends once, and never after that day's scan brief.
    if (briefOnly && delivered?.day === day) {
      return { delivered: false, reason: "already delivered today" };
    }

    let run: WarRoomDiscoveryRun;
    if (runId) {
      const { data: runRow } = await db.from("war_room_discovery_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
      if (!runRow) return { delivered: false, reason: "run not found" };
      run = runRow as WarRoomDiscoveryRun;
    } else {
      run = { status: "completed", created_at: new Date().toISOString(), error_message: null, source_summary: {} } as unknown as WarRoomDiscoveryRun;
    }
    let readings: WarRoomProbeReading[] = [];
    let proposals: ProposalRow[] = [];
    let approvedOpen: ApprovedRow[] = [];
    let open = 0;
    let watching = 0;
    let question: FounderQuestion | null = null;
    let move: (BriefMove & { title: string; kind: MoveCandidate["kind"] }) | null = null;
    let momentCandidates: MoveCandidate[] = [];
    let unanswerable: string[] = [];
    let blindSpots: string[] = [];
    let renewal: PaidRenewal | null = null;
    if (run.status !== "failed") {
      renewal = await loadPaidRenewal(db).catch(() => null);
      unanswerable = await loadUnanswerable(db, (state as { last_success_at?: string | null } | null)?.last_success_at ?? null)
        .catch(() => []);
      blindSpots = await loadBlindSpots(db).catch(() => []);
      // Never ask on a failed scan. There is no fresh read behind the question,
      // and the only useful message on a failure is that it failed.
      // Only on scan days. A question is only worth his time with a fresh read
      // behind it, and the answer is evidence for a scan that must then run.
      question = briefOnly ? null : sendableQuestion(await pickQuestionForFounder(db).catch(() => null));
      const nudgeCutoff = new Date(Date.now() - APPROVED_NUDGE_DAYS * 86_400_000).toISOString();
      const [readingResult, proposalResult, approvedResult, investigationResult] = await Promise.all([
        loadWarRoomBriefing(db),
        // Every proposal still waiting, not only this run's. Proposals now
        // outlive the scan that drafted them, and one that is waiting but
        // absent from the brief is waiting where nobody looks.
        db.from("war_room_proposals")
          .select(MOVE_COLUMNS)
          .eq("status", "proposed")
          .order("created_at", { ascending: false })
          .limit(3),
        db.from("war_room_proposals")
          .select(MOVE_COLUMNS)
          .eq("status", "approved")
          .neq("action_kind", "code")
          .lt("approved_at", nudgeCutoff)
          .order("approved_at", { ascending: true })
          .limit(3),
        db.from("war_room_investigations").select("status"),
      ]);
      readings = readingResult;
      const waitingRows = (proposalResult.data ?? []) as MoveRow[];
      const approvedRows = (approvedResult.data ?? []) as MoveRow[];
      proposals = waitingRows;
      approvedOpen = approvedRows;
      // Read at brief time from the support inbox's own tables; nothing is stored.
      momentCandidates = (await loadProviderMoments(db).catch(() => [] as ProviderMoment[])).map(momentCandidate);
      const chosen = pickMove(
        approvedRows.map((row) => toCandidate(row, "approved_not_done")),
        waitingRows.map((row) => toCandidate(row, "decision_waiting")),
        momentCandidates,
      );
      if (chosen) {
        const { data: model } = await db.from("war_room_company_models")
          .select("constraints")
          .eq("key", "olera")
          .maybeSingle();
        // The founder's standing corrections go in with the constraints, so
        // a move he has already rejected is not the brief's first line.
        const corrections = correctionLines(await loadCorrections(db).catch(() => []))
          .map((line) => `Founder correction, ${line}`);
        const rules = [
          ...(Array.isArray(model?.constraints)
            ? (model.constraints as unknown[]).filter((rule): rule is string => typeof rule === "string")
            : []),
          ...corrections,
        ];
        move = { ...(await phraseMove(chosen, rules)), title: chosen.title, kind: chosen.kind };
      }
      const investigations = (investigationResult.data ?? []) as InvestigationRow[];
      open = investigations.filter((row) => row.status === "investigating").length;
      watching = investigations.filter((row) => row.status === "watchlist").length;
    }

    const text = buildWarRoomBriefText({
      run,
      siteUrl: getSiteUrl(),
      readings,
      proposals,
      approvedOpen,
      open,
      watching,
      costUsd: briefOnly ? null : warRoomScanCost(run)?.usd ?? null,
      renewal,
      briefOnly,
      move,
      moments: momentCandidates.map((candidate) => ({ title: candidate.title })),
      question,
      unanswerable,
      blindSpots,
    });

    // Prefer a DM. The shared webhook posts to the operations channel, where
    // this would arrive among lead alerts, claim notifications and QA events —
    // delivered, and easy to skim past, which is most of the problem it exists
    // to solve.
    //
    // The webhook stays as the fallback because the DM depends on a scope that
    // may never be granted: SLACK_BOT_TOKEN is read-only today, so
    // chat.postMessage returns missing_scope until chat:write is added and the
    // app reinstalled. A brief in the wrong place beats no brief.
    const dmUserId = process.env.WAR_ROOM_BRIEF_SLACK_USER_ID?.trim();
    let channel: "dm" | "webhook" = "webhook";
    let dmError: string | null = null;

    // `ts` only comes back from the DM path. The webhook fallback posts into a
    // channel and returns none, so an ask delivered that way records a null and
    // falls back to latest-ask on reply -- which is right, because there is no
    // thread of his to reply in.
    let result: { success: boolean; error?: string; ts?: string } = { success: false, error: "not attempted" };
    if (dmUserId) {
      result = await sendSlackDirectMessage(dmUserId, text);
      if (result.success) channel = "dm";
      else dmError = result.error ?? "DM failed";
    }
    if (!result.success) result = await sendSlackAlert(text);
    if (!result.success) return { delivered: false, reason: result.error ?? "Slack send failed" };

    // Only after the message is out. Recording an ask nobody received would
    // leave an open question that can never be answered, and the next reply
    // would attach to it instead of to the real one.
    // The Slack `ts` of the message that carried the question. A reply typed in
    // this message's thread resolves to this exact condition; without it every
    // answer falls back to "whatever was asked most recently", which is wrong
    // as soon as a newer brief lands in between.
    if (question && runId) await recordFounderAsk(db, question, runId, result.ts ?? null).catch(() => false);

    // A brief changes the subject, whether or not it carried a question. Any
    // conversation still counted as "in progress" ends here, or the next thing
    // he types is read as a follow-up to an older exchange -- the same
    // misrouting in the opposite direction.
    await closeExchange(db);

    await db.from("war_room_source_state").upsert({
      source_key: DELIVERY_STATE_KEY,
      last_synced_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_error: null,
      // Which path actually carried it. Without this a missing chat:write
      // scope looks identical to a successful DM from the outside.
      metadata: { run_id: runId, day, brief_only: briefOnly, status: run.status, channel, dm_error: dmError },
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_key" }).then(() => undefined, () => undefined);

    return { delivered: true, channel, dmError };
  } catch (error) {
    // A scan that produced a real company read must not be recorded as failed
    // because a webhook was down.
    return { delivered: false, reason: error instanceof Error ? error.message : "brief delivery failed" };
  }
}
