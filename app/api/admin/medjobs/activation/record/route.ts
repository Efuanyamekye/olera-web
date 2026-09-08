import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { activationError } from "@/lib/medjobs/activation-errors";
import type { Channel, RecordKind } from "@/lib/medjobs/activation";
import { onChannelFirstTouch } from "@/lib/medjobs/activation";

/**
 * Records inside the three list channels: student organizations, campus
 * events and professors.
 *
 * POST   create one
 * PATCH  rename, edit contacts or detail, or decline it
 *
 * Declining is the one status a person chooses. It means stop asking, and
 * it takes the record out of the channel's rollup rather than leaving it to
 * sit in progress for ever.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await getAdminUser(user.id))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
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

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const { campusId, channel, kind, name, contacts, detail } = (await req.json()) as {
    campusId: string;
    channel: Channel;
    kind: RecordKind;
    name: string;
    contacts?: Array<{ name: string; role?: string; email?: string; phone?: string }>;
    detail?: Record<string, unknown>;
  };
  if (!campusId || !channel || !kind || !name?.trim()) {
    return NextResponse.json({ error: "campusId, channel, kind and name are required" }, { status: 400 });
  }

  const db = getServiceClient();

  let channelId: string;
  try {
    channelId = (await ensureChannel(db, campusId, channel, g.user!.id)).id;
  } catch (e) {
    console.error("[activation] create channel:", e);
    return NextResponse.json({ error: activationError(e, "open that channel") }, { status: 500 });
  }

  // Professors cannot exist before the approval gate is open. Enforced here
  // and not only in the UI: the rule is a policy, not a nicety.
  if (kind === "professor") {
    const { data: ch } = await db
      .from("campus_channels")
      .select("criteria")
      .eq("id", channelId)
      .single();
    if (!ch?.criteria?.approved) {
      return NextResponse.json(
        { error: "Approval must be recorded before professors can be added" },
        { status: 409 },
      );
    }
  }

  const { data, error } = await db
    .from("campus_channel_records")
    .insert({
      channel_id: channelId,
      kind,
      name: name.trim(),
      contacts: (contacts ?? []).slice(0, 2),
      detail: detail ?? {},
    })
    .select("*")
    .single();
  if (error) {
    console.error("[activation] create record:", error);
    return NextResponse.json({ error: activationError(error, "add that") }, { status: 500 });
  }
  return NextResponse.json({ record: data });
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;

  const { recordId, name, contacts, detail, decline, reason, note } = (await req.json()) as {
    recordId: string;
    name?: string;
    contacts?: Array<{ name: string; role?: string; email?: string; phone?: string }>;
    detail?: Record<string, unknown>;
    decline?: boolean;
    reason?: string;
    note?: string;
  };
  if (!recordId) return NextResponse.json({ error: "recordId is required" }, { status: 400 });

  const db = getServiceClient();
  const { data: rec } = await db
    .from("campus_channel_records")
    .select("*")
    .eq("id", recordId)
    .single();
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name?.trim()) patch.name = name.trim();
  if (contacts) patch.contacts = contacts.slice(0, 2);
  if (detail) patch.detail = { ...(rec.detail ?? {}), ...detail };
  if (note?.trim()) {
    patch.notes = [...(rec.notes ?? []), { at: new Date().toISOString(), text: note.trim() }];
  }
  if (decline === true) {
    if (!reason?.trim()) {
      return NextResponse.json({ error: "A reason is required to decline" }, { status: 400 });
    }
    patch.status = "declined";
    patch.status_reason = reason.trim();
    await db
      .from("site_tasks")
      .update({ status: "cancelled" })
      .eq("record_id", recordId)
      .eq("status", "pending");
  }

  const { error } = await db.from("campus_channel_records").update(patch).eq("id", recordId);
  if (error) {
    console.error("[activation] patch record:", error);
    return NextResponse.json({ error: activationError(error, "save that change") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
