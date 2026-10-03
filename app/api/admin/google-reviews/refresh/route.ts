import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { refreshGoogleReviews, type RefreshTarget } from "@/lib/providers";
import { MANUAL_REFRESH_MIN_DAYS } from "@/lib/providers/review-refresh-plan";

/**
 * GET /api/admin/google-reviews/refresh?provider_id=<directory id or account id>[&force=1]
 *
 * One click for the team when a provider writes in about a stale Google
 * count: re-sync that listing from Google. GET so it works from a browser
 * address bar as well as the button on /admin/directory/[providerId].
 * Honours the 7-day wait unless force=1. About 2.5 cents per call.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const providerId = request.nextUrl.searchParams.get("provider_id")?.trim();
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!providerId) return NextResponse.json({ error: "provider_id is required" }, { status: 400 });

  const db = getServiceClient();
  let target: RefreshTarget | null = null;
  const { data: row } = await db.from("olera-providers").select("provider_id, place_id").eq("provider_id", providerId).maybeSingle();
  if (row?.place_id) target = { source: "ios", providerId: row.provider_id as string, placeId: row.place_id as string };
  if (!target) {
    // An account id: a user-created listing, or a claimed one (then the directory row holds the cache).
    const { data: bp } = await db.from("business_profiles").select("id, source_provider_id, metadata").eq("id", providerId).maybeSingle();
    const placeId = (bp?.metadata as { google_metadata?: { place_id?: string } } | null)?.google_metadata?.place_id ?? null;
    if (bp?.source_provider_id) {
      const { data: dir } = await db.from("olera-providers").select("place_id").eq("provider_id", bp.source_provider_id).maybeSingle();
      const dirPlace = (dir?.place_id as string | null) ?? placeId;
      if (dirPlace) target = { source: "ios", providerId: bp.source_provider_id as string, placeId: dirPlace };
    } else if (bp && placeId) {
      target = { source: "bp", providerId: bp.id as string, placeId };
    }
  }
  if (!target) return NextResponse.json({ error: "No Google Place ID on this provider. Set one on the provider page first." }, { status: 404 });

  try {
    const outcome = await refreshGoogleReviews(db, target, { minDays: MANUAL_REFRESH_MIN_DAYS, force });
    if (outcome.refreshed) {
      return NextResponse.json({ ok: true, provider_id: target.providerId, rating: outcome.data.rating, review_count: outcome.data.review_count, last_synced: outcome.data.last_synced, actor: admin.email });
    }
    if (outcome.reason === "too_soon") {
      return NextResponse.json({ ok: false, error: `Refreshed on ${outcome.data?.last_synced?.slice(0, 10)}; add &force=1 to refresh anyway.`, next_allowed_at: outcome.nextAllowedAt }, { status: 429 });
    }
    return NextResponse.json({ ok: false, error: "Google returned no rating for this Place ID." }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refresh failed" }, { status: 500 });
  }
}
