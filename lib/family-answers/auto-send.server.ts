/**
 * Researched answers that send themselves unless a person stops them.
 *
 * Why (TJ, 2026-09-27): the team cannot keep the two-business-day promise.
 * Over the month before, 22 texted questions reached the research queue and
 * only 8 were answered, median wait about 61 hours. The engine already does
 * the hard part (research, a draft, an independent model attacking the
 * draft); the only thing slow was the human click. So the default flips, the
 * same way the first-step letters did: a draft that passes every check is
 * announced in Slack and sends after AUTO_SEND_DELAY unless a person replies
 * themselves, starts editing it, or dismisses the job in /admin/inbox.
 *
 * Never automatic, whatever the checks say: crisis, a death, distress or
 * anger, and paid family caregiving (the rules are tricky and a wrong answer
 * costs a family real money). Those wait for a person, as today.
 *
 * Sending goes through replyToSmsThread, the same path as the inbox button:
 * do-not-contact refusal, quiet hours (parks until morning), the job stamped
 * with what was sent, the thread marked handled, the benefits cascade resumed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackAlert } from "@/lib/slack";
import { replyToSmsThread } from "@/lib/sms/inbox-actions.server";
import { detectCrisis } from "@/lib/sms/crisis";
import { detectDeceased, type BenefitsHelpCase } from "@/lib/family-comms/benefits-automation";
import { packetNeedsAttention, type AnswerPacket } from "@/lib/family-answers/types";

/** How long a person has to stop a drafted answer before it sends. */
export const AUTO_SEND_DELAY_MS = 3 * 60 * 60 * 1000;
export const AUTO_SEND_ACTOR = "auto:family-answers";

const PAID_CARE = /\b(get paid|paid caregiver|pay me|paid to (care|take care)|caregiver pay|ihss|consumer[- ]directed|self[- ]directed|family caregiver)\b/i;
const DISTRESS = /\b(desperate|scared|afraid|terrified|angry|furious|mad at|scam\w*|lawyer|attorney|sue\b|police|abus\w*|hurt\w*|dying|suicid\w*|hopeless|crying)\b/i;

export interface AutoSendMark {
  eligible: boolean;
  /** Why a person has to answer this one (empty when eligible). */
  reasons: string[];
  checkedAt: string;
  sendAfter?: string;
  /** Set when the sweep decided not to send after all, and why. */
  stopped?: string;
  sentAt?: string;
  result?: string;
}

/** Pure: may this drafted answer send itself? */
export function autoSendReasons(
  packet: AnswerPacket,
  ctx: { helpCaseOpen: boolean; optedOut: boolean },
): string[] {
  const reasons: string[] = [];
  const inbound = packet.inbound || "";
  const draft = packet.draft || "";
  if (packet.triage.category !== "benefits_question") reasons.push(`not a benefits question (${packet.triage.category})`);
  if (packet.triage.isCrisis || detectCrisis(inbound).isCrisis) reasons.push("crisis");
  if (detectDeceased(inbound)) reasons.push("mentions a death");
  if (PAID_CARE.test(inbound) || PAID_CARE.test(draft)) reasons.push("paid family caregiving");
  if (DISTRESS.test(inbound)) reasons.push("distress or anger");
  if (packetNeedsAttention(packet)) reasons.push("the checks flagged it (unsourced claim, relied-on fact, length, or an error)");
  if (packet.objections.some((o) => o.verdict === "contested")) reasons.push("the checker and the drafter disagree");
  if (/\$\s?\d/.test(draft)) reasons.push("quotes a dollar amount");
  if (!draft.trim()) reasons.push("no draft");
  if (/—/.test(draft)) reasons.push("draft has an em dash");
  if (ctx.helpCaseOpen) reasons.push("a help case is open");
  if (ctx.optedOut) reasons.push("opted out");
  return reasons;
}

async function familyContext(db: SupabaseClient, profileId: string | null) {
  if (!profileId) return { helpCaseOpen: false, optedOut: false, who: null as string | null };
  const { data } = await db
    .from("business_profiles")
    .select("display_name, email, phone_validity, metadata")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (data?.metadata as Record<string, unknown> | null) || {};
  const c = (meta.benefits_case as BenefitsHelpCase | undefined) ?? {};
  const helpCaseOpen = !!c.help_opened_at && !(c.resolved_at && c.resolved_at > c.help_opened_at);
  const who =
    (data?.display_name && data.display_name !== "Care Seeker" ? data.display_name : null) || data?.email || null;
  return { helpCaseOpen, optedOut: data?.phone_validity === "opted_out", who };
}

function etTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET";
}

/**
 * Called right after a job is finalized as `ready`. Marks it for automatic
 * sending (or says why a person must answer) and tells Slack either way.
 */
export async function markForAutoSend(
  db: SupabaseClient,
  job: { id: string; phone_last10: string; profile_id: string | null },
  packet: AnswerPacket,
): Promise<AutoSendMark> {
  const ctx = await familyContext(db, job.profile_id);
  const reasons = autoSendReasons(packet, ctx);
  const now = new Date();
  const mark: AutoSendMark = {
    eligible: reasons.length === 0,
    reasons,
    checkedAt: now.toISOString(),
    ...(reasons.length === 0 ? { sendAfter: new Date(now.getTime() + AUTO_SEND_DELAY_MS).toISOString() } : {}),
  };
  await db
    .from("family_answer_jobs")
    .update({ packet: { ...packet, autoSend: mark } })
    .eq("id", job.id);

  const who = ctx.who || `…${job.phone_last10.slice(-4)}`;
  try {
    await sendSlackAlert(
      mark.eligible
        ? `🤖 Answer drafted for ${who}. They asked: "${packet.inbound.slice(0, 160)}". Draft: "${packet.draft.slice(0, 300)}". ` +
            `It sends automatically at ${etTime(mark.sendAfter as string)} unless you reply yourself or dismiss it in /admin/inbox.`
        : `✋ Answer drafted for ${who}, needs a person before it sends (${reasons.join("; ")}). They asked: "${packet.inbound.slice(0, 160)}". Reply from /admin/inbox.`,
    );
  } catch (err) {
    console.error("[family-answers/auto-send] Slack note failed:", err);
  }
  return mark;
}

/**
 * Send every marked answer whose window has passed, unless a person stepped
 * in: the job is no longer `ready` (sent, dismissed, queued), someone has a
 * draft open in the reply box, or the family wrote again since the answer
 * was drafted (it would not answer what they said last).
 */
export async function sweepAutoSends(db: SupabaseClient): Promise<{ sent: number; stopped: number; failed: number }> {
  const out = { sent: 0, stopped: 0, failed: 0 };
  const nowIso = new Date().toISOString();
  const { data: jobs } = await db
    .from("family_answer_jobs")
    .select("id, phone_last10, profile_id, body, packet, status")
    .eq("status", "ready")
    .eq("packet->autoSend->>eligible", "true")
    .lte("packet->autoSend->>sendAfter", nowIso)
    .limit(10);
  if (!jobs?.length) return out;

  const { data: owner } = await db
    .from("admin_users")
    .select("id")
    .eq("role", "master_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  for (const job of jobs) {
    const packet = job.packet as AnswerPacket & { autoSend: AutoSendMark };
    if (packet.autoSend.stopped || packet.autoSend.sentAt) continue;
    const stop = async (why: string) => {
      out.stopped++;
      await db
        .from("family_answer_jobs")
        .update({ packet: { ...packet, autoSend: { ...packet.autoSend, stopped: why } } })
        .eq("id", job.id);
    };

    const { data: draftRow } = await db.from("sms_drafts").select("phone_last10").eq("phone_last10", job.phone_last10).maybeSingle();
    if (draftRow) {
      await stop("a person started a reply");
      continue;
    }
    if ((job.body || "").trim() !== (packet.inbound || "").trim()) {
      await stop("the family wrote again after the draft");
      continue;
    }
    // Conditions can change in three hours (a help case opened, STOP).
    const ctx = await familyContext(db, job.profile_id);
    const reasons = autoSendReasons(packet, ctx);
    if (reasons.length > 0) {
      await stop(reasons.join("; "));
      continue;
    }

    const res = await replyToSmsThread(db, {
      last10: job.phone_last10,
      body: packet.draft,
      actor: AUTO_SEND_ACTOR,
      adminUserId: owner?.id ?? "",
    });
    const ok = res.status === 200;
    if (ok) out.sent++;
    else out.failed++;
    const { data: after } = await db.from("family_answer_jobs").select("packet").eq("id", job.id).maybeSingle();
    const latest = ((after?.packet as typeof packet | null) ?? packet) as typeof packet;
    await db
      .from("family_answer_jobs")
      .update({
        packet: {
          ...latest,
          autoSend: {
            ...packet.autoSend,
            sentAt: ok ? new Date().toISOString() : undefined,
            result: ok ? (res.json.scheduled ? "scheduled for the morning" : "sent") : String(res.json.error ?? res.status),
            ...(ok ? {} : { stopped: `send failed: ${String(res.json.error ?? res.status)}` }),
          },
        },
      })
      .eq("id", job.id);
  }
  return out;
}
