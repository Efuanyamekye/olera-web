/**
 * "send that to Logan", "post that in #general": the founder's words go to
 * anyone or any channel in Olera's Slack, sent by the system on his explicit
 * command, never by the model.
 *
 * TJ, 2026-09-28: Cortex drafted a context note for Logan and said "I can't
 * send Logan anything", so he pasted it into Slack by hand. "We need that."
 * Then: "it's not just Logan. I want to send it to various channels and so
 * forth. We need latitude on basically all of Slack."
 *
 * Names are resolved live against the workspace (users.list and
 * conversations.list), so anyone who joins is reachable without a code change.
 * A name that matches more than one person sends nothing and lists them. The
 * message goes out as the Cortex app, headed "From TJ", so nobody mistakes
 * whose words they are, and the reply to him quotes exactly what went where.
 */

export type SlackSendCommand = { target: string; text: string | null };

const TARGET = String.raw`(#[\w.-]+|@?[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*)?)`;
const WITH_TEXT = new RegExp(String.raw`^(?:send|post|message|tell|dm)\s+(?:to\s+|in\s+)?${TARGET}\s*:\s*([\s\S]+)$`, "i");
const DRAFTED = new RegExp(String.raw`^(?:(?:ok(?:ay)?|yes|great)[,.!]?\s+)?(?:send|post)\s+(?:that|it|this|the (?:note|message|draft))\s+(?:to|in|into)\s+${TARGET}(?:\s+(?:now|please))?[.!]?$`, "i");

/**
 * "send to Logan: <text>", "post in #general: <text>" send the text as written.
 * "send that to Logan", "post it in #general" send the note Cortex just
 * drafted (text: null). Only at the start of a message; "should I send that
 * to Logan?" is a question.
 */
export function parseTeamMessage(text: string): SlackSendCommand | null {
  const trimmed = text.trim();
  const withText = trimmed.match(WITH_TEXT);
  if (withText) return { target: withText[1].trim(), text: withText[2].trim() };
  const drafted = trimmed.match(DRAFTED);
  // Names may hold a dot (chris.a), so a sentence's closing period lands in the match.
  if (drafted) return { target: drafted[1].trim().replace(/[.!]+$/, ""), text: null };
  return null;
}

/**
 * The note Cortex drafted, from its last message. Cortex is told to put a
 * note meant for someone else in double quotes. Null when there is none, so
 * nothing is guessed at and sent.
 */
export function draftedNote(cortexMessage: string): string | null {
  // Whole paragraphs that open and close with a quote mark, so a word quoted
  // inside the note ("what "preferred" means") cannot end it early. Matching
  // quote to quote did exactly that: half a note would have gone to Logan.
  const blocks = cortexMessage.split(/\n\s*\n/).map((block) => block.trim());
  const start = blocks.findIndex((block) => /^["“]/.test(block));
  if (start >= 0) {
    for (let end = start; end < blocks.length; end += 1) {
      if (/["”][.!?]?$/.test(blocks[end]) && (end > start || blocks[start].length > 1)) {
        const note = blocks.slice(start, end + 1).join("\n\n").replace(/^["“]/, "").replace(/["”][.!?]?$/, "").trim();
        if (note.length >= 20) return note;
        break;
      }
    }
  }
  // A short note quoted inline: "…here it is: "Running 5 late"." Only when it
  // holds no quote marks of its own, so nothing is cut in half.
  const inline = [...cortexMessage.matchAll(/["“]([^"“”\n]{20,})["”]/g)].map((match) => match[1].trim());
  return inline.length ? inline.sort((a, b) => b.length - a.length)[0] : null;
}

export function teamMessageText(text: string): string {
  // The Cortex app's DM is one-way (Slack's messages tab is off), so say where a reply goes.
  return `*From TJ* (sent through Cortex; reply to TJ directly):\n\n${text}`;
}

// ---------------------------------------------------------------------------
// Resolving a name to a Slack id

export type SlackUser = { id: string; name: string; realName: string; displayName: string; deleted?: boolean; isBot?: boolean };
export type SlackChannel = { id: string; name: string; isPrivate: boolean };
export type Resolved =
  | { ok: true; id: string; label: string; channel?: SlackChannel }
  | { ok: false; reason: string };

const norm = (value: string) => value.toLowerCase().replace(/^[@#]/, "").trim();

/** Pure: the one person or channel a name means, or why it can't be sent. */
export function pickTarget(target: string, users: SlackUser[], channels: SlackChannel[]): Resolved {
  const wanted = norm(target);
  if (target.startsWith("#")) {
    const channel = channels.find((c) => c.name.toLowerCase() === wanted);
    return channel
      ? { ok: true, id: channel.id, label: `#${channel.name}`, channel }
      : { ok: false, reason: `I can't see a channel called #${wanted} (a private one needs /invite @Cortex first)` };
  }
  const people = users.filter((u) => !u.deleted && !u.isBot);
  const exact = people.filter((u) => [u.displayName, u.realName, u.name].some((n) => n && n.toLowerCase() === wanted));
  const first = people.filter((u) => [u.realName, u.displayName].some((n) => n && n.toLowerCase().split(/\s+/)[0] === wanted));
  const matches = exact.length ? exact : first;
  if (matches.length === 1) return { ok: true, id: matches[0].id, label: matches[0].realName || matches[0].displayName || matches[0].name };
  if (matches.length > 1) {
    return { ok: false, reason: `"${target}" matches ${matches.length} people (${matches.map((u) => u.realName || u.name).join(", ")}); use the full name` };
  }
  // A bare word that is a channel name ("post it in general").
  const channel = channels.find((c) => c.name.toLowerCase() === wanted);
  if (channel) return { ok: true, id: channel.id, label: `#${channel.name}`, channel };
  return { ok: false, reason: `I can't find anyone called "${target}" in Olera's Slack` };
}

// ---------------------------------------------------------------------------
// The Slack calls

type SlackPayload = { ok?: boolean; error?: string; needed?: string; response_metadata?: { next_cursor?: string } };

async function slack<T>(token: string, method: string, body: Record<string, string>): Promise<SlackPayload & T> {
  // Form-encoded: accepted by every Web API method (see sources.server.ts).
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  return await response.json() as SlackPayload & T;
}

/** A Slack failure in words he can act on, including the permission it needs. */
export function slackErrorText(payload: SlackPayload, label: string): string {
  switch (payload.error) {
    case "missing_scope": return `the Cortex Slack app needs the "${payload.needed ?? "?"}" permission (add it in the app's Slack settings, then reinstall)`;
    case "not_in_channel": return `Cortex isn't in ${label}; type /invite @Cortex there, then send again`;
    case "channel_not_found": return `Cortex can't see ${label} (a private channel needs /invite @Cortex first)`;
    case "is_archived": return `${label} is archived`;
    default: return payload.error ?? "Slack refused it";
  }
}

async function listAll<T>(token: string, method: string, key: string, body: Record<string, string>): Promise<{ items: T[]; error?: SlackPayload }> {
  const items: T[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const payload = await slack<Record<string, T[]>>(token, method, { ...body, limit: "1000", ...(cursor ? { cursor } : {}) });
    if (!payload.ok) return { items, error: payload };
    items.push(...((payload[key] as T[] | undefined) ?? []));
    cursor = payload.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return { items };
}

/** Resolve the name, then post. Returns where it went, or why nothing went. */
export async function sendToSlack(target: string, text: string, token = process.env.SLACK_BOT_TOKEN): Promise<{ success: true; label: string } | { success: false; error: string }> {
  if (!token) return { success: false, error: "SLACK_BOT_TOKEN is not set" };
  type RawUser = { id: string; name: string; deleted?: boolean; is_bot?: boolean; real_name?: string; profile?: { real_name?: string; display_name?: string } };
  type RawChannel = { id: string; name: string; is_private?: boolean };
  const wantsChannel = target.startsWith("#");
  const [users, channels] = await Promise.all([
    wantsChannel ? Promise.resolve({ items: [] as RawUser[] } as { items: RawUser[]; error?: SlackPayload }) : listAll<RawUser>(token, "users.list", "members", {}),
    listAll<RawChannel>(token, "conversations.list", "channels", { types: "public_channel,private_channel", exclude_archived: "true" }),
  ]);
  // Say which permission is missing rather than "no one by that name".
  const needed = wantsChannel ? channels.error : users.error;
  if (needed && needed.error === "missing_scope") return { success: false, error: slackErrorText(needed, target) };
  const resolved = pickTarget(
    target,
    users.items.map((u) => ({ id: u.id, name: u.name, realName: u.profile?.real_name || u.real_name || "", displayName: u.profile?.display_name || "", deleted: u.deleted, isBot: u.is_bot || u.id === "USLACKBOT" })),
    channels.items.map((c) => ({ id: c.id, name: c.name, isPrivate: Boolean(c.is_private) })),
  );
  if (!resolved.ok) return { success: false, error: resolved.reason };
  let posted = await slack(token, "chat.postMessage", { channel: resolved.id, text: teamMessageText(text) });
  // A public channel Cortex hasn't joined: join it once, then post.
  if (!posted.ok && posted.error === "not_in_channel" && resolved.channel && !resolved.channel.isPrivate) {
    const joined = await slack(token, "conversations.join", { channel: resolved.id });
    if (joined.ok) posted = await slack(token, "chat.postMessage", { channel: resolved.id, text: teamMessageText(text) });
  }
  return posted.ok ? { success: true, label: resolved.label } : { success: false, error: slackErrorText(posted, resolved.label) };
}
