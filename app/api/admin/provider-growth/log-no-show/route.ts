import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  getTrackingById,
  createTouchpoint,
} from "@/lib/provider-growth/queries";
import { generateBookingUrl } from "@/lib/provider-growth/calendly";
import {
  generateNoShowSubject,
  generateNoShowEmailHtml,
} from "@/lib/provider-growth/no-show-email";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/provider-growth/log-no-show
 *
 * Log a meeting no-show. Moves the provider to the no_show pipeline stage,
 * updates the tracking record with no-show count, creates a touchpoint,
 * and sends a reschedule email to the provider.
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
    const { tracking_id } = body;

    if (!tracking_id) {
      return NextResponse.json({ error: "tracking_id is required" }, { status: 400 });
    }

    // Get current tracking with provider info
    const current = await getTrackingById(tracking_id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    // Validate stage - can only log no-show from stages with scheduled meetings
    const STAGES_WITH_MEETINGS = ["meeting_scheduled", "upgrade_meeting"];
    if (!STAGES_WITH_MEETINGS.includes(current.pipeline_stage)) {
      return NextResponse.json(
        { error: `Cannot log no-show from stage: ${current.pipeline_stage}. Must be in meeting_scheduled or upgrade_meeting.` },
        { status: 400 }
      );
    }

    const db = getServiceClient();
    const now = new Date().toISOString();
    const previousStage = current.pipeline_stage;

    // Update the tracking record: move to no_show stage and increment count
    const { data: updated, error: updateError } = await db
      .from("provider_growth_tracking")
      .update({
        pipeline_stage: "no_show",
        pipeline_stage_changed_at: now,
        no_show_count: (current.no_show_count ?? 0) + 1,
        last_no_show_at: now,
        // Clear the missed meeting (they'll get a new one when they reschedule)
        meeting_scheduled_at: null,
        calendly_event_id: null,
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", tracking_id)
      .select()
      .single();

    if (updateError) {
      console.error("[provider-growth] Update no-show error:", updateError);
      return NextResponse.json({ error: "Failed to update tracking record" }, { status: 500 });
    }

    // Create touchpoint
    await createTouchpoint({
      tracking_id,
      business_profile_id: current.business_profile_id,
      touchpoint_type: "meeting_no_show",
      details: {
        no_show_count: (current.no_show_count ?? 0) + 1,
        original_meeting_at: current.meeting_scheduled_at,
        previous_stage: previousStage,
        new_stage: "no_show",
      },
      admin_user_id: adminUser.id,
    });

    // Get provider info for email
    const { data: profile } = await db
      .from("business_profiles")
      .select("display_name, email")
      .eq("id", current.business_profile_id)
      .single();

    // Send reschedule email if provider has email
    let emailSent = false;
    if (profile?.email) {
      const calendlyLink = generateBookingUrl({
        trackingId: tracking_id,
        contactName: profile.display_name || undefined,
        contactEmail: profile.email,
      });

      const originalMeetingDate = current.meeting_scheduled_at
        ? new Date(current.meeting_scheduled_at)
        : new Date();

      const emailResult = await sendEmail({
        to: profile.email,
        subject: generateNoShowSubject(),
        html: generateNoShowEmailHtml({
          providerName: profile.display_name || "there",
          originalMeetingDate,
          calendlyLink,
        }),
        emailType: "provider_growth_no_show",
        recipientType: "provider",
        providerId: current.business_profile_id,
        metadata: {
          tracking_id,
          no_show_count: (current.no_show_count ?? 0) + 1,
        },
      });

      emailSent = emailResult.success && !emailResult.skipped;
    }

    return NextResponse.json({
      tracking: updated,
      emailSent,
    });
  } catch (e) {
    console.error("[provider-growth] POST log-no-show error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
