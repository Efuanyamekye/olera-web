/**
 * Olera writing into a family–provider conversation.
 *
 * A connection's conversation lives in metadata.thread, and 45 files read that
 * array, including the inquiry crons that decide who has replied and who gets
 * nudged. A third author there would be read as one of the two parties. So
 * Olera's messages live beside it in metadata.olera_messages, which nothing
 * but the inbox display, the family case page and this module reads. Adding
 * one cannot change any count, flag or reminder the crons compute.
 *
 * Both parties are emailed, because email is how we reach providers (their
 * numbers are business landlines) and families read it too. The email says who
 * else can see the conversation.
 */

import { getServiceClient } from "@/lib/admin";
import { sendEmail, reserveEmailLogId, appendTrackingParams } from "@/lib/email";
import { oleraMessageEmail } from "@/lib/email-templates";
import { generateFamilyInboxUrl } from "@/lib/claim-tokens";

export interface OleraMessage {
  id: string;
  text: string;
  created_at: string;
  /** The team member who wrote it, first name only ("Ces"). */
  author_name: string | null;
}

type Db = ReturnType<typeof getServiceClient>;

/**
 * True when the provider has declined the conversation, however it was
 * recorded: status "declined", the inbox's decline line in the thread, or an
 * archive by the provider.
 */
export function providerDeclined(conn: {
  type?: string | null;
  status?: string | null;
  from_profile_id?: string | null;
  to_profile_id?: string | null;
  metadata?: unknown;
}): boolean {
  if (conn.status === "declined") return true;
  const meta = (conn.metadata ?? {}) as Record<string, unknown>;
  const thread = Array.isArray(meta.thread) ? (meta.thread as { type?: string; text?: string }[]) : [];
  if (thread.some((m) => m.type === "system" && /declined this inquiry|passed on this inquiry/.test(m.text ?? ""))) return true;
  const providerId = conn.type === "request" ? conn.from_profile_id : conn.to_profile_id;
  return meta.archived === true && !!providerId && meta.archived_by === providerId;
}

type Party = {
  id: string;
  type: string | null;
  display_name: string | null;
  email: string | null;
  account_id: string | null;
  slug: string | null;
  source_provider_id: string | null;
};

const PARTY_COLS = "id, type, display_name, email, account_id, slug, source_provider_id";

/** The email to write to, and the one a sign-in link must be issued for. */
async function resolveEmails(db: Db, p: Party): Promise<{ to: string | null; auth: string | null }> {
  let to = p.email?.trim() || null;
  let auth = to;
  if (p.account_id) {
    const { data: acct } = await db.from("accounts").select("user_id").eq("id", p.account_id).maybeSingle();
    if (acct?.user_id) {
      const { data } = await db.auth.admin.getUserById(acct.user_id as string);
      if (data?.user?.email) {
        auth = data.user.email;
        if (!to) to = auth;
      }
    }
  }
  return { to, auth };
}

function viewPath(p: Party, isFamily: boolean, connectionId: string): string {
  if (isFamily) return `/portal/inbox?id=${connectionId}`;
  if (p.account_id) return `/portal/inbox?role=provider&id=${connectionId}`;
  // An unclaimed provider claims the listing first, the same route the
  // provider new-message email uses.
  const slug = p.slug || p.source_provider_id || p.id;
  return `/provider/${slug}/onboard?action=message&actionId=${connectionId}`;
}

export async function postOleraMessage(
  db: Db,
  connectionId: string,
  text: string,
  authorName: string | null,
): Promise<{ ok: true; message: OleraMessage; emailed: string[] } | { ok: false; error: string; status: number }> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Write a message first", status: 400 };
  if (body.length > 4000) return { ok: false, error: "That message is too long", status: 400 };

  const { data: conn, error } = await db
    .from("connections")
    .select("id, type, status, from_profile_id, to_profile_id, metadata")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!conn) return { ok: false, error: "Conversation not found", status: 404 };
  // The same rule the family and provider write under (connections/message):
  // a declined or archived conversation is closed, and writing in it would
  // email a provider who already said no.
  if (!["pending", "accepted"].includes(String(conn.status))) {
    return { ok: false, error: "This conversation is closed, so nothing was sent.", status: 409 };
  }
  // In practice a provider declines from the inbox by archiving with a reason,
  // which leaves status "pending" and writes a system line into the thread.
  // All 1,486 inquiries are "pending", three of them declined this way.
  if (providerDeclined(conn)) {
    return { ok: false, error: "The provider declined this conversation, so nothing was sent.", status: 409 };
  }

  const meta = (conn.metadata ?? {}) as Record<string, unknown>;
  const message: OleraMessage = {
    id: crypto.randomUUID(),
    text: body,
    created_at: new Date().toISOString(),
    author_name: authorName,
  };
  const existing = Array.isArray(meta.olera_messages) ? (meta.olera_messages as OleraMessage[]) : [];
  const { error: upErr } = await db
    .from("connections")
    .update({ metadata: { ...meta, olera_messages: [...existing, message] } })
    .eq("id", connectionId);
  if (upErr) throw upErr;

  // Who is who. An inquiry runs family → provider; a provider-started request
  // runs the other way.
  const { data: parties } = await db
    .from("business_profiles")
    .select(PARTY_COLS)
    .in("id", [conn.from_profile_id, conn.to_profile_id].filter(Boolean) as string[]);
  const byId = new Map(((parties ?? []) as Party[]).map((p) => [p.id, p]));
  const a = byId.get(conn.from_profile_id as string);
  const b = byId.get(conn.to_profile_id as string);
  const family = a?.type === "family" ? a : b?.type === "family" ? b : conn.type === "inquiry" ? a : b;
  const provider = family === a ? b : a;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  const emailed: string[] = [];

  for (const [who, other, isFamily] of [
    [family, provider, true],
    [provider, family, false],
  ] as const) {
    if (!who) continue;
    try {
      const { to, auth } = await resolveEmails(db, who);
      if (!to || !auth) continue;
      const subject = isFamily ? "Olera sent you a message" : "Olera sent you a message about a family";
      const logId = await reserveEmailLogId({
        to,
        subject,
        emailType: "olera_message",
        recipientType: isFamily ? "family" : "provider",
        providerId: isFamily ? undefined : who.id,
      });
      const viewUrl = generateFamilyInboxUrl(auth, appendTrackingParams(viewPath(who, isFamily, connectionId), logId), siteUrl);
      const res = await sendEmail({
        to,
        subject,
        html: oleraMessageEmail({
          recipientName: who.display_name ?? "",
          otherPartyName: other?.display_name ?? "",
          recipient: isFamily ? "family" : "provider",
          messagePreview: preview,
          viewUrl,
        }),
        emailType: "olera_message",
        recipientType: isFamily ? "family" : "provider",
        providerId: isFamily ? undefined : who.id,
        // A person wrote this, so a reply by email reaches people: support@,
        // which the family timeline and the inbox pass already read. The
        // default sender is noreply@.
        replyTo: "support@olera.care",
        emailLogId: logId ?? undefined,
        recipientProfileId: who.id,
        metadata: { connection_id: connectionId, olera_message_id: message.id },
      });
      if (res.success && !res.skipped) emailed.push(isFamily ? "family" : "provider");
    } catch (e) {
      // The message is saved and visible either way; a failed notice is logged.
      console.error("[olera-message] notice failed", { connectionId, to: isFamily ? "family" : "provider" }, e);
    }
  }

  return { ok: true, message, emailed };
}
