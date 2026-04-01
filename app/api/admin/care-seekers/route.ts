import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

/**
 * GET /api/admin/care-seekers
 *
 * List family profiles with search, filters, and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") || "50", 10)));
    const guestOnly = searchParams.get("guest_only") === "true";
    const claimedOnly = searchParams.get("claimed_only") === "true";
    const publicOnly = searchParams.get("public_only") === "true";
    const cityFilter = searchParams.get("city")?.trim() || "";
    const stateFilter = searchParams.get("state")?.trim() || "";

    const db = getServiceClient();

    let query = db
      .from("business_profiles")
      .select("id, slug, display_name, email, phone, city, state, care_types, metadata, account_id, claim_state, source, created_at", { count: "exact" })
      .eq("type", "family")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (guestOnly) {
      query = query.is("account_id", null);
    } else if (claimedOnly) {
      query = query.not("account_id", "is", null);
    }

    if (publicOnly) {
      query = query
        .eq("is_active", true)
        .contains("metadata", { care_post: { status: "active" } });
    }

    if (cityFilter === "__null__") {
      query = query.is("city", null);
    } else if (cityFilter) {
      query = query.eq("city", cityFilter);
    }

    if (stateFilter) {
      query = query.eq("state", stateFilter);
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error("Admin care-seekers list error:", error);
      return NextResponse.json({ error: `Failed to fetch care seekers: ${error.message}` }, { status: 500 });
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / perPage);

    return NextResponse.json({ seekers: data ?? [], total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    console.error("Admin care-seekers list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
