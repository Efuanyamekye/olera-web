import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

/**
 * PATCH /api/admin/provider-outreach/update-email
 *
 * Update a provider's email address in olera-providers table.
 *
 * Body:
 *   - provider_id: string (required)
 *   - email: string (required) - new email to set
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
    const { provider_id, email } = body;

    if (!provider_id) {
      return NextResponse.json({ error: "provider_id is required" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get current provider data for audit log
    const { data: existing } = await db
      .from("olera-providers")
      .select("email, provider_name")
      .eq("provider_id", provider_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Update the email
    const { error: updateError } = await db
      .from("olera-providers")
      .update({ email: email.trim() })
      .eq("provider_id", provider_id);

    if (updateError) {
      console.error("[provider-outreach/update-email] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: "update_provider_email",
      targetType: "provider",
      targetId: provider_id,
      details: {
        provider_name: existing.provider_name,
        old_email: existing.email,
        new_email: email.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      email: email.trim(),
    });
  } catch (err) {
    console.error("[provider-outreach/update-email] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
