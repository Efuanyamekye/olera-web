/**
 * GET /api/admin/provider-outreach/email-health
 *
 * Returns email health metrics for a provider to determine broadcast eligibility.
 *
 * Query params:
 *   - provider_id: The provider ID to check
 *
 * Returns:
 *   - email: The email address being checked
 *   - delivered: Number of successfully delivered emails
 *   - bounced: Number of bounced emails
 *   - complained: Number of spam complaints
 *   - lastDeliveredAt: Timestamp of last successful delivery
 *   - lastCalledAt: Timestamp of last call (from touchpoints)
 *   - eligible: Boolean - true if eligible to move to broadcast_ready
 *   - reason: If not eligible, explains why
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminUser = await getAdminUser(user.id);
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("provider_id");

  if (!providerId) {
    return NextResponse.json({ error: "provider_id required" }, { status: 400 });
  }

  const db = getServiceClient();

  try {
    // Get provider's email from tracking table (apollo_contact or olera-providers)
    const { data: tracking, error: trackingError } = await db
      .from("provider_outreach_tracking")
      .select("provider_id, apollo_contact, stage")
      .eq("provider_id", providerId)
      .single();

    if (trackingError || !tracking) {
      return NextResponse.json({ error: "Provider not found in outreach tracking" }, { status: 404 });
    }

    // Get email from olera-providers (directory email) - this is the ONLY source of truth
    // Apollo email is never used as fallback - admin must explicitly approve and copy it to directory first
    const { data: provider } = await db
      .from("olera-providers")
      .select("email")
      .eq("provider_id", providerId)
      .single();

    const email: string | null = provider?.email || null;

    if (!email) {
      return NextResponse.json({
        email: null,
        delivered: 0,
        bounced: 0,
        complained: 0,
        lastDeliveredAt: null,
        lastCalledAt: null,
        eligible: false,
        reason: "No email on file",
      });
    }

    // Get email metrics from email_log
    const { data: emailLogs, error: logError } = await db
      .from("email_log")
      .select("status, delivered_at, bounced_at, complained_at, created_at")
      .eq("recipient", email)
      .order("created_at", { ascending: false });

    if (logError) {
      console.error("[email-health] Failed to fetch email logs:", logError);
      return NextResponse.json({ error: "Failed to fetch email logs" }, { status: 500 });
    }

    const logs = emailLogs || [];
    // Count delivered: emails that were sent/delivered AND did not bounce
    const delivered = logs.filter((l) => (l.delivered_at || l.status === "sent") && !l.bounced_at).length;
    const bounced = logs.filter((l) => l.bounced_at).length;
    const complained = logs.filter((l) => l.complained_at).length;

    // Find last delivered timestamp (excluding bounced emails)
    const deliveredLogs = logs.filter((l) => (l.delivered_at || l.status === "sent") && !l.bounced_at);
    const lastDeliveredAt = deliveredLogs.length > 0
      ? deliveredLogs[0].delivered_at || deliveredLogs[0].created_at
      : null;

    // Get last call timestamp from touchpoints
    // Note: touchpoint_type is "call_attempted" not "call"
    const { data: touchpoints } = await db
      .from("provider_outreach_touchpoints")
      .select("created_at")
      .eq("provider_id", providerId)
      .eq("touchpoint_type", "call_attempted")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastCalledAt = touchpoints && touchpoints.length > 0
      ? touchpoints[0].created_at
      : null;

    // Determine eligibility
    let eligible = true;
    let reason: string | null = null;

    if (delivered === 0) {
      eligible = false;
      reason = "No emails delivered yet";
    } else if (bounced > 0) {
      eligible = false;
      reason = `Has ${bounced} bounce${bounced > 1 ? "s" : ""}`;
    } else if (complained > 0) {
      eligible = false;
      reason = `Has ${complained} complaint${complained > 1 ? "s" : ""}`;
    } else if (!lastCalledAt) {
      eligible = false;
      reason = "Not called yet";
    }

    return NextResponse.json({
      email,
      delivered,
      bounced,
      complained,
      lastDeliveredAt,
      lastCalledAt,
      eligible,
      reason,
    });
  } catch (err) {
    console.error("[email-health] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
