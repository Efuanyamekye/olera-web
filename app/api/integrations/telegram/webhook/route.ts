import { after, NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/admin";
import { downloadTelegramFile, founderChatId, sendTelegramMessage, sendTelegramTyping, transcribeVoiceNote } from "@/lib/telegram.server";
import { supabaseChatStore } from "@/lib/war-room/chat-memory.server";
import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/war-room/telegram-chat.server";

/**
 * Cortex's Telegram bot. Telegram posts every update here (set with
 * setWebhook, secret_token = TELEGRAM_CORTEX_WEBHOOK_SECRET).
 *
 * Answered at once and worked on in `after`: an answer takes up to a minute,
 * and Telegram re-sends an update it thinks failed. The update id is stored
 * before any work, so a re-send is dropped rather than answered twice.
 */
export const maxDuration = 120;

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
