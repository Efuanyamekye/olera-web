import type { AdBoostEligibility } from "./eligibility";

/**
 * Shared boost-state types + a tiny in-memory prefetch cache.
 *
 * The boost page can't know which sub-view to show (apply / queued / live)
 * until GET /api/provider/ad-boost/request resolves — so a cold render either
 * flashes a guessed page (jank) or holds a loader. To make the common in-app
 * path INSTANT and flash-free, entry points (Find Families, the dashboard hero)
 * prefetch the state into this module-level cache. The boost page then
 * initializes from the cache synchronously and renders the correct page on the
 * first frame — no loader, no wrong-page snap.
 *
 * Module-level = survives client-side navigation within the SPA session (which
 * is exactly the Find Families → Get Started flow). A full page reload clears
 * it (cold → loader, fine). TTL guards against acting on stale state; the boost
 * page always re-fetches in the background to reconcile + run promotion.
 */

export interface BoostRequest {
  id: string;
  status: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled";
  requested_setup_week: string;
  channel: string | null;
  /** Provider's intended monthly ad budget in whole USD (non-binding). NULL = not chosen. */
  intended_monthly_budget: number | null;
  campaign_tag: string | null;
  created_at: string;
}

export interface BoostStateResponse {
  eligibility: AdBoostEligibility;
  /** True if provider is verified or verification not required (high-trust). */
  isVerified: boolean;
  provider: {
    slug: string;
    displayName: string | null;
    city: string | null;
    state: string | null;
    category: string | null;
  };
  demand: {
    count: number;
    scope: "city" | "state" | null;
    city: string | null;
    state: string | null;
    category: string | null;
    windowDays: number;
  };
  request: BoostRequest | null;
  /** Families delivered so far by this provider's campaign (UTM-tagged benefits
   *  conversions). Legacy ROI signal — see campaignStats for real performance. */
  delivered: number;
  /** Real campaign performance: visitors + leads + questions on the provider's
   *  page since launch. Null until the campaign is live. `since` is an ISO
   *  timestamp. Questions are counted the same since-launch way (no UTM). */
  campaignStats: {
    visitors: number;
    leads: number;
    questions: { received: number; unanswered: number };
    since: string;
  } | null;
}

const TTL_MS = 60_000;
let cached: { data: BoostStateResponse; at: number } | null = null;

export function cacheBoostState(data: BoostStateResponse): void {
  cached = { data, at: Date.now() };
}

/** Returns the cached state if fresh (< TTL), else null. */
export function getCachedBoostState(): BoostStateResponse | null {
  if (!cached) return null;
  if (Date.now() - cached.at > TTL_MS) return null;
  return cached.data;
}

/** Warm the cache from an entry point so /provider/boost paints instantly.
 *  Best-effort and silent — a miss just means the boost page shows its loader. */
export async function prefetchBoostState(): Promise<void> {
  try {
    const res = await fetch("/api/provider/ad-boost/request", { credentials: "include" });
    if (res.ok) cacheBoostState((await res.json()) as BoostStateResponse);
  } catch {
    // best-effort; the boost page will fetch on its own
  }
}
