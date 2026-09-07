import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isBotRequest, incrementBotReject } from "@/lib/analytics/bot-filter";
import { classifyReferrer, sanitizeReferrer } from "@/lib/analytics/referrer";
import { classifyUserAgent } from "@/lib/analytics/user-agent";
import { readVisitorGeo } from "@/lib/analytics/visitor-geo";

const VALID_EVENT_TYPES = [
  "page_view",
  "scroll_depth",
  "section_visible",
  "time_on_page",
  "discord_join_clicked",
] as const;

function getServiceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * POST /api/activity/track-page-event
 *
 * Log a page-level event (not tied to a specific provider).
 * Required: page, event_type
 * Optional: session_id, metadata
 */
export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get("user-agent");
    if (isBotRequest(userAgent)) {
      incrementBotReject();
      return new NextResponse(null, { status: 204 });
    }

    const body = await request.json();
    const { page, event_type, session_id, metadata } = body;

    if (!page || !event_type) {
      return NextResponse.json(
        { error: "page and event_type are required" },
        { status: 400 }
      );
    }

    if (!(VALID_EVENT_TYPES as readonly string[]).includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getServiceDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Same enrichment the anonymous branch of /api/activity/track applies, so
    // content page views and provider page views can be sliced by device and
    // traffic source with one shared vocabulary. No raw User-Agent is stored.
    const enrichedMetadata = {
      ...(metadata || {}),
      ua_class: classifyUserAgent(userAgent),
      referrer: sanitizeReferrer(metadata?.referrer),
      referrer_class: classifyReferrer(metadata?.referrer),
      // Visitor city/state from Vercel's edge headers. No IP is stored — the
      // same granularity /api/geo already hands the browser. Lets reporting
      // answer "how many people in this city came to us".
      ...readVisitorGeo(request.headers),
    };

    const { error } = await db.from("page_events").insert({
      page,
      event_type,
      session_id: session_id || null,
      metadata: enrichedMetadata,
    });

    if (error) {
      console.error("[track-page-event] Insert failed:", error);
      return NextResponse.json(
        { error: "Failed to log event" },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
