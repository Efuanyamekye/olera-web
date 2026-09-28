import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  LEADERSHIP,
  byName,
  isPageKey,
  leadershipName,
  type Owner,
  type PageOwners,
} from "@/lib/admin-page-owners";

/**
 * Who leads which admin page.
 *
 * GET returns both halves of what the sidebar needs in one round trip: the
 * people the dropdown may offer, and the current owners keyed by page href.
 *
 * POST adds or removes one person from one page. One at a time rather than
 * replacing the whole list, because the dropdown is a set of toggles and a
 * whole-list write would let two admins with the menu open overwrite each
 * other's choice.
 *
 * Any admin may assign. This is a view of who is in charge, not a permission,
 * and the people who would be allowed to edit it are the same people who can
 * already read it.
 */

/** admin_users rows for everyone on the leadership list, by id. */
async function leadershipRoster(
  db: ReturnType<typeof getServiceClient>,
): Promise<Map<string, Owner>> {
  const { data } = await db
    .from("admin_users")
    .select("id, email")
    .in(
      "email",
      LEADERSHIP.map((p) => p.email),
    );

  const out = new Map<string, Owner>();
  for (const row of (data ?? []) as { id: string; email: string }[]) {
    const name = leadershipName(row.email);
    // Defensive: the `in` filter is case-sensitive in Postgres, so an address
    // stored with different capitalisation comes back here and would have no
    // name. Skipping is better than printing a raw address in the sidebar.
    if (!name) continue;
    out.set(row.id, { id: row.id, email: row.email, name });
  }
  return out;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getServiceClient();
  const roster = await leadershipRoster(db);

  const { data, error } = await db
    .from("admin_page_assignments")
    .select("page_key, admin_user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const owners: PageOwners = {};
  for (const row of (data ?? []) as { page_key: string; admin_user_id: string }[]) {
    const person = roster.get(row.admin_user_id);
    // Somebody assigned before they came off the leadership list. The row
    // stays — taking them off the list is not the same as unassigning them —
    // but the sidebar does not print a name it has no name for.
    if (!person) continue;
    (owners[row.page_key] ??= []).push(person);
  }
  for (const key of Object.keys(owners)) owners[key].sort(byName);

  return NextResponse.json({
    people: [...roster.values()].sort(byName),
    owners,
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = await getAdminUser(user.id);
  if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    pageKey?: unknown;
    adminUserId?: unknown;
    action?: unknown;
  } | null;

  const pageKey = body?.pageKey;
  const adminUserId = body?.adminUserId;
  const action = body?.action;

  if (!isPageKey(pageKey)) {
    return NextResponse.json({ error: "That is not an admin page" }, { status: 400 });
  }
  if (typeof adminUserId !== "string" || !adminUserId) {
    return NextResponse.json({ error: "No person named" }, { status: 400 });
  }
  if (action !== "add" && action !== "remove") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const db = getServiceClient();

  // Checked server-side, not merely offered in the dropdown: a stale tab must
  // not be able to assign somebody who has come off the list.
  const roster = await leadershipRoster(db);
  const person = roster.get(adminUserId);
  if (!person) {
    return NextResponse.json({ error: "That person cannot lead a page" }, { status: 400 });
  }

  if (action === "remove") {
    const { error } = await db
      .from("admin_page_assignments")
      .delete()
      .eq("page_key", pageKey)
      .eq("admin_user_id", adminUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // upsert, not insert: the unique constraint on the pair makes assigning
  // somebody already on the page harmless, and two clicks in a row should
  // not surface an error the operator can do nothing about.
  const { error } = await db.from("admin_page_assignments").upsert(
    {
      page_key: pageKey,
      admin_user_id: adminUserId,
      assigned_by: admin.id,
    },
    { onConflict: "page_key,admin_user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
