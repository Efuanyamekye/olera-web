import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What Cortex remembers of its conversations with the founder.
 *
 * The Slack DM remembered one exchange for fifteen minutes, so "what about
 * Robbie?" the next morning had nothing to attach to. On Telegram Cortex is a
 * thinking partner (TJ, 2026-09-27: "I ask you a question on whatever's on my
 * mind. You respond"), which only works if it remembers. So every message is
 * kept (migration 261), the last RECENT_TURNS are read verbatim, and anything
 * older is folded into a rolling summary by Haiku.
 */
export type ChatRole = "founder" | "cortex";
export type ChatKind = "message" | "brief" | "ping";
export type ChatMessage = { role: ChatRole; kind: ChatKind; text: string; at: string };
export type ChatMemory = { summary: string | null; recent: ChatMessage[] };

/** Read verbatim on every answer. Older ones live in the summary. */
export const RECENT_TURNS = 16;
/** Fold into the summary once this many messages sit outside the recent window. */
const SUMMARY_BATCH = 8;
const MESSAGE_CHARS = 2_000;

/** The storage Cortex's memory needs. Supabase in production, a map in checks. */
export interface ChatStore {
  /** False when this update was already stored: a retry, not a new message. */
  append(chatId: string, message: ChatMessage & { surface: "telegram" | "slack"; updateId?: number }): Promise<boolean>;
  recent(chatId: string, limit: number): Promise<ChatMessage[]>;
  since(chatId: string, after: string | null, before: string): Promise<ChatMessage[]>;
  summary(chatId: string): Promise<{ summary: string; throughAt: string } | null>;
  saveSummary(chatId: string, summary: string, throughAt: string): Promise<void>;
}

type MessageRow = { role: ChatRole; kind: ChatKind; text: string; created_at: string };
const fromRow = (row: MessageRow): ChatMessage => ({ role: row.role, kind: row.kind, text: row.text, at: row.created_at });

export function supabaseChatStore(db: SupabaseClient): ChatStore {
  return {
    async append(chatId, message) {
      const { error } = await db.from("cortex_chat_messages").insert({
        surface: message.surface,
        chat_id: chatId,
        role: message.role,
        kind: message.kind,
        text: message.text.slice(0, 8_000),
        telegram_update_id: message.updateId ?? null,
        created_at: message.at,
      });
      // 23505 is the unique update id: Telegram retried something already here.
      if (error?.code === "23505") return false;
      // Any other failure (the table not migrated yet, say) must not stop the
      // answer. Memory is lost for that message, and it says so in the logs.
      if (error) console.error("[cortex] chat memory write failed:", error.message);
      return true;
    },
    async recent(chatId, limit) {
      const { data, error } = await db.from("cortex_chat_messages")
        .select("role, kind, text, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return [];
      return ((data ?? []) as MessageRow[]).map(fromRow).reverse();
    },
    async since(chatId, after, before) {
      let query = db.from("cortex_chat_messages")
        .select("role, kind, text, created_at")
        .eq("chat_id", chatId)
        .lt("created_at", before)
        .order("created_at", { ascending: true })
        .limit(200);
      if (after) query = query.gt("created_at", after);
      const { data, error } = await query;
      if (error) return [];
      return ((data ?? []) as MessageRow[]).map(fromRow);
    },
    async summary(chatId) {
      const { data, error } = await db.from("cortex_chat_summaries")
        .select("summary, through_at")
        .eq("chat_id", chatId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as { summary: string; through_at: string };
      return { summary: row.summary, throughAt: row.through_at };
    },
    async saveSummary(chatId, summary, throughAt) {
      await db.from("cortex_chat_summaries").upsert({
        chat_id: chatId,
        summary,
        through_at: throughAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "chat_id" }).then(() => undefined, () => undefined);
    },
  };
}

/** For checks and replays: nothing touches the database. */
export function memoryChatStore(): ChatStore & { messages: Map<string, ChatMessage[]> } {
  const messages = new Map<string, ChatMessage[]>();
  const updates = new Set<number>();
  const summaries = new Map<string, { summary: string; throughAt: string }>();
  const list = (chatId: string) => messages.get(chatId) ?? [];
  return {
    messages,
    async append(chatId, message) {
      if (message.updateId !== undefined) {
        if (updates.has(message.updateId)) return false;
        updates.add(message.updateId);
      }
      messages.set(chatId, [...list(chatId), { role: message.role, kind: message.kind, text: message.text, at: message.at }]);
      return true;
    },
    async recent(chatId, limit) {
      return list(chatId).slice(-limit);
    },
    async since(chatId, after, before) {
      return list(chatId).filter((message) => (!after || message.at > after) && message.at < before);
    },
    async summary(chatId) {
      return summaries.get(chatId) ?? null;
    },
    async saveSummary(chatId, summary, throughAt) {
      summaries.set(chatId, { summary, throughAt });
    },
  };
}

export async function loadChatMemory(store: ChatStore, chatId: string): Promise<ChatMemory> {
  const [summary, recent] = await Promise.all([
    store.summary(chatId).catch(() => null),
    store.recent(chatId, RECENT_TURNS).catch(() => [] as ChatMessage[]),
  ]);
  return { summary: summary?.summary ?? null, recent };
}

/**
 * The conversation so far, as the prompt reads it. Times are given so "this
 * morning" and "yesterday" resolve; Cortex's own briefs are labelled, because
 * "what about the second one?" is often about a brief.
 */
export function memoryPromptText(memory: ChatMemory): string {
  const lines: string[] = [];
  if (memory.summary) lines.push(`Earlier, summarised:\n${memory.summary}`);
  if (memory.recent.length) {
    lines.push(memory.recent.map((message) => {
      const who = message.role === "founder"
        ? "He said"
        : message.kind === "brief" ? "Your daily brief said" : message.kind === "ping" ? "You messaged first" : "You said";
      // A brief or inbox digest is long and numbered; cut at 2k, Cortex could
      // read items 1 and 2 of a 10-item digest and nothing after (28 Sep).
      const limit = message.kind === "message" ? MESSAGE_CHARS : 8_000;
      return `[${message.at.slice(0, 16).replace("T", " ")} UTC] ${who}: ${message.text.slice(0, limit)}`;
    }).join("\n"));
  }
  return lines.join("\n\n");
}

/**
 * Fold messages that have left the recent window into the summary, once there
 * are enough of them to be worth a call. Haiku, about a tenth of a cent. A
 * failure leaves the old summary; the messages are still stored and fold in
 * next time.
 */
export async function refreshChatSummary(store: ChatStore, chatId: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const recent = await store.recent(chatId, RECENT_TURNS);
  if (recent.length < RECENT_TURNS) return false;
  const existing = await store.summary(chatId);
  const aged = await store.since(chatId, existing?.throughAt ?? null, recent[0].at);
  if (aged.length < SUMMARY_BATCH) return false;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      system: "You keep the running memory of a conversation between the founder of Olera (a senior-care marketplace) and Cortex, his AI thinking partner. Merge the earlier summary with the new messages into one updated summary of at most 250 words. Keep what later questions will need: people and providers named, decisions he made, what he asked for, what Cortex recommended and whether he agreed or pushed back, open threads, dates. Drop small talk. Plain sentences, no headings.",
      messages: [{
        role: "user",
        content: `EARLIER SUMMARY:\n${existing?.summary ?? "(none)"}\n\nNEW MESSAGES:\n${memoryPromptText({ summary: null, recent: aged })}`,
      }],
    }, { timeout: 20_000, maxRetries: 0 });
    const text = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text.trim();
    if (!text) return false;
    await store.saveSummary(chatId, text.slice(0, 3_000), aged[aged.length - 1].at);
    return true;
  } catch {
    return false;
  }
}
