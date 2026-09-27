import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditAction } from "@/lib/admin";
import { decryptGmailToken } from "@/lib/support-email/crypto.server";
import {
  GMAIL_BATCH_MODIFY_LIMIT,
  batchModifyGmailMessages,
  buildReplyRaw,
  createGmailDraft,
  gmailAccessToken,
  updateGmailDraft,
} from "@/lib/support-email/gmail.server";
import type { SupportMailboxRow } from "@/lib/support-email/sync.server";

/**
 * Support-thread actions shared by /api/admin/support-email/[threadId] and
 * Cortex. Moved out of the route unchanged, so a draft Cortex saves after the
 * founder's approval is the same Gmail draft his "Save draft" makes: a reply
 * in the thread, from the support address, recorded in support_email_actions
 * and the audit log. Cortex saves drafts only; a person sends, as today.
 */

type ThreadRow = { id: string; subject: string; gmail_thread_id: string; gmail_draft_id: string | null };
type InboundRow = { reply_to?: string | null; from_email?: string | null; rfc_message_id?: string | null; raw_headers?: { references?: string } | null };

/** One row in support_email_actions and one in the audit log, as every thread action writes. */
export async function recordSupportAction(
  db: SupabaseClient,
  threadId: string,
  actor: string,
  adminId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const [actionResult] = await Promise.all([
    db.from("support_email_actions").insert({ thread_id: threadId, actor, action, details }),
    logAuditAction({ adminUserId: adminId, action: `support_email_${action}`, targetType: "support_email_thread", targetId: threadId, details }),
  ]);
  if (actionResult.error) {
    console.error(`[support-email] failed to record ${action} for ${threadId}:`, actionResult.error);
  }
}

/** Create or update the Gmail draft reply on a thread, and store it on the row. */
export async function writeSupportDraft(args: {
  db: SupabaseClient;
  accessToken: string;
  thread: ThreadRow;
  mailbox: SupportMailboxRow;
  latestInbound: InboundRow;
  draftBody: string;
  actor: string;
  now: string;
}) {
  const { db, accessToken, thread, mailbox, latestInbound, draftBody, actor, now } = args;
  const to = String(latestInbound.reply_to || latestInbound.from_email || "");
  if (!to) throw new Error("The sender has no reply address.");
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const references = [latestInbound.raw_headers?.references, latestInbound.rfc_message_id].filter(Boolean).join(" ");
  const raw = buildReplyRaw({
    mailboxEmail: process.env.GMAIL_SUPPORT_FROM_ADDRESS || mailbox.email,
    to,
    subject,
    body: draftBody,
    inReplyTo: latestInbound.rfc_message_id,
    references,
  });
  let draft;
  if (thread.gmail_draft_id) {
    try {
      draft = await updateGmailDraft(accessToken, thread.gmail_draft_id, raw, thread.gmail_thread_id);
    } catch {
      draft = await createGmailDraft(accessToken, raw, thread.gmail_thread_id);
    }
  } else {
    draft = await createGmailDraft(accessToken, raw, thread.gmail_thread_id);
  }
  const { error: draftError } = await db.from("support_email_threads").update({
    gmail_draft_id: draft.id,
    draft_body: draftBody,
    draft_updated_at: now,
    draft_updated_by: actor,
    updated_at: now,
  }).eq("id", thread.id);
  if (draftError) throw draftError;
  return { draft, to };
}

/**
 * Save a Gmail draft on a thread, loading everything the route would have in
 * hand. The same checks as the route: non-empty, under 20k, a reply address.
 */
export async function saveSupportDraft(
  db: SupabaseClient,
  args: { threadId: string; body: string; actor: string; adminUserId: string },
): Promise<{ draftId: string }> {
  const draftBody = args.body.trim();
  if (!draftBody) throw new Error("Reply cannot be empty");
  if (draftBody.length > 20_000) throw new Error("Reply is too long");
  const { data: thread, error } = await db
    .from("support_email_threads")
    .select("*, support_mailboxes(*)")
    .eq("id", args.threadId)
    .single();
  if (error || !thread) throw error ?? new Error("Thread not found");
  const mailbox = thread.support_mailboxes as SupportMailboxRow;
  if (!mailbox.encrypted_refresh_token) throw new Error("This mailbox is not connected to Gmail.");
  const accessToken = await gmailAccessToken(decryptGmailToken(mailbox.encrypted_refresh_token));
  const { data: latestInbound, error: latestError } = await db
    .from("support_email_messages")
    .select("*")
    .eq("thread_id", args.threadId)
    .eq("direction", "in")
    .order("internal_date", { ascending: false })
    .limit(1)
    .single();
  if (latestError || !latestInbound) throw latestError ?? new Error("No inbound message to answer");
  const { draft } = await writeSupportDraft({
    db, accessToken, thread, mailbox, latestInbound, draftBody, actor: args.actor, now: new Date().toISOString(),
  });
  await recordSupportAction(db, args.threadId, args.actor, args.adminUserId, "save_draft");
  return { draftId: draft.id };
}

/**
 * Archive named threads the way the noise sweep does: Gmail first (INBOX and
 * UNREAD removed, everything stays in All Mail), then the rows marked handled,
 * one support_email_actions row each and one audit row. For the voicemail
 * sweep, where the cohort is a list the founder approved, not a category.
 * Only threads still waiting (needs_reply or escalated) are touched.
 */
export async function archiveSupportThreads(
  db: SupabaseClient,
  args: { threadIds: string[]; actor: string; adminUserId: string; action: string; details?: Record<string, unknown> },
): Promise<{ archived: number }> {
  const chunk = <T,>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, i * size + size));
  const threads: Array<{ id: string; gmail_label_ids: string[] | null }> = [];
  for (const ids of chunk(args.threadIds, 200)) {
    const { data, error } = await db.from("support_email_threads")
      .select("id, gmail_label_ids")
      .in("id", ids)
      .in("state", ["needs_reply", "escalated"]);
    if (error) throw error;
    threads.push(...((data ?? []) as typeof threads));
  }
  if (!threads.length) return { archived: 0 };

  const messageIds: string[] = [];
  for (const ids of chunk(threads.map((t) => t.id), 200)) {
    const { data, error } = await db.from("support_email_messages").select("gmail_message_id").in("thread_id", ids);
    if (error) throw error;
    messageIds.push(...(data ?? []).map((m) => String((m as { gmail_message_id: string }).gmail_message_id)));
  }
  const { data: mailboxes, error: mailboxError } = await db
    .from("support_mailboxes").select("*").not("encrypted_refresh_token", "is", null).limit(1);
  if (mailboxError) throw mailboxError;
  const mailbox = (mailboxes ?? [])[0] as SupportMailboxRow | undefined;
  if (!mailbox?.encrypted_refresh_token) throw new Error("No connected Gmail mailbox.");
  const accessToken = await gmailAccessToken(decryptGmailToken(mailbox.encrypted_refresh_token));
  // Gmail is the source of truth, so it moves first.
  for (const ids of chunk(messageIds, GMAIL_BATCH_MODIFY_LIMIT)) {
    await batchModifyGmailMessages(accessToken, ids, { removeLabelIds: ["INBOX", "UNREAD"] });
  }

  const now = new Date().toISOString();
  // Grouped by the label set left after the archive, as the noise sweep does:
  // one update per group instead of one per thread. 411 single-row updates
  // inside a Telegram approval would eat most of its time limit.
  const byLabels = new Map<string, { labels: string[]; ids: string[] }>();
  for (const thread of threads) {
    const labels = (thread.gmail_label_ids ?? []).filter((label) => label !== "INBOX" && label !== "UNREAD");
    const key = JSON.stringify(labels);
    const group = byLabels.get(key);
    if (group) group.ids.push(thread.id);
    else byLabels.set(key, { labels, ids: [thread.id] });
  }
  for (const { labels, ids: groupIds } of byLabels.values()) {
    for (const ids of chunk(groupIds, 200)) {
      const { error } = await db.from("support_email_threads").update({
        state: "handled", unread: false, gmail_label_ids: labels,
        handled_at: now, handled_by: args.actor, snoozed_until: null, updated_at: now,
      }).in("id", ids);
      if (error) throw error;
    }
  }
  for (const ids of chunk(threads.map((t) => t.id), 500)) {
    const { error } = await db.from("support_email_actions").insert(
      ids.map((threadId) => ({ thread_id: threadId, actor: args.actor, action: args.action, details: args.details ?? {} })),
    );
    if (error) console.error(`[support-email] ${args.action} action insert failed:`, error);
  }
  await logAuditAction({
    adminUserId: args.adminUserId,
    action: `support_email_${args.action}`,
    targetType: "support_email_thread",
    targetId: `${args.action}:${threads.length}`,
    details: { processed: threads.length, gmailMessages: messageIds.length, ...(args.details ?? {}) },
  });
  return { archived: threads.length };
}
