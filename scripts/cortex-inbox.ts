/**
 * The inbox report's commands, for a Claude Code session working the day's
 * report with TJ (/handoff). Same code path as his Telegram replies.
 *
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts list
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts approve 2 5 7
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts "send 5: <his text>"
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts check 5
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/cortex-inbox.ts skip 4
 *
 * approve and send act for real: texts go to families, emails become Gmail
 * drafts. Run them only on his explicit choice. check calls Perplexity
 * (a few cents per draft). list reads only.
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
  if (!command) throw new Error(`not a command: "${words}". Try: list, approve 2 5, "send 5: text", check 5, skip 4`);
  console.log(await ops.handleInboxCommand(db, command) ?? "Nothing open.");
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
