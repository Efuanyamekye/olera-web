import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { getTrackingById } from "@/lib/provider-growth/queries";

/**
 * POST /api/admin/provider-growth/update-assignment
 *
 * Update the assigned_to field for a provider growth tracking record.
 * Also logs an "assigned" touchpoint to track the assignment history.
 *
 * Body: {
 *   tracking_id: string,
 *   assigned_to: string | null  // admin user ID, or null to unassign
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
    const { tracking_id, assigned_to } = body;

    if (!tracking_id) {
      return NextResponse.json(
        { error: "tracking_id is required" },
        { status: 400 }
      );
    }

    // Validate assigned_to is either null or a string
    if (assigned_to !== null && typeof assigned_to !== "string") {
      return NextResponse.json(
        { error: "assigned_to must be a string (admin user ID) or null" },
        { status: 400 }
      );
    }

    // Get current tracking record
    const current = await getTrackingById(tracking_id);
    if (!current) {
      return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
    }

    const db = getServiceClient();
    const now = new Date().toISOString();

    // Get the assigned admin's name for the touchpoint
    let assignedAdminName: string | null = null;
    if (assigned_to) {
      const { data: assignedAdmin } = await db
        .from("admin_users")
        .select("display_name, email")
        .eq("id", assigned_to)
        .single();

      if (assignedAdmin) {
        assignedAdminName = assignedAdmin.display_name || assignedAdmin.email.split("@")[0];
      }
    }

    // Update the tracking record
    const { error: updateError } = await db
      .from("provider_growth_tracking")
      .update({
        assigned_to,
        updated_at: now,
        last_activity_at: now,
      })
      .eq("id", tracking_id);

    if (updateError) {
      console.error("[update-assignment] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
    }

    // Log the assignment touchpoint
    const { error: touchpointError } = await db
      .from("provider_growth_touchpoints")
      .insert({
        tracking_id,
        business_profile_id: current.business_profile_id,
        touchpoint_type: "assigned",
        admin_user_id: adminUser.id,
        details: {
          assigned_to,
          assigned_to_name: assignedAdminName,
          previous_assigned_to: current.assigned_to,
        },
      });

    if (touchpointError) {
      console.error("[update-assignment] Touchpoint error:", touchpointError);
      // Don't fail the request - the assignment was successful
    }

    return NextResponse.json({
      success: true,
      assigned_to,
      assigned_to_name: assignedAdminName,
    });
  } catch (err) {
    console.error("[update-assignment] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
