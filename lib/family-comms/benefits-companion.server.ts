/**
 * Benefits text companion, part 1: assignment, the minute-one opener, and the
 * answer to its one question.
 *
 * Why this exists (TJ, 2026-09-27): after the program-page card gives a
 * family their answer and a phone number, almost nobody calls from the card
 * (1 of 11), but 5 of 11 ask for a text. The replies we do get are specific
 * and often urgent ("My AC went out", "shut off on the 21st"), and today each
 * one waits up to two business days for a person. The companion moves the
 * product into the text thread: it knows their answers, gives the number,
 * and asks the one question that changes what they should do next.
 *
 * This file sends the opener and reads "1" / "2" answers, both to the
 * opener's urgency question and to the day-14 question. Fast replies to free
 * text are in benefits-companion-replies.server.ts; the next-morning and
 * day-14 texts are sent by /api/cron/benefits-companion-followups.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSMS } from "@/lib/twilio";
import { getSiteUrl } from "@/lib/site-url";
import { sendSlackAlert } from "@/lib/slack";
import { withSmsSource } from "@/lib/sms/click-source";
import { last10 } from "@/lib/seeker-touches/label";
import { looksLikeHours, stripParen } from "@/lib/benefits/call-script";
import { familyBenefitsFacts } from "@/lib/family-comms/benefits-guidance.server";
import { selectFirstStepProgram, type FirstStepPick } from "@/lib/family-comms/benefits-cascade.server";
import {
  openHelpCase,
  withReplyHold,
  isBenefitsAutomationHeld,
  type BenefitsHelpCase,
} from "@/lib/family-comms/benefits-automation";
import {
  assignBenefitsCompanionArm,
  type BenefitsCompanionArm,
  type BenefitsCompanionSettings,
} from "@/lib/analytics/benefits-companion-variant";
import { getBenefitsCompanionSettings } from "@/lib/analytics/benefits-companion-settings";

/** The companion stays active this long after assignment. */
const ACTIVE_DAYS = 21;
/** An unanswered question stops claiming "1" / "2" after this. */
const OPEN_QUESTION_HOURS = 72;
/** The day-14 question stays answerable longer: it is the measure. */
const DAY14_OPEN_HOURS = 7 * 24;

export const COMPANION_OPENER_TYPE = "benefits_companion_opener";
export const COMPANION_REPLY_TYPE = "benefits_companion_reply";
export const COMPANION_FOLLOWUP_TYPE = "benefits_companion_followup";

export interface BenefitsCompanionMeta {
  arm: BenefitsCompanionArm;
  assigned_at: string;
  settings_version: number;
  companion_pct: number;
  source: string;
  /** The program the opener named, for later messages and the analysis. */
  program_id?: string | null;
  state_id?: string | null;
  program_short_name?: string | null;
  program_phone?: string | null;
  /** Which urgent need the opener asked about, if any (energy / food / none). */
  need_kind?: NeedKind;
  opener_sent_at?: string | null;
  /** Companion arm with no callable program: got today's results text instead.
   *  Still analysed in its arm (intent to treat). */
  degraded?: boolean;
  open_question?: { kind: "urgency" | "day14"; asked_at: string } | null;
  urgency?: { answer: "yes" | "no"; at: string } | null;
  /** Part 3's follow-ups, stamped when sent. */
  followups?: { morning_at?: string; day14_at?: string };
  /** The primary measure: the day-14 "did you get through?" answer. Asked of
   *  BOTH arms with identical wording so the comparison is fair. */
  day14?: { answer: "yes" | "no"; at: string } | null;
}

export function readBenefitsCompanion(meta: Record<string, unknown> | null | undefined): BenefitsCompanionMeta | null {
  const raw = (meta as { benefits_companion?: unknown } | null | undefined)?.benefits_companion;
  if (!raw || typeof raw !== "object") return null;
  const c = raw as BenefitsCompanionMeta;
  return c.arm === "control" || c.arm === "companion" ? c : null;
}

/**
 * True when this family's texts belong to the companion: assigned to it, the
 * test is live, and it is inside the active window. Callers that send
 * today's automated texts (the letter's companion text, the check-in text)
 * skip them when this is true, so a family never gets two streams.
 */
export function companionActive(
  meta: Record<string, unknown> | null | undefined,
  settings: BenefitsCompanionSettings,
  now = Date.now(),
): boolean {
  if (settings.mode !== "live") return false;
  const c = readBenefitsCompanion(meta);
  if (!c || c.arm !== "companion" || c.degraded) return false;
  return now - new Date(c.assigned_at).getTime() < ACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

// ── Copy ────────────────────────────────────────────────────────────────────
// Plain, short, no em dashes, signed "Olera". The phone number is the point
// of the opener, so it is never dropped; the hours are dropped when the record
// has none that look like hours.

/** looksLikeHours lets "Hours not published" through (it contains "hour").
 *  In a 245-character text that is noise, so drop sentinels like it. */
function usableHours(h: string | null): h is string {
  return !!h && looksLikeHours(h) && !/not (published|listed|available)|unknown|varies|n\/a/i.test(h);
}

/**
 * Which kind of urgent need a program is about. The opener's one question
 * only makes sense for some programs: "no heat or AC?" to a Medicare Savings
 * family is noise (TJ, 2026-09-27). Same keyword grouping the plan page uses
 * (components/benefits/BenefitsHome.tsx groupLabel).
 */
export type NeedKind = "energy" | "food" | "general";

export function needKindForProgram(name: string | null | undefined): NeedKind {
  const t = (name || "").toLowerCase();
  if (/(snap|calfresh|food|meal|grocer|nutrition)/.test(t)) return "food";
  if (/(liheap|ceap|energy|weatheriz|utility|heating|cooling)/.test(t)) return "energy";
  return "general";
}

/** The need a family's own words point at, whatever program they came for. */
export function needKindForMessage(body: string, fallback: NeedKind): NeedKind {
  const t = body.toLowerCase();
  if (/\b(power|electric\w*|gas|heat\w*|a\/?c|air ?condition\w*|shut ?off|shutoff|disconnect\w*|utilit\w*|propane|cold|hot)\b/.test(t)) return "energy";
  if (/\b(food|hungry|eat|meals?|groceries)\b/.test(t)) return "food";
  return fallback;
}

const OPENER_QUESTION: Record<NeedKind, string | null> = {
  energy: "One question: is there a shutoff notice, or no heat or AC at home right now? Reply 1 for yes or 2 for no.",
  food: "One question: are you out of food at home right now? Reply 1 for yes or 2 for no.",
  general: null,
};

export function companionOpenerSms(p: { shortName: string; phone: string; hours: string | null; planUrl: string; kind: NeedKind }): string {
  const hours = usableHours(p.hours) ? ` (${p.hours})` : "";
  const ask = OPENER_QUESTION[p.kind] ?? "If anything about the call is unclear, text us here.";
  return `Olera: For ${p.shortName}, call ${p.phone}${hours}. Your plan: ${p.planUrl}\n${ask} Reply STOP to opt out.`;
}

/** Does this opener ask the 1 / 2 question? */
export function openerAsksQuestion(kind: NeedKind): boolean {
  return OPENER_QUESTION[kind] !== null;
}

export function companionUrgentReplySms(p: { shortName: string | null; phone: string | null; kind: NeedKind }): string {
  const call =
    p.phone && p.shortName
      ? p.kind === "food"
        ? `Call ${p.phone} for ${p.shortName} and tell them you have no food at home. `
        : `Call ${p.phone} for ${p.shortName} and tell them it's urgent. `
      : "";
  const safety =
    p.kind === "energy"
      ? "If anyone feels dizzy, confused or very hot, call 911. For a cool or warm place to go today, call 2-1-1."
      : p.kind === "food"
        ? "For food today, call 2-1-1 and ask for the nearest food pantry."
        : "If anyone is in danger, call 911.";
  return `Thank you for telling us. ${call}A person on our team has been told and will text you. ${safety} Olera`;
}

export function companionNotUrgentReplySms(p: { shortName: string | null; documents: string[] }): string {
  const docs = p.documents.slice(0, 2).map((d) => d.replace(/\s*\([^)]*\)/g, "").trim()).filter(Boolean);
  const ready = docs.length > 0 && p.shortName ? ` When you call ${p.shortName}, have these ready: ${docs.join("; ")}.` : "";
  return `Got it, thank you.${ready} If you get stuck, text us here. Olera`;
}

/** Part 3, next morning, companion arm only. Answers are the existing keywords. */
export function morningCheckSms(p: { shortName: string; phone: string | null }): string {
  const at = p.phone ? ` at ${p.phone}` : "";
  return `Olera: Morning. Did you get through to ${p.shortName}${at}? Reply CALLED, NO ANSWER, or STUCK. Reply STOP to opt out.`;
}

/** Part 3, day 14, BOTH arms, identical words: the test's primary measure. */
export function day14Sms(p: { shortName: string | null }): string {
  const what = p.shortName ? `about ${p.shortName}` : "about the program we sent you";
  return `Olera: A quick question ${what}. Were you able to get through to them? Reply 1 for yes or 2 for not yet. Reply STOP to opt out.`;
}

// ── Assignment + opener ─────────────────────────────────────────────────────

async function firstStepFor(
  db: SupabaseClient,
  profile: { account_id: string | null; state: string | null; care_types?: string[] | null; metadata: Record<string, unknown> },
): Promise<FirstStepPick | null> {
  if (!profile.account_id) return null;
  try {
    return await selectFirstStepProgram(db, {
      accountId: profile.account_id,
      stateAbbrev: profile.state,
      facts: familyBenefitsFacts(profile),
    });
  } catch (err) {
    console.error("[benefits-companion] first-step selection failed:", err);
    return null;
  }
}

/**
 * Called when a family gives a phone number in the program-page card, after
 * the number and consent are saved. Returns handled=true only when the
 * companion sent its opener, in which case the caller must NOT send today's
 * results text. Every other outcome (off, practice, control, no program,
 * send failure) returns handled=false and the caller sends the results text
 * as it always has, tagged with the arm.
 */
export async function startBenefitsCompanion(
  db: SupabaseClient,
  opts: { profileId: string; phone: string; source: string; token: string },
): Promise<{ handled: boolean; arm: BenefitsCompanionArm | null }> {
  if (opts.source !== "benefits_enrichment") return { handled: false, arm: null };
  const settings = await getBenefitsCompanionSettings();
  if (settings.mode === "off") return { handled: false, arm: null };

  const { data: profile } = await db
    .from("business_profiles")
    .select("id, account_id, state, care_types, metadata")
    .eq("id", opts.profileId)
    .maybeSingle();
  if (!profile) return { handled: false, arm: null };
  const meta = (profile.metadata as Record<string, unknown>) || {};
  const existing = readBenefitsCompanion(meta);
  if (existing) return { handled: false, arm: existing.arm };

  const planUrl = withSmsSource(`${getSiteUrl()}/m/${opts.token}`, COMPANION_OPENER_TYPE);
  const pick = await firstStepFor(db, { ...profile, metadata: meta });
  const needKind = needKindForProgram(pick ? `${pick.name} ${pick.shortName}` : null);
  const opener = pick
    ? companionOpenerSms({ shortName: pick.shortName, phone: pick.contact.phone, hours: pick.contact.hours, planUrl, kind: needKind })
    : null;
  const at = new Date().toISOString();

  const writeMeta = async (patch: Record<string, unknown>) => {
    const { data: fresh } = await db.from("business_profiles").select("metadata").eq("id", opts.profileId).maybeSingle();
    const freshMeta = (fresh?.metadata as Record<string, unknown> | null) || meta;
    await db
      .from("business_profiles")
      .update({ metadata: { ...freshMeta, ...patch } })
      .eq("id", opts.profileId);
  };

  // Practice: nobody is assigned and nothing sends. Keep what the opener would
  // have said so a person can read real ones before anything goes live.
  if (settings.mode === "practice") {
    await writeMeta({
      benefits_companion_practice: {
        at,
        opener,
        program_id: pick?.programId ?? null,
        note: pick ? null : "No program with a phone number, so no opener.",
      },
    });
    return { handled: false, arm: null };
  }

  const arm = assignBenefitsCompanionArm(opts.profileId, settings);
  const record: BenefitsCompanionMeta = {
    arm,
    assigned_at: at,
    settings_version: settings.version,
    companion_pct: settings.companionPct,
    source: opts.source,
    program_id: pick?.programId ?? null,
    state_id: pick?.stateId ?? null,
    program_short_name: pick?.shortName ?? null,
    program_phone: pick?.contact.phone ?? null,
    need_kind: needKind,
  };
  if (arm === "control") {
    await writeMeta({ benefits_companion: record });
    return { handled: false, arm };
  }
  if (!opener || !pick) {
    await writeMeta({ benefits_companion: { ...record, degraded: true } });
    return { handled: false, arm };
  }

  const result = await sendSMS({
    to: opts.phone,
    body: opener,
    emailType: COMPANION_OPENER_TYPE,
    recipientType: "family",
    recipientLogProfileId: opts.profileId,
    metadata: { companion_arm: arm, companion_kind: "opener", program_id: pick.programId },
  });
  if (!result.success) {
    console.error("[benefits-companion] opener failed:", result.error);
    // Fall back to today's results text; still counted in the companion arm.
    await writeMeta({ benefits_companion: { ...record, degraded: true } });
    return { handled: false, arm };
  }
  await writeMeta({
    benefits_companion: {
      ...record,
      opener_sent_at: at,
      open_question: openerAsksQuestion(needKind) ? { kind: "urgency", asked_at: at } : null,
    },
  });
  return { handled: true, arm };
}

// ── The answer to the opener's question ─────────────────────────────────────

const YES = new Set(["1", "YES", "Y", "YEP", "YEAH", "SI"]);
const NO = new Set(["2", "NO", "N", "NOPE"]);

function readAnswer(body: string): "yes" | "no" | null {
  const token = body.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (YES.has(token)) return "yes";
  if (NO.has(token)) return "no";
  return null;
}

/**
 * Claims "1" / "2" (and yes / no) from a family whose companion question is
 * open. Must run in the SMS webhook after opt-out and BEFORE the opt-in
 * branch: "YES" is also a TCPA opt-in keyword, and a bare "NO" is otherwise
 * dropped as a keyword nothing was waiting for. Returns the reply text, or
 * null to let the message fall through to the normal handlers.
 */
export async function handleCompanionAnswer(
  db: SupabaseClient,
  fromPhone: string,
  body: string,
): Promise<string | null> {
  const answer = readAnswer(body);
  if (!answer) return null;
  const target = last10(fromPhone);
  if (!target) return null;

  const { data: rows } = await db
    .from("business_profiles")
    .select("id, account_id, display_name, email, phone, phone_validity, state, care_types, metadata")
    .eq("type", "family")
    .not("metadata->benefits_companion->>open_question", "is", null);
  const now = Date.now();
  const match = (rows ?? []).find((r) => {
    if (last10(String(r.phone ?? "")) !== target) return false;
    if (r.phone_validity === "opted_out") return false;
    const c = readBenefitsCompanion(r.metadata as Record<string, unknown>);
    if (!c?.open_question) return false;
    const age = now - new Date(c.open_question.asked_at).getTime();
    // The day-14 question goes to both arms; the urgency question only to the companion.
    if (c.open_question.kind === "day14") return age < DAY14_OPEN_HOURS * 60 * 60 * 1000;
    return c.arm === "companion" && age < OPEN_QUESTION_HOURS * 60 * 60 * 1000;
  });
  if (!match) return null;

  const meta = (match.metadata as Record<string, unknown>) || {};
  const companion = readBenefitsCompanion(meta) as BenefitsCompanionMeta;
  const at = new Date().toISOString();
  const inbound = Array.isArray(meta.sms_inbound) ? (meta.sms_inbound as unknown[]) : [];

  if (companion.open_question?.kind === "day14") {
    const day14Reply =
      answer === "yes"
        ? "Thank you for telling us. Getting through is the hardest part. If anything comes up, text us here. Olera"
        : "Thanks for telling us. If you want help getting through, reply STUCK and a person from Olera will text you. Olera";
    await db
      .from("business_profiles")
      .update({
        metadata: {
          ...meta,
          sms_inbound: [...inbound, { at, body: body.slice(0, 500), keyword: null, companion_day14: answer }].slice(-20),
          benefits_companion: { ...companion, open_question: null, day14: { answer, at } },
        },
      })
      .eq("id", match.id);
    await logCompanionReply(db, fromPhone, match.id, day14Reply, companion.arm, `day14_${answer}`);
    return day14Reply;
  }
  const pick = await firstStepFor(db, { ...match, metadata: meta });
  const shortName = pick?.shortName ?? companion.program_short_name ?? null;

  let nextMeta: Record<string, unknown> = {
    ...meta,
    sms_inbound: [...inbound, { at, body: body.slice(0, 500), keyword: null, companion_answer: answer }].slice(-20),
    benefits_companion: { ...companion, open_question: null, urgency: { answer, at } },
  };

  let reply: string;
  if (answer === "yes") {
    // A person takes this one: pause automation, open an owned help case,
    // and say so in Slack in words nobody can skim past.
    const nextCase = openHelpCase((meta.benefits_case as BenefitsHelpCase | undefined) ?? {}, "stuck", at);
    if (nextCase) nextMeta.benefits_case = nextCase;
    if (!isBenefitsAutomationHeld(nextMeta)) {
      nextMeta = withReplyHold(nextMeta, "sms_reply", "sms", body, at);
    }
    const kind = companion.need_kind ?? needKindForProgram(shortName);
    reply = companionUrgentReplySms({ shortName, phone: pick?.contact.phone ?? null, kind });
    try {
      const who = (match.display_name && match.display_name !== "Care Seeker" ? match.display_name : null) || match.email || fromPhone;
      const contact = pick ? ` They were sent ${stripParen(pick.contact.label)} at ${pick.contact.phone} for ${pick.shortName}.` : "";
      await sendSlackAlert(
        `🚨 Urgent benefits family: ${who}${match.state ? ` (${match.state})` : ""} said YES to "${kind === "food" ? "out of food at home right now" : "shutoff notice, or no heat or AC right now"}".${contact} ` +
          `Please text them today. <${getSiteUrl()}/admin/care-seekers/${match.id}|Open family>`,
      );
    } catch (err) {
      console.error("[benefits-companion] urgent Slack ping failed:", err);
    }
  } else {
    reply = companionNotUrgentReplySms({ shortName, documents: pick?.documents ?? [] });
  }

  await db.from("business_profiles").update({ metadata: nextMeta }).eq("id", match.id);

  await logCompanionReply(db, fromPhone, match.id, reply, "companion", `urgency_${answer}`);
  return reply;
}

/** Ledger row for a reply sent through TwiML (same shape as lib/twilio.ts logSms). */
async function logCompanionReply(
  db: SupabaseClient,
  phone: string,
  profileId: string,
  body: string,
  arm: BenefitsCompanionArm,
  kind: string,
): Promise<void> {
  try {
    await db.from("email_log").insert({
      channel: "sms",
      recipient: phone,
      sender: process.env.TWILIO_FROM_NUMBER ?? "twilio",
      subject: `SMS: ${COMPANION_REPLY_TYPE}`,
      email_type: COMPANION_REPLY_TYPE,
      recipient_type: "family",
      provider_id: profileId,
      status: "sent",
      html_body: body,
      metadata: { companion_arm: arm, companion_kind: kind },
    });
  } catch (err) {
    console.error("[benefits-companion] reply ledger insert failed:", err);
  }
}
