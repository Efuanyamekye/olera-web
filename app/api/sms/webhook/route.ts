import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";
import { normalizeUSPhone } from "@/lib/twilio";
import { smsHelpReply, familyAnswerAckSms } from "@/lib/sms/templates";
import { detectCrisis, crisisLabel, type CrisisResult } from "@/lib/sms/crisis";
import { isCourtesyOnlyReply, matchOutcomeReply } from "@/lib/sms/inbound-intent";
import { sendReactiveFamilyAlert } from "@/lib/sms/reactive-alerts";
import { captureOutcome, outcomeFromKeyword } from "@/lib/family-answers/outcome.server";
import { interpretBenefitsSmsReply } from "@/lib/family-comms/benefits-sms-replies.server";
import { readBenefitsCascade } from "@/lib/family-comms/benefits-cascade.server";
import {
  storeInboundMessage,
  suppressPhone,
  unsuppressPhone,
} from "@/lib/sms/inbound-store.server";

/**
 * POST /api/sms/webhook
 *
 * Inbound SMS handler for care-seeker texting. Twilio posts here on every reply
 * to our number. We use it for TCPA opt-out/opt-in + HELP:
 *
 *   STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → opt out
 *     → set phone_validity='opted_out' on the matching family profile(s).
 *   START / UNSTOP / YES → opt back in (clear opted_out).
 *   HELP / INFO → reply with a one-line help message.
 *
 * Twilio's carrier-level Advanced Opt-Out may also auto-handle STOP/START/HELP;
 * recording it here keeps OUR send path honest regardless (sendSMS callers check
 * phone_validity before texting). Verifies X-Twilio-Signature. Always 200s with
 * TwiML so Twilio doesn't retry.
 *
 * STORAGE (migration 166): every inbound message is written to `sms_inbound`
 * first, before any keyword branching, matched to an account or not. This used
 * to be family-only — a text from a provider or an unknown number was stored
 * nowhere, alerted nobody, and existed only in Twilio. Since most of our
 * outbound SMS goes to providers, that made us deaf on our busiest lane.
 *
 * OPT-OUT also writes do_not_contact (the cross-channel kill switch sendSMS
 * enforces), not just family phone_validity. A provider who texted STOP was
 * previously a complete no-op, and one was re-texted 11 days later.
 *
 * NOTE: matching phone → profile scans family profiles and filters in JS because
 * stored phone formats vary and we have no normalized-phone column. Inbound
 * opt-out volume is low, so this is acceptable; revisit if it grows.
 */

const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN_KEYWORDS = new Set(["START", "UNSTOP", "YES"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

const HELP_REPLY = smsHelpReply();

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

function twiml(message?: string) {
  const body = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : "<Response/>";
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string)
  );
}

function buildWebhookUrl(request: NextRequest): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (siteUrl) {
    const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    return `${base}/api/sms/webhook`;
  }
  return request.url;
}

/** Last 10 digits of a phone, for format-agnostic matching. */
function last10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Family profiles whose phone matches, format-agnostic. */
async function matchFamilyProfiles(
  phone: string,
): Promise<
  {
    id: string;
    display_name: string | null;
    email: string | null;
    metadata: Record<string, unknown>;
    // state + phone_validity feed the acknowledgement send: quiet hours are
    // evaluated in the RECIPIENT's timezone, and an opted-out number must
    // never be texted back even though they just texted us.
    state: string | null;
    phone_validity: string | null;
  }[]
> {
  const db = getServiceDb();
  if (!db) return [];
  const target = last10(phone);
  if (!target) return [];
  const { data: rows } = await db
    .from("business_profiles")
    .select("id, phone, display_name, email, metadata, state, phone_validity")
    .eq("type", "family")
    .not("phone", "is", null);
  return (rows ?? []).filter((r) => last10(String(r.phone ?? "")) === target) as never;
}

/**
 * Persist an inbound text on the matched profile(s) so the case timeline can
 * tell the story (metadata.sms_inbound, capped at 20). A family texting back
 * is the highest-intent signal we get — it must never evaporate.
 */
async function recordInbound(
  phone: string,
  body: string,
  keyword: string | null,
  alertUnstructured = false,
): Promise<{
  response?: string;
  structured: boolean;
  /** First matched family profile, so callers can act without re-querying. */
  profile?: Awaited<ReturnType<typeof matchFamilyProfiles>>[number];
}> {
  const db = getServiceDb();
  if (!db) return { structured: false };
  const profiles = await matchFamilyProfiles(phone);
  const at = new Date().toISOString();
  let response: string | undefined;
  let structured = false;
  let humanAlert: string | null = null;
  for (const p of profiles) {
    const meta = p.metadata || {};
    const inbound = Array.isArray(meta.sms_inbound) ? (meta.sms_inbound as unknown[]) : [];
    const isBenefitsFamily = Boolean(
      meta.benefits_results || meta.benefits_cascade || meta.benefits_navigator,
    );
    const benefitsReply = keyword && isBenefitsFamily
      ? interpretBenefitsSmsReply(keyword, readBenefitsCascade(meta), at)
      : null;
    if (benefitsReply) {
      structured = true;
      response ||= benefitsReply.response;
      if (benefitsReply.needsHuman) humanAlert = benefitsReply.label;
    }
    // Store a keyword only when it has semantic meaning. The normalized
    // parser token for an ordinary sentence ("I can't find the form" →
    // ICANTFINDTHEFORM) must not hide the real body from the admin's free-form
    // reply chip and timeline.
    const storedKeyword = benefitsReply ? keyword : alertUnstructured ? null : keyword;
    await db
      .from("business_profiles")
      .update({
        metadata: {
          ...meta,
          sms_inbound: [...inbound, { at, body: body.slice(0, 500), keyword: storedKeyword }].slice(-20),
          ...(benefitsReply ? { benefits_cascade: benefitsReply.cascade } : {}),
        },
      })
      .eq("id", p.id);
  }
  // A free-form reply or an explicit STUCK reply deserves a human. Other
  // structured updates move the plan forward without creating queue noise.
  if (((alertUnstructured && !structured) || humanAlert) && profiles.length > 0) {
    try {
      const { sendSlackAlert } = await import("@/lib/slack");
      const who = profiles[0].display_name || profiles[0].email || phone;
      await sendSlackAlert(
        humanAlert
          ? `Benefits family needs help: ${who} ${humanAlert}. Reply from the Benefits queue (/admin/benefits)`
          : `Family texted back: ${who}: "${body.slice(0, 300)}" - reply from the Benefits queue (/admin/benefits)`,
      );
    } catch (err) {
      console.error("[sms-webhook] Slack ping failed:", err);
    }
  }
  return { response, structured, profile: profiles[0] };
}

/** Set phone_validity for every family profile whose phone matches `phone`. */
async function setFamilyPhoneValidity(
  phone: string,
  validity: "opted_out" | "unverified"
): Promise<number> {
  const db = getServiceDb();
  if (!db) return 0;
  const target = last10(phone);
  if (!target) return 0;

  const { data: rows, error } = await db
    .from("business_profiles")
    .select("id, phone")
    .eq("type", "family")
    .not("phone", "is", null);
  if (error || !rows) return 0;

  const ids = rows.filter((r) => last10(String(r.phone ?? "")) === target).map((r) => r.id);
  if (ids.length === 0) return 0;

  await db.from("business_profiles").update({ phone_validity: validity }).in("id", ids);
  return ids.length;
}

/**
 * Ping a human for an inbound text that no automation will answer. recordInbound
 * only alerts when a FAMILY profile matched, so without this a provider's reply
 * reached nobody — exactly how "I can't open that link, send me the family's
 * details" from a provider's AI receptionist was lost.
 */
async function alertUnmatchedInbound(
  phone: string,
  body: string,
  who: string | null,
): Promise<void> {
  try {
    const { sendSlackAlert } = await import("@/lib/slack");
    const label = who ? `${who} (${phone})` : phone;
    await sendSlackAlert(
      `Text from ${label}: "${body.slice(0, 300)}" - reply from the SMS inbox (/admin/inbox)`,
    );
  } catch (err) {
    console.error("[sms-webhook] Unmatched-inbound Slack ping failed:", err);
  }
}

/**
 * Page a human immediately for a message with crisis language. No automated
 * reply goes out: there is no safe canned response to "I want to die" from a
 * benefits directory, and sending one risks implying we are a crisis service.
 */
async function pageCrisis(
  phone: string,
  body: string,
  who: string | null,
  crisis: CrisisResult,
): Promise<void> {
  try {
    const { sendSlackAlert } = await import("@/lib/slack");
    const label = crisis.category ? crisisLabel(crisis.category) : "possible crisis";
    const name = who ? `${who} (${phone})` : phone;
    await sendSlackAlert(
      `🚨 URGENT — ${label} in a text from ${name}: "${body.slice(0, 300)}" ` +
        `(matched: ${crisis.matched.join(", ")}). No auto-reply was sent. Respond from /admin/inbox.`,
    );
  } catch (err) {
    console.error("[sms-webhook] Crisis page failed:", err);
  }
}

/**
 * True when this number already got, or is already owed, a "we're looking into
 * it" text. On 18 Aug a family sent two near-identical messages 44 seconds
 * apart; without this they would receive two identical acknowledgements, which
 * reads as broken rather than attentive.
 *
 * TWO sources, and the second is not optional. An ack that lands outside the
 * recipient's quiet-hours window is parked in sms_queue and writes NO email_log
 * row until the flush cron delivers it. That is exactly the 18 Aug case: the
 * text arrived at 6:43am ET, which is before the 8am window opens, so an
 * email_log-only check would find nothing, queue a second ack, and deliver both
 * in a burst at 8am. Checking only the sent-log would have failed in precisely
 * the scenario this dedupe exists for.
 *
 * Fails OPEN (returns false) on a query error: a duplicate ack is a much
 * smaller harm than silence.
 */
const ACK_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

async function ackedRecently(phone: string): Promise<boolean> {
  const db = getServiceDb();
  if (!db) return false;

  // Already delivered (or attempted) inside the window.
  const since = new Date(Date.now() - ACK_DEDUPE_WINDOW_MS).toISOString();
  const { count: sent, error: sentError } = await db
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("channel", "sms")
    .eq("email_type", "care_seeker_ack")
    .eq("recipient", phone)
    .gte("created_at", since);
  if (!sentError && typeof sent === "number" && sent > 0) return true;

  // Or still waiting on quiet hours. No time bound here: a pending row is by
  // definition an ack this number has not received yet.
  const { count: queued, error: queuedError } = await db
    .from("sms_queue")
    .select("id", { count: "exact", head: true })
    .eq("email_type", "care_seeker_ack")
    .eq("to_phone", phone)
    .eq("status", "pending");
  if (!queuedError && typeof queued === "number" && queued > 0) return true;

  return false;
}

/**
 * A family sent us a free-form question. Acknowledge it and queue the research.
 *
 * Everything here is best-effort and swallows its own errors: none of it may
 * break the webhook's 200, because failing to answer Twilio causes retries and
 * duplicate inbound rows.
 */
async function triageFamilyQuestion(args: {
  phone: string;
  body: string;
  twilioSid: string | null;
  profile: Awaited<ReturnType<typeof matchFamilyProfiles>>[number] | undefined;
  who: string | null;
}): Promise<void> {
  const { phone, body, twilioSid, profile, who } = args;

  // Crisis first, always. A crisis message gets a human and nothing else.
  const crisis = detectCrisis(body);
  if (crisis.isCrisis) {
    await pageCrisis(phone, body, who, crisis);
    return;
  }

  const db = getServiceDb();

  // Acknowledge. sendReactiveFamilyAlert owns quiet hours, the opted-out
  // check, the daily safety cap, and the deferred-send queue, so this call
  // stays honest about all four without repeating any of them here.
  if (profile && !(await ackedRecently(phone))) {
    const result = await sendReactiveFamilyAlert({
      familyProfileId: profile.id,
      phone,
      state: profile.state,
      phoneValidity: profile.phone_validity,
      emailType: "care_seeker_ack",
      body: familyAnswerAckSms(),
    });
    if (result.status === "skipped") {
      console.log(`[sms-webhook] Ack skipped for ${phone}: ${result.reason}`);
    }
  }

  // Queue the research. One open job per phone: a family who sends three
  // messages in a row has asked one question, not three, and the Phase 2
  // worker reads the whole recent thread from sms_inbound rather than only
  // this row's body.
  //
  // The thread key is computed once. family_answer_jobs.phone_last10 is NOT
  // NULL, so a number we cannot key (a short code, a malformed From) must be
  // dropped here rather than sent to the insert. Unreachable in practice —
  // reaching this function at all required a family profile to match on the
  // same last-10 — but the column contract should not depend on that.
  const key = last10(phone);
  if (!db || !key) return;
  try {
    // One open job per phone, but the later messages must JOIN it rather than
    // vanish. On 2026-08-31 a care seeker texted "No answer stuck", then 92
    // seconds later "Need clothes need 30 meals cuz 10 is not enough I need
    // help with everything". The second was dropped here, so the engine
    // triaged and answered the first — the throwaway status word — while the
    // message carrying her actual need never became the question.
    //
    // Appending keeps the dedupe doing its real job (one research run per
    // burst, not three) while making that run answer everything she said.
    const { data: open } = await db
      .from("family_answer_jobs")
      .select("id, body, status")
      .eq("phone_last10", key)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      // Skip a duplicate: Twilio retries a webhook it thinks failed, and the
      // same text appended twice would read as the family repeating herself.
      if (open.body.includes(body.trim())) return;
      const merged = `${open.body}\n${body.trim()}`.slice(0, 2_000);
      const { error: appendError } = await db
        .from("family_answer_jobs")
        .update({ body: merged })
        .eq("id", open.id);
      if (appendError) console.error("[sms-webhook] Job append failed:", appendError);
      // A `running` job has already been handed its body, so this only reaches
      // the family on a retry. Still worth writing: the alternative is losing
      // the message entirely, which is what happened before.
      return;
    }

    const { error } = await db.from("family_answer_jobs").insert({
      phone_last10: key,
      profile_id: profile?.id ?? null,
      twilio_sid: twilioSid,
      body: body.slice(0, 2_000),
    });
    if (error) console.error("[sms-webhook] Job enqueue failed:", error);
  } catch (err) {
    console.error("[sms-webhook] Job enqueue threw:", err);
  }
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[sms-webhook] TWILIO_AUTH_TOKEN not configured");
    return twiml();
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const signature = request.headers.get("x-twilio-signature") || "";
  const url = buildWebhookUrl(request);
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    console.error("[sms-webhook] Invalid Twilio signature");
    return new NextResponse("<Response/>", { status: 403, headers: { "Content-Type": "text/xml" } });
  }

  const from = (params.From || "").trim();
  const normalizedFrom = normalizeUSPhone(from) ?? from;
  const keyword = (params.Body || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const messageBody = (params.Body || "").trim();
  // The outcome vocabulary is read word by word, not from the collapsed token
  // above. "No Stuck" collapses to NOSTUCK and matches nothing; read as words
  // it is a negator against a keyword, which is a human's call, not a guess.
  const outcome = matchOutcomeReply(messageBody);
  // High-confidence conversational close. Crisis wins even if a message also
  // contains thanks ("thank you, but I want to die" must never be dismissed).
  const courtesyOnly =
    Boolean(messageBody) &&
    !detectCrisis(messageBody).isCrisis &&
    isCourtesyOnlyReply(messageBody);
  const isControlKeyword =
    OPT_OUT_KEYWORDS.has(keyword) || OPT_IN_KEYWORDS.has(keyword) || HELP_KEYWORDS.has(keyword);

  // Durable capture BEFORE any branching, so no code path below can drop a
  // message. The family-profile work that follows is an additional step, not
  // the storage layer — that inversion is what made us deaf to providers.
  //
  // Only a control keyword is stored in `keyword`; a free-form sentence
  // normalizes to junk ("I can't find the form" → ICANTFINDTHEFORM) and must
  // not masquerade as a recognized token. The full body is always kept.
  let senderType: string | null = null;
  let senderName: string | null = null;
  try {
    const captured = await storeInboundMessage({
      twilioSid: params.MessageSid || null,
      fromPhone: normalizedFrom,
      body: messageBody || keyword,
      keyword: isControlKeyword ? keyword : null,
      autoHandleIfFamily: courtesyOnly,
    });
    senderType = captured.sender.profileType;
    senderName = captured.sender.displayName;
  } catch (err) {
    console.error("[sms-webhook] Durable capture failed:", err);
  }

  try {
    // City lead offer chain FIRST. "YES" is also a TCPA opt-in keyword, so a
    // provider accepting an offer must be recognised before that branch, or
    // the acceptance is swallowed as a re-subscribe. Scoped to numbers with a
    // recent offer, so a family's YES never reaches this.
    if (messageBody && !OPT_OUT_KEYWORDS.has(keyword)) {
      const db = getServiceDb();
      if (db) {
        try {
          const { handleProviderReply } = await import("@/lib/city-ads/offers.server");
          const reply = await handleProviderReply(db, normalizedFrom, messageBody);
          if (reply) return twiml(reply);
        } catch (err) {
          console.error("[sms-webhook] City offer reply handling failed:", err);
        }
        // Follow-ups: the family's day-2 "did they reach you?" and the
        // provider's day-7/21 outcome. Both are scoped to a phone with an
        // outstanding question, so a stray digit from anyone else falls
        // through to the benefits and family-answer handlers below.
        try {
          const { handleFamilyCheckReply, handleOutcomeReply } = await import("@/lib/city-ads/followups.server");
          const familyReply = await handleFamilyCheckReply(db, normalizedFrom, messageBody);
          if (familyReply) return twiml(familyReply);
          const outcomeReply = await handleOutcomeReply(db, normalizedFrom, messageBody);
          if (outcomeReply) return twiml(outcomeReply);
        } catch (err) {
          console.error("[sms-webhook] City follow-up reply handling failed:", err);
        }
      }
    }
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      // Cross-channel suppression first — this is the only opt-out record that
      // covers a sender with no family profile, and sendSMS enforces it.
      const suppressed = await suppressPhone(
        normalizedFrom,
        `Texted "${messageBody.slice(0, 80)}" to the Olera SMS number`,
      );
      const n = await setFamilyPhoneValidity(normalizedFrom, "opted_out");
      await recordInbound(normalizedFrom, params.Body || keyword, keyword);
      console.log(
        `[sms-webhook] STOP from ${normalizedFrom} → do_not_contact=${suppressed}, opted_out ${n} profile(s)`,
      );
      return twiml(); // Twilio sends the carrier opt-out confirmation.
    }
    if (OPT_IN_KEYWORDS.has(keyword)) {
      await unsuppressPhone(normalizedFrom);
      const n = await setFamilyPhoneValidity(normalizedFrom, "unverified");
      await recordInbound(normalizedFrom, params.Body || keyword, keyword);
      console.log(`[sms-webhook] START from ${normalizedFrom} → cleared ${n} profile(s)`);
      return twiml();
    }
    if (HELP_KEYWORDS.has(keyword)) {
      await recordInbound(normalizedFrom, params.Body || keyword, keyword);
      return twiml(HELP_REPLY);
    }
    // Benefits progress replies update the living plan and receive an
    // immediate receipt. Unrecognized replies remain human-routed below.
    // An outcome reply to the 7-day follow-up. Checked before the free-form
    // path because HELPED / NOTYET are answers to a question we asked, not new
    // questions — routing them to the research engine would queue a job for a
    // message that is already complete.
    //
    // Deliberately AFTER the opt-out/opt-in branches above: "YES" is a TCPA
    // opt-in keyword and must never be read as an outcome instead.
    if (messageBody && outcome.keyword && outcomeFromKeyword(outcome.keyword)) {
      const captured = await captureOutcome(last10(normalizedFrom) ?? "", outcome.keyword, messageBody);
      if (captured.recorded) {
        await recordInbound(normalizedFrom, messageBody, outcome.keyword);
        if (captured.needsHuman) {
          try {
            const { sendSlackAlert } = await import("@/lib/slack");
            await sendSlackAlert(
              `Family says our benefits answer did NOT help: ${normalizedFrom} replied "${messageBody.slice(0, 200)}". Worth a second look from /admin/inbox.`,
            );
          } catch (err) {
            console.error("[sms-webhook] Outcome Slack ping failed:", err);
          }
        }
        return twiml(captured.response);
      }
      // Nothing was awaiting an outcome — fall through to normal handling.
    }

    // "Thank you" is a close, not a new research request. Keep it in both
    // durable histories, but do not page Slack, promise a follow-up, or create
    // a Family Answers job. Scoped to matched families so a provider or unknown
    // sender still reaches a human even when their short reply is ambiguous.
    if (messageBody && courtesyOnly && senderType === "family") {
      await recordInbound(normalizedFrom, messageBody, null);
      console.log(`[sms-webhook] Courtesy-only family reply auto-handled for ${normalizedFrom}`);
      return twiml();
    }

    if (messageBody) {
      // outcome.keyword, not the collapsed token: a sentence normalizes to junk
      // ("I can't find the form" -> ICANTFINDTHEFORM) and must never reach
      // interpretBenefitsSmsReply as though it were a recognized reply.
      const recorded = await recordInbound(normalizedFrom, messageBody, outcome.keyword, true);
      if (recorded.structured) return twiml(recorded.response);
      // recordInbound's Slack ping requires a family match. Everyone else —
      // providers, unknown numbers — needs a human told about them here.
      if (senderType !== "family") {
        await alertUnmatchedInbound(normalizedFrom, messageBody, senderName);
      } else {
        // A family asked something free-form. Acknowledge it and queue the
        // research, unless the message reads as a crisis, in which case a
        // human is paged and nothing is sent.
        await triageFamilyQuestion({
          phone: normalizedFrom,
          body: messageBody,
          twilioSid: params.MessageSid || null,
          profile: recorded.profile,
          who: senderName,
        });
      }
    }
  } catch (err) {
    console.error("[sms-webhook] Error handling inbound:", err);
  }

  return twiml();
}
