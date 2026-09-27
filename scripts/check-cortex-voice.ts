/**
 * Checks for Cortex's voice notes on Telegram.
 *
 *   npx tsx scripts/check-cortex-voice.ts
 *
 * With --live, makes a real note from a long reply and from a brief (Haiku
 * rewrite + OpenAI speech) and writes them to the paths given, so they can be
 * played before anything is sent. About $0.03.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-voice.ts --live out-reply.ogg out-brief.ogg
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { memoryChatStore } from "../lib/war-room/chat-memory.server";
import { handleTelegramUpdate, type TelegramDeps, type TelegramUpdate } from "../lib/war-room/telegram-chat.server";
import { earRewrite, fitForSpeech, sendVoiceNote, stripForEar, synthesize, wantsVoice } from "../lib/war-room/voice.server";

const LONG = Array.from({ length: 20 }, (_, i) => `Sentence ${i} about Hoop Cares and her leads.`).join(" ");

// --- When a note is made (Jade's rules).
assert.equal(wantsVoice("what's up?", "Short answer."), false);
assert.equal(wantsVoice("what's up?", LONG), true, "over 120 words gets a note");
assert.equal(wantsVoice("tell me aloud", "Short."), true);
assert.equal(wantsVoice("send a voice note", "Short."), true);
assert.equal(wantsVoice("voice", "Short."), true);
assert.equal(wantsVoice("put this in my voice", "Short."), false, "'my voice' is a draft to copy, not audio");
assert.equal(wantsVoice("aloud", ""), false);

// --- The fallback when the rewrite fails still reads cleanly.
assert.equal(stripForEar("*Hoop* renews Oct 15 — see <https://olera.care/x|her page>."), "Hoop renews Oct 15, see her page.");
assert.ok(!stripForEar("Send this:\n> Hi Liz, quick one.\nThen wait.").includes("Hi Liz"), "a quoted draft is never read");
assert.ok(fitForSpeech("A. ".repeat(3_000)).length < 3_900);
assert.ok(fitForSpeech("A. ".repeat(3_000)).endsWith("The rest is in the text."));
console.log("voice rule checks passed");

// --- In the chat: text first, then the note; a short reply gets none.
const FOUNDER = "4242";
function fakes(reply: string) {
  const events: string[] = [];
  const store = memoryChatStore();
  const deps: TelegramDeps = {
    db: {} as SupabaseClient,
    store,
    founderChatId: FOUNDER,
    send: async (_chat, text) => { events.push(`text:${text.slice(0, 20)}`); return { success: true }; },
    typing: async () => undefined,
    download: async () => Buffer.from(""),
    transcribe: async () => null,
    answer: async () => ({ answered: true, reply }),
    voice: async (_chat, text, mode) => { events.push(`voice:${mode}:${text.slice(0, 20)}`); },
  };
  return { deps, events, store };
}
const update = (id: number, text: string): TelegramUpdate => ({
  update_id: id,
  message: { message_id: id, date: 1_790_000_000 + id * 60, chat: { id: Number(FOUNDER) }, from: { id: Number(FOUNDER) }, text },
});

(async () => {
  {
    const { deps, events } = fakes(LONG);
    await handleTelegramUpdate(update(1, "How is Hoop doing?"), deps);
    assert.deepEqual(events.map((e) => e.split(":")[0]), ["text", "voice"], "text first, then the note");
  }
  {
    const { deps, events } = fakes("Short answer.");
    await handleTelegramUpdate(update(2, "How is Hoop doing?"), deps);
    assert.deepEqual(events.map((e) => e.split(":")[0]), ["text"], "a short reply gets no note");
    await handleTelegramUpdate(update(3, "aloud"), deps);
    assert.equal(events[1], "voice:reply:Short answer.", "a bare 'aloud' speaks the last reply, not a new answer");
    assert.equal(events.length, 2, "and sends no new text");
  }
  {
    const { deps, events } = fakes("Short answer.");
    await handleTelegramUpdate(update(4, "Read me the plan for Hoop aloud"), deps);
    assert.deepEqual(events.map((e) => e.split(":")[0]), ["text", "voice"], "'aloud' in a question forces a note");
  }
  // A failed note never throws, and says why in the logs.
  const failed = await sendVoiceNote("1", "Hello there, this is long enough to speak.", "reply", {
    recording: async () => undefined,
    sendVoice: async () => ({ success: false, error: "chat not found" }),
  }, async () => Buffer.from("ogg"));
  assert.equal(failed.sent, false);
  assert.match(failed.error ?? "", /chat not found/);
  console.log("voice chat checks passed");

  if (!process.argv.includes("--live")) return;
  const [replyOut, briefOut] = process.argv.filter((arg) => arg.endsWith(".ogg"));
  const reply = "Two arms, both live. Google Search at $3.50/day, 247 impressions and 11 clicks for $26.42 so far, covering Jackson, Harrison and George counties; the team note says it ends Sep 28, so it stops tomorrow unless you extend it. Meta instant form to Oct 12, now $20/day after you doubled it from $10 last night, one ad active (the \"families\" copy) and the older version paused since Sep 24. The new thing: a lead landed at 4:05 AM ET, the first since the job-seeker screen went live, and she's waiting on the qualifying text. Here's a follow-up to send if she hasn't answered by 10 AM Central:\n\n> Hi Barbara, it's TJ with Olera, following up on your home care request for Hoop Cares. What would help most right now?\n\nNextdoor, promised to her on the Sep 16 call, is still not running, and her check-in is due Sep 30.";
  const brief = "*Hoop Cares renews Oct 15 ($75), in 18 days. A new Meta lead came in overnight: text her first.*\n\n> Hi Barbara, it's TJ with Olera...\n\n• Robbie at Assisting Hands hasn't picked a time for Wednesday 9/30.\n• Perez Health Care Group's campaign request has sat since Sep 25.\n\n_This brief cost $0.01._ <https://olera.care/admin/war-room|Cortex page>";
  for (const [text, mode, out] of [[reply, "reply", replyOut], [brief, "brief", briefOut]] as const) {
    const { spoken, costUsd } = await earRewrite(text, mode);
    const audio = await synthesize(spoken);
    if (out) fs.writeFileSync(out, audio);
    console.log(`\n${mode.toUpperCase()} spoken (${spoken.split(/\s+/).length} words, rewrite $${costUsd.toFixed(4)}, ${audio.length} bytes ogg, head ${audio.subarray(0, 4).toString("latin1")}):\n${spoken}`);
    assert.ok(!spoken.includes("Hi Barbara"), "the draft is not read aloud");
    assert.equal(audio.subarray(0, 4).toString("latin1"), "OggS", "Ogg container for sendVoice");
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
