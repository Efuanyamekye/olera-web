import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient, logAuditAction } from "@/lib/admin";
import { MOBILE_NAV_VARIANTS } from "@/lib/analytics/mobile-nav-variant";

/**
 * Sessions table for mobile nav variant A/B test drill-in.
 *
 * Tracks provider sessions that saw a specific mobile nav variant,
 * with downstream conversion stages:
 *   impression  -> saw the mobile nav variant
 *   converted   -> had a downstream conversion (question, lead, review, boost)
 */

export type MobileNavSessionRow = {
  session_id: string;          // provider_id used as session identifier
  furthest_stage: "impression" | "converted";
  provider_name: string | null;
  provider_slug: string | null;
  first_seen: string;          // ISO timestamp of first impression
  conversion_type: string | null; // e.g., "question", "lead", "review", "boost"
};

export type MobileNavSessionsResponse = {
  variant: string;
  total: number;
  sessions: MobileNavSessionRow[];
};

const VALID_VARIANTS = new Set(MOBILE_NAV_VARIANTS);

function parseLimit(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, n));
}

function parseOffset(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * GET /api/admin/analytics/mobile-nav-variant-sessions
 *
 * Drill-in for one A/B arm in the mobile nav variant funnel.
 * Returns provider sessions bucketed by variant with conversion stage.
 *
 * Query params:
 *   variant   "current" | "bottom_tabs"
 *   date_from ISO timestamp (inclusive). Omit for last 30 days.
 *   date_to   ISO timestamp (exclusive). Omit for "up to now."
 *   stage     "impression" | "converted" - filter by stage
 *   limit     1-200, default 50
 *   offset    >= 0, default 0 (pagination cursor)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const sp = request.nextUrl.searchParams;
    const variant = sp.get("variant") || "";
    if (!VALID_VARIANTS.has(variant as typeof MOBILE_NAV_VARIANTS[number])) {
      return NextResponse.json({ error: "Invalid variant" }, { status: 400 });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = sp.get("date_from") || defaultFrom.toISOString();
    const to = sp.get("date_to") || now.toISOString();
    const limit = parseLimit(sp.get("limit"));
    const offset = parseOffset(sp.get("offset"));
    const stageFilter = sp.get("stage") as "impression" | "converted" | null;

    const db = getServiceClient();

    // Get all mobile nav variant impressions for this variant
    const { data: impressions, error: impError } = await db
      .from("provider_activity")
      .select("provider_id, created_at, metadata")
      .eq("event_type", "mobile_nav_variant_impression")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(10000);

    if (impError) {
      console.error("[mobile-nav-variant-sessions] impression query failed:", impError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    // Filter to this variant and build session map (keyed by provider_id)
    const sessions = new Map<string, MobileNavSessionRow>();

    for (const row of impressions ?? []) {
      const meta = row.metadata as Record<string, unknown> | null;
      if (meta?.variant !== variant) continue;

      const providerId = row.provider_id;
      if (!providerId) continue;

      if (!sessions.has(providerId)) {
        sessions.set(providerId, {
          session_id: providerId,
          furthest_stage: "impression",
          provider_name: null,
          provider_slug: null,
          first_seen: row.created_at,
          conversion_type: null,
        });
      } else {
        const existing = sessions.get(providerId)!;
        if (row.created_at < existing.first_seen) {
          existing.first_seen = row.created_at;
        }
      }
    }

    // Get conversion events for these providers
    const providerIds = [...sessions.keys()];
    if (providerIds.length > 0) {
      const { data: conversions, error: convError } = await db
        .from("provider_activity")
        .select("provider_id, event_type, created_at")
        .in("provider_id", providerIds)
        .in("event_type", [
          "question_responded",
          "continue_in_inbox",
          "phone_clicked",
          "email_link_clicked",
          "reviews_cta_clicked",
          "managed_ads_requested",
        ])
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false })
        .limit(10000);

      if (convError) {
        console.error("[mobile-nav-variant-sessions] conversion query failed:", convError);
      } else {
        for (const conv of conversions ?? []) {
          const session = sessions.get(conv.provider_id);
          if (session && session.furthest_stage !== "converted") {
            session.furthest_stage = "converted";
            // Map event type to friendly conversion type
            const typeMap: Record<string, string> = {
              question_responded: "question",
              continue_in_inbox: "lead",
              phone_clicked: "lead",
              email_link_clicked: "lead",
              reviews_cta_clicked: "review",
              managed_ads_requested: "boost",
            };
            session.conversion_type = typeMap[conv.event_type] || conv.event_type;
          }
        }
      }

      // Get provider names/slugs
      const { data: profiles } = await db
        .from("business_profiles")
        .select("id, display_name, slug")
        .in("id", providerIds)
        .limit(providerIds.length);

      if (profiles) {
        for (const p of profiles) {
          const session = sessions.get(p.id);
          if (session) {
            session.provider_name = p.display_name;
            session.provider_slug = p.slug;
          }
        }
      }
    }

    // Sort by first_seen descending and apply filters/pagination
    let all = [...sessions.values()].sort((a, b) =>
      a.first_seen < b.first_seen ? 1 : a.first_seen > b.first_seen ? -1 : 0,
    );

    if (stageFilter) {
      all = all.filter((s) => s.furthest_stage === stageFilter);
    }

    const total = all.length;
    const slice = all.slice(offset, offset + limit);

    return NextResponse.json({
      variant,
      total,
      sessions: slice,
    });
  } catch (err) {
    console.error("[admin/analytics/mobile-nav-variant-sessions] uncaught:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/analytics/mobile-nav-variant-sessions
 *
 * Hard-deletes a provider's mobile nav variant tracking events.
 * Used for cleaning up admin/test traffic.
 *
 * Body: { provider_id: string, variant: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const adminUser = await getAdminUser(user.id);
    if (!adminUser) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    let body: { provider_id?: unknown; variant?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const providerId = typeof body.provider_id === "string" ? body.provider_id : "";
    const variant = typeof body.variant === "string" ? body.variant : "";

    if (!providerId) {
      return NextResponse.json({ error: "provider_id required" }, { status: 400 });
    }
    if (!VALID_VARIANTS.has(variant as typeof MOBILE_NAV_VARIANTS[number])) {
      return NextResponse.json({ error: "Invalid variant" }, { status: 400 });
    }

    const db = getServiceClient();
    const deleted: Record<string, number> = {};
    const errors: Array<{ table: string; message: string }> = [];

    // Delete mobile_nav_variant_impression events for this provider + variant
    {
      const { error, count } = await db
        .from("provider_activity")
        .delete({ count: "exact" })
        .eq("event_type", "mobile_nav_variant_impression")
        .eq("provider_id", providerId)
        .filter("metadata->>variant", "eq", variant);

      if (error) {
        console.error("[mobile-nav-variant-sessions DELETE] impressions:", error);
        errors.push({ table: "provider_activity (impressions)", message: error.message });
      } else {
        deleted.impressions = count ?? 0;
      }
    }

    if (errors.length > 0) {
      await logAuditAction({
        adminUserId: adminUser.id,
        action: "mobile_nav_variant_session_delete_failed",
        targetType: "mobile_nav_variant_session",
        targetId: providerId,
        details: { variant, deleted, errors },
      });
      return NextResponse.json(
        { error: `Delete failed: ${errors.map((e) => e.table).join(", ")}`, deleted, errors },
        { status: 500 },
      );
    }

    await logAuditAction({
      adminUserId: adminUser.id,
      action: "mobile_nav_variant_session_deleted",
      targetType: "mobile_nav_variant_session",
      targetId: providerId,
      details: { variant, deleted },
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("[admin/analytics/mobile-nav-variant-sessions] DELETE failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
