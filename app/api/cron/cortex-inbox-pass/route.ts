import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { founderChatId, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram.server";
import { supabaseChatStore } from "@/lib/war-room/chat-memory.server";
import { renderDigest, runInboxPass } from "@/lib/war-room/inbox-operator.server";

/**
 * Cortex's inbox pass: twice a day, read support@ and the SMS inbox and send
 * the founder one numbered digest on Telegram. Nothing is sent to anyone else
 * until he approves an item by number. See lib/war-room/inbox-operator.server.ts.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("cortex-inbox-pass", async () => {
    const chatId = founderChatId();
    if (!isTelegramConfigured() || !chatId) return { ok: true, sent: false, reason: "Telegram not configured" };
    const db = getServiceClient();
    const pass = await runInboxPass(db);
    const digest = renderDigest(pass);
    const sent = await sendTelegramMessage(chatId, digest);
    if (sent.success) {
      await supabaseChatStore(db).append(chatId, { surface: "telegram", role: "cortex", kind: "brief", text: digest, at: new Date().toISOString() });
    }
    return { ok: true, sent: sent.success, items: pass.items.length, waitingElsewhere: pass.waitingElsewhere, costUsd: Number(pass.costUsd.toFixed(4)) };
  });
}
