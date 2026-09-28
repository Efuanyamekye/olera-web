/**
 * Email replies from benefits families.
 *
 * Every navigator letter closes with "You can reply to this email. My team
 * and I read every reply." Replies land in support@olera.care (the letter's
 * Reply-To), where the support inbox syncs them. Until now nothing connected
 * that inbox to the benefits cascade, so a family could write back and still
 * receive the automated check-in two days later, and the /admin/benefits
 * queue never showed that they had written.
 *
 * Called from the support-email sync for each new inbound message matched to
 * a family profile. It records the reply where the queue reads it, pauses
 * the cascade until a person resumes it, and handles a death report the same
 * way the SMS webhook does. Best-effort: a failure here never breaks sync.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackAlert } from "@/lib/slack";
import {
  detectDeceased,
  isBenefitsAutomationHeld,
  holdNeedsExplicitResume,
  isBenefitsFamilyMeta,
  readBenefitsHold,
  withDeceasedReport,
  withHoldCleared,
  withReplyHold,
} from "./benefits-automation";

/**
 * A person on our side answered the family, from the support inbox or the
 * SMS inbox. That is the human read the hold was waiting for, so a reply
 * hold lifts and automation resumes. A deceased hold never lifts this way:
 * condolences are not a signal to resume "How is it going?" messages. That
 * one needs the explicit "Resume automation" button, and so does a STOP.
 */
export async function resumeAfterHumanReply(
  db: SupabaseClient,
  profileId: string,
  repliedAt: string,
  by = "a person replied",
): Promise<void> {
  const { data: row } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (row?.metadata as Record<string, unknown> | null) || {};
  const hold = readBenefitsHold(meta);
  if (!hold || !isBenefitsAutomationHeld(meta) || holdNeedsExplicitResume(meta)) return;
  const atMs = Date.parse(repliedAt);
  if (!Number.isFinite(atMs) || atMs <= Date.parse(hold.held_at)) return;
  await db
    .from("business_profiles")
    .update({ metadata: withHoldCleared(meta, by, new Date(atMs).toISOString()) })
    .eq("id", profileId);
}

/** Older than this and it is history being backfilled, not a live reply. */
const LIVE_REPLY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function noteBenefitsFamilyEmailReply(
  db: SupabaseClient,
  profileId: string,
  reply: { at: string; subject: string | null; body: string | null; autoSubmitted: boolean },
): Promise<void> {
  if (reply.autoSubmitted) return; // out-of-office and other machine replies
  const atMs = new Date(reply.at).getTime();
  if (!Number.isFinite(atMs) || Date.now() - atMs > LIVE_REPLY_WINDOW_MS) return;
  const atIso = new Date(atMs).toISOString();

  const { data: row } = await db
    .from("business_profiles")
    .select("metadata, display_name")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (row?.metadata as Record<string, unknown> | null) || {};
  if (!isBenefitsFamilyMeta(meta)) return;

  const prior = meta.benefits_email_reply as { at?: string } | undefined;
  if (prior?.at && Date.parse(prior.at) >= atMs) return; // already recorded

  // Quoted history below the reply would trip the death check on our own
  // letter's wording, so only the new text above the quote is read.
  const fresh = (reply.body || "").split(/\n\s*(?:On .+wrote:|>)/)[0].slice(0, 2000);
  const deceased = detectDeceased(fresh);
  let nextMeta: Record<string, unknown> = withReplyHold(
    { ...meta, benefits_email_reply: { at: atIso, subject: reply.subject?.slice(0, 200) ?? null } },
    "email_reply",
    "email",
    fresh || reply.subject,
    atIso,
  );
  if (deceased) nextMeta = withDeceasedReport(nextMeta, "email", fresh, atIso);

  await db.from("business_profiles").update({ metadata: nextMeta }).eq("id", profileId);

  if (deceased) {
    const who = row?.display_name && row.display_name !== "Care Seeker" ? row.display_name : "A benefits family";
    try {
      await sendSlackAlert(
        `🕊 ${who} emailed support@ and it suggests someone died: "${fresh.slice(0, 300)}". ` +
          `Automated messages are paused and nudges are off. Please reply personally ` +
          `(/admin/support-email), and use "Resume automation" in /admin/benefits if this was misread.`,
      );
    } catch (err) {
      console.error("[benefits-replies] Slack ping failed:", err);
    }
  }
}

/**
 * A person on the team reached a benefits family (a call that connected, or a
 * text or email sent from the case page). Mark the help case contacted and
 * lift a reply hold, so the case page and /admin/benefits agree: until
 * 2026-09-28 a call logged on the case page left the benefits help clock
 * running and automation paused, and "I contacted them" on /admin/benefits
 * never reached the case page. Death reports and STOPs keep their hold; those
 * take the explicit Resume, the same rule resumeAfterHumanReply follows.
 * No-op for a family that never used the benefits finder.
 */
export async function noteBenefitsContact(
  db: SupabaseClient,
  profileId: string,
  at: string,
  by: string,
): Promise<void> {
  const { data: row } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (row?.metadata as Record<string, unknown> | null) || {};
  if (!isBenefitsFamilyMeta(meta)) return;
  const caseMeta = (meta.benefits_case as Record<string, unknown> | undefined) ?? {};
  const base = isBenefitsAutomationHeld(meta) && !holdNeedsExplicitResume(meta) ? withHoldCleared(meta, by, at) : meta;
  await db
    .from("business_profiles")
    .update({ metadata: { ...base, benefits_case: { ...caseMeta, contacted_at: at } } })
    .eq("id", profileId);
}
