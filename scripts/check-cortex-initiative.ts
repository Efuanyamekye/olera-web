/**
 * Checks for Cortex's reaction log and judgment tick.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-initiative.ts
 *
 * The tick runs against the live database read-only (writes are dropped),
 * with a fake Telegram and, unless --live, a fake model. With --live the real
 * model words (or declines) the top moment it finds today. Nothing is sent.
 */
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pickMove, type MoveCandidate } from "../lib/war-room/brief-move.server";
import { findScores, parseScore } from "../lib/war-room/moves.server";
import { bangkokClock, findMoments, inWakingHours, rateMeDue, runJudgmentTick } from "../lib/war-room/judgment-tick.server";
import { memoryChatStore } from "../lib/war-room/chat-memory.server";
import { handleTelegramUpdate, type TelegramDeps, type TelegramUpdate } from "../lib/war-room/telegram-chat.server";

// --- Scores, only as the whole start of a message.
assert.deepEqual(parseScore("7"), { score: 7, words: "" });
assert.deepEqual(parseScore("7/10 - too long, and stop saying Nextdoor"), { score: 7, words: "too long, and stop saying Nextdoor" });
assert.deepEqual(parseScore("10"), { score: 10, words: "" });
assert.equal(parseScore("7 leads came in"), null, "a number opening a sentence is not a score");
assert.deepEqual(parseScore("7, less Nextdoor please"), { score: 7, words: "less Nextdoor please" });
assert.deepEqual(parseScore("8."), { score: 8, words: "" });
assert.equal(parseScore("75 dollars"), null);
assert.equal(parseScore("3.5 stars"), null);
assert.equal(parseScore("What about Robbie?"), null);
// Ratings inside a longer message (27 Sep: both were missed).
const tjMessage = "Also I don't want to miss this opportunity to improve how we work together. Two things:\n1. Feedback on your earlier response about understanding the situation with the grants: 9 out of 10 there.\n2. Your first response with the leads: I'll give that a 6.5 out of 10 for the reason that I followed up with [sent a screenshot]";
assert.deepEqual(findScores(tjMessage).map((r) => r.score), [9, 6.5]);
assert.match(findScores(tjMessage)[0].context, /^Feedback on your earlier response about understanding the situation with the grants/);
assert.ok(!findScores(tjMessage)[1].context.includes("[sent a screenshot]"));
assert.deepEqual(findScores("that one was a 7/10").map((r) => r.score), [7]);
assert.deepEqual(findScores("we had 12 out of 100 leads qualify"), [], "not out of 10");
assert.deepEqual(findScores("rate it 11/10"), [], "over 10 is not a rating");
assert.deepEqual(findScores("facts 6, thinking 9").map((r) => r.score), [6, 9], "split ratings by name");
assert.match(findScores("facts 6, thinking 9")[1].context, /^thinking: /);
assert.deepEqual(findScores("facts: 6/10, thinking: 9/10").map((r) => r.score), [6, 9], "not counted twice");
assert.deepEqual(findScores("the logic 2 days ago was fine"), [], "a count of days is not a rating");
console.log("score checks passed");

// --- A move ignored twice does not lead the brief a third time.
const candidate = (key: string, kind: MoveCandidate["kind"], since: string): MoveCandidate => ({
  kind, title: key, why_now: "", decision_required: null, assigned_owner: null, action_kind: null,
  proposed_solution: null, finding: null, execution_plan: null, evidence: null, since, subjectKey: key,
});
const moment = candidate("moment:1", "provider_moment", "2026-09-26");
const approved = candidate("proposal:a", "approved_not_done", "2026-09-20");
assert.equal(pickMove([approved], [], [moment])?.subjectKey, "moment:1");
assert.equal(pickMove([approved], [], [moment], new Set(["moment:1"]))?.subjectKey, "proposal:a");
assert.equal(pickMove([approved], [], [moment], new Set(["moment:1", "proposal:a"])), null);
console.log("brief pick checks passed");

// --- His clock.
const at = (iso: string) => new Date(iso);
assert.equal(bangkokClock(at("2026-09-27T01:00:00Z")).hour, 8);
assert.equal(inWakingHours(at("2026-09-27T00:30:00Z")), false, "07:30 Bangkok is quiet");
assert.equal(inWakingHours(at("2026-09-27T01:00:00Z")), true, "08:00 Bangkok speaks");
assert.equal(inWakingHours(at("2026-09-27T15:30:00Z")), false, "22:30 Bangkok is quiet");
assert.equal(bangkokClock(at("2026-09-27T20:00:00Z")).dayStart, "2026-09-27T17:00:00.000Z", "a new Bangkok day starts at 17:00 UTC");
// 2026-09-27 is a Sunday. 19:00 Bangkok = 12:00 UTC.
assert.equal(rateMeDue(at("2026-09-27T12:00:00Z"), null, 5), true);
assert.equal(rateMeDue(at("2026-09-27T12:00:00Z"), null, 1), false, "nothing to rate");
assert.equal(rateMeDue(at("2026-09-27T12:00:00Z"), "2026-09-24T12:00:00Z", 5), false, "asked this week already");
assert.equal(rateMeDue(at("2026-09-26T12:00:00Z"), null, 5), false, "Saturday");
assert.equal(rateMeDue(at("2026-09-27T05:00:00Z"), null, 5), false, "Sunday noon, not evening");
console.log("clock checks passed");

// --- Replies reach the reaction log; a score after a rating request is thanked, not answered.
const FOUNDER = "4242";
function fakes(scored: number | null) {
  const calls: Array<{ text: string; options: object }> = [];
  const sent: string[] = [];
  let answered = 0;
  const deps: TelegramDeps = {
    db: {} as SupabaseClient,
    store: memoryChatStore(),
    founderChatId: FOUNDER,
    send: async (_c, text) => { sent.push(text); return { success: true }; },
    typing: async () => undefined,
    download: async () => Buffer.from(""),
    transcribe: async () => null,
    answer: async () => { answered += 1; return { answered: true, reply: "Fine.", correction: "Hoop's plan does not bound spend." }; },
    reactions: {
      reply: async (text, options) => {
        calls.push({ text, options });
        return options.scoreOnly && scored ? { scored } : null;
      },
    },
  };
  return { deps, calls, sent, answered: () => answered };
}
const update = (id: number, text: string): TelegramUpdate => ({
  update_id: id,
  message: { message_id: id, date: 1_790_000_000 + id * 60, chat: { id: Number(FOUNDER) }, from: { id: Number(FOUNDER) }, text },
});

(async () => {
  {
    const { deps, calls, sent, answered } = fakes(7);
    await handleTelegramUpdate(update(1, "7, less Nextdoor please"), deps);
    assert.equal(answered(), 0, "a rating is not sent to the model");
    assert.match(sent[0], /7\/10/);
    assert.equal(calls.length, 1);
  }
  {
    const { deps, calls, answered } = fakes(null);
    await handleTelegramUpdate(update(2, "No, that's wrong, the budget is already doubled"), deps);
    assert.equal(answered(), 1);
    assert.deepEqual(calls.map((call) => call.options), [{ scoreOnly: true }, { pushedBack: true }], "a correction is logged as pushback");
  }
  {
    // Ratings inside a question: saved, the question still answered, and the reply says so.
    const { deps, sent, answered } = fakes(null);
    deps.reactions = { reply: async (_t, options) => (options.scoreOnly ? { ratings: [9, 6.5] } : null) };
    await handleTelegramUpdate(update(3, "Two things: 9 out of 10 on grants, 6.5 out of 10 on leads. Why did the leads one miss?"), deps);
    assert.equal(answered(), 1, "the question is still answered");
    assert.match(sent[0], /Saved your ratings \(9\/10, 6\.5\/10\)/);
  }
  console.log("reply hook checks passed");

  // --- The tick against live data, read-only.
  const { readOnly } = await import("./replay-cortex-conversation");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));
  const moments = await findMoments(db);
  console.log(`\nmoments found now: ${moments.length}`);
  for (const found of moments.slice(0, 5)) console.log(`  ${found.priority} ${found.kind} (${found.subjectKey})`);

  const sentByTick: string[] = [];
  const quiet = await runJudgmentTick({
    db, chatId: FOUNDER, now: at("2026-09-27T20:00:00Z"),
    send: async (_c, text) => { sentByTick.push(text); return { success: true }; },
    remember: async () => undefined,
    word: async () => ({ send: true, message: "should not be sent" }),
  });
  assert.equal(quiet.spoke, false, "03:00 Bangkok stays quiet");
  assert.equal(sentByTick.length, 0);

  // At a waking hour today, so the live moments above are in play.
  const wakingNow = inWakingHours(new Date()) ? new Date() : at("2026-09-28T03:00:00Z");
  let declinedFor = "";
  const silent = await runJudgmentTick({
    db, chatId: FOUNDER, now: wakingNow,
    send: async (_c, text) => { sentByTick.push(text); return { success: true }; },
    remember: async () => undefined,
    word: async (found) => { declinedFor = found.subjectKey; return { send: false, why: "routine" }; },
  });
  assert.equal(silent.spoke, false, "the model can decline");
  console.log(`tick now, model declines: ${"reason" in silent ? silent.reason : ""} (asked about ${declinedFor || "nothing"})`);
  // The top moment may already have been raised in the last 3 days (live data),
  // in which case the next one goes; whatever went must be a real moment.
  if (declinedFor) assert.ok(moments.some((m) => m.subjectKey === declinedFor), "the model is asked about a real moment");

  if (process.argv.includes("--live")) {
    const live = await runJudgmentTick({
      db, chatId: FOUNDER, now: wakingNow,
      send: async (_c, text) => { sentByTick.push(text); return { success: true }; },
      remember: async () => undefined,
    });
    console.log(`\nLIVE tick: ${JSON.stringify(live, null, 1)}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
