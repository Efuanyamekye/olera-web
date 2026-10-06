import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { directoryHealthSummary, listHealthActions, resolveHealthAction, undoHealthAction } from "@/lib/providers/directory-health.server";

/**
 * GET  /api/admin/directory/health?all=1   the ledger (open flags and recent actions) + summary
 * POST /api/admin/directory/health         { action: "undo" | "resolve", id }
 *
 * The human side of directory health. The system archives closed providers
 * and applies cosmetic renames on its own (lib/providers/directory-health);
 * this is where a person sees what it did, puts one back, or closes a flag.
 * GET so it works from a browser address bar as well as the page.
 */
async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { admin };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const db = getServiceClient();
  const all = request.nextUrl.searchParams.get("all") === "1";
  try {
    const [actions, summary] = await Promise.all([listHealthActions(db, { open: !all, limit: 300 }), directoryHealthSummary(db, 7)]);
    return NextResponse.json({ actions, summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read the ledger" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  let body: { action?: string; id?: string };
  try {
    body = (await request.json()) as { action?: string; id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const db = getServiceClient();
  const actor = gate.admin.email;
  const result = body.action === "undo"
    ? await undoHealthAction(db, body.id, actor)
    : body.action === "resolve"
      ? await resolveHealthAction(db, body.id, actor)
      : { ok: false as const, error: "action must be undo or resolve" };
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
