import { lookup } from "dns/promises";
import { isIP } from "net";
import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { decryptGmailToken } from "@/lib/support-email/crypto.server";
import {
  gmailAccessToken,
  modifyGmailThread,
  sendGmailDraft,
} from "@/lib/support-email/gmail.server";
import { importGmailMessage, type SupportMailboxRow } from "@/lib/support-email/sync.server";
import { recordSupportAction, writeSupportDraft } from "@/lib/support-email/thread-actions.server";

interface Context { params: Promise<{ threadId: string }> }

async function authorize() {
  const user = await getAuthUser();
  if (!user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { user, admin };
}

async function loadThread(threadId: string) {
  const db = getServiceClient();
  const { data: thread, error } = await db
    .from("support_email_threads")
    .select("*, support_mailboxes(*)")
    .eq("id", threadId)
    .single();
  if (error || !thread) throw error ?? new Error("Thread not found");
  return { db, thread, mailbox: thread.support_mailboxes as SupportMailboxRow };
}

export async function GET(_request: NextRequest, context: Context) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  try {
    const { threadId } = await context.params;
    const { db, thread } = await loadThread(threadId);
    const [{ data: messages, error }, { data: actions }, { data: recommendations }] = await Promise.all([
      db.from("support_email_messages").select("id, gmail_message_id, rfc_message_id, direction, from_email, from_name, to_emails, cc_emails, reply_to, subject, snippet, body_text, gmail_label_ids, internal_date, has_attachments, attachments, list_unsubscribe, list_unsubscribe_post, auto_submitted, raw_headers").eq("thread_id", threadId).order("internal_date", { ascending: true }),
      db.from("support_email_actions").select("action, actor, details, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(50),
      db.from("support_email_recommendations").select("id, gmail_message_id, category, priority, summary, reason, confidence, suggested_action, suggested_owner, suggested_draft, risk_flags, model, feedback, feedback_note, feedback_by, feedback_at, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(20),
    ]);
    if (error) throw error;
    const { encrypted_refresh_token: _secret, ...safeMailbox } = thread.support_mailboxes as Record<string, unknown>;
    return NextResponse.json({
      thread: { ...thread, support_mailboxes: undefined, mailbox: safeMailbox },
      messages: messages ?? [],
      actions: actions ?? [],
      recommendations: recommendations ?? [],
    });
  } catch (err) {
    console.error("[support-email] detail failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load thread" }, { status: 500 });
  }
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const p = address.split(".").map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
  }
  return true;
}

async function verifiedUnsubscribeUrl(values: string[]): Promise<string> {
  const raw = values.find((value) => value.toLowerCase().startsWith("https://"));
  if (!raw) throw new Error("This sender did not provide a secure one-click unsubscribe URL.");
  const url = new URL(raw);
  if (url.username || url.password || url.port) throw new Error("The unsubscribe URL is not eligible for one-click use.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("The unsubscribe URL did not resolve to a public service.");
  }
  return url.toString();
}

async function recordAction(threadId: string, actor: string, adminId: string, action: string, details: Record<string, unknown> = {}) {
  await recordSupportAction(getServiceClient(), threadId, actor, adminId, action, details);
}

async function updateThread(
  db: ReturnType<typeof getServiceClient>,
  threadId: string,
  values: Record<string, unknown>,
) {
  const { error } = await db.from("support_email_threads").update(values).eq("id", threadId);
  if (error) throw error;
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const { threadId } = await context.params;
  try {
    const body = (await request.json()) as {
      action?: string;
      body?: string;
      until?: string;
      feedback?: "correct" | "incorrect";
      feedbackNote?: string;
    };
    const { db, thread, mailbox } = await loadThread(threadId);
    const actor = auth.admin.email;
    const now = new Date().toISOString();
    // mark_handled is deliberately NOT here: it has to clear UNREAD in Gmail,
    // so it runs below with an access token.
    const simpleStates: Record<string, Record<string, unknown>> = {
      needs_reply: { state: "needs_reply", handled_at: null, handled_by: null, snoozed_until: null },
      escalate: { state: "escalated", handled_at: null, handled_by: null, snoozed_until: null },
    };
    if (body.action && simpleStates[body.action]) {
      const { error } = await db.from("support_email_threads").update({ ...simpleStates[body.action], updated_at: now }).eq("id", threadId);
      if (error) throw error;
      await recordAction(threadId, actor, auth.admin.id, body.action);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "snooze") {
      const until = body.until ? new Date(body.until) : null;
      if (!until || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Choose a future snooze time" }, { status: 400 });
      }
      await updateThread(db, threadId, { state: "snoozed", snoozed_until: until.toISOString(), updated_at: now });
      await recordAction(threadId, actor, auth.admin.id, "snooze", { until: until.toISOString() });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "feedback") {
      if (!body.feedback) return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
      const { error } = await db.from("support_email_recommendations").update({
        feedback: body.feedback,
        feedback_note: body.feedbackNote?.slice(0, 2_000) ?? null,
        feedback_by: actor,
        feedback_at: now,
      }).eq("thread_id", threadId).eq("gmail_message_id", thread.analysis_message_id);
      if (error) throw error;
      await recordAction(threadId, actor, auth.admin.id, "recommendation_feedback", { feedback: body.feedback });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "mark_read" && !thread.unread) {
      return NextResponse.json({ ok: true });
    }
    if (!mailbox.encrypted_refresh_token) throw new Error("This mailbox is not connected to Gmail.");
    const accessToken = await gmailAccessToken(decryptGmailToken(mailbox.encrypted_refresh_token));
    if (body.action === "mark_read") {
      // Reading and handling are intentionally independent. Opening a thread
      // clears Gmail's shared UNREAD state without resolving the support work.
      await modifyGmailThread(accessToken, thread.gmail_thread_id, { removeLabelIds: ["UNREAD"] });
      await updateThread(db, threadId, {
        unread: false,
        gmail_label_ids: Array.isArray(thread.gmail_label_ids)
          ? thread.gmail_label_ids.filter((label: string) => label !== "UNREAD")
          : [],
        updated_at: now,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "mark_handled") {
      // Handled is a real decision, so it must also clear UNREAD in Gmail --
      // otherwise the operator sees a permanent unread dot and the two inboxes
      // disagree. The thread stays in the Gmail inbox; only archive removes it.
      await modifyGmailThread(accessToken, thread.gmail_thread_id, { removeLabelIds: ["UNREAD"] });
      await updateThread(db, threadId, {
        state: "handled",
        unread: false,
        handled_at: now,
        handled_by: actor,
        snoozed_until: null,
        updated_at: now,
      });
      await recordAction(threadId, actor, auth.admin.id, "mark_handled");
      return NextResponse.json({ ok: true });
    }
    if (body.action === "archive" || body.action === "mark_noise") {
      await modifyGmailThread(accessToken, thread.gmail_thread_id, { removeLabelIds: ["INBOX", "UNREAD"] });
      const state = body.action === "mark_noise" ? "noise" : "handled";
      await updateThread(db, threadId, { state, unread: false, handled_at: now, handled_by: actor, updated_at: now });
      await recordAction(threadId, actor, auth.admin.id, body.action);
      return NextResponse.json({ ok: true });
    }

    const { data: latestInbound, error: latestError } = await db
      .from("support_email_messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("direction", "in")
      .order("internal_date", { ascending: false })
      .limit(1)
      .single();
    if (latestError || !latestInbound) throw latestError ?? new Error("No inbound message to answer");

    if (body.action === "unsubscribe") {
      if (!latestInbound.list_unsubscribe_post) throw new Error("This message does not support safe one-click unsubscribe.");
      const url = await verifiedUnsubscribeUrl(latestInbound.list_unsubscribe ?? []);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`The sender rejected the unsubscribe request (HTTP ${res.status}).`);
      await modifyGmailThread(accessToken, thread.gmail_thread_id, { removeLabelIds: ["INBOX", "UNREAD"] });
      await updateThread(db, threadId, { state: "noise", unread: false, handled_at: now, handled_by: actor, updated_at: now });
      await recordAction(threadId, actor, auth.admin.id, "unsubscribe", { host: new URL(url).hostname });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "do_not_contact") {
      const email = String(latestInbound.from_email ?? "").toLowerCase();
      if (!email) throw new Error("The sender has no usable email address.");
      const { data: existingDnc } = await db.from("do_not_contact").select("id").eq("email", email).maybeSingle();
      const dncValues = {
        email,
        reason: "provider_request",
        note: `Added from support email: ${thread.subject}`,
        created_by: actor,
      };
      const { error } = existingDnc
        ? await db.from("do_not_contact").update(dncValues).eq("id", existingDnc.id)
        : await db.from("do_not_contact").insert(dncValues);
      if (error) throw error;
      await updateThread(db, threadId, { state: "handled", handled_at: now, handled_by: actor, updated_at: now });
      await recordAction(threadId, actor, auth.admin.id, "do_not_contact", { email });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "save_draft" || body.action === "send") {
      const draftBody = String(body.body ?? "").trim();
      if (!draftBody) return NextResponse.json({ error: "Reply cannot be empty" }, { status: 400 });
      if (draftBody.length > 20_000) return NextResponse.json({ error: "Reply is too long" }, { status: 400 });
      const { draft, to } = await writeSupportDraft({ db, accessToken, thread, mailbox, latestInbound, draftBody, actor, now });
      if (body.action === "save_draft") {
        await recordAction(threadId, actor, auth.admin.id, "save_draft");
        return NextResponse.json({ ok: true, draftId: draft.id });
      }
      const sent = await sendGmailDraft(accessToken, draft.id);
      // Pull Gmail's canonical sent copy immediately instead of waiting for the
      // next Pub/Sub tick, so the admin view cannot claim success with a stale thread.
      const reconciliationWarnings: string[] = [];
      try {
        if (sent.id) await importGmailMessage(db, mailbox, accessToken, sent.id);
      } catch (err) {
        console.error("[support-email] reply sent but immediate Gmail import failed:", err);
        reconciliationWarnings.push("the conversation could not refresh immediately");
      }
      const { error: stateError } = await db.from("support_email_threads").update({
        state: "handled",
        unread: false,
        handled_at: now,
        handled_by: actor,
        gmail_draft_id: null,
        draft_body: null,
        draft_updated_at: null,
        updated_at: now,
      }).eq("id", threadId);
      if (stateError) {
        console.error("[support-email] reply sent but local thread state failed to update:", stateError);
        reconciliationWarnings.push("the local inbox state could not be updated");
      }
      await recordAction(threadId, actor, auth.admin.id, "send", { gmailMessageId: sent.id, to });
      return NextResponse.json({
        ok: true,
        gmailMessageId: sent.id,
        warning: reconciliationWarnings.length
          ? `Reply was sent. Gmail is authoritative, but ${reconciliationWarnings.join(" and ")}; Sync now will reconcile it.`
          : undefined,
      });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[support-email] action failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Action failed" }, { status: 500 });
  }
}
