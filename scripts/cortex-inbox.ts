/**
 * The inbox report's commands, for a Claude Code session working the day's
 * report with TJ (/handoff). Same code path as his Telegram replies.
 *
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts list
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts check 5
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts "check 5: <his version>"
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts skip 4
 *
 * Approvals don't run here. Archiving and email drafts go through Gmail, and
 * its OAuth keys live only in Vercel, not in .env.local, so a local "approve"
 * would fail partway. "approve" and "send" print the line to send Cortex on
 * Telegram (desktop or phone), which runs them in production. list reads
 * only; check calls Perplexity (a few cents per draft); skip marks the item.
 */
import Module from "node:module";

// The inbox code imports "server-only", which throws outside Next.
const load = (Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : load.call(this, request, ...rest);
};

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const ops = await import("../lib/war-room/inbox-operator.server");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const words = process.argv.slice(2).join(" ").trim() || "list";
  if (words === "list") {
    const open = (await ops.openItems(db)).filter((item) => !(item as { decided_at?: string | null }).decided_at);
    console.log(open.length
      ? ops.renderDigest({ passId: open[0].pass_id, items: open, waitingElsewhere: 0, costUsd: 0 })
      : "Nothing from the inbox is open.");
    return;
  }
  const command = ops.parseInboxCommand(words);
  if (!command) throw new Error(`not a command: "${words}". Try: list, check 5, "check 5: text", skip 4, or approve 2 5 for the Telegram line`);
  if (command.verb === "approve") {
    console.log(`Not run here (Gmail's keys are only in production). Send Cortex this on Telegram:\n\n${words.replace(/^(yes|do|ok)\b/i, "approve")}`);
    return;
  }
  console.log(await ops.handleInboxCommand(db, command) ?? "Nothing open.");
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
