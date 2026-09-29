/**
 * Run Cortex's lean scan on today's data, end to end, writing nothing.
 *
 * Builds the same inputs the scan would, sends the one lean call, drafts the
 * agenda item if one is nominated, and runs the same deterministic gate
 * persistence runs. Prints each call's tokens and cost, the four priority
 * reads, the conditions that would be saved and any proposal that would clear
 * the gate. Nothing reaches the War Room tables, the brief or Slack: the
 * database client is wrapped read-only.
 *
 *   npx tsx scripts/cortex-dev-lean.ts
 *   npx tsx scripts/cortex-dev-lean.ts --force-draft          # measure an agenda day
 *   npx tsx scripts/cortex-dev-lean.ts --model claude-haiku-4-5-20251001
 *   npx tsx scripts/cortex-dev-lean.ts --json out.json
 *
 * Modules that import 'server-only' fail under tsx; run with NODE_PATH pointing
 * at a directory holding an empty `server-only` package if needed.
 */
import fs from "node:fs";
import path from "node:path";
import { readOnly } from "./replay-cortex-conversation";

const PRICE: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

function loadEnv() {
  const candidates = [path.resolve(".env.local"), path.join(process.env.HOME ?? "", "Desktop/olera-web/.env.local")];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 1 || line.startsWith("#")) continue;
    process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  let jsonPath: string | null = null;
  let model: string | undefined;
  let forceDraft = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--json") jsonPath = args[++i] ?? null;
    else if (args[i] === "--model") model = args[++i];
    else if (args[i] === "--force-draft") forceDraft = true;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { devLeanScan, devWarRoomLeanContext } = await import("../lib/war-room/discovery.server");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));

  if (args.includes("--context-only")) {
    // No model call: the payload and its size by section.
    const context = await devWarRoomLeanContext(db);
    for (const [key, value] of Object.entries(context)) console.log(`${key.padEnd(24)} ${JSON.stringify(value).length}`);
    console.log(`${"total".padEnd(24)} ${JSON.stringify(context).length}`);
    if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(context, null, 2));
    process.exit(0);
  }

  const started = Date.now();
  const result = await devLeanScan(db, { model, forceDraft });
  console.log(`\nLean context ${result.contextChars.toLocaleString()} chars; full sweep context ${result.fullContextChars.toLocaleString()} chars.`);

  let total = 0;
  console.log("\nCalls:");
  for (const call of result.calls) {
    const price = PRICE[call.model];
    const usd = price ? (call.inputTokens * price.input + call.outputTokens * price.output) / 1_000_000 : NaN;
    total += usd;
    console.log(`  ${call.stage.padEnd(18)} ${call.model.padEnd(28)} ${String(call.inputTokens).padStart(7)} in ${String(call.outputTokens).padStart(6)} out  $${usd.toFixed(4)}  ${Math.round(call.ms / 1000)}s`);
  }
  console.log(`  total $${total.toFixed(4)}${result.forcedDraft ? " (draft FORCED for measurement; production would not draft today)" : ""}, ${Math.round((Date.now() - started) / 1000)}s`);

  console.log("\nPriority reads:");
  for (const read of result.output.priorityReads ?? []) {
    console.log(`  ${read.priority.padEnd(10)} ${read.status.padEnd(9)} ${read.read}  [${read.evidenceIds.join(", ")}]`);
  }
  console.log("\nConditions (model):");
  for (const condition of result.output.conditions ?? []) {
    console.log(`  ${condition.disposition.disposition.padEnd(11)} ${condition.priority.padEnd(10)} ${condition.weight.impact}/${condition.weight.strategicFit} ${condition.fingerprint}\n      ${condition.title}\n      evidence: ${condition.evidenceIds.join(", ")}  probe: ${condition.nextProbe}`);
  }
  console.log("\nWould persist (after validation):");
  for (const investigation of result.investigations) {
    const assessment = result.assessments.find((item) => item.fingerprint === investigation.fingerprint);
    console.log(`  ${String(assessment?.disposition).padEnd(11)} ${investigation.domain.padEnd(11)} ${investigation.impact}/${investigation.strategicFit} ${investigation.fingerprint}`);
  }
  console.log(`\nAgenda: ${JSON.stringify(result.output.agenda?.kind)} ${result.output.agenda?.fingerprint || ""} ${result.output.agenda?.reason || ""}`);
  if (result.agendaSkipped.length) console.log(`  skipped: ${result.agendaSkipped.join(" ")}`);
  for (const proposal of result.draftedProposals) console.log(`  drafted: ${proposal.actionKind} ${proposal.title}`);
  console.log(`  cleared gate: ${result.gatedProposals.map((proposal) => proposal.title).join(" | ") || "none"}`);
  console.log(`\nCompany read (${result.companyRead.stance}): ${result.companyRead.summary}`);
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify({ usd: total, ...result }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
