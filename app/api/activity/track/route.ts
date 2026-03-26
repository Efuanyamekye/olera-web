import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PROVIDER_EVENT_TYPES = [
  "email_click",
  "page_view",
  "lead_opened",
  "question_received",
  "question_responded",
  "review_viewed",
] as const;

const FAMILY_EVENT_TYPES = [
  "connection_sent",
  "profile_enriched",
  "email_click",
  "question_asked",
  "matches_activated",
] as const;

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * POST /api/activity/track
 *
 * Log an engagement event. Supports two actor types:
 *
 * actor_type="provider" (default): provider email clicks → provider_activity table
 *   Required: provider_id, event_type
 *
 * actor_type="family": care seeker engagement → seeker_activity table
 *   Required: profile_id, event_type
 *   Optional: related_provider_id, email_log_id, email_type, metadata
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      actor_type = "provider",
      provider_id,
      profile_id,
      event_type,
      email_log_id,
      email_type,
      related_provider_id,
      metadata,
    } = body;

    const db = getServiceDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // --- Family events → seeker_activity ---
    if (actor_type === "family") {
      if (!profile_id || !event_type) {
        return NextResponse.json(
          { error: "profile_id and event_type are required for family events" },
          { status: 400 }
        );
      }

      if (!(FAMILY_EVENT_TYPES as readonly string[]).includes(event_type)) {
        return NextResponse.json(
          { error: `Invalid event_type for family. Must be one of: ${FAMILY_EVENT_TYPES.join(", ")}` },
          { status: 400 }
        );
      }

      const { error } = await db.from("seeker_activity").insert({
        profile_id,
        event_type,
        email_log_id: email_log_id || null,
        email_type: email_type || null,
        related_provider_id: related_provider_id || null,
        metadata: metadata || {},
      });

      if (error) {
        console.error("[activity/track] Family insert failed:", error);
        return NextResponse.json(
          { error: "Failed to log activity" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    // --- Provider events → provider_activity (existing behavior) ---
    if (!provider_id || !event_type) {
      return NextResponse.json(
        { error: "provider_id and event_type are required" },
        { status: 400 }
      );
    }

    if (!(PROVIDER_EVENT_TYPES as readonly string[]).includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${PROVIDER_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const { error } = await db.from("provider_activity").insert({
      provider_id,
      profile_id: profile_id || null,
      event_type,
      email_log_id: email_log_id || null,
      email_type: email_type || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error("[activity/track] Insert failed:", error);
      return NextResponse.json(
        { error: "Failed to log activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[activity/track] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
