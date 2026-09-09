import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getTrackingById } from "@/lib/provider-growth/queries";
import {
  ACTIVITY_OUTCOMES,
  STAGE_OUTCOMES,
  STAGE_CHANGING_OUTCOMES,
  OUTCOME_STAGE_TRANSITIONS,
  type ActivityOutcome,
  type PipelineStage,
} from "@/lib/provider-growth/stages";

/**
 * POST /api/admin/provider-growth/log-activity
 *
 * Log a unified activity for a provider. Handles both simple call outcomes
 * and stage-changing outcomes like meeting_scheduled, not_interested, etc.
 *
 * Body: {
 *   tracking_id: string,
 *   business_profile_id: string,
 *   outcome: ActivityOutcome,
 *   notes?: string
 * }
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
    const { tracking_id, business_profile_id, outcome, notes } = body;

    if (!tracking_id || !business_profile_id) {
      return NextResponse.json(
        { error: "tracking_id and business_profile_id are required" },
        { status: 400 }
      );
    }

    if (!outcome || !ACTIVITY_OUTCOMES.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${ACTIVITY_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }

    // Get current tracking record
    const current = await getTrackingById(tracking_id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Validate that the outcome is valid for the current pipeline stage
    const currentStage = current.pipeline_stage as PipelineStage;
    const validOutcomes = STAGE_OUTCOMES[currentStage] || [];
    if (!validOutcomes.includes(outcome as ActivityOutcome)) {
      return NextResponse.json(
        { error: `Invalid outcome "${outcome}" for stage "${currentStage}". Valid outcomes: ${validOutcomes.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getServiceClient();
    const now = new Date().toISOString();

    // Determine if this outcome changes the stage
    const isStageChanging = STAGE_CHANGING_OUTCOMES.includes(outcome as ActivityOutcome);
    let newStage: PipelineStage | null = null;

    if (isStageChanging) {
      const transitions = OUTCOME_STAGE_TRANSITIONS[outcome as ActivityOutcome];
      newStage = transitions?.[current.pipeline_stage as PipelineStage] || null;

      // Special handling: meeting_scheduled also needs to update meeting fields
      // But Calendly handles that via webhook, so this is for manual scheduling
    }

    // Build touchpoint details
    const details: Record<string, unknown> = {
      outcome,
      notes: notes?.trim() || null,
    };

    if (newStage) {
      details.previous_stage = current.pipeline_stage;
      details.new_stage = newStage;
    }

    // Insert the activity touchpoint
    const { data: inserted, error: insertError } = await db
      .from("provider_growth_touchpoints")
      .insert({
        tracking_id,
        business_profile_id,
        touchpoint_type: "activity_logged",
        admin_user_id: adminUser.id,
        details,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[log-activity] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to log activity" }, { status: 500 });
    }

    // Update the tracking record
    const trackingUpdates: Record<string, unknown> = {
      last_activity_at: now,
      updated_at: now,
    };

    if (newStage) {
      trackingUpdates.pipeline_stage = newStage;
      trackingUpdates.pipeline_stage_changed_at = now;

      // Handle specific outcome side effects
      if (outcome === "not_interested") {
        trackingUpdates.not_interested_at = now;
      }
      if (outcome === "no_show") {
        trackingUpdates.no_show_count = (current.no_show_count ?? 0) + 1;
        trackingUpdates.last_no_show_at = now;
        trackingUpdates.meeting_scheduled_at = null;
        trackingUpdates.calendly_event_id = null;
      }
      if (outcome === "interested") {
        // Only set meeting_completed_at when coming from a meeting stage
        if (currentStage === "meeting_scheduled" || currentStage === "upgrade_meeting") {
          trackingUpdates.meeting_completed_at = now;
        }
      }
    }

    const { error: updateError } = await db
      .from("provider_growth_tracking")
      .update(trackingUpdates)
      .eq("id", tracking_id);

    if (updateError) {
      console.error("[log-activity] Update error:", updateError);
      // Don't fail the whole request, the touchpoint was already created
    }

    // Return the activity entry
    const activity = {
      id: inserted.id,
      tracking_id: inserted.tracking_id,
      touchpoint_type: inserted.touchpoint_type,
      outcome,
      notes: notes?.trim() || null,
      admin_id: adminUser.id,
      admin_name: adminUser.display_name || null,
      created_at: inserted.created_at,
      details,
    };

    return NextResponse.json({
      success: true,
      activity,
      stage_changed: !!newStage,
      new_stage: newStage,
    });
  } catch (err) {
    console.error("[log-activity] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
