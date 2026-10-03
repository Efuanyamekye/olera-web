/**
 * Offline checks for the Google-reviews refresh plan and the manual-refresh
 * wait. No database, no Google.
 *
 *   npx tsx scripts/check-google-reviews-refresh.ts
 */
import assert from "node:assert/strict";
import { manualRefreshAllowed, planReviewRefresh, type RefreshCandidate } from "../lib/providers/review-refresh-plan";

const now = new Date("2026-10-03T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const c = (id: string, extra: Partial<RefreshCandidate> = {}): RefreshCandidate => ({ provider_id: id, place_id: `place-${id}`, last_viewed_at: null, last_synced: daysAgo(200), ...extra });

// Claimed providers come first however they sort otherwise, matched by id not slug.
{
  const plan = planReviewRefresh([
    c("longtail-old", { last_synced: daysAgo(400) }),
    c("viewed", { last_viewed_at: daysAgo(3), last_synced: daysAgo(120) }),
    c("claimed", { last_synced: daysAgo(95) }),
    c("fresh", { last_synced: daysAgo(10) }),
    c("never", { last_synced: null }),
  ], new Set(["claimed"]), now);
  assert.deepEqual(plan.items.map((i) => `${i.tier}:${i.provider_id}`), ["1:claimed", "2:viewed", "3:never", "3:longtail-old"]);
  assert.deepEqual(plan.counts, { tier1: 1, tier2: 1, tier3: 2, skipped: 1, overBudget: 0 });
}

// The cap cuts the long tail, never the claimed tier. This was the 2 Oct bug in reverse.
{
  const many = Array.from({ length: 50 }, (_, i) => c(`tail-${i}`, { last_synced: daysAgo(100 + i) }));
  const claimed = Array.from({ length: 5 }, (_, i) => c(`claimed-${i}`));
  const plan = planReviewRefresh([...many, ...claimed], new Set(claimed.map((x) => x.provider_id)), now, 8);
  assert.equal(plan.items.length, 8);
  assert.equal(plan.items.filter((i) => i.tier === 1).length, 5, "every claimed provider is in");
  assert.equal(plan.counts.overBudget, 47);
  // The long tail that did fit is the oldest.
  assert.deepEqual(plan.items.filter((i) => i.tier === 3).map((i) => i.provider_id), ["tail-49", "tail-48", "tail-47"]);
}

// A provider without a Place ID is never planned; a stale date that cannot be parsed counts as stale.
{
  const plan = planReviewRefresh([c("none", { place_id: "" }), c("garbage", { last_synced: "not a date" })], new Set(), now);
  assert.deepEqual(plan.items.map((i) => i.provider_id), ["garbage"]);
}

// The button: once a week for providers, any time with force (admins).
assert.deepEqual(manualRefreshAllowed(null, now), { allowed: true });
assert.deepEqual(manualRefreshAllowed(daysAgo(8), now), { allowed: true });
assert.deepEqual(manualRefreshAllowed(daysAgo(2), now), { allowed: false, nextAllowedAt: new Date(now.getTime() + 5 * 86_400_000).toISOString() });
assert.deepEqual(manualRefreshAllowed(daysAgo(2), now, true), { allowed: true });

console.log("google reviews refresh checks passed");
