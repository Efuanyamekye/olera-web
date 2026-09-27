/**
 * Benefits Care Navigator — the ONE send path for approved letters.
 *
 * Extracted from the admin per-family route so the scheduler cron and TJ's
 * "Send as TJ" button run byte-identical logic: same governance (the
 * benefits_first_step family caps, DNC, suppression — all inside sendEmail),
 * same cascade stamping (B2 keys off first_step_sent_at, so the check-in
 * schedules 3d after the REAL send), same consent-gated SMS companion.
 *
 * SMS quiet hours apply to both trigger paths. A manual click is not proof
 * that it is a civil hour where the family lives; texts outside 8am–8pm park
 * in sms_queue for the next window (email still sends immediately).
 *
 * Timing/gates are mirrored in lib/family-comms/journey.ts (the admin
 * sequence timeline) — keep that in sync when this path changes.
 */
import { companionActive } from "@/lib/family-comms/benefits-companion.server";
import { getBenefitsCompanionSettings } from "@/lib/analytics/benefits-companion-settings";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { careUnsubscribeUrl } from "@/lib/email-templates";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";
import { getSiteUrl } from "@/lib/site-url";
import { sendSMS } from "@/lib/twilio";
import { benefitsFirstStepSms } from "@/lib/sms/templates";
import { quietHoursCheck } from "@/lib/sms/quiet-hours";
import { withSmsSource } from "@/lib/sms/click-source";
import { readBenefitsCascade } from "./benefits-cascade.server";
import {
  readBenefitsNavigator,
  renderNavigatorEmail,
  type BenefitsNavigatorMeta,
} from "./benefits-navigator.server";
import { ROUTE_LABEL, holdLabel, isCaveatPacket, isRewritePacket, packetNeedsBuild } from "@/lib/benefits/navigator-packet";
import { readClearance } from "@/lib/benefits/navigator-gates.server";
import { DECEASED_UNSUB_SOURCE, isBenefitsAutomationHeld } from "./benefits-automation";
import { smsCarriesPhone } from "./sms-phone";

/**
 * Substitute the plan link, dropping any punctuation left flush against it.
 *
 * The link is the only tappable thing in the text, and some SMS clients pull a
 * trailing "." into the tapped URL, so the family lands on a 404 on the one
 * step we asked them to take. 78 of 130 pending drafts carried this on
 * 2026-08-23; every one of them followed the link with a space and a capital
 * letter, so dropping the period costs nothing readable and leaves whitespace
 * on both sides of the URL, which is what link detection needs.
 *
 * Fixing it here rather than in the prompt repairs every draft already sitting
 * in the queue, with no re-composition and no chance of altering a claim.
 */
/**
 * Where a family's reply lands.
 *
 * Every navigator letter closes with "You can reply to this email. My team and
 * I read every reply." That line is required by the composer's STRUCTURE rule,
 * so it is in all of them. The send used to read
 * `process.env.BENEFITS_NAVIGATOR_REPLY_TO || undefined` with no default, and
 * the variable was never set, so the promise was made on mail sent From
 * `noreply@olera.care` carrying no Reply-To header at all.
 *
 * The other two outbound systems both default rather than trusting the
 * environment: student outreach falls back to graize@olera.care, provider
 * outreach to hello@olera.care. This one was the only channel that could go
 * quiet by omission. support@olera.care is the monitored inbox, with Gmail
 * sync, Supabase triage state and the /email-checker sweep already built
 * around it, which is what "my team and I" refers to.
 */
const NAVIGATOR_REPLY_TO = process.env.BENEFITS_NAVIGATOR_REPLY_TO ?? "support@olera.care";

export function substituteSmsLink(draft: string, url: string): string {
  return draft.replace(/\{link\}[.,;:!?]*\s*/g, `${url} `).trimEnd();
}

export interface NavigatorSendOptions {
  profileId: string;
  /** Drawer overrides (the admin route passes TJ's live edits). Omitted →
   *  saved edits → AI original, in that order. */
  subject?: string | null;
  body?: string | null;
  sms?: string | null;
  /**
   * Who initiated the send. All paths respect recipient SMS quiet hours.
   * `auto` is the autopilot in the scheduler cron releasing a letter whose
   * packet routed it `auto` (TJ policy, 2026-09-24).
   */
  trigger: "admin" | "scheduler" | "auto";
  /**
   * Send anyway when the packet says this letter should not go as written.
   * Only ever set from an explicit human confirmation in the admin drawer;
   * the scheduler never sets it.
   */
  overridePacket?: boolean;
}

export type NavigatorSendResult =
  | { ok: true; navigator: BenefitsNavigatorMeta; /** SMS-only delivery moved to the next legal window. */ deferred?: boolean }
  | {
      ok: false;
      error: string;
      /** true = state conflict (409-ish), not a transport failure */
      conflict?: boolean;
      /** Another caller holds the send lock right now. Not a verdict on the
       *  letter: automated callers skip it without stamping a failure. */
      inFlight?: boolean;
      /** Something may have been delivered. The lock is kept so no caller
       *  can resend until a person checks. Internal. */
      keepClaim?: boolean;
    };

// ── The send lock ──────────────────────────────────────────────────────────

/**
 * A claim older than this is treated as a crash mid-send (the function was
 * killed between delivery and the final stamp) and may be reclaimed, but
 * only after the message log shows nothing went out under it. maxDuration on
 * every caller is at most 300s, so a live send never holds it this long.
 */
export const SEND_CLAIM_STALE_MS = 15 * 60 * 1000;

const IN_FLIGHT_ERROR = "This letter is already being sent. Refresh in a minute before trying again.";

/** Did a first-step email or text go out (or get queued) for this family since `sinceIso`? */
async function deliveredSince(
  db: SupabaseClient,
  profileId: string,
  email: string | null,
  phone: string | null,
  sinceIso: string,
): Promise<boolean | null> {
  const recipients = [email, phone].filter((v): v is string => !!v);
  if (recipients.length > 0) {
    const { data, error } = await db
      .from("email_log")
      .select("id")
      .in("recipient", recipients)
      .in("email_type", ["benefits_first_step", "benefits_first_step_sms"])
      .in("status", ["sent", "pending"])
      .gte("created_at", sinceIso)
      .limit(1);
    if (error) return null;
    if (data && data.length > 0) return true;
  }
  const { data: queued, error: qErr } = await db
    .from("sms_queue")
    .select("id")
    .eq("family_profile_id", profileId)
    .eq("email_type", "benefits_first_step_sms")
    .gte("created_at", sinceIso)
    .limit(1);
  if (qErr) return null;
  return !!queued && queued.length > 0;
}

/**
 * Take the send lock: a compare-and-set on the profile row that only one
 * caller can win. The UPDATE is filtered on the draft still being pending
 * AND on the claim being exactly what this caller read (absent, or the same
 * stale claim). Under Postgres row locking a second concurrent UPDATE waits,
 * re-evaluates that filter against the winner's row, matches nothing, and
 * returns zero rows. Fails safe: any error means no send.
 */
async function claimNavigatorSend(
  db: SupabaseClient,
  profileId: string,
  by: NavigatorSendOptions["trigger"],
): Promise<{ ok: true; claimId: string } | Extract<NavigatorSendResult, { ok: false }>> {
  const { data: profile, error: readErr } = await db
    .from("business_profiles")
    .select("email, phone, metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (readErr) return { ok: false, error: "Couldn't reserve this letter for sending. Try again." };
  if (!profile) return { ok: false, error: "Family not found", conflict: true };
  const meta = (profile.metadata as Record<string, unknown>) || {};
  const navigator = readBenefitsNavigator(meta);
  if (navigator.status !== "pending" || !navigator.body) {
    return { ok: false, error: "No pending draft for this family", conflict: true };
  }

  const prior = navigator.send_claim;
  if (prior?.at) {
    const age = Date.now() - Date.parse(prior.at);
    if (!(age >= SEND_CLAIM_STALE_MS)) {
      return { ok: false, error: IN_FLIGHT_ERROR, conflict: true, inFlight: true };
    }
    // A stale claim: a send was cut off. Before anyone sends again, check
    // whether that attempt actually delivered.
    const delivered = await deliveredSince(
      db,
      profileId,
      (profile.email as string | null) ?? null,
      (profile.phone as string | null) ?? null,
      prior.at,
    );
    if (delivered !== false) {
      return {
        ok: false,
        conflict: true,
        error:
          delivered === null
            ? "An earlier send of this letter was interrupted and the message log could not be checked. Try again shortly."
            : "An earlier send of this letter was interrupted after a message went out. Check the family's timeline, then dismiss this draft instead of sending it again.",
      };
    }
  }

  const claim = { id: crypto.randomUUID(), at: new Date().toISOString(), by };
  let update = db
    .from("business_profiles")
    .update({ metadata: { ...meta, benefits_navigator: { ...navigator, send_claim: claim } } })
    .eq("id", profileId)
    .eq("metadata->benefits_navigator->>status", "pending");
  update = prior?.id
    ? update.eq("metadata->benefits_navigator->send_claim->>id", prior.id)
    : update.is("metadata->benefits_navigator->send_claim", null);
  const { data: won, error: claimErr } = await update.select("id");
  if (claimErr) return { ok: false, error: "Couldn't reserve this letter for sending. Try again." };
  if (!won || won.length === 0) {
    return { ok: false, error: IN_FLIGHT_ERROR, conflict: true, inFlight: true };
  }
  return { ok: true, claimId: claim.id };
}

/** Drop the lock after a send that delivered nothing, if it is still ours. */
async function releaseNavigatorSend(db: SupabaseClient, profileId: string, claimId: string) {
  const { data: row } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (row?.metadata as Record<string, unknown> | null) || {};
  const navigator = readBenefitsNavigator(meta);
  if (navigator.send_claim?.id !== claimId) return;
  await db
    .from("business_profiles")
    .update({ metadata: { ...meta, benefits_navigator: { ...navigator, send_claim: undefined } } })
    .eq("id", profileId)
    .eq("metadata->benefits_navigator->send_claim->>id", claimId);
}

/**
 * Send a pending navigator letter. Every caller (TJ's button, the scheduler,
 * the autopilot) goes through the send lock first, so two of them racing on
 * the same letter produce one delivery: the loser gets `inFlight`.
 */
export async function sendNavigatorLetter(
  db: SupabaseClient,
  opts: NavigatorSendOptions,
): Promise<NavigatorSendResult> {
  const claim = await claimNavigatorSend(db, opts.profileId, opts.trigger);
  if (!claim.ok) return claim;
  // Released only when we know nothing went out. A throw is not that: the
  // email may have been accepted before it. The claim then goes stale and
  // the next caller checks the message log before sending.
  const result = await deliverNavigatorLetter(db, opts);
  if (!result.ok && !result.keepClaim) {
    try {
      await releaseNavigatorSend(db, opts.profileId, claim.claimId);
    } catch (err) {
      console.error("[navigator send] releasing the send lock failed:", opts.profileId, err);
    }
  }
  return result;
}

async function deliverNavigatorLetter(
  db: SupabaseClient,
  opts: NavigatorSendOptions,
): Promise<NavigatorSendResult> {
  const { profileId } = opts;
  const { data: profile } = await db
    .from("business_profiles")
    .select("id, email, phone, phone_validity, state, metadata")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Family not found", conflict: true };

  const meta = (profile.metadata as Record<string, unknown>) || {};
  const navigator = readBenefitsNavigator(meta);
  if (navigator.status !== "pending" || !navigator.body) {
    return { ok: false, error: "No pending draft for this family", conflict: true };
  }
  /**
   * The family's own "stop these emails". The coordinator honors this flag
   * at rung 0, but this path never read it, so a family who unsubscribed
   * after their draft was composed could still receive the letter and its
   * companion text. Blocks every trigger, including TJ's button: the family
   * asked, and no override should be one click from ignoring that.
   */
  if (meta.nudges_unsubscribed === true) {
    return {
      ok: false,
      conflict: true,
      error:
        meta.nudges_unsubscribed_source === DECEASED_UNSUB_SOURCE
          ? "A reply suggested someone in this family died, so messages are paused. Check the reply, then resume automation if it was a mistake."
          : "This family unsubscribed from these messages.",
    };
  }
  /**
   * Any reply from the family pauses automated sends until a person has read
   * it. The scheduler and the autopilot stop here; TJ's own button does not,
   * because a person clicking Send after reading the reply is the point.
   */
  if (opts.trigger !== "admin" && isBenefitsAutomationHeld(meta)) {
    return {
      ok: false,
      conflict: true,
      error: "The family replied, so automated sends are paused until someone reads it and resumes.",
    };
  }
  /**
   * The packet gate. This is the ONE choke point both send paths share, so it
   * is the only place a verdict can actually stop a letter.
   *
   * `recompose` means an independent read found the family's own stated facts
   * rule this program out; `ask` means we never held enough to pick and the
   * letter is a guess. Neither should reach a family by default. A UI that
   * merely unticks a checkbox is not a guard — the scheduler cron does not
   * render checkboxes, and a letter scheduled before its packet existed would
   * otherwise fire on the verdict's blind side.
   *
   * Deliberately NOT blocked: `review`, an unbuilt packet, or a packet whose
   * gates errored. Those mean "a person should look", and a person clicking
   * Send is that person looking. Blocking them would strand the queue behind
   * a cron.
   */
  const route = navigator.packet?.route;
  /**
   * The autopilot may only release a letter whose CURRENT text was judged
   * clean. The caller already filters on this; repeating it at the choke
   * point means no future caller can pass `auto` for a letter nobody cleared.
   */
  if (opts.trigger === "auto" && (route !== "auto" || packetNeedsBuild(navigator))) {
    return {
      ok: false,
      conflict: true,
      error: "Only a letter whose current text routed `auto` can send without a person.",
    };
  }
  if ((route === "recompose" || route === "ask") && !opts.overridePacket) {
    const why = navigator.packet?.holds[0] ? holdLabel(navigator.packet.holds[0]) : ROUTE_LABEL[route];
    return {
      ok: false,
      conflict: true,
      error:
        navigator.packet && isCaveatPacket(navigator.packet)
          ? "This letter is waiting for its automatic rewrite (kept their program, adding the condition). Recompose it, or send anyway if you disagree."
          : navigator.packet && isRewritePacket(navigator.packet)
          ? "This letter tells the family they said they need something they never told us. It is waiting for an automatic re-draft of the same program. Recompose it, or edit that sentence out."
          : route === "recompose"
          ? `This letter's program was ruled out: ${why}. Recompose it, or send anyway if you disagree.`
          : `We do not know enough about this family to pick a program: ${why}. Ask them first, or send anyway if you disagree.`,
    };
  }

  /**
   * The facts gate, alongside the fit gate above. The packet judges whether
   * this program is the right PICK; this judges whether the record the letter
   * anchors on is structurally sound enough to print. Synchronous, no model
   * call, no cost: readClearance reads the deployed pipeline bundle.
   *
   * Blocks only STRUCTURAL defects, never mere staleness. That distinction is
   * the whole design. A null lead phone, prose where a number goes, an
   * "Example: ..." label or an empty document list are objectively wrong and
   * produce letters like "Call X at Contact information not specified in
   * available sources" — one of those was one click from a family on
   * 2026-08-23. Being unverified is different: only 155 of 642 programs have
   * ever been verified, so blocking on the stamp would stop three letters in
   * four and strand the queue. Unverified means "nobody looked", and a person
   * clicking Send is a person looking.
   *
   * Shares overridePacket deliberately. Both gates ask the same question of a
   * human — the automation says no, do you disagree — and one override keeps
   * the admin drawer from growing a second checkbox for the same decision.
   */
  const clearance = navigator.pick?.programId
    ? readClearance(navigator.pick.stateId ?? null, navigator.pick.programId, 90)
    : null;
  if (clearance && clearance.highFindings.length > 0 && !opts.overridePacket) {
    return {
      ok: false,
      conflict: true,
      error:
        `The program this letter anchors on has an unresolved data problem (${clearance.highFindings.join(", ")}). ` +
        `Fix the program record, or send anyway if you disagree.`,
    };
  }

  // A family in the benefits text companion hears from it by text; the
  // letter still goes by email so there is one text stream, not two.
  const inCompanion = companionActive(meta as Record<string, unknown>, await getBenefitsCompanionSettings());
  const smsEligible =
    !!profile.phone && !!(meta as { sms_consent?: unknown }).sms_consent &&
    profile.phone_validity !== "opted_out" && !inCompanion;
  if (!profile.email && !smsEligible) {
    return { ok: false, error: "Family has no reachable consented channel", conflict: true };
  }

  const now = new Date().toISOString();
  // Preference ladder: request edits → saved edits → AI original.
  const subject =
    typeof opts.subject === "string" && opts.subject.trim()
      ? opts.subject.trim().slice(0, 150)
      : navigator.edited_subject || navigator.subject || "Your first step";
  const letter =
    typeof opts.body === "string" && opts.body.trim().length >= 40
      ? opts.body.trim()
      : navigator.edited_body || navigator.body;

  const siteUrl = getSiteUrl();
  const { data: tokenRow } = await db
    .from("benefits_results_tokens")
    .select("token")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const planPath = tokenRow?.token
    ? `/m/${tokenRow.token}`
    : navigator.pick?.programPath || "/benefits";

  // #call-script lands the family on the opened script section — the letter
  // says "the script is written on your plan page", so the tap should keep
  // that promise, not drop them at the top to go hunting.
  let emailDelivered = false;
  if (profile.email) {
    const planUrl = generateFamilyInboxUrl(
      profile.email,
      tokenRow?.token ? `${planPath}#call-script` : planPath,
      siteUrl,
    );
    const html = renderNavigatorEmail({
      body: letter,
      planUrl,
      unsubscribeUrl: careUnsubscribeUrl(profileId),
      call: navigator.pick?.contactPhone ? { phone: navigator.pick.contactPhone } : null,
    });

    // Same governed type as the old B1 email: the family nudge caps, DNC
    // kill switch, and suppression checks all apply inside sendEmail.
    const result = await sendEmail({
      to: profile.email,
      subject,
      html,
      emailType: "benefits_first_step",
      recipientType: "family",
      recipientProfileId: profileId,
      replyTo: NAVIGATOR_REPLY_TO,
      listUnsubscribeUrl: careUnsubscribeUrl(profileId),
      metadata: {
        navigator: true,
        program_id: navigator.pick?.programId || null,
        scheduled: opts.trigger === "scheduler" || undefined,
        auto: opts.trigger === "auto" || undefined,
      },
    });
    if (!result.success || result.skipped) {
      return { ok: false, error: result.skipReason || result.error || "unknown" };
    }
    emailDelivered = true;
  }

  // Stamp the cascade exactly as the old B1 rung did — B2 keys off
  // first_step_sent_at, so the check-in schedules 3d after the REAL send.
  const cascade = readBenefitsCascade(meta);
  const nextCascade: Record<string, unknown> = { ...cascade };
  let smsDelivered = false;
  let smsDeliveryAt = now;
  let sentSms: string | undefined;

  // Consent-gated SMS companion, same gate as the coordinator's cascade
  // mirror (phone + sms_consent + not opted out). Body preference mirrors the
  // letter: request edit, then saved edit, then the composed TJ-voiced draft,
  // then the old template. The composed text carries a {link} placeholder
  // (direct URL, not a magic link — SMS length budget) and the STOP suffix is
  // appended here so the model never writes compliance copy. Awaited: Vercel
  // kills pending promises after the response.
  if (smsEligible && profile.phone && navigator.pick) {
    // Tagged so an arrival on the plan page can be attributed to THIS text
    // rather than to the email carrying the same destination.
    const smsPlanUrl = withSmsSource(`${siteUrl}${planPath}`, "benefits_first_step_sms");
    const editedSms =
      typeof opts.sms === "string" && opts.sms.trim().length >= 20
        ? opts.sms.trim().slice(0, 400)
        : null;
    /**
     * The text must carry the program's phone number. The composer used to
     * be told to write no phone numbers, so its texts were link-only
     * ("Olera's care team here... {link}"). Families replied "I need the
     * phone number", and that text had the worst STOP rate of any we send
     * (5.6%). Whatever text would send (drawer edit, saved edit, model
     * draft), if it lacks the number the deterministic template goes
     * instead, which always has it. The drawer resubmits the model's draft
     * as an "edit" on every send and schedule, so an edit is not evidence
     * that a person chose to drop the number. This repairs every pending
     * draft without recomposing it.
     */
    const preferredSms = editedSms || navigator.edited_sms || navigator.sms || null;
    const draftSms =
      preferredSms && smsCarriesPhone(preferredSms, navigator.pick.contactPhone)
        ? preferredSms
        : null;
    // Append the opt-out line only when it isn't already there (the model
    // is told not to write it, but a disobedient draft or a TJ edit that
    // includes it must not produce a doubled STOP line).
    // Older pending drafts predate structured replies. Upgrade them at send
    // time so every live B1 text has the same actionable contract.
    const progressSuffix =
      draftSms && !/\bCALLED\b/i.test(draftSms)
        ? " Reply CALLED, NO ANSWER, or STUCK."
        : "";
    const stopSuffix = draftSms && /reply stop/i.test(draftSms) ? "" : " Reply STOP to opt out.";
    const smsBody = draftSms
      ? `${substituteSmsLink(draftSms, smsPlanUrl)}${progressSuffix}${stopSuffix}`
      : benefitsFirstStepSms({
          programShortName: navigator.pick.shortName,
          phone: navigator.pick.contactPhone,
          url: smsPlanUrl,
        });

    const quiet = quietHoursCheck({ state: profile.state as string | null });
    if (quiet.allowed) {
      const sms = await sendSMS({
        to: profile.phone,
        body: smsBody,
        emailType: "benefits_first_step_sms",
        recipientType: "family",
        recipientLogProfileId: profileId,
      });
      if (sms.success && !sms.skipped) {
        smsDelivered = true;
        nextCascade.first_step_sms_at = now;
        sentSms = smsBody;
      } else if (sms.error?.includes("21610")) {
        await db
          .from("business_profiles")
          .update({ phone_validity: "opted_out" })
          .eq("id", profileId);
      }
    } else {
      const sendAfter = (quiet.sendAfter ?? new Date()).toISOString();
      if (!profile.email) {
        // A queued companion may safely ride behind an email, but for a
        // text-only family the text IS B1. Keep the draft pending and move
        // its scheduler time to the next legal window so the admin never
        // claims delivery before Twilio has actually accepted the message.
        const deferredNavigator: BenefitsNavigatorMeta = {
          ...navigator,
          edited_subject: subject,
          edited_body: letter,
          edited_sms: draftSms,
          edited_at: now,
          scheduled_at: sendAfter,
          schedule_failed_at: undefined,
          schedule_failed_reason: undefined,
          send_claim: undefined,
        };
        const { error: deferErr } = await db
          .from("business_profiles")
          .update({ metadata: { ...meta, benefits_navigator: deferredNavigator } })
          .eq("id", profileId);
        if (deferErr) return { ok: false, error: "Couldn't defer the text to the next send window" };
        return { ok: true, navigator: deferredNavigator, deferred: true };
      }
      // Scheduled fire outside the recipient's 8am–8pm window: the email is
      // out, the text waits for morning. sms-queue-flush re-checks opt-out
      // and the daily throttle at delivery — a STOP overnight cancels it.
      const { error: qErr } = await db.from("sms_queue").insert({
        to_phone: profile.phone,
        body: smsBody,
        email_type: "benefits_first_step_sms",
        recipient_type: "family",
        family_profile_id: profileId,
        send_after: sendAfter,
      });
      if (!qErr) {
        smsDelivered = true;
        smsDeliveryAt = sendAfter;
        nextCascade.first_step_sms_queued_for = sendAfter;
        sentSms = smsBody;
      } else {
        console.error("[navigator send] SMS quiet-hours enqueue failed:", qErr);
      }
    }
  }

  // For email families, SMS is a best-effort companion. For SMS-only
  // families it is the primary delivery, so a failed/skipped text must leave
  // the draft pending and retryable instead of pretending B1 was sent.
  if (!emailDelivered && !smsDelivered) {
    return { ok: false, error: "Navigator text could not be delivered" };
  }

  const firstStepAt = emailDelivered ? now : smsDeliveryAt;
  Object.assign(nextCascade, {
    first_step_sent_at: firstStepAt,
    first_step_program_id: navigator.pick?.programId,
    first_step_state_id: navigator.pick?.stateId || undefined,
    first_step_program_name: navigator.pick?.shortName,
  });
  const nextNavigator: BenefitsNavigatorMeta = {
    ...navigator,
    status: "sent",
    sent_at: firstStepAt,
    sent_via: opts.trigger,
    sent_subject: profile.email ? subject : undefined,
    sent_body: profile.email ? letter : undefined,
    sent_sms: sentSms,
    scheduled_at: undefined,
    schedule_failed_at: undefined,
    schedule_failed_reason: undefined,
    send_claim: undefined,
  };

  const { error: sErr } = await db
    .from("business_profiles")
    .update({
      metadata: { ...meta, benefits_cascade: nextCascade, benefits_navigator: nextNavigator },
    })
    .eq("id", profileId);
  if (sErr) {
    // A delivery went out; a failed stamp must be visible, not silent.
    console.error("[navigator send] delivery succeeded but stamp failed:", sErr);
    return {
      ok: false,
      error: "Message sent, but recording it failed. Refresh before retrying.",
      keepClaim: true,
    };
  }
  return { ok: true, navigator: nextNavigator };
}

/**
 * Record a blocked scheduled fire: clear the schedule (no hourly retry loops
 * into the same governance cap) and stamp the reason where the admin queue
 * shows it. The draft stays pending — TJ reschedules or sends manually.
 */
export async function markScheduleFailed(
  db: SupabaseClient,
  profileId: string,
  reason: string,
): Promise<void> {
  const { data: row } = await db
    .from("business_profiles")
    .select("metadata")
    .eq("id", profileId)
    .maybeSingle();
  const meta = (row?.metadata as Record<string, unknown> | null) || {};
  const navigator = readBenefitsNavigator(meta);
  if (navigator.status !== "pending") return;
  const next: BenefitsNavigatorMeta = {
    ...navigator,
    scheduled_at: undefined,
    schedule_failed_at: new Date().toISOString(),
    schedule_failed_reason: reason.slice(0, 300),
  };
  await db
    .from("business_profiles")
    .update({ metadata: { ...meta, benefits_navigator: next } })
    .eq("id", profileId);
}
