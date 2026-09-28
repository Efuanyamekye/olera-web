import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { postOleraMessage } from "@/lib/connections/olera-message.server";

/**
 * POST { text } — Olera's care team writes into a family–provider
 * conversation. Both parties see it in their inbox and get an email.
 * See lib/connections/olera-message.server.ts for why it is stored beside
 * the thread rather than in it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { id } = await params;
  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // The name the team member signed up with ("TJ Falohun", "Ces"). The admin
  // record's display_name is usually just the start of their email address.
  const db = getServiceClient();
  const { data: authUser } = await db.auth.admin.getUserById(user.id);
  const meta = (authUser?.user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const fullName = [meta.full_name, meta.name, admin.display_name, admin.email.split("@")[0]].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  const author = fullName ? fullName.trim().split(/\s+/)[0] : null;
  try {
    const r = await postOleraMessage(db, id, text, author);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    const who = r.emailed.length === 2 ? "both of them" : r.emailed.length === 1 ? `the ${r.emailed[0]}` : "nobody (no email on file)";
    return NextResponse.json({ ok: true, message: r.message, emailed: r.emailed, notice: `Sent. Emailed ${who}.` });
  } catch (e) {
    console.error("[admin/olera-message] failed", e);
    return NextResponse.json({ error: "Could not send that message" }, { status: 500 });
  }
}
