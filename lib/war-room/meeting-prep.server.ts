import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCalendarEvents } from "@/lib/war-room/calendar.server";
import { loadProviderTimeline, timelineToMarkdown } from "@/lib/touches/timeline.server";
import { lastNotionNoteFor } from "@/lib/war-room/sources.server";
import { postAsCortex } from "@/lib/war-room/team-messages.server";
import { CORTEX_CHANNEL } from "@/lib/war-room/cortex-voice.server";
import {
  attendeesOf,
  externalAttendees,
  needsPrep,
  noteMatchesMeeting,
  prepKey,
  routeMeeting,
  whenText,
  PREP_WINDOW_HOURS,
  type CalendarEvent,
  type Person,
} from "@/lib/war-room/meeting-prep";

/**
 * Meeting prep, the server side (slice 5). Every cortex-tick (three-hourly)
 * reads TJ's work calendar (tj@olera.care) for the next six hours. Each
 * meeting he is on, except MedJobs, staffing and HR, gets one post in the
 * channel it belongs to (lib/war-room/meeting-prep.ts routeMeeting), written
 * for everyone attending: what the meeting is for, what happened last time,
 * what the outside people are to Olera, open promises, and the questions to
 * settle. A private channel Cortex is not in gets the post in #cortex with a
 * line saying so.
 *
 * What it reads:
 *   - the invite's own description
 *   - the last Notion meeting note with this title (the Meeting Notes database)
 *   - per outside attendee: a business profile by email or company domain and
 *     that provider's timeline (touches, support@ mail, texts); else the
 *     support@ threads they wrote in; else "nothing on file"
 * One Haiku call per meeting. Keyed in cortex_posts (meetprep:<event>:<start>)
 * so a meeting is prepped once however many ticks see it.
 */

const CONSUMER = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "me.com", "live.com", "msn.com", "comcast.net"]);
const MAX_CONTEXT = 10_000;

async function profileFor(db: SupabaseClient, person: Person): Promise<{ id: string; name: string } | null> {
  const byEmail = await db.from("business_profiles").select("id, display_name").ilike("email", person.email).limit(1).maybeSingle();
  if (byEmail.data) return { id: String(byEmail.data.id), name: String(byEmail.data.display_name ?? "") };
  if (CONSUMER.has(person.domain)) return null;
  const byDomain = await db.from("business_profiles").select("id, display_name").ilike("email", `%@${person.domain}`).limit(1).maybeSingle();
  return byDomain.data ? { id: String(byDomain.data.id), name: String(byDomain.data.display_name ?? "") } : null;
}

async function supportThreadsFrom(db: SupabaseClient, person: Person): Promise<string | null> {
  const { data: msgs } = await db.from("support_email_messages")
    .select("thread_id, internal_date").ilike("from_email", person.email)
    .order("internal_date", { ascending: false }).limit(20);
  const ids = [...new Set(((msgs ?? []) as Array<{ thread_id: string }>).map((m) => m.thread_id))].slice(0, 4);
  if (!ids.length) return null;
  const { data: threads } = await db.from("support_email_threads").select("subject, agent_summary, last_message_at, state").in("id", ids);
  return ((threads ?? []) as Array<{ subject: string; agent_summary: string | null; last_message_at: string; state: string }>)
    .map((t) => `- ${t.last_message_at.slice(0, 10)} "${t.subject}" (${t.state}): ${t.agent_summary ?? ""}`).join("\n");
}

/** What Olera knows about one outside person. */
export async function contextFor(db: SupabaseClient, person: Person): Promise<string> {
  const parts: string[] = [`## ${person.name} <${person.email}>`];
  const profile = await profileFor(db, person).catch(() => null);
  if (profile) {
    const timeline = await loadProviderTimeline(profile.id).catch(() => null);
    parts.push(timeline ? timelineToMarkdown(timeline).slice(0, 4_000) : `Olera provider account: ${profile.name} (no timeline could be read).`);
  }
  const threads = await supportThreadsFrom(db, person).catch(() => null);
  if (threads) parts.push(`Support inbox threads they wrote in:\n${threads}`);
  if (parts.length === 1) parts.push("Nothing on file: no provider account and no support@ mail from this address.");
  return parts.join("\n\n");
}

/** The whole record for one meeting. */
export async function meetingContext(db: SupabaseClient, event: CalendarEvent): Promise<string> {
  const people = attendeesOf(event);
  const external = externalAttendees(event);
  const [lastNote, outside] = await Promise.all([
    lastNotionNoteFor(event.summary ?? "").catch(() => null),
    Promise.all(external.slice(0, 4).map((p) => contextFor(db, p))),
  ]);
  const note = lastNote && noteMatchesMeeting(event.summary ?? "", lastNote.title, lastNote.editedAt, new Date()) ? lastNote : null;
  const description = (event.description ?? "").replace(/----\( Video Call \)----[\s\S]*?---===---/g, "").replace(/https?:\/\/\S+/g, "").trim();
  return [
    `ATTENDEES: TJ Falohun (Olera founder), ${people.map((p) => `${p.name}${p.team ? " (Olera team)" : " (outside Olera)"}`).join(", ")}`,
    external.length ? "" : "NO OUTSIDE ATTENDEES: everyone on this meeting is Olera.",
    description ? `INVITE DESCRIPTION:\n${description.slice(0, 1_500)}` : "",
    note ? `LAST TIME (Notion note "${note.title}", edited ${note.editedAt.slice(0, 10)}):\n${note.body.slice(0, 3_500)}` : "LAST TIME: no Notion note found for this meeting.",
    outside.length ? `OUTSIDE ATTENDEES:\n${outside.join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function writeNote(event: CalendarEvent, context: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reply = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system: [
      "You prepare Olera's team for a meeting later today. Olera is a senior-care marketplace and benefits guide. The post goes in the team's Slack channel and is read by everyone attending, not only the founder.",
      "Plain text, Slack mrkdwn single asterisks for bold, no headers, short lines. In this order: one line on what the meeting is for, from the title and invite only; *Last time:* the decisions and action items from the LAST TIME note, with the owners the note names, marking any that look unfinished, or 'No notes from last time.' when there is no note; *From outside:* one line per OUTSIDE attendee on what they are to Olera and the most recent touch (leave this line out entirely when there are no outside attendees; Olera team members and TJ are never outside); *Open promises:* only promises written in the record, or 'None on file'; *To settle:* two or three questions this meeting should answer, phrased for the attendees.",
      "Use only the record given. Never invent history, numbers, commitments, action items or owners; never attribute a task to someone the record does not name. When the record is thin, say less. Family members are first name only. No em dashes. Under 160 words.",
    ].join("\n"),
    messages: [{ role: "user", content: `MEETING: ${event.summary ?? "(no title)"}\n\n${context.slice(0, MAX_CONTEXT)}` }],
  }, { timeout: 25_000, maxRetries: 0 });
  return reply.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim() || null;
}

/** The prep text for one event, without posting it: for review before it goes out. */
export async function draftPrep(db: SupabaseClient, event: CalendarEvent): Promise<{ channel: string; text: string; context: string }> {
  const route = routeMeeting(event);
  const context = await meetingContext(db, event);
  const note = await writeNote(event, context).catch(() => null);
  const header = `*Prep: ${event.summary ?? "(no title)"}*, ${event.start?.dateTime ? whenText(event.start.dateTime) : ""}`;
  return { channel: route.channel?.name ?? "#cortex", text: `${header}\n${note ?? "(no note written)"}`, context };
}

export type PrepOutcome = { key: string; title: string; channel: string; sent: boolean; fallback?: boolean; error?: string };

/** Write and post the prep for one event. Idempotent by key unless forced. */
export async function prepOne(db: SupabaseClient, event: CalendarEvent, opts: { force?: boolean } = {}): Promise<PrepOutcome> {
  const key = prepKey(event);
  const title = event.summary ?? "(no title)";
  const { data: done } = await db.from("cortex_posts").select("id, slack_ts, channel").eq("key", key).maybeSingle();
  if (done?.slack_ts && !opts.force) return { key, title, channel: String(done.channel), sent: false, error: "already prepped" };
  const route = routeMeeting(event);
  const note = await writeNote(event, await meetingContext(db, event)).catch(() => null);
  const header = `*Prep: ${title}*, ${event.start?.dateTime ? whenText(event.start.dateTime) : ""}`;
  const text = `${header}\n${note ?? "I could not write the prep this time; nothing on file was read."}`;
  const target = route.channel?.id ?? CORTEX_CHANNEL();
  let posted = await postAsCortex(target, text);
  let fallback = false;
  if (!posted.ok && route.channel) {
    // Private channels Cortex is not in: say it in #cortex instead, with the fix.
    posted = await postAsCortex(CORTEX_CHANNEL(), `${text}\n_(Meant for ${route.channel.name}; invite @Cortex there and the next one goes straight in.)_`);
    fallback = true;
  }
  const row = { kind: "meeting_prep", key, channel: posted.ok ? posted.channelId : target, text, thread_ts: null, slack_ts: posted.ok ? posted.ts : null, error: posted.ok ? null : posted.error };
  if (done) await db.from("cortex_posts").update(row).eq("id", done.id);
  else await db.from("cortex_posts").insert(row);
  return { key, title, channel: route.channel?.name ?? "#cortex", sent: posted.ok, fallback, error: posted.ok ? undefined : posted.error };
}

/** Every meeting in the next window that needs prep and has none. */
export async function prepareMeetings(db: SupabaseClient, now: Date = new Date()): Promise<{ checked: number; outcomes: PrepOutcome[]; unavailable?: string }> {
  const read = await loadCalendarEvents(db, now.toISOString(), new Date(now.getTime() + PREP_WINDOW_HOURS * 3_600_000).toISOString());
  if ("unavailable" in read) return { checked: 0, outcomes: [], unavailable: read.unavailable };
  const due = (read.events as CalendarEvent[]).filter((e) => needsPrep(e, now));
  const outcomes: PrepOutcome[] = [];
  for (const event of due) {
    const outcome = await prepOne(db, event);
    if (outcome.error !== "already prepped") outcomes.push(outcome);
  }
  return { checked: due.length, outcomes };
}

/** The coming days' meetings with where each would go: for the test page. */
export async function previewMeetings(db: SupabaseClient, days = 3, now: Date = new Date()) {
  const read = await loadCalendarEvents(db, now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString());
  if ("unavailable" in read) return { unavailable: read.unavailable };
  return {
    meetings: (read.events as CalendarEvent[])
      .filter((e) => e.start?.dateTime && attendeesOf(e).length && e.status !== "cancelled")
      .map((e) => {
        const route = routeMeeting(e);
        return { id: e.id, title: e.summary, start: e.start?.dateTime, when: whenText(e.start!.dateTime!), goesTo: route.channel?.name ?? (route.reason.startsWith("MedJobs") ? "skipped" : "#cortex"), why: route.reason, outside: externalAttendees(e).map((p) => p.name) };
      }),
  };
}

/** Find one upcoming event by id (for "post this one now"). */
export async function findEvent(db: SupabaseClient, id: string, days = 7, now: Date = new Date()): Promise<CalendarEvent | null> {
  const read = await loadCalendarEvents(db, now.toISOString(), new Date(now.getTime() + days * 86_400_000).toISOString());
  if ("unavailable" in read) return null;
  return (read.events as CalendarEvent[]).find((e) => e.id === id) ?? null;
}
