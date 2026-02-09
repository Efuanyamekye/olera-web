import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/leads
 *
 * List all connections with from/to profile info.
 * Query params: status, type, limit, offset, count_only
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
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const countOnly = searchParams.get("count_only") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const db = getServiceClient();

    if (countOnly) {
      let countQuery = db
        .from("connections")
        .select("*", { count: "exact", head: true });

      if (status) countQuery = countQuery.eq("status", status);
      if (type) countQuery = countQuery.eq("type", type);

      const { count } = await countQuery;
      return NextResponse.json({ count: count ?? 0 });
    }

    // Fetch connections with joined profile names
    let query = db
      .from("connections")
      .select(`
        id,
        type,
        status,
        message,
        created_at,
        from_profile:business_profiles!connections_from_profile_id_fkey(id, display_name, type),
        to_profile:business_profiles!connections_to_profile_id_fkey(id, display_name, type)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);

    const { data: connections, error } = await query;

    if (error) {
      console.error("Failed to fetch leads:", error);
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
    }

    return NextResponse.json({ connections: connections ?? [] });
  } catch (err) {
    console.error("Admin leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
