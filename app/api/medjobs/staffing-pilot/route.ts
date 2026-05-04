/**
 * Staffing Pilot Activation Route
 *
 * GET  /api/medjobs/staffing-pilot?token=...
 *   - Verify magic link token
 *   - Mark outreach as "activated" (first click)
 *   - Redirect to T&C acceptance page
 *
 * POST /api/medjobs/staffing-pilot
 *   - Accept T&C
 *   - Mark outreach as "enrolled"
 *   - Return success
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { verifyStaffingPilotToken } from "@/lib/staffing-outreach/tokens";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${BASE_URL}/medjobs/staffing-pilot?error=missing_token`);
  }

  const payload = verifyStaffingPilotToken(token);
  if (!payload) {
    return NextResponse.redirect(`${BASE_URL}/medjobs/staffing-pilot?error=invalid_token`);
  }

  const db = getServiceClient();

  // Look up the outreach record
  const { data: outreach, error: outreachErr } = await db
    .from("staffing_outreach")
    .select("id, status, provider_id")
    .eq("id", payload.oid)
    .single();

  if (outreachErr || !outreach) {
    return NextResponse.redirect(`${BASE_URL}/medjobs/staffing-pilot?error=not_found`);
  }

  // If not already activated or enrolled, mark as activated
  const TERMINAL_STATUSES = new Set(["activated", "enrolled"]);
  if (!TERMINAL_STATUSES.has(outreach.status)) {
    // Log the activation touchpoint
    await db.from("staffing_touchpoints").insert({
      outreach_id: payload.oid,
      type: "system_activated",
      notes: "Provider clicked magic link",
      payload: {
        previous_status: outreach.status,
        contact_id: payload.cid,
      },
      created_by: null,
    });

    // Update status to activated
    await db
      .from("staffing_outreach")
      .update({
        status: "activated",
        last_engagement_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.oid);
  }

  // Redirect to the T&C acceptance page
  return NextResponse.redirect(`${BASE_URL}/medjobs/staffing-pilot?token=${encodeURIComponent(token)}`);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = body.token as string;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const payload = verifyStaffingPilotToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const db = getServiceClient();

  // Look up the outreach record
  const { data: outreach, error: outreachErr } = await db
    .from("staffing_outreach")
    .select("id, status, provider_id, batch_id")
    .eq("id", payload.oid)
    .single();

  if (outreachErr || !outreach) {
    return NextResponse.json({ error: "Outreach record not found" }, { status: 404 });
  }

  // If already enrolled, just return success
  if (outreach.status === "enrolled") {
    return NextResponse.json({ success: true, alreadyEnrolled: true });
  }

  // Log the enrollment touchpoint
  await db.from("staffing_touchpoints").insert({
    outreach_id: payload.oid,
    type: "system_enrolled",
    notes: "Provider accepted Terms & Conditions",
    payload: {
      previous_status: outreach.status,
      contact_id: payload.cid,
      accepted_at: new Date().toISOString(),
    },
    created_by: null,
  });

  // Update status to enrolled
  await db
    .from("staffing_outreach")
    .update({
      status: "enrolled",
      last_engagement_at: new Date().toISOString(),
      next_action_due_at: null, // No more follow-ups needed
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.oid);

  // Increment the batch enrolled count
  const { data: currentBatch } = await db
    .from("staffing_batches")
    .select("total_enrolled")
    .eq("id", outreach.batch_id)
    .single();

  if (currentBatch) {
    await db
      .from("staffing_batches")
      .update({ total_enrolled: (currentBatch.total_enrolled ?? 0) + 1 })
      .eq("id", outreach.batch_id);
  }

  // Get provider and batch info for the success response
  const [{ data: provider }, { data: batch }] = await Promise.all([
    db
      .from("olera-providers")
      .select("provider_name")
      .eq("provider_id", outreach.provider_id)
      .single(),
    db
      .from("staffing_batches")
      .select("university_name")
      .eq("id", outreach.batch_id)
      .single(),
  ]);

  return NextResponse.json({
    success: true,
    providerName: provider?.provider_name ?? "Your agency",
    universityName: batch?.university_name ?? "the university",
  });
}
