import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachmentKind, downloadSlackFile, extractAttachmentText, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHARS, type AttachmentFile } from "@/lib/war-room/attachments.server";
import type { WarRoomIntegrationStatus, WarRoomProposalEvidence } from "@/lib/war-room/types";

type SourceItemInput = {
  source: "slack" | "notion" | "archive";
  external_id: string;
  source_group: string;
  source_kind: string;
  title: string;
  content: string;
  source_url: string | null;
  occurred_at: string;
  last_edited_at: string | null;
  freshness: "current" | "aging" | "stale";
  trust: "context" | "corroborated";
  metadata: Record<string, unknown>;
};

type SlackChannelConfig = { id: string; label: string };
type NotionSourceConfig = { id: string; kind: string; label: string };

const NOTION_VERSION = "2026-03-11";
const MAX_SOURCE_CONTENT = 6_000;

function bounded(value: string, max = MAX_SOURCE_CONTENT) {
  const clean = value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function contentHash(item: SourceItemInput) {
  return createHash("sha256")
    .update(`${item.title}\n${item.content}\n${item.last_edited_at ?? item.occurred_at}`)
    .digest("hex");
}

function freshness(value: string | null): SourceItemInput["freshness"] {
  if (!value) return "stale";
  const age = Date.now() - new Date(value).getTime();
  if (age <= 21 * 86_400_000) return "current";
  if (age <= 60 * 86_400_000) return "aging";
  return "stale";
}

function slackChannels(): SlackChannelConfig[] {
  return (process.env.WAR_ROOM_SLACK_CHANNELS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, label] = entry.split("|").map((part) => part.trim());
      return { id, label: label || id };
    })
    .filter((entry) => /^[CG][A-Z0-9]+$/.test(entry.id));
}

function notionSources(): NotionSourceConfig[] {
  return (process.env.WAR_ROOM_NOTION_DATA_SOURCES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, kind, label] = entry.split("|").map((part) => part.trim());
      return { id, kind: kind || "meeting_notes", label: label || kind || id };
    })
    .filter((entry) => /^[a-f0-9-]{32,36}$/i.test(entry.id));
}

function githubRepositoryConfigured() {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
    process.env.WAR_ROOM_GITHUB_REPOSITORY ?? "",
  );
}

async function upsertSourceItems(db: SupabaseClient, items: SourceItemInput[]) {
  if (!items.length) return 0;
  const now = new Date().toISOString();
  // One row per key. A message posted to a thread "and also sent to the
  // channel" (thread_broadcast) arrives both as a channel message and as a
  // reply, and Postgres rejects an upsert that writes the same row twice in
  // one statement -- which silently cost #careseeker-support its whole batch
  // on 2026-09-23. The later copy wins; they are the same message.
  const unique = [...new Map(items.map((item) => [`${item.source}:${item.external_id}`, item])).values()];
  const rows = unique.map((item) => ({
    ...item,
    title: bounded(item.title, 300),
    // Documents keep up to their own cap; the 6,000 for messages would have cut
    // a shared report to its first pages. The scan still reads only 900
    // characters of any item, so this costs nothing per scan.
    content: bounded(item.content, item.source_kind === "attachment" ? MAX_ATTACHMENT_CHARS : MAX_SOURCE_CONTENT),
    content_hash: contentHash(item),
    ingested_at: now,
    updated_at: now,
  }));
  const { error } = await db.from("war_room_source_items")
    .upsert(rows, { onConflict: "source,external_id" });
  if (error) throw error;
  return rows.length;
}

async function writeSourceState(
  db: SupabaseClient,
  sourceKey: string,
  values: { cursor?: string | null; error?: string | null; success?: boolean; metadata?: Record<string, unknown> },
) {
  const now = new Date().toISOString();
  const { error } = await db.from("war_room_source_state").upsert({
    source_key: sourceKey,
    ...(values.cursor !== undefined ? { cursor: values.cursor } : {}),
    last_synced_at: now,
    ...(values.success ? { last_success_at: now } : {}),
    last_error: values.error ?? null,
    metadata: values.metadata ?? {},
    updated_at: now,
  }, { onConflict: "source_key" });
  if (error) throw error;
}

function slackMessageUrl(channel: string, ts: string) {
  const workspace = (process.env.WAR_ROOM_SLACK_WORKSPACE_URL ?? "").replace(/\/$/, "");
  return workspace ? `${workspace}/archives/${channel}/p${ts.replace(".", "")}` : null;
}

/**
 * Which Slack messages are worth keeping.
 *
 * The first version dropped anything with a `subtype`, which quietly threw away
 * every message with a file attached (`file_share`) -- and a shared document is
 * usually the substance. On 2026-09-23 the founder asked about study feedback
 * Minh-Nguyet posted as an attachment on Sep 17; it had been discarded by both
 * the backfill and the live feed. Bot and join/leave noise still goes.
 */
const KEPT_SUBTYPES = new Set(["file_share", "thread_broadcast"]);

export function usableSlackMessage(message: SlackMessage) {
  if (!message.ts || message.bot_id) return false;
  if (message.subtype && !KEPT_SUBTYPES.has(message.subtype)) return false;
  return Boolean(message.text?.trim() || message.files?.length);
}

/** The text, plus the names of any attached files, so a search can find the document. */
export function slackContent(message: SlackMessage) {
  const files = (message.files ?? []).map((file) => file.title || file.name).filter(Boolean);
  return [message.text?.trim() ?? "", files.length ? `[Attached: ${files.join("; ")}]` : ""].filter(Boolean).join("\n");
}

/**
 * Author names, cached per scan. Stored so "the message from Minh" can be
 * found: the record held only a user id, and a name search had nothing to
 * match. Needs the users:read scope; without it this quietly returns nulls and
 * the self-check below still reports the rest.
 */
const slackNameCache = new Map<string, string | null>();
// The first reason a name lookup failed, reported by the self-check. Swallowed,
// a missing users:read scope would look exactly like people without names.
let slackNameError: string | null = null;

// Attachments downloaded per scan, and the first reason one could not be read.
// Bounded because each is a download plus a parse inside the scan's shared
// deadline; already-stored files are skipped, so the budget goes to new ones.
const ATTACHMENTS_PER_SCAN = 8;
let attachmentBudget = ATTACHMENTS_PER_SCAN;
let attachmentError: string | null = null;

async function attachmentItems(
  db: SupabaseClient,
  token: string,
  channel: SlackChannelConfig,
  messages: SlackMessage[],
  deadline: number,
): Promise<SourceItemInput[]> {
  const candidates = messages.flatMap((message) => (message.files ?? []).map((file) => ({ message, file })))
    .filter(({ file }) => file.id && attachmentKind(file) && (file.size ?? 0) <= MAX_ATTACHMENT_BYTES);
  if (!candidates.length) return [];
  const ids = candidates.map(({ file }) => `${channel.id}:file:${file.id}`);
  const { data: stored } = await db.from("war_room_source_items").select("external_id").in("external_id", ids);
  const have = new Set(((stored ?? []) as Array<{ external_id: string }>).map((row) => row.external_id));
  const items: SourceItemInput[] = [];
  for (const { message, file } of candidates) {
    const externalId = `${channel.id}:file:${file.id}`;
    if (have.has(externalId) || attachmentBudget <= 0 || Date.now() >= deadline - 5_000) continue;
    attachmentBudget -= 1;
    try {
      const text = await extractAttachmentText(await downloadSlackFile(token, file), attachmentKind(file)!);
      if (!text) continue;
      const author = await slackUserName(token, message.user);
      const fileName = file.title || file.name || "attachment";
      const occurredAt = new Date(Number(message.ts) * 1_000).toISOString();
      items.push({
        source: "slack",
        external_id: externalId,
        source_group: channel.label,
        source_kind: "attachment",
        title: `#${channel.label} · ${fileName}${author ? ` · shared by ${author}` : ""}`,
        content: text,
        source_url: slackMessageUrl(channel.id, message.ts || ""),
        occurred_at: occurredAt,
        last_edited_at: null,
        freshness: freshness(occurredAt),
        trust: "context",
        metadata: { channel_id: channel.id, file_id: file.id, file_name: fileName, message_ts: message.ts, author_name: author, user_id: message.user ?? null },
      });
    } catch (error) {
      attachmentError ??= describeError(error);
    }
  }
  return items;
}
async function slackUserName(token: string, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  if (slackNameCache.has(userId)) return slackNameCache.get(userId) ?? null;
  try {
    const payload = await slackApi<{ user?: { real_name?: string; profile?: { real_name?: string; display_name?: string } } }>(token, "users.info", { user: userId });
    const name = payload.user?.profile?.real_name || payload.user?.real_name || payload.user?.profile?.display_name || null;
    slackNameCache.set(userId, name);
    return name;
  } catch (error) {
    slackNameError ??= describeError(error);
    slackNameCache.set(userId, null);
    return null;
  }
}

/**
 * Slack writes a mention as <@U013S7E67RN>. Stored raw, Cortex could not say
 * who was tagged and, asked, guessed: it named "Louis Fisher" for a message
 * addressed to Logan and TJ. Resolved to names at ingestion, through the same
 * cached lookup as authors; an unresolvable id is left as it was.
 */
async function resolveMentions(token: string, text: string | undefined): Promise<string | undefined> {
  if (!text || !text.includes("<@")) return text;
  const ids = [...new Set([...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((match) => match[1]))];
  let resolved = text;
  for (const id of ids) {
    const name = await slackUserName(token, id);
    if (name) resolved = resolved.replace(new RegExp(`<@${id}(?:\\|[^>]*)?>`, "g"), `@${name}`);
  }
  return resolved;
}

type SlackMessage = {
  ts?: string;
  thread_ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  files?: AttachmentFile[];
  reply_count?: number;
  reactions?: Array<{ name?: string; count?: number }>;
};

export async function syncSlackHistoryEvidence(db: SupabaseClient) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channels = slackChannels();
  if (!token || !channels.length) {
    return { configured: false, imported: 0, detail: "Slack reader is not configured" };
  }

  const { data: state } = await db.from("war_room_source_state")
    .select("metadata")
    .eq("source_key", "slack_history")
    .maybeSingle();
  const previousIndex = Number((state?.metadata as { channel_index?: number } | null)?.channel_index ?? -1);
  const oldest = String(Math.floor((Date.now() - 90 * 86_400_000) / 1_000));

  // As many channels as fit in a budget, not one per scan.
  //
  // One channel per run was fine when the allowlist was expected to hold two or
  // three. Asked to read everything, twelve channels on a daily scan meant a
  // twelve-day wait before the last one was read even once, and a channel added
  // today would be silently invisible for most of a fortnight. Live messages
  // still arrive through the Events API; this is the backfill, and it should not
  // be the thing that decides how long the system stays half-blind.
  //
  // Bounded by a deadline rather than a count, because the binding constraint is
  // the 300-second route ceiling shared with Notion and the model calls, not the
  // number of channels.
  const deadline = Date.now() + 45_000;
  const threadBudget: ThreadBudget = { remaining: THREAD_FETCHES_PER_SCAN };
  attachmentBudget = ATTACHMENTS_PER_SCAN;
  attachmentError = null;
  const results: Array<{ channel: string; imported?: number; error?: string; threadsRead?: number; replies?: number; threadError?: string; newestInSlack?: string | null; newestStored?: string | null }> = [];
  let imported = 0;
  let lastIndex = previousIndex;

  for (let step = 1; step <= channels.length; step++) {
    if (Date.now() >= deadline) break;
    const channelIndex = (previousIndex + step) % channels.length;
    const channel = channels[channelIndex];
    lastIndex = channelIndex;
    const outcome = await backfillSlackChannel(db, token, channel, oldest, deadline, threadBudget);
    results.push({ channel: channel.label, ...outcome });
    imported += outcome.imported ?? 0;
  }

  // Every channel's outcome, not just the last one. A channel the bot has not
  // been invited to fails with `not_in_channel` forever, and under the old
  // one-at-a-time state that fact surfaced for a single channel per day and was
  // overwritten before anyone saw the pattern.
  const failures = results.filter((entry) => entry.error);
  await writeSourceState(db, "slack_history", {
    success: failures.length < results.length,
    error: failures.length ? failures.map((f) => `#${f.channel}: ${f.error}`).join("; ").slice(0, 500) : undefined,
    metadata: {
      channel_index: lastIndex,
      channels_read: results.length,
      threads_read: THREAD_FETCHES_PER_SCAN - threadBudget.remaining,
      ...(slackNameError ? { author_lookup_error: slackNameError } : {}),
      ...(attachmentError ? { attachment_error: attachmentError } : {}),
      results,
    },
  });
  return {
    configured: true,
    imported,
    detail: failures.length
      ? `Read ${results.length} channel(s), ${failures.length} failed: ${failures.map((f) => `#${f.channel}`).join(", ")}`
      : `Backfilled ${results.length} channel(s)`,
  };
}

/** One channel's bounded page. Never throws: a channel the bot cannot read must not stop the rest. */
async function slackApi<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  // Form-encoded, not JSON. Slack accepts JSON bodies only on some methods.
  // conversations.history tolerated it, so ingestion looked healthy, while
  // conversations.replies and users.info rejected every call with
  // `invalid_arguments` -- 20 of 20 thread reads and every author lookup on
  // the 2026-09-23 scan. Form encoding is accepted by every Web API method.
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as { ok?: boolean; error?: string } & T;
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Slack HTTP ${response.status}`);
  return payload;
}

/**
 * One message, ingested.
 *
 * `thread_ts` alone does not mean "this is a reply". Slack sets it on the
 * thread's parent too, where it equals the message's own `ts`. The previous
 * version keyed the label off its presence, so every thread parent was filed as
 * a reply -- 38 of them in the first real ingestion, and not one genuine reply
 * among them.
 */
function slackItem(channel: SlackChannelConfig, message: SlackMessage, authorName: string | null = null): SourceItemInput {
  const occurredAt = new Date(Number(message.ts) * 1_000).toISOString();
  const isReply = Boolean(message.thread_ts) && message.thread_ts !== message.ts;
  return {
    source: "slack",
    external_id: `${channel.id}:${message.ts}`,
    source_group: channel.label,
    source_kind: isReply ? "thread_reply" : "channel_message",
    title: authorName ? `#${channel.label} · ${authorName}` : `#${channel.label} conversation`,
    content: slackContent(message),
    source_url: slackMessageUrl(channel.id, message.ts || ""),
    occurred_at: occurredAt,
    last_edited_at: null,
    freshness: freshness(occurredAt),
    trust: "context",
    metadata: {
      channel_id: channel.id,
      user_id: message.user ?? null,
      author_name: authorName,
      thread_ts: message.thread_ts ?? null,
      reply_count: message.reply_count ?? 0,
      reactions: message.reactions ?? [],
    },
  };
}

/**
 * How many threads to open per channel, and how deep.
 *
 * `conversations.history` returns only top-level messages. Replies live behind
 * `conversations.replies`, one call per thread, and nothing was making those
 * calls -- so every threaded conversation in the workspace was invisible.
 *
 * That is not a minor omission here. The #aging-in-america channel returned a
 * single stored item, Chantel's opening message, while the eighteen replies
 * underneath it carried the entire substance: which cloud service, how large
 * the footage is, how long an upload takes, and the answer to a question the
 * founder had asked Cortex and been told did not exist.
 */
const THREADS_PER_CHANNEL = 3;
const REPLIES_PER_THREAD = 30;

/**
 * A scan-wide ceiling on thread fetches, which the per-channel cap alone does
 * not give.
 *
 * Six threads across twenty-one channels is 126 extra calls on top of 21
 * history calls. At roughly three quarters of a second each that is 110
 * seconds against a 45-second budget, so the deadline would fire partway
 * through and later channels would get nothing -- trading breadth for depth by
 * accident rather than by choice. And if it did fit, it would be about 196
 * requests a minute against a Slack tier that guarantees 50.
 *
 * There is a note in my own working memory that says to check rate limits
 * before adding call volume. I wrote the first version without doing it.
 */
const THREAD_FETCHES_PER_SCAN = 20;

type ThreadBudget = { remaining: number };

/**
 * A readable reason. Supabase errors are plain objects, not Error instances,
 * so String() turned one into "[object Object]" in the founder's brief.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const { message, code } = error as { message?: unknown; code?: unknown };
    return `${String(message)}${code ? ` (${String(code)})` : ""}`;
  }
  return String(error);
}

async function backfillSlackChannel(
  db: SupabaseClient,
  token: string,
  channel: SlackChannelConfig,
  oldest: string,
  deadline: number,
  budget: ThreadBudget,
): Promise<{ imported?: number; error?: string; threadsRead?: number; replies?: number; threadError?: string; newestInSlack?: string | null; newestStored?: string | null }> {
  try {
    // Slack's custom-app history limit is intentionally respected here: one
    // allowlisted channel, one bounded page, per discovery run. Fresh messages
    // arrive through the Events API endpoint instead of repeated polling.
    // The newest page, not the oldest. Passing `oldest` alone made Slack page
    // forward from the start of the 90-day window, so every channel with more
    // than fifteen messages in it was read from its oldest end, scan after scan:
    // on 2026-09-23 the stored copy of #care-nav-study-team stopped on Jul 24
    // while the channel ran to Sep 17. The window is applied here instead.
    const payload = await slackApi<{ messages?: SlackMessage[] }>(token, "conversations.history", {
      channel: channel.id, limit: 15,
    });
    const usable = (message: SlackMessage) => usableSlackMessage(message) && Number(message.ts) >= Number(oldest);
    // Compared against the newest message a person posted inside the window,
    // so a bot-only channel or one quiet for three months is not reported as
    // one Cortex cannot see.
    const newestInSlack = (payload.messages ?? []).find(usable)?.ts ?? null;
    const top = (payload.messages ?? []).filter(usable);
    const items: SourceItemInput[] = [];
    for (const message of top) {
      items.push(slackItem(channel, { ...message, text: await resolveMentions(token, message.text) }, await slackUserName(token, message.user)));
    }

    // Open the busiest threads. A thread with more replies is where a decision
    // got made; a thread with one is usually an acknowledgement.
    //
    // Only in channels that actually returned something. On the first real
    // ingestion twelve of twenty-one channels imported zero messages, and
    // spending the scan's thread budget opening nothing in those is what
    // starves the channels that do have traffic.
    const threads = top.length
      ? top
        .filter((message) => (message.reply_count ?? 0) > 0)
        .sort((a, b) => (b.reply_count ?? 0) - (a.reply_count ?? 0))
        .slice(0, THREADS_PER_CHANNEL)
      : [];

    let threadsRead = 0;
    let replies = 0;
    // The first thread failure, kept rather than swallowed.
    //
    // The previous version caught and discarded it, so a scan that opened
    // twenty threads and stored zero replies looked identical to a scan whose
    // threads were genuinely empty. That is exactly what the first run after
    // shipping thread reading produced, and there was nothing to read.
    let threadError: string | undefined;
    for (const parent of threads) {
      if (Date.now() >= deadline || budget.remaining <= 0) break;
      budget.remaining -= 1;
      threadsRead += 1;
      try {
        const thread = await slackApi<{ messages?: SlackMessage[] }>(token, "conversations.replies", {
          channel: channel.id, ts: parent.ts, limit: REPLIES_PER_THREAD,
        });
        // The first element is the parent again, and it is already in `items`;
        // upsert keys on external_id so a duplicate would be harmless, but
        // skipping it keeps the imported count honest.
        for (const reply of (thread.messages ?? []).filter(usable)) {
          if (reply.ts === parent.ts) continue;
          replies += 1;
          items.push(slackItem(channel, { ...reply, text: await resolveMentions(token, reply.text) }, await slackUserName(token, reply.user)));
        }
      } catch (threadFailure) {
        // One unreadable thread must not cost the rest of the channel -- but it
        // must not vanish either. Only the first is kept: twenty copies of the
        // same `ratelimited` says no more than one does.
        threadError ??= threadFailure instanceof Error ? threadFailure.message : String(threadFailure);
      }
    }

    items.push(...await attachmentItems(db, token, channel, top, deadline));
    const importedCount = await upsertSourceItems(db, items);
    // The self-check. The channel's newest message against the newest one
    // Cortex holds for it. Every silent Slack failure found on 2026-09-23 --
    // reading the oldest page, dropping attachments, a live feed that never
    // delivered -- looked like a quiet channel from the inside. Only a
    // comparison with Slack itself tells a quiet channel from a blind one.
    const { data: stored } = await db.from("war_room_source_items")
      .select("occurred_at")
      .eq("source", "slack")
      .eq("source_group", channel.label)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const newestStored = (stored as { occurred_at?: string } | null)?.occurred_at ?? null;
    const newestInSlackIso = newestInSlack ? new Date(Number(newestInSlack) * 1_000).toISOString() : null;
    return {
      imported: importedCount,
      threadsRead,
      replies,
      newestInSlack: newestInSlackIso,
      newestStored,
      ...(threadError ? { threadError } : {}),
    };
  } catch (error) {
    return { error: describeError(error) };
  }
}

export function verifySlackRequest(signature: string | null, timestamp: string | null, body: string) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Math.floor(Date.now() / 1_000) - timestampNumber) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`, "utf8").digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function ingestSlackEventEvidence(
  db: SupabaseClient,
  event: SlackMessage & { channel?: string; type?: string; channel_type?: string },
) {
  const channel = slackChannels().find((candidate) => candidate.id === event.channel);
  if (!channel || event.type !== "message" || !usableSlackMessage(event)) {
    return { accepted: false };
  }
  const occurredAt = new Date(Number(event.ts) * 1_000).toISOString();
  const token = process.env.SLACK_BOT_TOKEN;
  const authorName = token ? await slackUserName(token, event.user) : null;
  const imported = await upsertSourceItems(db, [{
    source: "slack",
    external_id: `${channel.id}:${event.ts}`,
    source_group: channel.label,
    source_kind: event.thread_ts ? "thread_reply" : "channel_message",
    title: authorName ? `#${channel.label} · ${authorName}` : `#${channel.label} conversation`,
    content: slackContent({ ...event, text: token ? await resolveMentions(token, event.text) : event.text }),
    source_url: slackMessageUrl(channel.id, event.ts as string),
    occurred_at: occurredAt,
    last_edited_at: null,
    freshness: "current",
    trust: "context",
    metadata: {
      channel_id: channel.id,
      channel_type: event.channel_type ?? null,
      user_id: event.user ?? null,
      author_name: authorName,
      thread_ts: event.thread_ts ?? null,
    },
  }]);
  await writeSourceState(db, "slack_events", { success: true, metadata: { channel_id: channel.id } });
  return { accepted: imported > 0 };
}

function richText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (!part || typeof part !== "object") return "";
    const item = part as { plain_text?: string; text?: { content?: string } };
    return item.plain_text ?? item.text?.content ?? "";
  }).join("");
}

function notionPropertyText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const property = value as Record<string, unknown>;
  const type = String(property.type || "");
  if (type === "title" || type === "rich_text") return richText(property[type]);
  if (type === "select" || type === "status") return String((property[type] as { name?: string } | null)?.name ?? "");
  if (type === "multi_select") return ((property.multi_select as Array<{ name?: string }> | undefined) ?? []).map((item) => item.name).filter(Boolean).join(", ");
  if (type === "date") {
    const date = property.date as { start?: string; end?: string } | null;
    return date?.start ? `${date.start}${date.end ? ` → ${date.end}` : ""}` : "";
  }
  if (type === "people") return ((property.people as Array<{ name?: string; person?: { email?: string } }> | undefined) ?? []).map((person) => person.name || person.person?.email).filter(Boolean).join(", ");
  if (type === "checkbox") return property.checkbox ? "Yes" : "No";
  if (type === "number") return property.number == null ? "" : String(property.number);
  if (type === "url" || type === "email" || type === "phone_number") return String(property[type] ?? "");
  if (type === "formula") return notionPropertyText(property.formula);
  return "";
}

function notionPageTitle(properties: Record<string, unknown>) {
  for (const value of Object.values(properties)) {
    const property = value as { type?: string } | null;
    if (property?.type === "title") return notionPropertyText(value) || "Untitled Notion page";
  }
  return "Untitled Notion page";
}

function notionBlockText(block: Record<string, unknown>): string {
  const type = String(block.type || "");
  const payload = block[type] as { rich_text?: unknown; caption?: unknown } | undefined;
  const text = richText(payload?.rich_text) || richText(payload?.caption);
  return text ? `${type.replaceAll("_", " ")}: ${text}` : "";
}

async function notionFetch(path: string, init?: RequestInit, timeoutMs = 20_000) {
  const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  if (!token) throw new Error("Notion token is not configured");
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, timeoutMs))),
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = (payload as { message?: string }).message || `Notion HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as Record<string, unknown>;
}

async function notionPageBody(pageId: string, timeoutMs?: number) {
  const payload = await notionFetch(`/blocks/${pageId}/children?page_size=100`, undefined, timeoutMs);
  const blocks = (payload.results as Array<Record<string, unknown>> | undefined) ?? [];
  return bounded(blocks.map(notionBlockText).filter(Boolean).join("\n"), 5_000);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * The most recent Notion meeting note for this meeting title, with its body:
 * the notes from the last time this meeting happened. For meeting prep.
 *
 * Queries the configured meeting-notes data sources directly by title (the
 * same call the sync makes), because Notion's /search did not return the
 * 6 Oct "Care seeker and provider support (Managed Ads)" note on 7 Oct 2026.
 * Notion AI notes live in a child page of the database row, so child pages
 * are read too. Falls back to /search. Null when nothing matches.
 */
const notionTitleProps = new Map<string, string>();
async function notionTitleProperty(dataSourceId: string): Promise<string | null> {
  if (notionTitleProps.has(dataSourceId)) return notionTitleProps.get(dataSourceId)!;
  const ds = await notionFetch(`/data_sources/${dataSourceId}`, undefined, 8_000);
  const props = (ds.properties as Record<string, { type?: string }> | undefined) ?? {};
  const name = Object.entries(props).find(([, v]) => v?.type === "title")?.[0] ?? null;
  if (name) notionTitleProps.set(dataSourceId, name);
  return name;
}

/**
 * A page's text, descending into nested blocks. Notion AI meeting notes are a
 * "transcription" (meeting notes) block inside the database row, with the
 * summary and notes as nested children; on 7 Oct 2026 a top-level read of the
 * 6 Oct care-seeker note returned nothing. The transcript child is skipped:
 * it is long and the summary already carries the decisions.
 */
async function notionPageBodyDeep(pageId: string, timeoutMs = 10_000): Promise<string> {
  const lines: string[] = [];
  let budget = 40; // block-children requests at most
  const walk = async (blockId: string, depth: number): Promise<void> => {
    if (budget-- <= 0 || depth > 4) return;
    const payload = await notionFetch(`/blocks/${blockId}/children?page_size=100`, undefined, timeoutMs);
    const blocks = (payload.results as Array<Record<string, unknown>> | undefined) ?? [];
    for (const block of blocks) {
      const type = String(block.type || "");
      const data = (block[type] ?? {}) as { children?: { transcript_block_id?: string } ; transcript_block_id?: string };
      const skip = new Set([data.children?.transcript_block_id, data.transcript_block_id].filter(Boolean) as string[]);
      if (skip.has(String(block.id))) continue;
      const text = notionBlockText(block);
      if (text) lines.push(text);
      if (block.has_children && type !== "child_database") {
        if (type === "transcription" || type === "meeting_notes") {
          // Read the summary and notes children; leave the transcript.
          const sub = await notionFetch(`/blocks/${String(block.id)}/children?page_size=100`, undefined, timeoutMs).catch(() => null);
          budget -= 1;
          const kids = ((sub?.results as Array<Record<string, unknown>> | undefined) ?? []);
          for (const kid of kids) {
            if (skip.has(String(kid.id))) continue;
            const kidText = notionBlockText(kid);
            if (/transcript/i.test(kidText) && kidText.length < 40) continue;
            if (kidText) lines.push(kidText);
            if (kid.has_children) await walk(String(kid.id), depth + 2).catch(() => undefined);
          }
        } else {
          await walk(String(block.id), depth + 1).catch(() => undefined);
        }
      }
      if (lines.join("\n").length > 6_000) return;
    }
  };
  await walk(pageId, 0);
  return bounded(lines.join("\n"), 6_000);
}

export async function lastNotionNoteFor(title: string): Promise<{ title: string; editedAt: string; body: string; via: string } | null> {
  if (!(process.env.NOTION_API_KEY || process.env.NOTION_TOKEN)) return null;
  const phrase = title.replace(/\s+/g, " ").trim().slice(0, 100);
  if (phrase.length < 4) return null;
  for (const source of notionSources()) {
    try {
      const prop = await notionTitleProperty(source.id);
      if (!prop) continue;
      const payload = await notionFetch(`/data_sources/${source.id}/query`, {
        method: "POST",
        body: JSON.stringify({ filter: { property: prop, title: { contains: phrase } }, sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: 3, result_type: "page" }),
      }, 10_000);
      const rows = ((payload.results as Array<Record<string, unknown>> | undefined) ?? []).filter((p) => !p.archived && !p.in_trash);
      const row = rows[0];
      if (!row) continue;
      const body = await notionPageBodyDeep(String(row.id));
      return { title: notionPageTitle((row.properties as Record<string, unknown> | undefined) ?? {}), editedAt: String(row.last_edited_time ?? ""), body, via: "data_source" };
    } catch {
      // try the next source, then search
    }
  }
  try {
    const query = phrase.replace(/[^\p{L}\p{N}&'× ]+/gu, " ").replace(/\s+/g, " ").trim();
    const payload = await notionFetch("/search", {
      method: "POST",
      body: JSON.stringify({ query, filter: { property: "object", value: "page" }, sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: 5 }),
    }, 10_000);
    const page = ((payload.results as Array<Record<string, unknown>> | undefined) ?? []).find((p) => !p.archived && !p.in_trash);
    if (!page) return null;
    const body = await notionPageBodyDeep(String(page.id));
    return { title: notionPageTitle((page.properties as Record<string, unknown> | undefined) ?? {}), editedAt: String(page.last_edited_time ?? ""), body, via: "search" };
  } catch {
    return null;
  }
}

export async function syncNotionEvidence(db: SupabaseClient) {
  const sources = notionSources();
  const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  if (!token || !sources.length) {
    return { configured: false, imported: 0, detail: "Notion reader is not configured" };
  }
  let imported = 0;
  const errors: string[] = [];
  // Discovery has two sequential model calls under a 300-second route ceiling.
  // Give Notion a shared budget rather than allowing N configured sources and
  // their page bodies to multiply 20-second timeouts without bound.
  const deadline = Date.now() + 40_000;
  for (const source of sources) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      errors.push("Source refresh stopped at its 40-second budget");
      break;
    }
    try {
      const payload = await notionFetch(`/data_sources/${source.id}/query`, {
        method: "POST",
        body: JSON.stringify({
          page_size: 8,
          result_type: "page",
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        }),
      }, remaining);
      const pages = ((payload.results as Array<Record<string, unknown>> | undefined) ?? [])
        .filter((page) => page.object === "page" && !page.archived && !page.in_trash);
      const items = await mapWithConcurrency(pages, 2, async (page): Promise<SourceItemInput> => {
        const id = String(page.id);
        const properties = (page.properties as Record<string, unknown> | undefined) ?? {};
        const propertyLines = Object.entries(properties)
          .map(([name, value]) => [name, notionPropertyText(value)] as const)
          .filter(([, value]) => Boolean(value))
          .map(([name, value]) => `${name}: ${value}`);
        const body = await notionPageBody(id, deadline - Date.now());
        const lastEditedAt = String(page.last_edited_time || page.created_time || new Date().toISOString());
        return {
          source: "notion",
          external_id: id,
          source_group: source.label,
          source_kind: source.kind,
          title: notionPageTitle(properties),
          content: [...propertyLines, body].filter(Boolean).join("\n"),
          source_url: typeof page.url === "string" ? page.url : null,
          occurred_at: String(page.created_time || lastEditedAt),
          last_edited_at: lastEditedAt,
          freshness: freshness(lastEditedAt),
          trust: "context",
          metadata: {
            data_source_id: source.id,
            archived: Boolean(page.archived),
            in_trash: Boolean(page.in_trash),
            properties: Object.fromEntries(propertyLines.map((line) => {
              const split = line.indexOf(":");
              return [line.slice(0, split), line.slice(split + 1).trim()];
            })),
          },
        };
      });
      imported += await upsertSourceItems(db, items);
      await writeSourceState(db, `notion:${source.id}`, {
        success: true,
        metadata: { label: source.label, kind: source.kind, pages: items.length },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${source.label}: ${message}`);
      await writeSourceState(db, `notion:${source.id}`, {
        error: message,
        metadata: { label: source.label, kind: source.kind },
      });
    }
  }
  return {
    configured: true,
    imported,
    detail: errors.length ? `Notion partially failed: ${errors.join("; ")}` : `${sources.length} curated data source${sources.length === 1 ? "" : "s"}`,
  };
}

type StoredSourceItem = {
  id: string;
  source: "slack" | "notion" | "archive";
  source_group: string;
  source_kind: string;
  title: string;
  content: string;
  source_url: string | null;
  occurred_at: string;
  last_edited_at: string | null;
  freshness: "current" | "aging" | "stale";
  metadata: { archived?: boolean; in_trash?: boolean } | null;
};

const EXTERNAL_CONVERSATION_SLOTS = 45;
const EXTERNAL_ARCHIVE_SLOTS = 25;

function externalEvidenceLabel(source: StoredSourceItem["source"]) {
  if (source === "slack") return "Slack";
  if (source === "notion") return "Notion";
  return "Olera record";
}

function toExternalEvidence(item: StoredSourceItem): WarRoomProposalEvidence {
  return {
    id: `external:${item.id}`,
    label: `${externalEvidenceLabel(item.source)} · ${item.title}`,
    detail: bounded(item.content, 900),
    source: `${item.source}:${item.source_group}:${item.source_kind}`,
    ...(item.source_url ? { href: item.source_url } : {}),
    occurredAt: item.last_edited_at ?? item.occurred_at,
    // Freshness is a property of "now", not of the last ingestion. Slack
    // events are normally written once, so trusting the stored label would
    // let a message remain "current" for up to 90 days.
    freshness: freshness(item.last_edited_at ?? item.occurred_at),
  };
}

/**
 * Conversation and record are fetched under separate quotas on purpose.
 *
 * The archive writes up to 80 rows per sync against Slack's handful, so a
 * single shared limit would let one busy week of SCRATCHPAD.md evict every
 * Slack and Notion row and quietly swap one blind spot for another.
 *
 * They also differ on recency. The 90-day window is right for conversation and
 * wrong for the record: a decision written down in April is still the decision.
 * Applying that window to the archive meant older documents were fetched,
 * chunked, stored, and then never returned as evidence. Freshness labelling
 * already tells the analyst how old a reading is.
 */
export async function loadExternalEvidence(db: SupabaseClient): Promise<WarRoomProposalEvidence[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const select = "id, source, source_group, source_kind, title, content, source_url, occurred_at, last_edited_at, freshness, metadata";
  const [conversation, archive] = await Promise.all([
    db.from("war_room_source_items").select(select)
      .in("source", ["slack", "notion"])
      .or(`occurred_at.gte.${since},last_edited_at.gte.${since}`)
      .order("occurred_at", { ascending: false })
      .limit(120),
    db.from("war_room_source_items").select(select)
      .eq("source", "archive")
      .order("occurred_at", { ascending: false })
      .limit(80),
  ]);
  if (conversation.error) throw conversation.error;
  // The archive is additive evidence. If its read fails, War Room should lose
  // the record and keep the conversation, not lose the scan.
  const usable = (result: typeof conversation, slots: number) => ((result.data ?? []) as StoredSourceItem[])
    .filter((item) => item.metadata?.archived !== true && item.metadata?.in_trash !== true)
    // A recently edited meeting note can have an old creation timestamp. Sort
    // the bounded candidate set by the freshest meaningful timestamp in memory
    // so current Notion context is not pushed out by newer-but-irrelevant rows.
    .sort((a, b) => (b.last_edited_at ?? b.occurred_at).localeCompare(a.last_edited_at ?? a.occurred_at))
    .slice(0, slots);

  return [
    ...usable(conversation, EXTERNAL_CONVERSATION_SLOTS),
    ...(archive.error ? [] : usable(archive, EXTERNAL_ARCHIVE_SLOTS)),
  ].map(toExternalEvidence);
}

export async function integrationStatuses(db: SupabaseClient): Promise<WarRoomIntegrationStatus[]> {
  const [{ data: states }, { data: latestItems }] = await Promise.all([
    db.from("war_room_source_state").select("source_key, last_success_at, last_error, metadata"),
    db.from("war_room_source_items").select("source, ingested_at").order("ingested_at", { ascending: false }).limit(50),
  ]);
  const stateRows = (states ?? []) as Array<{ source_key: string; last_success_at: string | null; last_error: string | null }>;
  const itemRows = (latestItems ?? []) as Array<{ source: "slack" | "notion" | "archive"; ingested_at: string }>;
  const latestFor = (source: "slack" | "notion" | "archive") => itemRows.find((item) => item.source === source)?.ingested_at ?? null;
  const stateFor = (prefix: string) => stateRows.filter((row) => row.source_key.startsWith(prefix)).sort((a, b) => (b.last_success_at || "").localeCompare(a.last_success_at || ""))[0];
  const statusFor = (configured: boolean, updatedAt: string | null): "live" | "stale" | "missing" => {
    if (!configured) return "missing";
    if (!updatedAt || Date.now() - new Date(updatedAt).getTime() > 3 * 86_400_000) return "stale";
    return "live";
  };
  const slackConfigured = Boolean(process.env.SLACK_BOT_TOKEN && slackChannels().length && process.env.SLACK_SIGNING_SECRET);
  const notionConfigured = Boolean((process.env.NOTION_API_KEY || process.env.NOTION_TOKEN) && notionSources().length);
  const slackUpdated = latestFor("slack") || stateFor("slack")?.last_success_at || null;
  const notionUpdated = latestFor("notion") || stateFor("notion:")?.last_success_at || null;
  const archiveUpdated = latestFor("archive") || stateFor("archive")?.last_success_at || null;
  const executorConfigured = Boolean(
    process.env.WAR_ROOM_GITHUB_TOKEN
    && githubRepositoryConfigured()
    && process.env.WAR_ROOM_RUNNER_CALLBACK_SECRET,
  );
  return [
    {
      key: "slack",
      label: "Slack conversations",
      status: statusFor(slackConfigured, slackUpdated),
      detail: slackConfigured ? `${slackChannels().length} allowlisted channel${slackChannels().length === 1 ? "" : "s"}; events + rotating history` : "Add a read-only bot and explicit channel allowlist",
      updatedAt: slackUpdated,
    },
    {
      key: "notion",
      label: "Notion meeting context",
      status: statusFor(notionConfigured, notionUpdated),
      detail: notionConfigured ? `${notionSources().length} allowlisted data source${notionSources().length === 1 ? "" : "s"}; stale rows remain context only` : "Share Meeting Notes and Action Items with a read-only connection",
      updatedAt: notionUpdated,
    },
    {
      key: "archive",
      label: "Olera's written record",
      status: statusFor(archiveConfigured(), archiveUpdated),
      detail: archiveConfigured()
        ? `${archivePaths().length} allowlisted path${archivePaths().length === 1 ? "" : "s"} on ${ARCHIVE_BRANCH}; dated sections are corroborating evidence`
        : "War Room cannot read SCRATCHPAD.md, docs/, or any decision already written down",
      updatedAt: archiveUpdated,
    },
    {
      key: "repository",
      label: "Repository capabilities",
      status: "live",
      detail: "A conservative repository-owned capability index prevents War Room from rediscovering known product, analytics, outreach, content, and revenue systems",
      updatedAt: null,
    },
    {
      key: "economics",
      label: "Company economics",
      status: "missing",
      detail: "Ad Boost revenue is connected; company-wide revenue, cost, burn, and runway are not consolidated, so financial conclusions stay bounded",
      updatedAt: null,
    },
    {
      key: "market",
      label: "External market",
      status: "missing",
      detail: "No approved competitor, regulatory, demographic, or search-platform feed is connected; outsider-risk questions remain explicit unknowns",
      updatedAt: null,
    },
    {
      key: "executor",
      label: "Repository executor",
      status: executorConfigured ? "live" : "missing",
      detail: executorConfigured
        ? "Approved code work can dispatch to an isolated GitHub runner"
        : "Approval is recorded, but the GitHub repository, dispatch token, or callback secret is missing",
      updatedAt: null,
    },
  ];
}

/**
 * The written record.
 *
 * War Room could read Slack and Notion but not Olera's own files, so on
 * 2026-09-20 every binding question it reported as unresolved had already been
 * answered somewhere it could not look. It rediscovered closed questions for a
 * month and then correctly declined to recommend anything on top of them.
 *
 * This reads the repository through the GitHub Contents API rather than
 * bundling files into the deployment: the token already exists for the
 * executor, the content always matches the branch, and no
 * `outputFileTracingIncludes` entry can silently fall out of date.
 *
 * It is read-only and allowlisted by path prefix, for the same reason the Slack
 * and Notion readers are: the corpus is ~4.8MB across 167 files and most of it
 * is data dumps, not decisions.
 */
const ARCHIVE_BRANCH = process.env.WAR_ROOM_ARCHIVE_BRANCH || "staging";
const MAX_ARCHIVE_FILES = 40;
const MAX_ARCHIVE_CHUNKS = 80;
const MAX_ARCHIVE_CHUNKS_PER_FILE = 12;
const MAX_ARCHIVE_FILE_BYTES = 2_000_000;
/**
 * .txt as well as .md. The default allowlist names docs/crp/living/, whose two
 * canonical grant documents are .txt; a markdown-only filter silently fetched
 * the 587-byte README in that directory instead of the 99KB of content beside
 * it, which is most of the reason this reader exists.
 */
const ARCHIVE_EXTENSIONS = [".md", ".txt"] as const;
/** Fallback block size for a document with no markdown headings to split on. */
const ARCHIVE_BLOCK_CHARS = 5_000;

/**
 * Curated priority order, not a tree walk. Earlier entries survive the file
 * bound first, so the running decision log leads and reference material
 * follows.
 */
const DEFAULT_ARCHIVE_PATHS = [
  "SCRATCHPAD.md",
  // Every slash command and script, one line each (scripts/build-capabilities-index.ts).
  // Second on purpose: the file bound keeps the first entries, and "is there
  // already a tool for X" must be answerable from the repository.
  "docs/CAPABILITIES-INDEX.md",
  // What Cortex may do alone, what it must ask, and its activity register.
  "docs/cortex/",
  "docs/war-room-operating-agent.md",
  "docs/growth/",
  "docs/crp/living/",
  "docs/crp/CANON.md",
  "docs/crp/evidence-ledger.md",
  "docs/benefits/",
  "docs/POSTMORTEMS.md",
  "docs/SYSTEMS.md",
].join(",");

type ArchivePathConfig = { prefix: string; directory: boolean };

function archivePaths(): ArchivePathConfig[] {
  return (process.env.WAR_ROOM_ARCHIVE_PATHS ?? DEFAULT_ARCHIVE_PATHS)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    // No absolute paths and no traversal: this only ever addresses repository
    // content, and the allowlist is the whole security model.
    .filter((entry) => !entry.startsWith("/") && !entry.includes(".."))
    .map((entry) => ({ prefix: entry, directory: entry.endsWith("/") }));
}

function archiveConfigured() {
  return Boolean(process.env.WAR_ROOM_GITHUB_TOKEN && githubRepositoryConfigured() && archivePaths().length);
}

async function githubArchiveFetch(path: string, timeoutMs = 20_000) {
  const token = process.env.WAR_ROOM_GITHUB_TOKEN;
  if (!token) throw new Error("War Room GitHub token is not configured");
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, timeoutMs))),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/**
 * Split a markdown document at its headings so one 1.2MB running log becomes
 * many dated entries rather than a single truncated blob.
 *
 * A heading that carries an ISO date dates its own section. That is what makes
 * freshness honest here: SCRATCHPAD.md is edited constantly, so the file's last
 * commit would mark a March decision as current. Sections with no date of their
 * own inherit the file's last commit date and are marked as inheriting it.
 */
function chunkMarkdown(path: string, body: string, fileDate: string) {
  const lines = body.split("\n");
  const chunks: Array<{ heading: string; content: string; occurredAt: string; dated: boolean; occurrence?: number }> = [];
  let heading = path.split("/").pop() || path;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length < 80) return;
    // The regex admits impossible dates like 2026-13-45, and toISOString() throws
    // a RangeError on those. One malformed heading must not kill the whole sync.
    const match = heading.match(/(20\d{2}-\d{2}-\d{2})/);
    const parsed = match ? new Date(`${match[1]}T12:00:00Z`) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime());
    chunks.push({
      heading,
      content,
      occurredAt: valid ? parsed.toISOString() : fileDate,
      dated: Boolean(valid),
    });
  };

  for (const line of lines) {
    if (/^#{2,3}\s+\S/.test(line)) {
      flush();
      heading = line.replace(/^#{2,3}\s+/, "").replace(/[*_`]/g, "").trim().slice(0, 200);
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  flush();

  // A plain-text document has no headings to split on, so everything above
  // produced a single chunk that bounded() would cut to MAX_SOURCE_CONTENT.
  // Split it into ordered blocks at paragraph boundaries instead.
  if (chunks.length <= 1 && body.length > ARCHIVE_BLOCK_CHARS) {
    const blocks: typeof chunks = [];
    // Split on single lines, not blank-line paragraphs. The grant documents are
    // PDF text extractions: 884 hard-wrapped lines and zero blank lines, so a
    // paragraph split returns the whole file as one element and the block
    // splitter silently does nothing.
    const segments = body.split(/\n/);
    let buffer = "";
    const push = () => {
      const content = buffer.trim();
      if (content.length < 80) return;
      blocks.push({
        heading: `${path.split("/").pop() || path} (part ${blocks.length + 1})`,
        content,
        occurredAt: fileDate,
        dated: false,
      });
    };
    for (const segment of segments) {
      if (buffer.length + segment.length > ARCHIVE_BLOCK_CHARS) { push(); buffer = ""; }
      buffer += (buffer ? "\n" : "") + segment;
    }
    push();
    if (blocks.length) return blocks.slice(0, MAX_ARCHIVE_CHUNKS_PER_FILE);
  }

  // Number repeats of the same heading so two sections called "Next up" get
  // distinct ids. Ordinal rather than position, so inserting a section
  // elsewhere in the file does not renumber every chunk below it.
  const headingSeen = new Map<string, number>();
  for (const chunk of chunks) {
    const nth = (headingSeen.get(chunk.heading) ?? 0) + 1;
    headingSeen.set(chunk.heading, nth);
    chunk.occurrence = nth;
  }

  return chunks
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, MAX_ARCHIVE_CHUNKS_PER_FILE);
}

type ArchiveTreeEntry = { path?: string; type?: string; size?: number; sha?: string };

async function archiveCandidatePaths(allow: ArchivePathConfig[]) {
  const tree = await githubArchiveFetch(
    `/repos/${process.env.WAR_ROOM_GITHUB_REPOSITORY}/git/trees/${encodeURIComponent(ARCHIVE_BRANCH)}?recursive=1`,
  ) as { tree?: ArchiveTreeEntry[]; truncated?: boolean };
  const entries = (tree.tree ?? []).filter((item) =>
    item.type === "blob"
    && typeof item.path === "string"
    && typeof item.sha === "string"
    && ARCHIVE_EXTENSIONS.some((ext) => (item.path as string).endsWith(ext))
    && (item.size ?? 0) <= MAX_ARCHIVE_FILE_BYTES,
  );
  // Rank by the allowlist's own order so the bound drops reference material
  // before it drops the running decision log.
  const ranked: Array<{ path: string; sha: string; rank: number }> = [];
  for (const entry of entries) {
    const path = entry.path as string;
    const rank = allow.findIndex((item) => (item.directory ? path.startsWith(item.prefix) : path === item.prefix));
    if (rank >= 0) ranked.push({ path, sha: entry.sha as string, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
  return {
    selected: ranked.slice(0, MAX_ARCHIVE_FILES).map(({ path, sha }) => ({ path, sha })),
    skipped: ranked.slice(MAX_ARCHIVE_FILES).map((item) => item.path),
    treeTruncated: Boolean(tree.truncated),
  };
}

/**
 * Read through the Git **blobs** API, not the Contents API.
 *
 * Contents caps at 1MB and, above it, returns a 200 with an empty `content`
 * rather than an error. SCRATCHPAD.md is 1.2MB, so the single most valuable
 * file in the archive would have imported as silent nothing. Blobs serves up to
 * 100MB and the tree listing already gave us every SHA.
 */
async function archiveFile(path: string, sha: string) {
  const repository = process.env.WAR_ROOM_GITHUB_REPOSITORY;
  const [blob, commits] = await Promise.all([
    githubArchiveFetch(`/repos/${repository}/git/blobs/${encodeURIComponent(sha)}`),
    githubArchiveFetch(`/repos/${repository}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(ARCHIVE_BRANCH)}&per_page=1`),
  ]);
  const payload = blob as { content?: string; encoding?: string };
  if (payload.encoding !== "base64" || !payload.content) throw new Error(`Unreadable archive blob for ${path}`);
  const body = Buffer.from(payload.content, "base64").toString("utf8");
  if (!body.trim()) throw new Error(`Empty archive file ${path}`);
  const commitList = commits as Array<{ commit?: { committer?: { date?: string } } }>;
  const fileDate = commitList[0]?.commit?.committer?.date ?? new Date().toISOString();
  const url = `https://github.com/${repository}/blob/${ARCHIVE_BRANCH}/${path}`;
  return { body, fileDate, url };
}

export async function syncArchiveEvidence(db: SupabaseClient) {
  const allow = archivePaths();
  if (!archiveConfigured()) {
    await writeSourceState(db, "archive", { error: "Archive reader is not configured", success: false }).catch(() => {});
    return { configured: false, imported: 0, detail: "Set WAR_ROOM_GITHUB_TOKEN, WAR_ROOM_GITHUB_REPOSITORY and WAR_ROOM_ARCHIVE_PATHS" };
  }
  const syncStartedAt = new Date().toISOString();
  try {
    const { selected, skipped, treeTruncated } = await archiveCandidatePaths(allow);
    const files = await mapWithConcurrency(selected, 4, async ({ path, sha }) => {
      try {
        return { path, ...(await archiveFile(path, sha)) };
      } catch {
        return null;
      }
    });

    const chunks = files
      .filter((file): file is { path: string; body: string; fileDate: string; url: string } => file !== null)
      .flatMap((file) => chunkMarkdown(file.path, file.body, file.fileDate)
        .map((chunk, index) => ({ ...chunk, path: file.path, url: file.url, index })))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, MAX_ARCHIVE_CHUNKS);

    const items: SourceItemInput[] = chunks.map((chunk) => ({
      source: "archive" as const,
      // Keyed on the heading, not the position. A positional id silently remaps
      // every row below an inserted section on the next sync.
      external_id: `${chunk.path}#${createHash("sha256").update(chunk.heading).digest("hex").slice(0, 16)}-${chunk.occurrence ?? 1}`,
      source_group: chunk.path,
      source_kind: chunk.path === "SCRATCHPAD.md" ? "session_log" : "document",
      title: `${chunk.path} · ${chunk.heading}`,
      content: chunk.content,
      source_url: chunk.url,
      occurred_at: chunk.occurredAt,
      last_edited_at: chunk.occurredAt,
      freshness: freshness(chunk.occurredAt),
      // The repository is Olera's own reviewed record, not third-party chatter.
      // It corroborates; it is not merely ambient context.
      trust: "corroborated" as const,
      metadata: {
        path: chunk.path,
        heading: chunk.heading,
        branch: ARCHIVE_BRANCH,
        // A section with no date of its own inherited the file's commit date.
        // Say so, so an old decision under an undated heading is not read as
        // current work merely because the file was touched yesterday.
        date_source: chunk.dated ? "heading" : "file_commit",
      },
    }));

    const imported = await upsertSourceItems(db, items);
    // Drop what this sync did not rewrite. A section deleted from a file, or a
    // path dropped from the allowlist, would otherwise stay citable forever.
    // Every upserted row carries this run's ingested_at, so anything older is
    // by definition no longer in the archive. Best-effort: the import already
    // succeeded and must still be reported.
    if (imported) {
      await db.from("war_room_source_items")
        .delete()
        .eq("source", "archive")
        .lt("ingested_at", syncStartedAt)
        .then(() => undefined, () => undefined);
    }
    await writeSourceState(db, "archive", {
      success: true,
      error: null,
      metadata: { files: selected.length, skipped, chunks: imported, tree_truncated: treeTruncated, branch: ARCHIVE_BRANCH },
    });
    return { configured: true, imported, files: selected.length, skipped: skipped.length, detail: null as string | null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Archive sync failed";
    await writeSourceState(db, "archive", { error: detail, success: false });
    // A source failure must never fail the scan that depends on it. Evidence
    // coverage drops honestly instead.
    return { configured: true, imported: 0, detail };
  }
}
