import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  getTrackingById,
  updateTracking,
  createTouchpoint,
} from "@/lib/provider-growth/queries";
import { INTEREST_LEVELS, type InterestLevel } from "@/lib/provider-growth/stages";

/**
 * POST /api/admin/provider-growth/log-pitch
 *
 * Log the outcome of a pitch meeting. Updates the tracking record
 * and moves the provider to the "pitched" stage.
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
    const {
      tracking_id,
      pitched_ads,
      pitched_medjobs,
      interest_level,
      notes,
      mark_not_interested,
      not_interested_reason,
    } = body;

    if (!tracking_id) {
      return NextResponse.json({ error: "tracking_id is required" }, { status: 400 });
    }

    // Validate interest level if provided
    if (interest_level && !INTEREST_LEVELS.includes(interest_level)) {
      return NextResponse.json(
        { error: `Invalid interest_level: ${interest_level}` },
        { status: 400 }
      );
    }

    // Get current tracking
    const current = await getTrackingById(tracking_id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Validate stage - can only log pitch from meeting_scheduled or pitched (follow-up)
    if (current.pipeline_stage !== "meeting_scheduled" && current.pipeline_stage !== "pitched") {
      return NextResponse.json(
        { error: `Cannot log pitch from stage: ${current.pipeline_stage}. Must be in meeting_scheduled or pitched.` },
        { status: 400 }
      );
    }

    // Determine target stage
    const targetStage = mark_not_interested ? "not_interested" : "pitched";

    // Update the tracking record
    const updated = await updateTracking(
      tracking_id,
      {
        pipeline_stage: targetStage,
        pitched_at: new Date().toISOString(),
        pitched_ads: pitched_ads ?? false,
        pitched_medjobs: pitched_medjobs ?? false,
        pitch_interest_level: interest_level as InterestLevel,
        pitch_notes: notes,
        meeting_completed_at: new Date().toISOString(),
        ...(mark_not_interested
          ? {
              not_interested_at: new Date().toISOString(),
              not_interested_reason,
            }
          : {}),
      },
      adminUser.id
    );

    // Log touchpoint
    await createTouchpoint({
      tracking_id,
      business_profile_id: current.business_profile_id,
      touchpoint_type: mark_not_interested ? "marked_not_interested" : "pitch_logged",
      details: {
        pitched_ads,
        pitched_medjobs,
        interest_level,
        notes,
        ...(mark_not_interested ? { not_interested_reason } : {}),
      },
      admin_user_id: adminUser.id,
    });

    return NextResponse.json({ tracking: updated });
  } catch (e) {
    console.error("[provider-growth] POST log-pitch error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
