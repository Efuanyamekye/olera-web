import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";

/**
 * Team members of an agency (migration 271).
 *
 * GET    /api/admin/providers/[id]/members                 → { owner_email, members }
 * POST   /api/admin/providers/[id]/members  { email }      → adds a member
 * DELETE /api/admin/providers/[id]/members?email=…         → removes a member
 *
 * A member signs in with that email and works the agency next to the owner.
 * Adding one also copies them on family alerts (metadata.alert_emails), and
 * removing one takes them off, because a teammate who works the families
 * needs to hear about them.
 */

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = await getAdminUser(user.id);
  if (!admin) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { user, admin };
}

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

async function setAlertEmail(id: string, email: string, on: boolean) {
  const db = getServiceClient();
  const { data: p } = await db.from("business_profiles").select("metadata").eq("id", id).maybeSingle();
  const meta = (p?.metadata as Record<string, unknown> | null) ?? {};
  const current = Array.isArray(meta.alert_emails)
    ? (meta.alert_emails as unknown[]).filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase())
    : [];
  const next = on ? Array.from(new Set([...current, email])) : current.filter((e) => e !== email);
  await db.from("business_profiles").update({ metadata: { ...meta, alert_emails: next } }).eq("id", id);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const db = getServiceClient();

  const { data: profile } = await db.from("business_profiles").select("id, account_id").eq("id", id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  let ownerEmail: string | null = null;
  if (profile.account_id) {
    const { data: acct } = await db.from("accounts").select("user_id").eq("id", profile.account_id).maybeSingle();
    if (acct?.user_id) {
      const { data } = await db.auth.admin.getUserById(acct.user_id as string);
      ownerEmail = data?.user?.email ?? null;
    }
  }

  const { data: members, error } = await db
    .from("business_profile_members")
    .select("email, role, added_by, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ owner_email: ownerEmail, members: members ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail((body as { email?: unknown }).email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const db = getServiceClient();
  const { data: profile } = await db.from("business_profiles").select("id").eq("id", id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const { error } = await db
    .from("business_profile_members")
    .upsert({ profile_id: id, email, role: "staff", added_by: auth.user.email ?? null }, { onConflict: "profile_id,email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await setAlertEmail(id, email, true);
  await logAuditAction({
    adminUserId: auth.admin.id,
    action: "provider_member_added",
    targetType: "business_profile",
    targetId: id,
    details: { email },
  });
  return NextResponse.json({ success: true, email });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const email = cleanEmail(new URL(req.url).searchParams.get("email"));
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const db = getServiceClient();
  const { error } = await db.from("business_profile_members").delete().eq("profile_id", id).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await setAlertEmail(id, email, false);
  await logAuditAction({
    adminUserId: auth.admin.id,
    action: "provider_member_removed",
    targetType: "business_profile",
    targetId: id,
    details: { email },
  });
  return NextResponse.json({ success: true, email });
}
