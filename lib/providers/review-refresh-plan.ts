/**
 * Which providers the monthly Google-reviews cron refreshes, and in what order.
 *
 * Pure: no database, no Google. The cron feeds it every provider with a Place
 * ID and the set of claimed provider ids; it returns the ordered list to fetch,
 * cut at a budget. Claimed providers come first, always, because they are the
 * ones who notice. On 2 Oct 2026 two claimed providers wrote in with Google
 * counts months out of date: the cron read only the first 5,000 of 70,390
 * providers (no order) and matched "claimed" on a slug that differs for one in
 * ten claimed accounts, so 781 of 828 claimed providers were stale.
 */

export const REVIEW_STALE_DAYS = 90;
export const RECENTLY_VIEWED_DAYS = 30;
/** Fetches per run. Each is the Places reviews SKU, about 2.5 cents. */
export const DEFAULT_REFRESH_CAP = 5000;

export type RefreshCandidate = {
  provider_id: string;
  place_id: string;
  last_viewed_at: string | null;
  /** google_reviews_data->>last_synced, or null when never synced. */
  last_synced: string | null;
};

export type RefreshTier = 1 | 2 | 3;
export type RefreshPlanItem = { provider_id: string; place_id: string; tier: RefreshTier };
export type RefreshPlan = {
  items: RefreshPlanItem[];
  counts: { tier1: number; tier2: number; tier3: number; skipped: number; overBudget: number };
};

function isStale(lastSynced: string | null, now: Date): boolean {
  if (!lastSynced) return true;
  const at = Date.parse(lastSynced);
  return Number.isNaN(at) || at < now.getTime() - REVIEW_STALE_DAYS * 86_400_000;
}

/**
 * Tier 1: claimed and stale, oldest first. Tier 2: viewed in the last 30 days
 * and stale. Tier 3: everyone else stale, never-synced first, then oldest.
 * The cap applies across all tiers in that order, so a tight budget still
 * refreshes every claimed provider before any long-tail one.
 */
export function planReviewRefresh(
  providers: RefreshCandidate[],
  claimedIds: Set<string>,
  now: Date,
  cap: number = DEFAULT_REFRESH_CAP,
): RefreshPlan {
  const viewedSince = now.getTime() - RECENTLY_VIEWED_DAYS * 86_400_000;
  const tiers: Record<RefreshTier, RefreshCandidate[]> = { 1: [], 2: [], 3: [] };
  let skipped = 0;
  for (const p of providers) {
    if (!p.place_id) continue;
    if (!isStale(p.last_synced, now)) { skipped += 1; continue; }
    if (claimedIds.has(p.provider_id)) tiers[1].push(p);
    else if (p.last_viewed_at && Date.parse(p.last_viewed_at) > viewedSince) tiers[2].push(p);
    else tiers[3].push(p);
  }
  // Never synced sorts before any date, so the oldest gaps close first.
  const byAge = (a: RefreshCandidate, b: RefreshCandidate) =>
    (a.last_synced ? Date.parse(a.last_synced) : -1) - (b.last_synced ? Date.parse(b.last_synced) : -1);
  const ordered: RefreshPlanItem[] = ([1, 2, 3] as RefreshTier[]).flatMap((tier) =>
    tiers[tier].sort(byAge).map((p) => ({ provider_id: p.provider_id, place_id: p.place_id, tier })),
  );
  const items = ordered.slice(0, Math.max(0, cap));
  const count = (tier: RefreshTier) => items.filter((i) => i.tier === tier).length;
  return {
    items,
    counts: { tier1: count(1), tier2: count(2), tier3: count(3), skipped, overBudget: ordered.length - items.length },
  };
}

/** Days until a cached record may be refreshed again by a button press. */
export const MANUAL_REFRESH_MIN_DAYS = 7;

/**
 * Whether a manual refresh is allowed now, and if not, when. Admins pass
 * `force` to skip the wait; providers never do.
 */
export function manualRefreshAllowed(
  lastSynced: string | null,
  now: Date,
  force = false,
): { allowed: true } | { allowed: false; nextAllowedAt: string } {
  if (force || !lastSynced) return { allowed: true };
  const at = Date.parse(lastSynced);
  if (Number.isNaN(at)) return { allowed: true };
  const next = at + MANUAL_REFRESH_MIN_DAYS * 86_400_000;
  return next <= now.getTime() ? { allowed: true } : { allowed: false, nextAllowedAt: new Date(next).toISOString() };
}
