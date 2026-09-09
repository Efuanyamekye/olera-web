import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  listProviders,
  createTracking,
  type ListProvidersOptions,
  type CreateTrackingInput,
} from "@/lib/provider-growth/queries";
import { detectMedjobsCatchment } from "@/lib/provider-growth/medjobs-eligibility";
import {
  PIPELINE_STAGES,
  ADS_STATUSES,
  MEDJOBS_STATUSES,
  CLAIM_SOURCES,
  MEETING_FOCUS_OPTIONS,
  type PipelineStage,
  type AdsStatus,
  type MedjobsStatus,
  type ClaimSource,
  type MeetingFocus,
} from "@/lib/provider-growth/stages";

/**
 * GET /api/admin/provider-growth
 *
 * List providers with growth tracking. Supports filtering by:
 * - pipelineStage: new_claim | meeting_scheduled | pitched | not_interested | no_show | upgrade_meeting
 * - adsStatus: none | free_intro | subscribed
 * - medjobsStatus: none | in_pilot | pilot_expired | subscribed
 * - claimSource: cold_outreach | city_broadcast | email | page | ...
 * - medjobsEligible: true | false
 * - search: provider name search
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

    // Parse filter parameters
    const options: ListProvidersOptions = {};

    // pipelineStage can be comma-separated for multiple values (e.g., "meeting_scheduled,upgrade_meeting")
    const pipelineStage = searchParams.get("pipelineStage");
    if (pipelineStage) {
      const stages = pipelineStage.split(",").filter((s) => PIPELINE_STAGES.includes(s as PipelineStage));
      if (stages.length === 1) {
        options.pipelineStage = stages[0] as PipelineStage;
      } else if (stages.length > 1) {
        options.pipelineStages = stages as PipelineStage[];
      }
    }

    const adsStatus = searchParams.get("adsStatus");
    if (adsStatus && ADS_STATUSES.includes(adsStatus as AdsStatus)) {
      options.adsStatus = adsStatus as AdsStatus;
    }

    // medjobsStatus can be comma-separated for multiple values (e.g., "in_pilot,pilot_expired")
    const medjobsStatus = searchParams.get("medjobsStatus");
    if (medjobsStatus) {
      const statuses = medjobsStatus.split(",").filter((s) => MEDJOBS_STATUSES.includes(s as MedjobsStatus));
      if (statuses.length === 1) {
        options.medjobsStatus = statuses[0] as MedjobsStatus;
      } else if (statuses.length > 1) {
        options.medjobsStatus = statuses as MedjobsStatus[];
      }
    }

    const claimSource = searchParams.get("claimSource");
    if (claimSource && CLAIM_SOURCES.includes(claimSource as ClaimSource)) {
      options.claimSource = claimSource as ClaimSource;
    }

    const medjobsEligible = searchParams.get("medjobsEligible");
    if (medjobsEligible === "true") {
      options.medjobsEligible = true;
    } else if (medjobsEligible === "false") {
      options.medjobsEligible = false;
    }

    const search = searchParams.get("search");
    if (search) {
      options.search = search;
    }

    // Date range filtering
    const claimedFrom = searchParams.get("claimedFrom");
    if (claimedFrom) {
      options.claimedFrom = claimedFrom;
    }
    const claimedTo = searchParams.get("claimedTo");
    if (claimedTo) {
      options.claimedTo = claimedTo;
    }

    // Call attempts filter (for new_claim and converted subtabs)
    const hasCallAttempts = searchParams.get("hasCallAttempts");
    if (hasCallAttempts === "true") {
      options.hasCallAttempts = true;
    } else if (hasCallAttempts === "false") {
      options.hasCallAttempts = false;
    }

    // Converted filter (ads free_intro OR medjobs in_pilot/pilot_expired)
    const converted = searchParams.get("converted");
    if (converted === "true") {
      options.converted = true;
    }

    // Not converted filter (ads_status = none AND medjobs_status = none)
    const notConverted = searchParams.get("notConverted");
    if (notConverted === "true") {
      options.notConverted = true;
    }

    // Meeting focus filter (for Meeting Scheduled subtabs)
    const meetingFocus = searchParams.get("meetingFocus");
    if (meetingFocus && MEETING_FOCUS_OPTIONS.includes(meetingFocus as MeetingFocus)) {
      options.meetingFocus = meetingFocus as MeetingFocus;
    }

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    options.limit = Math.min(limit, 100);
    options.offset = offset;

    const orderBy = searchParams.get("orderBy");
    if (
      orderBy &&
      ["claimed_at", "meeting_scheduled_at", "pipeline_stage_changed_at", "last_activity_at"].includes(
        orderBy
      )
    ) {
      options.orderBy = orderBy as ListProvidersOptions["orderBy"];
    }

    const orderDirection = searchParams.get("orderDirection");
    if (orderDirection === "asc" || orderDirection === "desc") {
      options.orderDirection = orderDirection;
    }

    const result = await listProviders(options);

    return NextResponse.json({
      providers: result.providers,
      total: result.total,
      limit: options.limit,
      offset: options.offset,
    });
  } catch (e) {
    console.error("[provider-growth] GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/provider-growth
 *
 * Create a new growth tracking record for a provider.
 * Typically called when a provider claims their profile.
 */
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

    const body = await request.json();
    const { business_profile_id, claim_source, claimed_at } = body;

    if (!business_profile_id) {
      return NextResponse.json(
        { error: "business_profile_id is required" },
        { status: 400 }
      );
    }

    // Look up city/state from business_profiles (don't trust client-provided values)
    const db = getServiceClient();
    const { data: profile, error: profileError } = await db
      .from("business_profiles")
      .select("city, state")
      .eq("id", business_profile_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Business profile not found" },
        { status: 404 }
      );
    }

    // Detect MedJobs eligibility based on location from the profile
    const eligibility = detectMedjobsCatchment(profile.city, profile.state);

    const input: CreateTrackingInput = {
      business_profile_id,
      claim_source: claim_source || undefined,
      claimed_at: claimed_at || new Date().toISOString(),
      medjobs_eligible: eligibility.eligible,
      medjobs_catchment_university: eligibility.university || undefined,
    };

    const tracking = await createTracking(input);

    return NextResponse.json({ tracking }, { status: 201 });
  } catch (e) {
    console.error("[provider-growth] POST error:", e);
    if (e instanceof Error && e.message.includes("duplicate")) {
      return NextResponse.json(
        { error: "Tracking record already exists for this provider" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/provider-growth?tracking_id=xxx
 *
 * Remove a provider from growth tracking (does NOT delete from directory).
 * Used to clean up test accounts from the tracking table.
 */
export async function DELETE(request: NextRequest) {
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
    const trackingId = searchParams.get("tracking_id");

    if (!trackingId) {
      return NextResponse.json(
        { error: "tracking_id is required" },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Delete touchpoints first (foreign key constraint)
    await db
      .from("provider_growth_touchpoints")
      .delete()
      .eq("tracking_id", trackingId);

    // Delete the tracking record
    const { error } = await db
      .from("provider_growth_tracking")
      .delete()
      .eq("id", trackingId);

    if (error) {
      console.error("[provider-growth] DELETE error:", error);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[provider-growth] DELETE error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
