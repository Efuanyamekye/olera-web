/**
 * The Slack "what you owe" read against live data, read-only: stored channel
 * messages (and his DMs, if his token is connected), one Sonnet call (a few
 * cents). Posts nothing and writes nothing.
 *
 *   npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/slack-owed-dry.ts
 *   ... scripts/slack-owed-dry.ts --full   # print whole messages and drafts
 */
import Module from "node:module";

const load = (Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : load.call(this, request, ...rest);
};

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { findSlackOwed } = await import("../lib/war-room/slack-owed.server");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const full = process.argv.includes("--full");
  const words = (text: string, n: number) => (full ? text : `${text.replace(/\s+/g, " ").split(" ").slice(0, n).join(" ")}...`);
  const owed = await findSlackOwed(db);
  console.log(owed.coverage);
  console.log(`cost $${owed.costUsd.toFixed(4)}, ${owed.items.length} items\n`);
  owed.items.forEach((item, i) => {
    console.log(`${i + 1}. [${item.kind}] ${item.channelLabel} · ${item.author ?? "unattributed"} · ${item.ageDays}d · thread ${item.threadTs ?? "none"}`);
    console.log(`   said: ${words(item.text, 6)}`);
    console.log(`   draft: ${item.draftReply ? words(item.draftReply, 6) : "(none)"}`);
  });
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
