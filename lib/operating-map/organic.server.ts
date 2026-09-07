import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CR1, CR2, CR3 — where the care recipient traffic came from.
 *
 * All three are counted the same way from the same rows, differing only in
 * which arrivals they keep:
 *
 *   CR1  direct    referrer_class = "direct"        no referring site
 *   CR2  organic   referrer_class = "search"        a search engine
 *   CR3  paid      utm_source     = "olera_managed" an Ad Boost link
 *
 * Counting all three from Olera's own page events rather than from GA is
 * deliberate. They feed CR4, and CR4 is these same rows; a chip pulled from
 * GA would use GA's identity model, GA's bot filtering and GA's week
 * boundaries, and could never be reconciled against the box it points at.
 * GA stays the external cross-check on /admin/organic-growth, which is the
 * right job for it.
 *
 * The three do not add up to everyone. Social, AI-chat and other referrals
 * reach CR4 without appearing in any chip, and paid traffic outside Ad Boost
 * carries no managed UTM. The tooltips say so.
 *
 * "Organic" is `referrer_class = 'search'`, the same bucket GA calls Organic
 * Search. AI chat referrals are classified separately by
 * `lib/analytics/referrer.ts` and are deliberately NOT counted here, so this
 * number stays comparable to the GA figure it is meant to be read against.
 *
 * "Visitors", precisely: distinct `olera_session` ids. That cookie is a
 * 30-day sliding id (see lib/analytics/session.ts), so it identifies a
 * returning person, not a GA-style 30-minute session. Compare this to GA4
 * Organic Search *users*; comparing it to GA sessions will always read low,
 * because one person visiting twice in a day is two sessions and one visitor.
 *
 * The population is the same one CR4 covers — provider pages plus the
 * editorial and benefits content pages — which the platform splits across two
 * tables with two different shapes:
 *
 *   provider_activity  visitor id in metadata->>session_id
 *   page_events        visitor id in a top-level session_id column
 *
 * Ids are unioned across both, so someone who read a benefits guide and then
 * a provider page counts once.
 */

/** What separates the three sources, as stored on a page view. */
type Arrival =
  | { field: "referrer_class"; value: "search" | "direct" }
  | { field: "utm_source"; value: "olera_managed" };

const ORGANIC: Arrival = { field: "referrer_class", value: "search" };
const DIRECT: Arrival = { field: "referrer_class", value: "direct" };
/**
 * Paid is identified by the Ad Boost UTM, not by a referrer class — there is
 * no paid class, and page views carry no utm_medium or gclid to infer one
 * from. So this counts the paid traffic WE ran, which is what the node means
 * today; paid traffic bought outside Ad Boost would not appear.
 */
const PAID: Arrival = { field: "utm_source", value: "olera_managed" };

const PAGE_SIZE = 1000;

/**
 * Ceiling on rows scanned per table. Distinct sessions cannot be counted in
 * the database through PostgREST, so the rows have to come back to be
 * de-duplicated here. If this trips the result is a floor and says so.
 */
const MAX_ROWS = 150_000;

/**
 * The date `lib/analytics/referrer.ts` shipped. Page views recorded before
 * this carry no `referrer_class`, so they can never match and simply do not
 * count. A range reaching back past this looks like a collapse in organic
 * traffic when it is really the absence of instrumentation — callers must
 * surface `partialInstrumentation` rather than present the number bare.
 */
export const REFERRER_INSTRUMENTATION_START = "2026-08-12";

/**
 * The date visitor city started being recorded on page events. Before this
 * no event carries a city, so a city-scoped count over an earlier range is
 * structurally zero rather than genuinely quiet.
 */
export const VISITOR_GEO_START = "2026-09-06";

export interface OrganicVisitors {
  /** Distinct visitors with at least one matching page view. */
  value: number;
  /** A row ceiling was hit, so `value` is a floor. */
  truncated: boolean;
  /** The range reaches back before referrer classification existed. */
  partialInstrumentation: boolean;
  /** The range reaches back before visitor city was recorded. */
  partialCityData: boolean;
}

async function collectSessions(
  db: SupabaseClient,
  table: "provider_activity" | "page_events",
  arrival: Arrival,
  sessions: Set<string>,
  from: string | null,
  to: string | null,
  citySlug: string | null,
): Promise<boolean> {
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) return true;

    // Both tables keep referrer_class in metadata; only the session id moved.
    // Aliasing the JSON path keeps the payload to one short string per row
    // instead of dragging the whole metadata object back.
    let query = db
      .from(table)
      .select(table === "page_events" ? "sid:session_id" : "sid:metadata->>session_id")
      .eq("event_type", "page_view")
      .filter(`metadata->>${arrival.field}`, "eq", arrival.value);

    // Visitor city, recorded from Vercel's edge headers since VISITOR_GEO_START.
    if (citySlug) query = query.filter("metadata->>geo_city", "eq", citySlug);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as { sid: string | null }[];
    if (rows.length === 0) return false;

    for (const row of rows) {
      if (typeof row.sid === "string" && row.sid.length > 0) sessions.add(row.sid);
    }

    scanned += rows.length;
    if (rows.length < PAGE_SIZE) return false;
  }
}

/**
 * Distinct organic visitors in a date range, optionally in one city.
 *
 * The city is the visitor's own location, resolved at the edge — not the
 * market a page is about. Someone in Chicago reading about Houston providers
 * counts as Chicago.
 */
async function countVisitors(
  db: SupabaseClient,
  arrival: Arrival,
  range: { from: string | null; to: string | null },
  citySlug: string | null,
): Promise<OrganicVisitors> {
  const sessions = new Set<string>();

  const truncatedProvider = await collectSessions(
    db,
    "provider_activity",
    arrival,
    sessions,
    range.from,
    range.to,
    citySlug,
  );
  const truncatedContent = await collectSessions(
    db,
    "page_events",
    arrival,
    sessions,
    range.from,
    range.to,
    citySlug,
  );

  return {
    value: sessions.size,
    truncated: truncatedProvider || truncatedContent,
    // Only the referrer-class sources depend on that instrumentation. A
    // managed UTM has been on the link since the campaign was built.
    partialInstrumentation:
      arrival.field === "referrer_class" &&
      (!range.from || range.from < REFERRER_INSTRUMENTATION_START),
    partialCityData:
      Boolean(citySlug) && (!range.from || range.from < VISITOR_GEO_START),
  };
}

export function getOrganicVisitors(
  db: SupabaseClient,
  range: { from: string | null; to: string | null },
  citySlug: string | null = null,
): Promise<OrganicVisitors> {
  return countVisitors(db, ORGANIC, range, citySlug);
}

/** CR1 — arrivals with no referring site: typed in, bookmarked, or untracked. */
export function getDirectVisitors(
  db: SupabaseClient,
  range: { from: string | null; to: string | null },
  citySlug: string | null = null,
): Promise<OrganicVisitors> {
  return countVisitors(db, DIRECT, range, citySlug);
}

/** CR3 — arrivals on an Ad Boost link. */
export function getPaidVisitors(
  db: SupabaseClient,
  range: { from: string | null; to: string | null },
  citySlug: string | null = null,
): Promise<OrganicVisitors> {
  return countVisitors(db, PAID, range, citySlug);
}
