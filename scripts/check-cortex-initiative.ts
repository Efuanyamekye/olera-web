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
import { parseScore } from "../lib/war-room/moves.server";
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
  if (moments.length && inWakingHours(new Date())) assert.equal(declinedFor, moments[0].subjectKey, "the top moment goes to the model");

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
