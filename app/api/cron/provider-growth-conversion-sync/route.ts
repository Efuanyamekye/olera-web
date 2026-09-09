/**
 * Cron: Provider Growth Conversion Sync
 *
 * Automatically detects and syncs conversion status from source systems:
 * - Ad Boost: ad_campaign_requests → ads_status
 * - MedJobs: business_profiles.metadata → medjobs_status
 *
 * This catches:
 * 1. Self-service conversions (none → free_intro/in_pilot)
 * 2. Upgrades to paid subscriptions (free_intro → subscribed, in_pilot → subscribed)
 *
 * Schedule: Every hour (0 * * * *)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

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
      tracking_created: 0,
      errors: [] as string[],
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Create tracking records for providers with ad campaigns who
    // aren't yet in provider_growth_tracking (fills the sync gap)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // Get all unique provider_ids from ad_campaign_requests
      const { data: adProviders, error: adProvidersError } = await db
        .from("ad_campaign_requests")
        .select("provider_id")
        .is("deleted_at", null)
        .neq("status", "cancelled");

      if (adProvidersError) {
        console.error("[cron/provider-growth-conversion-sync] Ad providers query error:", adProvidersError);
      } else if (adProviders && adProviders.length > 0) {
        // Get unique provider IDs
        const adProviderIds = [...new Set(adProviders.map(p => p.provider_id))];

        // Find which ones are missing from tracking
        const { data: existingTracking } = await db
          .from("provider_growth_tracking")
          .select("business_profile_id")
          .in("business_profile_id", adProviderIds);

        const existingIds = new Set((existingTracking || []).map(t => t.business_profile_id));
        const missingIds = adProviderIds.filter(id => !existingIds.has(id));

        if (missingIds.length > 0) {
          console.log(`[cron/provider-growth-conversion-sync] Found ${missingIds.length} ad providers without tracking records`);

          // Get business profile info for these providers (for claim source detection)
          const { data: profiles } = await db
            .from("business_profiles")
            .select("id, city, state, source, claim_state, created_at")
            .in("id", missingIds.slice(0, 50)); // Limit to avoid timeout

          // Create tracking records for missing providers
          for (const profile of (profiles || [])) {
            // Only create tracking for claimed providers
            if (profile.claim_state !== "claimed") continue;

            // Detect MedJobs eligibility using proper catchment detection
            const medjobsEligibility = detectMedjobsCatchment(profile.city, profile.state);

            const { error: insertError } = await db
              .from("provider_growth_tracking")
              .insert({
                business_profile_id: profile.id,
                claim_source: profile.source === "new_org_signup" ? "new_org_signup" : "email",
                claimed_at: profile.created_at,
                medjobs_eligible: medjobsEligibility.eligible,
                medjobs_catchment_university: medjobsEligibility.university,
                pipeline_stage: "new_claim",
                pipeline_stage_changed_at: profile.created_at,
                // ads_status will be synced in STEP 2 below
              });

            if (insertError) {
              // Ignore duplicate key errors (race condition with other processes)
              if (insertError.code !== "23505") {
                console.error(`[cron/provider-growth-conversion-sync] Failed to create tracking for ${profile.id}:`, insertError);
              }
            } else {
              results.tracking_created++;
              console.log(`[cron/provider-growth-conversion-sync] Created tracking record for ad provider: ${profile.id}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("[cron/provider-growth-conversion-sync] Step 1 (create missing) error:", err);
      // Continue with step 2 even if step 1 fails
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Sync conversion status for existing tracking records
    // ─────────────────────────────────────────────────────────────────────────

    // Get tracking records that might need updates (with limit to avoid timeout)
    // Check for:
    // - Initial conversions: ads_status = 'none' OR medjobs_status = 'none'
    // - Upgrades: ads_status = 'free_intro' (might have subscribed)
    // - MedJobs upgrades: medjobs_status in ('in_pilot', 'pilot_expired') (might have subscribed)
    const { data: trackingRecords, error: trackingError } = await db
      .from("provider_growth_tracking")
      .select("id, business_profile_id, ads_status, medjobs_status, pipeline_stage")
      .or("ads_status.eq.none,ads_status.eq.free_intro,medjobs_status.eq.none,medjobs_status.eq.in_pilot,medjobs_status.eq.pilot_expired")
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

      // Check Ads conversion or upgrade
      // - none → free_intro or subscribed (initial conversion)
      // - free_intro → subscribed (upgrade)
      if (record.ads_status !== "subscribed") {
        const campaigns = adCampaignMap.get(record.business_profile_id) || [];
        const adsStatus = detectAdsStatus(campaigns);

        // Only update if there's an actual change AND it's a progression
        // (none → free_intro, none → subscribed, free_intro → subscribed)
        const isProgression =
          (record.ads_status === "none" && adsStatus.status !== "none") ||
          (record.ads_status === "free_intro" && adsStatus.status === "subscribed");

        if (isProgression) {
          updates.ads_status = adsStatus.status;
          if (adsStatus.freeIntroAt && !updates.ads_free_intro_at) {
            updates.ads_free_intro_at = adsStatus.freeIntroAt;
          }
          if (adsStatus.subscribedAt) {
            updates.ads_subscribed_at = adsStatus.subscribedAt;
          }
          touchpointDetails.ads_status = adsStatus.status;
          touchpointDetails.ads_detected_from = "ad_campaign_requests";
          touchpointDetails.ads_previous_status = record.ads_status;
        }
      }

      // Check MedJobs conversion or upgrade
      // - none → in_pilot or subscribed (initial conversion)
      // - in_pilot → subscribed or pilot_expired (progression)
      // - pilot_expired → subscribed (re-engagement)
      if (record.medjobs_status !== "subscribed") {
        const metadata = profileMap.get(record.business_profile_id) ?? null;
        const medjobsStatus = detectMedjobsStatus(metadata);

        // Only update if there's an actual change AND it's a valid progression
        // Valid progressions (never regress to "none" from a conversion state):
        // - none → in_pilot, none → subscribed (initial conversion)
        // - in_pilot → pilot_expired, in_pilot → subscribed (natural progression)
        // - pilot_expired → subscribed (re-engagement)
        const isValidProgression =
          (record.medjobs_status === "none" && medjobsStatus.status !== "none") ||
          (record.medjobs_status === "in_pilot" && (medjobsStatus.status === "pilot_expired" || medjobsStatus.status === "subscribed")) ||
          (record.medjobs_status === "pilot_expired" && medjobsStatus.status === "subscribed");

        if (isValidProgression) {
          updates.medjobs_status = medjobsStatus.status;
          if (medjobsStatus.pilotStartedAt) {
            updates.medjobs_pilot_started_at = medjobsStatus.pilotStartedAt;
          }
          if (medjobsStatus.subscribedAt) {
            updates.medjobs_subscribed_at = medjobsStatus.subscribedAt;
          }
          touchpointDetails.medjobs_status = medjobsStatus.status;
          touchpointDetails.medjobs_detected_from = "business_profiles.metadata";
          touchpointDetails.medjobs_previous_status = record.medjobs_status;
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
          // Distinguish between initial conversion and upgrade
          const isUpgrade = touchpointDetails.ads_previous_status === "free_intro";
          const touchpointType = isUpgrade ? "ads_upgraded" : "ads_converted";

          const { error: tpError } = await db.from("provider_growth_touchpoints").insert({
            tracking_id: record.id,
            business_profile_id: record.business_profile_id,
            touchpoint_type: touchpointType,
            details: touchpointDetails,
          });
          if (tpError) {
            console.error(`[cron/provider-growth-conversion-sync] Touchpoint insert failed for ${record.id}:`, tpError);
          }
          results.ads_updated++;
        }

        if (updates.medjobs_status) {
          // Distinguish between initial conversion and upgrade
          const isUpgrade =
            touchpointDetails.medjobs_previous_status === "in_pilot" ||
            touchpointDetails.medjobs_previous_status === "pilot_expired";
          const touchpointType = isUpgrade ? "medjobs_upgraded" : "medjobs_converted";

          const { error: tpError } = await db.from("provider_growth_touchpoints").insert({
            tracking_id: record.id,
            business_profile_id: record.business_profile_id,
            touchpoint_type: touchpointType,
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
  subscribedAt: string | null;
} {
  if (!metadata) {
    return { status: "none", pilotStartedAt: null, subscribedAt: null };
  }

  // Subscription overrides pilot
  if (metadata.medjobs_subscription_active === true) {
    return {
      status: "subscribed",
      pilotStartedAt: metadata.interview_terms_accepted_at || null,
      // Use current timestamp as subscription detection time
      subscribedAt: new Date().toISOString(),
    };
  }

  const acceptedAt = metadata.interview_terms_accepted_at;
  if (!acceptedAt) {
    return { status: "none", pilotStartedAt: null, subscribedAt: null };
  }

  // Check if within pilot window
  const startDate = new Date(acceptedAt);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + PILOT_DAYS);

  if (Date.now() < endDate.getTime()) {
    return { status: "in_pilot", pilotStartedAt: acceptedAt, subscribedAt: null };
  } else {
    return { status: "pilot_expired", pilotStartedAt: acceptedAt, subscribedAt: null };
  }
}
