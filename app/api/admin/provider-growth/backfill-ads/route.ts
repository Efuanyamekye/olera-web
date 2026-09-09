import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";

/**
 * GET /api/admin/provider-growth/backfill-ads
 *
 * DRY RUN - Shows which Ad Boost providers are missing from Provider Growth
 * and what would be synced. Does NOT modify any data.
 *
 * POST /api/admin/provider-growth/backfill-ads
 *
 * EXECUTE - Actually performs the backfill (creates tracking records, updates ads_status).
 */

// Ad campaign statuses that indicate free trial engagement
const FREE_TRIAL_STATUSES = ["pending_profile", "requested", "scheduled", "live", "ended"];

interface AdCampaign {
  provider_id: string;
  status: string;
  plan_status: string | null;
  created_at: string;
}

interface BusinessProfile {
  id: string;
  display_name: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  claim_state: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET - Dry Run (preview what will be synced)
// ─────────────────────────────────────────────────────────────────────────────
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

    const db = getServiceClient();

    // Step 1: Get ALL providers from ad_campaign_requests
    const { data: adCampaigns, error: adError } = await db
      .from("ad_campaign_requests")
      .select("provider_id, status, plan_status, created_at")
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (adError) {
      return NextResponse.json({ error: "Failed to fetch ad campaigns" }, { status: 500 });
    }

    // Build map of provider_id -> campaigns
    const campaignMap = new Map<string, AdCampaign[]>();
    for (const campaign of (adCampaigns || []) as AdCampaign[]) {
      const existing = campaignMap.get(campaign.provider_id) || [];
      existing.push(campaign);
      campaignMap.set(campaign.provider_id, existing);
    }

    const allAdProviderIds = [...campaignMap.keys()];

    // Step 2: Get ALL providers from provider_growth_tracking
    const { data: allTracking } = await db
      .from("provider_growth_tracking")
      .select("business_profile_id, ads_status");

    const trackingMap = new Map<string, string>();
    for (const t of allTracking || []) {
      trackingMap.set(t.business_profile_id, t.ads_status);
    }

    // Step 3: Find mismatches
    const missingFromTracking: string[] = [];
    const needsStatusUpdate: string[] = [];
    const alreadySynced: string[] = [];

    for (const providerId of allAdProviderIds) {
      const tracking = trackingMap.get(providerId);
      if (!tracking) {
        missingFromTracking.push(providerId);
      } else if (tracking === "none") {
        needsStatusUpdate.push(providerId);
      } else {
        alreadySynced.push(providerId);
      }
    }

    // Step 4: Get business profile details for missing/needs-update providers
    const idsToFetch = [...missingFromTracking, ...needsStatusUpdate];
    let profileDetails: BusinessProfile[] = [];

    if (idsToFetch.length > 0) {
      const { data: profiles } = await db
        .from("business_profiles")
        .select("id, display_name, city, state, source, claim_state, created_at")
        .in("id", idsToFetch);
      profileDetails = (profiles || []) as BusinessProfile[];
    }

    const profileMap = new Map<string, BusinessProfile>();
    for (const p of profileDetails) {
      profileMap.set(p.id, p);
    }

    // Build detailed results
    const missingDetails = missingFromTracking.map(id => {
      const profile = profileMap.get(id);
      const campaigns = campaignMap.get(id) || [];
      const adsStatus = detectAdsStatus(campaigns);
      return {
        provider_id: id,
        display_name: profile?.display_name || "Unknown",
        city: profile?.city,
        state: profile?.state,
        claim_state: profile?.claim_state,
        will_create_tracking: profile?.claim_state === "claimed",
        skip_reason: profile?.claim_state !== "claimed" ? `claim_state is "${profile?.claim_state}"` : null,
        ads_status_will_be: adsStatus.status,
        campaign_count: campaigns.length,
        campaign_statuses: campaigns.map(c => c.status),
      };
    });

    const needsUpdateDetails = needsStatusUpdate.map(id => {
      const profile = profileMap.get(id);
      const campaigns = campaignMap.get(id) || [];
      const adsStatus = detectAdsStatus(campaigns);
      return {
        provider_id: id,
        display_name: profile?.display_name || "Unknown",
        current_ads_status: "none",
        ads_status_will_be: adsStatus.status,
        campaign_count: campaigns.length,
        campaign_statuses: campaigns.map(c => c.status),
      };
    });

    const alreadySyncedDetails = alreadySynced.map(id => {
      const campaigns = campaignMap.get(id) || [];
      return {
        provider_id: id,
        current_ads_status: trackingMap.get(id),
        campaign_count: campaigns.length,
      };
    });

    return NextResponse.json({
      dry_run: true,
      summary: {
        total_ad_boost_providers: allAdProviderIds.length,
        already_synced: alreadySynced.length,
        missing_from_tracking: missingFromTracking.length,
        needs_status_update: needsStatusUpdate.length,
        will_be_skipped: missingDetails.filter(d => !d.will_create_tracking).length,
      },
      details: {
        missing_from_tracking: missingDetails,
        needs_status_update: needsUpdateDetails,
        already_synced: alreadySyncedDetails,
      },
      instructions: "To execute the backfill, send a POST request to this same endpoint.",
    });
  } catch (err) {
    console.error("[backfill-ads] Dry run error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Execute Backfill
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const db = getServiceClient();
    const results = {
      total_ad_providers: 0,
      already_tracked: 0,
      tracking_created: 0,
      ads_status_updated: 0,
      skipped_unclaimed: 0,
      errors: [] as string[],
    };

    // Step 1: Get ALL unique provider_ids from ad_campaign_requests
    const { data: adCampaigns, error: adError } = await db
      .from("ad_campaign_requests")
      .select("provider_id, status, plan_status, created_at")
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (adError) {
      console.error("[backfill-ads] Ad campaigns query error:", adError);
      return NextResponse.json({ error: "Failed to fetch ad campaigns" }, { status: 500 });
    }

    if (!adCampaigns || adCampaigns.length === 0) {
      return NextResponse.json({ message: "No ad campaigns found", results });
    }

    // Build map of provider_id -> campaigns
    const campaignMap = new Map<string, AdCampaign[]>();
    for (const campaign of adCampaigns as AdCampaign[]) {
      const existing = campaignMap.get(campaign.provider_id) || [];
      existing.push(campaign);
      campaignMap.set(campaign.provider_id, existing);
    }

    const allProviderIds = [...campaignMap.keys()];
    results.total_ad_providers = allProviderIds.length;

    // Step 2: Find which ones are already in tracking
    const { data: existingTracking } = await db
      .from("provider_growth_tracking")
      .select("id, business_profile_id, ads_status")
      .in("business_profile_id", allProviderIds);

    const trackingMap = new Map<string, { id: string; ads_status: string }>();
    for (const t of existingTracking || []) {
      trackingMap.set(t.business_profile_id, { id: t.id, ads_status: t.ads_status });
    }

    results.already_tracked = trackingMap.size;

    // Step 3: Get business profiles for ALL providers (for creating missing tracking)
    const missingIds = allProviderIds.filter(id => !trackingMap.has(id));

    if (missingIds.length > 0) {
      const { data: profiles } = await db
        .from("business_profiles")
        .select("id, city, state, source, claim_state, created_at")
        .in("id", missingIds);

      // Create tracking records for missing providers
      for (const profile of (profiles || []) as BusinessProfile[]) {
        // Only create tracking for claimed providers
        if (profile.claim_state !== "claimed") {
          results.skipped_unclaimed++;
          continue;
        }

        // Detect MedJobs eligibility
        const medjobsEligibility = detectMedjobsCatchment(profile.city, profile.state);

        // Determine ads_status from campaigns
        const campaigns = campaignMap.get(profile.id) || [];
        const adsStatus = detectAdsStatus(campaigns);

        const { data: inserted, error: insertError } = await db
          .from("provider_growth_tracking")
          .insert({
            business_profile_id: profile.id,
            claim_source: profile.source === "new_org_signup" ? "new_org_signup" : "email",
            claimed_at: profile.created_at,
            medjobs_eligible: medjobsEligibility.eligible,
            medjobs_catchment_university: medjobsEligibility.university,
            pipeline_stage: "new_claim",
            pipeline_stage_changed_at: profile.created_at,
            ads_status: adsStatus.status,
            ads_free_intro_at: adsStatus.freeIntroAt,
            ads_subscribed_at: adsStatus.subscribedAt,
          })
          .select("id")
          .single();

        if (insertError) {
          if (insertError.code !== "23505") { // Ignore duplicate key
            results.errors.push(`Failed to create tracking for ${profile.id}: ${insertError.message}`);
          }
        } else {
          results.tracking_created++;

          // Create touchpoint for audit trail
          if (adsStatus.status !== "none") {
            await db.from("provider_growth_touchpoints").insert({
              tracking_id: inserted.id,
              business_profile_id: profile.id,
              touchpoint_type: "ads_converted",
              details: {
                ads_status: adsStatus.status,
                backfilled: true,
                source: "backfill-ads",
              },
            });
          }
        }
      }
    }

    // Step 4: Update ads_status for existing tracking records that have ads_status = 'none'
    for (const [providerId, tracking] of trackingMap) {
      if (tracking.ads_status !== "none") {
        continue; // Already has a status
      }

      const campaigns = campaignMap.get(providerId) || [];
      const adsStatus = detectAdsStatus(campaigns);

      if (adsStatus.status === "none") {
        continue; // No change needed
      }

      const { error: updateError } = await db
        .from("provider_growth_tracking")
        .update({
          ads_status: adsStatus.status,
          ads_free_intro_at: adsStatus.freeIntroAt,
          ads_subscribed_at: adsStatus.subscribedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tracking.id);

      if (updateError) {
        results.errors.push(`Failed to update ${providerId}: ${updateError.message}`);
      } else {
        results.ads_status_updated++;

        // Create touchpoint
        await db.from("provider_growth_touchpoints").insert({
          tracking_id: tracking.id,
          business_profile_id: providerId,
          touchpoint_type: "ads_converted",
          details: {
            ads_status: adsStatus.status,
            backfilled: true,
            source: "backfill-ads",
          },
        });
      }
    }

    console.log("[backfill-ads] Completed:", results);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[backfill-ads] Error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
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
