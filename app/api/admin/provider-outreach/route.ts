import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * Outreach stages and their properties
 */
export const OUTREACH_STAGES = [
  "not_contacted",
  "in_sequence",
  "needs_call",
  "called",
  "claimed",
  "not_interested",
  "archived",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const TERMINAL_STAGES: OutreachStage[] = ["claimed", "not_interested", "archived"];

interface ProviderRow {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
}

interface TrackingRow {
  id: string;
  provider_id: string;
  stage: OutreachStage;
  city: string | null;
  state: string | null;
  stage_changed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachProvider {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
  // Tracking info (if exists)
  tracking_id: string | null;
  stage: OutreachStage;
  stage_changed_at: string | null;
  notes: string | null;
}

/**
 * GET /api/admin/provider-outreach
 *
 * List providers by stage with optional city filter.
 *
 * Query params:
 *   - state (required): State to filter by
 *   - stage (optional): Filter by stage (default: "not_contacted")
 *   - city (optional): Filter by city
 *
 * For "not_contacted" stage:
 *   Returns unclaimed providers not in tracking table (or with stage = not_contacted)
 *
 * For other stages:
 *   Returns providers from tracking table with that stage, joined with provider details
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state");
    const stage = (searchParams.get("stage") || "not_contacted") as OutreachStage;
    const city = searchParams.get("city");

    if (!state) {
      return NextResponse.json({ error: "State parameter is required" }, { status: 400 });
    }

    if (!OUTREACH_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Invalid stage parameter" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get stage counts for tabs
    const stageCounts = await getStageCounts(db, state);

    if (stage === "not_contacted") {
      // Special case: providers NOT in tracking OR with stage = not_contacted
      const providers = await getNotContactedProviders(db, state, city);
      return NextResponse.json({ providers, stage_counts: stageCounts });
    }

    // For other stages: query tracking table and join with providers
    let trackingQuery = db
      .from("provider_outreach_tracking")
      .select("*")
      .eq("state", state)
      .eq("stage", stage);

    if (city) {
      trackingQuery = trackingQuery.eq("city", city);
    }

    const { data: trackingRows, error: trackingError } = await trackingQuery;

    if (trackingError) {
      console.error("[provider-outreach] Tracking query error:", trackingError);
      return NextResponse.json({ error: "Failed to fetch tracking data" }, { status: 500 });
    }

    if (!trackingRows || trackingRows.length === 0) {
      return NextResponse.json({ providers: [], stage_counts: stageCounts });
    }

    // Get provider details for tracked providers
    const providerIds = trackingRows.map((t) => t.provider_id);
    const { data: providerRows, error: provError } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, email, phone, website, slug")
      .in("provider_id", providerIds);

    if (provError) {
      console.error("[provider-outreach] Provider query error:", provError);
      return NextResponse.json({ error: "Failed to fetch provider details" }, { status: 500 });
    }

    // Join tracking with provider data
    const providerMap = new Map((providerRows || []).map((p) => [p.provider_id, p as ProviderRow]));
    const providers = (trackingRows as TrackingRow[])
      .map((t): OutreachProvider | null => {
        const p = providerMap.get(t.provider_id);
        if (!p) return null;
        return {
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          provider_category: p.provider_category,
          city: p.city,
          state: p.state,
          email: p.email,
          phone: p.phone,
          website: p.website,
          slug: p.slug,
          tracking_id: t.id,
          stage: t.stage,
          stage_changed_at: t.stage_changed_at,
          notes: t.notes,
        };
      })
      .filter((p): p is OutreachProvider => p !== null)
      .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

    return NextResponse.json({ providers, stage_counts: stageCounts });
  } catch (err) {
    console.error("[provider-outreach] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * Get providers in "not_contacted" stage:
 * - Not deleted
 * - Not claimed (no business_profile with account_id)
 * - Not in tracking table OR in tracking with stage = not_contacted
 */
async function getNotContactedProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  city: string | null
): Promise<OutreachProvider[]> {
  // Get all providers in this state
  let providerQuery = db
    .from("olera-providers")
    .select("provider_id, provider_name, provider_category, city, state, email, phone, website, slug")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (city) {
    providerQuery = providerQuery.eq("city", city);
  }

  const { data: providers, error: provError } = await providerQuery;

  if (provError) {
    console.error("[provider-outreach] Provider query error:", provError);
    throw new Error("Failed to fetch providers");
  }

  if (!providers || providers.length === 0) {
    return [];
  }

  const providerIds = providers.map((p) => p.provider_id);

  // Get claimed providers (have business_profile with account_id)
  const { data: claimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .in("source_provider_id", providerIds)
    .not("account_id", "is", null);

  const claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));

  // Get providers in tracking with non-not_contacted stage
  const { data: trackedProviders } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, id, stage, stage_changed_at, notes")
    .in("provider_id", providerIds)
    .neq("stage", "not_contacted");

  const trackedProviderIds = new Set((trackedProviders || []).map((t) => t.provider_id));

  // Get providers that ARE in tracking with not_contacted stage (for tracking_id)
  const { data: notContactedTracked } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, id, stage, stage_changed_at, notes")
    .in("provider_id", providerIds)
    .eq("stage", "not_contacted");

  const notContactedMap = new Map((notContactedTracked || []).map((t) => [t.provider_id, t]));

  // Filter to unclaimed, not-tracked-elsewhere providers
  const result: OutreachProvider[] = (providers as ProviderRow[])
    .filter((p) => !claimedProviderIds.has(p.provider_id) && !trackedProviderIds.has(p.provider_id))
    .map((p) => {
      const tracking = notContactedMap.get(p.provider_id);
      return {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        email: p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: tracking?.id ?? null,
        stage: "not_contacted" as OutreachStage,
        stage_changed_at: tracking?.stage_changed_at ?? null,
        notes: tracking?.notes ?? null,
      };
    })
    .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

  return result;
}

/**
 * Get counts for each stage in a state
 */
async function getStageCounts(
  db: ReturnType<typeof getServiceClient>,
  state: string
): Promise<Record<OutreachStage, number>> {
  const counts: Record<OutreachStage, number> = {
    not_contacted: 0,
    in_sequence: 0,
    needs_call: 0,
    called: 0,
    claimed: 0,
    not_interested: 0,
    archived: 0,
  };

  // Get tracking counts for non-not_contacted stages
  const { data: trackingCounts } = await db
    .from("provider_outreach_tracking")
    .select("stage")
    .eq("state", state);

  if (trackingCounts) {
    for (const row of trackingCounts) {
      const stage = row.stage as OutreachStage;
      if (stage !== "not_contacted") {
        counts[stage]++;
      }
    }
  }

  // Count not_contacted: unclaimed providers not in tracking (or with stage = not_contacted)
  const { data: providers } = await db
    .from("olera-providers")
    .select("provider_id")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (providers && providers.length > 0) {
    const providerIds = providers.map((p) => p.provider_id);

    // Get claimed providers
    const { data: claimedBps } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .in("source_provider_id", providerIds)
      .not("account_id", "is", null);

    const claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));

    // Get tracked providers (non-not_contacted)
    const { data: trackedProviders } = await db
      .from("provider_outreach_tracking")
      .select("provider_id")
      .in("provider_id", providerIds)
      .neq("stage", "not_contacted");

    const trackedProviderIds = new Set((trackedProviders || []).map((t) => t.provider_id));

    // Count unclaimed, not-tracked
    counts.not_contacted = providers.filter(
      (p) => !claimedProviderIds.has(p.provider_id) && !trackedProviderIds.has(p.provider_id)
    ).length;
  }

  return counts;
}
