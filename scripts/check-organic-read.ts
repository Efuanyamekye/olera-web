/**
 * Offline checks for Cortex's daily organic read: windows, the deterministic
 * findings, target metrics and the numbers block. No Google, no model, no
 * database.
 *
 *   npx tsx scripts/check-organic-read.ts
 */
import assert from "node:assert/strict";
import {
  analyzeOrganic, organicWindows, parseTarget, readTarget, renderFindings, targetString, type PageRow,
} from "../lib/war-room/organic-read.server";

// --- Windows: 28 days ending 3 days ago, and the 28 before, no overlap.
{
  const w = organicWindows(new Date("2026-10-02T01:00:00Z"));
  assert.deepEqual(w, { start: "2026-09-02", end: "2026-09-29", prevStart: "2026-08-05", prevEnd: "2026-09-01" });
}
console.log("window checks passed");

// --- Findings.
const row = (path: string, category: PageRow["category"], sessions: number, clicks: number, impressions: number, position: number | null): PageRow =>
  ({ path, category, sessions, clicks, impressions, position });
const windows = organicWindows(new Date("2026-10-02T01:00:00Z"));
const previous = [
  row("/provider/a", "provider", 200, 150, 4000, 4.0),   // loses sessions and clicks
  row("/provider/b", "provider", 50, 60, 1000, 5.0),     // CTR collapse: same rank, same impressions
  row("/provider/c", "provider", 30, 20, 800, 6.0),      // rank drop
  row("/provider/gone", "provider", 40, 25, 900, 8.0),   // vanishes from the current window
  row("/benefits/texas", "benefit", 100, 80, 2000, 3.0), // gains
  row("/caregiver-support/x", "editorial", 20, 10, 500, 9.0),
];
const current = [
  row("/provider/a", "provider", 120, 90, 2600, 4.2),  // impressions fell too: not a CTR collapse
  row("/provider/b", "provider", 48, 20, 980, 5.4),
  row("/provider/c", "provider", 25, 12, 760, 11.0),
  row("/benefits/texas", "benefit", 160, 130, 2600, 2.5),
  row("/benefits/new", "benefit", 30, 25, 400, 6.0),       // new page
  row("/caregiver-support/x", "editorial", 20, 10, 500, 9.0),
];
const f = analyzeOrganic(current, previous, windows);

assert.deepEqual(f.categories.provider.sessions, [193, 320], "provider sessions now, before; a missing page counts as zero");
assert.deepEqual(f.categories.benefit.sessions, [190, 100]);
assert.equal(f.categories.provider.pages, 4);
assert.equal(f.losers[0].path, "/provider/a", "largest loss first");
assert.ok(f.losers.some((d) => d.path === "/provider/gone"), "a page that disappeared is a loser, not missing");
assert.ok(!f.losers.some((d) => d.path === "/caregiver-support/x"), "a flat page is not a loser");
assert.equal(f.gainers[0].path, "/benefits/texas");
assert.ok(f.gainers.some((d) => d.path === "/benefits/new"), "a new page is a gainer");
assert.deepEqual(f.ctrCollapses.map((d) => d.path), ["/provider/b"], "CTR collapse needs steady impressions and rank");
assert.deepEqual(f.positionDrops.map((d) => d.path), ["/provider/c"]);
assert.deepEqual(f.impressionLosses.map((d) => d.path), ["/provider/gone"]);
assert.equal(f.providerAttribution.totalDelta, -127);
assert.equal(f.providerAttribution.top10Delta, -127, "four provider pages: the top ten is all of them");
assert.equal(f.providerAttribution.residual, 0);
assert.equal(f.providerAttribution.pagesDown, 4);
console.log("findings checks passed");

// --- Targets: what an action should move, read again later.
{
  const spec = parseTarget("page:/provider/a:search_clicks")!;
  assert.equal(targetString(spec), "page:/provider/a:search_clicks");
  assert.equal(readTarget(spec, current), 90);
  assert.equal(readTarget(parseTarget("category:benefit:organic_sessions")!, current), 190);
  assert.equal(readTarget(parseTarget("page:/provider/missing:search_clicks")!, current), null, "a page not in the data is unknown, not zero");
  assert.ok(Math.abs((readTarget(parseTarget("total:all:search_ctr")!, current) ?? 0) - 287 / 7840) < 1e-9);
  assert.equal(parseTarget("page:/x:total_users"), null, "GA4 total users is never a target");
  assert.equal(parseTarget(null), null);
  // A path with colons still parses: the measure is the last field.
  assert.equal(parseTarget("page:/provider/a:b:search_clicks")?.key, "/provider/a:b");
}
console.log("target checks passed");

// --- The numbers block comes from the findings, never the model.
{
  const block = renderFindings(f);
  assert.match(block, /\| provider \| 320 \| 193 \| -39\.7% \|/);
  assert.match(block, /\| benefit \| 100 \| 190 \| \+90\.0% \|/);
  assert.match(block, /`\/provider\/b` \(provider\): sessions 50 to 48, clicks 60 to 20/);
  assert.match(block, /-127 sessions overall/);
  assert.ok(!/[—–]/.test(block), "no em or en dashes");
}
console.log("render checks passed");
