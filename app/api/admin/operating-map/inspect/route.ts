import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { CONTENT_PAGE_FILTERS } from "@/lib/analytics/content-pages";
import { CP2_CHANNELS } from "@/lib/operating-map/providers.server";
import { cityFilterFromSlug, providerKeysInCity } from "@/lib/providers";

/**
 * GET /api/admin/operating-map/inspect?node=cr2&date_from&date_to&city
 *
 * The receipts behind one number on the operating map: which table it came
 * from, exactly which rows were counted, and the most recent handful with
 * timestamps.
 *
 * This exists so a number on the map can be checked rather than trusted.
 * Every figure on that page is one query against one table, and anyone who
 * doubts a value should be able to see the query in words and the rows
 * underneath it without asking an engineer.
 */

export const dynamic = "force-dynamic";

const SAMPLE_SIZE = 8;

/**
 * How many recent rows a city-narrowed sample reads before filtering. Enough
 * that a city with real activity still fills the sample, small enough that
 * the page stays a page.
 */
const KEY_SCOPED_SCAN = 500;

/**
 * One descriptor per instrumented node. Adding a node to the map means
 * adding it here too — a number nobody can inspect is exactly the kind this
 * page is meant to stop producing.
 */
const SOURCES: Record<
  string,
  {
    title: string;
    table: string;
    select: string;
    where: string[];
    eventType?: string;
    contentFilter?: string;
    /** These nodes count page views, so the VISITOR's city applies. */
    cityScoped: boolean;
    /** These sit on provider rows, so the PROVIDER's city applies instead. */
    providerCityScoped?: boolean;
    /** Rows without a created_at order by this instead. */
    orderColumn?: string;
    /** Describes the world as it is now, so a date range would mislead. */
    standing?: boolean;
    /**
     * Keyed by a provider that has no city column of its own, so a city
     * filter has to be applied to the rows after they come back.
     */
    providerKeyScoped?: string;
    summarize: (row: Record<string, unknown>) => string;
  }
> = {
  cr2: {
    title: "Organic visitors",
    table: "page_events",
    select: "created_at, page, session_id, metadata",
    where: [
      "event_type is page_view",
      "referrer_class is search",
      "counted once per visitor (olera_session cookie)",
    ],
    eventType: "page_view",
    cityScoped: true,
    summarize: (r) => String(r.page ?? "—"),
  },
  cr4: {
    title: "Page visits — content pages",
    table: "page_events",
    select: "created_at, page, session_id, metadata",
    where: ["event_type is page_view", "session id is present"],
    eventType: "page_view",
    cityScoped: true,
    summarize: (r) => String(r.page ?? "—"),
  },
  cr6a: {
    title: "Questions",
    table: "provider_question_asks",
    select: "created_at, provider_id, original_question",
    where: ["every row is one question submitted"],
    cityScoped: false,
    summarize: (r) => String(r.original_question ?? "").slice(0, 90) || "—",
  },
  cr6b: {
    title: "Connections",
    table: "provider_activity",
    select: "created_at, event_type, provider_id",
    where: ["event_type is lead_received"],
    eventType: "lead_received",
    cityScoped: false,
    summarize: (r) => `Provider ${String(r.provider_id ?? "—")}`,
  },
  flow_questions: {
    title: "Questions that reached a provider",
    table: "email_log",
    select: "created_at, recipient, provider_id, email_type, status",
    where: [
      "email_type is question_received",
      "recipient is a provider",
      "status is sent — the send came back successful",
    ],
    cityScoped: false,
    providerKeyScoped: "provider_id",
    summarize: (r) =>
      `${String(r.recipient ?? "—")} · ${String(r.provider_id ?? "")}`,
  },
  flow_connections: {
    title: "Connection requests that reached a provider",
    table: "email_log",
    select: "created_at, recipient, provider_id, email_type, status",
    where: [
      "email_type is connection_request",
      "recipient is a provider",
      "status is sent — the send came back successful",
    ],
    cityScoped: false,
    providerKeyScoped: "provider_id",
    summarize: (r) =>
      `${String(r.recipient ?? "—")} · ${String(r.provider_id ?? "")}`,
  },
  cp1: {
    title: "Providers listed",
    table: "olera-providers",
    select: "created_at, provider_name, city, state",
    where: ["not deleted", "standing count — the date range does not apply"],
    cityScoped: false,
    providerCityScoped: true,
    standing: true,
    summarize: (r) => `${String(r.provider_name ?? "—")} · ${String(r.city ?? "")}`,
  },
  cp2: {
    // Sampled from email_log, the largest of the three channels. The others
    // are named in `where` so the sample never implies it is the whole story.
    title: "Providers in outreach",
    table: "email_log",
    select: "created_at, provider_id, email_type",
    where: [
      `counted across ${CP2_CHANNELS.join(", ")}`,
      "recipient is a provider",
      "claimed providers excluded",
      "rows below are from email_log only",
    ],
    cityScoped: false,
    summarize: (r) =>
      `${String(r.provider_id ?? "—")} · ${String(r.email_type ?? "email")}`,
  },
  m1: {
    title: "Care recipient profiles live",
    table: "business_profiles",
    select: "created_at, display_name, city, state",
    where: [
      "type is family",
      "profile is active",
      "care post is published",
      "created in this range",
    ],
    cityScoped: false,
    providerCityScoped: true,
    summarize: (r) => `${String(r.display_name ?? "—")} · ${String(r.city ?? "")}`,
  },
  m2: {
    title: "Provider profiles claimed",
    table: "provider_activity",
    select: "created_at, provider_id, event_type",
    where: ["event_type is claim_completed"],
    eventType: "claim_completed",
    cityScoped: false,
    summarize: (r) => `Provider ${String(r.provider_id ?? "—")}`,
  },
  m3: {
    title: "Managed ad signups",
    table: "ad_campaign_requests",
    select: "created_at, provider_id, status",
    where: ["every row is one campaign request"],
    cityScoped: false,
    summarize: (r) =>
      `${String(r.provider_id ?? "—")} · ${String(r.status ?? "")}`,
  },
  m4: {
    title: "Provider staffing signups",
    table: "staffing_touchpoints",
    select: "created_at, outreach_id, type",
    where: ["type is system_activated — the provider activated staffing"],
    cityScoped: false,
    summarize: (r) => `Outreach ${String(r.outreach_id ?? "—")}`,
  },
  m5: {
    title: "Care worker profiles completed",
    table: "business_profiles",
    select: "created_at, display_name, city, state",
    where: [
      "type is student — the stored name for a care worker",
      "profile is active, which happens when the intro video lands",
      "created in this range",
    ],
    cityScoped: false,
    providerCityScoped: true,
    summarize: (r) => `${String(r.display_name ?? "—")} · ${String(r.city ?? "")}`,
  },
  cw1: {
    title: "Universities listed",
    table: "student_outreach_campuses",
    select: "created_at, name, city, state",
    where: ["campus is active", "standing count — the date range does not apply"],
    cityScoped: false,
    providerCityScoped: true,
    standing: true,
    summarize: (r) => `${String(r.name ?? "—")} · ${String(r.city ?? "")}`,
  },
  cw2: {
    title: "Advisors listed",
    table: "student_outreach_contacts",
    select: "created_at, name, title, outreach_id",
    where: [
      "contact record is active",
      "at a listed university, reached through student_outreach",
      "standing count — the date range does not apply",
    ],
    cityScoped: false,
    standing: true,
    summarize: (r) =>
      `${String(r.name ?? "—")}${r.title ? ` · ${String(r.title)}` : ""}`,
  },
  tb1: {
    title: "Connection confirmed",
    table: "connections",
    select: "created_at, to_profile_id, status",
    where: ["type is inquiry", "status is responded"],
    cityScoped: false,
    summarize: (r) => `${String(r.to_profile_id ?? "—")} · ${String(r.status ?? "")}`,
  },
  tc1: {
    title: "Interviews confirmed",
    table: "interviews",
    select: "created_at, status",
    where: ["status is confirmed", "attendance itself is not recorded"],
    cityScoped: false,
    summarize: (r) => `Interview · ${String(r.status ?? "")}`,
  },
  tc2: {
    title: "Hires confirmed",
    table: "medjobs_placements",
    select: "created_at, status",
    where: ["status is accepted or confirmed"],
    cityScoped: false,
    summarize: (r) => `Placement · ${String(r.status ?? "")}`,
  },
  cr6c: {
    title: "Benefits Assessment",
    table: "seeker_activity",
    select: "created_at, event_type, related_provider_id",
    where: ["event_type is benefits_completed"],
    eventType: "benefits_completed",
    cityScoped: false,
    summarize: () => "Benefits screener completed",
  },
};

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
    const node = searchParams.get("node") ?? "";
    const from = searchParams.get("date_from");
    const to = searchParams.get("date_to");
    const city = searchParams.get("city");

    const source = SOURCES[node];
    if (!source) {
      return NextResponse.json(
        { error: "That node cannot be inspected yet." },
        { status: 404 },
      );
    }

    const db = getServiceClient();

    /*
     * Rows keyed by a provider carry no city of their own, so narrowing them
     * means holding the city's provider keys and testing each row. That
     * cannot be done in the query — a city can hold thousands of keys and
     * PostgREST carries filters in the URL — so those nodes read a wider
     * slice and cut it down here.
     */
    const keyScoped = Boolean(city && source.providerKeyScoped);
    const keys = keyScoped ? await providerKeysInCity(db, city!) : null;

    let query = db
      .from(source.table)
      .select(source.select)
      .order(source.orderColumn ?? "created_at", { ascending: false })
      .limit(keyScoped ? KEY_SCOPED_SCAN : SAMPLE_SIZE);

    const where = [...source.where];
    if (source.eventType) query = query.eq("event_type", source.eventType);
    if (node === "m1") {
      query = query
        .eq("type", "family")
        .eq("is_active", true)
        .contains("metadata", { care_post: { status: "active" } });
    }
    if (node === "m5") query = query.eq("type", "student").eq("is_active", true);
    if (node === "m4") query = query.eq("type", "system_activated");
    if (node === "cw1") query = query.eq("is_active", true);
    if (node === "cw2") query = query.eq("status", "active");
    if (node === "tb1") query = query.eq("type", "inquiry").eq("status", "responded");
    if (node === "tc1") query = query.eq("status", "confirmed");
    if (node === "tc2") query = query.in("status", ["accepted", "confirmed"]);
    if (node === "cp2") {
      query = query.eq("recipient_type", "provider").not("provider_id", "is", null);
    }
    if (node === "flow_questions" || node === "flow_connections") {
      query = query
        .eq(
          "email_type",
          node === "flow_questions" ? "question_received" : "connection_request",
        )
        .eq("recipient_type", "provider")
        .eq("status", "sent");
    }
    if (node === "cr2") {
      query = query.filter("metadata->>referrer_class", "eq", "search");
    }
    if (node === "cr4") {
      query = query.or(
        `${CONTENT_PAGE_FILTERS.benefit},${CONTENT_PAGE_FILTERS.guide}`,
      );
      where.push("benefits and editorial pages (provider pages counted separately)");
    }
    if (keyScoped) {
      // Named here so the sample never claims a scope it did not apply.
      where.push(`narrowed to providers in ${city}`);
    } else if (city && source.providerCityScoped) {
      const f = cityFilterFromSlug(city);
      if (f) {
        query = query.in("city", f.names).eq("state", f.state);
        // Reads the row's own city column, which on a profile is the
        // person's city and on a provider is the provider's.
        where.push(`city is ${f.names.join(" / ")}, ${f.state}`);
      }
    } else if (city && source.cityScoped) {
      query = query.filter("metadata->>geo_city", "eq", city);
      where.push(`visitor city is ${city}`);
    } else if (city) {
      where.push("city filter does not apply — city is only recorded on page views");
    }
    // Standing counts describe the directory as it is now, so a date range
    // would describe a different thing than the number above them.
    const dated = !source.standing;
    if (dated && from) query = query.gte("created_at", from);
    if (dated && to) query = query.lt("created_at", to);

    const { data, error } = await query;
    if (error) throw error;

    let raw = (data ?? []) as unknown as Record<string, unknown>[];
    if (keys) {
      const field = source.providerKeyScoped!;
      raw = raw.filter((r) => {
        const key = r[field];
        return typeof key === "string" && keys.has(key);
      });
    }

    const rows = raw.slice(0, SAMPLE_SIZE).map((r) => ({
      when: String(r.created_at ?? r.stage_changed_at ?? ""),
      summary: source.summarize(r),
    }));

    return NextResponse.json({
      node,
      title: source.title,
      table: source.table,
      where,
      window: { from, to },
      rows,
      // A node whose sample is empty over a range with a non-zero count is
      // itself a signal worth seeing, so this is never dressed up.
      note:
        rows.length === 0
          ? "No matching rows in this window."
          : `Most recent ${rows.length} matching rows.`,
    });
  } catch (error) {
    console.error("[operating-map/inspect] Failed:", error);
    return NextResponse.json({ error: "Failed to load rows" }, { status: 500 });
  }
}
