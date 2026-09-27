import type { SupabaseClient } from "@supabase/supabase-js";
import { logAuditAction } from "@/lib/admin";
import { decryptGmailToken } from "@/lib/support-email/crypto.server";
import {
  GMAIL_BATCH_MODIFY_LIMIT,
  batchModifyGmailMessages,
  gmailAccessToken,
} from "@/lib/support-email/gmail.server";
import type { SupportMailboxRow } from "@/lib/support-email/sync.server";

/*
 * The noise sweep, shared by /api/admin/support-email/bulk-noise and Cortex.
 * Moved out of the route unchanged: dry run without `confirm`, and a confirmed
 * run only when `confirm` equals the current cohort size. The route's notes
 * follow.
 */
/**
 * Archive the categories that are noise by definition.
 *
 * The earlier sweep gated on classifier confidence (>= 0.95) and single-message
 * threads. That was right when the question was "is this cold solicitation?",
 * because a wrong answer buried a real person. It is the wrong gate for whole
 * categories that nobody reads either way: a cold pitch from an industrial
 * equipment manufacturer does not become worth reading because the model was
 * only 0.92 sure, or because the sender followed up twice.
 *
 * So this sweeps by category and leans on three guards that actually matter,
 * rather than on a confidence score that does not.
 */

// Nobody reads these, whatever the confidence. Note what is absent:
// care_seeker, provider, legal, billing and voicemail are all real work.
const NOISE_CATEGORIES = ["marketing", "automated", "security", "partner", "internal"];

// A person telling Olera to stop must never be archived unread -- the reply is
// both the opt-out record and the trigger for a do_not_contact write. Bare
// "unsubscribe"/"opt out" are deliberately not matched: that boilerplate is in
// every legitimate marketing footer and would hold back the whole cohort.
const OPT_OUT_PATTERNS: RegExp[] = [
  /^\s*(?:>+\s*)?done\b/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\bstop emailing\b/i,
  /\bstop contacting\b/i,
  /\bunsubscribe me\b/i,
  /\bleave me alone\b/i,
  /\bdo ?n[o']?t (?:contact|email|call) me\b/i,
  /\bi (?:did ?n[o']?t|never) (?:sign ?up|signed ?up)\b/i,
  /\bdid ?n[o']?t authorize\b/i,
  /\b(?:i am|we are|this is) not a (?:group home|nursing home|care home|facility|provider)\b/i,
];

const VOICEMAIL_SUBJECTS = /voicemail|voice message|missed call/i;
const SUPABASE_IN_CHUNK = 200;
const MAX_THREADS_PER_RUN = 2_000;

function looksLikeOptOut(body: string): boolean {
  return OPT_OUT_PATTERNS.some((p) => p.test(body));
}

async function chunked<T, R>(values: T[], size: number, fn: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < values.length; i += size) out.push(...(await fn(values.slice(i, i + size))));
  return out;
}

export async function runNoiseSweep(
  db: SupabaseClient,
  args: { actor: string; adminUserId: string; confirm: string | null },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const { actor, adminUserId, confirm } = args;


  try {
    const candidates: Array<{
      id: string; subject: string; category: string;
      gmail_label_ids: string[] | null;
    }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from("support_email_threads")
        .select("id, subject, category, gmail_label_ids")
        .in("state", ["needs_reply", "escalated"])
        .in("category", NOISE_CATEGORIES)
        // Real families and real providers are never in scope.
        .is("matched_profile_id", null)
        .is("matched_provider_id", null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data?.length) break;
      candidates.push(...(data as typeof candidates));
      if (data.length < 1000) break;
    }

    // A misfiled voicemail is a real inbound phone call, whatever the category.
    const notVoicemail = candidates.filter((t) => !VOICEMAIL_SUBJECTS.test(t.subject));

    // Opt-outs are found in the body, so this has to run before the dry run
    // reports a count -- otherwise the confirm token would not match what
    // execution processes.
    const optOutThreadIds = new Set<string>();
    const heldForOptOut: Array<{ subject: string; category: string }> = [];
    await chunked(notVoicemail.map((t) => t.id), SUPABASE_IN_CHUNK, async (chunk) => {
      const { data, error } = await db
        .from("support_email_messages")
        .select("thread_id, body_text")
        .in("thread_id", chunk)
        .eq("direction", "in");
      if (error) throw error;
      for (const m of data ?? []) {
        if (looksLikeOptOut(String(m.body_text ?? "").slice(0, 4_000))) {
          optOutThreadIds.add(String(m.thread_id));
        }
      }
      return [];
    });
    for (const t of notVoicemail) {
      if (optOutThreadIds.has(t.id)) heldForOptOut.push({ subject: t.subject, category: t.category });
    }

    const eligible = notVoicemail.filter((t) => !optOutThreadIds.has(t.id)).slice(0, MAX_THREADS_PER_RUN);
    const total = eligible.length;
    const byCategory: Record<string, number> = {};
    for (const t of eligible) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;

    if (!confirm) {
      return { status: 200, json: {
        dryRun: true,
        action: "mark handled + remove INBOX/UNREAD in Gmail",
        categories: NOISE_CATEGORIES,
        neverInScope: ["care_seeker", "provider", "legal", "billing", "voicemail"],
        matching: total,
        byCategory,
        excludedVoicemailSubjects: candidates.length - notVoicemail.length,
        heldForOptOut,
        heldCount: heldForOptOut.length,
        confirmUrl: `/api/admin/support-email/bulk-noise?confirm=${total}`,
        sample: eligible.slice(0, 15).map((t) => ({ subject: t.subject, category: t.category })),
      } };
    }

    if (Number(confirm) !== total) {
      return { status: 409, json: {
        error: "Confirmation count does not match the current cohort. Re-run the dry run and use the fresh number.",
        expected: total, received: Number(confirm),
      } };
    }
    if (!total) return { status: 200, json: { ok: true, processed: 0, note: "Nothing to archive." } };

    const threadIds = eligible.map((t) => t.id);
    const gmailMessageIds = await chunked(threadIds, SUPABASE_IN_CHUNK, async (chunk) => {
      const { data, error } = await db
        .from("support_email_messages").select("gmail_message_id").in("thread_id", chunk);
      if (error) throw error;
      return (data ?? []).map((m) => String(m.gmail_message_id));
    });

    const { data: mailboxes, error: mailboxError } = await db
      .from("support_mailboxes").select("*").not("encrypted_refresh_token", "is", null).limit(1);
    if (mailboxError) throw mailboxError;
    const mailbox = (mailboxes ?? [])[0] as SupportMailboxRow | undefined;
    if (!mailbox?.encrypted_refresh_token) throw new Error("No connected Gmail mailbox.");
    const accessToken = await gmailAccessToken(decryptGmailToken(mailbox.encrypted_refresh_token));

    // Gmail is the source of truth, so it moves first.
    await chunked(gmailMessageIds, GMAIL_BATCH_MODIFY_LIMIT, async (chunk) => {
      await batchModifyGmailMessages(accessToken, chunk, { removeLabelIds: ["INBOX", "UNREAD"] });
      return [];
    });

    const now = new Date().toISOString();
    // Mirror the label change locally, grouped by label set, so the archive
    // endpoint does not re-offer these.
    const byLabelSet = new Map<string, { labels: string[]; ids: string[] }>();
    for (const t of eligible) {
      const stripped = (t.gmail_label_ids ?? []).filter((l) => l !== "INBOX" && l !== "UNREAD");
      const key = JSON.stringify(stripped);
      const group = byLabelSet.get(key);
      if (group) group.ids.push(t.id);
      else byLabelSet.set(key, { labels: stripped, ids: [t.id] });
    }
    for (const { labels, ids } of byLabelSet.values()) {
      await chunked(ids, SUPABASE_IN_CHUNK, async (chunk) => {
        const { error } = await db.from("support_email_threads").update({
          state: "handled", unread: false, gmail_label_ids: labels,
          handled_at: now, handled_by: actor, snoozed_until: null, updated_at: now,
        }).in("id", chunk);
        if (error) throw error;
        return [];
      });
    }

    await chunked(threadIds, 500, async (chunk) => {
      const { error } = await db.from("support_email_actions").insert(
        chunk.map((threadId) => ({
          thread_id: threadId, actor, action: "bulk_noise_archive",
          details: { categories: NOISE_CATEGORIES },
        })),
      );
      if (error) console.error("[support-email] noise archive audit insert failed:", error);
      return [];
    });
    await logAuditAction({
      adminUserId,
      action: "support_email_bulk_noise_archive",
      targetType: "support_email_thread",
      targetId: `noise:${threadIds.length}`,
      details: { byCategory, processed: threadIds.length, gmailMessages: gmailMessageIds.length, heldForOptOut: heldForOptOut.length },
    });

    return { status: 200, json: {
      ok: true,
      processed: threadIds.length,
      gmailMessagesModified: gmailMessageIds.length,
      byCategory,
      heldForOptOut: heldForOptOut.length,
      note: "Archived. Nothing deleted; all of it stays in All Mail, and marking one unread in Gmail returns it to Needs attention.",
    } };
  } catch (err) {
    console.error("[support-email] noise archive failed:", err);
    return { status: 500, json: { error: err instanceof Error ? err.message : "Noise archive failed" } };
  }
}
