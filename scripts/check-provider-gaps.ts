/**
 * Deterministic checks for slice 3 (lib/war-room/provider-gaps.ts).
 *
 *   npx tsx scripts/check-provider-gaps.ts
 */
import assert from "node:assert/strict";
import { cardText, gapsFrom, gapsText, matchNamedProvider, providerLinksIn, rankGapRows } from "../lib/war-room/provider-gaps";

// Gaps: under 100% only, heaviest section first, in owner words.
const gaps = gapsFrom([
  { id: "overview", label: "Profile overview", percent: 100, weight: 12 },
  { id: "pricing", label: "Pricing", percent: 0, weight: 12 },
  { id: "gallery", label: "Gallery", percent: 40, weight: 15 },
  { id: "payment", label: "Accepted Payments & Insurance", percent: 50, weight: 6 },
]);
assert.deepEqual(gaps.map((g) => g.id), ["gallery", "pricing", "payment"]);
assert.equal(gaps[0].words, "photos (three or more)");

// Ranking: traffic floor, something to fix, most viewed first, counts beyond the cut.
const row = (slug: string, views: number, overall: number, n = 1) => ({ slug, provider_name: slug, city: "Tyler", state: "TX", views, overall, gaps: gaps.slice(0, n) });
const ranked = rankGapRows([row("a", 40, 60), row("b", 90, 80), row("c", 3, 10), row("d", 70, 100, 0)], 5, 10);
assert.deepEqual(ranked.shown.map((r) => r.slug), ["b", "a"], "c is under the floor, d has nothing to fix");
assert.equal(ranked.total, 2);
const text = gapsText(ranked, "https://olera.care", 28);
assert.ok(text?.includes("<https://olera.care/provider/b|b> (Tyler, TX): 90 views, 80% complete; missing photos (three or more)"));
assert.equal(gapsText({ shown: [], total: 0 }, "https://olera.care", 28), null);

// Names in Cortex's own posts, and which one he means.
const post = "• <https://olera.care/provider/bowie-commons|Bowie Commons> (Bowie, MD): 2 inquiries\n• <https://olera.care/provider/st-teresa-s-villa|St. Teresa's Villa> (Slidell, LA)\n• <https://olera.care/provider/bowie|Bowie> (X)";
const named = providerLinksIn(post);
assert.deepEqual(named.map((p) => p.slug), ["bowie-commons", "st-teresa-s-villa", "bowie"]);
assert.equal(matchNamedProvider("bowie commons", named)?.slug, "bowie-commons", "longest name wins");
assert.equal(matchNamedProvider("what about St Teresas Villa?", named)?.slug, "st-teresa-s-villa", "punctuation and apostrophes ignored");
assert.equal(matchNamedProvider("teresa", named)?.slug, "st-teresa-s-villa", "a fragment of a name");
assert.equal(matchNamedProvider("weekly, not daily", named), null, "tuning is not a name");
assert.equal(matchNamedProvider("ok", named), null);

// The card.
const card = cardText({ slug: "bowie-commons", name: "Bowie Commons", city: "Bowie", state: "MD", views: 31, questions: 2, inquiries: 2, claimed: true, lastActorAt: "2026-06-22T00:00:00Z", email: "office@bowie.example", overall: 62, gaps }, "https://olera.care", 28, new Date("2026-10-12T00:00:00Z"));
assert.match(card, /31 views, 2 questions, 2 inquiries\./);
assert.match(card, /Claimed; last acted 112 days ago\./);
assert.match(card, /Page 62% complete; missing photos \(three or more\), pricing/);
assert.match(card, /Email on file: office@bowie\.example/);

console.log("provider gaps checks passed");
