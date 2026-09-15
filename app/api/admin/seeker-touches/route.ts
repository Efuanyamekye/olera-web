import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { FAMILY_TOUCH_CHANNELS, TOUCH_DIRECTIONS, TOUCH_SOURCES, type FamilyTouchInput } from "@/lib/seeker-touches/types";
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
 * POST — append one touch: a call, a meeting, a text from a personal phone.
 *        Only what the app cannot see for itself; system sends stay in
 *        email_log and are merged at read time.
 *
 *        `reached` is the field that matters. TRUE means we spoke to them and
 *        clears an owed call; FALSE means we tried and did not, and keeps the
 *        row red. Declaring a next action closes the family's earlier open ones.
 *
 * PATCH — { id, done: true } marks a next action done.
 *
 * Auth: admin only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { admin };
}

function md(body: string): NextResponse {
  return new NextResponse(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

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

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: Partial<FamilyTouchInput>;
  try {
    body = (await request.json()) as Partial<FamilyTouchInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seeker_id = clean(body.seeker_id);
  const channel = clean(body.channel);
  const direction = clean(body.direction) ?? "out";
  const summary = clean(body.summary);
  const source = clean(body.source) ?? "manual";
  const occurred_at = clean(body.occurred_at);
  const next_action = clean(body.next_action);
  const next_action_due = clean(body.next_action_due);
  const next_action_owner = clean(body.next_action_owner);

  if (!seeker_id || !UUID_RE.test(seeker_id)) {
    return NextResponse.json({ error: "seeker_id must be a business_profiles UUID" }, { status: 400 });
  }
  if (!channel || !(FAMILY_TOUCH_CHANNELS as readonly string[]).includes(channel)) {
    return NextResponse.json({ error: `channel must be one of ${FAMILY_TOUCH_CHANNELS.join(", ")}` }, { status: 400 });
  }
  if (!(TOUCH_DIRECTIONS as readonly string[]).includes(direction)) {
    return NextResponse.json({ error: "direction must be out or in" }, { status: 400 });
  }
  if (!(TOUCH_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json({ error: `source must be one of ${TOUCH_SOURCES.join(", ")}` }, { status: 400 });
  }
  if (!summary) return NextResponse.json({ error: "Say what happened" }, { status: 400 });
  if (summary.length > 240) {
    return NextResponse.json({ error: "That is one line's worth; put the rest in detail" }, { status: 400 });
  }
  if (occurred_at && Number.isNaN(Date.parse(occurred_at))) {
    return NextResponse.json({ error: "occurred_at must be an ISO timestamp" }, { status: 400 });
  }
  if (next_action_due && !DATE_RE.test(next_action_due)) {
    return NextResponse.json({ error: "next_action_due must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!next_action && (next_action_due || next_action_owner)) {
    return NextResponse.json({ error: "a due date or owner needs a next action" }, { status: 400 });
  }

  const db = getServiceClient();

  // Confirm the family exists and really is one, before the FK does it for us.
  const { data: profile } = await db
    .from("business_profiles")
    .select("id")
    .eq("id", seeker_id)
    .eq("type", "family")
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Care seeker not found" }, { status: 404 });

  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("family_touches")
    .insert({
      seeker_id,
      channel,
      direction,
      occurred_at: occurred_at ?? nowIso,
      reached: typeof body.reached === "boolean" ? body.reached : null,
      summary,
      detail: clean(body.detail),
      contact_name: clean(body.contact_name),
      contact_handle: clean(body.contact_handle),
      source,
      source_ref: clean(body.source_ref),
      next_action,
      next_action_due,
      next_action_owner,
      author: admin.display_name || admin.email || "admin",
      admin_user_id: admin.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[seeker-touches] insert failed:", error);
    return NextResponse.json({ error: "Failed to log this touch" }, { status: 500 });
  }

  // A new next action supersedes the open ones. Done, not deleted: what we meant
  // to do next is part of the record. Closed AFTER the insert, so a failed write
  // never erases the action that was already on the list.
  if (next_action) {
    const { error: closeErr } = await db
      .from("family_touches")
      .update({ next_action_done_at: nowIso })
      .eq("seeker_id", seeker_id)
      .neq("id", (data as { id: string }).id)
      .not("next_action", "is", null)
      .is("next_action_done_at", null);
    if (closeErr) console.error("[seeker-touches] failed to close prior actions:", closeErr);
  }

  return NextResponse.json({ touch: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  let body: { id?: string; done?: boolean };
  try {
    body = (await request.json()) as { id?: string; done?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = clean(body.id);
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  if (body.done !== true) return NextResponse.json({ error: "only { id, done: true } is supported" }, { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from("family_touches")
    .update({ next_action_done_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[seeker-touches] patch failed:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Touch not found" }, { status: 404 });
  return NextResponse.json({ touch: data });
}
