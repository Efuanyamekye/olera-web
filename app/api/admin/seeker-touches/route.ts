import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser } from "@/lib/admin";
import {
  loadSeekerRelationships,
  loadSeekerTimeline,
  seekerRelationshipsToMarkdown,
  seekerTimelineToMarkdown,
  DEFAULT_WINDOW_DAYS,
} from "@/lib/seeker-touches/timeline.server";

/**
 * Care-seeker relationships — read only.
 *
 * The family counterpart to /api/admin/touches. Every row it returns is derived
 * from tables that already exist and already carry the family's profile id, so
 * this route writes nothing and stores nothing.
 *
 * GET — supported in the browser so a record can be opened without tooling.
 *
 *   /api/admin/seeker-touches                the Relationships list
 *   /api/admin/seeker-touches?seeker=<uuid>  one family's full timeline
 *   ...&days=90                              widen the live-episode window
 *   ...&format=md                            read as markdown in a tab
 *
 * Auth: admin only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function md(body: string): NextResponse {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const seeker = params.get("seeker");
  const asMarkdown = params.get("format") === "md";

  const rawDays = Number(params.get("days"));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : DEFAULT_WINDOW_DAYS;

  try {
    if (seeker) {
      if (!UUID_RE.test(seeker)) {
        return NextResponse.json({ error: "seeker must be a uuid" }, { status: 400 });
      }
      const timeline = await loadSeekerTimeline(seeker);
      if (!timeline) return NextResponse.json({ error: "Care seeker not found" }, { status: 404 });
      return asMarkdown ? md(seekerTimelineToMarkdown(timeline)) : NextResponse.json(timeline);
    }

    const rows = await loadSeekerRelationships({ days });
    return asMarkdown
      ? md(seekerRelationshipsToMarkdown(rows))
      : NextResponse.json({ rows, window_days: days });
  } catch (error) {
    console.error("[seeker-touches] failed:", error);
    return NextResponse.json({ error: "Failed to load care seeker relationships" }, { status: 500 });
  }
}
