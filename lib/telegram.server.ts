/**
 * Telegram Bot API, for Cortex's chat with the founder.
 *
 * Only what Cortex needs: send a message, show "typing", and download a file
 * (a screenshot or a voice note) he sent. The token lives in
 * TELEGRAM_CORTEX_BOT_TOKEN; without it every call reports "not configured"
 * rather than throwing.
 */

const API = "https://api.telegram.org";
/** Telegram's cap is 4,096 characters per message; HTML tags count. */
const CHUNK_CHARS = 3_500;

function token() {
  return process.env.TELEGRAM_CORTEX_BOT_TOKEN?.trim() || null;
}

export function isTelegramConfigured() {
  return Boolean(token() && founderChatId());
}

/** The only chat Cortex talks to. Everything else is dropped. */
export function founderChatId() {
  return process.env.TELEGRAM_CORTEX_CHAT_ID?.trim() || null;
}

async function call<T>(method: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<{ ok: boolean; result?: T; description?: string; error_code?: number }> {
  const bot = token();
  if (!bot) return { ok: false, description: "TELEGRAM_CORTEX_BOT_TOKEN not configured" };
  try {
    const res = await fetch(`${API}/bot${bot}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await res.json() as { ok: boolean; result?: T; description?: string; error_code?: number };
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Cortex writes Slack markup (the brief and the DM share one voice): *bold*,
 * _italic_, <url|label> links and "> " quoted drafts. Telegram's HTML mode
 * reads none of that, so it is translated rather than shown raw.
 */
export function slackToTelegramHtml(text: string): string {
  const links: string[] = [];
  const withPlaceholders = text.replace(/<(https?:\/\/[^|>\s]+)(?:\|([^>]+))?>/g, (_, url: string, label?: string) => {
    links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label ?? url)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  let html = escapeHtml(withPlaceholders)
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s.,!?;:)]|$)/gm, "$1<b>$2</b>")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s.,!?;:)]|$)/gm, "$1<i>$2</i>");
  // Consecutive "> " lines (a draft to paste) become one quote block.
  html = html.replace(/(?:^&gt; ?.*(?:\n|$))+/gm, (block) => {
    const body = block.replace(/\n$/, "").split("\n").map((line) => line.replace(/^&gt; ?/, "")).join("\n");
    return `<blockquote>${body}</blockquote>${block.endsWith("\n") ? "\n" : ""}`;
  });
  return html.replace(/\u0000(\d+)\u0000/g, (_, i: string) => links[Number(i)] ?? "");
}

/** Split at paragraph breaks so no message passes Telegram's limit. */
export function chunkForTelegram(text: string, limit = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const piece = paragraph.length > limit ? paragraph.match(new RegExp(`[\\s\\S]{1,${limit}}`, "g")) ?? [] : [paragraph];
    for (const part of piece) {
      if (current && current.length + part.length + 2 > limit) {
        chunks.push(current);
        current = part;
      } else {
        current = current ? `${current}\n\n${part}` : part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Send a message written in Cortex's Slack markup. If Telegram rejects the
 * HTML (a stray tag), the same chunk goes again as plain text: a message with
 * visible asterisks beats no message.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  for (const chunk of chunkForTelegram(text)) {
    let sent = await call("sendMessage", {
      chat_id: chatId,
      text: slackToTelegramHtml(chunk),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    if (!sent.ok && sent.error_code === 400) {
      sent = await call("sendMessage", { chat_id: chatId, text: chunk, link_preview_options: { is_disabled: true } });
    }
    if (!sent.ok) return { success: false, error: sent.description ?? "Telegram send failed" };
  }
  return { success: true };
}

/** "Cortex is typing..." while an answer is worked out. Lasts about 5 seconds. */
export async function sendTelegramTyping(chatId: string) {
  await call("sendChatAction", { chat_id: chatId, action: "typing" }, 5_000);
}

/** A file he sent (photo, voice note). Bot API downloads are capped at 20 MB. */
export async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const bot = token();
  if (!bot) throw new Error("TELEGRAM_CORTEX_BOT_TOKEN not configured");
  const file = await call<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.ok || !file.result?.file_path) throw new Error(file.description ?? "Telegram did not return the file");
  const res = await fetch(`${API}/file/bot${bot}/${file.result.file_path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`file download returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * A voice note as text, through OpenAI's transcription endpoint (its key is
 * already set for the benefits navigator). Null when there is no key, so the
 * caller can say it cannot hear voice notes yet rather than guess.
 */
export async function transcribeVoiceNote(audio: Buffer, mimeType = "audio/ogg"): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), mimeType.includes("mpeg") ? "voice.mp3" : "voice.ogg");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`transcription returned ${res.status}`);
  const body = await res.json() as { text?: string };
  return body.text?.trim() || null;
}

/**
 * Point the bot at this deployment and report what Telegram sees. Safe to run
 * again: setWebhook replaces the previous registration.
 */
export async function registerTelegramWebhook(url: string) {
  const secret = process.env.TELEGRAM_CORTEX_WEBHOOK_SECRET?.trim();
  if (!token()) return { ok: false, error: "TELEGRAM_CORTEX_BOT_TOKEN is not set" };
  if (!secret) return { ok: false, error: "TELEGRAM_CORTEX_WEBHOOK_SECRET is not set" };
  const set = await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  const info = await call<{ url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo", {});
  const me = await call<{ username?: string }>("getMe", {});
  return {
    ok: set.ok,
    error: set.ok ? null : set.description ?? "setWebhook failed",
    bot: me.result?.username ? `@${me.result.username}` : null,
    webhook: info.result?.url ?? null,
    pending: info.result?.pending_update_count ?? 0,
    lastError: info.result?.last_error_message
      ? `${info.result.last_error_message} (${new Date((info.result.last_error_date ?? 0) * 1000).toISOString()})`
      : null,
  };
}
