#!/usr/bin/env npx tsx
/**
 * Backfill Provider Growth Tracking
 *
 * Creates provider_growth_tracking records for all claimed providers.
 * Safe to run multiple times - skips providers that already have tracking records.
 *
 * Usage:
 *   npx tsx scripts/backfill-provider-growth.ts [--dry-run]
 *
 * Data sources:
 *   - business_profiles (claim_state = 'claimed')
 *   - provider_activity (claim_completed events for claim_source)
 *   - ad_campaign_requests (ads status)
 *   - business_profiles.metadata (MedJobs status)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 */

import { createClient } from "@supabase/supabase-js";
import { detectMedjobsCatchment } from "../lib/provider-growth/medjobs-eligibility";
import type { AdsStatus, MedjobsStatus, ClaimSource } from "../lib/provider-growth/stages";

const PILOT_DAYS = 90;
const BATCH_SIZE = 50;

interface ClaimedProvider {
  id: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  claimed_at: string | null;
  source_provider_id: string | null;
  metadata: {
    medjobs_subscription_active?: boolean;
    interview_terms_accepted_at?: string;
  } | null;
}

interface AdCampaignRequest {
  provider_id: string;
  status: string;
  plan_status: string | null;
  created_at: string;
  subscribed_at: string | null;
}

interface ClaimEvent {
  provider_id: string;
  profile_id: string | null;
  metadata: { source?: string } | null;
  created_at: string;
}

function getMedjobsStatus(metadata: ClaimedProvider["metadata"]): {
  status: MedjobsStatus;
  pilotStartedAt: string | null;
  subscribedAt: string | null;
} {
  if (!metadata) {
    return { status: "none", pilotStartedAt: null, subscribedAt: null };
  }

  if (metadata.medjobs_subscription_active === true) {
    return {
      status: "subscribed",
      pilotStartedAt: metadata.interview_terms_accepted_at || null,
      subscribedAt: null, // We don't have this timestamp readily available
    };
  }

  const acceptedAt = metadata.interview_terms_accepted_at;
  if (!acceptedAt) {
    return { status: "none", pilotStartedAt: null, subscribedAt: null };
  }

  const startDate = new Date(acceptedAt);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + PILOT_DAYS);

  if (Date.now() < endDate.getTime()) {
    return { status: "in_pilot", pilotStartedAt: acceptedAt, subscribedAt: null };
  } else {
    return { status: "pilot_expired", pilotStartedAt: acceptedAt, subscribedAt: null };
  }
}

function getAdsStatus(campaigns: AdCampaignRequest[]): {
  status: AdsStatus;
  freeIntroAt: string | null;
  subscribedAt: string | null;
} {
  if (!campaigns || campaigns.length === 0) {
    return { status: "none", freeIntroAt: null, subscribedAt: null };
  }

  // Check for active subscription first
  const subscribed = campaigns.find((c) => c.plan_status === "active" || c.plan_status === "past_due");
  if (subscribed) {
    return {
      status: "subscribed",
      freeIntroAt: campaigns[0]?.created_at || null,
      subscribedAt: subscribed.subscribed_at || null,
    };
  }

  // Check for free intro (any campaign that indicates trial engagement)
  // "ended" = completed free trial but didn't convert to paying
  const freeTrialStatuses = ["pending_profile", "requested", "scheduled", "live", "ended"];
  const trialCampaign = campaigns.find((c) => freeTrialStatuses.includes(c.status));
  if (trialCampaign) {
    return {
      status: "free_intro",
      freeIntroAt: trialCampaign.created_at,
      subscribedAt: null,
    };
  }

  return { status: "none", freeIntroAt: null, subscribedAt: null };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey);

  console.log(`\n🚀 Provider Growth Backfill ${dryRun ? "(DRY RUN)" : ""}\n`);

  // Step 1: Get all claimed providers
  console.log("📋 Fetching claimed providers...");
  const { data: claimedProviders, error: claimedError } = await db
    .from("business_profiles")
    .select("id, slug, city, state, claimed_at, source_provider_id, metadata")
    .eq("claim_state", "claimed")
    .in("type", ["organization", "caregiver"]);

  if (claimedError) {
    console.error("Failed to fetch claimed providers:", claimedError);
    process.exit(1);
  }

  console.log(`   Found ${claimedProviders?.length || 0} claimed providers`);

  if (!claimedProviders || claimedProviders.length === 0) {
    console.log("No claimed providers to backfill.");
    return;
  }

  // Step 2: Get existing tracking records (to skip)
  console.log("📋 Checking existing tracking records...");
  const { data: existingTracking, error: existingError } = await db
    .from("provider_growth_tracking")
    .select("business_profile_id");

  if (existingError) {
    console.error("Failed to fetch existing tracking:", existingError);
    process.exit(1);
  }

  const existingIds = new Set((existingTracking || []).map((t) => t.business_profile_id));
  console.log(`   Found ${existingIds.size} existing tracking records`);

  const providersToBackfill = claimedProviders.filter((p) => !existingIds.has(p.id));
  console.log(`   ${providersToBackfill.length} providers need backfill`);

  if (providersToBackfill.length === 0) {
    console.log("\n✅ All providers already have tracking records. Nothing to do.");
    return;
  }

  // Step 3: Get claim_completed events for source attribution
  console.log("📋 Fetching claim events for source attribution...");
  const profileIds = providersToBackfill.map((p) => p.id);
  const { data: claimEvents, error: claimError } = await db
    .from("provider_activity")
    .select("provider_id, profile_id, metadata, created_at")
    .eq("event_type", "claim_completed");

  if (claimError) {
    console.error("Failed to fetch claim events:", claimError);
    // Continue without claim source - not fatal
  }

  // Build a map of profile_id -> claim source
  const claimSourceMap = new Map<string, string>();
  for (const event of (claimEvents as ClaimEvent[]) || []) {
    const profileId = event.profile_id;
    if (profileId && event.metadata?.source) {
      claimSourceMap.set(profileId, event.metadata.source);
    }
  }
  console.log(`   Found ${claimSourceMap.size} claim events with source`);

  // Step 4: Get ad campaign requests for ads status
  // Note: ad_campaign_requests.provider_id is the business_profiles.id (UUID)
  console.log("📋 Fetching ad campaign data...");
  const businessProfileIds = providersToBackfill.map((p) => p.id);

  const { data: adCampaigns, error: adError } = await db
    .from("ad_campaign_requests")
    .select("provider_id, status, plan_status, created_at, subscribed_at")
    .in("provider_id", businessProfileIds.length > 0 ? businessProfileIds : ["__none__"])
    .is("deleted_at", null);

  if (adError) {
    console.error("Failed to fetch ad campaigns:", adError);
    // Continue without ads data - not fatal
  }

  // Build a map of provider_id -> campaigns
  const adCampaignMap = new Map<string, AdCampaignRequest[]>();
  for (const campaign of (adCampaigns as AdCampaignRequest[]) || []) {
    const existing = adCampaignMap.get(campaign.provider_id) || [];
    existing.push(campaign);
    adCampaignMap.set(campaign.provider_id, existing);
  }
  console.log(`   Found ${adCampaignMap.size} providers with ad campaigns`);

  // Step 5: Build tracking records
  console.log("\n🔧 Building tracking records...\n");

  const trackingRecords: Array<{
    business_profile_id: string;
    claim_source: ClaimSource | null;
    claimed_at: string | null;
    medjobs_eligible: boolean;
    medjobs_catchment_university: string | null;
    ads_status: AdsStatus;
    ads_free_intro_at: string | null;
    ads_subscribed_at: string | null;
    medjobs_status: MedjobsStatus;
    medjobs_pilot_started_at: string | null;
    medjobs_subscribed_at: string | null;
    pipeline_stage: "new_claim";
    pipeline_stage_changed_at: string;
  }> = [];

  const now = new Date().toISOString();
  let medjobsEligibleCount = 0;
  let adsActiveCount = 0;
  let medjobsActiveCount = 0;

  for (const provider of providersToBackfill) {
    // Detect MedJobs eligibility
    const eligibility = detectMedjobsCatchment(provider.city, provider.state);
    if (eligibility.eligible) medjobsEligibleCount++;

    // Get claim source
    const claimSource = claimSourceMap.get(provider.id) as ClaimSource | undefined;

    // Get MedJobs status from metadata
    const medjobs = getMedjobsStatus(provider.metadata);
    if (medjobs.status !== "none") medjobsActiveCount++;

    // Get Ads status from campaigns (provider_id is business_profiles.id)
    const campaigns = adCampaignMap.get(provider.id);
    const ads = getAdsStatus(campaigns || []);
    if (ads.status !== "none") adsActiveCount++;

    trackingRecords.push({
      business_profile_id: provider.id,
      claim_source: claimSource || null,
      claimed_at: provider.claimed_at,
      medjobs_eligible: eligibility.eligible,
      medjobs_catchment_university: eligibility.university,
      ads_status: ads.status,
      ads_free_intro_at: ads.freeIntroAt,
      ads_subscribed_at: ads.subscribedAt,
      medjobs_status: medjobs.status,
      medjobs_pilot_started_at: medjobs.pilotStartedAt,
      medjobs_subscribed_at: medjobs.subscribedAt,
      pipeline_stage: "new_claim",
      pipeline_stage_changed_at: now,
    });
  }

  console.log("📊 Summary:");
  console.log(`   Total providers to backfill: ${trackingRecords.length}`);
  console.log(`   MedJobs eligible: ${medjobsEligibleCount}`);
  console.log(`   With Ads activity: ${adsActiveCount}`);
  console.log(`   With MedJobs activity: ${medjobsActiveCount}`);

  if (dryRun) {
    console.log("\n🏃 DRY RUN - No records will be inserted");
    console.log("\nSample records (first 5):");
    for (const record of trackingRecords.slice(0, 5)) {
      console.log(`   - ${record.business_profile_id.slice(0, 8)}... | ` +
        `claim_source=${record.claim_source || "unknown"} | ` +
        `ads=${record.ads_status} | ` +
        `medjobs=${record.medjobs_status} | ` +
        `medjobs_eligible=${record.medjobs_eligible}`);
    }
    console.log("\n✅ Dry run complete. Run without --dry-run to insert records.");
    return;
  }

  // Step 6: Insert in batches
  console.log(`\n📥 Inserting ${trackingRecords.length} records in batches of ${BATCH_SIZE}...`);

  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < trackingRecords.length; i += BATCH_SIZE) {
    const batch = trackingRecords.slice(i, i + BATCH_SIZE);
    const { data, error } = await db
      .from("provider_growth_tracking")
      .insert(batch)
      .select("id");

    if (error) {
      console.error(`   Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      errorCount += batch.length;
    } else {
      insertedCount += data?.length || 0;
      process.stdout.write(`   Inserted ${insertedCount}/${trackingRecords.length}\r`);
    }
  }

  console.log(`\n\n✅ Backfill complete!`);
  console.log(`   Inserted: ${insertedCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
