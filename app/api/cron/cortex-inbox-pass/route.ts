import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { founderChatId, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram.server";
import { supabaseChatStore } from "@/lib/war-room/chat-memory.server";
import { saveInboxReport } from "@/lib/war-room/handoff.server";
import { inboxReportBody, renderDigest, renderSynopsis, runInboxPass } from "@/lib/war-room/inbox-operator.server";

/**
 * Cortex's inbox pass: once a day, read support@ and the SMS inbox, save the
 * full digest as the day's inbox report (a /handoff), and send the founder a
 * one-screen synopsis on Telegram. Nothing is sent to anyone else
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
    // The report is saved first: the synopsis points at it.
    let reportSaved = false;
    if (pass.items.length) {
      const report = inboxReportBody(pass);
      reportSaved = await saveInboxReport(db, { ...report, chatId }).then(() => true, (error: unknown) => {
        console.error("[cortex] inbox report not saved:", error instanceof Error ? error.message : String(error));
        return false;
      });
    }
    // No report, no synopsis: it would point at nothing, so the full digest goes instead.
    const digest = reportSaved || !pass.items.length ? renderSynopsis(pass) : renderDigest(pass);
    const sent = await sendTelegramMessage(chatId, digest);
    if (sent.success) {
      await supabaseChatStore(db).append(chatId, { surface: "telegram", role: "cortex", kind: "brief", text: digest, at: new Date().toISOString() });
    }
    return { ok: true, sent: sent.success, reportSaved, items: pass.items.length, waitingElsewhere: pass.waitingElsewhere, costUsd: Number(pass.costUsd.toFixed(4)) };
  });
}
