import { NextResponse } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/admin";
import { getSiteUrl } from "@/lib/site-url";
import { founderChatId, registerTelegramWebhook } from "@/lib/telegram.server";

/**
 * Setup for Cortex on Telegram, opened in the browser (GET) by an admin.
 * Registers the webhook for this deployment and says what is still missing,
 * so the steps after BotFather are "open this page" rather than a curl.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await getAdminUser(user.id))) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const url = `${getSiteUrl()}/api/integrations/telegram/webhook`;
  const result = await registerTelegramWebhook(url);
  const chatId = founderChatId();
  const next = !result.ok
    ? `Fix: ${result.error}`
    : !chatId
      ? `Webhook set. Now message ${result.bot ?? "the bot"} "/start": it replies with your chat id. Put it in TELEGRAM_CORTEX_CHAT_ID and redeploy.`
      : result.lastError
        ? "Webhook set, but Telegram's last delivery failed (see lastError). A 403 or 429 means the Vercel firewall is blocking Telegram: add a Bypass rule for path /api/integrations/telegram/webhook."
        : `Ready. Message ${result.bot ?? "the bot"} anything about Olera.`;
  return NextResponse.json({ ...result, chatIdSet: Boolean(chatId), next });
}
