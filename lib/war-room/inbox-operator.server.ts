import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOptOutPhrase, matchOutcomeReply } from "@/lib/sms/inbound-intent";
import { markSmsThreadHandled, MAX_SMS_BODY, replyToSmsThread } from "@/lib/sms/inbox-actions.server";
import { runNoiseSweep } from "@/lib/support-email/noise-sweep.server";
import { archiveSupportThreads, saveSupportDraft } from "@/lib/support-email/thread-actions.server";
import { AGED_OUT_DAYS, callbackLine, loadWaitingVoicemails, sortVoicemails, STALE_CALLBACK_DAYS } from "@/lib/war-room/voicemail-triage.server";

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
 * as they do for his clicks. Email is drafted only; he sends from Gmail.
 *
 * Never surface handled work (TJ, 26 Sep: "it's giving outdated information,
 * stuff that we've already handled"). A thread is proposed only when the last
 * message in it came from them, after our last reply.
 */

export type InboxItemKind = "triage_batch" | "sms_draft" | "email_draft" | "question";
export type ProposedItem = {
  kind: InboxItemKind;
  category: string;
  target: Record<string, unknown>;
  summary: string;
  body?: string | null;
};
export type StoredItem = ProposedItem & { id: string; pass_id: string; number: number; status: string; created_at: string };

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
      drafts.push({ kind: "sms_draft", category: `sms:reply:${job?.packet?.triage?.category ?? "other"}`, target: { last10 }, summary: `Text ${who} (waiting ${waitedHours}h). They said: "${said}"`, body: draft });
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

type ThreadRow = { id: string; subject: string; category: string; agent_summary: string | null; suggested_draft: string | null; matched_profile_name: string | null; last_message_at: string };
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
- Plain, warm, short: three to six sentences. One clear next step. No hedging, no over-apologising, no em dashes, no marketing language.
- Never invent a fact, a price, a date or a promise the thread does not support. If something needs checking, say what you will find out instead of guessing.
- Sign off as "TJ, Olera".
Reply with the email body only.`;

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
    const body = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text.replace(/\s*[—–]\s*/g, ", ").trim() ?? "";
    const costUsd = (reply.usage.input_tokens * 2 + reply.usage.output_tokens * 10) / 1_000_000;
    return body.length > 20 ? { body, costUsd } : null;
  } catch (error) {
    console.error("[cortex] email draft failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function emailProposals(db: SupabaseClient): Promise<{ items: ProposedItem[]; costUsd: number; waitingElsewhere: number }> {
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
    .select("id, subject, category, agent_summary, suggested_draft, matched_profile_name, last_message_at")
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
  for (const thread of candidates) {
    const own = messages.filter((m) => m.thread_id === thread.id);
    if (!waitingOnUs(own)) continue;
    if (items.filter((item) => item.kind === "email_draft").length >= EMAIL_DRAFTS_PER_PASS) {
      waitingElsewhere += 1;
      continue;
    }
    const draft = await draftEmail(thread, own);
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
      target: { threadId: thread.id },
      summary: `Email ${who} re "${cleanSubject(thread.subject)}". ${clip(thread.agent_summary ?? "", 180)}`,
      body: draft.body,
    });
  }
  return { items, costUsd, waitingElsewhere };
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

export type InboxPass = { passId: string; items: StoredItem[]; waitingElsewhere: number; costUsd: number };

/** What this pass would propose, in digest order, without storing anything. */
export async function buildInboxProposals(db: SupabaseClient): Promise<{ proposed: ProposedItem[]; waitingElsewhere: number; costUsd: number }> {
  const [sms, email, voicemail] = await Promise.all([smsProposals(db), emailProposals(db), voicemailProposals(db)]);
  // Order: clear first, then ready to send, then the one question.
  const questions = sms.items.filter((item) => item.kind === "question").slice(0, 1);
  const proposed: ProposedItem[] = [
    ...email.items.filter((item) => item.kind === "triage_batch"),
    ...voicemail.items.filter((item) => item.kind === "triage_batch"),
    ...sms.items.filter((item) => item.kind === "triage_batch"),
    ...sms.items.filter((item) => item.kind === "sms_draft"),
    ...email.items.filter((item) => item.kind === "email_draft"),
    ...voicemail.items.filter((item) => item.kind === "question"),
    ...questions,
  ];
  const extraQuestions = sms.items.filter((item) => item.kind === "question").length - questions.length;
  return {
    proposed,
    waitingElsewhere: sms.waitingElsewhere + email.waitingElsewhere + Math.max(0, extraQuestions),
    costUsd: email.costUsd + voicemail.costUsd,
  };
}

/** Build the pass, store its items (older proposals expire), and return them. */
export async function runInboxPass(db: SupabaseClient, now = new Date()): Promise<InboxPass> {
  const { proposed, waitingElsewhere, costUsd } = await buildInboxProposals(db);
  const passId = now.toISOString().slice(0, 16);
  await db.from("cortex_inbox_items").update({ status: "expired", decided_at: now.toISOString() }).eq("status", "proposed");
  const rows = proposed.map((item, i) => ({ ...item, body: item.body ?? null, pass_id: passId, number: i + 1 }));
  const { data, error } = rows.length ? await db.from("cortex_inbox_items").insert(rows).select("*") : { data: [], error: null };
  if (error) throw new Error(`inbox items not stored: ${error.message}`);
  return {
    passId,
    items: ((data ?? []) as StoredItem[]).sort((a, b) => a.number - b.number),
    waitingElsewhere,
    costUsd,
  };
}

/** The Telegram message: numbered, short, one line per item, drafts quoted. */
export function renderDigest(pass: InboxPass): string {
  if (!pass.items.length) {
    return pass.waitingElsewhere
      ? `Inbox pass: nothing I can clear or draft right now. ${pass.waitingElsewhere} ${pass.waitingElsewhere === 1 ? "thread needs" : "threads need"} a person in /admin/inbox or support email.`
      : "Inbox pass: both inboxes are clear.";
  }
  const section = (title: string, kinds: InboxItemKind[], only: (item: StoredItem) => boolean = () => true) => {
    const rows = pass.items.filter((item) => kinds.includes(item.kind) && only(item));
    if (!rows.length) return "";
    return `*${title}*\n${rows.map((item) => `${item.number}. ${item.summary}${item.body ? `\n> ${item.body.replace(/\n+/g, "\n> ")}` : ""}${item.kind === "email_draft" ? "\n(Saved as a Gmail draft when you approve. You send it.)" : ""}`).join("\n\n")}`;
  };
  const parts = [
    section("Clear", ["triage_batch"]),
    section("Ready to send", ["sms_draft", "email_draft"]),
    section("Call back", ["question"], (item) => item.category === "email:voicemail_callbacks"),
    section("One question", ["question"], (item) => item.category !== "email:voicemail_callbacks"),
  ].filter(Boolean);
  const numbers = pass.items.filter((item) => item.kind !== "question").map((item) => item.number);
  const how = numbers.length
    ? `Reply "approve ${numbers.join(" ")}" for all of them, or "send ${numbers[0]}", "skip ${numbers[0]}", or "send ${numbers[numbers.length - 1]}: your edited text".`
    : "";
  const more = pass.waitingElsewhere ? ` ${pass.waitingElsewhere} more need a person in the inbox.` : "";
  return `${parts.join("\n\n")}\n\n${how}${more}`.trim();
}

// ---------------------------------------------------------------------------
// Approvals

export type InboxCommand = { verb: "approve" | "skip"; numbers: number[]; edit: string | null };

/** "approve 1 2", "send 3", "yes 1,2", "skip 4", "send 3: new text". Null when it is not a command. */
export function parseInboxCommand(text: string): InboxCommand | null {
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
  const finish = async (status: "done" | "failed" | "skipped", result: string) => {
    await db.from("cortex_inbox_items").update({ status, result, decided_at: new Date().toISOString(), edited: Boolean(edit), ...(edit ? { body: edit } : {}) }).eq("id", item.id).eq("status", "proposed");
    return `${item.number}: ${result}`;
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
      const result = await replyToSmsThread(db, { last10: String(item.target.last10), body: edit ?? item.body ?? "", actor: approver.actor, adminUserId: approver.id });
      if (result.status !== 200) return finish("failed", `not sent: ${String(result.json.error ?? result.status)}`);
      const scheduled = result.json.scheduled as { sendAfter?: string; tz?: string } | undefined;
      return finish("done", scheduled?.sendAfter ? `scheduled for their morning (quiet hours where they are).` : "sent.");
    }
    if (item.kind === "email_draft") {
      await saveSupportDraft(db, { threadId: String(item.target.threadId), body: edit ?? item.body ?? "", actor: approver.actor, adminUserId: approver.id });
      return finish("done", "saved as a Gmail draft on the thread. Send it from Gmail when you're ready.");
    }
    return finish("failed", "I don't know how to do that one.");
  } catch (error) {
    return finish("failed", `failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Run a command against the open items. Returns the reply for him. */
export async function handleInboxCommand(db: SupabaseClient, command: InboxCommand): Promise<string> {
  const open = (await openItems(db)).filter((item) => !(item as StoredItem & { decided_at?: string | null }).decided_at);
  if (!open.length) return "Nothing from the inbox is waiting on you right now.";
  const chosen = command.numbers.length ? open.filter((item) => command.numbers.includes(item.number)) : open.filter((item) => item.kind !== "question");
  const missing = command.numbers.filter((n) => !open.some((item) => item.number === n));
  const lines: string[] = [];
  for (const item of chosen) {
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
