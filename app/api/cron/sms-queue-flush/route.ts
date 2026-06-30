import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/crons/run";
import { flushDueSmsQueue } from "@/lib/sms/reactive-alerts";

/**
 * GET /api/cron/sms-queue-flush
 *
 * Drains sms_queue — care-seeker reply-alert texts that were held because they
 * landed outside the recipient's 8am–8pm quiet-hours window. Runs frequently so
 * a deferred text goes out close to the window open. Opt-out and the daily
 * safety throttle are re-checked at delivery (see flushDueSmsQueue).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun("sms-queue-flush", async () => {
    const result = await flushDueSmsQueue();
    return result;
  });
}
