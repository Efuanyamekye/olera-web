import { after, NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/admin";
import { downloadTelegramFile, founderChatId, sendTelegramMessage, sendTelegramRecording, sendTelegramTyping, sendTelegramVoice, transcribeVoiceNote } from "@/lib/telegram.server";
import { sendVoiceNote } from "@/lib/war-room/voice.server";
import { recordFounderReply } from "@/lib/war-room/moves.server";
import { startVisualRoutine } from "@/lib/war-room/visualize.server";
import { handleInboxCommand, inferInboxCommand, openItems, parseInboxCommand, rememberRewrites } from "@/lib/war-room/inbox-operator.server";
import { supabaseChatStore } from "@/lib/war-room/chat-memory.server";
import { saveHandoff } from "@/lib/war-room/handoff.server";
import { sendToSlack } from "@/lib/war-room/team-messages.server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/war-room/telegram-chat.server";

/**
 * Cortex's Telegram bot. Telegram posts every update here (set with
 * setWebhook, secret_token = TELEGRAM_CORTEX_WEBHOOK_SECRET).
 *
 * Answered at once and worked on in `after`: an answer takes up to a minute,
 * and Telegram re-sends an update it thinks failed. The update id is stored
 * before any work, so a re-send is dropped rather than answered twice.
 */
// An answer takes up to a minute and a voice note after it about 15 seconds more.
export const maxDuration = 180;

function secretMatches(given: string | null) {
  const expected = process.env.TELEGRAM_CORTEX_WEBHOOK_SECRET?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Without the secret anyone could post a fake update carrying his chat id.
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid JSON" });
  }

  after(async () => {
    try {
      const db = getServiceClient();
      const outcome = await handleTelegramUpdate(update, {
        db,
        store: supabaseChatStore(db),
        founderChatId: founderChatId(),
        send: sendTelegramMessage,
        typing: sendTelegramTyping,
        download: downloadTelegramFile,
        transcribe: transcribeVoiceNote,
        voice: (chatId, text, mode) => sendVoiceNote(chatId, text, mode, { recording: sendTelegramRecording, sendVoice: sendTelegramVoice }),
        reactions: { reply: (text, options) => recordFounderReply(db, text, options) },
        visual: { start: startVisualRoutine },
        team: { send: (target, text) => sendToSlack(target, text) },
        handoff: { save: (body, note) => saveHandoff(db, { body, note, chatId: founderChatId() ?? "" }) },
        inbox: {
          command: async (text, lastCortex) => {
            // A command with nothing open still gets a plain answer, not a
            // model reply to "send 3". Plain words ("check it", "send
            // those two") are read by Haiku only when no exact command fits.
            const command = parseInboxCommand(text) ?? await inferInboxCommand(text, await openItems(db), await lastCortex());
            return command ? handleInboxCommand(db, command) : null;
          },
          rewrites: (reply) => rememberRewrites(db, reply),
        },
      });
      console.log("[cortex] telegram update", update.update_id, JSON.stringify(
        outcome.handled ? { kind: outcome.kind, costUsd: outcome.costUsd } : { skipped: outcome.reason },
      ));
    } catch (error) {
      console.error("[cortex] telegram update failed:", error instanceof Error ? error.message : String(error));
    }
  });
  return NextResponse.json({ ok: true });
}
