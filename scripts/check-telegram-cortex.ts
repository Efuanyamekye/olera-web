/**
 * Checks for Cortex on Telegram, with a fake Telegram and a fake model.
 *
 *   npx tsx scripts/check-telegram-cortex.ts
 *
 * With --live, runs a real conversation (the production model, read-only
 * database, memory in a map, nothing sent anywhere) and prints it, so a sample
 * exchange can be read before the bot exists. Costs about $0.50.
 *
 *   npx tsx --env-file=.env.local scripts/check-telegram-cortex.ts --live [path/to/screenshot.png]
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunkForTelegram, slackToTelegramHtml } from "../lib/telegram.server";
import { memoryChatStore, memoryPromptText } from "../lib/war-room/chat-memory.server";
import { handleTelegramUpdate, pickPhoto, sniffImageType, type TelegramDeps, type TelegramUpdate } from "../lib/war-room/telegram-chat.server";
import { conversationSystem } from "../lib/war-room/conversation.server";
import { artifactSubject } from "../lib/war-room/visualize.server";
import { handoffNote, handoffTitle, type Handoff } from "../lib/war-room/handoff.server";

// --- Formatting: Cortex writes Slack markup; Telegram reads HTML.
assert.equal(slackToTelegramHtml("*Hoop Cares* renews Oct 15."), "<b>Hoop Cares</b> renews Oct 15.");
assert.equal(slackToTelegramHtml("See <https://olera.care/admin/war-room|the Cortex page>."), `See <a href="https://olera.care/admin/war-room">the Cortex page</a>.`);
assert.equal(slackToTelegramHtml("a < b & c"), "a &lt; b &amp; c");
assert.equal(slackToTelegramHtml("_Taken as conversation._"), "<i>Taken as conversation.</i>");
assert.equal(slackToTelegramHtml("snake_case_word stays"), "snake_case_word stays");
assert.equal(slackToTelegramHtml("Draft:\n> Hi Liz,\n> Quick one.\nThen send it."), "Draft:\n<blockquote>Hi Liz,\nQuick one.</blockquote>\nThen send it.");
assert.equal(slackToTelegramHtml("<https://x.com/a_b_c>"), `<a href="https://x.com/a_b_c">https://x.com/a_b_c</a>`);
const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`).join("\n\n");
assert.ok(chunkForTelegram(long).every((chunk) => chunk.length <= 3_500), "chunks stay under the limit");
assert.equal(chunkForTelegram(long).join("\n\n"), long, "chunking loses nothing");
console.log("formatting checks passed");

// --- The prompt: one brain, two channel rules.
assert.ok(conversationSystem("telegram").includes("Ask at most one question"));
assert.ok(conversationSystem("slack").includes("Never end your reply with a question"));
assert.ok(!conversationSystem("slack").includes("{{QUESTION_RULE}}"));
assert.ok(conversationSystem("telegram").startsWith("You are Cortex, Olera's thinking partner"));
console.log("prompt checks passed");

// --- Artifact requests reach the /visualize bridge; ordinary questions do not.
assert.equal(artifactSubject("visualize the managed ads orientation"), "the managed ads orientation");
assert.equal(artifactSubject("/visualize"), "");
assert.equal(artifactSubject("Make an artifact of the managed ads orientation"), "the managed ads orientation");
assert.equal(artifactSubject("can you make a one-pager for Hoop Cares"), "Hoop Cares");
assert.equal(artifactSubject("turn that into a visual"), "");
assert.equal(artifactSubject("What visual did Hoop's ad use?"), null);
assert.equal(artifactSubject("How do I make an artifact?"), null, "a question about artifacts is not a request");
assert.equal(artifactSubject("Do you have a visual for Hoop?"), null);
assert.equal(artifactSubject("Put the visual in Slack for the team"), null);
assert.equal(artifactSubject("Make sure the visual is right"), null);
assert.equal(artifactSubject("I'll make a visual later"), null);
assert.equal(artifactSubject("Did you make a one-pager?"), null);
assert.equal(artifactSubject("Could you make a visual of the funnel?"), "the funnel");
assert.equal(artifactSubject("Turn the brief into an artifact"), "the brief");
assert.equal(artifactSubject("please make me an artifact"), "");
console.log("artifact trigger checks passed");

// --- "hand this off" at the start of a message; a question about handing off is conversation.
assert.equal(handoffNote("hand this off"), "");
assert.equal(handoffNote("Hand this off: the five benefits fixes"), "the five benefits fixes");
assert.equal(handoffNote("handoff the ZIP capture idea"), "the ZIP capture idea");
assert.equal(handoffNote("/handoff"), "");
assert.equal(handoffNote("note this for later"), "");
assert.equal(handoffNote("Save that for later. It's about SMS length"), "It's about SMS length");
assert.equal(handoffNote("Should we hand this off to Logan?"), null);
assert.equal(handoffNote("handoffs are working?"), null, "the word is not the command");
assert.equal(handoffNote("I'll note this for later"), null);
assert.equal(handoffTitle("# Capture ZIP in the Benefits Finder\n\nbody", ""), "Capture ZIP in the Benefits Finder");
assert.equal(handoffTitle("no heading", "the ZIP fix"), "the ZIP fix");
console.log("handoff trigger checks passed");

// --- The handler, with fakes.
assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/jpeg"), "image/png");
assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/png"), "image/jpeg");
assert.equal(sniffImageType(Buffer.from("fake"), "image/jpeg"), "image/jpeg");
assert.equal(pickPhoto([{ file_id: "s", file_size: 20_000 }, { file_id: "l", file_size: 300_000 }, { file_id: "xl", file_size: 9_000_000 }])?.file_id, "l");

const FOUNDER = "4242";
function fakes(overrides: Partial<TelegramDeps> = {}) {
  const sent: Array<{ chatId: string; text: string }> = [];
  const asked: Array<{ question: string; memory?: string; surface?: string; images: number; prior: string | null }> = [];
  const store = memoryChatStore();
  const deps: TelegramDeps = {
    db: {} as SupabaseClient,
    store,
    founderChatId: FOUNDER,
    send: async (chatId, text) => { sent.push({ chatId, text }); return { success: true }; },
    typing: async () => undefined,
    download: async () => Buffer.from("fake-image"),
    transcribe: async () => null,
    answer: async (_db, question, _focus, prior, options = {}) => {
      asked.push({ question, memory: options.memory, surface: options.surface, images: options.images?.length ?? 0, prior: prior?.answer ?? null });
      return { answered: true, reply: `Answer to: ${question}`, costUsd: 0.01 };
    },
    ...overrides,
  };
  return { deps, sent, asked, store };
}
const update = (id: number, text: string, chat = FOUNDER, extra: Partial<NonNullable<TelegramUpdate["message"]>> = {}): TelegramUpdate => ({
  update_id: id,
  message: { message_id: id, date: 1_790_000_000 + id * 60, chat: { id: Number(chat) }, from: { id: Number(chat) }, text, ...extra },
});

(async () => {
  // A stranger gets nothing, not even a reply.
  {
    const { deps, sent, asked } = fakes();
    const outcome = await handleTelegramUpdate(update(1, "hi", "999"), deps);
    assert.equal(outcome.handled, false);
    assert.equal(sent.length + asked.length, 0);
  }
  // Before the chat id is set, /start tells the sender their own id and nothing else.
  {
    const { deps, sent, asked } = fakes({ founderChatId: null });
    await handleTelegramUpdate(update(2, "/start", "777"), deps);
    assert.match(sent[0].text, /Your chat id is 777/);
    assert.equal(asked.length, 0);
    assert.equal((await handleTelegramUpdate(update(3, "what's up", "777"), deps)).handled, false);
  }
  // Memory across turns, and a retried update is not answered twice.
  {
    const { deps, sent, asked } = fakes();
    await handleTelegramUpdate(update(10, "What's going on with Robbie?"), deps);
    await handleTelegramUpdate(update(10, "What's going on with Robbie?"), deps);
    assert.equal(asked.length, 1, "a retry is dropped");
    assert.equal(asked[0].surface, "telegram");
    assert.equal(asked[0].memory, undefined, "nothing to remember on the first message");
    await handleTelegramUpdate(update(11, "And what should I say back?"), deps);
    assert.ok(asked[1].memory?.includes("He said: What's going on with Robbie?"), "the first question is remembered");
    assert.ok(asked[1].memory?.includes("You said: Answer to: What's going on with Robbie?"), "and the answer");
    assert.ok(!asked[1].memory?.includes("And what should I say back?"), "the new message is the question, not history");
    assert.equal(asked[1].prior, "Answer to: What's going on with Robbie?", "the last answer is there to be corrected");
    assert.equal(sent.length, 2);
  }
  // A screenshot with no words is still a question; a voice note without a key says so.
  {
    const { deps, asked } = fakes();
    await handleTelegramUpdate(update(20, "", FOUNDER, { text: undefined, photo: [{ file_id: "p", file_size: 50_000 }] }), deps);
    assert.equal(asked[0].images, 1);
    assert.match(asked[0].question, /What is this/);
  }
  {
    const { deps, sent, asked } = fakes();
    await handleTelegramUpdate(update(21, "", FOUNDER, { text: undefined, voice: { file_id: "v", mime_type: "audio/ogg" } }), deps);
    assert.equal(asked.length, 0);
    assert.match(sent[0].text, /can't hear voice notes yet/);
  }
  {
    const { deps, asked } = fakes({ transcribe: async () => "How is Hoop doing" });
    await handleTelegramUpdate(update(22, "", FOUNDER, { text: undefined, voice: { file_id: "v", mime_type: "audio/ogg" } }), deps);
    assert.equal(asked[0].question, "How is Hoop doing");
  }
  // An image format the model cannot read is said out loud, not dropped.
  {
    const { deps, sent } = fakes();
    await handleTelegramUpdate(update(23, "", FOUNDER, { text: undefined, document: { file_id: "h", mime_type: "image/heic", file_size: 100 } }), deps);
    assert.match(sent[0].text, /HEIC/);
  }
  // An artifact request gathers a brief and starts the routine, then sends the link.
  {
    const briefs: string[] = [];
    const started: string[] = [];
    const { deps, sent } = fakes({
      answer: async (_db, question, _f, _p, options = {}) => { briefs.push(`${options.mode}:${question}`); return { answered: true, reply: "BRIEF" }; },
      visual: { start: async (text) => { started.push(text); return { started: true, sessionUrl: "https://claude.ai/code/s1" }; } },
    });
    await handleTelegramUpdate(update(30, "make an artifact of the managed ads orientation"), deps);
    assert.deepEqual(briefs, ["brief:Write the source brief for a visual of: the managed ads orientation"]);
    assert.match(started[0], /BRIEF/);
    assert.match(sent[0].text, /claude\.ai\/code\/s1/);
  }
  // "hand this off": a brief in handoff mode, saved, and the reply says so only once the row exists.
  {
    const modes: string[] = [];
    const saved: Array<{ body: string; note: string }> = [];
    const { deps, sent, store } = fakes({
      answer: async (_db, question, _f, _p, options = {}) => { modes.push(`${options.mode}:${question.slice(0, 40)}`); return { answered: true, reply: "# Capture ZIP early\n\nBrief." }; },
      handoff: { save: async (body, note) => { saved.push({ body, note }); return { id: "abcdef12-0000", title: "Capture ZIP early", body, repo: "olera-web", status: "open", result: null, created_at: "", closed_at: null } as Handoff; } },
    });
    await handleTelegramUpdate(update(40, "hand this off: the benefits fixes"), deps);
    assert.equal(modes[0], "handoff:Write a handoff brief for a Claude Code ");
    assert.deepEqual(saved, [{ body: "# Capture ZIP early\n\nBrief.", note: "the benefits fixes" }]);
    assert.match(sent[0].text, /Handed off: "Capture ZIP early"/);
    assert.ok((store.messages.get(FOUNDER) ?? []).some((m) => m.role === "cortex" && /Handed off/.test(m.text)), "remembered");
  }
  {
    const { deps, sent } = fakes({
      answer: async () => ({ answered: true, reply: "# T\n\nThe brief." }),
      handoff: { save: async () => { throw new Error("the handoffs table isn't there yet (migration 265)"); } },
    });
    await handleTelegramUpdate(update(41, "hand this off"), deps);
    assert.match(sent[0].text, /^Nothing handed off: saving it failed \(the handoffs table/);
    assert.match(sent[0].text, /The brief\./, "the brief is shown so it isn't lost");
  }
  console.log("handler checks passed");

  if (!process.argv.includes("--live")) return;

  // --- Live sample: the real brain, read-only, nothing sent.
  const { readOnly } = await import("./replay-cortex-conversation");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));
  const screenshot = process.argv.find((arg) => /\.(png|jpe?g)$/i.test(arg));
  const { deps, sent, store } = fakes({ db, answer: undefined, download: async () => fs.readFileSync(screenshot!) });
  const turns: Array<[string, Partial<NonNullable<TelegramUpdate["message"]>>]> = [
    ["What should I be focused on today for Olera?", {}],
    ["What about Robbie?", {}],
    ...(screenshot ? [["", { text: undefined, caption: "Thoughts on this?", photo: [{ file_id: "shot", file_size: fs.statSync(screenshot).size }] }] as [string, Partial<NonNullable<TelegramUpdate["message"]>>]] : []),
  ];
  let id = 100;
  for (const [text, extra] of turns) {
    const outcome = await handleTelegramUpdate(update(id, text, FOUNDER, extra), deps);
    id += 1;
    console.log(`\nTJ: ${text || extra.caption || "(screenshot)"}${extra.photo ? " [screenshot]" : ""}`);
    console.log(`Cortex: ${sent[sent.length - 1]?.text}`);
    if (outcome.handled) console.log(`(cost $${(outcome.costUsd ?? 0).toFixed(2)})`);
  }
  console.log("\n--- memory as the next answer would read it ---\n" + memoryPromptText({ summary: null, recent: store.messages.get(FOUNDER) ?? [] }).slice(0, 1_200));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
