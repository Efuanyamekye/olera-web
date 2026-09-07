import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getAuthUser, getAdminUser } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { runFollowups } from "@/lib/city-ads/followups.server";

/**
 * GET /api/cron/city-lead-followups — hourly at :20.
 *
 * The two questions that make the city pilot measurable: did the provider call
 * the family, and did the family become a client. See lib/city-ads/followups
 * for the rungs. Sends are confined to 9am-7pm in the city's timezone, so an
 * item due overnight simply waits for the morning run.
 *
 * Auth: CRON_SECRET, or a signed-in admin so it can be fired from a browser.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  let triggeredBy = "cron";
  const hasSecret =
    authHeader === `Bearer ${process.env.CRON_SECRET}` || querySecret === process.env.CRON_SECRET;
  if (!hasSecret) {
    const user = await getAuthUser();
    const admin = user ? await getAdminUser(user.id) : null;
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    triggeredBy = `admin:${user?.email ?? user?.id}`;
  }

  return withCronRun(
    "city-lead-followups",
    async () => {
      const db = getServiceClient();
      const r = await runFollowups(db);
      return { ok: true, ...r };
    },
    { triggeredBy },
  );
}
