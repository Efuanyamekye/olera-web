import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/providers
 *
 * List business profiles filtered by claim_state.
 * Query params: status (default: "pending"), count_only, limit, offset
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
    const status = searchParams.get("status") || "pending";
    const countOnly = searchParams.get("count_only") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const db = getServiceClient();

    if (countOnly) {
      const { count } = await db
        .from("business_profiles")
        .select("*", { count: "exact", head: true })
        .eq("claim_state", status)
        .in("type", ["organization", "caregiver"]);

      return NextResponse.json({ count: count ?? 0 });
    }

    let query = db
      .from("business_profiles")
      .select("id, display_name, type, category, city, state, claim_state, created_at, email, phone")
      .in("type", ["organization", "caregiver"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("claim_state", status);
    }

    const { data: providers, error } = await query;

    if (error) {
      console.error("Failed to fetch providers:", error);
      return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
    }

    return NextResponse.json({ providers: providers ?? [] });
  } catch (err) {
    console.error("Admin providers error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
