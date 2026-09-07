import { NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { getProviderCities } from "@/lib/providers";
import type { ProviderCity } from "@/lib/providers";

/**
 * GET /api/admin/operating-map/cities
 *
 * The operating map's top node: every city Olera has live providers in.
 *
 * "A city we have" is not a record anywhere — there is no cities table.
 * This route settles on the one definition the platform can prove: distinct
 * normalized city/state across non-deleted provider rows, which is also what
 * the public sitemap publishes city pages for. It is wider than "cities we
 * launched", since the directory carries rows in places the city pipeline
 * never ran, so the UI labels it as coverage rather than launches.
 *
 * Returns:
 *   - cities:    [{ city, state, slug, providers }], busiest first
 *   - total:     number of distinct cities
 *   - truncated: the scan hit its row ceiling, so `total` is a floor
 */

/**
 * Never prerendered or shared. `revalidate` would hand this route to Next's
 * cache, which is the wrong place for an authorized admin response — the
 * build proved it by executing the handler with no request behind it. The
 * scan is still expensive, so it is memoized in-process instead: same
 * saving, no cache entry that could outlive or cross an admin session.
 */
export const dynamic = "force-dynamic";

/** The city set only moves when the city pipeline runs. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type Payload = { cities: ProviderCity[]; total: number; truncated: boolean };
let cache: { at: number; payload: Payload } | null = null;

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json(cache.payload);
    }

    const { cities, truncated } = await getProviderCities(getServiceClient());
    const payload: Payload = { cities, total: cities.length, truncated };
    cache = { at: Date.now(), payload };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[operating-map/cities] Failed:", error);
    // Deliberately no fallback count. A wrong number in the map's top node
    // would be read as fact by everything under it; an error is honest.
    return NextResponse.json({ error: "Failed to load cities" }, { status: 500 });
  }
}
