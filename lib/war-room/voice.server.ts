import Anthropic from "@anthropic-ai/sdk";

/**
 * Cortex's voice notes on Telegram, modeled on Jade's (TJ rated Jade's
 * "Voice is perfect"): the text reply goes first, and a voice note follows
 * when the reply is long or he asks for one. The spoken version is rewritten
 * for the ear, not the text read out, and a message written for him to copy
 * and send is never read aloud.
 *
 * Jade speaks with Kokoro on TJ's Mac. Cortex runs on Vercel, so it uses
 * OpenAI's hosted TTS (the key is already set for transcription), in a voice
 * unlike Jade's so he can tell them apart by ear.
 */

/**
 * "aloud", "voice note/memo/message", or a bare "voice". Not "voice" inside a
 * sentence: "put this in my voice" is a draft he wants to copy (Jade's rule).
 */
export const VOICE_ASK = /\baloud\b|\bvoice\s+(note|memo|message)\b|^\s*voice\s*[.!?]?\s*$/i;

export function voiceMinWords(): number {
  const n = Number(process.env.CORTEX_VOICE_MIN_WORDS);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

export function wantsVoice(asked: string, reply: string, minWords = voiceMinWords()): boolean {
  if (!reply.trim()) return false;
  return VOICE_ASK.test(asked) || reply.trim().split(/\s+/).length > minWords;
}

/** The /aloud rules, condensed: written for the ear, not the eye. */
const EAR_RULES = `He is listening on his phone, often walking. He cannot see the text, scroll back, or re-read a sentence he missed.
- No markdown of any kind: no headers, bullets, numbered lists, tables or bold. Plain short paragraphs.
- Say numbers the way a person would when they carry the point: "twenty dollars a day", "October fifteenth", "about a third". Never read symbols, decimals or percent signs.
- No URLs, file paths, IDs or pull request numbers read out. Say what they are ("the pull request that adds Telegram").
- No em dashes. Periods and commas.
- Lead with the point. One idea per paragraph. Strictly linear: never "as I said above".
- Short sentences.`;

const REPLY_PROMPT = `Rewrite the reply below so it can be HEARD, as a voice note the founder of Olera plays on his phone.

${EAR_RULES}

Overrides:
- Same content, roughly the same length. Add nothing: no recap, padding, advice, urgency or closing ask the reply does not have. End where the reply ends.
- Keep every fact as given. Never say how something is known unless the reply says it.
- If the reply contains a message written for him to copy and send (a draft text, email or reply, often quoted or set off), do not read it: say "the draft is in the text above". Otherwise never mention a draft.
Output only the words to be spoken.

The reply:
`;

const BRIEF_PROMPT = `Rewrite today's brief below as a voice note the founder of Olera plays on his phone, like a sharp teammate giving him the morning over coffee.

${EAR_RULES}

Overrides:
- Hard cap 250 words. Condense: the one move first, then only what matters today. Drop the weakest item before going over.
- Keep every fact as given. Add nothing the brief does not say: no advice, urgency or commentary of your own ("get that on your radar", "follow up today", "that needs attention"). If the brief does not tell him to do something, neither do you.
- Skip any draft message written for him to send: say "the draft is in the text". No links, no cost lines, no page names.
- Open with one short line like "Here's your brief." End after the last item, no recap and no question.
Output only the words to be spoken.

The brief:
`;

/** On any rewrite failure, speak the text with the worst of the markup removed rather than skip the note. */
export function stripForEar(text: string): string {
  return text
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, "$1")
    .replace(/https?:\/\/\S+/g, "the link in the text")
    .split("\n").filter((line) => !/^\s*>/.test(line)).join("\n")
    .replace(/[*_#`|]/g, " ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// Haiku 4.5, per million tokens.
const HAIKU_PRICE = [1, 5] as const;

export async function earRewrite(text: string, mode: "reply" | "brief"): Promise<{ spoken: string; costUsd: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { spoken: stripForEar(text), costUsd: 0 };
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const reply = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1_500,
      messages: [{ role: "user", content: `${mode === "brief" ? BRIEF_PROMPT : REPLY_PROMPT}${text.slice(0, 12_000)}` }],
    }, { timeout: 30_000, maxRetries: 0 });
    const spoken = reply.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text.trim() ?? "";
    const costUsd = (reply.usage.input_tokens * HAIKU_PRICE[0] + reply.usage.output_tokens * HAIKU_PRICE[1]) / 1_000_000;
    if (spoken.split(/\s+/).length > 5) return { spoken: stripForEar(spoken), costUsd };
  } catch (error) {
    console.error("[cortex] ear rewrite failed:", error instanceof Error ? error.message : String(error));
  }
  return { spoken: stripForEar(text), costUsd: 0 };
}

/** Cortex's voice. Jade is Kokoro "af_heart", a light female voice; this is a low male one. */
export const CORTEX_VOICE = process.env.CORTEX_TTS_VOICE?.trim() || "onyx";
const TTS_MODEL = "gpt-4o-mini-tts";
// The endpoint's input limit; the ear rewrite keeps notes well under it.
const TTS_MAX_CHARS = 3_800;

/** Cut at a sentence end inside the limit, so the note never stops mid-word. */
export function fitForSpeech(text: string, limit = TTS_MAX_CHARS): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return `${end > limit / 2 ? cut.slice(0, end + 1) : cut} The rest is in the text.`;
}

/**
 * Ogg/Opus, which is what Telegram's sendVoice plays as a voice note.
 * gpt-4o-mini-tts is about $0.015 a minute of audio.
 */
export async function synthesize(text: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: CORTEX_VOICE,
      input: fitForSpeech(text),
      response_format: "opus",
      instructions: "A sharp, calm cofounder talking to a friend. Natural pace, warm but direct, no announcer tone.",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`speech returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Rough price of the audio: gpt-4o-mini-tts at ~$0.015 per spoken minute, ~150 words a minute. */
export function speechCostUsd(words: number): number {
  return (words / 150) * 0.015;
}

export type VoiceSender = {
  recording: (chatId: string) => Promise<void>;
  sendVoice: (chatId: string, audio: Buffer) => Promise<{ success: boolean; error?: string }>;
};

/**
 * Rewrite, speak, send. Runs after the text has gone out. Never throws: a
 * failed note leaves the text standing, and the reason goes to the logs.
 */
export async function sendVoiceNote(
  chatId: string,
  text: string,
  mode: "reply" | "brief",
  sender: VoiceSender,
  speak: (text: string) => Promise<Buffer> = synthesize,
): Promise<{ sent: boolean; words?: number; costUsd?: number; error?: string }> {
  try {
    await sender.recording(chatId).catch(() => undefined);
    const { spoken, costUsd: rewriteCost } = await earRewrite(text, mode);
    await sender.recording(chatId).catch(() => undefined);
    const audio = await speak(spoken);
    const sent = await sender.sendVoice(chatId, audio);
    const words = spoken.split(/\s+/).length;
    const costUsd = rewriteCost + speechCostUsd(words);
    if (!sent.success) throw new Error(sent.error ?? "sendVoice failed");
    console.log("[cortex] voice note", JSON.stringify({ mode, words, costUsd: Number(costUsd.toFixed(4)) }));
    return { sent: true, words, costUsd };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cortex] voice note failed:", message);
    return { sent: false, error: message };
  }
}
