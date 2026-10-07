import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { draftPrep, findEvent, prepOne, previewMeetings } from "@/lib/war-room/meeting-prep.server";

export const maxDuration = 60;

/**
 * GET /api/admin/cortex/meeting-prep              the next 3 days' meetings and which channel each prep goes to
 * GET /api/admin/cortex/meeting-prep?draft=<id>   write the prep for that meeting and show it, without posting
 * GET /api/admin/cortex/meeting-prep?post=<id>    write and post the prep for that meeting now (test)
 *
 * From a browser address bar, so the founder can see the routing and fire one
 * before the three-hourly cron does it on its own.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const db = getServiceClient();
  const draftId = request.nextUrl.searchParams.get("draft");
  if (draftId) {
    const event = await findEvent(db, draftId);
    if (!event) return NextResponse.json({ error: "No upcoming meeting with that id in the next 7 days" }, { status: 404 });
    const { channel, text, noteUsed, noteSeen } = await draftPrep(db, event);
    return NextResponse.json({ draft: { channel, text, lastTimeNote: noteUsed, notionFound: noteSeen } });
  }
  const id = request.nextUrl.searchParams.get("post");
  if (id) {
    const event = await findEvent(db, id);
    if (!event) return NextResponse.json({ error: "No upcoming meeting with that id in the next 7 days" }, { status: 404 });
    return NextResponse.json({ posted: await prepOne(db, event, { force: true }) });
  }
  const days = Math.min(14, Math.max(1, Number(request.nextUrl.searchParams.get("days") ?? 3) || 3));
  return NextResponse.json(await previewMeetings(db, days));
}
