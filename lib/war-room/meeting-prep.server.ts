import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackDirectMessage } from "@/lib/slack";
import { loadCalendarEvents } from "@/lib/war-room/calendar.server";
import { loadProviderTimeline, timelineToMarkdown } from "@/lib/touches/timeline.server";
import { externalAttendees, needsPrep, prepKey, whenText, PREP_WINDOW_HOURS, type CalendarEvent, type ExternalPerson } from "@/lib/war-room/meeting-prep";

/**
 * Meeting prep, the server side (slice 5). Every cortex-tick (three-hourly)
 * reads the founder's calendar for the next six hours; for each meeting with
 * someone outside the company it gathers what Olera already knows about
 * them and sends him one direct message: who, the last touches, open
 * promises, and the one question to ask. Founder only, never #cortex.
 *
 * What it reads, per outside person:
 *   - a business profile with their email or their company domain, and
 *     that provider's timeline (lib/touches: touches, support@ mail, texts)
 *   - otherwise, support@ threads they wrote in (subjects and summaries)
 * Nothing is sent to the attendee. One Haiku call per meeting.
 * Each note is keyed in cortex_posts (meetprep:<event>:<start>) so a
 * meeting is prepped once however many ticks see it.
 */

const CONSUMER = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "comcast.net"]);
const MAX_CONTEXT = 9_000;

async function profileFor(db: SupabaseClient, person: ExternalPerson): Promise<{ id: string; name: string } | null> {
  const byEmail = await db.from("business_profiles").select("id, display_name").ilike("email", person.email).limit(1).maybeSingle();
  if (byEmail.data) return { id: String(byEmail.data.id), name: String(byEmail.data.display_name ?? "") };
  if (CONSUMER.has(person.domain)) return null;
  const byDomain = await db.from("business_profiles").select("id, display_name").ilike("email", `%@${person.domain}`).limit(1).maybeSingle();
  return byDomain.data ? { id: String(byDomain.data.id), name: String(byDomain.data.display_name ?? "") } : null;
}

async function supportThreadsFrom(db: SupabaseClient, person: ExternalPerson): Promise<string | null> {
  const { data: msgs } = await db.from("support_email_messages")
    .select("thread_id, internal_date").ilike("from_email", person.email)
    .order("internal_date", { ascending: false }).limit(20);
  const ids = [...new Set(((msgs ?? []) as Array<{ thread_id: string }>).map((m) => m.thread_id))].slice(0, 4);
  if (!ids.length) return null;
  const { data: threads } = await db.from("support_email_threads").select("subject, agent_summary, last_message_at, state").in("id", ids);
  return ((threads ?? []) as Array<{ subject: string; agent_summary: string | null; last_message_at: string; state: string }>)
    .map((t) => `- ${t.last_message_at.slice(0, 10)} "${t.subject}" (${t.state}): ${t.agent_summary ?? ""}`).join("\n");
}

export async function contextFor(db: SupabaseClient, person: ExternalPerson): Promise<string> {
  const parts: string[] = [`## ${person.name} <${person.email}>`];
  const profile = await profileFor(db, person).catch(() => null);
  if (profile) {
    const timeline = await loadProviderTimeline(profile.id).catch(() => null);
    parts.push(timeline ? timelineToMarkdown(timeline).slice(0, 5_000) : `Olera provider account: ${profile.name} (no timeline could be read).`);
  }
  const threads = await supportThreadsFrom(db, person).catch(() => null);
  if (threads) parts.push(`Support inbox threads they wrote in:\n${threads}`);
  if (parts.length === 1) parts.push("Nothing on file: no provider account and no support@ mail from this address.");
  return parts.join("\n\n");
}

async function writeNote(event: CalendarEvent, people: ExternalPerson[], context: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reply = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: [
      "You prepare TJ Falohun, founder of Olera (a senior-care marketplace and benefits guide), for a meeting in the next few hours. Write a Slack message for him only.",
      "Shape, plain text, Slack mrkdwn single asterisks for bold, no headers: one line on who they are and what they are to Olera; then up to three short lines of the most recent touches with dates; then any open promise (something TJ or Olera said it would do, or something they asked that has no answer), or 'No open promises on file'; then 'Ask:' and the one question that would move this relationship forward.",
      "Use only the record given. If the record is empty, say so in one line and suggest the one question to open with. Never invent history, numbers or commitments. No em dashes. Under 130 words.",
    ].join("\n"),
    messages: [{ role: "user", content: `MEETING: ${event.summary ?? "(no title)"}\nWITH: ${people.map((p) => `${p.name} <${p.email}>`).join(", ")}\n\nRECORD:\n${context.slice(0, MAX_CONTEXT)}` }],
  }, { timeout: 25_000, maxRetries: 0 });
  return reply.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim() || null;
}

export type PrepOutcome = { key: string; title: string; sent: boolean; error?: string };

/** Prep every external meeting in the next window that has not been prepped. */
export async function prepareMeetings(db: SupabaseClient, now: Date = new Date()): Promise<{ checked: number; outcomes: PrepOutcome[]; unavailable?: string }> {
  const founder = process.env.WAR_ROOM_BRIEF_SLACK_USER_ID?.trim();
  if (!founder) return { checked: 0, outcomes: [], unavailable: "WAR_ROOM_BRIEF_SLACK_USER_ID not set" };
  const read = await loadCalendarEvents(db, now.toISOString(), new Date(now.getTime() + PREP_WINDOW_HOURS * 3_600_000).toISOString());
  if ("unavailable" in read) return { checked: 0, outcomes: [], unavailable: read.unavailable };
  const due = (read.events as CalendarEvent[]).filter((e) => needsPrep(e, now));
  const outcomes: PrepOutcome[] = [];
  for (const event of due) {
    const key = prepKey(event);
    const { data: done } = await db.from("cortex_posts").select("id, slack_ts").eq("key", key).maybeSingle();
    if (done?.slack_ts) continue;
    const people = externalAttendees(event);
    const context = (await Promise.all(people.slice(0, 4).map((p) => contextFor(db, p)))).join("\n\n");
    const note = await writeNote(event, people, context).catch(() => null);
    const title = event.summary ?? "(no title)";
    const text = `*Prep: ${title}*, ${event.start?.dateTime ? whenText(event.start.dateTime) : ""}\n${note ?? `With ${people.map((p) => p.name).join(", ")}. I could not write the note this time; nothing on file was read.`}`;
    const sent = await sendSlackDirectMessage(founder, text);
    const row = { kind: "meeting_prep", key, channel: `dm:${founder}`, text, thread_ts: null, slack_ts: sent.success ? sent.ts ?? "sent" : null, error: sent.success ? null : sent.error ?? "failed" };
    if (done) await db.from("cortex_posts").update(row).eq("id", done.id);
    else await db.from("cortex_posts").insert(row);
    outcomes.push({ key, title, sent: sent.success, error: sent.success ? undefined : sent.error });
  }
  return { checked: due.length, outcomes };
}
