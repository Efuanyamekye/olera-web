/**
 * Provider Growth Database Queries
 *
 * All database operations for the provider growth tracking system.
 * Uses service client (bypasses RLS) - admin-only access.
 */

import { getServiceClient } from "@/lib/admin";
import type { PipelineStage, AdsStatus, MedjobsStatus, TouchpointType, ClaimSource, MeetingType, MeetingFocus } from "./stages";

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
  meeting_type: MeetingType | null;
  meeting_focus: MeetingFocus | null;
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
  no_show_count: number | null;
  last_no_show_at: string | null;
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
  // Ad campaign details (from ad_campaign_requests)
  ads_campaign_status?: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | null;
  ads_campaign_count?: number;
}

export interface GrowthStats {
  new_claim: number;
  meeting_scheduled: number;
  pitched: number;
  not_interested: number;
  no_show: number;
  upgrade_meeting: number;
  ads_free_intro: number;
  ads_subscribed: number;
  medjobs_in_pilot: number;
  medjobs_pilot_expired: number;
  medjobs_subscribed: number;
  // Providers with BOTH products active
  both_converted: number;  // ads_free_intro AND (medjobs_in_pilot OR medjobs_pilot_expired)
  both_paying: number;     // ads_subscribed AND medjobs_subscribed
  // Daily actionable metrics
  meetings_today: number;        // Meetings scheduled for today (regardless of logged status)
  pending_outcomes: number;      // All meetings needing outcome logged (past + today + future)
  pending_outcomes_past: number; // Subset: past meetings not yet logged
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function getGrowthStats(): Promise<GrowthStats> {
  const db = getServiceClient();

  // Get today's date range (in UTC)
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  // Fetch all tracking records and compute counts in memory
  // This is more reliable than chaining .then() on Supabase queries
  const { data: allRecords, error } = await db
    .from("provider_growth_tracking")
    .select("pipeline_stage, ads_status, medjobs_status, meeting_scheduled_at");

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
  let meetingsToday = 0;
  let pendingOutcomes = 0;
  let pendingOutcomesPast = 0;

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
    // "Converted" means on free trial - includes pilot_expired since they still need to convert to paying
    const medjobsConverted = row.medjobs_status === "in_pilot" || row.medjobs_status === "pilot_expired";
    if (row.ads_status === "free_intro" && medjobsConverted) {
      bothConverted++;
    }
    if (row.ads_status === "subscribed" && row.medjobs_status === "subscribed") {
      bothPaying++;
    }

    // Meeting metrics
    const awaitingOutcome = row.pipeline_stage === "meeting_scheduled" || row.pipeline_stage === "upgrade_meeting";

    // Count all pending outcomes (providers still in meeting stage)
    if (awaitingOutcome) {
      pendingOutcomes++;

      // Check if this is a past meeting (before today)
      if (row.meeting_scheduled_at) {
        const meetingDate = new Date(row.meeting_scheduled_at);
        if (meetingDate < todayStart) {
          pendingOutcomesPast++;
        }
      }
    }

    // Count meetings scheduled for today (informational - shows calendar for the day)
    if (row.meeting_scheduled_at) {
      const meetingDate = new Date(row.meeting_scheduled_at);
      const isToday = meetingDate >= todayStart && meetingDate <= todayEnd;
      if (isToday) {
        meetingsToday++;
      }
    }
  }

  return {
    new_claim: stageCounts.new_claim || 0,
    meeting_scheduled: stageCounts.meeting_scheduled || 0,
    pitched: stageCounts.pitched || 0,
    not_interested: stageCounts.not_interested || 0,
    no_show: stageCounts.no_show || 0,
    upgrade_meeting: stageCounts.upgrade_meeting || 0,
    ads_free_intro: adsCounts.free_intro || 0,
    ads_subscribed: adsCounts.subscribed || 0,
    medjobs_in_pilot: medjobsCounts.in_pilot || 0,
    medjobs_pilot_expired: medjobsCounts.pilot_expired || 0,
    medjobs_subscribed: medjobsCounts.subscribed || 0,
    both_converted: bothConverted,
    both_paying: bothPaying,
    meetings_today: meetingsToday,
    pending_outcomes: pendingOutcomes,
    pending_outcomes_past: pendingOutcomesPast,
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

// Ad campaign status priority: live > scheduled > requested > pending_profile > ended
const CAMPAIGN_STATUS_PRIORITY: Record<string, number> = {
  live: 5,
  scheduled: 4,
  requested: 3,
  pending_profile: 2,
  ended: 1,
};

type CampaignStatusType = "pending_profile" | "requested" | "scheduled" | "live" | "ended";

interface CampaignInfo {
  status: CampaignStatusType;
  count: number;
}

/**
 * Get ad campaign status for a list of provider IDs.
 * Returns a Map of business_profile_id -> { status, count }.
 *
 * For providers with multiple campaigns, returns the "most active" status:
 * live > scheduled > requested > pending_profile > ended
 */
async function getAdCampaignStatusForProviders(
  providerIds: string[]
): Promise<Map<string, CampaignInfo>> {
  if (providerIds.length === 0) {
    return new Map();
  }

  const db = getServiceClient();
  const results = new Map<string, CampaignInfo>();
  const BATCH_SIZE = 100;

  for (let i = 0; i < providerIds.length; i += BATCH_SIZE) {
    const batchIds = providerIds.slice(i, i + BATCH_SIZE);

    const { data, error } = await db
      .from("ad_campaign_requests")
      .select("provider_id, status")
      .in("provider_id", batchIds)
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (error) {
      console.error("[provider-growth] Ad campaign query error:", error);
      continue;
    }

    // Group by provider_id and find the "most active" status
    for (const row of data ?? []) {
      const existing = results.get(row.provider_id);
      const currentPriority = CAMPAIGN_STATUS_PRIORITY[row.status] || 0;

      if (existing) {
        existing.count++;
        // Update status if this campaign has higher priority
        const existingPriority = CAMPAIGN_STATUS_PRIORITY[existing.status] || 0;
        if (currentPriority > existingPriority) {
          existing.status = row.status as CampaignStatusType;
        }
      } else {
        results.set(row.provider_id, {
          status: row.status as CampaignStatusType,
          count: 1,
        });
      }
    }
  }

  return results;
}

/**
 * Get counts for New Claims subtabs (Not Contacted | Converted | In Progress).
 * - notContacted: no calls AND not converted
 * - converted: has free trial AND no calls (self-converted, not yet contacted)
 * - inProgress: has calls (regardless of conversion status - we're actively working on them)
 */
export async function getNewClaimSubtabCounts(): Promise<{
  notContacted: number;
  converted: number;
  inProgress: number;
}> {
  const db = getServiceClient();

  // Get all new_claim tracking records with conversion status
  const { data: newClaims, error: claimsError } = await db
    .from("provider_growth_tracking")
    .select("id, ads_status, medjobs_status")
    .eq("pipeline_stage", "new_claim");

  if (claimsError || !newClaims) {
    console.error("[provider-growth] New claims query error:", claimsError);
    return { notContacted: 0, converted: 0, inProgress: 0 };
  }

  if (newClaims.length === 0) {
    return { notContacted: 0, converted: 0, inProgress: 0 };
  }

  // Get call stats for ALL new_claim providers
  const allIds = newClaims.map((c) => c.id);
  const callStats = await getCallStatsForTrackingIds(allIds);

  // Categorize each provider
  let notContacted = 0;
  let converted = 0;
  let inProgress = 0;

  for (const claim of newClaims) {
    const hasCalls = (callStats.get(claim.id)?.count || 0) > 0;
    // "Converted" = started free trial (not yet paying)
    const isConverted =
      claim.ads_status === "free_intro" ||
      claim.medjobs_status === "in_pilot" ||
      claim.medjobs_status === "pilot_expired";
    // "Not converted" = no free trial started (ads_status=none, medjobs not in trial)
    // This matches the notConverted filter in listProviders
    const isNotConverted =
      claim.ads_status === "none" &&
      claim.medjobs_status !== "in_pilot" &&
      claim.medjobs_status !== "pilot_expired";

    if (hasCalls) {
      // Any provider with call attempts goes to In Progress
      inProgress++;
    } else if (isConverted) {
      // Converted but no calls yet - self-converted, waiting for outreach
      converted++;
    } else if (isNotConverted) {
      // Not converted and no calls - fresh claim
      notContacted++;
    }
    // Note: Providers with ads_status="subscribed" or medjobs_status="subscribed"
    // but no calls are not counted in any subtab (they should be in Paying tab)
  }

  return { notContacted, converted, inProgress };
}

// ─────────────────────────────────────────────────────────────────────────────
// List Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface ListProvidersOptions {
  pipelineStage?: PipelineStage;
  pipelineStages?: PipelineStage[];  // Multiple stages (e.g., meeting_scheduled + upgrade_meeting)
  adsStatus?: AdsStatus;
  medjobsStatus?: MedjobsStatus | MedjobsStatus[];  // Can be single or array (e.g., for in_pilot OR pilot_expired)
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
  // Filter by call status for new_claim and converted subtabs
  hasCallAttempts?: boolean;
  // Filter for converted providers (ads free_intro OR medjobs in_pilot/pilot_expired)
  converted?: boolean;
  // Filter for NOT converted providers (ads_status = none AND medjobs_status = none)
  notConverted?: boolean;
  // Filter by meeting focus (for Meeting Scheduled subtabs)
  meetingFocus?: MeetingFocus;
}

export async function listProviders(options: ListProvidersOptions = {}): Promise<{
  providers: ProviderGrowthWithProfile[];
  total: number;
}> {
  const db = getServiceClient();
  const {
    pipelineStage,
    pipelineStages,
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
    converted,
    notConverted,
    meetingFocus,
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
        category,
        address,
        metadata
      )
    `,
      { count: "exact" }
    );

  // Apply filters
  if (pipelineStages && pipelineStages.length > 0) {
    query = query.in("pipeline_stage", pipelineStages);
  } else if (pipelineStage) {
    query = query.eq("pipeline_stage", pipelineStage);
  }
  if (adsStatus && adsStatus !== "none") {
    query = query.eq("ads_status", adsStatus);
  }
  // medjobsStatus can be a single value or array (e.g., ["in_pilot", "pilot_expired"] for Converted tab)
  if (medjobsStatus) {
    if (Array.isArray(medjobsStatus)) {
      const filtered = medjobsStatus.filter((s) => s !== "none");
      if (filtered.length > 0) {
        query = query.in("medjobs_status", filtered);
      }
    } else if (medjobsStatus !== "none") {
      query = query.eq("medjobs_status", medjobsStatus);
    }
  }
  if (claimSource) {
    query = query.eq("claim_source", claimSource);
  }
  if (medjobsEligible !== undefined) {
    query = query.eq("medjobs_eligible", medjobsEligible);
  }
  // Converted filter: ads free_intro OR medjobs in_pilot/pilot_expired
  if (converted) {
    query = query.or("ads_status.eq.free_intro,medjobs_status.in.(in_pilot,pilot_expired)");
  }
  // Not converted filter: no free trial active
  // Must have ads_status = none AND medjobs_status not in (in_pilot, pilot_expired)
  if (notConverted) {
    query = query.eq("ads_status", "none");
    // Exclude providers with active MedJobs trial (in_pilot or pilot_expired)
    query = query.neq("medjobs_status", "in_pilot");
    query = query.neq("medjobs_status", "pilot_expired");
  }
  // Meeting focus filter (for Meeting Scheduled subtabs)
  // Include null meeting_focus for legacy providers who were scheduled before this field existed
  if (meetingFocus) {
    query = query.or(`meeting_focus.eq.${meetingFocus},meeting_focus.is.null`);
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

  // When searching or filtering by hasCallAttempts, fetch all matching rows
  // then filter + paginate in memory because:
  // - PostgREST doesn't support ilike on joined columns (search)
  // - hasCallAttempts requires joining with touchpoints (in memory)
  // Without these filters, apply pagination at DB level for efficiency.
  if (!search && hasCallAttempts === undefined) {
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
      category: string | null;
      address: string | null;
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

  // Fetch ad campaign status for providers with ads_status !== 'none'
  const providersWithAds = providers.filter(p => p.ads_status !== "none");
  if (providersWithAds.length > 0) {
    const profileIdsWithAds = providersWithAds.map(p => p.business_profile_id);
    const campaignData = await getAdCampaignStatusForProviders(profileIdsWithAds);

    // Merge campaign data into providers
    providers = providers.map(p => {
      const campaign = campaignData.get(p.business_profile_id);
      if (campaign) {
        return {
          ...p,
          ads_campaign_status: campaign.status,
          ads_campaign_count: campaign.count,
        };
      }
      return p;
    });
  }

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
  display_name: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  image_url: string | null;
  care_types: string[] | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Compute profile completeness using the same algorithm as the provider portal.
 * Matches lib/profile-completeness.ts exactly for consistency.
 *
 * 7-section weighted system:
 * - Overview (12 pts): display_name, category, address/city+state, image_url
 * - Pricing (12 pts): contact_for_pricing OR lower_price/price_range/pricing_details
 * - Staff Screening (8 pts): staff_screening (3+ = 100%, 1-2 = 50%)
 * - Care Services (10 pts): care_types (3+ = 100%, 1-2 = 50%)
 * - Gallery (15 pts): metadata.images (3+ = 100%, 2 = 70%, 1 = 40%)
 * - About (10 pts): description (100+ chars = 100%, any = 50%)
 * - Payment (6 pts): accepted_payments (3+ = 100%, 1-2 = 50%)
 */
function computeProfileCompleteness(profile: ProfileFields): number {
  const meta = (profile.metadata || {}) as Record<string, unknown>;

  // Section weights (matching lib/profile-completeness.ts)
  const WEIGHT_OVERVIEW = 12;
  const WEIGHT_PRICING = 12;
  const WEIGHT_STAFF_SCREENING = 8;
  const WEIGHT_CARE_SERVICES = 10;
  const WEIGHT_GALLERY = 15;
  const WEIGHT_ABOUT = 10;
  const WEIGHT_PAYMENT = 6;

  // Score each section (0-100)
  const sections: Array<{ percent: number; weight: number }> = [];

  // 1. Overview: display_name, category, address/city+state, image_url (25% each)
  let overviewScore = 0;
  if (profile.display_name?.trim()) overviewScore += 25;
  if (profile.category) overviewScore += 25;
  if (profile.address?.trim() || (profile.city?.trim() && profile.state?.trim())) overviewScore += 25;
  if (profile.image_url?.trim()) overviewScore += 25;
  sections.push({ percent: Math.min(100, overviewScore), weight: WEIGHT_OVERVIEW });

  // 2. Pricing: contact_for_pricing OR any price info = 100%
  let pricingScore = 0;
  if (meta.contact_for_pricing) {
    pricingScore = 100;
  } else if (
    meta.lower_price ||
    (typeof meta.price_range === "string" && meta.price_range.trim()) ||
    (Array.isArray(meta.pricing_details) && meta.pricing_details.length > 0)
  ) {
    pricingScore = 100;
  }
  sections.push({ percent: pricingScore, weight: WEIGHT_PRICING });

  // 3. Staff Screening: 3+ = 100%, 1-2 = 50%
  const staffScreening = Array.isArray(meta.staff_screening) ? meta.staff_screening : [];
  let screeningScore = 0;
  if (staffScreening.length >= 3) screeningScore = 100;
  else if (staffScreening.length >= 1) screeningScore = 50;
  sections.push({ percent: screeningScore, weight: WEIGHT_STAFF_SCREENING });

  // 4. Care Services: 3+ = 100%, 1-2 = 50%
  const careTypes = profile.care_types ?? [];
  let servicesScore = 0;
  if (careTypes.length >= 3) servicesScore = 100;
  else if (careTypes.length >= 1) servicesScore = 50;
  sections.push({ percent: servicesScore, weight: WEIGHT_CARE_SERVICES });

  // 5. Gallery: metadata.images (3+ = 100%, 2 = 70%, 1 = 40%)
  const images = Array.isArray(meta.images) ? meta.images : [];
  let galleryScore = 0;
  if (images.length >= 3) galleryScore = 100;
  else if (images.length >= 2) galleryScore = 70;
  else if (images.length >= 1) galleryScore = 40;
  sections.push({ percent: galleryScore, weight: WEIGHT_GALLERY });

  // 6. About: description (100+ chars = 100%, any = 50%)
  const desc = profile.description?.trim() ?? "";
  let aboutScore = 0;
  if (desc.length >= 100) aboutScore = 100;
  else if (desc.length > 0) aboutScore = 50;
  sections.push({ percent: aboutScore, weight: WEIGHT_ABOUT });

  // 7. Payment: accepted_payments (3+ = 100%, 1-2 = 50%)
  const acceptedPayments = Array.isArray(meta.accepted_payments) ? meta.accepted_payments : [];
  let paymentScore = 0;
  if (acceptedPayments.length >= 3) paymentScore = 100;
  else if (acceptedPayments.length >= 1) paymentScore = 50;
  sections.push({ percent: paymentScore, weight: WEIGHT_PAYMENT });

  // Calculate weighted average
  const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = sections.reduce((sum, s) => sum + s.percent * s.weight, 0);
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
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
  calendly_event_id?: string | null;
  meeting_scheduled_at?: string;
  meeting_completed_at?: string;
  meeting_type?: MeetingType | null;
  meeting_focus?: MeetingFocus | null;
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
  no_show_count?: number;
  last_no_show_at?: string;
  assigned_to?: string;
  notes?: string;
  // Meeting reminder tracking - cleared when meeting is rescheduled
  reminder_2d_sent_at?: string | null;
  reminder_1d_sent_at?: string | null;
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
