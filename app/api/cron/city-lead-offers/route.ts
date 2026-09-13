import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getAuthUser, getAdminUser } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { runCityMessages } from "@/lib/city-ads/messages.server";
import { runOfferMaintenance } from "@/lib/city-ads/offers.server";

/**
 * GET /api/cron/city-lead-offers — every 5 minutes.
 *
 * The clock for the city lead relay. See lib/city-ads/offers.server.ts for the
 * chain itself; this only advances what is due. Idempotent: an offer is expired
 * at most once (expired_at IS NULL guard) and a lead with an open offer is left
 * alone.
 *
 * Auth: CRON_SECRET (Vercel scheduler) or a signed-in admin, so the "Run the
 * clock now" button on /admin/city-ads works from a browser.
 */
export const maxDuration = 120;

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
    "city-lead-offers",
    async () => {
      const db = getServiceClient();
      const r = await runOfferMaintenance(db);
      const messages = await runCityMessages(db);
      return { ok: true, ...r, messages };
    },
    { triggeredBy },
  );
}
