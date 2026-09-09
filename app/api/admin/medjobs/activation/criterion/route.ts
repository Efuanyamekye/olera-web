import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { activationError } from "@/lib/medjobs/activation-errors";
import {
  CHANNELS,
  RECORDS,
  deriveStatus,
  onLiveWin,
  onHookTick,
  type Channel,
  type ChannelStatus,
  type RecordStatus,
  onChannelFirstTouch,
} from "@/lib/medjobs/activation";

/**
 * POST /api/admin/medjobs/activation/criterion
 *
 * Tick or untick one Live Win criterion, then let the engine decide what it
 * means. This is the only route that changes a status: the manager records
 * a fact and the system derives the rest, which is what keeps the two from
 * disagreeing.
 *
 * Body: { campusId, channel, recordId?, key, checked }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getAdminUser(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { campusId, channel, recordId, key, checked } = (await req.json()) as {
    campusId: string;
    channel: Channel;
    recordId?: string;
    key: string;
    checked: boolean;
  };
  if (!campusId || !channel || !key) {
    return NextResponse.json({ error: "campusId, channel and key are required" }, { status: 400 });
  }

  const db = getServiceClient();
  const now = new Date();

  // The channel row is created lazily: a campus nobody has touched has no
  // rows at all, which is what lets the list read "not yet" for free.
  let channelRow;
  try {
    channelRow = await ensureChannel(db, campusId, channel, user.id);
  } catch (e) {
    console.error("[activation] create channel:", e);
    return NextResponse.json({ error: activationError(e, "record that step") }, { status: 500 });
  }

  const def = recordId ? null : CHANNELS[channel];
  let target: { criteria: Record<string, string>; status: string; first_activated_at: string | null };
  let recordKind: "organization" | "event" | "professor" | null = null;

  if (recordId) {
    const { data: rec } = await db
      .from("campus_channel_records")
      .select("*")
      .eq("id", recordId)
      .single();
    if (!rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });
    recordKind = rec.kind;
    target = rec;
  } else {
    target = channelRow;
  }

  const criteria = { ...(target.criteria ?? {}) };
  if (checked) criteria[key] = now.toISOString();
  else delete criteria[key];

  const activeDef = recordKind ? RECORDS[recordKind] : def!;
  const wasLive = target.status === "live";
  const nextStatus = deriveStatus(criteria, activeDef, null) as ChannelStatus | RecordStatus;
  const nowLive = nextStatus === "live";

  const patch: Record<string, unknown> = {
    criteria,
    status: nextStatus,
    updated_at: now.toISOString(),
  };
  // Set once, never cleared. The activation happened, and that fact does not
  // expire if the channel later lapses.
  if (nowLive && !target.first_activated_at) patch.first_activated_at = now.toISOString();

  if (recordId) {
    await db.from("campus_channel_records").update(patch).eq("id", recordId);
  } else {
    await db.from("campus_channels").update(patch).eq("id", channelRow.id);
  }

  // Effects. A hook fires on tick; the recurring check is earned by the
  // transition into live, so it fires once and not on every later tick.
  const criterion = activeDef.criteria.find((c) => c.key === key);
  const toCreate = [];
  if (checked && criterion) {
    const hook = onHookTick(criterion, channel, now, recordId);
    if (hook) toCreate.push(hook);
  }
  if (nowLive && !wasLive) {
    const win = onLiveWin(channel, activeDef, now, recordId);
    if (win) toCreate.push(win);
  }

  for (const t of toCreate) {
    // One open task per object: a second would make the next-check date on
    // a card ambiguous.
    const dup = await db
      .from("site_tasks")
      .select("id")
      .eq("campus_id", campusId)
      .eq("task_type", t.task_type)
      .eq("status", "pending")
      .is("record_id", t.record_id ?? null)
      .maybeSingle();
    if (dup.data) continue;
    await db.from("site_tasks").insert({
      campus_id: campusId,
      task_type: t.task_type,
      due_at: t.due_at.toISOString(),
      channel: t.channel,
      record_id: t.record_id ?? null,
      answers_criterion: t.answers_criterion ?? null,
      repeat_months: t.repeat_months ?? null,
      created_by: user.id,
    });
  }

  // Answering a criterion closes the task that asked about it.
  if (checked) {
    await db
      .from("site_tasks")
      .update({ status: "completed", completed_at: now.toISOString(), completed_by: user.id })
      .eq("campus_id", campusId)
      .eq("channel", channel)
      .eq("answers_criterion", key)
      .eq("status", "pending");
  }

  return NextResponse.json({
    status: nextStatus,
    wentLive: nowLive && !wasLive,
    tasksCreated: toCreate.length,
  });
}
