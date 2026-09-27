import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The voicemail backlog, sorted from its transcripts.
 *
 * On 2026-09-27 support@ held 506 voicemails waiting on a reply: 393 older
 * than three months, 62 one to three months, 51 in the last 30 days. Every one
 * carries a transcript. Mixed in with team test calls and robocalls were real
 * callbacks (a provider returning a referral call, a named caller asking to be
 * rung back). TJ: "having a long list that no one can ever get to is also a
 * losing strategy." The rule he chose: older than 30 days is aged out, after a
 * one-time read that pulls out anything still worth a look; newer ones go in
 * the digest as noise to archive or a short call-back list, and a callback
 * left 14 days is offered for archive too.
 */

export const AGED_OUT_DAYS = 30;
export const STALE_CALLBACK_DAYS = 14;
const BATCH = 20;

export type Voicemail = { id: string; ageDays: number; summary: string; transcript: string };
export type VoicemailVerdict = { id: string; ageDays: number; worthIt: boolean; who: string; number: string; reason: string };

export async function loadWaitingVoicemails(db: SupabaseClient, now = Date.now()): Promise<Voicemail[]> {
  const threads: Array<{ id: string; last_message_at: string; agent_summary: string | null }> = [];
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await db.from("support_email_threads")
      .select("id, last_message_at, agent_summary")
      .in("state", ["needs_reply", "escalated"])
      .eq("category", "voicemail")
      .range(offset, offset + 999);
    if (error) throw error;
    threads.push(...((data ?? []) as typeof threads));
    if (!data || data.length < 1_000) break;
  }
  const transcripts = new Map<string, string>();
  for (let i = 0; i < threads.length; i += 200) {
    const { data } = await db.from("support_email_messages")
      .select("thread_id, body_text, snippet")
      .in("thread_id", threads.slice(i, i + 200).map((t) => t.id))
      .eq("direction", "in");
    for (const row of (data ?? []) as Array<{ thread_id: string; body_text: string | null; snippet: string | null }>) {
      if (!transcripts.has(row.thread_id)) transcripts.set(row.thread_id, (row.body_text ?? row.snippet ?? "").replace(/\s+/g, " ").trim());
    }
  }
  return threads.map((t) => ({
    id: t.id,
    ageDays: Math.floor((now - Date.parse(t.last_message_at)) / 86_400_000),
    summary: t.agent_summary ?? "",
    transcript: transcripts.get(t.id) ?? "",
  }));
}

const SORT_BASE = `You sort voicemails left on the main phone line of Olera, a senior-care marketplace that lists care providers and helps families find care. For each numbered voicemail you get its age, a one-line summary and the transcript.

Worth a call back (worthIt true): a family or older adult looking for care or help; a care provider or facility returning a call, asking about listings, leads, partnership or their profile; a named person asking to be called back about something real.
Not worth it (worthIt false): test calls from Olera's own team (for example Logan testing the line), robocalls, recorded sales pitches, vendors selling to Olera, silence or hang-ups, wrong numbers, anything with no real request.
When unsure, say worthIt true: a missed family is worse than one extra line.

{{AGED_RULE}}Reply with JSON only: an array with one object per voicemail, in order: {"n": number, "worthIt": boolean, "who": "name and business if said, else 'unknown caller'", "number": "callback number if said, else ''", "reason": "why they called, under 12 words"}.`;

/**
 * Older than 30 days, the bar is higher. On the first live read, 216 of 452
 * old voicemails passed the recent rule, most of them providers returning
 * Olera's call about a family weeks earlier: that moment has passed.
 */
const AGED_RULE = `These voicemails are all over 30 days old. Most requests that old have passed. Say worthIt true ONLY for: a family or older adult who needed care or help (they may still need it); a care provider or facility asking about its OWN business with Olera (listing, leads, advertising, partnership, a complaint); anything about billing, legal matters or removing a listing. A provider returning Olera's call about a family's inquiry, or following up on an inquiry, is NOT worth it at this age. Over 90 days old, only three things are still worth it: a family or older adult who needed help, a complaint (including wrong listing information), or billing or legal matters; a business returning Olera's call about its listing is not. Here, when unsure, say false.

`;

function sortSystem(aged: boolean) {
  return SORT_BASE.replace("{{AGED_RULE}}", aged ? AGED_RULE : "");
}

/** One line per caller: the newest voicemail from a number stays, older ones from it go. */
export function dedupeByCaller(verdicts: VoicemailVerdict[]): VoicemailVerdict[] {
  const digits = (n: string) => n.replace(/\D/g, "").slice(-10);
  const newest = new Map<string, string>();
  for (const v of [...verdicts].sort((a, b) => a.ageDays - b.ageDays)) {
    const key = digits(v.number);
    if (v.worthIt && key.length === 10 && !newest.has(key)) newest.set(key, v.id);
  }
  return verdicts.map((v) => {
    const key = digits(v.number);
    return v.worthIt && key.length === 10 && newest.get(key) !== v.id
      ? { ...v, worthIt: false, reason: `repeat of a newer voicemail from ${v.number}` }
      : v;
  });
}

// Haiku 4.5, per million tokens.
const PRICE = [1, 5] as const;

/** Sort voicemails in batches. A batch the model cannot read is kept as worth a look, never archived. */
export async function sortVoicemails(voicemails: Voicemail[]): Promise<{ verdicts: VoicemailVerdict[]; costUsd: number }> {
  // Sorted in two groups, each against its own bar, then one line per caller.
  const aged = voicemails.filter((v) => v.ageDays > AGED_OUT_DAYS);
  const recent = voicemails.filter((v) => v.ageDays <= AGED_OUT_DAYS);
  const [a, r] = await Promise.all([sortGroup(aged, true), sortGroup(recent, false)]);
  return { verdicts: dedupeByCaller([...a.verdicts, ...r.verdicts]), costUsd: a.costUsd + r.costUsd };
}

async function sortGroup(voicemails: Voicemail[], agedOut: boolean): Promise<{ verdicts: VoicemailVerdict[]; costUsd: number }> {
  const verdicts: VoicemailVerdict[] = [];
  let costUsd = 0;
  const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  for (let i = 0; i < voicemails.length; i += BATCH) {
    const batch = voicemails.slice(i, i + BATCH);
    const keepAll = () => batch.forEach((v) => verdicts.push({ id: v.id, ageDays: v.ageDays, worthIt: true, who: "unknown caller", number: "", reason: v.summary.slice(0, 80) || "could not read it" }));
    if (!anthropic) {
      keepAll();
      continue;
    }
    try {
      const reply = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 3_000,
        system: sortSystem(agedOut),
        messages: [{ role: "user", content: batch.map((v, j) => `${j + 1}. (${v.ageDays} days old) ${v.summary.slice(0, 200)}\nTranscript: ${v.transcript.slice(0, 700)}`).join("\n\n") }],
      }, { timeout: 45_000, maxRetries: 1 });
      costUsd += (reply.usage.input_tokens * PRICE[0] + reply.usage.output_tokens * PRICE[1]) / 1_000_000;
      const text = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
      const parsed = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as Array<{ n: number; worthIt: boolean; who?: string; number?: string; reason?: string }>;
      batch.forEach((v, j) => {
        const row = parsed.find((p) => p.n === j + 1);
        verdicts.push({
          id: v.id,
          ageDays: v.ageDays,
          // A voicemail the model skipped is kept, never archived unread.
          worthIt: row ? row.worthIt !== false : true,
          who: row?.who?.trim() || "unknown caller",
          number: row?.number?.trim() || "",
          reason: row?.reason?.trim() || v.summary.slice(0, 80),
        });
      });
    } catch (error) {
      console.error("[cortex] voicemail sort failed:", error instanceof Error ? error.message : String(error));
      keepAll();
    }
  }
  return { verdicts, costUsd };
}

export function callbackLine(v: VoicemailVerdict) {
  return `${v.who}${v.number ? `, ${v.number}` : ""}: ${v.reason} (${v.ageDays === 0 ? "today" : `${v.ageDays}d ago`})`;
}
