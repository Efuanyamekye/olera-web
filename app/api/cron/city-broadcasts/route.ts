/**
 * Cron endpoint: City Broadcasts
 *
 * Every 30 minutes:
 * 1. Detect new events (questions asked, profiles published)
 * 2. Process pending events
 * 3. Send broadcasts to eligible providers in those cities
 *
 * Triggered by Vercel Cron (every 30 min -- see vercel.json) or by an
 * admin curling locally with the CRON_SECRET bearer token.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Fails closed
 * (401) if CRON_SECRET is unset OR doesn't match.
 *
 * Local testing:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/cron/city-broadcasts
 */

import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/crons/run";
import { processPendingEvents } from "@/lib/city-broadcasts/process";

/** Leave headroom below Vercel's 60s default timeout */
const MAX_RUNTIME_MS = 50_000;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("city-broadcasts", async () => {
    const startedAt = Date.now();

    const result = await processPendingEvents(MAX_RUNTIME_MS);

    return {
      status: "ok",
      events_detected: result.eventsDetected,
      events_processed: result.eventsProcessed,
      events_skipped: result.eventsSkipped,
      providers_sent: result.providersSent,
      providers_skipped: result.providersSkipped,
      // Welcome broadcasts (providers in pool who haven't received any broadcast yet)
      new_pool_members_found: result.newPoolMembersFound,
      new_pool_members_sent: result.newPoolMembersSent,
      new_pool_members_skipped: result.newPoolMembersSkipped,
      elapsed_ms: Date.now() - startedAt,
    };
  });
}

export async function POST(req: NextRequest) {
  // POST also accepted so manual triggers work
  return GET(req);
}
