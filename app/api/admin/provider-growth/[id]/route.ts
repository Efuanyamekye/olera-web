import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  getTrackingById,
  updateTracking,
  getTouchpoints,
  createTouchpoint,
  type UpdateTrackingInput,
} from "@/lib/provider-growth/queries";
import {
  PIPELINE_STAGES,
  ADS_STATUSES,
  MEDJOBS_STATUSES,
  INTEREST_LEVELS,
  TOUCHPOINT_TYPES,
  canTransitionTo,
  type PipelineStage,
  type AdsStatus,
  type MedjobsStatus,
  type InterestLevel,
  type TouchpointType,
} from "@/lib/provider-growth/stages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/provider-growth/[id]
 *
 * Get a single tracking record with touchpoints.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await context.params;
    const tracking = await getTrackingById(id);

    if (!tracking) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Also fetch touchpoints
    const touchpoints = await getTouchpoints(id);

    return NextResponse.json({ tracking, touchpoints });
  } catch (e) {
    console.error("[provider-growth] GET [id] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/provider-growth/[id]
 *
 * Update a tracking record. Supports:
 * - pipeline_stage transitions
 * - Meeting scheduling/completion
 * - Pitch logging
 * - Ads/MedJobs status updates
 * - Notes
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    // Validate touchpoint_type early if provided
    if (body.touchpoint_type && !TOUCHPOINT_TYPES.includes(body.touchpoint_type)) {
      return NextResponse.json(
        { error: `Invalid touchpoint_type: ${body.touchpoint_type}` },
        { status: 400 }
      );
    }

    // Get current tracking record
    const current = await getTrackingById(id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Build update input with validation
    const input: UpdateTrackingInput = {};

    // Pipeline stage transition
    if (body.pipeline_stage !== undefined) {
      if (!PIPELINE_STAGES.includes(body.pipeline_stage)) {
        return NextResponse.json(
          { error: `Invalid pipeline_stage: ${body.pipeline_stage}` },
          { status: 400 }
        );
      }
      if (
        body.pipeline_stage !== current.pipeline_stage &&
        !canTransitionTo(current.pipeline_stage, body.pipeline_stage)
      ) {
        return NextResponse.json(
          {
            error: `Invalid transition from ${current.pipeline_stage} to ${body.pipeline_stage}`,
          },
          { status: 400 }
        );
      }
      input.pipeline_stage = body.pipeline_stage as PipelineStage;
    }

    // Meeting fields
    if (body.calendly_event_id !== undefined) {
      input.calendly_event_id = body.calendly_event_id;
    }
    if (body.meeting_scheduled_at !== undefined) {
      input.meeting_scheduled_at = body.meeting_scheduled_at;
    }
    if (body.meeting_completed_at !== undefined) {
      input.meeting_completed_at = body.meeting_completed_at;
    }

    // Pitch fields
    if (body.pitched_at !== undefined) {
      input.pitched_at = body.pitched_at;
    }
    if (body.pitched_ads !== undefined) {
      input.pitched_ads = body.pitched_ads;
    }
    if (body.pitched_medjobs !== undefined) {
      input.pitched_medjobs = body.pitched_medjobs;
    }
    if (body.pitch_notes !== undefined) {
      input.pitch_notes = body.pitch_notes;
    }
    if (body.pitch_interest_level !== undefined) {
      if (body.pitch_interest_level !== null && !INTEREST_LEVELS.includes(body.pitch_interest_level)) {
        return NextResponse.json(
          { error: `Invalid pitch_interest_level: ${body.pitch_interest_level}` },
          { status: 400 }
        );
      }
      input.pitch_interest_level = body.pitch_interest_level as InterestLevel;
    }

    // Ads status
    if (body.ads_status !== undefined) {
      if (!ADS_STATUSES.includes(body.ads_status)) {
        return NextResponse.json(
          { error: `Invalid ads_status: ${body.ads_status}` },
          { status: 400 }
        );
      }
      input.ads_status = body.ads_status as AdsStatus;

      // Auto-set timestamps
      if (body.ads_status === "free_intro" && !current.ads_free_intro_at) {
        input.ads_free_intro_at = new Date().toISOString();
      }
      if (body.ads_status === "subscribed" && !current.ads_subscribed_at) {
        input.ads_subscribed_at = new Date().toISOString();
      }
    }

    // MedJobs status
    if (body.medjobs_status !== undefined) {
      if (!MEDJOBS_STATUSES.includes(body.medjobs_status)) {
        return NextResponse.json(
          { error: `Invalid medjobs_status: ${body.medjobs_status}` },
          { status: 400 }
        );
      }
      input.medjobs_status = body.medjobs_status as MedjobsStatus;

      // Auto-set timestamps
      if (body.medjobs_status === "in_pilot" && !current.medjobs_pilot_started_at) {
        input.medjobs_pilot_started_at = new Date().toISOString();
      }
      if (body.medjobs_status === "subscribed" && !current.medjobs_subscribed_at) {
        input.medjobs_subscribed_at = new Date().toISOString();
      }
    }

    // Not interested
    if (body.not_interested_at !== undefined) {
      input.not_interested_at = body.not_interested_at;
    }
    if (body.not_interested_reason !== undefined) {
      input.not_interested_reason = body.not_interested_reason;
    }

    // Assignment and notes
    if (body.assigned_to !== undefined) {
      input.assigned_to = body.assigned_to;
    }
    if (body.notes !== undefined) {
      input.notes = body.notes;
    }

    // Perform update
    const updated = await updateTracking(id, input, adminUser.id);

    // Log automatic touchpoints for significant changes
    const touchpointsToLog: Array<{ type: TouchpointType; details: Record<string, unknown> }> = [];

    // Notes update
    if (body.notes !== undefined && body.notes !== current.notes) {
      touchpointsToLog.push({
        type: "note_added",
        details: { note: body.notes },
      });
    }

    // Assignment change
    if (body.assigned_to !== undefined && body.assigned_to !== current.assigned_to) {
      touchpointsToLog.push({
        type: "assigned",
        details: { assigned_to: body.assigned_to },
      });
    }

    // Ads status conversion
    if (body.ads_status && body.ads_status !== current.ads_status) {
      if (body.ads_status === "free_intro" && current.ads_status === "none") {
        touchpointsToLog.push({
          type: "ads_converted",
          details: { from: current.ads_status, to: body.ads_status },
        });
      } else if (body.ads_status === "subscribed") {
        touchpointsToLog.push({
          type: "ads_upgraded",
          details: { from: current.ads_status, to: body.ads_status },
        });
      }
    }

    // MedJobs status conversion
    if (body.medjobs_status && body.medjobs_status !== current.medjobs_status) {
      if (body.medjobs_status === "in_pilot" && current.medjobs_status === "none") {
        touchpointsToLog.push({
          type: "medjobs_converted",
          details: { from: current.medjobs_status, to: body.medjobs_status },
        });
      } else if (body.medjobs_status === "subscribed") {
        touchpointsToLog.push({
          type: "medjobs_upgraded",
          details: { from: current.medjobs_status, to: body.medjobs_status },
        });
      }
    }

    // Log all automatic touchpoints
    for (const tp of touchpointsToLog) {
      await createTouchpoint({
        tracking_id: id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: tp.type,
        details: tp.details,
        admin_user_id: adminUser.id,
      });
    }

    // Log additional custom touchpoint if specified (already validated above)
    if (body.touchpoint_type) {
      await createTouchpoint({
        tracking_id: id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: body.touchpoint_type as TouchpointType,
        details: body.touchpoint_details || {},
        admin_user_id: adminUser.id,
      });
    }

    return NextResponse.json({ tracking: updated });
  } catch (e) {
    console.error("[provider-growth] PATCH [id] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
