import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ownership is checked before the service-only, atomic preference/event RPC. */
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { profileId, kind, key, channel, enabled, emailLogId } = body ?? {};
  if (typeof profileId !== "string" || !UUID.test(profileId) ||
      !["view", "save", "whatsapp"].includes(kind) ||
      (kind === "save" && (typeof key !== "string" || typeof channel !== "string" || typeof enabled !== "boolean"))) {
    return NextResponse.json({ error: "Invalid preference" }, { status: 400 });
  }
  const { data: account, error: accountError } = await db.from("accounts").select("id").eq("user_id", user.id).single();
  if (accountError || !account) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: profile, error: profileError } = await db.from("business_profiles")
    .select("id").eq("id", profileId).eq("account_id", account.id).single();
  if (profileError || !profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await getServiceClient().rpc("save_notification_preference", {
    p_profile_id: profileId, p_account_id: account.id, p_kind: kind,
    p_key: key ?? null, p_channel: channel ?? null, p_enabled: enabled ?? null,
    p_email_log_id: typeof emailLogId === "string" && UUID.test(emailLogId) ? emailLogId : null,
  });
  if (error) {
    console.error("[notification-preferences] Save failed:", error.code);
    return NextResponse.json({ error: "Could not update notification settings" }, { status: error.code === "22023" ? 400 : 503 });
  }
  return NextResponse.json({ ok: true, ...data }, { headers: { "Cache-Control": "private, no-store" } });
}
