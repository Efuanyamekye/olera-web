import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCorrection } from "@/lib/war-room/corrections.server";
import {
  DEFAULT_TUNING,
  foldTuning,
  gradeFromReaction,
  INITIATIVE_SETTINGS,
  initiativeFromPostKey,
  parseTuningReply,
  tuningAck,
  type ParsedTuning,
  type Tuning,
  type TuningRow,
} from "@/lib/war-room/tuning";

/**
 * Cortex tuning, the database side (table cortex_tuning, migration 274).
 *
 * A reply in an initiative's #cortex thread is read as an instruction about
 * that initiative: how often to speak, which action to ask about first, or a
 * standing lesson. It is saved scoped to the initiative and acknowledged in
 * the thread with the way back. A reaction on a Cortex post is a grade.
 *
 * The daily-brief corrections (corrections.server.ts) stay the global list;
 * a lesson saved here is also appended there with the initiative in front,
 * so it reaches every answer and brief without new wiring.
 */

export async function loadTuning(db: SupabaseClient, initiative: string): Promise<Tuning> {
  const { data, error } = await db.from("cortex_tuning")
    .select("initiative, kind, value, quote, created_at")
    .eq("initiative", initiative)
    .order("created_at", { ascending: true })
    .limit(500);
  // The table may not exist yet (migration 274 pending): defaults, not a crash.
  if (error || !data) return { ...DEFAULT_TUNING, cadence: INITIATIVE_SETTINGS[initiative]?.cadence ?? "daily" };
  return foldTuning(initiative, data as TuningRow[]);
}

/** Load every initiative's tuning at once, for the morning post and the brief. */
export async function loadAllTuning(db: SupabaseClient): Promise<Record<string, Tuning>> {
  const out: Record<string, Tuning> = {};
  for (const initiative of Object.keys(INITIATIVE_SETTINGS)) out[initiative] = await loadTuning(db, initiative);
  return out;
}

async function saveRows(db: SupabaseClient, rows: Array<Omit<TuningRow, "created_at"> & { slack_ts?: string | null; set_by?: string | null }>): Promise<boolean> {
  if (!rows.length) return true;
  const { error } = await db.from("cortex_tuning").insert(rows);
  return !error;
}

/**
 * The initiative a Slack thread belongs to, from the post that started it or
 * any Cortex post inside it. Null when the thread is not one of Cortex's.
 */
export async function initiativeForThread(db: SupabaseClient, threadTs: string): Promise<{ initiative: string; lastPost: string | null } | null> {
  const { data } = await db.from("cortex_posts")
    .select("key, text, slack_ts, thread_ts, created_at")
    .or(`slack_ts.eq.${threadTs},thread_ts.eq.${threadTs}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const posts = (data ?? []) as Array<{ key: string; text: string; slack_ts: string | null }>;
  for (const post of posts) {
    const initiative = initiativeFromPostKey(post.key);
    if (initiative) return { initiative, lastPost: posts[0]?.text ?? null };
  }
  return null;
}

/**
 * Is this message an instruction about how Cortex should run the initiative?
 * One Haiku call. NONE for a question, a remark, or an approval of an item.
 */
export async function extractTuning(initiative: string, lastPost: string | null, message: string): Promise<ParsedTuning | null> {
  if (!process.env.ANTHROPIC_API_KEY || message.trim().length < 3) return null;
  const spec = INITIATIVE_SETTINGS[initiative];
  if (!spec) return null;
  const fences = Object.entries(spec.fences).map(([k, v]) => `"${k}" (${v.label})`).join(", ") || "none";
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: [
        `The founder of Olera is replying in the Slack thread where his AI chief of staff, Cortex, reports on "${spec.label}". Decide whether his message is an instruction about HOW Cortex should run this initiative, and if so express it as JSON with any of these keys:`,
        `- "cadence": "daily" | "weekly" | "off" — how often Cortex should post about it ("weekly not daily", "too chatty", "stop posting this" → off, "every day" → daily).`,
        `- "fence": {"setting": <one of ${fences}>, "value": "ask" | "alone"} — "ask" when he wants Cortex to check with a person before doing that thing ("ask me first on renames", "don't archive on your own"); "alone" when he hands it back ("you can do renames yourself").`,
        `- "lesson": one plain sentence stating a standing rule or fact he gave that should shape this initiative from now on, general enough to apply next time.`,
        `Reply with ONLY the JSON object, or exactly NONE if the message is a question, a remark, agreement, an approval of a specific item, or anything that is not an instruction about how Cortex should operate. Never invent a fence setting that is not listed.`,
      ].join("\n"),
      messages: [{ role: "user", content: `CORTEX'S LAST POST IN THE THREAD:\n${(lastPost ?? "(none)").slice(0, 1_200)}\n\nFOUNDER REPLIED:\n${message.slice(0, 800)}` }],
    }, { timeout: 15_000, maxRetries: 0 });
    const raw = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text ?? "";
    return parseTuningReply(initiative, raw);
  } catch {
    return null;
  }
}

/**
 * Read a founder message in an initiative thread as tuning; save it and
 * return what to say back. Null when it was not tuning (answer it as a
 * question instead).
 */
export async function applyTuningMessage(
  db: SupabaseClient,
  args: { initiative: string; lastPost: string | null; text: string; slackTs: string; user: string | null },
): Promise<{ reply: string; parsed: ParsedTuning } | null> {
  const parsed = await extractTuning(args.initiative, args.lastPost, args.text);
  if (!parsed) return null;
  const rows: Array<Omit<TuningRow, "created_at"> & { slack_ts?: string | null; set_by?: string | null }> = [];
  const base = { initiative: args.initiative, quote: args.text.slice(0, 300), slack_ts: args.slackTs, set_by: args.user };
  if (parsed.cadence) rows.push({ ...base, kind: "cadence", value: parsed.cadence });
  if (parsed.fence) rows.push({ ...base, kind: "fence", value: `${parsed.fence.setting}=${parsed.fence.value}` });
  if (parsed.lesson) {
    rows.push({ ...base, kind: "lesson", value: parsed.lesson });
    await saveCorrection(db, `[${args.initiative}] ${parsed.lesson}`, args.text).catch(() => false);
  }
  const saved = await saveRows(db, rows);
  const ack = tuningAck(args.initiative, parsed);
  return { reply: saved ? ack : `${ack}\n(I could not save that; migration 274 may not be applied.)`, parsed };
}

/** A reaction on one of Cortex's posts becomes a grade on that initiative. */
export async function recordGrade(
  db: SupabaseClient,
  args: { itemTs: string; reaction: string; user: string | null },
): Promise<{ recorded: boolean; initiative?: string; grade?: "up" | "down" }> {
  const grade = gradeFromReaction(args.reaction);
  if (!grade) return { recorded: false };
  const { data } = await db.from("cortex_posts").select("key").eq("slack_ts", args.itemTs).maybeSingle();
  const initiative = data?.key ? initiativeFromPostKey(data.key as string) : null;
  if (!initiative) return { recorded: false };
  const ok = await saveRows(db, [{ initiative, kind: "grade", value: grade, quote: args.reaction, slack_ts: args.itemTs, set_by: args.user }]);
  return { recorded: ok, initiative, grade };
}
