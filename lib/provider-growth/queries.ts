/**
 * Provider Growth Database Queries
 *
 * All database operations for the provider growth tracking system.
 * Uses service client (bypasses RLS) - admin-only access.
 */

import { getServiceClient } from "@/lib/admin";
import type { PipelineStage, AdsStatus, MedjobsStatus, TouchpointType, ClaimSource } from "./stages";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderGrowthTracking {
  id: string;
  business_profile_id: string;
  pipeline_stage: PipelineStage;
  pipeline_stage_changed_at: string | null;
  claim_source: ClaimSource | null;
  claimed_at: string | null;
  calendly_event_id: string | null;
  meeting_scheduled_at: string | null;
  meeting_completed_at: string | null;
  pitched_at: string | null;
  pitched_ads: boolean;
  pitched_medjobs: boolean;
  pitch_notes: string | null;
  pitch_interest_level: string | null;
  medjobs_eligible: boolean;
  medjobs_catchment_university: string | null;
  ads_eligible: boolean;
  ads_status: AdsStatus;
  ads_free_intro_at: string | null;
  ads_subscribed_at: string | null;
  medjobs_status: MedjobsStatus;
  medjobs_pilot_started_at: string | null;
  medjobs_subscribed_at: string | null;
  not_interested_at: string | null;
  not_interested_reason: string | null;
  assigned_to: string | null;
  notes: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderGrowthTouchpoint {
  id: string;
  tracking_id: string;
  business_profile_id: string;
  touchpoint_type: TouchpointType;
  details: Record<string, unknown> | null;
  admin_user_id: string | null;
  created_at: string;
}

export interface ProviderGrowthWithProfile extends ProviderGrowthTracking {
  // Joined from business_profiles
  display_name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  verification_state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  care_types: string[] | null;
  // Profile completeness (computed)
  profile_completeness?: number;
  // Engagement metrics (joined)
  lead_count?: number;
  question_count?: number;
  // Call tracking
  call_count?: number;
  last_call_at?: string | null;
}

export interface GrowthStats {
  new_claim: number;
  meeting_scheduled: number;
  pitched: number;
  not_interested: number;
  upgrade_meeting: number;
  ads_free_intro: number;
  ads_subscribed: number;
  medjobs_in_pilot: number;
  medjobs_subscribed: number;
  // Providers with BOTH products active
  both_converted: number;  // ads_free_intro AND medjobs_in_pilot
  both_paying: number;     // ads_subscribed AND medjobs_subscribed
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getGrowthStats(): Promise<GrowthStats> {
  const db = getServiceClient();

  // Fetch all tracking records and compute counts in memory
  // This is more reliable than chaining .then() on Supabase queries
  const { data: allRecords, error } = await db
    .from("provider_growth_tracking")
    .select("pipeline_stage, ads_status, medjobs_status");

  if (error) {
    console.error("[provider-growth] Stats query error:", error);
    throw new Error("Failed to get growth stats");
  }

  // Count by pipeline stage
  const stageCounts: Record<string, number> = {};
  const adsCounts: Record<string, number> = {};
  const medjobsCounts: Record<string, number> = {};
  let bothConverted = 0;
  let bothPaying = 0;

  for (const row of allRecords ?? []) {
    // Pipeline stage
    stageCounts[row.pipeline_stage] = (stageCounts[row.pipeline_stage] || 0) + 1;

    // Ads status (skip 'none')
    if (row.ads_status && row.ads_status !== "none") {
      adsCounts[row.ads_status] = (adsCounts[row.ads_status] || 0) + 1;
    }

    // MedJobs status (skip 'none')
    if (row.medjobs_status && row.medjobs_status !== "none") {
      medjobsCounts[row.medjobs_status] = (medjobsCounts[row.medjobs_status] || 0) + 1;
    }

    // Count providers with BOTH products active
    if (row.ads_status === "free_intro" && row.medjobs_status === "in_pilot") {
      bothConverted++;
    }
    if (row.ads_status === "subscribed" && row.medjobs_status === "subscribed") {
      bothPaying++;
    }
  }

  return {
    new_claim: stageCounts.new_claim || 0,
    meeting_scheduled: stageCounts.meeting_scheduled || 0,
    pitched: stageCounts.pitched || 0,
    not_interested: stageCounts.not_interested || 0,
    upgrade_meeting: stageCounts.upgrade_meeting || 0,
    ads_free_intro: adsCounts.free_intro || 0,
    ads_subscribed: adsCounts.subscribed || 0,
    medjobs_in_pilot: medjobsCounts.in_pilot || 0,
    medjobs_subscribed: medjobsCounts.subscribed || 0,
    both_converted: bothConverted,
    both_paying: bothPaying,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Count Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CallStats {
  count: number;
  lastCallAt: string | null;
}

/**
 * Get call stats for a list of tracking IDs.
 * Returns a Map of tracking_id -> { count, lastCallAt }.
 */
export async function getCallStatsForTrackingIds(
  trackingIds: string[]
): Promise<Map<string, CallStats>> {
  if (trackingIds.length === 0) {
    return new Map();
  }

  const db = getServiceClient();

  // Fetch call_attempted touchpoints grouped by tracking_id
  // We have to do this in batches to avoid URL length limits
  const stats = new Map<string, CallStats>();
  const BATCH_SIZE = 100;

  for (let i = 0; i < trackingIds.length; i += BATCH_SIZE) {
    const batchIds = trackingIds.slice(i, i + BATCH_SIZE);

    const { data, error } = await db
      .from("provider_growth_touchpoints")
      .select("tracking_id, created_at")
      .in("tracking_id", batchIds)
      .eq("touchpoint_type", "call_attempted");

    if (error) {
      console.error("[provider-growth] Call stats query error:", error);
      continue;
    }

    // Count occurrences and track most recent call per tracking_id
    for (const row of data ?? []) {
      const id = row.tracking_id;
      const existing = stats.get(id);
      if (existing) {
        existing.count++;
        // Update lastCallAt if this call is more recent
        if (row.created_at > (existing.lastCallAt || "")) {
          existing.lastCallAt = row.created_at;
        }
      } else {
        stats.set(id, { count: 1, lastCallAt: row.created_at });
      }
    }
  }

  return stats;
}

/**
 * Get counts for New Claims subtabs (Not Contacted vs In Progress).
 * Returns { notContacted, inProgress } where inProgress means has call attempts.
 */
export async function getNewClaimSubtabCounts(): Promise<{
  notContacted: number;
  inProgress: number;
}> {
  const db = getServiceClient();

  // Get all new_claim tracking IDs
  const { data: newClaims, error: claimsError } = await db
    .from("provider_growth_tracking")
    .select("id")
    .eq("pipeline_stage", "new_claim");

  if (claimsError || !newClaims) {
    console.error("[provider-growth] New claims query error:", claimsError);
    return { notContacted: 0, inProgress: 0 };
  }

  const trackingIds = newClaims.map((c) => c.id);
  if (trackingIds.length === 0) {
    return { notContacted: 0, inProgress: 0 };
  }

  // Get call stats
  const callStats = await getCallStatsForTrackingIds(trackingIds);

  // Count providers with/without calls
  let inProgress = 0;
  for (const id of trackingIds) {
    if ((callStats.get(id)?.count || 0) > 0) {
      inProgress++;
    }
  }

  return {
    notContacted: trackingIds.length - inProgress,
    inProgress,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// List Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface ListProvidersOptions {
  pipelineStage?: PipelineStage;
  adsStatus?: AdsStatus;
  medjobsStatus?: MedjobsStatus;
  claimSource?: ClaimSource;
  medjobsEligible?: boolean;
  search?: string;
  // Date range filtering (ISO strings)
  claimedFrom?: string;
  claimedTo?: string;
  limit?: number;
  offset?: number;
  orderBy?: "claimed_at" | "meeting_scheduled_at" | "pipeline_stage_changed_at" | "last_activity_at";
  orderDirection?: "asc" | "desc";
  // Filter by call status for new_claim subtabs
  hasCallAttempts?: boolean;
}

export async function listProviders(options: ListProvidersOptions = {}): Promise<{
  providers: ProviderGrowthWithProfile[];
  total: number;
}> {
  const db = getServiceClient();
  const {
    pipelineStage,
    adsStatus,
    medjobsStatus,
    claimSource,
    medjobsEligible,
    search,
    claimedFrom,
    claimedTo,
    limit = 50,
    offset = 0,
    orderBy = "claimed_at",
    orderDirection = "desc",
    hasCallAttempts,
  } = options;

  // Build the query
  // Note: We select more fields from business_profiles for completeness calculation
  let query = db
    .from("provider_growth_tracking")
    .select(
      `
      *,
      business_profiles!inner (
        id,
        display_name,
        slug,
        city,
        state,
        verification_state,
        phone,
        email,
        website,
        description,
        image_url,
        care_types,
        metadata
      )
    `,
      { count: "exact" }
    );

  // Apply filters
  if (pipelineStage) {
    query = query.eq("pipeline_stage", pipelineStage);
  }
  if (adsStatus && adsStatus !== "none") {
    query = query.eq("ads_status", adsStatus);
  }
  if (medjobsStatus && medjobsStatus !== "none") {
    query = query.eq("medjobs_status", medjobsStatus);
  }
  if (claimSource) {
    query = query.eq("claim_source", claimSource);
  }
  if (medjobsEligible !== undefined) {
    query = query.eq("medjobs_eligible", medjobsEligible);
  }
  // Date range filtering
  if (claimedFrom) {
    query = query.gte("claimed_at", claimedFrom);
  }
  if (claimedTo) {
    query = query.lte("claimed_at", claimedTo);
  }

  // Apply ordering
  query = query.order(orderBy, { ascending: orderDirection === "asc" });

  // When searching, fetch all matching rows then filter + paginate in memory
  // because PostgREST doesn't support ilike on joined columns.
  // Without search, apply pagination at DB level for efficiency.
  if (!search) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[provider-growth] List error:", error);
    throw new Error("Failed to list providers");
  }

  // Transform the joined data
  let providers: ProviderGrowthWithProfile[] = (data ?? []).map((row) => {
    const profile = row.business_profiles as {
      id: string;
      display_name: string | null;
      slug: string | null;
      city: string | null;
      state: string | null;
      verification_state: string | null;
      phone: string | null;
      email: string | null;
      website: string | null;
      description: string | null;
      image_url: string | null;
      care_types: string[] | null;
      metadata: Record<string, unknown> | null;
    };

    // Extract tracking fields, excluding the nested business_profiles object
    const { business_profiles: _, ...trackingFields } = row;

    return {
      ...trackingFields,
      display_name: profile.display_name,
      slug: profile.slug,
      city: profile.city,
      state: profile.state,
      verification_state: profile.verification_state,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      care_types: profile.care_types,
      profile_completeness: computeProfileCompleteness(profile),
    } as ProviderGrowthWithProfile;
  });

  // Apply search filter in memory (PostgREST doesn't support ilike on joined columns)
  if (search) {
    const searchLower = search.toLowerCase();
    providers = providers.filter(
      (p) => p.display_name?.toLowerCase().includes(searchLower)
    );
  }

  // Fetch call stats for all providers
  const trackingIds = providers.map((p) => p.id);
  const callStats = await getCallStatsForTrackingIds(trackingIds);

  // Add call_count and last_call_at to each provider
  providers = providers.map((p) => {
    const stats = callStats.get(p.id);
    return {
      ...p,
      call_count: stats?.count || 0,
      last_call_at: stats?.lastCallAt || null,
    };
  });

  // Filter by hasCallAttempts if specified
  if (hasCallAttempts !== undefined) {
    providers = providers.filter((p) =>
      hasCallAttempts ? (p.call_count || 0) > 0 : (p.call_count || 0) === 0
    );
  }

  // Apply pagination in memory if we did search or hasCallAttempts filtering
  if (search || hasCallAttempts !== undefined) {
    const filteredTotal = providers.length;
    providers = providers.slice(offset, offset + limit);
    return { providers, total: filteredTotal };
  }

  return {
    providers,
    total: count ?? 0,
  };
}

interface ProfileFields {
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  image_url: string | null;
  care_types: string[] | null;
  metadata: Record<string, unknown> | null;
}

function computeProfileCompleteness(profile: ProfileFields): number {
  // Profile completeness based on key fields that providers should fill out
  let filled = 0;
  let total = 0;

  // Direct profile fields (weighted)
  const directFields: Array<{ field: keyof ProfileFields; weight: number }> = [
    { field: "phone", weight: 1 },
    { field: "email", weight: 1 },
    { field: "website", weight: 1 },
    { field: "description", weight: 2 },  // Description is important
    { field: "image_url", weight: 1 },
    { field: "care_types", weight: 1 },
  ];

  for (const { field, weight } of directFields) {
    total += weight;
    const value = profile[field];
    if (value) {
      if (Array.isArray(value)) {
        if (value.length > 0) filled += weight;
      } else if (typeof value === "string" && value.trim()) {
        filled += weight;
      }
    }
  }

  // Check metadata for additional fields
  const metadata = profile.metadata;
  if (metadata) {
    // Photos in metadata
    total += 1;
    const photos = metadata.photos;
    if (photos && Array.isArray(photos) && photos.length > 0) {
      filled += 1;
    }

    // Hours/availability in metadata
    total += 1;
    if (metadata.hours || metadata.availability) {
      filled += 1;
    }
  }

  return total > 0 ? Math.round((filled / total) * 100) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Provider Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getTrackingByProvider(
  businessProfileId: string
): Promise<ProviderGrowthTracking | null> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("provider_growth_tracking")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("[provider-growth] Get tracking error:", error);
    throw new Error("Failed to get tracking record");
  }

  return data as ProviderGrowthTracking | null;
}

export async function getTrackingById(trackingId: string): Promise<ProviderGrowthTracking | null> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("provider_growth_tracking")
    .select("*")
    .eq("id", trackingId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[provider-growth] Get tracking error:", error);
    throw new Error("Failed to get tracking record");
  }

  return data as ProviderGrowthTracking | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create/Update Operations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTrackingInput {
  business_profile_id: string;
  claim_source?: ClaimSource;
  claimed_at?: string;
  medjobs_eligible?: boolean;
  medjobs_catchment_university?: string;
  ads_status?: AdsStatus;
  medjobs_status?: MedjobsStatus;
}

export async function createTracking(
  input: CreateTrackingInput
): Promise<ProviderGrowthTracking> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("provider_growth_tracking")
    .insert({
      ...input,
      pipeline_stage: "new_claim",
      pipeline_stage_changed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[provider-growth] Create tracking error:", error);
    throw new Error("Failed to create tracking record");
  }

  return data as ProviderGrowthTracking;
}

export interface UpdateTrackingInput {
  pipeline_stage?: PipelineStage;
  calendly_event_id?: string;
  meeting_scheduled_at?: string;
  meeting_completed_at?: string;
  pitched_at?: string;
  pitched_ads?: boolean;
  pitched_medjobs?: boolean;
  pitch_notes?: string;
  pitch_interest_level?: string;
  ads_status?: AdsStatus;
  ads_free_intro_at?: string;
  ads_subscribed_at?: string;
  medjobs_status?: MedjobsStatus;
  medjobs_pilot_started_at?: string;
  medjobs_subscribed_at?: string;
  not_interested_at?: string;
  not_interested_reason?: string;
  assigned_to?: string;
  notes?: string;
}

export async function updateTracking(
  trackingId: string,
  input: UpdateTrackingInput,
  adminUserId?: string
): Promise<ProviderGrowthTracking> {
  const db = getServiceClient();

  // Get current state for touchpoint logging
  const current = await getTrackingById(trackingId);
  if (!current) {
    throw new Error("Tracking record not found");
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    ...input,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };

  // Track pipeline stage change timestamp
  if (input.pipeline_stage && input.pipeline_stage !== current.pipeline_stage) {
    updatePayload.pipeline_stage_changed_at = new Date().toISOString();
  }

  const { data, error } = await db
    .from("provider_growth_tracking")
    .update(updatePayload)
    .eq("id", trackingId)
    .select()
    .single();

  if (error) {
    console.error("[provider-growth] Update tracking error:", error);
    throw new Error("Failed to update tracking record");
  }

  // Log touchpoint for significant changes
  if (input.pipeline_stage && input.pipeline_stage !== current.pipeline_stage) {
    await createTouchpoint({
      tracking_id: trackingId,
      business_profile_id: current.business_profile_id,
      touchpoint_type: "stage_changed",
      details: {
        from: current.pipeline_stage,
        to: input.pipeline_stage,
      },
      admin_user_id: adminUserId,
    });
  }

  return data as ProviderGrowthTracking;
}

// ─────────────────────────────────────────────────────────────────────────────
// Touchpoint Operations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTouchpointInput {
  tracking_id: string;
  business_profile_id: string;
  touchpoint_type: TouchpointType;
  details?: Record<string, unknown>;
  admin_user_id?: string;
}

export async function createTouchpoint(
  input: CreateTouchpointInput
): Promise<ProviderGrowthTouchpoint> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("provider_growth_touchpoints")
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error("[provider-growth] Create touchpoint error:", error);
    throw new Error("Failed to create touchpoint");
  }

  return data as ProviderGrowthTouchpoint;
}

export async function getTouchpoints(
  trackingId: string,
  limit = 50
): Promise<ProviderGrowthTouchpoint[]> {
  const db = getServiceClient();

  const { data, error } = await db
    .from("provider_growth_touchpoints")
    .select("*")
    .eq("tracking_id", trackingId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[provider-growth] Get touchpoints error:", error);
    throw new Error("Failed to get touchpoints");
  }

  return (data ?? []) as ProviderGrowthTouchpoint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Operations (for backfill)
// ─────────────────────────────────────────────────────────────────────────────

export interface BackfillTrackingInput extends CreateTrackingInput {
  // For backfill, we may want to preserve existing status if already set
  ads_free_intro_at?: string;
  ads_subscribed_at?: string;
  medjobs_pilot_started_at?: string;
  medjobs_subscribed_at?: string;
}

/**
 * Insert new tracking records, skipping any that already exist.
 * Use this for backfill to avoid overwriting existing records.
 */
export async function insertTrackingBatchSkipExisting(
  records: BackfillTrackingInput[]
): Promise<{ created: number; skipped: number }> {
  const db = getServiceClient();

  // First, get existing business_profile_ids
  const businessProfileIds = records.map((r) => r.business_profile_id);
  const { data: existing } = await db
    .from("provider_growth_tracking")
    .select("business_profile_id")
    .in("business_profile_id", businessProfileIds);

  const existingIds = new Set((existing ?? []).map((e) => e.business_profile_id));

  // Filter to only new records
  const newRecords = records.filter((r) => !existingIds.has(r.business_profile_id));

  if (newRecords.length === 0) {
    return { created: 0, skipped: records.length };
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("provider_growth_tracking")
    .insert(
      newRecords.map((r) => ({
        business_profile_id: r.business_profile_id,
        claim_source: r.claim_source,
        claimed_at: r.claimed_at,
        medjobs_eligible: r.medjobs_eligible ?? false,
        medjobs_catchment_university: r.medjobs_catchment_university,
        ads_status: r.ads_status ?? "none",
        medjobs_status: r.medjobs_status ?? "none",
        ads_free_intro_at: r.ads_free_intro_at,
        ads_subscribed_at: r.ads_subscribed_at,
        medjobs_pilot_started_at: r.medjobs_pilot_started_at,
        medjobs_subscribed_at: r.medjobs_subscribed_at,
        pipeline_stage: "new_claim",
        pipeline_stage_changed_at: now,
      }))
    )
    .select();

  if (error) {
    console.error("[provider-growth] Batch insert error:", error);
    throw new Error("Failed to insert tracking records");
  }

  return {
    created: data?.length ?? 0,
    skipped: existingIds.size,
  };
}

/**
 * Update conversion statuses for existing tracking records.
 * Used to sync ads/medjobs status from external sources without
 * touching pipeline stage.
 */
export async function updateConversionStatusBatch(
  updates: Array<{
    business_profile_id: string;
    ads_status?: AdsStatus;
    ads_free_intro_at?: string;
    ads_subscribed_at?: string;
    medjobs_status?: MedjobsStatus;
    medjobs_pilot_started_at?: string;
    medjobs_subscribed_at?: string;
  }>
): Promise<{ updated: number }> {
  const db = getServiceClient();
  let updatedCount = 0;

  // Update one by one (Supabase doesn't support batch updates with different values)
  for (const update of updates) {
    const { business_profile_id, ...fields } = update;

    // Only include non-undefined fields
    const updateFields: Record<string, unknown> = {};
    if (fields.ads_status !== undefined) updateFields.ads_status = fields.ads_status;
    if (fields.ads_free_intro_at !== undefined) updateFields.ads_free_intro_at = fields.ads_free_intro_at;
    if (fields.ads_subscribed_at !== undefined) updateFields.ads_subscribed_at = fields.ads_subscribed_at;
    if (fields.medjobs_status !== undefined) updateFields.medjobs_status = fields.medjobs_status;
    if (fields.medjobs_pilot_started_at !== undefined) updateFields.medjobs_pilot_started_at = fields.medjobs_pilot_started_at;
    if (fields.medjobs_subscribed_at !== undefined) updateFields.medjobs_subscribed_at = fields.medjobs_subscribed_at;

    if (Object.keys(updateFields).length === 0) continue;

    updateFields.updated_at = new Date().toISOString();

    const { error } = await db
      .from("provider_growth_tracking")
      .update(updateFields)
      .eq("business_profile_id", business_profile_id);

    if (!error) updatedCount++;
  }

  return { updated: updatedCount };
}
