/**
 * Briefs Cortex handed off from Telegram ("hand this off"), for the /handoff skill.
 *
 *   npx tsx --env-file=.env.local scripts/cortex-handoffs.ts list
 *   npx tsx --env-file=.env.local scripts/cortex-handoffs.ts show <id>
 *   npx tsx --env-file=.env.local scripts/cortex-handoffs.ts close <id> done|partial|dropped "<PR URL or what's left>"
 *
 * An id prefix of 8 or more characters is enough. Closing writes the result
 * back, and Cortex reads it into its record, so say what shipped.
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function find(prefix: string) {
  if (!prefix || prefix.length < 8) throw new Error("give at least the first 8 characters of the id");
  const { data, error } = await db.from("cortex_handoffs").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const matches = (data ?? []).filter((row) => String(row.id).startsWith(prefix));
  if (matches.length !== 1) throw new Error(matches.length ? `${matches.length} handoffs start with ${prefix}` : `no handoff starts with ${prefix}`);
  return matches[0];
}

(async () => {
  const [command = "list", id, status, ...rest] = process.argv.slice(2);
  if (command === "list") {
    const { data, error } = await db.from("cortex_handoffs")
      .select("id, title, status, created_at")
      .in("status", ["open", "partial"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!data?.length) return console.log("No open Cortex handoffs.");
    for (const row of data) console.log(`${String(row.id).slice(0, 8)}  ${row.status.padEnd(7)}  ${row.created_at.slice(0, 10)}  ${row.title}`);
    return;
  }
  if (command === "show") {
    const row = await find(id);
    console.log(`id: ${row.id}\nstatus: ${row.status}\nrepo: ${row.repo}\nhanded off: ${row.created_at}${row.note ? `\nhis note: ${row.note}` : ""}\n\n${row.body}`);
    return;
  }
  if (command === "close") {
    if (!["done", "partial", "dropped"].includes(status)) throw new Error("status must be done, partial or dropped");
    const result = rest.join(" ").trim();
    if (!result) throw new Error("say what came of it: the PR URL, or what is left");
    const row = await find(id);
    const { error } = await db.from("cortex_handoffs")
      .update({ status, result, closed_at: status === "partial" ? null : new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    console.log(`${row.title}: ${status}. ${result}`);
    return;
  }
  throw new Error(`unknown command "${command}" (list, show, close)`);
})().catch((error) => {
  console.error(`cortex-handoffs: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
