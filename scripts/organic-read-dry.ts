/**
 * Build today's organic read against live Google data and print it. Read-only:
 * nothing is stored (rememberOrganicRead is not called). One Sonnet call, and
 * one Perplexity call when the competitor notes are stale (about a cent).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<path to the olera-ga4-reader key> \
 *     npx tsx --env-file=$HOME/Desktop/olera-web/.env.local scripts/organic-read-dry.ts
 */
import { createClient } from "@supabase/supabase-js";
import { buildOrganicRead } from "../lib/war-room/organic-read.server";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const started = Date.now();
  const read = await buildOrganicRead(db);
  console.log("=== SYNOPSIS ===\n" + read.synopsis.join("\n"));
  console.log("\n=== ACTION ===\n" + (read.action ? JSON.stringify({ title: read.action.title, why: read.action.why, metric: read.action.metric }, null, 2) + "\n--- brief ---\n" + read.action.brief : "(none)"));
  console.log("\n=== SECTION ===\n" + read.section);
  console.log(`\ncost $${read.costUsd.toFixed(4)}, ${((Date.now() - started) / 1000).toFixed(0)}s`);
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
