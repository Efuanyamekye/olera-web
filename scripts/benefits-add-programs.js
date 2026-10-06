#!/usr/bin/env node
/**
 * Draft named programs into a state's drafts.json without touching the rest.
 *
 * The full pipeline (benefits-pipeline.js --state XX --run) re-explores and
 * redrafts a whole state. This runs only dive → compare → classify → draft for
 * the programs named, and APPENDS each successful draft. An existing draft is
 * never overwritten, and a failed program is reported and skipped. Built for
 * the legacy-library programs the finder couldn't see (6 Oct 2026); the list
 * is data/benefits/legacy-triage/triage.json, rows with decision "draft".
 *
 *   node scripts/benefits-add-programs.js --state MI --name "Michigan PACE" [--name ...]   # dry run
 *   node scripts/benefits-add-programs.js --state MI --from-triage --run
 *   node scripts/benefits-add-programs.js --all-from-triage --run      # every state in the triage
 *
 * Writes data/pipeline/<ST>/drafts.json (appended), add-<date>.json (the dive,
 * classification and draft of this run, for the record), regenerates the
 * per-state drafts.ts, and records each added id against the legacy id it
 * replaces in data/benefits/legacy-triage/added/<ST>.json. A new draft never takes
 * a legacy id (getEnrichedProgram lets the legacy base win name and phone).
 */
const fs = require("fs");
const path = require("path");
const P = require("./benefits-pipeline.js");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const vals = (f) => argv.flatMap((a, i) => (a === f ? [argv[i + 1]] : []));
const RUN = has("--run");
const TRIAGE = path.resolve(__dirname, "..", "data", "benefits", "legacy-triage", "triage.json");
// One record per state, so runs for different states can go in parallel.
const ADDED_DIR = path.resolve(__dirname, "..", "data", "benefits", "legacy-triage", "added");

function jobs() {
  if (has("--all-from-triage") || has("--from-triage")) {
    const rows = JSON.parse(fs.readFileSync(TRIAGE, "utf-8")).filter((r) => r.decision === "draft");
    const states = has("--all-from-triage") ? [...new Set(rows.map((r) => r.state))] : vals("--state").map((s) => s.toUpperCase());
    return states.map((st) => ({ state: st, items: rows.filter((r) => r.state === st).map((r) => ({ name: r.draftName || r.name, legacyId: r.id })) }));
  }
  const st = (vals("--state")[0] || "").toUpperCase();
  return [{ state: st, items: vals("--name").map((name) => ({ name, legacyId: null })) }];
}

const ASSET_KEYS = new Set(["individual", "couple", "countedAssets", "exemptAssets", "homeEquityCap"]);
const slug = (s) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function addForState(state, items) {
  const entity = P.resolveEntity({ state });
  if (!entity) throw new Error(`unknown state ${state}`);
  const dirName = entity.dirName;
  const drafts = P.readJson(dirName, "drafts.json");
  if (!drafts?.programs) throw new Error(`${state}: no drafts.json`);
  const taken = new Set([...drafts.programs.map((p) => p.id), ...P.loadExistingPrograms(state).map((p) => p.id)]);
  const draftedNames = new Set(drafts.programs.map((p) => (p.name || "").toLowerCase()));
  const todo = items.filter((i) => !draftedNames.has(i.name.toLowerCase()));
  console.log(`\n${state}: ${todo.length} to add (${items.length - todo.length} already drafted by name)`);
  for (const i of todo) console.log(`   - ${i.name}${i.legacyId ? `  (replaces ${i.legacyId})` : ""}`);
  if (!RUN || !todo.length) return [];

  const dive = await P.phaseDive(entity, { programs: todo.map((i) => ({ name: i.name })) });
  const compare = P.phaseCompare(entity, dive, P.loadExistingPrograms(state));
  const classify = P.phaseClassify(entity, dive, compare);
  const draftedAt = new Date().toISOString().split("T")[0];
  const okDive = (dive?.programs || []).filter((p) => !p._error && !p._parseError);
  const added = [];
  for (const prog of okDive) {
    const item = todo.find((i) => i.name === prog.name) || todo.find((i) => i.name.toLowerCase() === String(prog.name).toLowerCase());
    const classification = (classify?.programs || []).find((c) => c.name === prog.name) || {};
    const built = P.buildProgramDraftPrompt(entity, prog, classification, draftedAt);
    let draft;
    try {
      draft = P.finalizeProgramDraft(await P.claudeChat(built.prompt, built.tokenLimit), prog, classification, draftedAt);
    } catch (err) {
      console.log(`   ERROR drafting "${prog.name}": ${err.message}`);
      continue;
    }
    if (draft._parseError || draft._error || !draft.name) {
      console.log(`   SKIP "${prog.name}": draft did not parse`);
      continue;
    }
    // The model sometimes adds fields the draft type doesn't have (an
    // assetLimits "notes"), which breaks the build; keep the known ones.
    const al = draft.structuredEligibility?.assetLimits;
    if (al && typeof al === "object") {
      draft.structuredEligibility.assetLimits = Object.fromEntries(Object.entries(al).filter(([k]) => ASSET_KEYS.has(k)));
    }
    const CONTACT_KEYS = new Set(["label", "description", "phone", "hours"]);
    if (Array.isArray(draft.contacts)) draft.contacts = draft.contacts.map((c) => Object.fromEntries(Object.entries(c || {}).filter(([k]) => CONTACT_KEYS.has(k))));
    // Caregiver support and respite are services a family gets; every state's
    // other caregiver draft is a benefit, and a "resource" is hidden from the plan.
    if (draft.programType === "resource" && /caregiver|respite/i.test(draft.name)) draft.programType = "benefit";
    let id = slug(draft.id || draft.name);
    while (taken.has(id)) id = `${id}-current`;
    draft.id = id;
    taken.add(id);
    added.push({ state, id, name: draft.name, legacyId: item?.legacyId ?? null, programType: draft.programType, draft });
    console.log(`   + ${id}  ${draft.name} [${draft.programType}]`);
  }

  // Re-read right before writing so a concurrent edit isn't lost; append only.
  const fresh = P.readJson(dirName, "drafts.json");
  const ids = new Set(fresh.programs.map((p) => p.id));
  for (const a of added) if (!ids.has(a.id)) fresh.programs.push(a.draft);
  fresh.total = fresh.programs.length;
  fresh.successful = fresh.programs.filter((p) => !p._error && !p._parseError).length;
  P.writeFile(dirName, "drafts.json", fresh);
  P.writeFile(dirName, `add-${draftedAt}.json`, { state, addedAt: new Date().toISOString(), dive, classify, added: added.map(({ draft, ...a }) => a) });
  P.generatePipelineDrafts({ dirName });
  return added.map(({ draft, ...a }) => a);
}

(async () => {
  const all = [];
  for (const j of jobs()) {
    if (!j.state || !j.items.length) { console.log("Nothing to do: give --state and --name, or --from-triage / --all-from-triage."); continue; }
    try {
      all.push(...(await addForState(j.state, j.items)));
    } catch (err) {
      console.log(`${j.state}: FAILED ${err.message}`);
    }
    if (RUN) {
      const mine = all.filter((a) => a.state === j.state);
      if (mine.length) {
        fs.mkdirSync(ADDED_DIR, { recursive: true });
        const file = path.join(ADDED_DIR, `${j.state}.json`);
        const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : [];
        fs.writeFileSync(file, JSON.stringify([...prev.filter((p) => !mine.some((a) => a.id === p.id)), ...mine], null, 2));
      }
    }
  }
  if (!RUN) console.log("\nDry run. Add --run to research and draft.");
  else console.log(`\nAdded ${all.length} programs. ${P.cost.summary()}`);
})();
