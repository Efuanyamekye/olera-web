import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { refreshGoogleReviews } from "@/lib/providers";

/**
 * POST /api/internal/backfill-google-review
 *
 * Fired (non-blocking) from a provider page view in two cases:
 *  - the provider has a Place ID but no cached Google data (min_days 0), or
 *  - the page is claimed and its cache is over 90 days old (min_days 90), so a
 *    provider's own page never shows a count months out of date between
 *    monthly cron runs (two claimed providers wrote in on 2 Oct 2026).
 *
 * `min_days` guards repeat views: Google is called only when the cache is at
 * least that old. When Google returns nothing for a page with no cache, an
 * empty record is written so later views stop re-triggering the fetch.
 */
export async function POST(request: NextRequest) {
  try {
    const { provider_id, place_id, source, min_days } = await request.json();
    if (!provider_id || !place_id) {
      return NextResponse.json({ error: "Missing provider_id or place_id" }, { status: 400 });
    }
    const outcome = await refreshGoogleReviews(
      getServiceClient(),
      { source: source === "bp" ? "bp" : "ios", providerId: String(provider_id), placeId: String(place_id) },
      { minDays: Number(min_days) > 0 ? Number(min_days) : 0, writeSentinel: true },
    );
    return NextResponse.json({ provider_id, refreshed: outcome.refreshed, reason: outcome.refreshed ? undefined : outcome.reason });
  } catch (err) {
    console.error("[backfill-google-review] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
