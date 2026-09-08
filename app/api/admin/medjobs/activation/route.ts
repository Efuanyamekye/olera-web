import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { activationError } from "@/lib/medjobs/activation-errors";
import {
  CHANNELS,
  CHANNEL_ORDER,
  RECORDS,
  deriveStatus,
  rollUp,
  isDue,
  type Channel,
  type ChannelStatus,
  type RecordStatus,
  onChannelFirstTouch,
} from "@/lib/medjobs/activation";

/**
 * GET /api/admin/medjobs/activation
 *
 * Every active site with the state of its five channels. One query per
 * table rather than per campus: the list view is the surface a Consumer
 * Relations Manager opens first and it has to be quick at fifty sites.
 *
 * ?university=<slug> returns the one campus with its records expanded.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  campus_id: string;
  channel: Channel;
  status: ChannelStatus;
  status_reason: string | null;
  first_activated_at: string | null;
  criteria: Record<string, string>;
  detail: Record<string, unknown>;
  notes: Array<{ at: string; text: string }>;
}

interface RecordRow {
  id: string;
  channel_id: string;
  kind: "organization" | "event" | "professor";
  name: string;
  status: RecordStatus;
  status_reason: string | null;
  first_activated_at: string | null;
  criteria: Record<string, string>;
  detail: Record<string, unknown>;
  contacts: Array<{ name: string; role?: string; email?: string; phone?: string }>;
  notes: Array<{ at: string; text: string }>;
}

/** Create a channel row on first touch, with the check that first touch earns. */
async function ensureChannel(
  db: ReturnType<typeof getServiceClient>,
  campusId: string,
  channel: Channel,
  userId: string,
) {
  const { data: existing } = await db
    .from("campus_channels")
    .select("*")
    .eq("campus_id", campusId)
    .eq("channel", channel)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from("campus_channels")
    .insert({ campus_id: campusId, channel })
    .select("*")
    .single();
  if (error) throw error;

  const first = onChannelFirstTouch(channel, new Date());
  if (first) {
    await db.from("site_tasks").insert({
      campus_id: campusId,
      task_type: first.task_type,
      due_at: first.due_at.toISOString(),
      channel: first.channel,
      repeat_months: first.repeat_months ?? null,
      created_by: userId,
    });
  }
  return data;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getAdminUser(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slug = req.nextUrl.searchParams.get("university");
  const db = getServiceClient();

  const { data: campuses, error: cErr } = await db
    .from("student_outreach_campuses")
    .select("id, slug, name, city, state")
    .eq("is_active", true)
    .order("name");
  if (cErr) {
    console.error("[activation] campuses:", cErr);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }

  const wanted = slug ? (campuses ?? []).filter((c) => c.slug === slug) : (campuses ?? []);
  if (wanted.length === 0) return NextResponse.json({ universities: [] });
  const ids = wanted.map((c) => c.id);

  const [chanRes, taskRes] = await Promise.all([
    db.from("campus_channels").select("*").in("campus_id", ids),
    db
      .from("site_tasks")
      .select("id, campus_id, channel, record_id, due_at, task_type")
      .in("campus_id", ids)
      .eq("status", "pending"),
  ]);
  // A read that fails must not render as a campus where nothing has been
  // done. An empty workspace and an unreadable one look identical on screen
  // and mean opposite things.
  for (const [what, res] of [["channels", chanRes], ["tasks", taskRes]] as const) {
    if (res.error) {
      console.error(`[activation] read ${what}:`, res.error);
      return NextResponse.json(
        { error: activationError(res.error, `read the activation ${what}`) },
        { status: 500 },
      );
    }
  }
  const channels = chanRes.data;
  const tasks = taskRes.data;

  const chans = (channels ?? []) as ChannelRow[];
  let records: RecordRow[] = [];
  if (slug && chans.length > 0) {
    const recRes = await db
      .from("campus_channel_records")
      .select("*")
      .in("channel_id", chans.map((c) => c.id))
      .order("created_at");
    if (recRes.error) {
      console.error("[activation] read records:", recRes.error);
      return NextResponse.json(
        { error: activationError(recRes.error, "read the activation records") },
        { status: 500 },
      );
    }
    records = (recRes.data ?? []) as RecordRow[];
  }

  const openTask = (campusId: string, channel: Channel, recordId?: string) =>
    (tasks ?? []).find(
      (t) =>
        t.campus_id === campusId &&
        t.channel === channel &&
        (recordId ? t.record_id === recordId : !t.record_id),
    ) ?? null;

  const universities = wanted.map((c) => {
    const built = CHANNEL_ORDER.map((key) => {
      const def = CHANNELS[key];
      const row = chans.find((r) => r.campus_id === c.id && r.channel === key) ?? null;
      const mine = records.filter((r) => r.channel_id === row?.id);

      // A list channel rolls up from its records; a simple channel derives
      // from its own criteria. ST7 additionally cannot be live before its
      // approval gate is open.
      const manual = row?.status === "not_available" ? "not_available" : null;
      const status: ChannelStatus = def.records
        ? rollUp(mine, manual, key === "st7" ? Boolean(row?.criteria?.approved) : true)
        : (deriveStatus(row?.criteria ?? {}, def, manual) as ChannelStatus);

      const t = openTask(c.id, key);
      const recordDue = mine.some((r) => {
        const rt = openTask(c.id, key, r.id);
        return isDue(rt?.due_at);
      });

      return {
        channel: key,
        name: def.name,
        status,
        statusReason: row?.status_reason ?? null,
        firstActivatedAt: row?.first_activated_at ?? null,
        criteria: row?.criteria ?? {},
        detail: row?.detail ?? {},
        notes: row?.notes ?? [],
        nextCheck: t ? { taskId: t.id, dueAt: t.due_at } : null,
        due: isDue(t?.due_at) || recordDue,
        liveCount: def.records ? mine.filter((r) => r.status === "live").length : null,
        recordCount: def.records ? mine.filter((r) => r.status !== "declined").length : null,
        records: slug
          ? mine.map((r) => {
              const rt = openTask(c.id, key, r.id);
              return {
                id: r.id,
                kind: r.kind,
                name: r.name,
                status: r.status,
                statusReason: r.status_reason,
                firstActivatedAt: r.first_activated_at,
                criteria: r.criteria,
                detail: r.detail,
                contacts: r.contacts ?? [],
                notes: r.notes ?? [],
                nextCheck: rt ? { taskId: rt.id, dueAt: rt.due_at } : null,
                due: isDue(rt?.due_at),
                liveWhen: RECORDS[r.kind].liveWhen,
              };
            })
          : undefined,
      };
    });

    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      state: c.state,
      due: built.some((b) => b.due),
      channels: built,
    };
  });

  return NextResponse.json({ universities });
}

/**
 * PATCH — channel-level edits: a note, a detail field (ST3's posting URL,
 * ST7's approval pathway), contacts, or marking the channel unavailable.
 *
 * Marking a channel not available requires a reason and cancels its open
 * tasks. Recording a dead job board as dead is useful; leaving it blank
 * looks like work nobody did.
 */
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getAdminUser(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { campusId, channel, note, detail, contacts, notAvailable, reason } =
    (await req.json()) as {
      campusId: string;
      channel: Channel;
      note?: string;
      detail?: Record<string, unknown>;
      contacts?: Array<{ name: string; role?: string; email?: string; phone?: string }>;
      notAvailable?: boolean;
      reason?: string;
    };
  if (!campusId || !channel) {
    return NextResponse.json({ error: "campusId and channel are required" }, { status: 400 });
  }

  const db = getServiceClient();
  let row;
  try {
    row = await ensureChannel(db, campusId, channel, user.id);
  } catch (e) {
    console.error("[activation] create channel:", e);
    return NextResponse.json({ error: activationError(e, "open that channel") }, { status: 500 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (detail) patch.detail = { ...(row.detail ?? {}), ...detail };
  if (contacts) patch.detail = { ...(patch.detail ?? row.detail ?? {}), contacts };
  if (note?.trim()) {
    patch.notes = [...(row.notes ?? []), { at: new Date().toISOString(), text: note.trim() }];
  }
  if (notAvailable === true) {
    if (!reason?.trim()) {
      return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    }
    patch.status = "not_available";
    patch.status_reason = reason.trim();
    await db
      .from("site_tasks")
      .update({ status: "cancelled" })
      .eq("campus_id", campusId)
      .eq("channel", channel)
      .eq("status", "pending");
  }
  if (notAvailable === false) {
    patch.status = "not_yet";
    patch.status_reason = null;
  }

  const { error } = await db.from("campus_channels").update(patch).eq("id", row.id);
  if (error) {
    console.error("[activation] patch channel:", error);
    return NextResponse.json({ error: activationError(error, "save that change") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
