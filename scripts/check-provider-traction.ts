/**
 * Deterministic checks for the traction lists (lib/war-room/provider-traction.ts).
 *
 *   npx tsx scripts/check-provider-traction.ts
 */
import assert from "node:assert/strict";
import { bucketOf, buildTractionLists, tractionScore, tractionText, type TractionRow } from "../lib/war-room/provider-traction";

const now = new Date("2026-10-12T06:00:00Z");
const row = (over: Partial<TractionRow>): TractionRow => ({
  provider_id: "id", slug: "slug", provider_name: "Name", city: "City", state: "ST", category: "Assisted Living",
  views: 0, questions: 0, inquiries: 0, claimed: false, lastActorAt: null, hasEmail: true, ...over,
});

// One inquiry outweighs twenty views; a question is worth ten.
assert.equal(tractionScore(row({ views: 20, questions: 1, inquiries: 1 })), 55);

// Buckets: unclaimed, claimed and quiet for 28 days, claimed and active.
assert.equal(bucketOf(row({ claimed: false, lastActorAt: "2026-10-11T00:00:00Z" }), now), "unclaimed");
assert.equal(bucketOf(row({ claimed: true, lastActorAt: null }), now), "claimed_silent");
assert.equal(bucketOf(row({ claimed: true, lastActorAt: "2026-08-05T00:00:00Z" }), now), "claimed_silent");
assert.equal(bucketOf(row({ claimed: true, lastActorAt: "2026-10-01T00:00:00Z" }), now), "claimed_active");

// Only intent qualifies: views alone never make the list.
const lists = buildTractionLists([
  row({ slug: "views-only", views: 500 }),
  row({ slug: "meadows", provider_name: "Meadows At Mitchell Field", views: 65, inquiries: 4, claimed: true, lastActorAt: "2026-08-05T18:07:01Z" }),
  row({ slug: "bowie", provider_name: "Bowie Commons", views: 31, questions: 2, inquiries: 2, claimed: true, lastActorAt: "2026-06-22T12:27:31Z" }),
  row({ slug: "active", provider_name: "Active One", questions: 3, claimed: true, lastActorAt: "2026-10-10T00:00:00Z" }),
  row({ slug: "open-listing", provider_name: "Open Listing", questions: 1, inquiries: 1, claimed: false, hasEmail: false }),
], now, 10);
assert.deepEqual(lists.claimedSilent.map((r) => r.slug), ["meadows", "bowie"], "ranked by score, claimed and silent only");
assert.deepEqual(lists.unclaimed.map((r) => r.slug), ["open-listing"]);
assert.deepEqual(lists.counts, { unclaimed: 1, claimed_silent: 2, claimed_active: 1 });

// The limit cuts the names, not the counts.
const many = buildTractionLists(Array.from({ length: 15 }, (_, i) => row({ slug: `u${i}`, questions: 1 + i })), now, 10);
assert.equal(many.unclaimed.length, 10);
assert.equal(many.counts.unclaimed, 15);
assert.equal(many.unclaimed[0]?.slug, "u14", "highest score first");

// Words: links, demand, silence, the missing email, and the way to ask for a draft.
const text = tractionText(lists, now, "https://olera.care");
assert.ok(text && text.includes("<https://olera.care/provider/meadows|Meadows At Mitchell Field> (City, ST): 4 inquiries, 65 views; last acted 67 days ago"));
assert.ok(text && text.includes("Open Listing> (City, ST): 1 inquiry, 1 question; no email on file"));
assert.ok(text && text.includes("Claimed and silent (2)"));
assert.ok(text && text.includes("1 claimed provider with demand did act this month"), "singular");
assert.ok(tractionText(many, now, "https://olera.care")?.includes("0 claimed providers with demand"), "plural");
assert.equal(tractionText(buildTractionLists([row({ views: 9 })], now), now, "https://olera.care"), null, "nothing qualifies, nothing said");

console.log("provider traction checks passed");
