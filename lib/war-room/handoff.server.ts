import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "hand this off": Cortex writes a brief for a Claude Code session.
 *
 * TJ, 2026-09-28, after Cortex listed five Benefits Finder lessons and said
 * "Nothing I can call writes these down, so they live in this chat until you
 * drop them in the branch notes or hand them to Jade": "It would be good if
 * Cortex had that ability so I don't have to keep copying and pasting."
 *
 * Cortex runs on Vercel and cannot reach his Mac, where Jade's briefs live, so
 * its briefs go to cortex_handoffs (migration 265). His /handoff skill lists
 * them next to Jade's and closes them with the PR URL, which Cortex then sees
 * in its record ("that shipped in #2250"). The system writes the row, never the
 * model, so Cortex cannot say it saved something that was not saved.
 */

export type Handoff = {
  id: string;
  title: string;
  body: string;
  repo: string;
  status: "open" | "partial" | "done" | "dropped";
  result: string | null;
  created_at: string;
  closed_at: string | null;
};

/**
 * "hand this off", "handoff: the ZIP fix", "note this for later". Returns his
 * note ("" when there is none), or null when the message is not the command.
 * Only at the start: "should we hand this off to Logan?" is a question.
 */
export function handoffNote(text: string): string | null {
  const match = text.trim().match(/^(?:\/?handoff|hand\s+(?:this|that|it)\s+off|hand\s+off(?:\s+(?:this|that|it))?|(?:note|save|write)\s+(?:this|that|it)\s+(?:down\s+)?for\s+later)(?=$|[\s:,.!-])[\s:,.!-]*([\s\S]*)$/i);
  if (!match) return null;
  return match[1].trim();
}

/** What Cortex is asked to write. Its brief mode has the record and the lookups, so evidence is real. */
export function handoffQuestion(note: string): string {
  return `Write a handoff brief for a Claude Code session that will do this work in the olera-web repo. It reads only this brief, not our chat, so it must stand on its own.${note ? ` He says the brief is about: ${note}` : " It is about the subject of our last exchange."}

Format, in Markdown:
# <a title of under ten words>
**Raised:** <today's date>, from Telegram.
## What he asked
His own words, quoted, and what he wants done.
## What happened
The facts behind it: names, numbers, dates, ids, file paths, PR numbers, each as the record or a lookup gave it. Say plainly where something is unverified or where you were wrong earlier in the chat.
## What's decided
Only what he decided. Nothing he did not say.
## Open questions
What the session must ask him before building.
## Done when
What finished looks like.

Rules: no invented facts, no filler, no em dashes. Leave out anything a session cannot act on. Refer to families by case or phone ending, never by full name.`;
}

/** The title is the brief's first heading; a brief with none gets his note or a dated fallback. */
export function handoffTitle(body: string, note: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || note.split("\n")[0] || `Handoff from Telegram, ${new Date().toISOString().slice(0, 10)}`).slice(0, 140);
}

export async function saveHandoff(db: SupabaseClient, args: { body: string; note: string; chatId: string }): Promise<Handoff> {
  const { data, error } = await db.from("cortex_handoffs")
    .insert({ title: handoffTitle(args.body, args.note), body: args.body, repo: "olera-web", status: "open", note: args.note || null, chat_id: args.chatId })
    .select("*")
    .single();
  if (error) throw new Error(error.code === "42P01" ? "the handoffs table isn't there yet (migration 265)" : error.message);
  return data as Handoff;
}

/** For Cortex's record: what is waiting on a session, and what came back in the last two weeks. */
export async function recentHandoffs(db: SupabaseClient): Promise<Array<Pick<Handoff, "title" | "status" | "result" | "created_at" | "closed_at">>> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await db.from("cortex_handoffs")
    .select("title, status, result, created_at, closed_at")
    .or(`status.in.(open,partial),closed_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) return [];
  return (data ?? []) as Array<Pick<Handoff, "title" | "status" | "result" | "created_at" | "closed_at">>;
}

export function handoffSavedReply(handoff: Handoff): string {
  return `Handed off: "${handoff.title}". It's waiting for the next /handoff in Claude Code (id ${handoff.id.slice(0, 8)}). I'll see it here when a session closes it.`;
}
