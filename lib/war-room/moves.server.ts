import type { SupabaseClient } from "@supabase/supabase-js";
import { saveCorrection } from "@/lib/war-room/corrections.server";

/**
 * What Cortex put in front of the founder, and what he did with it
 * (migration 262).
 *
 * The plan that gave Cortex initiative (TJ, 2026-09-27) rests on this: Jade got
 * better because every message was judged on whether it landed. Without a
 * record, a move he passed over twice came back a third time. Reactions are
 * filled in from what he did, never asked for:
 * - replied: he wrote back within a day.
 * - pushed_back: that reply corrected Cortex.
 * - acted: the data shows it was done (the proposal approved or carried out, a
 *   reply sent on the email thread, the lead worked).
 * - ignored: a day passed with none of those.
 */
export type MoveKind = "brief" | "ping" | "rate_me";
export type MoveReaction = "replied" | "acted" | "pushed_back" | "ignored";
export type MoveRecord = {
  id: string; kind: MoveKind; subject_key: string; text: string; sent_at: string;
  reaction: MoveReaction | null; reacted_at: string | null; reaction_note: string | null;
};

const REPLY_WINDOW_MS = 24 * 3_600_000;
const COLUMNS = "id, kind, subject_key, text, sent_at, reaction, reacted_at, reaction_note";

export async function recordMove(
  db: SupabaseClient,
  move: { kind: MoveKind; subjectKey: string; text: string; surface?: "telegram" | "slack" },
): Promise<void> {
  const { error } = await db.from("cortex_moves").insert({
    kind: move.kind,
    subject_key: move.subjectKey,
    text: move.text.slice(0, 4_000),
    surface: move.surface ?? "telegram",
  });
  // Before migration 262 is run this fails; the message still goes out.
  if (error) console.error("[cortex] move not recorded:", error.message);
}

async function setReaction(db: SupabaseClient, id: string, reaction: MoveReaction, note: string | null) {
  await db.from("cortex_moves")
    .update({ reaction, reacted_at: new Date().toISOString(), reaction_note: note?.slice(0, 500) ?? null })
    .eq("id", id)
    .is("reaction", null)
    .then(() => undefined, () => undefined);
}

/**
 * A 1 to 10 score at the start of a message ("7", "7/10", "6 - too long").
 * Only read as a score right after Cortex asked for one.
 */
export function parseScore(text: string): { score: number; words: string } | null {
  // The number stands alone, or is followed by "/10" or punctuation: "7",
  // "7/10 too long", "7, less Nextdoor". Not "7 leads came in".
  const match = text.trim().match(/^(10|[1-9])(?:\s*\/\s*10\b\s*[-–:.,!]?|\s*[-–:,!]|\.(?!\d)|$)\s*([\s\S]*)$/);
  if (!match) return null;
  return { score: Number(match[1]), words: match[2].trim() };
}

/**
 * He wrote something. It answers the most recent move still open from the last
 * day. A weekly rating request takes a score, which is stored with his words
 * as a correction, so it shapes every later answer.
 */
/**
 * Ratings written inside a longer message: "9 out of 10 there", "a 6.5/10".
 * On 2026-09-27 he rated two answers that way, in one message, hours after the
 * weekly request, and neither was saved: only a message that started with the
 * number counted. Each rating keeps the line it came in, which says what it
 * was for.
 */
export function findScores(text: string): Array<{ score: number; context: string }> {
  const found: Array<{ score: number; context: string }> = [];
  for (const line of text.split(/\n+/)) {
    const context = line.replace(/^\s*\d+[.)]\s*/, "").replace(/\[sent a screenshot\]/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
    const taken: Array<[number, number]> = [];
    for (const match of line.matchAll(/(\d{1,2}(?:\.\d)?)\s*(?:out of|\/)\s*10\b/gi)) {
      const score = Number(match[1]);
      if (score < 0 || score > 10) continue;
      taken.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
      found.push({ score, context });
    }
    // Split ratings by name: "facts 6, thinking 9" (TJ, 2026-09-28: a right
    // argument on wrong facts deserves two numbers, not one).
    for (const match of line.matchAll(/\b(facts?|thinking|logic|reasoning|resonance|overall)\s*[:=-]?\s*(\d{1,2}(?:\.\d)?)\b(?!\s*(?:%|\/|out of|days?|leads?|hours?))/gi)) {
      const at = match.index ?? 0;
      if (taken.some(([a, b]) => at < b && at + match[0].length > a)) continue;
      const score = Number(match[2]);
      if (score < 0 || score > 10) continue;
      found.push({ score, context: `${match[1].toLowerCase()}: ${context}` });
    }
  }
  return found;
}

export async function recordFounderReply(
  db: SupabaseClient,
  text: string,
  options: { pushedBack?: boolean; scoreOnly?: boolean } = {},
): Promise<{ scored?: number; ratings?: number[] } | null> {
  const since = new Date(Date.now() - REPLY_WINDOW_MS).toISOString();
  const { data, error } = await db.from("cortex_moves")
    .select(COLUMNS)
    .is("reaction", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(5);
  const open = error ? [] : (data ?? []) as MoveRecord[];
  const move = open[0] ?? null;
  const rateMe = open.find((m) => m.kind === "rate_me") ?? null;
  const day = new Date().toISOString().slice(0, 10);

  if (options.scoreOnly) {
    // A bare score answering the weekly request: thanked, not answered.
    const bare = rateMe ? parseScore(text) : null;
    if (rateMe && bare) {
      await saveCorrection(db, `Weekly rating ${bare.score}/10 (${day})${bare.words ? `: ${bare.words.slice(0, 240)}` : ""}`, text).catch(() => false);
      await setReaction(db, rateMe.id, "replied", `${bare.score}/10`);
      return { scored: bare.score };
    }
    // Ratings inside a longer message, whenever he gives them.
    const inline = findScores(text);
    if (inline.length) {
      for (const rating of inline) {
        await saveCorrection(db, `Rating ${rating.score}/10 (${day}): ${rating.context}`, text).catch(() => false);
      }
      if (rateMe) await setReaction(db, rateMe.id, "replied", inline.map((r) => `${r.score}/10`).join(", "));
      return { ratings: inline.map((r) => r.score) };
    }
    return null;
  }
  if (!move || move.kind === "rate_me") return null;
  await setReaction(db, move.id, options.pushedBack ? "pushed_back" : "replied", text);
  return {};
}

/**
 * a is later than b, as times. Postgres writes a varying number of fractional
 * digits ("09.58+00:00", "09.123456+00:00"), so comparing the strings can put
 * two moments in the same second the wrong way round.
 */
const after = (a: string | null | undefined, b: string) => Boolean(a) && Date.parse(a as string) > Date.parse(b);

/** Did the data show it done after the move was sent? */
async function wasActedOn(db: SupabaseClient, move: MoveRecord): Promise<string | null> {
  const [kind, id] = move.subject_key.split(":", 2);
  if (!id) return null;
  if (kind === "proposal") {
    const { data } = await db.from("war_room_proposals").select("status, approved_at, updated_at").eq("id", id).maybeSingle();
    const row = data as { status?: string; approved_at?: string | null; updated_at?: string | null } | null;
    if (!row) return null;
    if (after(row.approved_at, move.sent_at)) return "approved";
    // A status he moved it to after the move was sent: dispatched, finished,
    // rejected or parked are all an answer. "failed" and "superseded" are not his.
    if (["dispatching", "executing", "review_ready", "completed", "rejected", "parked"].includes(row.status ?? "") && after(row.updated_at, move.sent_at)) return row.status ?? null;
    return null;
  }
  if (kind === "moment") {
    const { data } = await db.from("support_email_messages")
      .select("internal_date")
      .eq("thread_id", id)
      .eq("direction", "out")
      .gt("internal_date", move.sent_at)
      .limit(1);
    return data?.length ? "replied to the email" : null;
  }
  if (kind === "lead") {
    const { data } = await db.from("city_leads").select("status, handed_at, archived_at, updated_at").eq("id", id).maybeSingle();
    const row = data as { status?: string; handed_at?: string | null; archived_at?: string | null } | null;
    if (!row) return null;
    if (after(row.handed_at, move.sent_at)) return "handed to the provider";
    if (after(row.archived_at, move.sent_at)) return "archived";
    return null;
  }
  return null;
}

/**
 * Fills in what can be known now: acted-on moves, and moves a day old with no
 * reaction, which were ignored. Run before every brief and every tick.
 */
export async function resolveReactions(db: SupabaseClient, now = Date.now()): Promise<void> {
  const { data, error } = await db.from("cortex_moves")
    .select(COLUMNS)
    .is("reaction", null)
    .gte("sent_at", new Date(now - 14 * 86_400_000).toISOString())
    .limit(50);
  if (error) return;
  for (const move of (data ?? []) as MoveRecord[]) {
    const acted = await wasActedOn(db, move).catch(() => null);
    if (acted) await setReaction(db, move.id, "acted", acted);
    else if (now - Date.parse(move.sent_at) > REPLY_WINDOW_MS) await setReaction(db, move.id, "ignored", null);
  }
}

export type ReactionSummary = {
  /** Subjects ignored twice in the last two weeks: drop or reframe, never repeat as is. */
  ignoredTwice: Set<string>;
  /** Plain lines for a prompt: what landed and what did not. */
  lines: string[];
  pingsToday: number;
  lastRateMe: string | null;
};

export async function loadReactionSummary(db: SupabaseClient, now = Date.now(), dayStart?: string): Promise<ReactionSummary> {
  const { data, error } = await db.from("cortex_moves")
    .select(COLUMNS)
    .gte("sent_at", new Date(now - 14 * 86_400_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(60);
  const moves = error ? [] : (data ?? []) as MoveRecord[];
  const ignored = new Map<string, number>();
  for (const move of moves) {
    if (move.reaction === "ignored") ignored.set(move.subject_key, (ignored.get(move.subject_key) ?? 0) + 1);
  }
  const { data: rate } = await db.from("cortex_moves")
    .select("sent_at")
    .eq("kind", "rate_me")
    .order("sent_at", { ascending: false })
    .limit(1);
  return {
    ignoredTwice: new Set([...ignored].filter(([, count]) => count >= 2).map(([key]) => key)),
    lines: moves.slice(0, 20).map((move) => {
      const what = move.reaction === "acted" ? `he acted on it (${move.reaction_note ?? "done"})`
        : move.reaction === "replied" ? "he replied"
          : move.reaction === "pushed_back" ? `he pushed back: "${(move.reaction_note ?? "").slice(0, 160)}"`
            : move.reaction === "ignored" ? "he ignored it"
              : "no reaction yet";
      return `${move.sent_at.slice(0, 10)} ${move.kind}: "${move.text.slice(0, 140)}" -> ${what}`;
    }),
    pingsToday: dayStart ? moves.filter((move) => move.kind === "ping" && Date.parse(move.sent_at) >= Date.parse(dayStart)).length : 0,
    lastRateMe: (rate?.[0] as { sent_at?: string } | undefined)?.sent_at ?? null,
  };
}
