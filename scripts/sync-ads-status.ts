#!/usr/bin/env npx tsx
/**
 * Sync Ads Status to Provider Growth Tracking
 *
 * Updates ads_status for existing provider_growth_tracking records
 * based on data from ad_campaign_requests.
 *
 * The ad_campaign_requests.provider_id is the business_profiles.id.
 *
 * Usage:
 *   npx tsx scripts/sync-ads-status.ts [--dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { AdsStatus } from "../lib/provider-growth/stages";

interface AdCampaignRequest {
  provider_id: string;
  status: string;
  plan_status: string | null;
  created_at: string;
  subscribed_at: string | null;
}

function getAdsStatus(campaigns: AdCampaignRequest[]): {
  status: AdsStatus;
  freeIntroAt: string | null;
  subscribedAt: string | null;
} {
  if (!campaigns || campaigns.length === 0) {
    return { status: "none", freeIntroAt: null, subscribedAt: null };
  }

  // Sort by created_at to get the earliest campaign
  const sorted = [...campaigns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Check for active subscription first
  const subscribed = campaigns.find(
    (c) => c.plan_status === "active" || c.plan_status === "past_due"
  );
  if (subscribed) {
    return {
      status: "subscribed",
      freeIntroAt: sorted[0]?.created_at || null,
      subscribedAt: subscribed.subscribed_at || null,
    };
  }

  // Check for free intro (any campaign with these statuses)
  // Note: "ended" campaigns were free trials that completed
  const freeTrialStatuses = ["pending_profile", "requested", "scheduled", "live", "ended"];
  const hasFreeTrial = campaigns.some((c) => freeTrialStatuses.includes(c.status));

  if (hasFreeTrial) {
    return {
      status: "free_intro",
      freeIntroAt: sorted[0]?.created_at || null,
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

  console.log(`\n🔄 Sync Ads Status ${dryRun ? "(DRY RUN)" : ""}\n`);

  // Step 1: Get all ad campaign requests
  console.log("📋 Fetching ad campaigns...");
  const { data: campaigns, error: campaignsError } = await db
    .from("ad_campaign_requests")
    .select("provider_id, status, plan_status, created_at, subscribed_at")
    .is("deleted_at", null);

  if (campaignsError) {
    console.error("Failed to fetch campaigns:", campaignsError);
    process.exit(1);
  }

  console.log(`   Found ${campaigns?.length || 0} campaigns`);

  // Build a map of business_profile_id -> campaigns
  const campaignMap = new Map<string, AdCampaignRequest[]>();
  for (const campaign of campaigns || []) {
    const existing = campaignMap.get(campaign.provider_id) || [];
    existing.push(campaign);
    campaignMap.set(campaign.provider_id, existing);
  }
  console.log(`   Covering ${campaignMap.size} unique providers`);

  // Step 2: Get tracking records that need updating
  console.log("\n📋 Fetching tracking records...");
  const { data: tracking, error: trackingError } = await db
    .from("provider_growth_tracking")
    .select("id, business_profile_id, ads_status");

  if (trackingError) {
    console.error("Failed to fetch tracking:", trackingError);
    process.exit(1);
  }

  console.log(`   Found ${tracking?.length || 0} tracking records`);

  // Step 3: Calculate updates needed
  const updates: Array<{
    id: string;
    business_profile_id: string;
    old_status: string;
    new_status: AdsStatus;
    ads_free_intro_at: string | null;
    ads_subscribed_at: string | null;
  }> = [];

  for (const record of tracking || []) {
    const providerCampaigns = campaignMap.get(record.business_profile_id);
    if (!providerCampaigns) continue;

    const ads = getAdsStatus(providerCampaigns);
    if (ads.status !== record.ads_status) {
      updates.push({
        id: record.id,
        business_profile_id: record.business_profile_id,
        old_status: record.ads_status,
        new_status: ads.status,
        ads_free_intro_at: ads.freeIntroAt,
        ads_subscribed_at: ads.subscribedAt,
      });
    }
  }

  console.log(`\n📊 Updates needed: ${updates.length}`);

  if (updates.length === 0) {
    console.log("✅ All records are already in sync.");
    return;
  }

  // Count by status change
  const statusChanges: Record<string, number> = {};
  for (const update of updates) {
    const key = `${update.old_status} → ${update.new_status}`;
    statusChanges[key] = (statusChanges[key] || 0) + 1;
  }
  console.log("\nStatus changes:");
  for (const [change, count] of Object.entries(statusChanges)) {
    console.log(`   ${change}: ${count}`);
  }

  if (dryRun) {
    console.log("\n🏃 DRY RUN - No updates will be made");
    console.log("\nSample updates (first 5):");
    for (const update of updates.slice(0, 5)) {
      console.log(
        `   ${update.business_profile_id.slice(0, 8)}... | ${update.old_status} → ${update.new_status}`
      );
    }
    console.log("\n✅ Dry run complete. Run without --dry-run to apply updates.");
    return;
  }

  // Step 4: Apply updates
  console.log(`\n📥 Applying ${updates.length} updates...`);

  let successCount = 0;
  let errorCount = 0;

  for (const update of updates) {
    const { error } = await db
      .from("provider_growth_tracking")
      .update({
        ads_status: update.new_status,
        ads_free_intro_at: update.ads_free_intro_at,
        ads_subscribed_at: update.ads_subscribed_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id);

    if (error) {
      console.error(`   Failed to update ${update.id}:`, error.message);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`\n✅ Sync complete!`);
  console.log(`   Updated: ${successCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
