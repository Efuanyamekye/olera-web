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
  "hidden",
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
  // For claimed providers
  verification_state?: "verified" | "pending" | "unverified" | "not_required" | "rejected" | null;
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

    if (stage === "claimed") {
      // Special case: "Claimed" shows ACTUAL claimed providers (from business_profiles)
      const providers = await getClaimedProviders(db, state, city);
      return NextResponse.json({ providers, stage_counts: stageCounts });
    }

    // For ALL non-claimed stages: query tracking but exclude providers who have since claimed
    // This ensures a provider only appears in ONE tab (Claimed wins if they've claimed)
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

    // Exclude providers who have since claimed (they belong in "Claimed" tab now)
    let claimedProviderIds = new Set<string>();
    if (providerIds.length > 0) {
      const { data: claimedBps } = await db
        .from("business_profiles")
        .select("source_provider_id")
        .in("source_provider_id", providerIds)
        .not("account_id", "is", null);

      claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));
    }

    // Join tracking with provider data
    const providerMap = new Map((providerRows || []).map((p) => [p.provider_id, p as ProviderRow]));
    const providers = (trackingRows as TrackingRow[])
      .map((t): OutreachProvider | null => {
        const p = providerMap.get(t.provider_id);
        if (!p) return null;
        // Skip if provider has claimed - they belong in Claimed tab now
        if (claimedProviderIds.has(p.provider_id)) return null;
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
 * Get providers who have ACTUALLY claimed their accounts (from business_profiles)
 * This is the source of truth for "Claimed" - not the tracking table
 */
async function getClaimedProviders(
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
  // Include email from business_profiles - this is the email the provider actually receives on
  const { data: claimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id, created_at, updated_at, verification_state, email")
    .in("source_provider_id", providerIds)
    .not("account_id", "is", null);

  if (!claimedBps || claimedBps.length === 0) {
    return [];
  }

  // Create a map of claimed provider_id -> { timestamp, verification_state, email }
  const claimedMap = new Map(
    claimedBps.map((bp) => [
      bp.source_provider_id,
      {
        timestamp: bp.updated_at || bp.created_at,
        verification_state: bp.verification_state as OutreachProvider["verification_state"],
        email: bp.email as string | null,
      },
    ])
  );

  // Filter to only claimed providers
  // Use email from business_profiles (claimInfo.email) - this is the email they actually receive notifications on
  // Fall back to olera-providers email only if business_profiles.email is not set
  const result: OutreachProvider[] = (providers as ProviderRow[])
    .filter((p) => claimedMap.has(p.provider_id))
    .map((p) => {
      const claimInfo = claimedMap.get(p.provider_id);
      return {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        email: claimInfo?.email || p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: null,
        stage: "claimed" as OutreachStage,
        stage_changed_at: claimInfo?.timestamp || null,
        notes: null,
        verification_state: claimInfo?.verification_state || null,
      };
    })
    .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

  return result;
}

/**
 * Get counts for each stage in a state
 *
 * Key logic:
 * - "claimed" count = actual claimed providers (from business_profiles with account_id)
 * - Active stages (in_sequence, needs_call, called) = tracking count MINUS those who have since claimed
 * - Terminal stages (not_interested, archived) = tracking count as-is
 * - "not_contacted" = unclaimed providers not in tracking
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
    hidden: 0,
  };

  // Get all providers in this state
  const { data: providers } = await db
    .from("olera-providers")
    .select("provider_id")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (!providers || providers.length === 0) {
    return counts;
  }

  const providerIds = providers.map((p) => p.provider_id);

  // Get ACTUAL claimed providers (source of truth)
  const { data: claimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .in("source_provider_id", providerIds)
    .not("account_id", "is", null);

  const claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));
  counts.claimed = claimedProviderIds.size;

  // Get all tracking rows for this state
  const { data: trackingRows } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, stage")
    .eq("state", state);

  if (trackingRows) {
    for (const row of trackingRows) {
      const stage = row.stage as OutreachStage;
      if (stage === "not_contacted" || stage === "claimed") {
        // Skip - not_contacted is calculated separately, claimed is from business_profiles
        continue;
      }

      // Don't count if provider has since claimed - they belong in Claimed now
      if (claimedProviderIds.has(row.provider_id)) {
        continue;
      }

      counts[stage]++;
    }
  }

  // Get tracked providers (excluding not_contacted stage)
  const trackedProviderIds = new Set(
    (trackingRows || [])
      .filter((t) => t.stage !== "not_contacted")
      .map((t) => t.provider_id)
  );

  // Count not_contacted: unclaimed providers not in tracking
  counts.not_contacted = providers.filter(
    (p) => !claimedProviderIds.has(p.provider_id) && !trackedProviderIds.has(p.provider_id)
  ).length;

  return counts;
}
