#!/usr/bin/env node
/**
 * Write data/benefits/legacy-triage/replaced.json: each legacy-library
 * program the finder couldn't see, pointed at the draft that replaces it.
 * "map" rows in triage.json point at an existing draft; drafted rows point at
 * the draft benefits-add-programs.js added (added/<ST>.json). The duplicates
 * map reads this file, so a replaced legacy id leaves the program lists and
 * its page 308-redirects to the draft.
 *
 *   node scripts/benefits-legacy-replaced.js
 */
const fs = require("fs");
const path = require("path");
const DIR = path.resolve(__dirname, "..", "data", "benefits", "legacy-triage");
const rows = JSON.parse(fs.readFileSync(path.join(DIR, "triage.json"), "utf-8"));
const out = {};
const put = (st, from, to) => { if (from && to && from !== to) (out[st] ||= {})[from] = to; };
for (const r of rows) if (r.decision === "map") put(r.state, r.id, r.target);
const addedDir = path.join(DIR, "added");
let drafted = 0;
for (const f of fs.existsSync(addedDir) ? fs.readdirSync(addedDir) : []) {
  for (const a of JSON.parse(fs.readFileSync(path.join(addedDir, f), "utf-8"))) { if (a.legacyId) { put(a.state, a.legacyId, a.id); drafted++; } }
}
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
fs.writeFileSync(path.join(DIR, "replaced.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(`replaced.json: ${Object.values(out).reduce((n, m) => n + Object.keys(m).length, 0)} legacy ids (${drafted} drafted, the rest mapped)`);
