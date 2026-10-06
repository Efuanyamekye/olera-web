import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { withCronRun } from "@/lib/crons/run";
import { speakMorning } from "@/lib/war-room/cortex-voice.server";
import { postMeetingSummaries } from "@/lib/war-room/meeting-summaries.server";

/**
 * GET /api/cron/cortex-voice
 *
 * Cortex's morning in #cortex, after the brief (05:30 UTC): what the
 * directory system did overnight with undo links (only when something
 * happened), the weekly state of the directory on Mondays (said even when
 * nothing moved), pull requests built from approved briefs that are waiting
 * for a look, and summaries of any meeting notes that landed in Notion.
 * Every post is keyed in cortex_posts, so a rerun says nothing twice.
 * Runs daily at 06:00 UTC.
 */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return withCronRun("cortex-voice", async () => {
    const db = getServiceClient();
    const [morning, meetings] = await Promise.all([
      speakMorning(db).catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
      postMeetingSummaries(db).catch((err) => ({ posted: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] })),
    ]);
    console.log(`[cortex-voice] ${JSON.stringify({ morning, meetings })}`);
    return NextResponse.json({ morning, meetings });
  });
}
