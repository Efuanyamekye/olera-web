import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOptOutPhrase, matchOutcomeReply } from "@/lib/sms/inbound-intent";
import { markSmsThreadHandled, MAX_SMS_BODY, replyToSmsThread } from "@/lib/sms/inbox-actions.server";
import { runNoiseSweep } from "@/lib/support-email/noise-sweep.server";
import { archiveSupportThreads, saveSupportDraft, sendSupportReply } from "@/lib/support-email/thread-actions.server";
import { checkDraft, renderCheck } from "@/lib/war-room/draft-check.server";
import { HUMAN_VOICE_RULES } from "@/lib/family-answers/human-voice";
import { AGED_OUT_DAYS, callbackLine, loadWaitingVoicemails, sortVoicemails, STALE_CALLBACK_DAYS } from "@/lib/war-room/voicemail-triage.server";
import { saveHandoff } from "@/lib/war-room/handoff.server";
import { buildOrganicRead, rememberOrganicRead, type OrganicRead } from "@/lib/war-room/organic-read.server";
import { findSlackOwed, postSlackReplyAsTj, type SlackOwed } from "@/lib/war-room/slack-owed.server";

/**
 * Cortex as inbox operator: support@ email and the SMS inbox.
 *
 * TJ, 2026-09-26: "email is piling up and I don't get to them. Same with text
 * messages." Twice a day a pass reads both inboxes and proposes a handful of
 * numbered items on Telegram: a triage batch to clear bookkeeping, a reply to a
 * family's text, a Gmail draft for a provider or family email, and at most one
 * question. Nothing goes out until he approves an item by number ("send 3").
 *
 * Every action runs through the same shared functions the admin inbox uses
 * (lib/sms/inbox-actions.server.ts, lib/support-email/*), so quiet hours,
 * do-not-contact, "mark handled" and the draft bookkeeping all happen exactly
 * as they do for his clicks. A provider email he approves is sent from
 * support@; a family email is saved as a Gmail draft he sends himself.
 *
 * Never surface handled work (TJ, 26 Sep: "it's giving outdated information,
 * stuff that we've already handled"). A thread is proposed only when the last
 * message in it came from them, after our last reply.
 */

export type InboxItemKind = "triage_batch" | "sms_draft" | "email_draft" | "question" | "slack_draft" | "proposal";
export type ProposedItem = {
  kind: InboxItemKind;
  category: string;
  target: Record<string, unknown>;
  summary: string;
  body?: string | null;
};
export type StoredItem = ProposedItem & { id: string; pass_id: string; number: number; status: string; created_at: string };

/**
 * The version of a draft he last saw. When Cortex rewrites a draft in chat
 * ("send 5: <new text>"), or he writes or checks his own, that text becomes
 * the item's latest version, and "send 5" sends it. TJ, 2026-09-29: "If I say
 * send it, it should send the right version, not the version that I don't
 * even know exists."
 */
export type LatestVersion = { text: string; at: string; by: "cortex" | "you"; checked?: boolean };
export function latestVersion(item: StoredItem): LatestVersion | null {
  const latest = (item.target as { latest?: LatestVersion } | null)?.latest;
  return latest?.text ? latest : null;
}
export function currentText(item: StoredItem): string {
  return latestVersion(item)?.text ?? item.body ?? "";
}

const EMAIL_DRAFTS_PER_PASS = 3;
const SMS_DRAFTS_PER_PASS = 4;
/** Outbound SMS a person wrote: the inbox reply box, and a manual city-lead text. */
const HUMAN_SMS_TYPES = ["admin_reply", "city_lead_family_manual"];
const OUTCOME_OK = new Set(["CALLED", "APPLIED", "WAITING", "NOANSWER", "NEEDDOCS", "NOTELIGIBLE"]);

/** Who approved it, for the audit log: the founder's own admin record. */
export async function approverAdmin(db: SupabaseClient): Promise<{ id: string; actor: string } | null> {
  const email = process.env.CORTEX_APPROVER_EMAIL?.trim() || "tj@olera.care";
  const { data } = await db.from("admin_users").select("id, email").eq("email", email).maybeSingle();
  return data ? { id: (data as { id: string }).id, actor: `${email} (approved via Cortex)` } : null;
}

// ---------------------------------------------------------------------------
// Carrying a draft forward

/**
 * A draft whose thread has nothing new since the last pass comes back as the
 * same draft: same text, same checked rewrite, same number. On 2026-10-01 the
 * 08:00 pass rewrote three drafts proposed at 20:00 with nothing new in their
 * threads, so a check he ran no longer applied to the text on offer, and Elle's
 * draft moved from 4 to 6 while 4 became Marti's: "send 4" from the night
 * before would have reached the wrong person.
 *
 * `since` is the time of their last message when the draft was written; the
 * draft carries only while that is still their last message.
 */
type PriorDraft = { number: number; body: string | null; status: string; target: Record<string, unknown> };

async function priorDrafts(db: SupabaseClient, kind: "sms_draft" | "email_draft", key: "threadId" | "last10", values: string[]): Promise<Map<string, PriorDraft>> {
  const out = new Map<string, PriorDraft>();
  if (!values.length) return out;
  const { data } = await db.from("cortex_inbox_items")
    .select("number, body, status, target, created_at")
    .eq("kind", kind)
    .in(`target->>${key}`, values)
    .in("status", ["proposed", "expired", "skipped"])
    .order("created_at", { ascending: false })
    .limit(200);
  for (const row of (data ?? []) as Array<PriorDraft & { created_at: string }>) {
    const id = String(row.target?.[key] ?? "");
    if (id && !out.has(id)) out.set(id, row);
  }
  return out;
}

/** The target for a draft carried from an earlier pass, or null when there is something new. */
export function carryTarget(prior: PriorDraft | undefined, base: Record<string, unknown>, since: string): Record<string, unknown> | null {
  const priorSince = prior?.target?.since;
  if (!prior || typeof priorSince !== "string" || Date.parse(priorSince) !== Date.parse(since)) return null;
  const latest = (prior.target as { latest?: LatestVersion }).latest;
  return {
    ...base,
    since,
    carried: true,
    ...(latest?.text ? { latest } : {}),
    // Only an item still open from the last pass keeps its number; a skipped
    // or older one gets a new number, so no number changes meaning.
    ...(prior.status === "proposed" ? { carriedNumber: prior.number } : {}),
  };
}

// ---------------------------------------------------------------------------
// SMS

type InboundRow = { phone_last10: string | null; body: string | null; keyword: string | null; display_name: string | null; profile_type: string | null; created_at: string };

/** True when this is bookkeeping, not a conversation: an opt-out, or an outcome keyword that isn't STUCK. */
export function isSmsBookkeeping(body: string, keyword: string | null): string | null {
  if (isOptOutPhrase(body)) return "STOP";
  const outcome = matchOutcomeReply(body);
  const key = (keyword ?? outcome?.keyword ?? "").toUpperCase();
  if (key && OUTCOME_OK.has(key) && !outcome?.ambiguous) return key;
  return null;
}

async function smsProposals(db: SupabaseClient): Promise<{ items: ProposedItem[]; waitingElsewhere: number }> {
  const { data } = await db.from("sms_inbound")
    .select("phone_last10, body, keyword, display_name, profile_type, created_at")
    .is("handled_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as InboundRow[];
  const byPhone = new Map<string, InboundRow[]>();
  for (const row of rows) {
    if (!row.phone_last10) continue;
    byPhone.set(row.phone_last10, [...(byPhone.get(row.phone_last10) ?? []), row]);
  }
  const phones = [...byPhone.keys()];
  if (!phones.length) return { items: [], waitingElsewhere: 0 };

  // What we already sent, and what is already scheduled: a thread we answered
  // after their last text is not waiting on anyone.
  const [{ data: outbound }, { data: queued }, { data: jobs }] = await Promise.all([
    // A PERSON's reply only. Most outbound texts are automated (benefits
    // results, check-ins, acknowledgements: 250 of 437 in the 30 days to
    // 27 Sep), and counting those would mark a family's unanswered question
    // "already answered" because a check-in went out after it.
    db.from("email_log").select("recipient, created_at").eq("channel", "sms").in("email_type", HUMAN_SMS_TYPES).in("recipient", phones.map((p) => `+1${p}`)).order("created_at", { ascending: false }).limit(500),
    db.from("sms_queue").select("phone_last10").eq("origin", "admin_reply").eq("status", "pending").in("phone_last10", phones),
    db.from("family_answer_jobs").select("phone_last10, status, packet, created_at").in("phone_last10", phones).order("created_at", { ascending: false }).limit(200),
  ]);
  const lastOut = new Map<string, string>();
  for (const row of (outbound ?? []) as Array<{ recipient: string; created_at: string }>) {
    const key = row.recipient.slice(-10);
    if (!lastOut.has(key)) lastOut.set(key, row.created_at);
  }
  const scheduled = new Set(((queued ?? []) as Array<{ phone_last10: string }>).map((row) => row.phone_last10));
  const priorSms = await priorDrafts(db, "sms_draft", "last10", phones);
  const newestJob = new Map<string, { status: string; packet: { draft?: string; triage?: { isCrisis?: boolean; category?: string } } | null }>();
  for (const job of (jobs ?? []) as Array<{ phone_last10: string; status: string; packet: never; created_at: string }>) {
    if (!newestJob.has(job.phone_last10)) newestJob.set(job.phone_last10, job);
  }

  const bookkeeping: Array<{ last10: string; keyword: string }> = [];
  const drafts: ProposedItem[] = [];
  const questions: Array<{ priority: number; item: ProposedItem }> = [];
  let waitingElsewhere = 0;
  for (const [last10, texts] of byPhone) {
    const latest = texts[0];
    if (scheduled.has(last10)) continue;
    const answeredAfter = lastOut.get(last10);
    if (answeredAfter && Date.parse(answeredAfter) > Date.parse(latest.created_at)) {
      // Answered outside the inbox; only the bookkeeping is left.
      bookkeeping.push({ last10, keyword: "answered" });
      continue;
    }
    const keyword = isSmsBookkeeping(latest.body ?? "", latest.keyword);
    if (keyword && texts.every((text) => isSmsBookkeeping(text.body ?? "", text.keyword))) {
      bookkeeping.push({ last10, keyword });
      continue;
    }
    const who = latest.display_name && latest.display_name !== "Care Seeker" ? latest.display_name : `a ${latest.profile_type ?? "sender"} ending ${last10.slice(-4)}`;
    const said = clip(latest.body ?? "", 160);
    const waitedHours = Math.round((Date.now() - Date.parse(texts[texts.length - 1].created_at)) / 3_600_000);
    const job = newestJob.get(last10);
    if (job?.packet?.triage?.isCrisis) {
      questions.push({ priority: 100, item: { kind: "question", category: "sms:crisis", target: { last10 }, summary: `${who} texted something that reads as a crisis: "${said}". No reply has gone out. Answer it yourself in the inbox.` } });
      continue;
    }
    if (/\bstuck\b/i.test(latest.body ?? "") || latest.keyword?.toUpperCase() === "STUCK") {
      questions.push({ priority: 80, item: { kind: "question", category: "sms:stuck", target: { last10 }, summary: `${who} texted STUCK ${waitedHours}h ago: "${said}". Want me to draft the next step, or will you call?` } });
      continue;
    }
    const draft = job?.status === "ready" ? job.packet?.draft?.trim() : null;
    if (draft && draft.length <= MAX_SMS_BODY && drafts.length < SMS_DRAFTS_PER_PASS) {
      const target = carryTarget(priorSms.get(last10), { last10 }, latest.created_at) ?? { last10, since: latest.created_at };
      drafts.push({ kind: "sms_draft", category: `sms:reply:${job?.packet?.triage?.category ?? "other"}`, target, summary: `Text ${who} (waiting ${waitedHours}h). They said: "${said}"`, body: draft });
      continue;
    }
    waitingElsewhere += 1;
  }

  const items: ProposedItem[] = [];
  if (bookkeeping.length) {
    const counts = bookkeeping.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.keyword]: (acc[row.keyword] ?? 0) + 1 }), {});
    items.push({
      kind: "triage_batch",
      category: "sms:keywords",
      target: { phones: bookkeeping.map((row) => row.last10) },
      summary: `Mark ${bookkeeping.length} text ${bookkeeping.length === 1 ? "thread" : "threads"} handled (${Object.entries(counts).map(([k, n]) => `${n} ${k === "answered" ? "already answered" : k}`).join(", ")}).`,
    });
  }
  items.push(...drafts);
  items.push(...questions.sort((a, b) => b.priority - a.priority).map((q) => q.item));
  return { items, waitingElsewhere };
}

// ---------------------------------------------------------------------------
// Email

type ThreadRow = { id: string; subject: string; category: string; agent_summary: string | null; suggested_draft: string | null; matched_profile_name: string | null; matched_profile_type?: string | null; last_message_at: string; gmail_draft_id?: string | null; draft_updated_at?: string | null };

/**
 * A Gmail draft saved after their last message is a reply waiting for him to
 * send, not a thread waiting on a draft. On 2026-09-29 three emails approved
 * at 04:11 UTC were drafted again at 13:00, because the thread still read
 * "waiting on us" until the draft was sent; approving them again would have
 * stacked a second draft on each.
 */
export function draftAwaitingSend(thread: { gmail_draft_id?: string | null; draft_updated_at?: string | null }, messages: Array<{ direction: string; internal_date: string }>): boolean {
  if (!thread.gmail_draft_id || !thread.draft_updated_at) return false;
  const lastIn = Math.max(0, ...messages.filter((m) => m.direction === "in").map((m) => Date.parse(m.internal_date)));
  return Date.parse(thread.draft_updated_at) > lastIn;
}
type MessageRow = { thread_id: string; direction: string; from_email: string | null; from_name: string | null; internal_date: string; body_text: string | null; snippet: string | null };

/** A thread waits on us only if the newest message came from them, not from Olera. */
export function waitingOnUs(messages: Array<{ direction: string; from_email: string | null; internal_date: string }>): boolean {
  const newest = [...messages].sort((a, b) => Date.parse(b.internal_date) - Date.parse(a.internal_date))[0];
  return Boolean(newest && newest.direction === "in" && !/@olera\.care$/i.test((newest.from_email ?? "").trim()));
}

/** Cut at a word, not mid-word. */
export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).replace(/[,;:.]$/, "")}...`;
}

/** "Re: Re:Ã‚Â Your first step" -> "Your first step". */
export function cleanSubject(subject: string) {
  return clip(subject.replace(/Ã.|Â/g, "").replace(/^(\s*(re|fwd?):\s*)+/i, "").trim() || "(no subject)", 80);
}

function quoteless(text: string) {
  const cut = text.search(/\n\s*On .{0,120}wrote:|\n-{2,}\s*Original Message|\n>|\n\s*From: .{0,200}\r?\n\s*(Sent|Date): /);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\s+/g, " ").trim();
}

const DRAFT_SYSTEM = `You draft email replies from Olera's support inbox (support@olera.care). Olera is a senior-care marketplace: families find care providers, and providers get leads and listings. You are given the full thread, both directions, oldest first, and a first draft from a quick classifier.

Write the reply the founder would send:
- Answer only what they wrote after Olera's last reply. Never repeat or re-offer anything Olera already said or offered in the thread.
- Short: three to six sentences. One clear next step. No hedging, no over-apologising, no em dashes, no marketing language.
- To a family: never say they qualify or are eligible for a program. The agency decides; say what the next step is and who decides.
- Never invent a fact, a price, a date or a promise the thread does not support. If something needs checking, say what you will find out instead of guessing.
- Sign off as "Olera", never with a person's name. TJ, 2026-09-30: for a free benefits service a named sender adds liability and personal obligation for no gain.

${HUMAN_VOICE_RULES}

Reply with the email body only: no "Subject:" line, no headers.`;

/**
 * The body, without a header line the model echoed from its prompt. On
 * 2026-10-01 the Blue Water draft opened "SUBJECT: RE: Request for
 * Information About Olera's Services", which would have gone to her as the
 * first line of the email.
 */
export function stripDraftHeaders(body: string): string {
  return body.replace(/^(?:\s*(?:subject|re|to|from|cc)\s*:[^\n]*\n)+/i, "").trim();
}

async function draftEmail(thread: ThreadRow, messages: MessageRow[]): Promise<{ body: string; costUsd: number } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const transcript = messages
    .sort((a, b) => Date.parse(a.internal_date) - Date.parse(b.internal_date))
    .slice(-8)
    .map((m) => `[${m.internal_date.slice(0, 16)} ${m.direction === "out" ? "OLERA" : "THEM"} ${m.from_name ?? m.from_email ?? ""}]\n${quoteless(m.body_text ?? m.snippet ?? "").slice(0, 1_500)}`)
    .join("\n\n");
  try {
    const reply = await anthropic.messages.create({
      model: process.env.CORTEX_INBOX_DRAFT_MODEL || "claude-sonnet-5",
      max_tokens: 2_000,
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: `SUBJECT: ${thread.subject}\nWHO: ${thread.matched_profile_name ?? "unknown"} (${thread.category})\nSUMMARY: ${thread.agent_summary ?? ""}\n\nTHREAD:\n${transcript}\n\nFIRST DRAFT:\n${thread.suggested_draft ?? "(none)"}` }],
    }, { timeout: 45_000, maxRetries: 0 });
    const body = stripDraftHeaders(reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text.replace(/\s*[—–]\s*/g, ", ").trim() ?? "");
    const costUsd = (reply.usage.input_tokens * 2 + reply.usage.output_tokens * 10) / 1_000_000;
    return body.length > 20 ? { body, costUsd } : null;
  } catch (error) {
    console.error("[cortex] email draft failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function emailProposals(db: SupabaseClient): Promise<{ items: ProposedItem[]; costUsd: number; waitingElsewhere: number; draftsInGmail: number }> {
  const items: ProposedItem[] = [];
  let costUsd = 0;

  // Triage: the noise sweep's own dry run, so the count he approves is the
  // count its rules produce (never care_seeker, provider, legal, billing or
  // voicemail; opt-outs held back).
  const dry = await runNoiseSweep(db, { actor: "cortex (dry run)", adminUserId: "", confirm: null }).catch(() => null);
  const matching = Number(dry?.json.matching ?? 0);
  if (dry?.status === 200 && matching > 0) {
    const byCategory = (dry.json.byCategory ?? {}) as Record<string, number>;
    const held = Number(dry.json.heldCount ?? 0);
    items.push({
      kind: "triage_batch",
      category: "email:noise",
      target: { count: matching },
      summary: `Archive ${matching} noise emails (${Object.entries(byCategory).map(([k, n]) => `${n} ${k}`).join(", ")}). Nothing is deleted; it stays in All Mail.${held ? ` ${held} that read like opt-outs are held back for you.` : ""}`,
    });
  }

  // Drafts: families and providers waiting on a reply, newest first.
  const { data: threads } = await db.from("support_email_threads")
    .select("id, subject, category, agent_summary, suggested_draft, matched_profile_name, matched_profile_type, last_message_at, gmail_draft_id, draft_updated_at")
    .eq("state", "needs_reply")
    .in("category", ["care_seeker", "provider"])
    .eq("suggested_action", "draft_reply")
    .order("last_message_at", { ascending: false })
    .limit(40);
  const candidates = (threads ?? []) as ThreadRow[];
  const { data: messageData } = candidates.length
    ? await db.from("support_email_messages")
      .select("thread_id, direction, from_email, from_name, internal_date, body_text, snippet")
      .in("thread_id", candidates.map((t) => t.id))
      .order("internal_date", { ascending: false })
      .limit(600)
    : { data: [] };
  const messages = (messageData ?? []) as MessageRow[];
  let waitingElsewhere = 0;
  let draftsInGmail = 0;
  const priorEmail = await priorDrafts(db, "email_draft", "threadId", candidates.map((t) => t.id));
  for (const thread of candidates) {
    const own = messages.filter((m) => m.thread_id === thread.id);
    if (!waitingOnUs(own)) continue;
    if (draftAwaitingSend(thread, own)) {
      draftsInGmail += 1;
      continue;
    }
    if (items.filter((item) => item.kind === "email_draft").length >= EMAIL_DRAFTS_PER_PASS) {
      waitingElsewhere += 1;
      continue;
    }
    const lastIn = own.filter((m) => m.direction === "in").map((m) => m.internal_date).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? thread.last_message_at;
    const prior = priorEmail.get(thread.id);
    // A provider account Olera knows, not just the classifier's "provider":
    // that label also covers job seekers and a dental office asking about a
    // patient (1 Oct: about 10 of the 40 latest). Only these send on approval.
    const matchedProvider = thread.category === "provider" && thread.matched_profile_type === "provider";
    const carried = carryTarget(prior, { threadId: thread.id, matchedProvider }, lastIn);
    const draft = carried && prior?.body ? { body: stripDraftHeaders(prior.body), costUsd: 0 } : await draftEmail(thread, own);
    if (!draft) {
      waitingElsewhere += 1;
      continue;
    }
    costUsd += draft.costUsd;
    // "Care Seeker" is the placeholder name on every family profile.
    const profileName = thread.matched_profile_name && thread.matched_profile_name !== "Care Seeker" ? thread.matched_profile_name : null;
    const who = profileName ?? own.find((m) => m.direction === "in")?.from_name ?? (thread.category === "care_seeker" ? "a family" : "a provider");
    items.push({
      kind: "email_draft",
      category: `email:draft:${thread.category}`,
      target: carried && prior?.body ? carried : { threadId: thread.id, matchedProvider, since: lastIn },
      summary: `Email ${who} re "${cleanSubject(thread.subject)}". ${clip(thread.agent_summary ?? "", 180)}`,
      body: draft.body,
    });
  }
  return { items, costUsd, waitingElsewhere, draftsInGmail };
}

// ---------------------------------------------------------------------------
// Voicemail (voicemail-triage.server.ts)

async function voicemailProposals(db: SupabaseClient): Promise<{ items: ProposedItem[]; costUsd: number }> {
  const waiting = await loadWaitingVoicemails(db).catch(() => []);
  if (!waiting.length) return { items: [], costUsd: 0 };
  const items: ProposedItem[] = [];
  const { verdicts, costUsd } = await sortVoicemails(waiting);

  // Older than 30 days: aged out, after one read for anything still worth a look.
  // Offered only while there is something to archive, so the short list is
  // shown once: the keepers stay in support email and are not re-offered.
  const aged = verdicts.filter((v) => v.ageDays > AGED_OUT_DAYS);
  const agedArchive = aged.filter((v) => !v.worthIt);
  const agedKeep = aged.filter((v) => v.worthIt);
  if (agedArchive.length) {
    items.push({
      kind: "triage_batch",
      category: "email:voicemail_aged",
      target: { threadIds: agedArchive.map((v) => v.id) },
      summary: `Archive ${agedArchive.length} voicemails older than ${AGED_OUT_DAYS} days as aged out. Nothing is deleted; they stay in All Mail. ${agedKeep.length ? `I kept back ${agedKeep.length} that may still matter${agedKeep.length > 20 ? " (the 20 newest below)" : ", below"}; they stay in support email for you.` : "None of them looked worth a call back."}`,
      body: agedKeep.length ? agedKeep.sort((a, b) => a.ageDays - b.ageDays).slice(0, 20).map(callbackLine).join("\n") : null,
    });
  }

  // The last 30 days: noise and stale callbacks to archive, fresh callbacks to make.
  const recent = verdicts.filter((v) => v.ageDays <= AGED_OUT_DAYS);
  const recentArchive = recent.filter((v) => !v.worthIt || v.ageDays >= STALE_CALLBACK_DAYS);
  const callbacks = recent.filter((v) => v.worthIt && v.ageDays < STALE_CALLBACK_DAYS).sort((a, b) => a.ageDays - b.ageDays);
  if (recentArchive.length) {
    const stale = recentArchive.filter((v) => v.worthIt).length;
    items.push({
      kind: "triage_batch",
      category: "email:voicemail_recent",
      target: { threadIds: recentArchive.map((v) => v.id) },
      summary: `Archive ${recentArchive.length} recent voicemails (${recentArchive.length - stale} noise${stale ? `, ${stale} callbacks nobody made in ${STALE_CALLBACK_DAYS}+ days` : ""}).`,
    });
  }
  if (callbacks.length) {
    items.push({
      kind: "question",
      category: "email:voicemail_callbacks",
      target: { threadIds: callbacks.map((v) => v.id) },
      summary: `${callbacks.length} ${callbacks.length === 1 ? "voicemail is" : "voicemails are"} worth a call back:`,
      body: callbacks.slice(0, 10).map(callbackLine).join("\n"),
    });
  }
  return { items, costUsd };
}

// ---------------------------------------------------------------------------
// The pass

/**
 * The day's Slack and organic reads ride the same pass (TJ, 2026-10-02): what
 * he owes on Slack, drafted, and a daily organic read with one action. Each is
 * optional; a failure in either is reported, never fatal to the inbox.
 */
export type InboxExtras = { slackCoverage?: string | null; organic?: Pick<OrganicRead, "synopsis" | "section"> | null; notes?: string[] };
export type InboxPass = { passId: string; items: StoredItem[]; waitingElsewhere: number; costUsd: number; draftsInGmail?: number; extras?: InboxExtras };

/** What this pass would propose, in digest order, without storing anything. */
/** Rejects after ms; the work itself is left to finish or fail on its own. */
function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took over ${Math.round(ms / 1000)}s`)), ms); });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

const SLACK_KIND_LABEL: Record<string, string> = { mention: "asked you", unanswered_thread: "your thread, no reply", promise: "you promised" };

/** Replies he owes on Slack, as numbered drafts. */
export function slackProposals(owed: SlackOwed): ProposedItem[] {
  return owed.items.map((item) => ({
    kind: "slack_draft" as const,
    category: `slack:${item.kind}`,
    // A standalone DM has no thread: an empty threadTs replies at the top of the DM.
    target: { channelId: item.channelId, ts: item.ts, threadTs: item.threadTs ?? "", permalink: item.permalink },
    summary: `${item.author ?? "unattributed"} in ${item.channelLabel} (${SLACK_KIND_LABEL[item.kind] ?? item.kind}, ${item.ageDays}d): "${clip(item.text, 140)}"`,
    body: item.draftReply,
  }));
}

/** The organic read's one action, as an item he can approve into a handoff. */
export function organicProposal(read: OrganicRead): ProposedItem | null {
  if (!read.action) return null;
  return {
    kind: "proposal",
    category: "organic:action",
    target: { metric: read.action.metric, brief: read.action.brief },
    summary: `${read.action.title}. ${read.action.why}`,
  };
}

export async function buildInboxProposals(db: SupabaseClient, now = new Date()): Promise<{ proposed: ProposedItem[]; waitingElsewhere: number; costUsd: number; draftsInGmail: number; extras: InboxExtras; organicRead: OrganicRead | null }> {
  const notes: string[] = [];
  const failed = (what: string) => (error: unknown) => {
    notes.push(`${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  };
  const [sms, email, voicemail, slack, organic] = await Promise.all([
    smsProposals(db), emailProposals(db), voicemailProposals(db),
    // Each has its own clock: the pass has 300s, the organic read alone takes
    // about 125s (2 Oct dry run), and the inbox must go out regardless.
    withDeadline(findSlackOwed(db, now), 120_000, "Slack scan").catch(failed("Slack scan")),
    withDeadline(buildOrganicRead(db, now), 210_000, "Organic read").catch(failed("Organic read")),
  ]);
  const proposal = organic ? organicProposal(organic) : null;
  // Order: clear first, then ready to send, then the one question.
  const questions = sms.items.filter((item) => item.kind === "question").slice(0, 1);
  const proposed: ProposedItem[] = [
    ...email.items.filter((item) => item.kind === "triage_batch"),
    ...voicemail.items.filter((item) => item.kind === "triage_batch"),
    ...sms.items.filter((item) => item.kind === "triage_batch"),
    ...sms.items.filter((item) => item.kind === "sms_draft"),
    ...email.items.filter((item) => item.kind === "email_draft"),
    ...(slack ? slackProposals(slack) : []),
    ...voicemail.items.filter((item) => item.kind === "question"),
    ...(proposal ? [proposal] : []),
    ...questions,
  ];
  const extraQuestions = sms.items.filter((item) => item.kind === "question").length - questions.length;
  return {
    proposed,
    waitingElsewhere: sms.waitingElsewhere + email.waitingElsewhere + Math.max(0, extraQuestions),
    costUsd: email.costUsd + voicemail.costUsd + (slack?.costUsd ?? 0) + (organic?.costUsd ?? 0),
    draftsInGmail: email.draftsInGmail,
    extras: { slackCoverage: slack?.coverage ?? null, organic: organic ? { synopsis: organic.synopsis, section: organic.section } : null, notes },
    organicRead: organic,
  };
}

/** Build the pass, store its items (older proposals expire), and return them. */
export async function runInboxPass(db: SupabaseClient, now = new Date()): Promise<InboxPass> {
  const { proposed: built, waitingElsewhere, costUsd, draftsInGmail, extras, organicRead } = await buildInboxProposals(db, now);
  let proposed = built;
  const passId = now.toISOString().slice(0, 16);
  // 36 hours, not 24: with one pass a day, yesterday's items sit right at a 24-hour edge.
  const { data: recent } = await db.from("cortex_inbox_items").select("number").gte("created_at", new Date(now.getTime() - 36 * 3_600_000).toISOString());
  const numbers = assignNumbers(proposed, ((recent ?? []) as Array<{ number: number }>).map((row) => row.number));
  await db.from("cortex_inbox_items").update({ status: "expired", decided_at: now.toISOString() }).eq("status", "proposed");
  const rows = proposed.map((item, i) => {
    const { carriedNumber: _carried, ...target } = item.target;
    return { ...item, target, body: item.body ?? null, pass_id: passId, number: numbers[i] };
  });
  let { data, error } = rows.length ? await db.from("cortex_inbox_items").insert(rows).select("*") : { data: [], error: null };
  // Before migration 270 the table refuses the two new kinds. Store the inbox
  // without them rather than lose the whole day's pass, and say so.
  if (error && /cortex_inbox_items_kind_check/.test(error.message)) {
    const keep = rows.filter((row) => row.kind !== "slack_draft" && row.kind !== "proposal");
    proposed = proposed.filter((item) => item.kind !== "slack_draft" && item.kind !== "proposal");
    (extras.notes ??= []).push(`${rows.length - keep.length} Slack and organic items not stored: run migration 270.`);
    ({ data, error } = keep.length ? await db.from("cortex_inbox_items").insert(keep).select("*") : { data: [], error: null });
  }
  if (error) throw new Error(`inbox items not stored: ${error.message}`);
  if (organicRead) await rememberOrganicRead(db, organicRead, now).catch((e: unknown) => (extras.notes ??= []).push(`Organic memory not saved: ${e instanceof Error ? e.message : String(e)}`));
  return {
    passId,
    items: ((data ?? []) as StoredItem[]).sort((a, b) => a.number - b.number),
    waitingElsewhere,
    costUsd,
    draftsInGmail,
    extras,
  };
}

/**
 * Numbers for this pass. A draft carried from the last pass keeps its number;
 * everything else takes the lowest number no item has had in the last 36
 * hours. So "send 4" typed from last night's digest either reaches the same
 * thread or gets "not in the current list", never somebody else's draft.
 */
export function assignNumbers(proposed: ProposedItem[], usedRecently: number[]): number[] {
  const taken = new Set(usedRecently);
  const kept = new Set<number>();
  const out: Array<number | null> = proposed.map((item) => {
    const n = item.target.carriedNumber;
    if (typeof n === "number" && !kept.has(n)) {
      kept.add(n);
      return n;
    }
    return null;
  });
  let next = 1;
  return out.map((n) => {
    if (n !== null) return n;
    while (taken.has(next) || kept.has(next)) next += 1;
    kept.add(next);
    return next;
  });
}

/**
 * A provider email goes out when he approves it; everything else stays a
 * Gmail draft he sends himself. TJ, 2026-10-02, choosing between all,
 * providers only and none: providers only. Families are where a wrong sentence
 * costs most, and the last look in Gmail is where he caught one on 1 Oct.
 *
 * "Provider" means a thread matched to an Olera provider account. The
 * classifier's provider label alone also covers caregivers asking for a job
 * and a dental office asking about a patient, so it is not enough to send on.
 */
export function sendsOnApproval(item: Pick<StoredItem, "kind" | "category" | "target">): boolean {
  return item.kind === "email_draft" && item.category === "email:draft:provider" && item.target?.matchedProvider === true;
}

/** "Email Blue Water Homecare re ..." -> "Blue Water Homecare". */
export function whoFor(item: StoredItem): string {
  return clip(item.summary.replace(/^(Email|Text)\s+/, "").split(/ re "| \(waiting|\. They said|: "/)[0], 42);
}

/** "Ces ×4, your threads ×3, Graize" from the Slack items' summaries. */
function slackWho(items: StoredItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const author = item.summary.split(" in ")[0];
    const who = item.category === "slack:unanswered_thread" || item.category === "slack:promise" ? "your threads" : author.split(" ")[0];
    counts.set(who, (counts.get(who) ?? 0) + 1);
  }
  return [...counts].map(([who, n]) => (n > 1 ? `${who} ×${n}` : who)).join(", ");
}

/** "8 to 15", or "8, 11, 14" when the numbers aren't consecutive. */
function numberSpan(items: StoredItem[]): string {
  const n = items.map((item) => item.number).sort((a, b) => a - b);
  const consecutive = n.every((value, i) => i === 0 || value === n[i - 1] + 1);
  return n.length > 2 && consecutive ? `${n[0]} to ${n[n.length - 1]}` : n.join(", ");
}

/**
 * Items that need their number named: a Slack reply posts as him, and a
 * proposal starts work. "approve all" and the suggested line leave them out.
 */
export function needsNamedApproval(item: Pick<StoredItem, "kind">): boolean {
  return item.kind === "slack_draft" || item.kind === "proposal";
}

/** One short phrase for a triage batch: "archive 5 old voicemails". */
function triagePhrase(item: StoredItem): string {
  const ids = (key: string) => ((item.target[key] as unknown[] | undefined) ?? []).length;
  switch (item.category) {
    case "email:noise": return `archive ${Number(item.target.count ?? 0)} noise emails`;
    case "email:voicemail_aged": return `archive ${ids("threadIds")} old voicemails`;
    case "email:voicemail_recent": return `archive ${ids("threadIds")} stale voicemails`;
    case "sms:keywords": return `close ${ids("phones")} text threads`;
    default: return clip(item.summary, 60);
  }
}

/**
 * The Telegram message: what is waiting, one line per draft, no draft text.
 * The full digest is the day's inbox report (a /handoff on his computer).
 * TJ, 2026-10-02: "a daily synopsis of what I need to approve in a very
 * concise way ... everything is captured in the handoff report and then I'll
 * execute it from my computer." A crisis or STUCK text stays in full: it must
 * never wait for the computer.
 */
export function renderSynopsis(pass: InboxPass, now = new Date()): string {
  if (!pass.items.length) return renderDigest(pass);
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const triage = pass.items.filter((item) => item.kind === "triage_batch");
  const texts = pass.items.filter((item) => item.kind === "sms_draft");
  const emails = pass.items.filter((item) => item.kind === "email_draft");
  const slack = pass.items.filter((item) => item.kind === "slack_draft");
  const proposal = pass.items.find((item) => item.kind === "proposal");
  const calls = pass.items.find((item) => item.category === "email:voicemail_callbacks");
  const questions = pass.items.filter((item) => item.kind === "question" && item.category !== "email:voicemail_callbacks");
  const actionable = pass.items.filter((item) => item.kind !== "question");
  const quick = actionable.filter((item) => !needsNamedApproval(item));
  const line = (items: StoredItem[]) => items.map((item) => `${item.number} ${whoFor(item)}${sendsOnApproval(item) ? " (sends)" : ""}${item.target?.carried ? " (same draft)" : ""}`).join(" · ");
  const parts = [
    `*Inbox, ${day}:* ${actionable.length} to approve.`,
    triage.length ? `Clear: ${triage.map((item) => `${item.number} ${triagePhrase(item)}`).join(" · ")}` : "",
    texts.length ? `Texts: ${line(texts)}` : "",
    emails.length ? `Emails: ${line(emails)}` : "",
    calls ? `Calls: ${((calls.target.threadIds as unknown[] | undefined) ?? []).length} voicemails worth a call back.` : "",
    slack.length ? `Slack: ${slack.length} ${slack.length === 1 ? "reply" : "replies"} owed (${slackWho(slack)}), ${numberSpan(slack)}` : "",
    ...(pass.extras?.organic?.synopsis ?? []).slice(0, 3).map((line, i) => (i === 0 ? `Organic: ${line}` : line)),
    proposal ? `Try: ${proposal.number} ${clip(proposal.summary.split(". ")[0], 70)}` : "",
    ...questions.map((item) => `${item.number}. ${item.summary}`),
  ].filter(Boolean);
  const more = [
    pass.waitingElsewhere ? `${pass.waitingElsewhere} more need a person in the inbox.` : "",
    pass.draftsInGmail ? `${pass.draftsInGmail} approved ${pass.draftsInGmail === 1 ? "draft is" : "drafts are"} in Gmail waiting for you to send.` : "",
  ].filter(Boolean).join(" ");
  const how = actionable.length ? `Drafts and lists are in today's inbox report: /handoff on your computer. ${quick.length ? ` Or reply here, "approve ${quick.map((item) => item.number).join(" ")}".` : ""}${actionable.length > quick.length ? " Slack replies and the organic action go by number once you've read them." : ""}` : "";
  return [parts.join("\n"), [how, more].filter(Boolean).join(" ")].filter(Boolean).join("\n\n");
}

/** The full digest as a handoff: what each item is, and how a Claude Code session carries out his choices. */
export function inboxReportBody(pass: InboxPass, now = new Date()): { title: string; body: string } {
  const title = `Inbox report, ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const run = "npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts";
  const body = `# ${title}

Cortex's daily inbox pass (${pass.passId} UTC). Telegram got a one-screen synopsis; this is everything behind it. Nothing has been sent.

## The items

${renderDigest(pass).replace(/^\*([^*\n][^\n]*[^*\n])\*$/gm, "### $1")}

## How to act (for the Claude Code session)

**Do not act on anything until TJ names the numbers.** This report is a list of choices, not a task.

Walk him through it, so he never has to remember a command:

1. Open with one line: how many items, which are drafts, which are clear-outs.
2. Clear-outs first, together: list them in a sentence and ask "approve all of these?"
3. Then each draft, texts, emails and Slack replies, one at a time: show the full text (for Slack, the message he owes a reply to as well) and ask "approve, edit, check, or skip?" Check is for texts and emails, which go to families and providers; a Slack reply to the team skips it, and an edited Slack reply goes as \`send N: <text>\`. On "edit", write the change with him, then run \`check N: <new text>\` so the version he approves is the checked one. On "check", run it and show the objections. On "skip", run it.
4. Then the organic read in a few sentences, and its one action: approving it turns it into a /handoff brief.
5. Last, the call-back list, if he wants it.
6. End with the single line he sends Cortex on Telegram for everything he approved, e.g. \`approve 12 15 16\`. An edited draft is sent as is by approving its number, because "check N: <text>" already made it the version that goes.

Commands, from an olera-web checkout:

\`\`\`
${run} list                  # what is still open
${run} check 5               # fact-check a draft (Perplexity), sends nothing
${run} "check 5: <his text>" # check his edited version; "send 5" then sends it
${run} skip 4
\`\`\`

Approvals run in production, not here: archiving and email drafts go through Gmail, whose keys are only in Vercel. When he has chosen, give him the one line to send Cortex on Telegram (desktop works), for example \`approve 2 5 7\` or \`send 5: <his text>\`. Texts go to families on approval (quiet hours respected). An email to a matched provider account is sent from support@ on approval; every other email becomes a Gmail draft he sends himself. The digest says which under each draft. Items stay open until the next pass (${nextPassIn(now)}).

When he is done, close this report with what he chose: \`npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-handoffs.ts close <id> done "approved 2 5 7"\`.
`;
  return { title, body };
}

/** The Telegram message: numbered, short, one line per item, drafts quoted. */
export function renderDigest(pass: InboxPass): string {
  if (!pass.items.length) {
    const gmailOnly = pass.draftsInGmail ? ` ${pass.draftsInGmail} approved ${pass.draftsInGmail === 1 ? "draft is" : "drafts are"} in Gmail waiting for you to send.` : "";
    return (pass.waitingElsewhere
      ? `Inbox pass: nothing I can clear or draft right now. ${pass.waitingElsewhere} ${pass.waitingElsewhere === 1 ? "thread needs" : "threads need"} a person in /admin/inbox or support email.`
      : "Inbox pass: both inboxes are clear.") + gmailOnly;
  }
  const section = (title: string, kinds: InboxItemKind[], only: (item: StoredItem) => boolean = () => true) => {
    const rows = pass.items.filter((item) => kinds.includes(item.kind) && only(item));
    if (!rows.length) return "";
    return `*${title}*\n${rows.map((item) => `${item.number}. ${item.summary}${item.target?.carried ? " (Same draft as last pass; nothing new from them.)" : ""}${currentText(item) ? `\n> ${currentText(item).replace(/\n+/g, "\n> ")}` : ""}${item.kind === "email_draft" ? (sendsOnApproval(item) ? "\n(Provider account: sent from support@ when you approve.)" : "\n(Saved as a Gmail draft when you approve. You send it.)") : ""}${item.kind === "slack_draft" ? `\n(Posts in the thread as you when you approve.${item.target?.permalink ? ` ${String(item.target.permalink)}` : ""})` : ""}${item.kind === "proposal" ? "\n(Approving turns this into a /handoff brief. Nothing changes on the site by itself.)" : ""}`).join("\n\n")}`;
  };
  const parts = [
    section("Clear", ["triage_batch"]),
    section("Ready to send", ["sms_draft", "email_draft"]),
    section("Slack: replies you owe", ["slack_draft"]),
    pass.extras?.slackCoverage ? `_${pass.extras.slackCoverage}_` : "",
    section("Call back", ["question"], (item) => item.category === "email:voicemail_callbacks"),
    pass.extras?.organic?.section ? `*Organic*\n${pass.extras.organic.section.replace(/^#{1,3}\s*Organic\s*\n+/i, "")}` : "",
    section("Organic: today's action", ["proposal"]),
    section("One question", ["question"], (item) => item.category !== "email:voicemail_callbacks"),
    ...(pass.extras?.notes ?? []).map((note) => `_${note}_`),
  ].filter(Boolean);
  const numbers = pass.items.filter((item) => item.kind !== "question" && !needsNamedApproval(item)).map((item) => item.number);
  const how = numbers.length
    ? `Reply "approve ${numbers.join(" ")}" for all of them, or "send ${numbers[0]}", "skip ${numbers[0]}", or "send ${numbers[numbers.length - 1]}: your edited text". "check ${numbers[numbers.length - 1]}" fact-checks a draft first. Busy? Reply "later" and they come back in the next pass.`
    : "";
  const more = pass.waitingElsewhere ? ` ${pass.waitingElsewhere} more need a person in the inbox.` : "";
  const gmail = pass.draftsInGmail ? ` ${pass.draftsInGmail} approved ${pass.draftsInGmail === 1 ? "draft is" : "drafts are"} in Gmail waiting for you to send.` : "";
  return `${parts.join("\n\n")}\n\n${how}${more}${gmail}`.trim();
}

// ---------------------------------------------------------------------------
// Approvals

export type InboxCommand = { verb: "approve" | "skip" | "later" | "check"; numbers: number[]; edit: string | null };

/** "later", "not now", "busy": leave everything open for the next pass (TJ, 2026-09-27). */
const LATER = /^(later|not now|busy|not now,? busy|tomorrow|snooze|remind me later)[.!]?$/i;

/** "approve 1 2", "send 3", "yes 1,2", "skip 4", "send 3: new text", "later", "check 5 6". Null when it is not a command. */
export function parseInboxCommand(text: string): InboxCommand | null {
  // A command on its first line counts even with a note under it. On
  // 2026-09-28 "approve 1 2 3 4\n\nFirst let's handle this chunk..." went to
  // the model as a question and nothing ran. An edit ("send 3: ...") may span
  // lines, so the whole message is tried first.
  const whole = parseOne(text);
  if (whole) return whole;
  const first = text.trim().split(/\n/)[0] ?? "";
  const line = parseOne(first);
  return line && !line.edit ? line : null;
}

function parseOne(text: string): InboxCommand | null {
  if (LATER.test(text.trim())) return { verb: "later", numbers: [], edit: null };
  // "check 5 6" fact-checks drafts and sends nothing (TJ, 2026-09-28).
  const check = text.trim().match(/^(?:check|fact[- ]?check|attack|verify)\s+((?:\d+[\s,&]*(?:and\s+)?)+)[.!]?$/i);
  if (check) return { verb: "check", numbers: [...check[1].matchAll(/\d+/g)].map((m) => Number(m[0])), edit: null };
  // "check 8: <text>" checks his version, or Cortex's rewrite, before it is
  // sent. On 2026-09-29 a chat rewrite told a family "you're eligible for SMMC
  // Long-Term Care" and "check" could only read the stored draft.
  const checkEdit = text.trim().match(/^(?:check|fact[- ]?check|attack|verify)\s+(\d+)\s*:\s*([\s\S]+)$/i);
  if (checkEdit) return { verb: "check", numbers: [Number(checkEdit[1])], edit: checkEdit[2].trim() };
  const match = text.trim().match(/^(approve|send|yes|do|ok|skip|no)\s+((?:\d+[\s,&]*(?:and\s+)?)+|all)\s*(?::\s*([\s\S]+))?$/i);
  if (!match) return null;
  const verb = /^(skip|no)$/i.test(match[1]) ? "skip" : "approve";
  const numbers = /^all$/i.test(match[2].trim()) ? [] : [...match[2].matchAll(/\d+/g)].map((m) => Number(m[0]));
  const edit = match[3]?.trim() || null;
  if (edit && numbers.length !== 1) return null;
  return { verb, numbers, edit };
}

/** The items of the latest pass still waiting on him (within a day). */
export async function openItems(db: SupabaseClient): Promise<StoredItem[]> {
  const { data } = await db.from("cortex_inbox_items")
    .select("*")
    .eq("status", "proposed")
    .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
    .order("number", { ascending: true });
  return (data ?? []) as StoredItem[];
}

/** Carry out one approved item through the inbox's own code. Returns one line for him. */
export async function executeInboxItem(db: SupabaseClient, item: StoredItem, edit: string | null): Promise<string> {
  const approver = await approverAdmin(db);
  if (!approver) return `${item.number}: not done, no admin record for the approver.`;
  // Claim it before acting. "send 3" typed twice, or two messages racing,
  // must not text a family twice: only one caller gets the row.
  const { data: claimed } = await db.from("cortex_inbox_items")
    .update({ decided_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("status", "proposed")
    .is("decided_at", null)
    .select("id");
  if (!claimed?.length) return `${item.number}: already being handled.`;
  // What actually goes: his words in the command, else the latest version
  // he saw, else the stored draft. The reply quotes it when it isn't the
  // stored draft, so he never wonders which one went.
  const latest = edit ? null : latestVersion(item);
  const sentText = edit ?? currentText(item);
  const changed = sentText !== (item.body ?? "");
  const finish = async (status: "done" | "failed" | "skipped", result: string) => {
    await db.from("cortex_inbox_items").update({ status, result, decided_at: new Date().toISOString(), edited: changed, ...(changed ? { body: sentText } : {}) }).eq("id", item.id).eq("status", "proposed");
    const which = status === "done" && latest && (item.kind === "sms_draft" || item.kind === "email_draft")
      ? ` (${latest.by === "cortex" ? "Cortex's rewrite" : "your version"}: "${clip(latest.text, 90)}")`
      : "";
    return `${item.number}: ${result}${which}`;
  };
  try {
    if (item.kind === "question" && item.category !== "email:voicemail_callbacks") return finish("skipped", "that one is a question; answer it here in words and I'll take it from there.");
    if (item.category === "email:noise") {
      // Re-read the cohort: the confirm must match what exists right now.
      const dry = await runNoiseSweep(db, { actor: approver.actor, adminUserId: approver.id, confirm: null });
      const count = Number(dry.json.matching ?? 0);
      if (!count) return finish("done", "nothing left to archive.");
      const run = await runNoiseSweep(db, { actor: approver.actor, adminUserId: approver.id, confirm: String(count) });
      return run.status === 200 ? finish("done", `archived ${run.json.processed ?? count} noise emails.`) : finish("failed", `archive failed: ${String(run.json.error ?? run.status)}`);
    }
    if (item.category === "email:voicemail_aged" || item.category === "email:voicemail_recent") {
      const ids = (item.target.threadIds as string[] | undefined) ?? [];
      const { archived } = await archiveSupportThreads(db, {
        threadIds: ids,
        actor: approver.actor,
        adminUserId: approver.id,
        action: item.category === "email:voicemail_aged" ? "voicemail_aged_out" : "voicemail_archive",
        details: { approvedCount: ids.length },
      });
      return finish("done", `archived ${archived} voicemails. They stay in All Mail.`);
    }
    if (item.category === "email:voicemail_callbacks") {
      return finish("skipped", "those are for you to call; I'll keep listing them until they're 14 days old.");
    }
    if (item.kind === "slack_draft") {
      const text = edit ?? currentText(item);
      if (!text) return finish("failed", "no reply drafted; write one with send N: <text>.");
      // A promise draft leaves "[status]" for him to fill; it never posts with the blank in it.
      const blank = edit ? null : text.match(/\[[^\]\n]{2,40}\]/);
      if (blank) return finish("failed", `not posted: fill in ${blank[0]} first, with send ${item.number}: <your text>.`);
      const posted = await postSlackReplyAsTj(db, { channelId: String(item.target.channelId), threadTs: String(item.target.threadTs ?? ""), text });
      return posted.ok ? finish("done", `posted in the thread as you.${posted.permalink ? ` ${posted.permalink}` : ""}`) : finish("failed", `not posted: ${posted.error}`);
    }
    if (item.kind === "proposal") {
      const brief = String(item.target.brief ?? "");
      if (!brief) return finish("failed", "the proposal has no brief to hand off.");
      const handoff = await saveHandoff(db, { body: brief, note: "organic proposal", chatId: process.env.TELEGRAM_CORTEX_CHAT_ID?.trim() ?? "" });
      return finish("done", `handed off as "${handoff.title}" (id ${handoff.id.slice(0, 8)}). Run /handoff on your computer to build it.`);
    }
    if (item.category === "sms:keywords") {
      const phones = (item.target.phones as string[] | undefined) ?? [];
      let ok = 0;
      for (const last10 of phones) {
        const result = await markSmsThreadHandled(db, last10, approver.actor);
        if (result.status === 200) ok += 1;
      }
      return finish(ok === phones.length ? "done" : "failed", `marked ${ok} of ${phones.length} text threads handled.`);
    }
    if (item.kind === "sms_draft") {
      const result = await replyToSmsThread(db, { last10: String(item.target.last10), body: edit ?? currentText(item), actor: approver.actor, adminUserId: approver.id });
      if (result.status !== 200) return finish("failed", `not sent: ${String(result.json.error ?? result.status)}`);
      const scheduled = result.json.scheduled as { sendAfter?: string; tz?: string } | undefined;
      return finish("done", scheduled?.sendAfter ? `scheduled for their morning (quiet hours where they are).` : "sent.");
    }
    if (item.kind === "email_draft") {
      const args = { threadId: String(item.target.threadId), body: edit ?? stripDraftHeaders(currentText(item)), actor: approver.actor, adminUserId: approver.id };
      if (sendsOnApproval(item)) {
        const sent = await sendSupportReply(db, args);
        return finish("done", `sent to ${sent.to} from support@.${sent.warning ? ` (It went; ${sent.warning}.)` : ""}`);
      }
      await saveSupportDraft(db, args);
      return finish("done", "saved as a Gmail draft on the thread. Send it from Gmail when you're ready.");
    }
    return finish("failed", "I don't know how to do that one.");
  } catch (error) {
    return finish("failed", `failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Run a command against the open items. Returns the reply for him, or null
 *  when "later"/"busy" was just conversation (nothing open), so the normal
 *  chat reply handles it instead. */
export async function handleInboxCommand(db: SupabaseClient, command: InboxCommand): Promise<string | null> {
  const open = (await openItems(db)).filter((item) => !(item as StoredItem & { decided_at?: string | null }).decided_at);
  if (!open.length && command.verb === "later") return null;
  if (!open.length) return "Nothing from the inbox is waiting on you right now.";
  // Nothing is sent or marked. Every thread still waiting on us is proposed
  // again by the next pass (smsProposals / emailProposals read the inboxes,
  // not this list), so "later" only has to say so.
  if (command.verb === "later") {
    return `OK, nothing sent. The ${open.length} open ${open.length === 1 ? "item stays" : "items stay"} open and come back in the next inbox pass (${nextPassIn()}).`;
  }
  if (command.verb === "check") return checkItems(db, open, command.numbers, command.edit);
  // "approve all" covers the quick items only; a Slack reply or a proposal needs its number.
  const chosen = command.numbers.length ? open.filter((item) => command.numbers.includes(item.number)) : open.filter((item) => item.kind !== "question" && !needsNamedApproval(item));
  const missing = command.numbers.filter((n) => !open.some((item) => item.number === n));
  const lines: string[] = [];
  for (const item of chosen) {
    // A rewrite from the chat has not been through the drafter's own checks,
    // so the first "send" fact-checks it and holds it on a high objection.
    // On 2026-09-29 a chat rewrite told a family "you're eligible for SMMC
    // Long-Term Care"; Perplexity flagged it high. Saying send again sends it.
    if (command.verb !== "skip" && !command.edit) {
      const latest = latestVersion(item);
      if (latest?.by === "cortex" && !latest.checked && (item.kind === "sms_draft" || item.kind === "email_draft")) {
        const objections = await checkDraft(db, { ...item, body: latest.text }).catch(() => null);
        await saveLatest(db, item, { ...latest, checked: true });
        const high = (objections ?? []).filter((objection) => objection.confidence === "high");
        if (high.length) {
          lines.push(`${renderCheck({ ...item, body: latest.text }, high, "Cortex's rewrite")}\nNot sent. Say send ${item.number} again to send it anyway.`);
          continue;
        }
      }
    }
    if (command.verb === "skip") {
      await db.from("cortex_inbox_items").update({ status: "skipped", decided_at: new Date().toISOString() }).eq("id", item.id).eq("status", "proposed");
      lines.push(`${item.number}: skipped.`);
    } else {
      lines.push(await executeInboxItem(db, item, command.edit));
    }
  }
  if (missing.length) lines.push(`${missing.join(", ")}: not in the current list (already done, skipped, or from an older pass).`);
  return lines.join("\n");
}

/** "check 5 6": drafts checked in parallel, nothing sent, every item left open. */
async function checkItems(db: SupabaseClient, open: StoredItem[], numbers: number[], edit: string | null = null): Promise<string> {
  const lines: string[] = [];
  const drafts = open
    .filter((item) => numbers.includes(item.number) && (item.kind === "sms_draft" || item.kind === "email_draft") && (currentText(item) || edit))
    // The version he'd send: his words, else the latest rewrite, else the draft.
    .map((item) => ({ ...item, body: edit ?? currentText(item) }));
  // A version he wrote and checked becomes the one "send" sends.
  if (edit && drafts.length === 1) await saveLatest(db, drafts[0], { text: edit, at: new Date().toISOString(), by: "you", checked: true });
  const notDrafts = numbers.filter((n) => open.some((item) => item.number === n) && !drafts.some((item) => item.number === n));
  const missing = numbers.filter((n) => !open.some((item) => item.number === n));
  const results = await Promise.all(drafts.map((item) => checkDraft(db, item).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))));
  // A rewrite he has now seen checked goes out on the next "send" without a second check.
  for (const item of drafts) {
    const latest = latestVersion(open.find((o) => o.id === item.id)!);
    if (!edit && latest && !latest.checked) await saveLatest(db, item, { ...latest, checked: true });
  }
  drafts.forEach((item, i) => {
    const latest = latestVersion(open.find((o) => o.id === item.id)!);
    const version = edit ? "your version" : latest ? (latest.by === "cortex" ? "Cortex's rewrite" : "your version") : null;
    lines.push(renderCheck(item, results[i], version));
  });
  if (notDrafts.length) lines.push(`${notDrafts.join(", ")}: not a draft, nothing to check.`);
  if (missing.length) lines.push(`${missing.join(", ")}: not in the current list (already done, skipped, or from an older pass).`);
  return lines.join("\n\n");
}

async function saveLatest(db: SupabaseClient, item: StoredItem, latest: LatestVersion) {
  await db.from("cortex_inbox_items")
    .update({ target: { ...(item.target ?? {}), latest } })
    .eq("id", item.id)
    .eq("status", "proposed");
}

/**
 * Rewrites Cortex offered in its reply, as "send 5: <text>" blocks (it is
 * told to write them that way). Each becomes that item's latest version.
 */
export function parseRewrites(reply: string): Array<{ number: number; text: string }> {
  const out: Array<{ number: number; text: string }> = [];
  // At the start of a line, allowing the quote marks, blockquote, bullet and
  // bold Cortex may wrap it in: "send 5: …", > send 5: …, • *send 5:* …
  const lead = String.raw`[\s>•*"“-]*`;
  const pattern = new RegExp(String.raw`(?:^|\n)${lead}send (\d+)\**\s*:\**\s*([\s\S]*?)(?=\n\s*\n|\n${lead}send \d+\**\s*:|$)`, "gi");
  for (const match of reply.matchAll(pattern)) {
    const text = match[2].trim().replace(/^[>\s]+/gm, "").replace(/^["“]|["”]$/g, "").trim();
    // "send 5: <your edited text>" is an instruction, not a rewrite.
    if (text.length >= 20 && !/^<[^>]*>$/.test(text) && !/^(your|the) (own |edited )?(words|text|version)/i.test(text)) out.push({ number: Number(match[1]), text });
  }
  return out;
}

export async function rememberRewrites(db: SupabaseClient, reply: string): Promise<number> {
  const rewrites = parseRewrites(reply);
  if (!rewrites.length) return 0;
  const open = await openItems(db);
  let saved = 0;
  for (const rewrite of rewrites) {
    const item = open.find((o) => o.number === rewrite.number && (o.kind === "sms_draft" || o.kind === "email_draft" || o.kind === "slack_draft"));
    if (!item) continue;
    await saveLatest(db, item, { text: rewrite.text, at: new Date().toISOString(), by: "cortex" });
    saved += 1;
  }
  return saved;
}

/** Words that can start an inbox action. Anything without one is conversation, and costs nothing. */
const ACTION_WORDS = /\b(send|sent|check|fact[- ]?check|verify|perplexity|approve|go ahead|ship|skip|drop|do it|push it|fire)\b/i;

/**
 * "check it", "yeah send those two", "go ahead with 6": what he meant, read
 * by Haiku against the open items and Cortex's last message, when the words
 * are not an exact command. TJ, 2026-09-29: "Can we not be so strict, because
 * there's a good chance I'll forget in a couple days?" Returns null unless he
 * clearly asked for an action on numbered inbox items; a sent text cannot be
 * unsent, so any doubt is conversation.
 */
export async function inferInboxCommand(text: string, open: StoredItem[], lastCortex: string | null): Promise<InboxCommand | null> {
  if (!ACTION_WORDS.test(text) || !process.env.ANTHROPIC_API_KEY) return null;
  const drafts = open.filter((item) => item.kind !== "question");
  if (!drafts.length) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: `You decide whether the founder's message is an instruction to act on numbered items in his inbox digest. Actions: "send" (send or approve those items), "check" (fact-check those drafts with Perplexity), "skip". Resolve "it", "them", "those", "both" from Cortex's last message. Say "none" unless the message clearly instructs one of these actions now: a question about sending, a discussion of a draft, or a message to a person or channel on Slack ("send that to Logan", "post in #general") is "none". When unsure, "none". Reply with JSON only: {"action":"send"|"check"|"skip"|"none","numbers":[...]}.`,
      messages: [{
        role: "user",
        content: `OPEN ITEMS:\n${drafts.map((item) => `${item.number}. ${clip(item.summary, 140)}`).join("\n")}\n\nCORTEX'S LAST MESSAGE:\n${clip(lastCortex ?? "(none)", 1_500)}\n\nHE SAYS:\n${text}`,
      }],
    }, { timeout: 15_000, maxRetries: 0 });
    const raw = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { action?: string; numbers?: number[] };
    const numbers = (parsed.numbers ?? []).filter((n) => drafts.some((item) => item.number === n));
    if (!numbers.length) return null;
    if (parsed.action === "send") return { verb: "approve", numbers, edit: null };
    if (parsed.action === "check") return { verb: "check", numbers, edit: null };
    if (parsed.action === "skip") return { verb: "skip", numbers, edit: null };
    return null;
  } catch {
    return null;
  }
}

/** Hours until the next cortex-inbox-pass run (vercel.json: daily at 01:00 UTC, 08:00 in Bangkok). */
export function nextPassIn(now = new Date()): string {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const next = [1, 25].find((x) => x > h) as number;
  const hours = Math.max(1, Math.round(next - h));
  return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Approvals per category, and how many went through without an edit: the record autonomy would be earned on. */
export async function approvalRecord(db: SupabaseClient) {
  const { data } = await db.from("cortex_inbox_items").select("category, status, edited").in("status", ["done", "skipped"]).limit(2_000);
  const record: Record<string, { approved: number; unedited: number; skipped: number }> = {};
  for (const row of (data ?? []) as Array<{ category: string; status: string; edited: boolean }>) {
    const entry = record[row.category] ?? { approved: 0, unedited: 0, skipped: 0 };
    if (row.status === "done") {
      entry.approved += 1;
      if (!row.edited) entry.unedited += 1;
    } else entry.skipped += 1;
    record[row.category] = entry;
  }
  return record;
}
