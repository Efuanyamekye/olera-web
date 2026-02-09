import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/audit
 *
 * Fetch recent audit log entries with admin email joined.
 * Query params: limit (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const db = getServiceClient();
    const { data: entries, error } = await db
      .from("audit_log")
      .select(`
        id,
        action,
        target_type,
        target_id,
        details,
        created_at,
        admin:admin_users!audit_log_admin_user_id_fkey(email)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch audit log:", error);
      return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
    }

    // Flatten admin email into entries
    const formatted = (entries ?? []).map((entry) => ({
      id: entry.id,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id,
      details: entry.details,
      created_at: entry.created_at,
      admin_email: (entry.admin as unknown as { email: string } | null)?.email ?? null,
    }));

    return NextResponse.json({ entries: formatted });
  } catch (err) {
    console.error("Admin audit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
