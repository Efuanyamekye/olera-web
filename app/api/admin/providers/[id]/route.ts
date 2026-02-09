import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

/**
 * PATCH /api/admin/providers/[id]
 *
 * Approve or reject a provider claim.
 * Body: { action: "approve" | "reject" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    const newState = action === "approve" ? "claimed" : "rejected";
    const db = getServiceClient();

    const { data: profile, error: updateError } = await db
      .from("business_profiles")
      .update({ claim_state: newState, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, display_name, claim_state")
      .single();

    if (updateError) {
      console.error("Failed to update provider:", updateError);
      return NextResponse.json({ error: "Failed to update provider" }, { status: 500 });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: action === "approve" ? "approve_provider" : "reject_provider",
      targetType: "business_profile",
      targetId: id,
      details: {
        provider_name: profile?.display_name,
        new_state: newState,
      },
    });

    return NextResponse.json({ profile });
  } catch (err) {
    console.error("Admin provider action error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
