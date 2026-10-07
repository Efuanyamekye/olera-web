import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { directoryDigestText, directoryWeeklyText, handoffsWaitingText, speakMorning } from "@/lib/war-room/cortex-voice.server";
import { postMeetingSummaries } from "@/lib/war-room/meeting-summaries.server";
import { providerTractionText } from "@/lib/war-room/provider-traction.server";

// The traction read walks ~2,000 providers across four tables: about 20 s.
export const maxDuration = 120;

/**
 * GET /api/admin/cortex/voice            what Cortex would say this morning, without posting
 * GET /api/admin/cortex/voice?post=1     say it now (same idempotency as the cron: nothing twice)
 *
 * From a browser address bar, so the founder can see the morning post before
 * the channel does, and fire it by hand the day #cortex is created.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const db = getServiceClient();
  if (request.nextUrl.searchParams.get("post") === "1") {
    const [morning, meetings] = await Promise.all([speakMorning(db), postMeetingSummaries(db)]);
    return NextResponse.json({ posted: true, morning, meetings });
  }
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [digest, weekly, handoffs, providers] = await Promise.all([directoryDigestText(db, since), directoryWeeklyText(db), handoffsWaitingText(db), providerTractionText(db)]);
  return NextResponse.json({ preview: true, digest, weekly, handoffs, providers });
}
