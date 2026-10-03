import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";
import { readGoogleReviews, refreshGoogleReviews, type RefreshTarget } from "@/lib/providers";
import { MANUAL_REFRESH_MIN_DAYS, manualRefreshAllowed } from "@/lib/providers/review-refresh-plan";

/**
 * The provider's own "Refresh reviews" button (account settings, Google
 * Business Profile section). GET says what Olera currently shows and when a
 * refresh is next allowed; POST re-syncs from Google, at most once every
 * MANUAL_REFRESH_MIN_DAYS. Two claimed providers wrote to support on 2 Oct
 * 2026 asking for exactly this; now they press a button.
 *
 * A claimed listing inherits its cache from the linked directory row, so the
 * refresh is written there; a user-created account keeps it in its metadata.
 */

async function resolveTarget(): Promise<{ target: RefreshTarget } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const db = getServiceClient();
  const { data: account } = await db.from("accounts").select("id").eq("user_id", user.id).single();
  if (!account) return { error: NextResponse.json({ error: "No account found" }, { status: 400 }) };
  const { data: profile } = await db
    .from("business_profiles")
    .select("id, source_provider_id, metadata")
    .eq("account_id", account.id)
    .in("type", ["organization", "caregiver"])
    .single();
  if (!profile) return { error: NextResponse.json({ error: "No provider profile found" }, { status: 400 }) };
  const meta = (profile.metadata || {}) as { google_metadata?: { place_id?: string } };
  let placeId = meta.google_metadata?.place_id ?? null;
  if (!placeId && profile.source_provider_id) {
    const { data: row } = await db.from("olera-providers").select("place_id").eq("provider_id", profile.source_provider_id).maybeSingle();
    placeId = (row?.place_id as string | null) ?? null;
  }
  if (!placeId) return { error: NextResponse.json({ error: "Connect your Google Business Profile first." }, { status: 400 }) };
  const target: RefreshTarget = profile.source_provider_id
    ? { source: "ios", providerId: profile.source_provider_id, placeId }
    : { source: "bp", providerId: profile.id, placeId };
  return { target };
}

function status(data: { rating: number; review_count: number; last_synced: string } | null, now: Date) {
  const allowed = manualRefreshAllowed(data?.last_synced ?? null, now);
  return {
    rating: data?.rating ?? null,
    review_count: data?.review_count ?? null,
    last_synced: data?.last_synced ?? null,
    can_refresh: allowed.allowed,
    next_allowed_at: allowed.allowed ? null : allowed.nextAllowedAt,
    min_days: MANUAL_REFRESH_MIN_DAYS,
  };
}

export async function GET() {
  const resolved = await resolveTarget();
  if ("error" in resolved) return resolved.error;
  const data = await readGoogleReviews(getServiceClient(), resolved.target);
  return NextResponse.json(status(data, new Date()));
}

export async function POST() {
  const resolved = await resolveTarget();
  if ("error" in resolved) return resolved.error;
  try {
    const outcome = await refreshGoogleReviews(getServiceClient(), resolved.target, { minDays: MANUAL_REFRESH_MIN_DAYS });
    if (outcome.refreshed) return NextResponse.json({ ok: true, ...status(outcome.data, new Date()) });
    if (outcome.reason === "too_soon") {
      return NextResponse.json({ ok: false, error: `Refreshed recently. You can refresh again after ${new Date(outcome.nextAllowedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`, ...status(outcome.data, new Date()) }, { status: 429 });
    }
    return NextResponse.json({ ok: false, error: "Google returned no rating for this listing. Check the connected Place ID.", ...status(outcome.data, new Date()) }, { status: 502 });
  } catch (err) {
    console.error("[google-business/refresh] failed:", err);
    return NextResponse.json({ error: "Refresh failed. Try again in a minute." }, { status: 500 });
  }
}
