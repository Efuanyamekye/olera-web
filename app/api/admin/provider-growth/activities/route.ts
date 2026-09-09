import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import type { ActivityOutcome } from "@/lib/provider-growth/stages";

/**
 * Activity entry returned by the API
 */
export interface ActivityEntry {
  id: string;
  tracking_id: string;
  touchpoint_type: string;
  outcome: ActivityOutcome | null;
  notes: string | null;
  admin_id: string | null;
  admin_name: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

/**
 * GET /api/admin/provider-growth/activities?tracking_id=xxx
 *
 * Fetch activity history for a provider growth tracking record.
 * Returns all touchpoints (unified view), ordered by created_at DESC.
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

    // Query all touchpoints for this tracking record
    const { data: touchpoints, error } = await db
      .from("provider_growth_touchpoints")
      .select("id, tracking_id, touchpoint_type, details, admin_user_id, created_at")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[activities] Query error:", error);
      return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
    }

    // Get admin names for the touchpoints
    const adminIds = [...new Set((touchpoints || []).map(tp => tp.admin_user_id).filter(Boolean))];
    const adminNames = new Map<string, string>();

    if (adminIds.length > 0) {
      const { data: admins } = await db
        .from("admin_users")
        .select("id, display_name")
        .in("id", adminIds);

      for (const admin of admins || []) {
        if (admin.display_name) {
          adminNames.set(admin.id, admin.display_name);
        }
      }
    }

    // Transform to ActivityEntry format
    const activities: ActivityEntry[] = (touchpoints || []).map((tp) => {
      const details = tp.details as Record<string, unknown> | null;

      // Extract outcome - could be in details.outcome (new format) or details.status (call_attempted format)
      let outcome: ActivityOutcome | null = null;
      let notes: string | null = null;

      if (details) {
        outcome = (details.outcome as ActivityOutcome) || null;
        notes = (details.notes as string) || null;

        // Handle legacy call_attempted format
        if (tp.touchpoint_type === "call_attempted" && details.status) {
          // Map old call statuses to new outcomes
          const statusMap: Record<string, ActivityOutcome> = {
            voicemail: "voicemail",
            no_answer: "voicemail", // fallback
            hung_up: "hung_up",
            callback: "callback_requested",
            spoke_with: "note",
            scheduled: "meeting_scheduled",
            note: "note",
          };
          outcome = statusMap[details.status as string] || "note";
        }
      }

      return {
        id: tp.id,
        tracking_id: tp.tracking_id,
        touchpoint_type: tp.touchpoint_type,
        outcome,
        notes,
        admin_id: tp.admin_user_id,
        admin_name: adminNames.get(tp.admin_user_id) || null,
        created_at: tp.created_at,
        details,
      };
    });

    return NextResponse.json({ activities, current_admin_id: adminUser.id });
  } catch (err) {
    console.error("[activities] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
