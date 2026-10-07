import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { founderChatId, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram.server";
import { supabaseChatStore } from "@/lib/war-room/chat-memory.server";
import { runJudgmentTick } from "@/lib/war-room/judgment-tick.server";
import { prepareMeetings } from "@/lib/war-room/meeting-prep.server";

/**
 * Cortex's judgment tick: every three hours, look for a moment worth
 * messaging the founder about, and usually stay silent. See
 * lib/war-room/judgment-tick.server.ts.
 */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("cortex-tick", async () => {
    const db = getServiceClient();
    // Meeting prep (slice 5): a direct message to the founder for each
    // external meeting in the next six hours. Independent of Telegram.
    const meetingPrep = await prepareMeetings(db).catch((err) => ({ checked: 0, outcomes: [], unavailable: err instanceof Error ? err.message : String(err) }));
    const chatId = founderChatId();
    if (!isTelegramConfigured() || !chatId) return { ok: true, spoke: false, reason: "Telegram not configured", meetingPrep };
    const store = supabaseChatStore(db);
    const result = await runJudgmentTick({
      db,
      chatId,
      send: sendTelegramMessage,
      remember: (text, kind) => store.append(chatId, { surface: "telegram", role: "cortex", kind, text, at: new Date().toISOString() }),
    });
    return { ok: true, ...result, meetingPrep };
  });
}
