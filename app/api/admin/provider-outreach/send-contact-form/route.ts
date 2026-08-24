import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * POST /api/admin/provider-outreach/send-contact-form
 *
 * Record a contact form submission as a supplementary outreach channel.
 * This does NOT change the provider's stage - they stay in their current tab.
 *
 * Use this endpoint when sending contact forms from:
 * - Call & Confirm (not_contacted)
 * - In Sequence (in_sequence)
 * - Alternative Channels (re_engage)
 * - Call (call_exhausted)
 *
 * For Follow Up (needs_call) tab, use record-outcome with try_contact_form
 * if you want to move the provider to Alternative Channels.
 *
 * Request body:
 *   - provider_id: string (required)
 *   - contact_form_url: string (required) - URL of the contact form used
 *   - notes?: string - optional notes about the submission
 *
 * Effects:
 *   - Sets contact_form_sent_at = COALESCE(existing, now)
 *   - Increments contact_form_send_count
 *   - Saves contact_form_url
 *   - Creates 'contact_form_sent' touchpoint
 *   - Provider stays in current stage
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
    const { provider_id, contact_form_url, notes } = body;

    if (!provider_id || typeof provider_id !== "string") {
      return NextResponse.json({ error: "provider_id is required" }, { status: 400 });
    }

    if (!contact_form_url || typeof contact_form_url !== "string") {
      return NextResponse.json({ error: "contact_form_url is required" }, { status: 400 });
    }

    const db = getServiceClient();
    const nowIso = new Date().toISOString();

    // Get current tracking record
    const { data: tracking, error: trackingError } = await db
      .from("provider_outreach_tracking")
      .select("id, provider_id, stage, contact_form_sent_at, contact_form_send_count")
      .eq("provider_id", provider_id)
      .single();

    if (trackingError || !tracking) {
      return NextResponse.json({ error: "Provider not found in tracking" }, { status: 404 });
    }

    // Calculate new count
    const currentCount = tracking.contact_form_send_count ?? 0;
    const newCount = currentCount + 1;

    // Update tracking record - no stage change
    const updateData: Record<string, unknown> = {
      contact_form_url,
      contact_form_status: "submitted",
      contact_form_send_count: newCount,
      // Only set contact_form_sent_at on first send
      contact_form_sent_at: tracking.contact_form_sent_at ?? nowIso,
      updated_at: nowIso,
    };

    // Optionally append notes
    if (notes?.trim()) {
      updateData.notes = notes.trim();
    }

    const { error: updateError } = await db
      .from("provider_outreach_tracking")
      .update(updateData)
      .eq("id", tracking.id);

    if (updateError) {
      console.error("[send-contact-form] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update tracking record" }, { status: 500 });
    }

    // Log touchpoint
    const { error: touchpointError } = await db
      .from("provider_outreach_touchpoints")
      .insert({
        provider_id,
        touchpoint_type: "contact_form_sent",
        details: {
          contact_form_url,
          send_count: newCount,
          stage_at_send: tracking.stage,
          ...(notes?.trim() && { notes: notes.trim() }),
        },
        admin_user_id: adminUser.id,
        created_at: nowIso,
      });

    if (touchpointError) {
      // Non-fatal: log but don't fail the request
      console.error("[send-contact-form] Touchpoint insert error:", touchpointError);
    }

    return NextResponse.json({
      success: true,
      send_count: newCount,
      contact_form_url,
      stage: tracking.stage, // Confirm no stage change
    });
  } catch (err) {
    console.error("[send-contact-form] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
