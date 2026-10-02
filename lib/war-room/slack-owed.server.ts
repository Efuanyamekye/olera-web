import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSlackUserToken, markSlackUserTokenRevoked, type SlackUserToken } from "@/lib/war-room/slack-user-token.server";

/**
 * What the founder owes on Slack: mentions and DMs he hasn't answered, threads
 * he started that nobody answered, and things he said he'd do with nothing
 * after. One numbered list a day, each with a drafted reply he can approve.
 *
 * TJ, 2026-10-02: "Do a scan of Slack ... any outstanding topics I have to
 * address, messages that I need to respond to, things that I forgot to respond
 * to that I maybe promised in the past ... Just the most helpful Slack
 * assistant for me." He chose channels and his DMs, numbered items with draft
 * replies, and replies posted as him.
 *
 * Channels come from what Cortex already stores (war_room_source_items).
 * DMs need his own token (slack-user-token.server.ts): a bot cannot read
 * direct messages between people. Without it the coverage line says so, so a
 * short list never reads as a complete one.
 */

export type OwedItem = {
  kind: "mention" | "unanswered_thread" | "promise";
  channelId: string;
  channelLabel: string;
  ts: string;
  threadTs: string | null;
  author: string | null;
  text: string;
  permalink: string | null;
  ageDays: number;
  draftReply: string | null;
};
export type SlackOwed = { items: OwedItem[]; coverage: string; costUsd: number };

/** One Slack message, from storage or read live, in the shape the prefilter needs. */
export type OwedMessage = {
  channelId: string;
  channelLabel: string;
  isDm: boolean;
  ts: string;
  /** The thread it belongs to: its parent's ts, or its own when it is a parent or stands alone. */
  threadTs: string;
  userId: string | null;
  author: string | null;
  text: string;
  permalink: string | null;
  /** Replies Slack reported on a parent, when known. */
  replyCount: number | null;
};

export type Candidate = { kind: OwedItem["kind"]; message: OwedMessage; context: OwedMessage[] };

const WINDOW_DAYS = 14;
const MAX_ITEMS = 8;
const MAX_CANDIDATES = 25;
/** A thread or promise younger than this is still in motion, not owed. */
const SETTLE_HOURS = 24;

/** "I'll send it", "will follow up", "let me check", "by Friday". */
const COMMITMENT = /\b(i['’]ll|i will|will (send|share|get|follow|check|look|call|email|reach|loop|draft|do|update|post|set)|let me|i can (send|share|get|check|look)|on it\b|by (mon|tues|wednes|thurs|fri|satur|sun)day|by (tomorrow|tonight|eod|end of (day|week))|i['’]m going to|gonna)\b/i;

const ageDays = (ts: string, now: Date) => (now.getTime() - Number(ts) * 1_000) / 86_400_000;

/** He is mentioned: Slack's raw <@ID>, or the "@TJ Falohun" form stored text resolves to. */
export function mentionsHim(text: string, tjId: string | null, tjNames: string[]): boolean {
  if (tjId && text.includes(`<@${tjId}>`)) return true;
  return tjNames.some((name) => new RegExp(`(^|[^\\w])@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "i").test(text));
}

/**
 * The deterministic first cut, no model. Pure, so it is checked offline
 * (scripts/check-slack-owed.ts).
 *
 * (a) mention: someone @-mentions him, or writes to him in a DM, and he has
 *     posted nothing later in that thread (channels) or conversation (DMs).
 * (b) unanswered_thread: a thread he started in a channel, a day or more old,
 *     with no reply from anyone else.
 * (c) promise: his own message with a commitment in it, a day or more old,
 *     with nothing later from him in that thread or conversation.
 */
export function prefilterOwed(messages: OwedMessage[], tj: { id: string | null; names: string[] }, now: Date): Candidate[] {
  const isHim = (m: OwedMessage) => Boolean((tj.id && m.userId === tj.id) || (m.author && tj.names.some((name) => name.toLowerCase() === m.author!.toLowerCase())));
  const recent = messages.filter((m) => ageDays(m.ts, now) <= WINDOW_DAYS);
  // A DM is one conversation; a channel thread is its own conversation.
  const convo = (m: OwedMessage) => (m.isDm ? m.channelId : `${m.channelId}:${m.threadTs}`);
  const byConvo = new Map<string, OwedMessage[]>();
  for (const m of recent) byConvo.set(convo(m), [...(byConvo.get(convo(m)) ?? []), m]);
  for (const list of byConvo.values()) list.sort((a, b) => Number(a.ts) - Number(b.ts));
  const heSpokeAfter = (m: OwedMessage) => (byConvo.get(convo(m)) ?? []).some((other) => isHim(other) && Number(other.ts) > Number(m.ts));
  const contextFor = (m: OwedMessage) => (byConvo.get(convo(m)) ?? []).filter((other) => Number(other.ts) <= Number(m.ts)).slice(-4, -1);

  const out: Candidate[] = [];
  const seenConvo = new Set<string>();
  for (const m of [...recent].sort((a, b) => Number(b.ts) - Number(a.ts))) {
    const key = convo(m);
    if (isHim(m)) {
      const settled = ageDays(m.ts, now) * 24 >= SETTLE_HOURS;
      const isParent = !m.isDm && m.threadTs === m.ts;
      const others = (byConvo.get(key) ?? []).filter((other) => !isHim(other) && Number(other.ts) > Number(m.ts));
      if (isParent && settled && !others.length && (m.replyCount === null || m.replyCount === 0) && !seenConvo.has(key)) {
        out.push({ kind: "unanswered_thread", message: m, context: [] });
        seenConvo.add(key);
        continue;
      }
      if (settled && COMMITMENT.test(m.text) && !heSpokeAfter(m) && !seenConvo.has(`promise:${key}`)) {
        out.push({ kind: "promise", message: m, context: contextFor(m) });
        seenConvo.add(`promise:${key}`);
      }
      continue;
    }
    // Only the newest unanswered message per conversation: one item per thing owed.
    if (seenConvo.has(key)) continue;
    if ((m.isDm || mentionsHim(m.text, tj.id, tj.names)) && !heSpokeAfter(m)) {
      out.push({ kind: "mention", message: m, context: contextFor(m) });
      seenConvo.add(key);
    }
  }
  return out.slice(0, MAX_CANDIDATES);
}

// ---------------------------------------------------------------------------
// Reading Slack

type StoredRow = { source_group: string | null; source_url: string | null; external_id: string; occurred_at: string; content: string | null; metadata: { channel_id?: string; user_id?: string | null; author_name?: string | null; thread_ts?: string | null; reply_count?: number; channel_type?: string } | null };

/** Channel messages Cortex already stores. */
export function storedToMessages(rows: StoredRow[]): OwedMessage[] {
  return rows.flatMap((row) => {
    const [channelId, ts] = row.external_id.split(":");
    if (!channelId || !ts || !/^\d+\.\d+$/.test(ts)) return [];
    const meta = row.metadata ?? {};
    return [{
      channelId: meta.channel_id ?? channelId,
      channelLabel: `#${row.source_group ?? channelId}`,
      isDm: false,
      ts,
      threadTs: meta.thread_ts ?? ts,
      userId: meta.user_id ?? null,
      author: meta.author_name ?? null,
      text: row.content ?? "",
      permalink: row.source_url,
      replyCount: typeof meta.reply_count === "number" ? meta.reply_count : null,
    }];
  });
}

type SlackPayload = { ok?: boolean; error?: string; response_metadata?: { next_cursor?: string } };

async function slack<T>(token: string, method: string, params: Record<string, string>): Promise<SlackPayload & T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  return await response.json() as SlackPayload & T;
}

const DEAD_TOKEN = new Set(["invalid_auth", "token_revoked", "account_inactive", "not_authed"]);

/**
 * His DMs and group DMs from the last two weeks, read live with his token.
 * Bounded: the conversations with traffic in the window, at most 40, one
 * history call each, plus replies for threaded DMs up to 10 calls.
 */
async function readDms(db: SupabaseClient, user: SlackUserToken, now: Date): Promise<{ messages: OwedMessage[]; error: string | null }> {
  const oldest = String(Math.floor(now.getTime() / 1_000) - WINDOW_DAYS * 86_400);
  const list = await slack<{ channels?: Array<{ id: string; user?: string; is_im?: boolean; name?: string; updated?: number }> }>(user.token, "conversations.list", { types: "im,mpim", exclude_archived: "true", limit: "200" });
  if (!list.ok) {
    if (DEAD_TOKEN.has(list.error ?? "")) await markSlackUserTokenRevoked(db, user.userId);
    return { messages: [], error: list.error ?? "conversations.list failed" };
  }
  const names = new Map<string, string>();
  const users = await slack<{ members?: Array<{ id: string; real_name?: string; profile?: { real_name?: string; display_name?: string } }> }>(user.token, "users.list", { limit: "500" });
  for (const member of users.members ?? []) names.set(member.id, member.profile?.real_name || member.real_name || member.profile?.display_name || member.id);

  // Slack's `updated` is epoch milliseconds; a conversation without one is kept and read.
  const convos = (list.channels ?? []).filter((c) => !c.updated || c.updated >= Number(oldest) * 1_000).slice(0, 40);
  const messages: OwedMessage[] = [];
  let replyCalls = 0;
  for (const c of convos) {
    const history = await slack<{ messages?: Array<{ ts: string; user?: string; text?: string; thread_ts?: string; reply_count?: number; bot_id?: string; subtype?: string }> }>(user.token, "conversations.history", { channel: c.id, oldest, limit: "50" });
    if (!history.ok) continue;
    const label = c.is_im ? `DM with ${names.get(c.user ?? "") ?? "someone"}` : `group DM ${c.name ?? c.id}`;
    const add = (m: { ts: string; user?: string; text?: string; thread_ts?: string; reply_count?: number; bot_id?: string; subtype?: string }) => {
      if (m.bot_id || (m.subtype && m.subtype !== "thread_broadcast" && m.subtype !== "file_share")) return;
      messages.push({ channelId: c.id, channelLabel: label, isDm: true, ts: m.ts, threadTs: m.thread_ts ?? m.ts, userId: m.user ?? null, author: m.user ? names.get(m.user) ?? null : null, text: m.text ?? "", permalink: null, replyCount: m.reply_count ?? null });
    };
    for (const m of history.messages ?? []) {
      add(m);
      if ((m.reply_count ?? 0) > 0 && replyCalls < 10) {
        replyCalls += 1;
        const replies = await slack<{ messages?: Array<{ ts: string; user?: string; text?: string; thread_ts?: string }> }>(user.token, "conversations.replies", { channel: c.id, ts: m.ts, oldest, limit: "30" });
        for (const reply of (replies.messages ?? []).filter((r) => r.ts !== m.ts)) add(reply);
      }
    }
  }
  return { messages, error: null };
}

/** His Slack id and the names his messages carry, and how that was worked out. */
export function identifyTj(rows: OwedMessage[], tokenUserId: string | null, envUserId: string | null): { id: string | null; names: string[]; via: string } {
  const names = ["TJ Falohun", "TJ"];
  if (tokenUserId) return { id: tokenUserId, names, via: "his Slack token" };
  if (envUserId) return { id: envUserId, names, via: "WAR_ROOM_BRIEF_SLACK_USER_ID" };
  const byName = rows.find((m) => m.author && /^tj falohun$/i.test(m.author) && m.userId)?.userId ?? null;
  return { id: byName, names, via: byName ? "his name on stored messages" : "name only" };
}

// ---------------------------------------------------------------------------
// The model: drop noise, classify, draft

const SYSTEM = `You help TJ Falohun, Olera's founder, keep up with Slack. You get candidate messages a filter thinks he owes something on. For each, decide:
- keep: true only if he genuinely owes a reply or an action. Drop thanks, acknowledgements ("noted", "thanks TJ"), congratulations, FYIs that need nothing, and anything already resolved in the context.
- kind: "mention" (someone asked or told him something and waits), "unanswered_thread" (he asked and nobody answered: draft a short nudge), or "promise" (he said he would do something; draft a short follow-through or status line).
- draft: the reply he would post, in his voice: terse, direct, concrete, one to three sentences, no em dashes, no greeting fluff, no sign-off. Never invent a fact, date or number the messages don't support; if he must decide something, say what he needs to decide in the draft as a question back. For a promise, never claim the work is done or make a new promise: you cannot know its status, so write the line with a bracketed blank for him to fill, e.g. "Update on the deck: [status]." The reply posts under his name, so a wrong claim is his.
Keep at most ${MAX_ITEMS}, the ones that matter most first. Reply with JSON only: {"items":[{"id":number,"keep":boolean,"kind":"mention"|"unanswered_thread"|"promise","draft":string}]}`;

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

async function judge(candidates: Candidate[]): Promise<{ picks: Array<{ id: number; keep: boolean; kind: OwedItem["kind"]; draft: string }>; costUsd: number } | null> {
  if (!candidates.length || !process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content = candidates.map((c, i) => [
    `[${i}] filter says: ${c.kind} · ${c.message.channelLabel} · ${c.message.author ?? "unattributed"} · ${new Date(Number(c.message.ts) * 1_000).toISOString().slice(0, 10)}`,
    ...c.context.map((m) => `   before: ${m.author ?? "unattributed"}: ${clip(m.text, 220)}`),
    `   message: ${clip(c.message.text, 600)}`,
  ].join("\n")).join("\n\n");
  try {
    const reply = await anthropic.messages.create({
      model: process.env.CORTEX_SLACK_MODEL || "claude-sonnet-5",
      // Room for up to 25 verdicts and their drafts; 3,000 cut the JSON off on the first live run.
      max_tokens: 8_000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    }, { timeout: 60_000, maxRetries: 1 });
    const raw = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    if (!raw.includes("{")) throw new Error(`no JSON in the reply (stop: ${reply.stop_reason}, ${reply.usage.output_tokens} output tokens)`);
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { items?: Array<{ id: number; keep: boolean; kind: OwedItem["kind"]; draft: string }> };
    const costUsd = (reply.usage.input_tokens * 3 + reply.usage.output_tokens * 15) / 1_000_000;
    return { picks: parsed.items ?? [], costUsd };
  } catch (error) {
    console.error("[cortex] Slack owed judging failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Turn kept picks into items, newest-first order preserved from the model's ranking. */
export function toOwedItems(candidates: Candidate[], picks: Array<{ id: number; keep: boolean; kind: OwedItem["kind"]; draft: string }> | null, now: Date): OwedItem[] {
  const chosen = picks
    ? picks.filter((p) => p.keep && candidates[p.id]).map((p) => ({ candidate: candidates[p.id], kind: p.kind, draft: p.draft?.replace(/\s*[—–]\s*/g, ", ").trim() || null }))
    // No model: the filter's own list, no drafts, so nothing is lost silently.
    : candidates.map((candidate) => ({ candidate, kind: candidate.kind, draft: null }));
  return chosen.slice(0, MAX_ITEMS).map(({ candidate, kind, draft }) => ({
    kind,
    channelId: candidate.message.channelId,
    channelLabel: candidate.message.channelLabel,
    ts: candidate.message.ts,
    threadTs: candidate.message.isDm && candidate.message.threadTs === candidate.message.ts ? null : candidate.message.threadTs,
    author: candidate.message.author,
    text: candidate.message.text,
    permalink: candidate.message.permalink,
    ageDays: Math.round(ageDays(candidate.message.ts, now) * 10) / 10,
    draftReply: draft,
  }));
}

/** The one line that says what this list can and cannot see. */
export function coverageLine(args: { channels: string[]; dms: "covered" | "not connected" | string; unreadable: string[]; via: string }): string {
  const dm = args.dms === "covered" ? "your DMs covered" : args.dms === "not connected" ? "DMs not covered (connect Slack as yourself to include them)" : `DMs not read (${args.dms})`;
  return `Read ${args.channels.length} channel${args.channels.length === 1 ? "" : "s"}, last ${WINDOW_DAYS} days; ${dm}${args.unreadable.length ? `; can't read ${args.unreadable.join(", ")}` : ""}.`;
}

// ---------------------------------------------------------------------------
// The exports

export async function findSlackOwed(db: SupabaseClient, now = new Date()): Promise<SlackOwed> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: rows }, { data: state }, user] = await Promise.all([
    db.from("war_room_source_items")
      .select("source_group, source_url, external_id, occurred_at, content, metadata")
      .eq("source", "slack")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(2_000),
    db.from("war_room_source_state").select("last_error").eq("source_key", "slack_history").maybeSingle(),
    loadSlackUserToken(db),
  ]);
  const channelMessages = storedToMessages((rows ?? []) as StoredRow[]);
  const dm = user ? await readDms(db, user, now).catch((error: unknown) => ({ messages: [] as OwedMessage[], error: error instanceof Error ? error.message : String(error) })) : null;
  const all = [...channelMessages, ...(dm?.messages ?? [])];
  const tj = identifyTj(channelMessages, user?.userId ?? null, process.env.WAR_ROOM_BRIEF_SLACK_USER_ID?.trim() || null);
  const candidates = prefilterOwed(all, tj, now);
  const judged = await judge(candidates);
  // "#careshifts-summer-project-team: not_in_channel" and the like, from the last scan.
  const unreadable = [...String((state as { last_error?: string | null } | null)?.last_error ?? "").matchAll(/(#[\w-]+): not_in_channel/g)].map((m) => m[1]);
  return {
    items: toOwedItems(candidates, judged?.picks ?? null, now),
    coverage: coverageLine({
      channels: [...new Set(channelMessages.map((m) => m.channelLabel))],
      dms: !user ? "not connected" : dm?.error ? dm.error : "covered",
      unreadable,
      via: tj.via,
    }),
    costUsd: judged?.costUsd ?? 0,
  };
}

/**
 * Post his approved reply, as him. Pass `item.threadTs ?? ""`: a thread is
 * answered in the thread, a standalone DM at the top of the DM. No user token, no post: a bot
 * reply headed "From TJ" is a different thing, and he chose "as me".
 */
export async function postSlackReplyAsTj(db: SupabaseClient, args: { channelId: string; threadTs: string; text: string }): Promise<{ ok: true; permalink: string | null } | { ok: false; error: string }> {
  const text = args.text.trim();
  if (!text) return { ok: false, error: "the reply is empty" };
  const user = await loadSlackUserToken(db);
  if (!user) return { ok: false, error: "Slack isn't connected as you yet. Open /api/integrations/slack/user-auth once on olera.care, then approve again." };
  // An empty threadTs posts at the top of the conversation: a standalone DM is answered in the DM, not in a thread.
  const posted = await slack<{ ts?: string; channel?: string }>(user.token, "chat.postMessage", { channel: args.channelId, text, ...(args.threadTs ? { thread_ts: args.threadTs } : {}) });
  if (!posted.ok) {
    if (DEAD_TOKEN.has(posted.error ?? "")) await markSlackUserTokenRevoked(db, user.userId);
    return { ok: false, error: posted.error === "missing_scope" ? "your Slack connection is missing chat:write; reconnect at /api/integrations/slack/user-auth" : `Slack refused: ${posted.error ?? "unknown error"}` };
  }
  const link = await slack<{ permalink?: string }>(user.token, "chat.getPermalink", { channel: args.channelId, message_ts: posted.ts ?? "" }).catch(() => null);
  return { ok: true, permalink: link?.permalink ?? null };
}

export async function slackUserTokenStatus(db: SupabaseClient): Promise<{ connected: boolean; scopes: string[]; userId: string | null }> {
  const user = await loadSlackUserToken(db);
  return { connected: Boolean(user), scopes: user?.scopes ?? [], userId: user?.userId ?? null };
}
