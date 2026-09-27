import type { SupabaseClient } from "@supabase/supabase-js";
import { resumeAfterHumanReply } from "@/lib/family-comms/benefits-replies.server";
import { logAuditAction } from "@/lib/admin";
import { sendSMS } from "@/lib/twilio";
import { isPhoneDoNotContact } from "@/lib/do-not-contact";
import { quietHoursCheck } from "@/lib/sms/quiet-hours";

/**
 * Answering and closing an SMS thread, shared by the admin inbox and Cortex.
 *
 * Moved out of app/api/admin/sms-inbox/[phone]/route.ts unchanged, so a reply
 * Cortex sends after the founder's approval does exactly what his click in
 * /admin/inbox does: quiet-hours scheduling, the do-not-contact refusal, one
 * scheduled reply per thread, the thread marked handled, the draft cleared,
 * the answer job stamped with what was sent, and the benefits cascade resumed.
 * Never Twilio directly. Results come back as { status, json }, the shape the
 * route already returned, so the route stays a thin wrapper.
 */

export type InboxActionResult = { status: number; json: Record<string, unknown> };

/** Matches the reply box and the sms_drafts CHECK — one limit, three places. */
export const MAX_SMS_BODY = 480;
const MAX_BODY = MAX_SMS_BODY;

/** Twilio addresses US numbers in E.164; our thread key is the last 10 digits. */
/**
 * The family profile behind a number, for a conversation that has no inbound
 * row to identify it. business_profiles.phone is stored however it was typed:
 * of 641 family numbers, 156 are neither +1XXXXXXXXXX nor ten digits
 * (" +1 912-581-4440", "(704) 351-0788"), so an exact match missed a quarter
 * of them. Every format ends in the same four digits, so narrow on those in
 * the query and compare the normalized number here.
 */
export async function familyIdByPhone(db: SupabaseClient, last10: string): Promise<string | null> {
  const { data } = await db
    .from("business_profiles")
    .select("id, phone")
    .eq("type", "family")
    .like("phone", `%${last10.slice(-4)}`)
    .limit(50);
  const hit = (data ?? []).find((p) => String(p.phone ?? "").replace(/\D/g, "").slice(-10) === last10);
  return (hit?.id as string | undefined) ?? null;
}

export function toE164(last10: string): string {
  return `+1${last10}`;
}

/**
 * Close out the researched answer a reply came from, recording what was
 * actually sent next to what the engine proposed.
 *
 * Deliberately scoped to the NEWEST ready job rather than every ready row for
 * the number. More than one can exist: the webhook only suppresses a duplicate
 * job while an earlier one is `pending` or `running`, so a family who texts
 * again while a draft is awaiting review gets a second job, and the cron will
 * happily draft that one too. A blanket update would then stamp one reply's
 * text onto both, marking a question answered that was never answered and
 * corrupting the draft-vs-sent comparison for the older one.
 */
async function stampAnswerJobSent(
  db: SupabaseClient,
  last10: string,
  sentBody: string,
  actor: string,
): Promise<void> {
  const { data: job } = await db
    .from("family_answer_jobs")
    .select("id")
    .eq("phone_last10", last10)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) return;

  const { error } = await db
    .from("family_answer_jobs")
    .update({
      status: "sent",
      sent_body: sentBody,
      sent_at: new Date().toISOString(),
      sent_by: actor,
    })
    .eq("id", job.id);
  if (error) console.error("[admin/sms-inbox/phone] answer job stamp failed:", error);
}

/**
 * Park a reply in sms_queue until the recipient's window opens.
 *
 * Everything an immediate send does at send time, this does too, EXCEPT
 * claiming the message went out. The thread is marked handled and the draft is
 * cleared, because the reviewer has finished with it and the box must not
 * refill with text that is already committed. But the answer job goes to
 * `queued`, not `sent`: `sent_at` stays NULL until Twilio has actually taken
 * it, so the draft-vs-sent comparison never counts a message that is still
 * sitting in a queue, and a scheduled reply that later gets canceled does not
 * leave a false record of having been answered.
 *
 * Returns the job id so the queue row can carry it: the flush needs to know
 * which job to promote on delivery, and which to reopen on cancel.
 */
async function scheduleReply(
  db: SupabaseClient,
  args: {
    last10: string;
    e164: string;
    body: string;
    sendAfter: Date;
    actor: string;
    recipientType?: "family" | "provider" | "caregiver";
    profileId?: string | null;
  },
): Promise<{ error?: string }> {
  const { data: job } = await db
    .from("family_answer_jobs")
    .select("id")
    .eq("phone_last10", args.last10)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: queued, error } = await db
    .from("sms_queue")
    .insert({
      to_phone: args.e164,
      phone_last10: args.last10,
      body: args.body,
      // Same email_type an immediate admin reply logs under, so the outbound
      // ledger cannot tell the difference between a reply sent at 9am and one
      // written at 6am and held until 8am. It should not be able to.
      email_type: "admin_reply",
      recipient_type: args.recipientType ?? null,
      family_profile_id: args.profileId ?? null,
      send_after: args.sendAfter.toISOString(),
      origin: "admin_reply",
      queued_by: args.actor,
      answer_job_id: job?.id ?? null,
    })
    .select("created_at")
    .single();
  if (error) return { error: error.message };

  // Stamp handled_at with the queue row's OWN created_at rather than the app
  // clock. Cancelling reopens by `handled_at >= created_at`, and a server
  // running a second behind Postgres would make that comparison miss its own
  // rows — leaving a thread marked handled with nothing scheduled and no reply
  // sent. Same value on both sides, no skew to reason about.
  const handledAt = queued.created_at;

  await Promise.all([
    db
      .from("sms_inbound")
      .update({ handled_at: handledAt, handled_by: args.actor })
      .eq("phone_last10", args.last10)
      .is("handled_at", null),
    db.from("sms_drafts").delete().eq("phone_last10", args.last10),
    job
      ? db
          .from("family_answer_jobs")
          .update({ status: "queued", sent_body: args.body, sent_by: args.actor })
          .eq("id", job.id)
      : Promise.resolve(),
  ]);

  return {};
}

/**
 * Is this thread flagged as a crisis?
 *
 * Shared by GET and the reply action deliberately. They previously read it from
 * different scopes — the rail's `ready` packet versus the newest packet of any
 * status — so a thread whose job had moved on could show "Schedule 8:00 AM" and
 * then send immediately on click. A button that does something other than what
 * it says is worse than either behaviour on its own.
 *
 * Crisis is a property of the conversation, not of a job's lifecycle position,
 * so the broader read is the correct one.
 */
export async function threadIsCrisis(
  db: SupabaseClient,
  last10: string,
): Promise<boolean> {
  const { data } = await db
    .from("family_answer_jobs")
    .select("packet")
    .eq("phone_last10", last10)
    .not("packet", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean((data?.packet as { triage?: { isCrisis?: boolean } } | null)?.triage?.isCrisis);
}


/** Close a thread without replying: inbound marked handled, pending drafted work skipped. */
export async function markSmsThreadHandled(
  db: SupabaseClient,
  last10: string,
  actor: string,
): Promise<InboxActionResult> {
  const now = new Date().toISOString();
  const [inboundResult, jobsResult] = await Promise.all([
    db
      .from("sms_inbound")
      .update({ handled_at: now, handled_by: actor })
      .eq("phone_last10", last10)
      .is("handled_at", null),
    // Mark handled means the thread needs no drafted answer. Close pending,
    // running, and ready work together so the review card cannot survive
    // the message it was created for.
    db
      .from("family_answer_jobs")
      .update({ status: "skipped", completed_at: now })
      .eq("phone_last10", last10)
      .in("status", ["pending", "running", "ready"]),
  ]);
  const error = inboundResult.error ?? jobsResult.error;
  if (error) {
    console.error("[admin/sms-inbox/phone] mark_handled failed:", error);
    return { status: 500, json: { error: error.message } };
  }
  return { status: 200, json: { success: true } };
}

/**
 * Send (or schedule, outside the recipient's quiet hours) a reply on a thread.
 * `sendNow` overrides quiet hours and is only ever the reviewer's explicit
 * choice. `adminUserId` attributes the audit row to the person who approved it.
 */
export async function replyToSmsThread(
  db: SupabaseClient,
  args: { last10: string; body: unknown; actor: string; adminUserId: string; sendNow?: boolean },
): Promise<InboxActionResult> {
  const { last10, body: rawBody, actor, adminUserId } = args;
  // Quiet hours are a default the reviewer can overrule; only ever his explicit choice.
  const sendNow = args.sendNow === true;
  const text = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!text) return { status: 400, json: { error: "Message body is required" } };
  if (text.length > MAX_BODY) {
    return { status: 400, json: { error: `Message is too long (${MAX_BODY} characters max)` } };
  }

  // Refuse before sending rather than relying on sendSMS's silent skip: a
  // human staring at a reply box needs to be told WHY nothing was sent.
  // This is the one place where a person could trivially text someone who
  // asked us to stop.
  if (await isPhoneDoNotContact(last10)) {
    return { status: 409, json: {
        error:
          "This number is on the do-not-contact list (they texted STOP). Replying would violate their opt-out.",
      } };
  }

  // One scheduled reply per thread. Without this a second click while a
  // send is parked queues a duplicate, and the family gets the same answer
  // twice at 8am with no way to tell which one anybody meant.
  const { data: alreadyScheduled } = await db
    .from("sms_queue")
    .select("send_after")
    .eq("phone_last10", last10)
    .eq("origin", "admin_reply")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (alreadyScheduled) {
    return { status: 409, json: {
        error: "A reply is already scheduled for this thread. Cancel it first to send or edit.",
        scheduled: { sendAfter: alreadyScheduled.send_after },
      } };
  }

  // Carry the thread identity into email_log. Older admin replies omitted
  // both fields, which made the outbound ledger unable to say that Olera,
  // not the family, spoke last.
  let { data: recipientIdentity } = await db
    .from("sms_inbound")
    .select("profile_id, profile_type")
    .eq("phone_last10", last10)
    .not("profile_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // A NEW CONVERSATION HAS NO INBOUND ROW. Texts started from the inbox
  // or a family's page go to people who never wrote in, so the identity
  // above is empty and quiet hours would fall back to a default zone: a
  // Dallas family texted on Eastern time. Find the family by number
  // instead. Stored formats vary, so match the common two.
  if (!recipientIdentity) {
    const familyId = await familyIdByPhone(db, last10);
    if (familyId) recipientIdentity = { profile_id: familyId, profile_type: "family" };
  }
  const loggedRecipientType =
    recipientIdentity?.profile_type === "family" ||
    recipientIdentity?.profile_type === "provider" ||
    recipientIdentity?.profile_type === "caregiver"
      ? recipientIdentity.profile_type
      : undefined;

  // Quiet hours. TCPA anchors to the RECIPIENT's clock, and until now this
  // path was the only one that ignored it: reactive-alerts.ts has deferred
  // since 2026-06-30, while the reply box a human drives sent whenever it
  // was clicked. On 2026-08-31 a reply to a GA family was one click from
  // going out at 6:52am with nothing on screen to say so.
  //
  // A crisis reply is exempt and sends immediately. Someone in crisis who
  // texted us at 3am is awake, has asked for help, and holding a safety
  // number until 8am to be polite about it would be indefensible.
  const { data: recipientProfile } = recipientIdentity?.profile_id
    ? await db
        .from("business_profiles")
        .select("state")
        .eq("id", recipientIdentity.profile_id)
        .maybeSingle()
    : { data: null };

  // Absent a packet we treat the thread as non-crisis: the webhook fires a
  // crisis acknowledgement of its own the moment one is detected, so the
  // safety net does not depend on this branch.
  const isCrisisThread = await threadIsCrisis(db, last10);

  const quiet = quietHoursCheck({ state: recipientProfile?.state ?? null });

  // Quiet hours are a DEFAULT, not a lock. The reviewer can always overrule
  // them, and the button that does it is on screen rather than behind a
  // menu — the moment you need to text someone outside their window is
  // usually the moment something is urgent, which is the worst possible
  // time to make the escape hatch cost an extra click to find.
  

  if (!quiet.allowed && !isCrisisThread && !sendNow && quiet.sendAfter) {
    const scheduled = await scheduleReply(db, {
      last10,
      e164: toE164(last10),
      body: text,
      sendAfter: quiet.sendAfter,
      actor: actor,
      recipientType: loggedRecipientType,
      profileId: recipientIdentity?.profile_id ?? null,
    });
    if (scheduled.error) {
      return { status: 500, json: { error: scheduled.error } };
    }

    await logAuditAction({
      adminUserId,
      action: "sms_reply_scheduled",
      targetType: "phone",
      targetId: last10,
      details: { length: text.length, sendAfter: quiet.sendAfter.toISOString(), tz: quiet.tz },
    });

    return { status: 200, json: {
      success: true,
      scheduled: { sendAfter: quiet.sendAfter.toISOString(), tz: quiet.tz },
    } };
  }

  const result = await sendSMS({
    to: toE164(last10),
    body: text,
    // Logged to email_log so a human reply appears alongside automated
    // sends in /admin/family-comms and counts toward the frequency cap.
    emailType: "admin_reply",
    recipientType: loggedRecipientType,
    recipientLogProfileId: recipientIdentity?.profile_id ?? undefined,
  });

  if (!result.success) {
    return { status: 502, json: { error: result.error || "Twilio rejected the message" } };
  }
  if (result.skipped) {
    return { status: 409, json: { error: "Message was suppressed before sending (do-not-contact or preferences)." } };
  }

  // Answering the thread IS handling it. The draft has served its purpose
  // and must go with it, or the box refills with the message just sent the
  // next time the thread is opened. Awaited, not fire-and-forget: Vercel
  // kills pending promises once the response is returned.
  await Promise.all([
    db
      .from("sms_inbound")
      .update({ handled_at: new Date().toISOString(), handled_by: actor })
      .eq("phone_last10", last10)
      .is("handled_at", null),
    db.from("sms_drafts").delete().eq("phone_last10", last10),
    // Close out the researched answer this reply came from, and record what
    // was ACTUALLY sent alongside what the engine proposed. The difference
    // between packet.draft and sent_body is the cheapest honest signal of
    // whether the engine is any good, and it needs no extra instrumentation.
    stampAnswerJobSent(db, last10, text, actor),
    // A person answered a benefits family: their reply hold lifts and the
    // cascade may resume (lib/family-comms/benefits-replies.server.ts).
    recipientIdentity?.profile_type === "family" && recipientIdentity.profile_id
      ? resumeAfterHumanReply(
          db,
          recipientIdentity.profile_id,
          new Date().toISOString(),
          `SMS reply by ${actor}`,
        ).catch((err) => console.error("[sms-inbox] benefits resume failed:", err))
      : Promise.resolve(),
  ]);

  await logAuditAction({
    adminUserId,
    action: "sms_reply_sent",
    targetType: "phone",
    targetId: last10,
    details: {
      length: text.length,
      // An out-of-window send is a deliberate override of a policy that
      // exists for the recipient's benefit. Record that it happened and
      // what the clock said where they are, so it is attributable later.
      ...(quiet.allowed
        ? {}
        : { quietHoursOverride: true, recipientTz: quiet.tz, crisis: isCrisisThread }),
    },
  });

  return { status: 200, json: { success: true } };
}
