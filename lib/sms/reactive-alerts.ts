/**
 * Reactive care-seeker SMS alerts — the Tier-1 "a provider got back to you" text.
 *
 * These fire when something real happens TO a family that initiated an inquiry
 * (a provider replied / reached out). They are TRANSACTIONAL: cap-exempt, no
 * express-written consent required (the family started the thread). The only
 * gates are: a usable phone, not opted out, a per-day safety throttle, and
 * quiet hours. A send that lands outside 8am–8pm recipient-local is enqueued to
 * sms_queue and delivered at the next window open by the sms-queue-flush cron —
 * the family still gets the email immediately.
 *
 * Deep links in the body MUST be stable (a sign-in path or guest token), never a
 * 1-hour magic link — a queued text could be delivered the next morning.
 */

import { getServiceClient } from "@/lib/admin";
import { sendSMS, normalizeUSPhone } from "@/lib/twilio";
import { quietHoursCheck } from "./quiet-hours";
import { isTransactionalSms } from "./channel-policy";
import { readBenefitsCascade } from "@/lib/family-comms/benefits-cascade.server";
import { isBenefitsAutomationHeld } from "@/lib/family-comms/benefits-automation";

/** Safety ceiling on reactive texts to one number per (UTC) day. Replies are low-volume; this only catches a storm. */
export const DAILY_SMS_SAFETY_CAP = 6;

export interface ReactiveAlertOptions {
  /** business_profiles.id of the family (for logging + opt-out re-check at flush). */
  familyProfileId: string;
  phone?: string | null;
  /** Family's US state (2-letter) for quiet-hours timezone. */
  state?: string | null;
  /** business_profiles.phone_validity — 'opted_out' hard-blocks SMS. */
  phoneValidity?: string | null;
  /** Must be an sms_reactive type in the channel policy (else skipped). */
  emailType: string;
  /** Rendered SMS body. Keep ≤160 chars; use a STABLE link, not a magic link. */
  body: string;
  /** Injectable clock for tests. */
  now?: Date;
  /** Extra ledger metadata (e.g. the benefits companion arm). Kept on an
   *  immediate send; a queued send loses it (sms_queue has no column). */
  metadata?: Record<string, unknown>;
}

export type ReactiveAlertResult =
  | { status: "sent" }
  | { status: "queued"; sendAfter: Date }
  | { status: "skipped"; reason: string };

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** True when `phone` has already hit the daily reactive-SMS safety cap. */
async function isOverDailyThrottle(
  db: ReturnType<typeof getServiceClient>,
  phone: string,
  now: Date
): Promise<boolean> {
  const { count, error } = await db
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("channel", "sms")
    .eq("recipient", phone)
    .eq("status", "sent")
    .gte("created_at", startOfUtcDay(now).toISOString());
  if (error) return false; // fail open — a real reply alert shouldn't be lost to a count error
  return typeof count === "number" && count >= DAILY_SMS_SAFETY_CAP;
}

/**
 * Send (or queue) a reactive reply-alert SMS to a family. Safe to await in a
 * route — never throws; returns a status the caller can log.
 */
export async function sendReactiveFamilyAlert(opts: ReactiveAlertOptions): Promise<ReactiveAlertResult> {
  try {
    if (!isTransactionalSms(opts.emailType)) {
      return { status: "skipped", reason: "not_reactive_type" };
    }
    const phone = opts.phone ? normalizeUSPhone(opts.phone) : null;
    if (!phone) return { status: "skipped", reason: "no_phone" };
    if (opts.phoneValidity === "opted_out") return { status: "skipped", reason: "opted_out" };

    const now = opts.now ?? new Date();
    const db = getServiceClient();

    if (await isOverDailyThrottle(db, phone, now)) {
      return { status: "skipped", reason: "daily_throttle" };
    }

    const quiet = quietHoursCheck({ now, state: opts.state });
    if (quiet.allowed) {
      const res = await sendSMS({
        to: phone,
        body: opts.body,
        emailType: opts.emailType,
        recipientType: "family",
        recipientLogProfileId: opts.familyProfileId,
        metadata: { reactive: true, ...(opts.metadata ?? {}) },
      });
      return res.success
        ? { status: "sent" }
        : { status: "skipped", reason: res.error ?? "send_failed" };
    }

    // Outside the recipient's quiet-hours window — defer to the next window open.
    const sendAfter = quiet.sendAfter ?? now;
    await db.from("sms_queue").insert({
      to_phone: phone,
      body: opts.body,
      email_type: opts.emailType,
      recipient_type: "family",
      family_profile_id: opts.familyProfileId,
      send_after: sendAfter.toISOString(),
    });
    return { status: "queued", sendAfter };
  } catch (err) {
    console.error("[reactive-sms] Error:", err);
    return { status: "skipped", reason: "error" };
  }
}

const MAX_FLUSH_ATTEMPTS = 3;

export type FlushResult = {
  considered: number;
  sent: number;
  canceled: number;
  failed: number;
  requeued: number;
};

const BENEFITS_QUEUED_TYPES = new Set([
  "benefits_first_step_sms",
  "benefits_check_in_sms",
]);

async function stampBenefitsQueueDelivery(
  db: ReturnType<typeof getServiceClient>,
  profileId: string,
  emailType: string,
  at: string,
): Promise<void> {
  if (!BENEFITS_QUEUED_TYPES.has(emailType)) return;
  const { data: profile } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return;
  const metadata = (profile.metadata as Record<string, unknown> | null) || {};
  const cascade = readBenefitsCascade(metadata);
  const nextCascade = { ...cascade };
  if (emailType === "benefits_first_step_sms") {
    nextCascade.first_step_sms_at = at;
    delete nextCascade.first_step_sms_queued_for;
  } else {
    nextCascade.check_sms_at = at;
    nextCascade.check_sent_at ||= at;
    delete nextCascade.check_sms_queued_for;
  }
  const { error } = await db
    .from("business_profiles")
    .update({ metadata: { ...metadata, benefits_cascade: nextCascade } })
    .eq("id", profileId);
  if (error) console.error("[sms-queue] Benefits delivery stamp failed:", error);
}

async function clearBenefitsQueuePending(
  db: ReturnType<typeof getServiceClient>,
  profileId: string,
  emailType: string,
): Promise<void> {
  if (!BENEFITS_QUEUED_TYPES.has(emailType)) return;
  const { data: profile } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return;
  const metadata = (profile.metadata as Record<string, unknown> | null) || {};
  const cascade = readBenefitsCascade(metadata);
  const nextCascade = { ...cascade };
  if (emailType === "benefits_first_step_sms") {
    delete nextCascade.first_step_sms_queued_for;
  } else {
    // Older builds prematurely copied the queue due time into check_sent_at.
    // Remove that synthetic stamp only when it matches the queued value.
    if (
      nextCascade.check_sms_queued_for &&
      nextCascade.check_sent_at === nextCascade.check_sms_queued_for
    ) {
      delete nextCascade.check_sent_at;
    }
    delete nextCascade.check_sms_queued_for;
  }
  const { error } = await db
    .from("business_profiles")
    .update({ metadata: { ...metadata, benefits_cascade: nextCascade } })
    .eq("id", profileId);
  if (error) console.error("[sms-queue] Benefits pending-stamp cleanup failed:", error);
}

/**
 * Finish the bookkeeping an immediate admin reply would have done at send time.
 *
 * A human-scheduled reply commits the thread at QUEUE time (handled, draft
 * cleared, job -> 'queued') but deliberately withholds the one claim it cannot
 * yet make: that the message was sent. This closes that gap once Twilio has it.
 */
async function stampAdminReplyDelivered(
  db: ReturnType<typeof getServiceClient>,
  row: { answer_job_id: string | null; queued_by: string | null; body: string },
  sentAt: string,
): Promise<void> {
  if (!row.answer_job_id) return;
  const { error } = await db
    .from("family_answer_jobs")
    .update({ status: "sent", sent_at: sentAt, sent_body: row.body, sent_by: row.queued_by })
    .eq("id", row.answer_job_id);
  if (error) console.error("[sms-queue] admin reply job stamp failed:", error);
}

/**
 * Put a canceled admin reply back in front of the human who scheduled it.
 *
 * This is the failure the whole scheduling design has to survive. Someone wrote
 * a reply, pressed a button, and walked away believing it was handled. Then the
 * flush re-checked opt-out or the throttle and dropped it. Leaving the thread
 * marked handled would make a message that never went out indistinguishable
 * from one that did, and the family would be waiting on an answer nobody knows
 * is missing. So the thread reopens: handled_at cleared, job back to 'ready',
 * and the reply restored to the draft box rather than discarded, because it is
 * still the right text and re-typing it is a tax on an already-bad outcome.
 */
async function reopenCanceledAdminReply(
  db: ReturnType<typeof getServiceClient>,
  row: {
    phone_last10: string | null;
    answer_job_id: string | null;
    body: string;
    queued_by: string | null;
    created_at: string;
  },
  reason: string,
): Promise<void> {
  const last10 = row.phone_last10;
  if (!last10) return;

  // Only the messages THIS scheduling marked handled. A thread can hold months
  // of earlier exchanges that were answered properly, and a blanket clear would
  // resurrect all of them as unanswered — turning one undelivered reply into a
  // fake backlog. Scheduling stamps handled_at at queue time, so anything
  // stamped at or after that instant is ours to undo.
  await db
    .from("sms_inbound")
    .update({ handled_at: null, handled_by: null })
    .eq("phone_last10", last10)
    .gte("handled_at", row.created_at);

  if (row.answer_job_id) {
    const { error } = await db
      .from("family_answer_jobs")
      .update({ status: "ready", sent_body: null, sent_by: null })
      .eq("id", row.answer_job_id);
    if (error) console.error("[sms-queue] admin reply job reopen failed:", error);
  }

  // Never clobber a draft written since: the reviewer may already be redoing
  // this by hand, and their newer text outranks the one that failed to send.
  const { data: existing } = await db
    .from("sms_drafts")
    .select("phone_last10")
    .eq("phone_last10", last10)
    .maybeSingle();
  if (!existing) {
    await db.from("sms_drafts").insert({
      phone_last10: last10,
      body: row.body,
      updated_by: row.queued_by ?? "sms-queue-flush",
      updated_at: new Date().toISOString(),
    });
  }

  console.warn(`[sms-queue] scheduled admin reply to ${last10} canceled (${reason}); thread reopened`);
}

/**
 * Deliver due rows from sms_queue. Called by the sms-queue-flush cron. Re-checks
 * opt-out and the daily throttle at delivery time (state changed since enqueue),
 * so a family who texted STOP overnight is never sent the held message.
 */
export async function flushDueSmsQueue(now?: Date): Promise<FlushResult> {
  const at = now ?? new Date();
  const db = getServiceClient();
  const result: FlushResult = { considered: 0, sent: 0, canceled: 0, failed: 0, requeued: 0 };

  const { data: due, error } = await db
    .from("sms_queue")
    .select(
      "id, to_phone, phone_last10, body, email_type, recipient_type, family_profile_id, attempts, origin, queued_by, answer_job_id, created_at",
    )
    .eq("status", "pending")
    .lte("send_after", at.toISOString())
    .order("send_after", { ascending: true })
    .limit(200);
  if (error || !due) return result;

  for (const row of due) {
    result.considered++;

    // Re-check opt-out against the family profile (it may have changed since enqueue).
    if (row.family_profile_id) {
      const { data: prof } = await db
        .from("business_profiles")
        .select("phone_validity, metadata")
        .eq("id", row.family_profile_id)
        .maybeSingle();
      if (prof?.phone_validity === "opted_out") {
        await db.from("sms_queue").update({ status: "canceled", last_error: "opted_out" }).eq("id", row.id);
        await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
        // Deliberately NOT reopened. Every other cancel reason wants the thread
        // back in front of a human so they can resend; this one must not, since
        // the only allowed action is to leave them alone. The reply box refuses
        // a do-not-contact number anyway, so restoring the draft would only
        // invite someone to fight a control that is working.
        if (row.origin === "admin_reply") {
          console.warn(
            `[sms-queue] scheduled admin reply to ${row.phone_last10} dropped: recipient opted out before the send window opened`,
          );
        }
        result.canceled++;
        continue;
      }
      if (
        BENEFITS_QUEUED_TYPES.has(row.email_type) &&
        !(prof?.metadata as { sms_consent?: unknown } | null)?.sms_consent
      ) {
        await db.from("sms_queue").update({ status: "canceled", last_error: "consent_removed" }).eq("id", row.id);
        await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
        result.canceled++;
        continue;
      }
      // A benefits text queued overnight (an after-hours autopilot or check-in
      // send) must not go out over what the family said since: a reply that
      // pauses automation, an unsubscribe, or a death report. The send paths
      // check these at queue time; this is the same check at delivery.
      if (BENEFITS_QUEUED_TYPES.has(row.email_type)) {
        const pm = (prof?.metadata as Record<string, unknown> | null) || {};
        const stop =
          pm.nudges_unsubscribed === true
            ? "unsubscribed"
            : isBenefitsAutomationHeld(pm)
              ? "automation_hold"
              : null;
        if (stop) {
          await db.from("sms_queue").update({ status: "canceled", last_error: stop }).eq("id", row.id);
          await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
          result.canceled++;
          continue;
        }
      }
    }

    // Re-check the daily safety throttle.
    //
    // Exempt for a human reply. The throttle protects families from Olera's
    // automation, and the immediate admin send path has never consulted it — so
    // applying it here would mean the same reply to the same question survives
    // or dies purely on what time of day it was written, which is not a rule
    // anyone could reason about. A person answering a direct question is the
    // case the throttle exists to make room for.
    if (row.origin !== "admin_reply" && (await isOverDailyThrottle(db, row.to_phone, at))) {
      await db.from("sms_queue").update({ status: "canceled", last_error: "daily_throttle" }).eq("id", row.id);
      if (row.family_profile_id) {
        await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
      }
      result.canceled++;
      continue;
    }

    const res = await sendSMS({
      to: row.to_phone,
      body: row.body,
      emailType: row.email_type,
      recipientType: (row.recipient_type as "family" | undefined) ?? "family",
      recipientLogProfileId: row.family_profile_id ?? undefined,
      // A human answering a question a family asked is transactional by
      // definition. It is absent from the channel-policy map because the admin
      // reply path has never consulted that map, so asking the map here would
      // log every held reply as a proactive nudge in /admin/family-comms.
      metadata: {
        reactive: row.origin === "admin_reply" || isTransactionalSms(row.email_type),
        queued: true,
      },
    });

    if (res.success && !res.skipped) {
      const sentAt = at.toISOString();
      await db.from("sms_queue").update({
        status: "sent", sent_at: sentAt, attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      if (row.family_profile_id) {
        await stampBenefitsQueueDelivery(db, row.family_profile_id, row.email_type, sentAt);
      }
      if (row.origin === "admin_reply") {
        await stampAdminReplyDelivered(db, row, sentAt);
      }
      result.sent++;
    } else if (res.skipped) {
      await db.from("sms_queue").update({
        status: "canceled", attempts: (row.attempts ?? 0) + 1, last_error: "suppressed",
      }).eq("id", row.id);
      if (row.family_profile_id) {
        await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
      }
      if (row.origin === "admin_reply") {
        await reopenCanceledAdminReply(db, row, "suppressed");
      }
      result.canceled++;
    } else {
      const attempts = (row.attempts ?? 0) + 1;
      const failed = attempts >= MAX_FLUSH_ATTEMPTS;
      await db.from("sms_queue").update({
        status: failed ? "failed" : "pending", attempts, last_error: res.error ?? "send_failed",
      }).eq("id", row.id);
      if (failed) {
        if (row.family_profile_id) {
          await clearBenefitsQueuePending(db, row.family_profile_id, row.email_type);
        }
        if (row.origin === "admin_reply") {
          await reopenCanceledAdminReply(db, row, res.error ?? "send_failed");
        }
        result.failed++;
      }
      else result.requeued++;
    }
  }

  return result;
}
