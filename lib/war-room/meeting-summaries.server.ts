import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { postOnce, initiativeThread, CORTEX_CHANNEL } from "@/lib/war-room/cortex-voice.server";

/**
 * Meeting notes become a short post, action items first.
 *
 * TJ, 6 Oct 2026: when meeting notes land in the Notion database, Cortex
 * should send a concise summary to the relevant channel, emphasis on action
 * items. The notes already reach war_room_source_items through the Notion
 * reader (sources.server.ts), so this reads them from there: no second Notion
 * client, same page ids, and a page edited later is a new version of the same
 * key only when its content changed.
 *
 * Channel routing: CORTEX_MEETING_CHANNELS="benefits=#senior-benefits-planner,
 * careseeker=#careseeker-support" matches a word in the title; anything else
 * goes to #cortex under the Meetings thread. Keep the map small; a wrong
 * channel is worse than one channel.
 */

const MODEL = "claude-haiku-4-5";
const MAX_NOTE_CHARS = 24_000;

type SourceItem = { id: string; external_id: string; title: string | null; content: string; source_url: string | null; occurred_at: string; last_edited_at: string | null };

function routeChannel(title: string): string {
  const map = (process.env.CORTEX_MEETING_CHANNELS ?? "").split(",").map((e) => e.trim()).filter(Boolean)
    .map((e) => e.split("=").map((p) => p.trim()) as [string, string]);
  const t = title.toLowerCase();
  for (const [word, channel] of map) if (word && channel && t.includes(word.toLowerCase())) return channel;
  return CORTEX_CHANNEL();
}

export async function summarizeMeeting(title: string, content: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: [
      "You write the Slack post Olera's team reads instead of the meeting notes. Plain text with Slack formatting only (*bold*, • bullets). No headers, no em dashes.",
      "Shape: one line on what the meeting was and decided. Then *Action items*, one bullet each: owner first, then the action, then a date if one was said. Then at most three bullets of what else matters. Under 180 words.",
      "Name people as the notes name them. Do not invent owners or dates. If the notes have no action items, say so in one line.",
    ].join("\n"),
    messages: [{ role: "user", content: `Meeting: ${title}\n\nNotes:\n${content.slice(0, MAX_NOTE_CHARS)}` }],
  });
  const text = response.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  return text || "Notes landed but had nothing I could summarise.";
}

/** Summarise meeting notes synced in the last `days` that have not been posted. */
export async function postMeetingSummaries(db: SupabaseClient, days = 7): Promise<{ posted: number; skipped: number; errors: string[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db.from("war_room_source_items")
    .select("id, external_id, title, content, source_url, occurred_at, last_edited_at")
    .eq("source", "notion")
    .eq("source_kind", "meeting_notes")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(10);
  if (error) return { posted: 0, skipped: 0, errors: [error.message] };
  const items = (data ?? []) as SourceItem[];
  let posted = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const item of items) {
    const key = `meeting:${item.external_id}`;
    const { data: done } = await db.from("cortex_posts").select("id").eq("key", key).not("slack_ts", "is", null).maybeSingle();
    if (done) { skipped += 1; continue; }
    if (!item.content || item.content.trim().length < 200) { skipped += 1; continue; }
    try {
      const title = item.title?.trim() || "Meeting";
      const summary = await summarizeMeeting(title, item.content);
      const channel = routeChannel(title);
      const when = new Date(item.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const text = `*${title}* (${when})${item.source_url ? ` · <${item.source_url}|notes>` : ""}\n${summary}`;
      const threadTs = channel === CORTEX_CHANNEL()
        ? await initiativeThread(db, "meetings", "*Meetings.* When notes land in Notion I post the summary here, action items first.")
        : null;
      const out = await postOnce(db, { kind: "meeting_summary", key, text, channel, threadTs });
      if (out.posted) posted += 1; else if (out.error) errors.push(`${title}: ${out.error}`);
    } catch (err) {
      errors.push(`${item.title ?? item.external_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { posted, skipped, errors };
}
