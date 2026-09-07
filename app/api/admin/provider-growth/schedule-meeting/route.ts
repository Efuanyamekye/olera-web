import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  getTrackingById,
  updateTracking,
  createTouchpoint,
} from "@/lib/provider-growth/queries";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";
import { canTransitionTo } from "@/lib/provider-growth/stages";

/**
 * POST /api/admin/provider-growth/schedule-meeting
 *
 * Generate a Calendly booking URL for a provider and optionally
 * mark them as having a meeting scheduled (when webhook confirms).
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
      provider_name,
      contact_name,
      contact_email,
      // If manually marking as scheduled (without Calendly webhook)
      meeting_scheduled_at,
      calendly_event_id,
    } = body;

    if (!tracking_id) {
      return NextResponse.json({ error: "tracking_id is required" }, { status: 400 });
    }

    // Get current tracking
    const current = await getTrackingById(tracking_id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // If manually scheduling (without Calendly)
    if (meeting_scheduled_at) {
      // Validate stage transition
      if (!canTransitionTo(current.pipeline_stage, "meeting_scheduled")) {
        return NextResponse.json(
          { error: `Cannot schedule meeting from stage: ${current.pipeline_stage}` },
          { status: 400 }
        );
      }

      const updated = await updateTracking(
        tracking_id,
        {
          pipeline_stage: "meeting_scheduled",
          meeting_scheduled_at,
          calendly_event_id: calendly_event_id || null,
        },
        adminUser.id
      );

      await createTouchpoint({
        tracking_id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: "meeting_scheduled",
        details: {
          meeting_scheduled_at,
          calendly_event_id,
          method: "manual",
        },
        admin_user_id: adminUser.id,
      });

      return NextResponse.json({ tracking: updated });
    }

    // Generate Calendly booking URL
    const bookingUrl = generateBookingUrl({
      trackingId: tracking_id,
      providerName: provider_name,
      contactName: contact_name,
      contactEmail: contact_email,
    });

    return NextResponse.json({ booking_url: bookingUrl });
  } catch (e) {
    console.error("[provider-growth] POST schedule-meeting error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
