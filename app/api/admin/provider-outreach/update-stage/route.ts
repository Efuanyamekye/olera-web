import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { OUTREACH_STAGES, type OutreachStage } from "../route";

/**
 * POST /api/admin/provider-outreach/update-stage
 *
 * Move provider(s) to a different stage.
 *
 * Body:
 *   - provider_ids: string[] (required) - List of provider IDs to update
 *   - stage: OutreachStage (required) - Target stage
 *   - notes?: string - Optional notes to set/append
 *
 * Creates tracking rows if they don't exist, updates if they do.
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
    const { provider_ids, stage, notes } = body;

    if (!provider_ids || !Array.isArray(provider_ids) || provider_ids.length === 0) {
      return NextResponse.json({ error: "provider_ids array is required" }, { status: 400 });
    }

    if (!stage || !OUTREACH_STAGES.includes(stage)) {
      return NextResponse.json({ error: "Valid stage is required" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get provider details for city/state denormalization
    const { data: providers, error: provError } = await db
      .from("olera-providers")
      .select("provider_id, city, state")
      .in("provider_id", provider_ids);

    if (provError) {
      console.error("[provider-outreach/update-stage] Provider query error:", provError);
      return NextResponse.json({ error: "Failed to fetch provider details" }, { status: 500 });
    }

    if (!providers || providers.length === 0) {
      return NextResponse.json({ error: "No valid providers found" }, { status: 404 });
    }

    const providerMap = new Map(providers.map((p) => [p.provider_id, p]));

    // Check which providers already have tracking rows
    const { data: existingTracking } = await db
      .from("provider_outreach_tracking")
      .select("provider_id, id, stage")
      .in("provider_id", provider_ids);

    const existingMap = new Map((existingTracking || []).map((t) => [t.provider_id, t]));

    // Separate into updates and inserts
    const toUpdate: { id: string; provider_id: string; oldStage: string }[] = [];
    const toInsert: { provider_id: string; stage: OutreachStage; city: string | null; state: string | null; notes: string | null }[] = [];

    for (const providerId of provider_ids) {
      const providerDetails = providerMap.get(providerId);
      if (!providerDetails) continue;

      const existing = existingMap.get(providerId);
      if (existing) {
        toUpdate.push({ id: existing.id, provider_id: providerId, oldStage: existing.stage });
      } else {
        toInsert.push({
          provider_id: providerId,
          stage: stage as OutreachStage,
          city: providerDetails.city,
          state: providerDetails.state,
          notes: notes || null,
        });
      }
    }

    // Perform updates
    if (toUpdate.length > 0) {
      const updateIds = toUpdate.map((t) => t.id);
      const updateData: { stage: OutreachStage; notes?: string | null } = { stage: stage as OutreachStage };
      if (notes !== undefined) {
        updateData.notes = notes;
      }

      const { error: updateError } = await db
        .from("provider_outreach_tracking")
        .update(updateData)
        .in("id", updateIds);

      if (updateError) {
        console.error("[provider-outreach/update-stage] Update error:", updateError);
        return NextResponse.json({ error: "Failed to update tracking records" }, { status: 500 });
      }
    }

    // Perform inserts
    if (toInsert.length > 0) {
      const { error: insertError } = await db
        .from("provider_outreach_tracking")
        .insert(toInsert);

      if (insertError) {
        console.error("[provider-outreach/update-stage] Insert error:", insertError);
        return NextResponse.json({ error: "Failed to create tracking records" }, { status: 500 });
      }
    }

    // Log audit action
    await logAuditAction({
      adminUserId: adminUser.id,
      action: "update_provider_outreach_stage",
      targetType: "provider_outreach",
      targetId: provider_ids.join(","),
      details: {
        provider_ids,
        new_stage: stage,
        notes: notes || null,
        updated_count: toUpdate.length,
        inserted_count: toInsert.length,
      },
    });

    return NextResponse.json({
      success: true,
      updated: toUpdate.length,
      created: toInsert.length,
    });
  } catch (err) {
    console.error("[provider-outreach/update-stage] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
