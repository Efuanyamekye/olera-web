/**
 * Checks for Cortex seeing live ad settings and work in progress.
 *
 *   npx tsx scripts/check-cortex-see-all.ts
 *
 * With --live, replays the 2026-09-27 exchange that failed: "Thoughts on this?"
 * with a screenshot of Hoop Cares' Meta ads. Meta's answers come from a saved
 * copy of the real Graph API responses (scripts/fixtures), GitHub is read live
 * with your gh login, the database is read-only. Costs about $0.40.
 * Pass = the answer does not recommend fixing the form or raising the budget,
 * both of which were already done.
 *
 *   npx tsx --env-file=.env.local scripts/check-cortex-see-all.ts --live path/to/screenshot.png
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describeChange, loadMetaCampaignSettings, type GraphGet } from "../lib/war-room/ad-settings.server";
import { scratchpadEntries } from "../lib/war-room/lookups.server";

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/meta-hoop-2026-09-27.json"), "utf8"));
const CAMPAIGN = fixture.campaign.id as string;

/** Answers Graph paths from the saved responses, as Meta would. */
const fixtureGet: GraphGet = async (graphPath) => {
  if (graphPath === CAMPAIGN) return fixture.campaign;
  if (graphPath === `${CAMPAIGN}/adsets`) return fixture.adsets;
  if (graphPath === `${CAMPAIGN}/ads`) return fixture.ads;
  if (graphPath.startsWith("act_")) return fixture.activities;
  if (fixture.forms[graphPath]) return fixture.forms[graphPath];
  throw new Error(`no fixture for ${graphPath}`);
};

(async () => {
  // --- Change history in plain words.
  const budget = fixture.activities.data.find((a: { translated_event_type: string }) => a.translated_event_type === "Campaign budget updated");
  assert.equal(describeChange(budget), "Campaign budget updated: $10.00 → $20.00 per day");
  const targeting = fixture.activities.data.find((a: { translated_event_type: string }) => a.translated_event_type === "Ad set targeting updated");
  assert.equal(describeChange(targeting), "Ad set targeting updated");
  assert.equal(describeChange({ translated_event_type: "Ad created", extra_data: "not json" }), "Ad created");

  // --- The live settings, read the way the lookup reads them.
  const settings = await loadMetaCampaignSettings([CAMPAIGN], { get: fixtureGet, now: Date.parse("2026-09-27T01:00:00Z") });
  assert.ok("campaigns" in settings);
  const hoop = settings.campaigns[0];
  assert.ok(!("unreadable" in hoop), "Hoop's campaign reads");
  if ("unreadable" in hoop) return;
  assert.equal(hoop.dailyBudget, "$20.00");
  assert.equal(hoop.ends, "2026-10-12T00:00:00-0500");
  assert.deepEqual(hoop.ads.map((ad) => [ad.name, ad.status]), [
    ["Hoop Cares - families - instant form v1 – Copy", "ACTIVE"],
    ["Hoop Cares - families - instant form v1", "PAUSED"],
  ]);
  assert.equal(hoop.ads[0].formId, "1244116964554729", "the running ad's form comes from its asset feed");
  const runningForm = hoop.forms.find((form) => form.id === "1244116964554729");
  assert.ok(runningForm && "questions" in runningForm && runningForm.questions[0].options.includes("I'm looking for a caregiving job"));
  assert.deepEqual(hoop.adSets[0].locations, ["Jackson County, Mississippi", "Harrison County, Mississippi", "George County, Mississippi"]);
  assert.ok(Array.isArray(hoop.recentChanges));
  if (!Array.isArray(hoop.recentChanges)) return;
  const changes = hoop.recentChanges.map((change) => change.change);
  assert.ok(changes.includes("Campaign budget updated: $10.00 → $20.00 per day"));
  assert.ok(changes.includes("Ad status updated: Pending process → Inactive"), "the old ad being switched off stays");
  assert.ok(!changes.some((change) => change.endsWith("→ Pending process")), "transitional noise is dropped");
  assert.equal(hoop.recentChanges.find((change) => change.change.startsWith("Campaign budget"))?.by, "Tokunbo Falohun");

  // The account's change log is read once per answer, not once per campaign.
  let logReads = 0;
  const counting: GraphGet = async (graphPath, params) => {
    if (graphPath.startsWith("act_")) logReads += 1;
    if (graphPath === "999999999") return { ...fixture.campaign, id: "999999999" };
    if (graphPath.startsWith("999999999/")) return { data: [] };
    return fixtureGet(graphPath, params);
  };
  const two = await loadMetaCampaignSettings([CAMPAIGN, "999999999"], { get: counting, now: Date.parse("2026-09-27T01:00:00Z") });
  assert.ok("campaigns" in two && two.campaigns.length === 2);
  assert.equal(logReads, 1, "two campaigns in one account share one read of its change log");
  assert.ok("campaigns" in await loadMetaCampaignSettings(["1", "2"]), "ids that are not Meta ids are ignored");

  // A refused read is named, never an empty campaign.
  const refused = await loadMetaCampaignSettings([CAMPAIGN], { get: async () => { throw new Error("(#200) Permissions error"); } });
  assert.ok("campaigns" in refused && "unreadable" in refused.campaigns[0]);
  delete process.env.META_ADS_ACCESS_TOKEN;
  assert.ok("unavailable" in await loadMetaCampaignSettings([CAMPAIGN]), "no token says so");
  console.log("ad settings checks passed");

  // --- Scratchpad entries by date.
  const markdown = "# Scratchpad\n## Current Focus\n### 2026-09-26 — STUCK case\nA fall, not a benefits question.\n\n### 2026-09-25 (later) — Four Meta arms rebuilt\nPublished.\n### 2026-09-10 — Old thing\nOld.";
  const entries = scratchpadEntries(markdown, 5, Date.parse("2026-09-27T00:00:00Z"));
  assert.deepEqual(entries.map((entry) => entry.date), ["2026-09-26", "2026-09-25"]);
  assert.equal(entries[0].title, "STUCK case");
  assert.equal(entries[1].title, "(later) — Four Meta arms rebuilt");
  console.log("scratchpad checks passed");

  if (!process.argv.includes("--live")) return;

  // --- Live replay of the failed exchange.
  const screenshot = process.argv.find((arg) => /\.(png|jpe?g)$/i.test(arg));
  assert.ok(screenshot, "pass a screenshot path");
  process.env.META_ADS_ACCESS_TOKEN = "fixture";
  process.env.WAR_ROOM_GITHUB_TOKEN ??= execSync("gh auth token").toString().trim();
  process.env.WAR_ROOM_GITHUB_REPOSITORY ??= "olera-care/olera-web";
  process.env.WAR_ROOM_CONVERSATION_MODEL ??= "claude-opus-5";
  // Graph calls are answered from the fixture; everything else goes out.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "graph.facebook.com") {
      const body = await fixtureGet(url.pathname.replace(/^\/v\d+\.0\//, ""), {});
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const { readOnly } = await import("./replay-cortex-conversation");
  const { answerFounderQuestion } = await import("../lib/war-room/conversation.server");
  const db = readOnly(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));
  const image = fs.readFileSync(screenshot!);
  const answer = await answerFounderQuestion(db, "Thoughts on this?", null, null, {
    surface: "telegram",
    images: [{ mediaType: image[0] === 0x89 ? "image/png" : "image/jpeg", data: image.toString("base64") }],
  });
  console.log(`\nTJ: Thoughts on this? [screenshot of Hoop Cares' Meta ads]\nCortex: ${answer.reply}\n(cost $${(answer.costUsd ?? 0).toFixed(2)})`);
  const reproposes = /(fix|tighten|rewrite|change|update) (the |her )?(form|copy)|(raise|increase|double|more money|more budget|put .* on meta)/i.test(answer.reply)
    && !/already/i.test(answer.reply);
  console.log(reproposes ? "\nFAIL: it re-proposes work that is already done." : "\nPASS: it does not re-propose the form fix or the budget raise.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
