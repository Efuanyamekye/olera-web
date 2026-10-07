import "server-only";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export function gmailOAuthRedirectUri(origin: string): string {
  return process.env.GMAIL_OAUTH_REDIRECT_URI || `${origin}/api/admin/support-email/oauth/callback`;
}

export class GmailApiError extends Error {
  readonly reasons: string[];
  constructor(message: string, public status: number, public body: string, public retryAfterMs = 0) {
    const reasons = gmailErrorReasons(body);
    super(`${message} (HTTP ${status}${reasons.length ? `: ${reasons.join(", ")}` : ""})`);
    this.name = "GmailApiError";
    this.reasons = reasons;
    this.retryAfterMs = Math.max(retryAfterMs, quotaWindowDelay(body));
  }
}

function quotaWindowDelay(body: string): number {
  try {
    const details = JSON.parse(body).error?.details;
    if (!Array.isArray(details)) return 0;
    for (const detail of details) {
      const metadata = detail.metadata;
      if (detail.reason !== "RATE_LIMIT_EXCEEDED" ||
        metadata?.service !== "gmail.googleapis.com" ||
        metadata.quota_unit !== "1/min/{project}/{user}") continue;
      const start = Number(metadata.window_start_time) * 1_000;
      if (Number.isFinite(start) && start <= Date.now() && Date.now() - start < 60_000) {
        return start + 61_000 - Date.now();
      }
    }
  } catch { /* Not every Gmail error includes quota window metadata. */ }
  return 0;
}

// The current Gmail per-user quota is 6,000 units/minute, with message
// reads costing 20 units. Reserve slots before concurrent callers await them
// so a ten-message import batch cannot burst past the mailbox limit. Leave
// 25% headroom for other instances/admin activity; server backoff still wins.
const gmailReadSlots = new Map<string, { nextAt: number; cooldownUntil: number }>();
function gmailReadCost(path: string): number {
  if (path.startsWith("/history?")) return 2;
  if (path === "/profile") return 1;
  if (path.startsWith("/messages?")) return 5;
  if (path.startsWith("/threads/")) return 40;
  return 20; // Message, attachment, and draft reads.
}

async function paceGmailRead(accessToken: string, path: string, deadline: number): Promise<void> {
  const now = Date.now();
  for (const [token, slot] of gmailReadSlots) {
    if (slot.nextAt < now - 60_000 && slot.cooldownUntil < now) gmailReadSlots.delete(token);
  }
  const slot = gmailReadSlots.get(accessToken) ?? { nextAt: now, cooldownUntil: 0 };
  gmailReadSlots.set(accessToken, slot);
  const at = Math.max(now, slot.nextAt, slot.cooldownUntil);
  if (at >= deadline) throw new Error("Gmail read quota wait exceeded request budget");
  slot.nextAt = at + Math.ceil(gmailReadCost(path) * 60_000 / 4_500);
  if (at > now) await new Promise(resolve => setTimeout(resolve, at - now));
  // Another in-flight read may discover a server cooldown while this one
  // was queued. Honor it before issuing the request.
  if (slot.cooldownUntil > Date.now()) {
    if (slot.cooldownUntil >= deadline) throw new Error("Gmail read quota wait exceeded request budget");
    await new Promise(resolve => setTimeout(resolve, slot.cooldownUntil - Date.now()));
  }
}

function gmailErrorReasons(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    const candidates: unknown[] = typeof parsed.error === "string"
      ? [parsed.error]
      : (parsed.error?.errors ?? []).map((error: { reason?: unknown }) => error.reason);
    // Persist machine-readable codes, never an arbitrary response body that
    // could echo message contents or authentication details.
    return [...new Set(candidates.filter((reason): reason is string =>
      typeof reason === "string" && /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(reason)))];
  } catch { return []; }
}

function retryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function canRetryGmailRead(error: GmailApiError): boolean {
  return [429, 500, 502, 503, 504].includes(error.status) ||
    (error.status === 403 && error.reasons.some(reason =>
      ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason)));
}

interface GmailHeader { name: string; value: string }
interface GmailPartBody { data?: string; attachmentId?: string; size?: number }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailPartBody;
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export interface NormalizedGmailMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  rfcMessageId: string | null;
  direction: "in" | "out";
  fromEmail: string | null;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  replyTo: string | null;
  subject: string;
  snippet: string;
  bodyText: string;
  labelIds: string[];
  rawHeaders: Record<string, string>;
  internalDate: string;
  attachments: Array<{ attachmentId: string | null; filename: string; mimeType: string; size: number }>;
  listUnsubscribe: string[];
  listUnsubscribePost: boolean;
  autoSubmitted: string | null;
}

let tokenCache: { refreshToken: string; accessToken: string; expiresAt: number } | null = null;

export function gmailOAuthUrl(opts: { redirectUri: string; state: string }): string {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_GMAIL_CLIENT_ID is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", opts.state);
  return url.toString();
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Gmail OAuth client is not configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (!res.ok) throw new GmailApiError("Google OAuth code exchange failed", res.status, body);
  return JSON.parse(body) as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export async function gmailAccessToken(refreshToken: string): Promise<string> {
  if (tokenCache?.refreshToken === refreshToken && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Gmail OAuth client is not configured");
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (!res.ok) throw new GmailApiError("Google OAuth refresh failed", res.status, body);
  const parsed = JSON.parse(body) as { access_token: string; expires_in?: number };
  tokenCache = {
    refreshToken,
    accessToken: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000,
  };
  return parsed.access_token;
}

async function gmailRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 4 : 1;
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let delay = 1_000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1_000);
    if (method === "GET") await paceGmailRead(accessToken, path, deadline);
    try {
      const res = await fetch(`${GMAIL_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(Math.min(30_000, Math.max(1, deadline - Date.now()))),
      });
      const body = await res.text();
      if (res.ok) return (body ? JSON.parse(body) : {}) as T;
      const error = new GmailApiError(`Gmail API ${path} failed`, res.status, body, retryAfterMs(res.headers.get("Retry-After")));
      if (!canRetryGmailRead(error) || attempt === maxAttempts) throw error;
      lastError = error;
      delay = Math.max(delay, error.retryAfterMs);
      if (method === "GET" && (error.status === 403 || error.status === 429)) {
        const slot = gmailReadSlots.get(accessToken)!;
        slot.cooldownUntil = Math.max(slot.cooldownUntil, Date.now() + delay);
      }
    } catch (error) {
      if (error instanceof GmailApiError) throw error;
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    // Leave a long server-requested cooldown to a later worker invocation;
    // never shorten it to fit this request's bounded retry window.
    if (Date.now() + delay >= deadline) throw lastError;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw lastError;
}

export function getGmailProfile(accessToken: string) {
  return gmailRequest<{ emailAddress: string; messagesTotal: number; threadsTotal: number; historyId: string }>(
    accessToken,
    "/profile",
  );
}

export function watchGmail(accessToken: string, topicName: string) {
  return gmailRequest<{ historyId: string; expiration: string }>(accessToken, "/watch", {
    method: "POST",
    body: JSON.stringify({ topicName }),
  });
}

export function listGmailMessages(accessToken: string, pageToken?: string | null, maxResults = 100, query?: string) {
  const params = new URLSearchParams({ maxResults: String(maxResults), includeSpamTrash: "true" });
  if (pageToken) params.set("pageToken", pageToken);
  if (query) params.set("q", query);
  return gmailRequest<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(accessToken, `/messages?${params}`);
}

/** Read sync metadata only: no subjects, participants, headers, or bodies. */
export function getGmailMessageSyncMetadata(accessToken: string, messageId: string) {
  return gmailRequest<Pick<GmailMessage, "id" | "threadId" | "internalDate" | "labelIds">>(accessToken,
    `/messages/${encodeURIComponent(messageId)}?format=metadata&fields=id,threadId,internalDate,labelIds`);
}

export function getGmailMessage(accessToken: string, messageId: string) {
  return gmailRequest<GmailMessage>(accessToken, `/messages/${encodeURIComponent(messageId)}?format=full`);
}

export function getGmailMessageMetadata(accessToken: string, messageId: string) {
  const params = new URLSearchParams({ format: "metadata", metadataHeaders: "From" });
  for (const header of [
    "To", "Cc", "Reply-To", "Subject", "Message-ID", "List-Unsubscribe",
    "List-Unsubscribe-Post", "Auto-Submitted",
  ]) params.append("metadataHeaders", header);
  return gmailRequest<GmailMessage>(accessToken, `/messages/${encodeURIComponent(messageId)}?${params}`);
}

export function getGmailAttachment(accessToken: string, messageId: string, attachmentId: string) {
  return gmailRequest<{ data: string; size?: number }>(
    accessToken,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
}

export function listGmailHistory(accessToken: string, startHistoryId: string, pageToken?: string | null, maxResults = 50) {
  // Do not filter to messageAdded. A Gmail-side archive/read/spam action is a
  // label change, and Olera must see it or the two inboxes drift apart.
  const params = new URLSearchParams({ startHistoryId, maxResults: String(maxResults) });
  if (pageToken) params.set("pageToken", pageToken);
  return gmailRequest<{
    history?: Array<{
      id: string;
      messages?: Array<{ id: string; threadId: string }>;
      messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
      messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
      labelsAdded?: Array<{ message: { id: string; threadId: string }; labelIds?: string[] }>;
      labelsRemoved?: Array<{ message: { id: string; threadId: string }; labelIds?: string[] }>;
    }>;
    nextPageToken?: string;
    historyId: string;
  }>(accessToken, `/history?${params}`);
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
}

// labels.list returns identity only. Per-label counts require labels.get, which
// is 1 quota unit each -- trivial for a mailbox with a few dozen labels.
export function listGmailLabels(accessToken: string) {
  return gmailRequest<{ labels?: GmailLabel[] }>(accessToken, "/labels");
}

export function getGmailLabel(accessToken: string, labelId: string) {
  return gmailRequest<GmailLabel>(accessToken, `/labels/${encodeURIComponent(labelId)}`);
}

export function modifyGmailThread(accessToken: string, gmailThreadId: string, opts: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
  return gmailRequest(accessToken, `/threads/${encodeURIComponent(gmailThreadId)}/modify`, {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

// Gmail caps batchModify at 1000 message IDs and charges 50 quota units for
// the whole call, versus 5 per single-message modify. Bulk triage would other-
// wise be a thousand serial round trips and blow the serverless budget.
export const GMAIL_BATCH_MODIFY_LIMIT = 1000;

export function batchModifyGmailMessages(
  accessToken: string,
  gmailMessageIds: string[],
  opts: { addLabelIds?: string[]; removeLabelIds?: string[] },
) {
  if (gmailMessageIds.length > GMAIL_BATCH_MODIFY_LIMIT) {
    throw new Error(`batchModify accepts at most ${GMAIL_BATCH_MODIFY_LIMIT} message IDs`);
  }
  // Returns 204 with an empty body on success.
  return gmailRequest(accessToken, "/messages/batchModify", {
    method: "POST",
    body: JSON.stringify({ ids: gmailMessageIds, ...opts }),
  });
}

export function createGmailDraft(accessToken: string, raw: string, threadId?: string) {
  return gmailRequest<{ id: string; message: GmailMessage }>(accessToken, "/drafts", {
    method: "POST",
    body: JSON.stringify({ message: threadId ? { raw, threadId } : { raw } }),
  });
}

export function updateGmailDraft(accessToken: string, draftId: string, raw: string, threadId: string) {
  return gmailRequest<{ id: string; message: GmailMessage }>(accessToken, `/drafts/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    body: JSON.stringify({ message: { raw, threadId } }),
  });
}

export function sendGmailDraft(accessToken: string, draftId: string) {
  return gmailRequest<GmailMessage>(accessToken, "/drafts/send", {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
  });
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectBodies(
  part: GmailPart | undefined,
  plain: string[],
  html: string[],
  attachments: NormalizedGmailMessage["attachments"],
  includeTranscriptAttachments: boolean,
) {
  if (!part) return;
  const filename = part.filename?.trim() ?? "";
  if (filename || part.body?.attachmentId) {
    attachments.push({
      attachmentId: part.body?.attachmentId ?? null,
      filename: filename || "attachment",
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
    });
    const transcriptLike = /\.(?:srt|txt|vtt)$/i.test(filename) ||
      ["application/x-subrip", "text/plain", "text/vtt"].includes(part.mimeType ?? "");
    if (includeTranscriptAttachments && transcriptLike && part.body?.data && (part.body.size ?? 0) <= 500_000) {
      plain.push(`[Attached transcript: ${filename || "transcript"}]\n${decodeBase64Url(part.body.data)}`);
    }
  } else if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain") plain.push(decoded);
    else if (part.mimeType === "text/html") html.push(decoded);
  }
  for (const child of part.parts ?? []) collectBodies(child, plain, html, attachments, includeTranscriptAttachments);
}

function emailsFromHeader(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase());
}

function senderFromHeader(value: string | undefined): { email: string | null; name: string | null } {
  const email = emailsFromHeader(value)[0] ?? null;
  if (!value || !email) return { email, name: null };
  const before = value.slice(0, value.toLowerCase().indexOf(email)).replace(/[<>"]/g, "").trim();
  return { email, name: before || null };
}

export function normalizeGmailMessage(message: GmailMessage, mailboxEmail: string): NormalizedGmailMessage {
  const headers: Record<string, string> = {};
  for (const header of message.payload?.headers ?? []) headers[header.name.toLowerCase()] = header.value;
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: NormalizedGmailMessage["attachments"] = [];
  const voicemail = /voicemail|voice message|missed call/i.test(headers.subject ?? "");
  collectBodies(message.payload, plain, html, attachments, voicemail);
  const sender = senderFromHeader(headers.from);
  const unsubscribe = (headers["list-unsubscribe"] ?? "")
    .split(",")
    .map((v) => v.trim().replace(/^<|>$/g, ""))
    .filter(Boolean);
  const internalMs = Number(message.internalDate ?? Date.now());
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    rfcMessageId: headers["message-id"] ?? null,
    // SENT is authoritative even when the mailbox sends through a verified
    // support@ alias whose From header differs from the underlying account.
    direction: message.labelIds?.includes("SENT") || sender.email?.toLowerCase() === mailboxEmail.toLowerCase() ? "out" : "in",
    fromEmail: sender.email,
    fromName: sender.name,
    toEmails: emailsFromHeader(headers.to),
    ccEmails: emailsFromHeader(headers.cc),
    replyTo: emailsFromHeader(headers["reply-to"])[0] ?? null,
    subject: headers.subject?.trim() || "(no subject)",
    snippet: message.snippet ?? "",
    bodyText: (plain.join("\n\n").trim() || htmlToText(html.join("\n\n"))).slice(0, 500_000),
    labelIds: message.labelIds ?? [],
    rawHeaders: headers,
    internalDate: new Date(Number.isFinite(internalMs) ? internalMs : Date.now()).toISOString(),
    attachments,
    listUnsubscribe: unsubscribe,
    listUnsubscribePost: /list-unsubscribe\s*=\s*one-click/i.test(headers["list-unsubscribe-post"] ?? ""),
    autoSubmitted: headers["auto-submitted"] ?? null,
  };
}

function encodeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildReplyRaw(opts: {
  mailboxEmail: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const headers = [
    `From: Olera Support <${encodeHeader(opts.mailboxEmail)}>`,
    `To: ${encodeHeader(opts.to)}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${encodeHeader(opts.inReplyTo)}`] : []),
    ...(opts.references ? [`References: ${encodeHeader(opts.references)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${opts.body}`, "utf8").toString("base64url");
}
