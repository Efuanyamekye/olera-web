import { NextRequest, NextResponse } from "next/server";
import { getAdminUser, getAuthUser, getServiceClient } from "@/lib/admin";
import { CONTENT_PAGE_FILTERS } from "@/lib/analytics/content-pages";
import { P2_CHANNELS } from "@/lib/operating-map/providers.server";
import { CHANNEL_LABELS, classifyChannel } from "@/lib/analytics/channel";
import { cityFilterFromSlug, providerKeysInCity } from "@/lib/providers";

/**
 * GET /api/admin/operating-map/inspect?node=traffic&date_from&date_to&city
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
  traffic: {
    title: "All traffic",
    table: "page_events",
    select: "created_at, page, session_id, metadata",
    where: [
      "event_type is page_view",
      "counted once per visitor (olera_session cookie)",
      "internal QA traffic excluded",
    ],
    eventType: "page_view",
    cityScoped: true,
    summarize: (r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return `${String(r.page ?? "—")} · ${CHANNEL_LABELS[classifyChannel({
        referrer_class: m.referrer_class as string | null,
        utm_source: m.utm_source as string | null,
        utm_medium: m.utm_medium as string | null,
        gclid: m.gclid === true,
        ref: m.ref as string | null,
      })]}`;
    },
  },
  visits: {
    title: "Page visits — content pages",
    table: "page_events",
    select: "created_at, page, session_id, metadata",
    where: ["event_type is page_view", "session id is present"],
    eventType: "page_view",
    cityScoped: true,
    summarize: (r) => String(r.page ?? "—"),
  },
  s1a: {
    title: "Questions",
    table: "provider_question_asks",
    select: "created_at, provider_id, original_question",
    where: ["every row is one question submitted"],
    cityScoped: false,
    summarize: (r) => String(r.original_question ?? "").slice(0, 90) || "—",
  },
  s1b: {
    title: "Connections",
    table: "provider_activity",
    select: "created_at, event_type, provider_id",
    where: ["event_type is lead_received"],
    eventType: "lead_received",
    cityScoped: false,
    summarize: (r) => `Provider ${String(r.provider_id ?? "—")}`,
  },
  s2: {
    title: "Families in outreach",
    table: "email_log",
    select: "created_at, recipient, email_type",
    where: [
      "recipient is a family or seeker",
      "counted once per address, however many times we wrote",
    ],
    cityScoped: false,
    summarize: (r) =>
      `${String(r.recipient ?? "—")} · ${String(r.email_type ?? "email")}`,
  },
  p1: {
    title: "Unclaimed providers",
    table: "olera-providers",
    select: "created_at, provider_name, city, state",
    where: [
      "not deleted",
      "rows below are the whole directory; the count is the unclaimed half",
      "standing count — the date range does not apply",
    ],
    cityScoped: false,
    providerCityScoped: true,
    standing: true,
    summarize: (r) => `${String(r.provider_name ?? "—")} · ${String(r.city ?? "")}`,
  },
  p2: {
    // Sampled from email_log, the largest of the three channels. The others
    // are named in `where` so the sample never implies it is the whole story.
    title: "Providers in outreach",
    table: "email_log",
    select: "created_at, provider_id, email_type",
    where: [
      `counted across ${P2_CHANNELS.join(", ")}`,
      "recipient is a provider",
      "claimed providers excluded",
      "rows below are from email_log only",
    ],
    cityScoped: false,
    summarize: (r) =>
      `${String(r.provider_id ?? "—")} · ${String(r.email_type ?? "email")}`,
  },
  s3: {
    title: "Care seeker profiles",
    table: "business_profiles",
    select: "created_at, display_name, city, state",
    where: [
      "type is family",
      "every profile begun, finished or not",
      "created in this range",
    ],
    cityScoped: false,
    providerCityScoped: true,
    summarize: (r) => `${String(r.display_name ?? "—")} · ${String(r.city ?? "")}`,
  },
  p3: {
    title: "Provider profiles claimed",
    table: "provider_activity",
    select: "created_at, provider_id, event_type",
    where: ["event_type is claim_completed"],
    eventType: "claim_completed",
    cityScoped: false,
    summarize: (r) => `Provider ${String(r.provider_id ?? "—")}`,
  },
  p4: {
    title: "Managed ad signups",
    table: "ad_campaign_requests",
    select: "created_at, provider_id, status",
    where: ["every row is one campaign request"],
    cityScoped: false,
    summarize: (r) =>
      `${String(r.provider_id ?? "—")} · ${String(r.status ?? "")}`,
  },
  p5: {
    title: "Provider staffing signups",
    table: "staffing_touchpoints",
    select: "created_at, outreach_id, type",
    where: ["type is system_activated — the provider activated staffing"],
    cityScoped: false,
    summarize: (r) => `Outreach ${String(r.outreach_id ?? "—")}`,
  },
  w3: {
    title: "Care worker applications started",
    table: "business_profiles",
    select: "created_at, display_name, city, state, is_active",
    where: [
      "type is student — the stored name for a care worker",
      "every application begun, finished or not",
      "created in this range",
    ],
    cityScoped: false,
    providerCityScoped: true,
    summarize: (r) =>
      `${String(r.display_name ?? "—")} · ${r.is_active ? "complete" : "started"}`,
  },
  w1: {
    title: "Universities targeted",
    table: "student_outreach_campuses",
    select: "created_at, name, city, state",
    where: ["campus is active", "standing count — the date range does not apply"],
    cityScoped: false,
    providerCityScoped: true,
    standing: true,
    summarize: (r) => `${String(r.name ?? "—")} · ${String(r.city ?? "")}`,
  },
  w2: {
    title: "Advisors in outreach",
    table: "student_outreach_contacts",
    select: "created_at, name, title, outreach_id",
    where: [
      "contact record is active",
      "at a targeted university, reached through student_outreach",
      "rows below are all active advisors; the count is those with a touchpoint",
      "standing count — the date range does not apply",
    ],
    cityScoped: false,
    standing: true,
    summarize: (r) =>
      `${String(r.name ?? "—")}${r.title ? ` · ${String(r.title)}` : ""}`,
  },
  s4: {
    title: "Families moving forward with a benefit",
    table: "seeker_activity",
    select: "created_at, event_type, metadata",
    where: [
      "event_type is benefits_outcome_reported",
      "the family answered the check-in with \"moving forward\"",
      "self-reported, so this is a floor",
    ],
    eventType: "benefits_outcome_reported",
    cityScoped: false,
    summarize: () => "Reported moving forward",
  },
  sp1: {
    // Sampled as inquiries; Connected is decided in code from six signals,
    // none of them a column, so the rows below are the pool it is drawn from.
    title: "Family–provider connected",
    table: "connections",
    select: "created_at, to_profile_id, status, metadata",
    where: [
      "type is inquiry",
      "counted as Connected by the same rule the Connections page uses",
      "rows below are the inquiries that rule is applied to",
    ],
    cityScoped: false,
    summarize: (r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const override = meta.admin_override as { status?: string } | undefined;
      const signal =
        override?.status === "connected"
          ? "admin marked connected"
          : meta.family_confirmed === true
            ? "family confirmed"
            : meta.provider_confirmed === true
              ? "provider confirmed"
              : Array.isArray(meta.thread) && meta.thread.length > 0
                ? "has a thread"
                : "no reply yet";
      return `${String(r.to_profile_id ?? "—")} · ${signal}`;
    },
  },
  pw1: {
    title: "Interviews scheduled",
    table: "interviews",
    select: "created_at, status",
    where: ["status is confirmed or completed — a time was agreed"],
    cityScoped: false,
    summarize: (r) => `Interview · ${String(r.status ?? "")}`,
  },
  pw2: {
    title: "Hires confirmed",
    table: "medjobs_placements",
    select: "created_at, status",
    where: ["status is accepted or confirmed"],
    cityScoped: false,
    summarize: (r) => `Placement · ${String(r.status ?? "")}`,
  },
  s1c: {
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
    if (node === "s3") query = query.eq("type", "family");
    if (node === "w3") query = query.eq("type", "student");
    if (node === "p5") query = query.eq("type", "system_activated");
    if (node === "w1") query = query.eq("is_active", true);
    if (node === "w2") query = query.eq("status", "active");
    if (node === "sp1") query = query.eq("type", "inquiry");
    if (node === "pw1") query = query.in("status", ["confirmed", "completed"]);
    if (node === "pw2") query = query.in("status", ["accepted", "confirmed"]);
    if (node === "s2") {
      query = query.in("recipient_type", ["family", "seeker"]);
    }
    if (node === "p2") {
      query = query.eq("recipient_type", "provider").not("provider_id", "is", null);
    }
    if (node === "traffic") {
      // Same two surfaces the count is scoped to, so the sample cannot show
      // a page the number never counted.
      query = query.or(
        `${CONTENT_PAGE_FILTERS.benefit},${CONTENT_PAGE_FILTERS.guide}`,
      );
      where.push("benefits and editorial pages (provider pages counted separately)");
    }
    if (node === "visits") {
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
