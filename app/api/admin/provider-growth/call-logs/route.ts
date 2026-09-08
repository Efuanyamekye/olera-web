import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { CALL_STATUSES, type CallStatus } from "@/lib/provider-growth/stages";

/**
 * Call log entry returned by the API
 */
export interface CallLogEntry {
  id: string;
  tracking_id: string;
  status: CallStatus;
  notes: string | null;
  admin_id: string;
  admin_name: string | null;
  created_at: string;
}

/**
 * GET /api/admin/provider-growth/call-logs?tracking_id=xxx
 *
 * Fetch call history for a provider growth tracking record.
 * Returns logs ordered by created_at DESC (most recent first).
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
    const trackingId = searchParams.get("tracking_id");

    if (!trackingId) {
      return NextResponse.json({ error: "tracking_id is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Query touchpoints with type = 'call_attempted', join admin_users for names
    const { data: touchpoints, error } = await db
      .from("provider_growth_touchpoints")
      .select(`
        id,
        tracking_id,
        details,
        admin_user_id,
        created_at,
        admin_users (
          display_name
        )
      `)
      .eq("tracking_id", trackingId)
      .eq("touchpoint_type", "call_attempted")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[growth-call-logs] Query error:", error);
      return NextResponse.json({ error: "Failed to fetch call logs" }, { status: 500 });
    }

    // Transform to CallLogEntry format
    const logs: CallLogEntry[] = (touchpoints || []).map((tp) => {
      const details = tp.details as { status?: string; notes?: string } | null;
      const adminData = tp.admin_users as { display_name?: string } | null;
      return {
        id: tp.id,
        tracking_id: tp.tracking_id,
        status: (details?.status as CallStatus) || "no_answer",
        notes: details?.notes || null,
        admin_id: tp.admin_user_id,
        admin_name: adminData?.display_name || null,
        created_at: tp.created_at,
      };
    });

    return NextResponse.json({ logs, current_admin_id: adminUser.id });
  } catch (err) {
    console.error("[growth-call-logs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/provider-growth/call-logs
 *
 * Log a new call attempt.
 * Body: { tracking_id, business_profile_id, status, notes? }
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
    const { tracking_id, business_profile_id, status, notes } = body;

    if (!tracking_id || !business_profile_id) {
      return NextResponse.json(
        { error: "tracking_id and business_profile_id are required" },
        { status: 400 }
      );
    }

    if (!status || !CALL_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${CALL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Insert into provider_growth_touchpoints
    const { data: inserted, error } = await db
      .from("provider_growth_touchpoints")
      .insert({
        tracking_id,
        business_profile_id,
        touchpoint_type: "call_attempted",
        admin_user_id: adminUser.id,
        details: {
          status,
          notes: notes?.trim() || null,
        },
      })
      .select()
      .single();

    if (error) {
      console.error("[growth-call-logs] Insert error:", error);
      return NextResponse.json({ error: "Failed to log call" }, { status: 500 });
    }

    // Update last_activity_at on the tracking record
    await db
      .from("provider_growth_tracking")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", tracking_id);

    const log: CallLogEntry = {
      id: inserted.id,
      tracking_id: inserted.tracking_id,
      status,
      notes: notes?.trim() || null,
      admin_id: adminUser.id,
      admin_name: adminUser.display_name || null,
      created_at: inserted.created_at,
    };

    return NextResponse.json({ success: true, log });
  } catch (err) {
    console.error("[growth-call-logs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/provider-growth/call-logs
 *
 * Update an existing call log. Only the admin who created it can edit.
 * Body: { touchpoint_id, status?, notes? }
 */
export async function PATCH(request: NextRequest) {
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
    const { touchpoint_id, status, notes } = body;

    if (!touchpoint_id) {
      return NextResponse.json({ error: "touchpoint_id is required" }, { status: 400 });
    }

    if (status !== undefined && !CALL_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${CALL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getServiceClient();

    // Fetch the existing touchpoint to verify ownership
    const { data: existing, error: fetchError } = await db
      .from("provider_growth_touchpoints")
      .select("id, tracking_id, admin_user_id, details, created_at")
      .eq("id", touchpoint_id)
      .eq("touchpoint_type", "call_attempted")
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    // Only the admin who created the log can edit it
    if (existing.admin_user_id !== adminUser.id) {
      return NextResponse.json(
        { error: "You can only edit your own call logs" },
        { status: 403 }
      );
    }

    // Build updated details
    const currentDetails = (existing.details as { status?: string; notes?: string }) || {};
    const updatedDetails = {
      ...currentDetails,
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
    };

    // Update the touchpoint
    const { error: updateError } = await db
      .from("provider_growth_touchpoints")
      .update({ details: updatedDetails })
      .eq("id", touchpoint_id);

    if (updateError) {
      console.error("[growth-call-logs] Update error:", updateError);
      return NextResponse.json(
        { error: `Failed to update call log: ${updateError.message}` },
        { status: 500 }
      );
    }

    const log: CallLogEntry = {
      id: existing.id,
      tracking_id: existing.tracking_id,
      status: (updatedDetails.status as CallStatus) || "no_answer",
      notes: updatedDetails.notes || null,
      admin_id: adminUser.id,
      admin_name: adminUser.display_name || null,
      created_at: existing.created_at,
    };

    return NextResponse.json({ success: true, log });
  } catch (err) {
    console.error("[growth-call-logs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/provider-growth/call-logs
 *
 * Delete a call log. Only the admin who created it can delete.
 * Body: { touchpoint_id }
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

    const body = await request.json();
    const { touchpoint_id } = body;

    if (!touchpoint_id) {
      return NextResponse.json({ error: "touchpoint_id is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Fetch the existing touchpoint to verify ownership
    const { data: existing, error: fetchError } = await db
      .from("provider_growth_touchpoints")
      .select("id, admin_user_id, touchpoint_type")
      .eq("id", touchpoint_id)
      .eq("touchpoint_type", "call_attempted")
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    // Only the admin who created the log can delete it
    if (existing.admin_user_id !== adminUser.id) {
      return NextResponse.json(
        { error: "You can only delete your own call logs" },
        { status: 403 }
      );
    }

    // Delete the touchpoint
    const { error: deleteError } = await db
      .from("provider_growth_touchpoints")
      .delete()
      .eq("id", touchpoint_id);

    if (deleteError) {
      console.error("[growth-call-logs] Delete error:", deleteError);
      return NextResponse.json(
        { error: `Failed to delete call log: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted_id: touchpoint_id });
  } catch (err) {
    console.error("[growth-call-logs] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
