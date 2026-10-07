/**
 * Deterministic checks for the press loop (lib/war-room/press.ts).
 *
 *   npx tsx scripts/check-press.ts
 */
import assert from "node:assert/strict";
import { isToPressAlias, parsePressQueries, pitchSubject, pitchSummary, pressFactsFrom, queryHash, worthPitching } from "../lib/war-room/press";

// The alias, To or Cc, any case.
assert.ok(isToPressAlias(["Press@Olera.care"], []));
assert.ok(isToPressAlias([], ["press@olera.care"]));
assert.ok(!isToPressAlias(["support@olera.care"], []));

// The model's extraction: an array with the query, fit clamped, bad emails dropped.
const parsed = parsePressQueries(`Here are the queries:
[{"outlet":"Senior Housing News","reporter":"Austin Montgomery","email":"austin@shn.example","query":"Looking for operators or tech companies using AI to screen senior living leads. Deadline Friday.","deadline":"Friday","fit":0.9,"angle":"open connections vs gatekeeping"},
 {"outlet":"Crypto Daily","email":"not-an-email","query":"Sources on bitcoin ETFs","fit":1.4},
 {"outlet":"x","query":"short"}]`);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].email, "austin@shn.example");
assert.equal(parsed[1].email, null);
assert.equal(parsed[1].fit, 1);
assert.deepEqual(parsePressQueries("NONE"), []);
assert.deepEqual(parsePressQueries("{}"), []);

// Worth pitching: fit at or above the floor AND a reply address, best first, capped.
const many = Array.from({ length: 6 }, (_, i) => ({ outlet: `O${i}`, reporter: null, email: `r${i}@x.example`, query: `query number ${i} about senior care`, deadline: null, fit: 0.5 + i * 0.1, angle: null }));
const picked = worthPitching(many);
assert.deepEqual(picked.map((q) => q.outlet), ["O5", "O4", "O3"], "three best at or above 0.6");
assert.equal(worthPitching([{ ...many[5], email: null }]).length, 0, "no reply address, no pitch");

// One query, one hash, whatever the digest run.
const h1 = queryHash("t1", { email: "A@X.example", query: "Looking for operators using AI" });
const h2 = queryHash("t1", { email: "a@x.example", query: "Looking for operators using AI" });
assert.equal(h1, h2);
assert.notEqual(h1, queryHash("t2", { email: "a@x.example", query: "Looking for operators using AI" }));

// Words.
assert.match(pitchSubject(parsed[0]), /^Re: Looking for operators or tech companies using AI to screen senior liv.{0,3}… \(source: Olera\)$/);
assert.equal(pitchSubject({ ...parsed[0], query: "Short ask." }), "Re: Short ask (source: Olera)");
assert.match(pitchSummary(parsed[0]), /^Pitch Austin Montgomery, Senior Housing News: "Looking for operators.*\(due Friday\) · open connections vs gatekeeping$/);

// The facts and angles sections come out of PRESS.md; nothing else does.
const md = "# Press\n\n## The loop\nstuff\n\n## Facts Cortex may use\n- fact one (6 Oct)\n\n## Angles Cortex can pitch\n- angle one\n\n## What exists already\n- notion";
assert.equal(pressFactsFrom(md), "## Facts Cortex may use\n- fact one (6 Oct)\n\n## Angles Cortex can pitch\n- angle one");

console.log("press checks passed");
