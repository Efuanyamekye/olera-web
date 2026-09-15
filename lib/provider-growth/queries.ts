/**
 * Provider Growth Database Queries
 *
 * All database operations for the provider growth tracking system.
 * Uses service client (bypasses RLS) - admin-only access.
 */

import { getServiceClient } from "@/lib/admin";
import { calculateProfileCompleteness, type ExtendedMetadata } from "@/lib/profile-completeness";
import type { PipelineStage, AdsStatus, MedjobsStatus, TouchpointType, ClaimSource, MeetingType, MeetingFocus, MeetingFormat } from "./stages";

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
  meeting_format: MeetingFormat | null;
  meeting_phone: string | null;
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
  last_call_outcome?: string | null;
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
  pending_outcomes: number;       // Meetings needing outcome logged (past + today, excludes future)
  pending_outcomes_today: number; // Subset: today's meetings not yet logged
  pending_outcomes_past: number;  // Subset: past meetings not yet logged
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich Context Data (for AI Briefing)
// ─────────────────────────────────────────────────────────────────────────────

export interface RichContextData {
  // Metrics (null means not recorded, 0 means actually zero)
  googleRating: number | null;
  googleReviewCount: number | null;
  photoCount: number;
  adSpendCents: number | null; // null = no campaigns or spend not recorded

  // Computed
  touchCount: number;
  daysOverdue: number;
  leadCount: number;

  // Details for AI
  leads: Array<{ created_at: string; message: string | null; familyName: string | null }>;
  touchpoints: Array<{ type: string; notes: string | null; created_at: string }>;
  emailStats: { sent: number; opened: number; clicked: number };

  // Provider info
  provider: {
    displayName: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    city: string;
    state: string;
    careTypes: string[];
    verificationState: string | null;
    slug: string | null;
  };

  // Status
  pipelineStage: string;
  adsStatus: string;
  medjobsStatus: string;
  claimedAt: string | null;

  // Pre-computed tags (not AI-generated)
  computedTags: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW: Data-driven briefing fields (no AI generation)
  // ─────────────────────────────────────────────────────────────────────────────

  // Questions data
  questions: {
    received: number;
    answered: number;
    unanswered: number;
    recentQuestions: Array<{
      question: string;
      created_at: string;
      answered: boolean;
    }>;
  };

  // Provider activity/engagement data
  engagement: {
    lastDashboardVisit: string | null;
    dashboardVisits30d: number;
    lastProfileEdit: string | null;
    profileEdits30d: number;
    sectionsEdited: string[];
    lastLogin: string | null;
    leadsOpened: number;
    leadOpenRate: number; // percentage
    contactsRevealed: number;
  };

  // Photo assessment
  photos: {
    count: number;
    hasHeroImage: boolean;
    urls: string[]; // first few for display
  };

  // Google Reviews opportunity assessment
  reviews: {
    rating: number | null;
    count: number | null;
    opportunityLevel: "none" | "mild" | "strong";
    opportunityReason: string | null;
    hasUsedReviewRequests: boolean;
    reviewRequestsSent: number;
  };

  // Email assessment
  emailAssessment: {
    isGeneric: boolean; // info@, contact@, etc.
    genericReason: string | null;
  };

  // Profile completeness breakdown
  profileCompleteness: {
    percentage: number;
    missingSections: string[];
    hasDescription: boolean;
    hasPricing: boolean;
    hasStaffInfo: boolean;
    hasHours: boolean;
  };

  // Ad Boost status and performance
  adBoost: {
    hasAnyCampaign: boolean;
    activeCampaign: boolean;
    totalCampaigns: number;
    lastCampaignStatus: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled" | null;
    totalLeadsFromAds: number;
    // Campaign performance (from most recent/active campaign)
    campaign: {
      status: "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled" | null;
      channel: "google" | "meta" | "both" | null;
      budgetCents: number | null;
      spendCents: number | null;
      impressions: number | null;
      clicks: number | null;
      landings: number | null;
      delivered: number | null;
      flightStartDate: string | null;
      flightEndDate: string | null;
      photoReadiness: "unreviewed" | "update_requested" | "review_requested" | "ready" | null;
    } | null;
  };

  // MedJobs (staffing) status and opportunity
  medjobs: {
    status: "none" | "in_pilot" | "pilot_expired" | "subscribed";
    eligible: boolean;
    pilotStartedAt: string | null;
    subscribedAt: string | null;
    // Computed opportunity assessment
    opportunityLevel: "none" | "pitch" | "convert" | "renew";
    opportunityReason: string | null;
  };

  // Feature engagement signals (what they've explored but not acted on)
  featureEngagement: {
    // Ad Boost interest
    adBoostViews: number;
    adBoostLastViewed: string | null;
    adBoostApplyStarted: boolean; // Did they start the apply flow?
    // Review generation interest
    reviewsCtaClicked: boolean;
    reviewsCtaLastClicked: string | null;
    // MedJobs/staffing interest
    marketViewCount: number;
    marketLastViewed: string | null;
    // Summary for pitch
    warmLeadSignals: string[]; // e.g., ["Viewed Ad Boost 3x", "Clicked reviews CTA"]
  };

  // Flags for issues to address
  flags: Array<{
    type: "warning" | "info" | "opportunity";
    label: string;
    detail: string;
  }>;

  // Deterministic recommended action
  recommendedAction: {
    priority: number;
    action: string;
    rationale: string;
    pitchAngle: string;
  };

  // Data-driven opening script
  openingScript: string;

  // What to capture on the call
  captureChecklist: Array<{
    item: string;
    reason: string;
  }>;
}

/**
 * Get rich context data for data-driven sales briefing.
 * Aggregates all data sources needed for a comprehensive, accurate briefing.
 * NO AI generation - all fields are computed from real database records.
 */
export async function getRichContextData(
  trackingId: string,
  businessProfileId: string
): Promise<RichContextData> {
  const db = getServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Phase 1: Fetch all data in parallel
  const [
    trackingResult,
    profileResult,
    adCampaignsResult,
    leadCountResult,
    leadsResult,
    touchpointCountResult,
    touchpointsResult,
    // NOTE: Questions queries moved to Phase 2 to use provider_id from profile
    // NEW: Ad Boost campaign details
    adBoostLeadsResult,
    // Review requests sent
    reviewRequestsResult,
  ] = await Promise.all([
    // Tracking record (includes MedJobs eligibility and status)
    db
      .from("provider_growth_tracking")
      .select("pipeline_stage, ads_status, medjobs_status, medjobs_eligible, medjobs_pilot_started_at, medjobs_subscribed_at, claimed_at, last_activity_at")
      .eq("id", trackingId)
      .single(),

    // Business profile with metadata (google_reviews_data is on olera-providers, not here)
    db
      .from("business_profiles")
      .select("id, slug, display_name, phone, email, city, state, care_types, metadata, account_id, verification_state, description, source_provider_id, category, image_url, address")
      .eq("id", businessProfileId)
      .single(),

    // Ad campaigns (full details for status and performance)
    // Note: Only select columns that exist in ad_campaign_requests table
    // - intended_monthly_budget is in whole dollars (not cents)
    // - delivered families are calculated separately from connections
    // - flight_start_date doesn't exist, only flight_end_date
    db
      .from("ad_campaign_requests")
      .select(`
        id, status, ad_spend_cents, intended_monthly_budget, created_at,
        ad_clicks, ad_impressions,
        flight_end_date,
        photo_readiness_status, channel
      `)
      .eq("provider_id", businessProfileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),

    // Lead count (total)
    db
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("to_profile_id", businessProfileId)
      .eq("type", "inquiry"),

    // Last 5 leads with details (including family name)
    db
      .from("connections")
      .select("created_at, message, from_profile:business_profiles!connections_from_profile_id_fkey(display_name)")
      .eq("to_profile_id", businessProfileId)
      .eq("type", "inquiry")
      .order("created_at", { ascending: false })
      .limit(5),

    // Touchpoint count (total)
    db
      .from("provider_growth_touchpoints")
      .select("id", { count: "exact", head: true })
      .eq("tracking_id", trackingId),

    // Touchpoint history (last 20)
    db
      .from("provider_growth_touchpoints")
      .select("touchpoint_type, details, created_at")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false })
      .limit(20),

    // NOTE: Questions queries moved to Phase 2 to use provider_id (slug/sourceProviderId)
    // matching how the drawer queries them

    // Ad Boost leads: placeholder (delivered column doesn't exist in table)
    // Real lead attribution would require matching connections.utm_campaign to campaign_tag
    // For now, return empty - we show campaign metrics (impressions/clicks) as proxy
    Promise.resolve({ data: [] as Array<{ delivered: number }> }),

    // Review requests sent (count of review_request emails sent by this provider)
    // Uses business_profile_id since review-requests route stamps provider_id with profile.id (UUID)
    db
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("email_type", "review_request")
      .eq("provider_id", businessProfileId),
  ]);

  // Validate critical queries succeeded
  if (trackingResult.error) {
    console.error("[getRichContextData] Tracking query failed:", JSON.stringify(trackingResult.error), "trackingId:", trackingId);
    throw new Error(`Failed to load tracking record: ${trackingResult.error.message || "unknown error"}`);
  }
  if (profileResult.error) {
    console.error("[getRichContextData] Profile query failed:", JSON.stringify(profileResult.error), "businessProfileId:", businessProfileId);
    throw new Error(`Failed to load business profile: ${profileResult.error.message || "unknown error"}`);
  }
  if (!profileResult.data) {
    console.error("[getRichContextData] Profile not found for businessProfileId:", businessProfileId);
    throw new Error("Business profile not found");
  }

  // Phase 2: Fetch data that depends on profile results
  const profile = profileResult.data;
  const providerEmail = profile?.email;
  const providerSlug = profile?.slug;
  const sourceProviderId = profile?.source_provider_id;

  // Build provider ID variants for querying provider_activity
  // Activity can be logged with slug, UUID, or source_provider_id depending on context
  const providerIdVariants: string[] = [businessProfileId];
  if (providerSlug) providerIdVariants.push(providerSlug);
  if (sourceProviderId) providerIdVariants.push(sourceProviderId);

  // Phase 2 queries wrapped in try-catch to prevent breaking if any fail
  let emailStatsData: { data: Array<{ first_opened_at: string | null; first_clicked_at: string | null }> | null } = { data: [] };
  let dashboardVisitsResult: { data: Array<{ created_at: string }> | null; count: number | null } = { data: [], count: 0 };
  let profileEditsResult: { data: Array<{ created_at: string; metadata: unknown }> | null } = { data: [] };
  let lastLoginResult: { data: Array<{ created_at: string }> | null } = { data: [] };
  let leadsOpenedResult: { count: number | null } = { count: 0 };
  let contactsRevealedResult: { count: number | null } = { count: 0 };
  let googleReviewsResult: { data: { google_reviews_data: { rating?: number; review_count?: number } | null; google_rating: number | null } | null } = { data: null };
  // Feature engagement signals
  let adBoostViewsResult: { data: Array<{ created_at: string }> | null; count: number | null } = { data: [], count: 0 };
  let adBoostStepResult: { data: Array<{ created_at: string }> | null; count: number | null } = { data: [], count: 0 };
  let reviewsCtaResult: { data: Array<{ created_at: string }> | null } = { data: [] };
  let marketViewResult: { data: Array<{ created_at: string }> | null; count: number | null } = { data: [], count: 0 };
  // Questions data (queried by provider_id to match drawer behavior)
  let questionsReceivedResult: { count: number | null } = { count: 0 };
  let questionsAnsweredResult: { count: number | null } = { count: 0 };
  let recentQuestionsResult: { data: Array<{ question: string; answer: string | null; created_at: string }> | null } = { data: [] };

  try {
    const results = await Promise.all([
      // Email stats (30 days)
      providerEmail
        ? db
            .from("email_log")
            .select("id, first_opened_at, first_clicked_at")
            .eq("recipient", providerEmail)
            .eq("recipient_type", "provider")
            .gte("created_at", thirtyDaysAgo)
        : Promise.resolve({ data: [] }),

      // Dashboard visits (30 days) - query by all provider ID variants
      db
        .from("provider_activity")
        .select("created_at", { count: "exact" })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "dashboard_arrival")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(1),

      // Profile edits (30 days) - query by all provider ID variants
      db
        .from("provider_activity")
        .select("created_at, metadata")
        .in("provider_id", providerIdVariants)
        .eq("event_type", "provider_profile_edited")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false }),

      // Last login / one-click access - query by all provider ID variants
      db
        .from("provider_activity")
        .select("created_at")
        .in("provider_id", providerIdVariants)
        .eq("event_type", "one_click_access")
        .order("created_at", { ascending: false })
        .limit(1),

      // Leads opened (all time) - query by all provider ID variants
      db
        .from("provider_activity")
        .select("id", { count: "exact", head: true })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "lead_opened"),

      // Contact info revealed - query by all provider ID variants
      db
        .from("provider_activity")
        .select("id", { count: "exact", head: true })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "contact_revealed"),

      // Google reviews data - fetched from olera-providers via source_provider_id
      sourceProviderId
        ? db
            .from("olera-providers")
            .select("google_reviews_data, google_rating")
            .eq("provider_id", sourceProviderId)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Feature engagement: Ad Boost page views (all time)
      db
        .from("provider_activity")
        .select("created_at", { count: "exact" })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "managed_ads_boost_viewed")
        .order("created_at", { ascending: false })
        .limit(1),

      // Feature engagement: Ad Boost apply flow started
      db
        .from("provider_activity")
        .select("created_at", { count: "exact" })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "managed_ads_step_viewed")
        .order("created_at", { ascending: false })
        .limit(1),

      // Feature engagement: Reviews CTA clicked
      db
        .from("provider_activity")
        .select("created_at")
        .in("provider_id", providerIdVariants)
        .eq("event_type", "reviews_cta_clicked")
        .order("created_at", { ascending: false })
        .limit(1),

      // Feature engagement: MedJobs/market page views
      db
        .from("provider_activity")
        .select("created_at", { count: "exact" })
        .in("provider_id", providerIdVariants)
        .eq("event_type", "your_market_viewed")
        .order("created_at", { ascending: false })
        .limit(1),

      // Questions received count - use provider_id (slug/sourceProviderId) to match drawer
      db
        .from("provider_questions")
        .select("id", { count: "exact", head: true })
        .in("provider_id", providerIdVariants)
        .is("canonical_question_id", null), // Only count original questions, not duplicates

      // Questions answered count
      db
        .from("provider_questions")
        .select("id", { count: "exact", head: true })
        .in("provider_id", providerIdVariants)
        .is("canonical_question_id", null)
        .not("answer", "is", null),

      // Recent questions (last 5)
      db
        .from("provider_questions")
        .select("question, answer, created_at")
        .in("provider_id", providerIdVariants)
        .is("canonical_question_id", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    emailStatsData = results[0] as typeof emailStatsData;
    dashboardVisitsResult = results[1] as typeof dashboardVisitsResult;
    profileEditsResult = results[2] as typeof profileEditsResult;
    lastLoginResult = results[3] as typeof lastLoginResult;
    leadsOpenedResult = results[4] as typeof leadsOpenedResult;
    contactsRevealedResult = results[5] as typeof contactsRevealedResult;
    googleReviewsResult = results[6] as typeof googleReviewsResult;
    adBoostViewsResult = results[7] as typeof adBoostViewsResult;
    adBoostStepResult = results[8] as typeof adBoostStepResult;
    reviewsCtaResult = results[9] as typeof reviewsCtaResult;
    marketViewResult = results[10] as typeof marketViewResult;
    questionsReceivedResult = results[11] as typeof questionsReceivedResult;
    questionsAnsweredResult = results[12] as typeof questionsAnsweredResult;
    recentQuestionsResult = results[13] as typeof recentQuestionsResult;
  } catch (e) {
    console.error("[getRichContextData] Phase 2 queries failed:", e);
    // Continue with default values - engagement data will show as 0/null
  }

  // Process email stats (with null safety)
  const emailData = emailStatsData?.data || [];
  const emailStatsResult = {
    sent: emailData.length,
    opened: emailData.filter((e) => e?.first_opened_at).length,
    clicked: emailData.filter((e) => e?.first_clicked_at).length,
  };

  const tracking = trackingResult.data;
  const metadata = (profile?.metadata || {}) as Record<string, unknown>;
  // GoogleReviewsData comes from olera-providers via source_provider_id
  const googleReviewsRaw = googleReviewsResult?.data;
  const googleData: { rating?: number; review_count?: number } = {
    rating: (googleReviewsRaw?.google_reviews_data as { rating?: number })?.rating ?? googleReviewsRaw?.google_rating ?? undefined,
    review_count: (googleReviewsRaw?.google_reviews_data as { review_count?: number })?.review_count,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Reviews Opportunity
  // ─────────────────────────────────────────────────────────────────────────────
  const reviewRequestsSent = reviewRequestsResult.count || 0;
  const hasUsedReviewRequests = reviewRequestsSent > 0;

  // Determine review opportunity level based on rating and count
  let reviewOpportunityLevel: "none" | "mild" | "strong" = "none";
  let reviewOpportunityReason: string | null = null;

  const rating = googleData.rating ?? null;
  const reviewCount = googleData.review_count ?? null;

  if (reviewCount === null || reviewCount === 0) {
    // No reviews = strong opportunity
    reviewOpportunityLevel = "strong";
    reviewOpportunityReason = "No Google reviews yet - help them get their first reviews";
  } else if (rating !== null && rating < 4.0) {
    // Low rating = opportunity to improve
    reviewOpportunityLevel = "strong";
    reviewOpportunityReason = `Rating is ${rating.toFixed(1)} stars - help them improve with more positive reviews`;
  } else if (rating !== null && rating < 4.5) {
    // Good but not great = mild opportunity
    reviewOpportunityLevel = "mild";
    reviewOpportunityReason = `Rating is ${rating.toFixed(1)} stars - could reach 4.5+ with a few more reviews`;
  } else if (rating !== null && rating >= 4.5 && reviewCount < 10) {
    // Great rating but few reviews = mild opportunity
    reviewOpportunityLevel = "mild";
    reviewOpportunityReason = `Great ${rating.toFixed(1)} rating but only ${reviewCount} reviews - more reviews build trust`;
  }
  // else: 4.5+ with 10+ reviews = no opportunity needed

  const images = Array.isArray(metadata.images) ? metadata.images : [];
  const staff = (metadata.staff || {}) as { name?: string };
  const verificationState = profile?.verification_state || null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Ad Campaigns
  // ─────────────────────────────────────────────────────────────────────────────
  const adCampaigns = adCampaignsResult.data || [];
  let adSpendCents: number | null = null;
  if (adCampaigns.length > 0) {
    const hasRecordedSpend = adCampaigns.some(row => row.ad_spend_cents !== null);
    if (hasRecordedSpend) {
      adSpendCents = adCampaigns.reduce((sum, row) => sum + (row.ad_spend_cents || 0), 0);
    }
  }

  const activeCampaign = adCampaigns.some(c => c.status === "live");
  const totalLeadsFromAds = (adBoostLeadsResult.data || []).reduce(
    (sum, row) => sum + (row.delivered || 0),
    0
  );

  // Get the most relevant campaign for briefing (prioritize active states)
  // Priority: live > scheduled > requested > pending_profile > ended
  const campaignPriority: Record<string, number> = {
    live: 1,
    scheduled: 2,
    requested: 3,
    pending_profile: 4,
    ended: 5,
    cancelled: 6,
  };
  const sortedCampaigns = [...adCampaigns].sort((a, b) => {
    const aPriority = campaignPriority[a.status] ?? 99;
    const bPriority = campaignPriority[b.status] ?? 99;
    return aPriority - bPriority;
  });
  const primaryCampaign = sortedCampaigns[0] || null;

  // Build detailed campaign object for briefing
  // Note: intended_monthly_budget is in whole dollars, convert to cents for consistency
  // delivered is calculated from totalLeadsFromAds (from connections by campaign_tag)
  const campaignDetails = primaryCampaign ? {
    status: primaryCampaign.status as "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled",
    channel: primaryCampaign.channel as "google" | "meta" | "both" | null,
    budgetCents: primaryCampaign.intended_monthly_budget ? primaryCampaign.intended_monthly_budget * 100 : null,
    spendCents: primaryCampaign.ad_spend_cents ?? null,
    impressions: primaryCampaign.ad_impressions ?? null,
    clicks: primaryCampaign.ad_clicks ?? null,
    landings: null, // Column doesn't exist in table
    delivered: totalLeadsFromAds, // Use pre-calculated value from adBoostLeadsResult
    flightStartDate: null, // Column doesn't exist, only flight_end_date
    flightEndDate: primaryCampaign.flight_end_date ?? null,
    photoReadiness: primaryCampaign.photo_readiness_status as "unreviewed" | "update_requested" | "review_requested" | "ready" | null,
  } : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Process MedJobs (Staffing) Status
  // ─────────────────────────────────────────────────────────────────────────────
  const medjobsStatus = (tracking?.medjobs_status || "none") as "none" | "in_pilot" | "pilot_expired" | "subscribed";
  const medjobsEligible = tracking?.medjobs_eligible ?? false;
  const medjobsPilotStartedAt = tracking?.medjobs_pilot_started_at ?? null;
  const medjobsSubscribedAt = tracking?.medjobs_subscribed_at ?? null;

  // Determine MedJobs opportunity level
  let medjobsOpportunityLevel: "none" | "pitch" | "convert" | "renew" = "none";
  let medjobsOpportunityReason: string | null = null;

  if (medjobsStatus === "subscribed") {
    // Already paying - no opportunity needed
    medjobsOpportunityLevel = "none";
  } else if (medjobsStatus === "pilot_expired") {
    // Pilot expired - re-engage opportunity
    medjobsOpportunityLevel = "renew";
    medjobsOpportunityReason = "Their MedJobs pilot has expired - check if they want to renew";
  } else if (medjobsStatus === "in_pilot") {
    // In pilot - conversion opportunity
    medjobsOpportunityLevel = "convert";
    const pilotDaysRaw = medjobsPilotStartedAt
      ? Math.floor((Date.now() - new Date(medjobsPilotStartedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    // Validate: must be a valid non-negative number (handles NaN and future dates)
    const pilotDays = pilotDaysRaw !== null && !isNaN(pilotDaysRaw) && pilotDaysRaw >= 0 ? pilotDaysRaw : null;
    medjobsOpportunityReason = pilotDays !== null
      ? `In MedJobs pilot for ${pilotDays} days - check how it's going`
      : "Currently in MedJobs pilot - check how it's going";
  } else if (medjobsEligible) {
    // Eligible but not started - pitch opportunity
    medjobsOpportunityLevel = "pitch";
    medjobsOpportunityReason = "Eligible for MedJobs staffing program - pitch if they hire staff";
  }
  // else: not eligible, no opportunity

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Feature Engagement Signals
  // ─────────────────────────────────────────────────────────────────────────────
  const adBoostViews = adBoostViewsResult.count || 0;
  const adBoostLastViewed = adBoostViewsResult.data?.[0]?.created_at || null;
  const adBoostApplyStarted = (adBoostStepResult.count || 0) > 0;

  const reviewsCtaClicked = (reviewsCtaResult.data?.length || 0) > 0;
  const reviewsCtaLastClicked = reviewsCtaResult.data?.[0]?.created_at || null;

  const marketViewCount = marketViewResult.count || 0;
  const marketLastViewed = marketViewResult.data?.[0]?.created_at || null;

  // Build warm lead signals for pitch context
  const warmLeadSignals: string[] = [];
  if (adBoostViews >= 3) {
    warmLeadSignals.push(`Viewed Ad Boost ${adBoostViews}x`);
  } else if (adBoostViews > 0) {
    warmLeadSignals.push("Viewed Ad Boost page");
  }
  // Only show if they haven't signed up (ads_status is "none")
  if (adBoostApplyStarted && !adCampaigns.length && tracking?.ads_status === "none") {
    warmLeadSignals.push("Started Ad Boost apply but didn't finish");
  }
  if (reviewsCtaClicked && !hasUsedReviewRequests) {
    warmLeadSignals.push("Clicked reviews CTA but hasn't sent any");
  }
  if (marketViewCount > 0 && medjobsStatus === "none") {
    warmLeadSignals.push("Viewed staffing page but not enrolled");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Calculate basic metrics
  // ─────────────────────────────────────────────────────────────────────────────
  let daysOverdue = 0;
  if (tracking?.last_activity_at) {
    const lastActivity = new Date(tracking.last_activity_at);
    const now = new Date();
    daysOverdue = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  }

  const touchCount = touchpointCountResult.count || 0;
  const leadCount = leadCountResult.count || 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Questions Data
  // ─────────────────────────────────────────────────────────────────────────────
  const questionsReceived = questionsReceivedResult.count || 0;
  const questionsAnswered = questionsAnsweredResult.count || 0;
  const questionsUnanswered = questionsReceived - questionsAnswered;
  const recentQuestions = (recentQuestionsResult.data || []).map((q) => ({
    question: q.question?.slice(0, 100) || "",
    created_at: q.created_at,
    answered: q.answer !== null,
  }));

  // ─────────────────────────────────────────────────────────────────────────────
  // Process Engagement Data
  // ─────────────────────────────────────────────────────────────────────────────
  const dashboardVisits30d = dashboardVisitsResult.count || 0;
  const lastDashboardVisit = dashboardVisitsResult.data?.[0]?.created_at || null;

  const profileEdits = profileEditsResult.data || [];
  const profileEdits30d = profileEdits.length;
  const lastProfileEdit = profileEdits[0]?.created_at || null;
  const sectionsEdited = [...new Set(
    profileEdits
      .map((e) => (e.metadata as Record<string, unknown>)?.section as string)
      .filter(Boolean)
  )];

  const lastLogin = lastLoginResult.data?.[0]?.created_at || null;
  const leadsOpened = leadsOpenedResult.count || 0;
  // Cap at 100% to handle edge cases (duplicate opens, data inconsistencies)
  const leadOpenRate = leadCount > 0 ? Math.min(100, Math.round((leadsOpened / leadCount) * 100)) : 0;
  const contactsRevealed = contactsRevealedResult.count || 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // Email Assessment
  // ─────────────────────────────────────────────────────────────────────────────
  const genericEmailPrefixes = ["info", "contact", "admin", "hello", "support", "office", "mail", "sales", "help", "team", "inquiries", "general"];
  const emailLower = (profile?.email || "").toLowerCase();
  const emailPrefix = emailLower.split("@")[0];
  const isGenericEmail = genericEmailPrefixes.some(prefix => emailPrefix === prefix || emailPrefix.startsWith(prefix + "."));
  const genericReason = isGenericEmail ? `"${emailPrefix}@" is a generic address - may not reach decision maker` : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // Profile Completeness Assessment (using the canonical weighted algorithm)
  // ─────────────────────────────────────────────────────────────────────────────
  // Build profile object for completeness calculation
  // Cast to Profile since calculateProfileCompleteness only uses these fields
  const profileForCompleteness = {
    display_name: profile?.display_name || null,
    category: profile?.category || null,
    address: profile?.address || null,
    city: profile?.city || null,
    state: profile?.state || null,
    image_url: profile?.image_url || images[0] || null,
    description: profile?.description || null,
    care_types: profile?.care_types || [],
  } as import("@/lib/types").Profile;
  const metadataForCompleteness: ExtendedMetadata = {
    lower_price: metadata.lower_price as number | undefined,
    price_range: metadata.price_range as string | undefined,
    pricing_details: metadata.pricing_details as ExtendedMetadata["pricing_details"],
    contact_for_pricing: metadata.contact_for_pricing as boolean | undefined,
    staff_screening: metadata.staff_screening as string[] | undefined,
    images: images as string[],
    accepted_payments: metadata.accepted_payments as string[] | undefined,
  };
  const completenessResult = calculateProfileCompleteness(profileForCompleteness, metadataForCompleteness);
  const completenessPercentage = completenessResult.overall;
  const missingSections = completenessResult.sections
    .filter(s => s.percent < 100)
    .map(s => s.label);

  // Keep simple flags for briefing display
  const hasDescription = Boolean(profile?.description && profile.description.length > 50);
  const hasPricing = Boolean(metadata.pricing || metadata.price_range || metadata.contact_for_pricing);
  const hasStaffInfo = Boolean(staff.name || metadata.staff_count || (metadata.staff_screening as string[] | undefined)?.length);
  const hasHours = Boolean(metadata.hours || metadata.business_hours);

  // ─────────────────────────────────────────────────────────────────────────────
  // Build Flags (issues to address)
  // ─────────────────────────────────────────────────────────────────────────────
  const flags: Array<{ type: "warning" | "info" | "opportunity"; label: string; detail: string }> = [];

  if (questionsUnanswered > 0) {
    flags.push({
      type: "warning",
      label: `${questionsUnanswered} unanswered question${questionsUnanswered > 1 ? "s" : ""}`,
      detail: "Families are waiting for responses",
    });
  }

  if (leadCount > 0 && leadOpenRate < 50) {
    flags.push({
      type: "warning",
      label: `Low lead engagement (${leadOpenRate}% opened)`,
      detail: `Only opened ${leadsOpened} of ${leadCount} leads`,
    });
  }

  if (isGenericEmail) {
    flags.push({
      type: "info",
      label: "Generic email address",
      detail: genericReason || "May not reach decision maker",
    });
  }

  if (images.length < 3) {
    flags.push({
      type: "opportunity",
      label: images.length === 0 ? "No photos uploaded" : `Only ${images.length} photo${images.length > 1 ? "s" : ""}`,
      detail: "Adding real photos helps families connect",
    });
  }

  if (completenessPercentage < 70) {
    flags.push({
      type: "opportunity",
      label: `Profile ${completenessPercentage}% complete`,
      detail: `Missing: ${missingSections.slice(0, 3).join(", ")}`,
    });
  }

  if (dashboardVisits30d === 0 && lastLogin === null) {
    flags.push({
      type: "info",
      label: "No recent dashboard activity",
      detail: "May not know about their provider dashboard",
    });
  }

  if (emailStatsResult.sent > 3 && emailStatsResult.opened === 0) {
    flags.push({
      type: "warning",
      label: "Not opening emails",
      detail: `Sent ${emailStatsResult.sent} emails, 0 opened`,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Deterministic Recommended Action (priority order)
  // All pitchAngles focus on scheduling a call/meeting with founders
  // ─────────────────────────────────────────────────────────────────────────────
  let recommendedAction = {
    priority: 99,
    action: "General check-in",
    rationale: "No specific issues detected",
    pitchAngle: "Schedule a quick call to see how they're finding the platform and if we can help",
  };

  // Get campaign status for priority decisions
  const campaignStatus = campaignDetails?.status || null;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERTED PROVIDERS (have active/recent campaigns)
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 1: Campaign is LIVE - check in on performance
  if (campaignStatus === "live") {
    const delivered = campaignDetails?.delivered || 0;
    const spend = campaignDetails?.spendCents ? `$${(campaignDetails.spendCents / 100).toFixed(0)}` : "their budget";
    recommendedAction = {
      priority: 1,
      action: "Campaign performance check-in",
      rationale: `Active campaign: ${delivered} families delivered so far`,
      pitchAngle: `Schedule a call to review their campaign results - ${delivered} families reached, ${spend} spent`,
    };
  }
  // Priority 2: Campaign ENDED - review results and pitch renewal
  else if (campaignStatus === "ended") {
    const delivered = campaignDetails?.delivered || 0;
    recommendedAction = {
      priority: 2,
      action: "Campaign wrap-up and renewal",
      rationale: `Campaign ended: delivered ${delivered} families`,
      pitchAngle: `Schedule a call to review campaign ROI (${delivered} families) and discuss next steps`,
    };
  }
  // Priority 3: Campaign PENDING PROFILE - help complete to launch
  else if (campaignStatus === "pending_profile") {
    recommendedAction = {
      priority: 3,
      action: "Unblock Ad Boost launch",
      rationale: `Profile ${completenessPercentage}% complete - needs 70%+ to launch their campaign`,
      pitchAngle: "Schedule a call to complete their profile together so we can launch their Ad Boost",
    };
  }
  // Priority 4: Campaign REQUESTED - follow up on setup
  else if (campaignStatus === "requested" || campaignStatus === "scheduled") {
    recommendedAction = {
      priority: 4,
      action: "Ad Boost setup follow-up",
      rationale: "Campaign requested, awaiting setup",
      pitchAngle: "Schedule a call to finalize their campaign setup and answer any questions",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // URGENT ISSUES (affects family experience)
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 5: Unanswered questions - families waiting
  else if (questionsUnanswered > 0) {
    recommendedAction = {
      priority: 5,
      action: `Help answer ${questionsUnanswered} waiting question${questionsUnanswered > 1 ? "s" : ""}`,
      rationale: "Families asked questions and are waiting for responses",
      pitchAngle: `Schedule a quick call to help them respond - ${questionsUnanswered} ${questionsUnanswered > 1 ? "families are" : "family is"} waiting`,
    };
  }
  // Priority 6: Low lead engagement - missing opportunities
  else if (leadCount > 3 && leadOpenRate < 30) {
    recommendedAction = {
      priority: 6,
      action: "Fix notification setup",
      rationale: `Only opened ${leadsOpened} of ${leadCount} leads (${leadOpenRate}%)`,
      pitchAngle: "Schedule a call to make sure they're getting notified when families reach out",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDJOBS OPPORTUNITIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 7: MedJobs pilot - check conversion
  else if (medjobsStatus === "in_pilot") {
    recommendedAction = {
      priority: 7,
      action: "MedJobs pilot check-in",
      rationale: medjobsOpportunityReason || "Currently in MedJobs pilot",
      pitchAngle: "Schedule a call to see how the staffing pilot is going and discuss continuing",
    };
  }
  // Priority 8: MedJobs expired - re-engage
  else if (medjobsStatus === "pilot_expired") {
    recommendedAction = {
      priority: 8,
      action: "MedJobs renewal",
      rationale: "Their MedJobs pilot has expired",
      pitchAngle: "Schedule a call to discuss renewing their staffing program access",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEW GENERATION OPPORTUNITY
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 9: No Google reviews - strong opportunity
  else if (reviewOpportunityLevel === "strong") {
    recommendedAction = {
      priority: 9,
      action: "Help get Google reviews",
      rationale: reviewOpportunityReason || "No reviews yet",
      pitchAngle: "Schedule a call to set up review requests - we can help them get their first reviews",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WARM LEADS (showed interest in features)
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 10: Viewed Ad Boost multiple times but hasn't requested
  else if (adBoostViews >= 2 && !adCampaigns.length && tracking?.ads_status === "none") {
    recommendedAction = {
      priority: 10,
      action: "Follow up on Ad Boost interest",
      rationale: `Viewed Ad Boost page ${adBoostViews} times but hasn't requested`,
      pitchAngle: "Schedule a call to answer their Ad Boost questions - they've been checking it out",
    };
  }
  // Priority 11: Started Ad Boost apply but didn't finish
  // Only if they haven't signed up yet (ads_status is "none")
  else if (adBoostApplyStarted && !adCampaigns.length && tracking?.ads_status === "none") {
    recommendedAction = {
      priority: 11,
      action: "Help complete Ad Boost request",
      rationale: "Started Ad Boost application but didn't finish",
      pitchAngle: "Schedule a call to help them finish their Ad Boost request",
    };
  }
  // Priority 12: Viewed MedJobs but not enrolled
  else if (marketViewCount > 0 && medjobsStatus === "none" && medjobsEligible) {
    recommendedAction = {
      priority: 12,
      action: "Follow up on staffing interest",
      rationale: `Viewed staffing page ${marketViewCount} time${marketViewCount > 1 ? "s" : ""} but not enrolled`,
      pitchAngle: "Schedule a call to discuss the staffing program - they've been looking at it",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT ISSUES
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 13: Dormant provider
  else if (dashboardVisits30d === 0 && daysOverdue > 14) {
    recommendedAction = {
      priority: 13,
      action: "Re-engage dormant provider",
      rationale: `No dashboard activity in 30 days, ${daysOverdue} days since last touch`,
      pitchAngle: "Schedule a call to walk them through their dashboard and what families see",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE OPTIMIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 14: Incomplete profile (blocking conversions)
  else if (completenessPercentage < 60) {
    recommendedAction = {
      priority: 14,
      action: "Help complete profile",
      rationale: `Profile only ${completenessPercentage}% complete - missing ${missingSections.slice(0, 2).join(", ")}`,
      pitchAngle: "Schedule a call to complete their profile together - it helps families find them",
    };
  }
  // Priority 15: No photos
  else if (images.length < 2) {
    recommendedAction = {
      priority: 15,
      action: "Add photos",
      rationale: images.length === 0 ? "No photos uploaded" : "Only 1 photo uploaded",
      pitchAngle: "Schedule a call to help add photos - it really helps families connect",
    };
  }
  // Priority 16: Mild review opportunity
  else if (reviewOpportunityLevel === "mild") {
    recommendedAction = {
      priority: 16,
      action: "Boost reviews",
      rationale: reviewOpportunityReason || "Could use more reviews",
      pitchAngle: "Schedule a call to set up review requests - more reviews build trust",
    };
  }
  // Priority 17: Generic email
  else if (isGenericEmail) {
    recommendedAction = {
      priority: 17,
      action: "Get direct contact",
      rationale: "Using generic email that may not reach decision maker",
      pitchAngle: "Schedule a call to get their direct contact for better communication",
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSION OPPORTUNITIES (no specific issues)
  // ═══════════════════════════════════════════════════════════════════════════

  // Priority 18: Good engagement, pitch free trial
  else if (leadCount > 5 && tracking?.ads_status === "none") {
    recommendedAction = {
      priority: 18,
      action: "Pitch Ad Boost free trial",
      rationale: `Active provider with ${leadCount} leads, good engagement, no ads yet`,
      pitchAngle: "Schedule a call to discuss Ad Boost - they're doing well, ads could multiply their reach",
    };
  }
  // Priority 19: MedJobs eligible, not pitched
  else if (medjobsEligible && medjobsStatus === "none") {
    recommendedAction = {
      priority: 19,
      action: "Introduce MedJobs staffing",
      rationale: "Eligible for MedJobs staffing program",
      pitchAngle: "Schedule a call to discuss staffing - if they hire, we can help them find candidates",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Data-Driven Opening Script
  // Aligned with recommended action priorities - opener should match the call purpose
  // ─────────────────────────────────────────────────────────────────────────────
  const claimDaysAgoRaw = tracking?.claimed_at
    ? Math.floor((Date.now() - new Date(tracking.claimed_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  // Handle edge case where claimed_at is in the future (timezone issues, bad data)
  const claimDaysAgo = claimDaysAgoRaw !== null && claimDaysAgoRaw >= 0 ? claimDaysAgoRaw : null;
  const claimTimePhrase = claimDaysAgo !== null
    ? claimDaysAgo === 0 ? "today"
      : claimDaysAgo === 1 ? "yesterday"
      : claimDaysAgo < 7 ? `${claimDaysAgo} days ago`
      : claimDaysAgo < 30 ? `about ${Math.round(claimDaysAgo / 7)} week${Math.round(claimDaysAgo / 7) > 1 ? "s" : ""} ago`
      : `about ${Math.round(claimDaysAgo / 30)} month${Math.round(claimDaysAgo / 30) > 1 ? "s" : ""} ago`
    : "recently";

  let openingScript = "";

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERTED PROVIDERS - talk about their campaign
  // ═══════════════════════════════════════════════════════════════════════════
  if (campaignStatus === "live") {
    const delivered = campaignDetails?.delivered || 0;
    openingScript = `Hi, this is [your name] from Olera. I'm calling about your Ad Boost campaign - you've reached ${delivered} families so far. How are things going with the leads coming in?`;
  }
  else if (campaignStatus === "ended") {
    const delivered = campaignDetails?.delivered || 0;
    openingScript = `Hi, this is [your name] from Olera. Your Ad Boost campaign just wrapped up - we reached ${delivered} families for you. I wanted to check in and see how the leads worked out.`;
  }
  else if (campaignStatus === "pending_profile") {
    openingScript = `Hi, this is [your name] from Olera. I noticed you requested Ad Boost and we're ready to help get your campaign launched. I just need to go through your profile with you to make sure families see your best side.`;
  }
  else if (campaignStatus === "requested" || campaignStatus === "scheduled") {
    openingScript = `Hi, this is [your name] from Olera. I'm following up on your Ad Boost request - I wanted to make sure you got everything you need and answer any questions about how the campaign will work.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // URGENT ISSUES - families are waiting
  // ═══════════════════════════════════════════════════════════════════════════
  else if (questionsUnanswered > 0) {
    openingScript = `Hi, this is [your name] from Olera. I noticed you have ${questionsUnanswered} family question${questionsUnanswered > 1 ? "s" : ""} waiting on your profile - are you getting notified when those come in?`;
  }
  else if (leadCount > 3 && leadOpenRate < 30) {
    openingScript = `Hi, this is [your name] from Olera. You've received ${leadCount} leads, but it looks like some might not be getting to you. I want to make sure your notifications are set up right.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDJOBS - staffing program
  // ═══════════════════════════════════════════════════════════════════════════
  else if (medjobsStatus === "in_pilot") {
    openingScript = `Hi, this is [your name] from Olera. I'm checking in on your staffing pilot - how's it going finding candidates so far?`;
  }
  else if (medjobsStatus === "pilot_expired") {
    openingScript = `Hi, this is [your name] from Olera. Your staffing pilot recently ended - I wanted to see how it went and if you're still looking to hire.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEWS - social proof opportunity
  // ═══════════════════════════════════════════════════════════════════════════
  else if (reviewOpportunityLevel === "strong" && rating === null) {
    openingScript = `Hi, this is [your name] from Olera. I noticed your profile doesn't have any Google reviews yet - would you like help getting some? Happy families often just need a reminder to leave a review.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WARM LEADS - they showed interest in features
  // ═══════════════════════════════════════════════════════════════════════════
  else if (adBoostViews >= 2 && !adCampaigns.length && tracking?.ads_status === "none") {
    openingScript = `Hi, this is [your name] from Olera. I saw you've been checking out Ad Boost on your dashboard. Do you have questions about how it works? I can walk you through it.`;
  }
  else if (adBoostApplyStarted && !adCampaigns.length && tracking?.ads_status === "none") {
    openingScript = `Hi, this is [your name] from Olera. I noticed you started an Ad Boost request but didn't finish - is there something I can help you with to complete it?`;
  }
  else if (marketViewCount > 0 && medjobsStatus === "none" && medjobsEligible) {
    openingScript = `Hi, this is [your name] from Olera. I saw you've been looking at the staffing program. Are you hiring right now? I can tell you more about how it works.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT - recent activity or dormant
  // ═══════════════════════════════════════════════════════════════════════════
  else if (sectionsEdited.length > 0) {
    openingScript = `Hi, this is [your name] from Olera. I saw you recently updated your ${sectionsEdited[0]} section - how's the profile looking?`;
  }
  else if (dashboardVisits30d === 0 && daysOverdue > 14) {
    openingScript = `Hi, this is [your name] from Olera. It's been a little while since we connected - I wanted to check in and see how things are going. Are you still getting leads from families?`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL - good status or no specific issue
  // ═══════════════════════════════════════════════════════════════════════════
  else if (leadCount > 5) {
    openingScript = `Hi, this is [your name] from Olera. You've gotten ${leadCount} family inquiries - that's great! I'm calling to see how things are going and if there's anything we can help with.`;
  }
  else if (images.length === 0) {
    openingScript = `Hi, this is [your name] from Olera. You claimed your profile ${claimTimePhrase} - I noticed your page doesn't have photos yet. Would you like help adding some? It really helps families connect.`;
  }
  else {
    openingScript = `Hi, this is [your name] from Olera. You claimed your profile ${claimTimePhrase}. I'm calling to check in - how's everything going with your page?`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // What to Capture Checklist
  // Ordered by priority - most actionable items first, segment-specific
  // ─────────────────────────────────────────────────────────────────────────────
  const captureChecklist: Array<{ item: string; reason: string }> = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN-RELATED CAPTURES (for converted providers)
  // ═══════════════════════════════════════════════════════════════════════════
  if (campaignStatus === "live") {
    captureChecklist.push({ item: "Campaign satisfaction (1-10)", reason: "Active campaign" });
    captureChecklist.push({ item: "Quality of leads received", reason: "Track campaign effectiveness" });
  }
  if (campaignStatus === "ended") {
    captureChecklist.push({ item: "Ready for another campaign?", reason: "Campaign ended - renewal opportunity" });
    captureChecklist.push({ item: "What worked/didn't work?", reason: "Improve next campaign" });
  }
  if (campaignStatus === "pending_profile") {
    captureChecklist.push({ item: "When can they complete profile?", reason: "Profile blocking campaign launch" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // URGENT ISSUES (families waiting)
  // ═══════════════════════════════════════════════════════════════════════════
  if (questionsUnanswered > 0) {
    captureChecklist.push({ item: "Will they respond to questions?", reason: `${questionsUnanswered} waiting` });
  }
  if (leadCount > 0 && leadOpenRate < 50) {
    captureChecklist.push({ item: "Preferred contact method", reason: "Low lead open rate" });
    captureChecklist.push({ item: "Best time to reach them?", reason: "Improve notification delivery" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDJOBS CAPTURES
  // ═══════════════════════════════════════════════════════════════════════════
  if (medjobsStatus === "in_pilot") {
    captureChecklist.push({ item: "Finding good candidates?", reason: "Pilot satisfaction check" });
    captureChecklist.push({ item: "Ready to subscribe?", reason: "Conversion opportunity" });
  }
  if (medjobsStatus === "pilot_expired") {
    captureChecklist.push({ item: "Why didn't they continue?", reason: "Learn from churn" });
    captureChecklist.push({ item: "Still hiring?", reason: "Re-engagement opportunity" });
  }
  if (medjobsEligible && medjobsStatus === "none" && marketViewCount > 0) {
    captureChecklist.push({ item: "What roles do they hire for?", reason: "Showed staffing interest" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEW OPPORTUNITY CAPTURES
  // ═══════════════════════════════════════════════════════════════════════════
  if (reviewOpportunityLevel === "strong") {
    captureChecklist.push({ item: "Do they ask families for reviews?", reason: "No/few reviews" });
    captureChecklist.push({ item: "Would they use review request tool?", reason: "Feature pitch opportunity" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WARM LEAD CAPTURES (showed interest but didn't convert)
  // ═══════════════════════════════════════════════════════════════════════════
  if (adBoostViews >= 2 && !adCampaigns.length && tracking?.ads_status === "none") {
    captureChecklist.push({ item: "What's holding them back on Ad Boost?", reason: "Viewed multiple times" });
  }
  // Only show if they haven't signed up yet (ads_status is "none")
  // Otherwise they completed signup but campaign record may not exist yet
  if (adBoostApplyStarted && !adCampaigns.length && tracking?.ads_status === "none") {
    captureChecklist.push({ item: "Why didn't they finish Ad Boost request?", reason: "Abandoned application" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE OPTIMIZATION CAPTURES
  // ═══════════════════════════════════════════════════════════════════════════
  if (completenessPercentage < 70) {
    captureChecklist.push({ item: "What's blocking profile completion?", reason: "Profile incomplete" });
  }
  if (images.length < 2) {
    captureChecklist.push({ item: "Can they send photos or schedule photo help?", reason: "Few/no photos" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTACT INFO CAPTURES (always important)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isGenericEmail) {
    captureChecklist.push({ item: "Direct contact email", reason: "Current email is generic" });
  }
  if (!profile?.phone) {
    captureChecklist.push({ item: "Phone number", reason: "No phone on file" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSION OPPORTUNITY CAPTURES (no specific issues)
  // ═══════════════════════════════════════════════════════════════════════════
  if (tracking?.ads_status === "none" && !adBoostViews && leadCount > 3) {
    captureChecklist.push({ item: "Interest in ads? Objections?", reason: "Good engagement, no ads" });
  }
  if (medjobsEligible && medjobsStatus === "none" && marketViewCount === 0) {
    captureChecklist.push({ item: "Do they hire caregivers?", reason: "MedJobs eligible" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════
  if (captureChecklist.length === 0) {
    captureChecklist.push({ item: "Any feedback or issues?", reason: "General check-in" });
    captureChecklist.push({ item: "What would make Olera more useful?", reason: "Product feedback" });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Compute Tags (for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────────
  const computedTags: string[] = [];

  if (leadCount === 0) computedTags.push("0 leads");
  else if (leadCount === 1) computedTags.push("1 lead");
  else computedTags.push(`${leadCount} leads`);

  if (touchCount === 0) computedTags.push("no touches");
  else if (touchCount >= 10) computedTags.push(`${touchCount} touches, highly engaged`);
  else computedTags.push(`${touchCount} touches`);

  if (daysOverdue > 14) computedTags.push(`${daysOverdue} days overdue`);
  else if (daysOverdue > 7) computedTags.push(`${daysOverdue}d since activity`);

  if (emailStatsResult.sent > 0 && emailStatsResult.opened === 0) computedTags.push("not opening emails");
  else if (emailStatsResult.clicked > 0) computedTags.push("clicks emails");

  if (verificationState === "verified") computedTags.push("verified");
  else if (verificationState === "pending") computedTags.push("pending verification");

  if (questionsUnanswered > 0) computedTags.push(`${questionsUnanswered} unanswered Q`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Return Complete Data
  // ─────────────────────────────────────────────────────────────────────────────
  return {
    // Original metrics
    googleRating: googleData.rating ?? null,
    googleReviewCount: googleData.review_count ?? null,
    photoCount: images.length,
    adSpendCents,

    // Computed
    touchCount,
    daysOverdue,
    leadCount,

    // Details
    leads: (leadsResult.data || []).map((l) => ({
      created_at: l.created_at,
      message: l.message || null,
      familyName: (l.from_profile as { display_name?: string } | null)?.display_name || null,
    })),
    touchpoints: (touchpointsResult.data || []).map((t) => ({
      type: t.touchpoint_type,
      notes: (t.details as Record<string, unknown>)?.notes as string || null,
      created_at: t.created_at,
    })),
    emailStats: emailStatsResult,

    // Provider info
    provider: {
      displayName: profile?.display_name || "Unknown Provider",
      contactName: staff.name || null,
      phone: profile?.phone || null,
      email: profile?.email || null,
      city: profile?.city || "",
      state: profile?.state || "",
      careTypes: profile?.care_types || [],
      verificationState,
      slug: providerSlug || null,
    },

    // Status
    pipelineStage: tracking?.pipeline_stage || "unknown",
    adsStatus: tracking?.ads_status || "none",
    medjobsStatus: tracking?.medjobs_status || "none",
    claimedAt: tracking?.claimed_at || null,

    // Tags
    computedTags,

    // ─────────────────────────────────────────────────────────────────────────────
    // NEW: Data-driven briefing fields
    // ─────────────────────────────────────────────────────────────────────────────

    questions: {
      received: questionsReceived,
      answered: questionsAnswered,
      unanswered: questionsUnanswered,
      recentQuestions,
    },

    engagement: {
      lastDashboardVisit,
      dashboardVisits30d,
      lastProfileEdit,
      profileEdits30d,
      sectionsEdited,
      lastLogin,
      leadsOpened,
      leadOpenRate,
      contactsRevealed,
    },

    photos: {
      count: images.length,
      hasHeroImage: images.length > 0,
      urls: images.slice(0, 4) as string[],
    },

    reviews: {
      rating: googleData.rating ?? null,
      count: googleData.review_count ?? null,
      opportunityLevel: reviewOpportunityLevel,
      opportunityReason: reviewOpportunityReason,
      hasUsedReviewRequests,
      reviewRequestsSent,
    },

    emailAssessment: {
      isGeneric: isGenericEmail,
      genericReason,
    },

    profileCompleteness: {
      percentage: completenessPercentage,
      missingSections,
      hasDescription,
      hasPricing,
      hasStaffInfo,
      hasHours,
    },

    adBoost: {
      hasAnyCampaign: adCampaigns.length > 0,
      activeCampaign,
      totalCampaigns: adCampaigns.length,
      lastCampaignStatus: (primaryCampaign?.status as "pending_profile" | "requested" | "scheduled" | "live" | "ended" | "cancelled") || null,
      totalLeadsFromAds,
      campaign: campaignDetails,
    },

    medjobs: {
      status: medjobsStatus,
      eligible: medjobsEligible,
      pilotStartedAt: medjobsPilotStartedAt,
      subscribedAt: medjobsSubscribedAt,
      opportunityLevel: medjobsOpportunityLevel,
      opportunityReason: medjobsOpportunityReason,
    },

    featureEngagement: {
      adBoostViews,
      adBoostLastViewed,
      adBoostApplyStarted,
      reviewsCtaClicked,
      reviewsCtaLastClicked,
      marketViewCount,
      marketLastViewed,
      warmLeadSignals,
    },

    flags,
    recommendedAction,
    openingScript,
    captureChecklist,
  };
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
  let pendingOutcomes = 0;
  let pendingOutcomesToday = 0;
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

    // Meeting metrics - only count meetings that can have outcomes logged (past + today, not future)
    const awaitingOutcome = row.pipeline_stage === "meeting_scheduled" || row.pipeline_stage === "upgrade_meeting";

    if (awaitingOutcome && row.meeting_scheduled_at) {
      const meetingDate = new Date(row.meeting_scheduled_at);
      const isPast = meetingDate < todayStart;
      const isToday = meetingDate >= todayStart && meetingDate <= todayEnd;
      const isFuture = meetingDate > todayEnd;

      // Only count past and today (can log outcome), exclude future (can't log yet)
      if (!isFuture) {
        pendingOutcomes++;

        if (isToday) {
          pendingOutcomesToday++;
        } else if (isPast) {
          pendingOutcomesPast++;
        }
      }
    } else if (awaitingOutcome && !row.meeting_scheduled_at) {
      // Provider in meeting stage but no date set - count as pending (edge case)
      pendingOutcomes++;
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
    pending_outcomes: pendingOutcomes,
    pending_outcomes_today: pendingOutcomesToday,
    pending_outcomes_past: pendingOutcomesPast,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Call Count Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CallStats {
  count: number;
  lastCallAt: string | null;
  lastCallOutcome: string | null;
}

/**
 * Get activity stats for a list of tracking IDs.
 * Counts both legacy "call_attempted" and new "activity_logged" touchpoints.
 * Returns a Map of tracking_id -> { count, lastCallAt }.
 */
export async function getCallStatsForTrackingIds(
  trackingIds: string[]
): Promise<Map<string, CallStats>> {
  if (trackingIds.length === 0) {
    return new Map();
  }

  const db = getServiceClient();

  // Fetch both call_attempted (legacy) and activity_logged (new) touchpoints
  // Any activity logged means we're actively working on this provider
  const stats = new Map<string, CallStats>();
  const BATCH_SIZE = 100;

  for (let i = 0; i < trackingIds.length; i += BATCH_SIZE) {
    const batchIds = trackingIds.slice(i, i + BATCH_SIZE);

    const { data, error } = await db
      .from("provider_growth_touchpoints")
      .select("tracking_id, created_at, touchpoint_type, details")
      .in("tracking_id", batchIds)
      .in("touchpoint_type", ["call_attempted", "activity_logged"]);

    if (error) {
      console.error("[provider-growth] Activity stats query error:", error);
      continue;
    }

    // Count occurrences and track most recent activity per tracking_id
    for (const row of data ?? []) {
      const id = row.tracking_id;
      const details = row.details as Record<string, unknown> | null;

      // Extract outcome from details (new format: outcome, legacy: status)
      let outcome: string | null = null;
      if (details) {
        outcome = (details.outcome as string) || (details.status as string) || null;
      }

      const existing = stats.get(id);
      if (existing) {
        existing.count++;
        // Update if this activity is more recent
        if (row.created_at > (existing.lastCallAt || "")) {
          existing.lastCallAt = row.created_at;
          existing.lastCallOutcome = outcome;
        }
      } else {
        stats.set(id, { count: 1, lastCallAt: row.created_at, lastCallOutcome: outcome });
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
// Admin Counts for Filtering
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminCount {
  count: number;
  display_name?: string;
}

export interface AdminCounts {
  [adminId: string]: AdminCount;
}

export interface GetAdminCountsOptions {
  pipelineStages?: PipelineStage[];
  hasCallAttempts?: boolean;
  converted?: boolean;
  notConverted?: boolean;
  adsStatus?: AdsStatus;
  medjobsStatus?: MedjobsStatus | MedjobsStatus[];
}

/**
 * Get counts of providers per assigned admin for a given tab/filter combination.
 * Used for the admin filter chips on the Provider Growth page.
 */
export async function getAdminCountsForTab(options: GetAdminCountsOptions): Promise<AdminCounts> {
  const db = getServiceClient();

  // Build base query
  let query = db
    .from("provider_growth_tracking")
    .select("assigned_to, ads_status, medjobs_status, id");

  // Apply pipeline stage filter
  if (options.pipelineStages && options.pipelineStages.length > 0) {
    query = query.in("pipeline_stage", options.pipelineStages);
  }

  // Apply ads status filter
  if (options.adsStatus && options.adsStatus !== "none") {
    query = query.eq("ads_status", options.adsStatus);
  }

  // Apply medjobs status filter
  if (options.medjobsStatus) {
    if (Array.isArray(options.medjobsStatus)) {
      const filtered = options.medjobsStatus.filter((s) => s !== "none");
      if (filtered.length > 0) {
        query = query.in("medjobs_status", filtered);
      }
    } else if (options.medjobsStatus !== "none") {
      query = query.eq("medjobs_status", options.medjobsStatus);
    }
  }

  // Apply converted filter
  if (options.converted) {
    query = query.or("ads_status.eq.free_intro,medjobs_status.in.(in_pilot,pilot_expired)");
  }

  // Apply not converted filter
  if (options.notConverted) {
    query = query.eq("ads_status", "none");
    query = query.neq("medjobs_status", "in_pilot");
    query = query.neq("medjobs_status", "pilot_expired");
  }

  // Only include providers with assigned_to set
  query = query.not("assigned_to", "is", null);

  const { data, error } = await query;

  if (error) {
    console.error("[provider-growth] Admin counts query error:", error);
    return {};
  }

  // If we need to filter by hasCallAttempts, we need to fetch touchpoints
  let filteredData = data ?? [];
  if (options.hasCallAttempts !== undefined) {
    const trackingIds = filteredData.map((r) => r.id);
    if (trackingIds.length > 0) {
      const callStats = await getCallStatsForTrackingIds(trackingIds);
      filteredData = filteredData.filter((r) => {
        const hasCalls = (callStats.get(r.id)?.count || 0) > 0;
        return options.hasCallAttempts ? hasCalls : !hasCalls;
      });
    }
  }

  // Group by assigned_to
  const adminIds = new Set<string>();
  const counts: Record<string, number> = {};

  for (const row of filteredData) {
    if (row.assigned_to) {
      adminIds.add(row.assigned_to);
      counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
    }
  }

  // Fetch admin names
  const adminCounts: AdminCounts = {};

  if (adminIds.size > 0) {
    const { data: admins } = await db
      .from("admin_users")
      .select("id, display_name")
      .in("id", Array.from(adminIds));

    const nameMap = new Map<string, string>();
    for (const admin of admins ?? []) {
      nameMap.set(admin.id, admin.display_name || "Unknown");
    }

    for (const adminId of adminIds) {
      adminCounts[adminId] = {
        count: counts[adminId] || 0,
        display_name: nameMap.get(adminId) || "Unknown",
      };
    }
  }

  return adminCounts;
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
  // Filter by assigned admin
  assignedTo?: string;
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
    assignedTo,
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

  // Assigned admin filter
  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
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

  // Add call_count, last_call_at, and last_call_outcome to each provider
  providers = providers.map((p) => {
    const stats = callStats.get(p.id);
    return {
      ...p,
      call_count: stats?.count || 0,
      last_call_at: stats?.lastCallAt || null,
      last_call_outcome: stats?.lastCallOutcome || null,
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
  meeting_format?: MeetingFormat | null;
  meeting_phone?: string | null;
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
