import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser } from "@/lib/admin";
import {
  getTrackingById,
  updateTracking,
  createTouchpoint,
} from "@/lib/provider-growth/queries";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";
import { canTransitionTo, MEETING_TYPES, MEETING_FOCUS_OPTIONS, MEETING_FORMAT_OPTIONS, type MeetingType, type MeetingFocus, type MeetingFormat } from "@/lib/provider-growth/stages";

/**
 * POST /api/admin/provider-growth/schedule-meeting
 *
 * Generate a Calendly booking URL for a provider and optionally
 * mark them as having a meeting scheduled (when webhook confirms).
 *
 * When manually scheduling (with meeting_scheduled_at):
 * - Converted providers (free_intro or in_pilot) → upgrade_meeting stage
 * - Non-converted providers → meeting_scheduled stage
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
      // Meeting tags
      meeting_type,
      meeting_focus,
      meeting_format,
      meeting_phone,
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
      // Validate meeting_type and meeting_focus
      const validMeetingType: MeetingType | undefined = meeting_type && MEETING_TYPES.includes(meeting_type)
        ? meeting_type
        : undefined;
      const validMeetingFocus: MeetingFocus | undefined = meeting_focus && MEETING_FOCUS_OPTIONS.includes(meeting_focus)
        ? meeting_focus
        : undefined;
      // Default to video if not specified
      const validMeetingFormat: MeetingFormat = meeting_format && MEETING_FORMAT_OPTIONS.includes(meeting_format)
        ? meeting_format
        : "video";

      if (!validMeetingType || !validMeetingFocus) {
        return NextResponse.json(
          { error: "meeting_type and meeting_focus are required" },
          { status: 400 }
        );
      }

      // All meetings now go to meeting_scheduled stage (unified)
      const targetStage = "meeting_scheduled";

      // Validate stage transition
      if (!canTransitionTo(current.pipeline_stage, targetStage)) {
        return NextResponse.json(
          { error: `Cannot schedule meeting from stage: ${current.pipeline_stage}` },
          { status: 400 }
        );
      }

      // Clear reminder flags when (re)scheduling - ensures fresh reminders for new time
      const updated = await updateTracking(
        tracking_id,
        {
          pipeline_stage: targetStage,
          meeting_scheduled_at,
          calendly_event_id: calendly_event_id || null,
          meeting_type: validMeetingType,
          meeting_focus: validMeetingFocus,
          meeting_format: validMeetingFormat,
          meeting_phone: validMeetingFormat === "phone" ? (meeting_phone || null) : null,
          reminder_2d_sent_at: null,
          reminder_1d_sent_at: null,
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
          meeting_type: validMeetingType,
          meeting_focus: validMeetingFocus,
          meeting_format: validMeetingFormat,
          meeting_phone: validMeetingFormat === "phone" ? meeting_phone : undefined,
        },
        admin_user_id: adminUser.id,
      });

      return NextResponse.json({ tracking: updated });
    }

    // Generate Calendly booking URL
    // Use contact_name if available, otherwise fall back to provider_name
    const bookingUrl = generateBookingUrl({
      trackingId: tracking_id,
      contactName: contact_name || provider_name,
      contactEmail: contact_email,
    });

    return NextResponse.json({ booking_url: bookingUrl });
  } catch (e) {
    console.error("[provider-growth] POST schedule-meeting error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
