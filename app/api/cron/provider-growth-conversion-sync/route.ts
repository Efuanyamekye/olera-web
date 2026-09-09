/**
 * Cron: Provider Growth Conversion Sync
 *
 * Automatically detects and syncs conversion status from source systems:
 * - Ad Boost: ad_campaign_requests → ads_status
 * - MedJobs: business_profiles.metadata → medjobs_status
 *
 * This catches self-service conversions where providers convert without
 * going through the pitch meeting flow.
 *
 * Schedule: Every hour (0 * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";

const CRON_SECRET = process.env.CRON_SECRET;
const PILOT_DAYS = 90;
const BATCH_SIZE = 200; // Process in batches to avoid timeout

// Ad campaign statuses that indicate free trial engagement
const FREE_TRIAL_STATUSES = ["pending_profile", "requested", "scheduled", "live", "ended"];

interface TrackingRecord {
  id: string;
  business_profile_id: string;
  ads_status: string;
  medjobs_status: string;
  pipeline_stage: string;
}

interface BusinessProfile {
  id: string;
  metadata: {
    medjobs_subscription_active?: boolean;
    interview_terms_accepted_at?: string;
  } | null;
}

interface AdCampaign {
  provider_id: string;
  status: string;
  plan_status: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("provider-growth-conversion-sync", async () => {
    const db = getServiceClient();
    const results = {
      checked: 0,
      ads_updated: 0,
      medjobs_updated: 0,
      errors: [] as string[],
    };

    // Get tracking records that might need updates (with limit to avoid timeout)
    // (ads_status = 'none' OR medjobs_status = 'none')
    const { data: trackingRecords, error: trackingError } = await db
      .from("provider_growth_tracking")
      .select("id, business_profile_id, ads_status, medjobs_status, pipeline_stage")
      .or("ads_status.eq.none,medjobs_status.eq.none")
      .limit(BATCH_SIZE);

    if (trackingError) {
      console.error("[cron/provider-growth-conversion-sync] Query error:", trackingError);
      throw new Error("Failed to fetch tracking records");
    }

    if (!trackingRecords || trackingRecords.length === 0) {
      console.log("[cron/provider-growth-conversion-sync] No records to check");
      return results;
    }

    results.checked = trackingRecords.length;
    const profileIds = trackingRecords.map((t) => t.business_profile_id);

    // Guard against empty array (shouldn't happen but defensive)
    if (profileIds.length === 0) {
      return results;
    }

    // Fetch Ad Boost campaigns for these providers
    const { data: adCampaigns, error: adError } = await db
      .from("ad_campaign_requests")
      .select("provider_id, status, plan_status, created_at")
      .in("provider_id", profileIds)
      .is("deleted_at", null);

    if (adError) {
      console.error("[cron/provider-growth-conversion-sync] Ad campaigns query error:", adError);
    }

    // Build map of provider_id -> campaigns
    const adCampaignMap = new Map<string, AdCampaign[]>();
    for (const campaign of (adCampaigns || []) as AdCampaign[]) {
      const existing = adCampaignMap.get(campaign.provider_id) || [];
      existing.push(campaign);
      adCampaignMap.set(campaign.provider_id, existing);
    }

    // Fetch business profiles for MedJobs status
    const { data: profiles, error: profileError } = await db
      .from("business_profiles")
      .select("id, metadata")
      .in("id", profileIds);

    if (profileError) {
      console.error("[cron/provider-growth-conversion-sync] Profiles query error:", profileError);
    }

    // Build map of profile_id -> metadata
    const profileMap = new Map<string, BusinessProfile["metadata"]>();
    for (const profile of (profiles || []) as BusinessProfile[]) {
      profileMap.set(profile.id, profile.metadata);
    }

    // Process each tracking record
    for (const record of trackingRecords as TrackingRecord[]) {
      const updates: Record<string, unknown> = {};
      const touchpointDetails: Record<string, unknown> = {};

      // Check Ads conversion
      if (record.ads_status === "none") {
        const campaigns = adCampaignMap.get(record.business_profile_id) || [];
        const adsStatus = detectAdsStatus(campaigns);

        if (adsStatus.status !== "none") {
          updates.ads_status = adsStatus.status;
          if (adsStatus.freeIntroAt) {
            updates.ads_free_intro_at = adsStatus.freeIntroAt;
          }
          if (adsStatus.subscribedAt) {
            updates.ads_subscribed_at = adsStatus.subscribedAt;
          }
          touchpointDetails.ads_status = adsStatus.status;
          touchpointDetails.ads_detected_from = "ad_campaign_requests";
        }
      }

      // Check MedJobs conversion
      if (record.medjobs_status === "none") {
        const metadata = profileMap.get(record.business_profile_id) ?? null;
        const medjobsStatus = detectMedjobsStatus(metadata);

        if (medjobsStatus.status !== "none") {
          updates.medjobs_status = medjobsStatus.status;
          if (medjobsStatus.pilotStartedAt) {
            updates.medjobs_pilot_started_at = medjobsStatus.pilotStartedAt;
          }
          touchpointDetails.medjobs_status = medjobsStatus.status;
          touchpointDetails.medjobs_detected_from = "business_profiles.metadata";
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        touchpointDetails.auto_synced = true;

        const { error: updateError } = await db
          .from("provider_growth_tracking")
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);

        if (updateError) {
          console.error(`[cron/provider-growth-conversion-sync] Update failed for ${record.id}:`, updateError);
          results.errors.push(`Failed to update ${record.id}`);
          continue;
        }

        // Create touchpoint(s) for audit trail
        if (updates.ads_status) {
          const { error: tpError } = await db.from("provider_growth_touchpoints").insert({
            tracking_id: record.id,
            business_profile_id: record.business_profile_id,
            touchpoint_type: "ads_converted",
            details: touchpointDetails,
          });
          if (tpError) {
            console.error(`[cron/provider-growth-conversion-sync] Touchpoint insert failed for ${record.id}:`, tpError);
          }
          results.ads_updated++;
        }

        if (updates.medjobs_status) {
          const { error: tpError } = await db.from("provider_growth_touchpoints").insert({
            tracking_id: record.id,
            business_profile_id: record.business_profile_id,
            touchpoint_type: "medjobs_converted",
            details: touchpointDetails,
          });
          if (tpError) {
            console.error(`[cron/provider-growth-conversion-sync] Touchpoint insert failed for ${record.id}:`, tpError);
          }
          results.medjobs_updated++;
        }

        console.log(`[cron/provider-growth-conversion-sync] Updated ${record.id}:`, updates);
      }
    }

    console.log("[cron/provider-growth-conversion-sync] Completed:", results);
    return results;
  });
}

function detectAdsStatus(campaigns: AdCampaign[]): {
  status: "none" | "free_intro" | "subscribed";
  freeIntroAt: string | null;
  subscribedAt: string | null;
} {
  if (!campaigns || campaigns.length === 0) {
    return { status: "none", freeIntroAt: null, subscribedAt: null };
  }

  // Check for active subscription first
  const subscribed = campaigns.find(
    (c) => c.plan_status === "active" || c.plan_status === "past_due"
  );
  if (subscribed) {
    return {
      status: "subscribed",
      freeIntroAt: campaigns[0]?.created_at || null,
      subscribedAt: null, // We don't have exact timestamp
    };
  }

  // Check for free trial
  const trialCampaign = campaigns.find((c) => FREE_TRIAL_STATUSES.includes(c.status));
  if (trialCampaign) {
    return {
      status: "free_intro",
      freeIntroAt: trialCampaign.created_at,
      subscribedAt: null,
    };
  }

  return { status: "none", freeIntroAt: null, subscribedAt: null };
}

function detectMedjobsStatus(metadata: BusinessProfile["metadata"]): {
  status: "none" | "in_pilot" | "pilot_expired" | "subscribed";
  pilotStartedAt: string | null;
} {
  if (!metadata) {
    return { status: "none", pilotStartedAt: null };
  }

  // Subscription overrides pilot
  if (metadata.medjobs_subscription_active === true) {
    return {
      status: "subscribed",
      pilotStartedAt: metadata.interview_terms_accepted_at || null,
    };
  }

  const acceptedAt = metadata.interview_terms_accepted_at;
  if (!acceptedAt) {
    return { status: "none", pilotStartedAt: null };
  }

  // Check if within pilot window
  const startDate = new Date(acceptedAt);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + PILOT_DAYS);

  if (Date.now() < endDate.getTime()) {
    return { status: "in_pilot", pilotStartedAt: acceptedAt };
  } else {
    return { status: "pilot_expired", pilotStartedAt: acceptedAt };
  }
}
