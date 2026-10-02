import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyOrganicPage, normalizeOrganicPagePath } from "@/lib/analytics/content-pages";
import { reportingWindowUtc, validateCompleteWeek } from "./dates";
import {
  GA4_PROPERTY_ID,
  GROWTH_CHANNELS,
  GROWTH_DEFINITION_VERSION,
  GROWTH_TIMEZONE,
  GSC_SITE_URL,
  type GrowthGa4Metrics,
  type GrowthGscMetrics,
  type GrowthMarketplaceMetrics,
  type GrowthPageMetric,
  type GrowthSearchRow,
  type GrowthSnapshot,
} from "./types";

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface CollectOptions {
  weekStart: string;
  weekEnd: string;
  ga4Only?: boolean;
  db: SupabaseClient;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function readServiceAccount(): GoogleServiceAccount {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  let raw: string | null = null;

  if (inline) raw = inline;
  else if (encoded) raw = Buffer.from(encoded, "base64").toString("utf8");
  else {
    const configured = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const candidate = resolve(configured || "secrets/ga4-service-account.json");
    if (existsSync(candidate)) raw = readFileSync(candidate, "utf8");
  }

  if (!raw) {
    throw new Error(
      "Google credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_JSON in Vercel or place the read-only credential at secrets/ga4-service-account.json locally.",
    );
  }

  let parsed: GoogleServiceAccount;
  try {
    parsed = JSON.parse(raw) as GoogleServiceAccount;
  } catch {
    throw new Error("Google service-account credentials are not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google service-account credentials need client_email and private_key.");
  }
  return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

async function getGoogleAccessToken(): Promise<string> {
  const credentials = readServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ].join(" "),
      aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status}): ${await response.text()}`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Google token exchange returned no access token.");
  return payload.access_token;
}

async function googlePost<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Google API request failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

type Ga4Report = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

type Ga4LandingMetric = {
  path: string;
  users: number;
  sessions: number;
};

type PulledGa4 = {
  metrics: GrowthGa4Metrics;
  categorizedLandings: Ga4LandingMetric[];
};

async function pullGa4(token: string, weekStart: string, weekEnd: string): Promise<PulledGa4> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
  const dateRanges = [{ startDate: weekStart, endDate: weekEnd }];
  const overview = await googlePost<Ga4Report>(url, token, {
    dateRanges,
    metrics: ["totalUsers", "newUsers", "sessions", "averageSessionDuration", "engagementRate", "screenPageViews"].map((name) => ({ name })),
  });
  const values = overview.rows?.[0]?.metricValues?.map((metric) => Number(metric.value || 0));
  if (!values || values.length < 6) throw new Error("GA4 returned no overview row for the reporting week.");

  const organicFilter = {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: false },
    },
  };
  const [channelReport, organicSourcesReport, organicLandingsReport] = await Promise.all([
    googlePost<Ga4Report>(url, token, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 30,
    }),
    googlePost<Ga4Report>(url, token, {
      dateRanges,
      dimensionFilter: organicFilter,
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 15,
    }),
    googlePost<Ga4Report>(url, token, {
      dateRanges,
      dimensionFilter: organicFilter,
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
      limit: 10_000,
    }),
  ]);
  const allChannels = Object.fromEntries(
    (channelReport.rows || []).map((row) => [
      row.dimensionValues?.[0]?.value || "Unknown",
      Number(row.metricValues?.[0]?.value || 0),
    ]),
  );
  const channels = Object.fromEntries(GROWTH_CHANNELS.map((name) => [name, allChannels[name] || 0]));
  const organicSources = (organicSourcesReport.rows || []).map((row) => ({
    source_medium: row.dimensionValues?.[0]?.value || "Unknown",
    users: Number(row.metricValues?.[0]?.value || 0),
    sessions: Number(row.metricValues?.[1]?.value || 0),
  }));
  const allOrganicLandings = (organicLandingsReport.rows || [])
    .map((row) => ({
      path: row.dimensionValues?.[0]?.value || "Unknown",
      users: Number(row.metricValues?.[0]?.value || 0),
      sessions: Number(row.metricValues?.[1]?.value || 0),
    }))
    .filter((row) => row.path !== "(not set)");
  const organicLandings = allOrganicLandings.slice(0, 15);
  const categorizedLandings = allOrganicLandings.filter((row) => classifyOrganicPage(row.path));

  return {
    metrics: {
      overview: {
        total_users: values[0],
        new_users: values[1],
        sessions: values[2],
        average_session_duration_seconds: values[3],
        engagement_rate: values[4],
        page_views: values[5],
      },
      channels,
      organic: {
        sources: organicSources,
        landing_pages: organicLandings,
      },
    },
    categorizedLandings,
  };
}

type GscResponse = {
  rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
};

function normalizeSearchRow(row: NonNullable<GscResponse["rows"]>[number]): GrowthSearchRow {
  return {
    label: row.keys?.[0] || "",
    clicks: Math.round(row.clicks || 0),
    impressions: Math.round(row.impressions || 0),
    ctr: row.ctr || 0,
    position: row.position || 0,
  };
}

type PulledGsc = {
  metrics: GrowthGscMetrics;
  pages: GrowthSearchRow[];
};

async function pullGsc(token: string, weekStart: string, weekEnd: string): Promise<PulledGsc> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
  const query = (dimensions?: string[], rowLimit = 25) => googlePost<GscResponse>(url, token, {
    startDate: weekStart,
    endDate: weekEnd,
    dataState: "final",
    rowLimit,
    ...(dimensions ? { dimensions } : {}),
  });
  const [overview, queries, pages] = await Promise.all([
    query(undefined, 1),
    query(["query"], 1_000),
    query(["page"], 25_000),
  ]);
  const performance = normalizeSearchRow(overview.rows?.[0] || {});
  const normalizedQueries = (queries.rows || []).map(normalizeSearchRow);
  const queryMix = normalizedQueries.reduce(
    (mix, row) => {
      const key = /\bolera\b/i.test(row.label) ? "branded" : "non_branded";
      mix[`${key}_clicks`] += row.clicks;
      mix[`${key}_impressions`] += row.impressions;
      return mix;
    },
    {
      branded_clicks: 0,
      non_branded_clicks: 0,
      branded_impressions: 0,
      non_branded_impressions: 0,
    },
  );
  const classifiedClicks = queryMix.branded_clicks + queryMix.non_branded_clicks;
  const normalizedPages = (pages.rows || []).map(normalizeSearchRow);
  return {
    metrics: {
      performance: {
        clicks: performance.clicks,
        impressions: performance.impressions,
        ctr: performance.ctr,
        position: performance.position,
      },
      top_queries: normalizedQueries.slice(0, 15),
      top_pages: normalizedPages.slice(0, 15),
      query_mix: {
        ...queryMix,
        classified_click_coverage: performance.clicks > 0 ? Math.min(1, classifiedClicks / performance.clicks) : null,
      },
      data_state: "final",
    },
    pages: normalizedPages,
  };
}

function mergePageMetrics(
  weekStart: string,
  ga4Pages: Ga4LandingMetric[],
  gscPages: GrowthSearchRow[],
): GrowthPageMetric[] {
  type Accumulator = Omit<GrowthPageMetric, "search_ctr" | "search_position"> & {
    weighted_position: number;
  };
  const collectedAt = new Date().toISOString();
  const pages = new Map<string, Accumulator>();

  const rowFor = (rawPath: string) => {
    const pagePath = normalizeOrganicPagePath(rawPath);
    const pageCategory = pagePath ? classifyOrganicPage(pagePath) : null;
    if (!pagePath || !pageCategory) return null;
    const existing = pages.get(pagePath);
    if (existing) return existing;
    const created: Accumulator = {
      week_start: weekStart,
      page_path: pagePath,
      page_category: pageCategory,
      organic_users: 0,
      organic_sessions: 0,
      search_clicks: 0,
      search_impressions: 0,
      weighted_position: 0,
      collected_at: collectedAt,
    };
    pages.set(pagePath, created);
    return created;
  };

  for (const metric of ga4Pages) {
    const page = rowFor(metric.path);
    if (!page) continue;
    page.organic_users += metric.users;
    page.organic_sessions += metric.sessions;
  }
  for (const metric of gscPages) {
    const page = rowFor(metric.label);
    if (!page) continue;
    page.search_clicks += metric.clicks;
    page.search_impressions += metric.impressions;
    page.weighted_position += metric.position * metric.impressions;
  }

  return Array.from(pages.values())
    .filter((page) => page.organic_users >= 2 || page.search_clicks >= 2 || page.search_impressions >= 50)
    .map(({ weighted_position, ...page }) => ({
      ...page,
      search_ctr: page.search_impressions > 0 ? page.search_clicks / page.search_impressions : 0,
      search_position: page.search_impressions > 0 ? weighted_position / page.search_impressions : null,
    }));
}

async function exactCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>, label: string) {
  const result = await query;
  if (result.error) throw new Error(`${label} query failed: ${result.error.message}`);
  return result.count || 0;
}

async function pullMarketplace(
  db: SupabaseClient,
  weekStart: string,
  weekEnd: string,
  organicUsers: number,
): Promise<GrowthMarketplaceMetrics> {
  const { from, to } = reportingWindowUtc(weekStart, weekEnd);
  const [inquiries, questions, benefits, answerRows] = await Promise.all([
    exactCount(db.from("connections").select("id", { count: "exact", head: true }).eq("type", "inquiry").gte("created_at", from).lt("created_at", to), "Inquiries"),
    exactCount(db.from("provider_activity").select("id", { count: "exact", head: true }).eq("event_type", "question_received").gte("created_at", from).lt("created_at", to), "Questions"),
    exactCount(db.from("seeker_activity").select("id", { count: "exact", head: true }).eq("event_type", "benefits_completed").gte("created_at", from).lt("created_at", to), "Benefits completions"),
    db.from("provider_activity").select("provider_id").eq("event_type", "question_responded").gte("created_at", from).lt("created_at", to).limit(50_000),
  ]);
  if (answerRows.error) throw new Error(`Provider responses query failed: ${answerRows.error.message}`);
  const providersAnswering = new Set((answerRows.data || []).map((row) => row.provider_id).filter(Boolean)).size;
  return {
    inquiries,
    questions_asked: questions,
    benefits_completed: benefits,
    providers_answering_questions: providersAnswering,
    organic_users_to_inquiry_rate_directional: organicUsers > 0 ? inquiries / organicUsers : null,
  };
}

export interface GrowthCollection {
  snapshot: GrowthSnapshot;
  page_metrics: GrowthPageMetric[];
}

async function pullGoogleGrowth(token: string, weekStart: string, weekEnd: string, ga4Only = false) {
  const [ga4Result, gscResult] = await Promise.all([
    pullGa4(token, weekStart, weekEnd),
    ga4Only ? Promise.resolve(null) : pullGsc(token, weekStart, weekEnd),
  ]);
  return {
    ga4: ga4Result.metrics,
    gsc: gscResult?.metrics ?? null,
    pageMetrics: mergePageMetrics(weekStart, ga4Result.categorizedLandings, gscResult?.pages || []),
  };
}

export async function collectGrowthWeek(options: CollectOptions): Promise<GrowthCollection> {
  validateCompleteWeek(options.weekStart, options.weekEnd);
  const token = await getGoogleAccessToken();
  const google = await pullGoogleGrowth(token, options.weekStart, options.weekEnd, options.ga4Only);
  const marketplace = await pullMarketplace(
    options.db,
    options.weekStart,
    options.weekEnd,
    google.ga4.channels["Organic Search"] || 0,
  );
  return {
    snapshot: {
      week_start: options.weekStart,
      week_end: options.weekEnd,
      reporting_timezone: GROWTH_TIMEZONE,
      source: "google_supabase",
      definition_version: GROWTH_DEFINITION_VERSION,
      ga4: google.ga4,
      gsc: google.gsc,
      marketplace,
      source_status: { ga4: "available", gsc: google.gsc ? "available" : "skipped", supabase: "available" },
      anomalies: [],
      collected_at: new Date().toISOString(),
    },
    page_metrics: google.pageMetrics,
  };
}

/**
 * Page intelligence for any date ranges (Cortex's daily rolling read), one
 * token for all of them. The weekly path above stays week-validated; these
 * windows are not weeks, so they are only checked for shape and order.
 */
export async function collectPageMetricsForRanges(
  ranges: Array<{ start: string; end: string }>,
): Promise<GrowthPageMetric[][]> {
  for (const range of ranges) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end) || range.start > range.end) {
      throw new Error(`Invalid page-metrics range ${range.start}..${range.end}`);
    }
  }
  const token = await getGoogleAccessToken();
  return Promise.all(ranges.map(async (range) => (await pullGoogleGrowth(token, range.start, range.end)).pageMetrics));
}

/** Recollect page intelligence for an already-saved historical week. */
export async function collectGrowthPageMetrics(
  weekStart: string,
  weekEnd: string,
  ga4Only = false,
): Promise<GrowthPageMetric[]> {
  validateCompleteWeek(weekStart, weekEnd);
  const token = await getGoogleAccessToken();
  return (await pullGoogleGrowth(token, weekStart, weekEnd, ga4Only)).pageMetrics;
}
