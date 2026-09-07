import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_PAGE_FILTERS } from "@/lib/analytics/content-pages";

/**
 * CR4 — page visits, split by the three surfaces the card names.
 *
 * Page views, not visitors: CR2 above already counts people. This is the
 * volume those people generated, so the two nodes measure different things
 * rather than restating each other.
 *
 * All traffic, not just organic. CR1, CR2 and CR3 converge into this node on
 * the map, so it has to be the total those three sum to — scoping it to
 * search would make the arrow from CR1 a lie.
 *
 * The three surfaces live in two tables:
 *
 *   provider   provider_activity   one row per provider page view
 *   benefits   page_events         /benefits/** and the /senior-benefits hub
 *   editorial  page_events         /caregiver-support/**
 *
 * The rules come from `lib/analytics/content-pages.ts`, the same constants
 * the admin Overview and its trend line read, so a page can never be counted
 * on one surface and missed on the other.
 *
 * A non-empty session id is required, matching how network-health counts
 * provider and content page views. Without it these numbers would not line up
 * with the Overview cards showing the same thing.
 */

export interface PageVisits {
  total: number;
  provider: number;
  benefit: number;
  editorial: number;
}

/** Count rows without fetching them. Cheap enough to run per surface. */
async function countPageViews(
  db: SupabaseClient,
  table: "provider_activity" | "page_events",
  range: { from: string | null; to: string | null },
  citySlug: string | null,
  contentFilter?: string,
): Promise<number> {
  let query = db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("event_type", "page_view");

  // The session id moved between the two tables; the requirement did not.
  if (table === "page_events") {
    query = query.not("session_id", "is", null).neq("session_id", "");
  } else {
    query = query
      .not("metadata->>session_id", "is", null)
      .neq("metadata->>session_id", "");
  }

  if (contentFilter) query = query.or(contentFilter);
  // Visitor city, recorded from Vercel's edge headers. Forward-only.
  if (citySlug) query = query.filter("metadata->>geo_city", "eq", citySlug);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lt("created_at", range.to);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Page visits in a date range, optionally for one visitor city. */
export async function getPageVisits(
  db: SupabaseClient,
  range: { from: string | null; to: string | null },
  citySlug: string | null = null,
): Promise<PageVisits> {
  const [provider, benefit, editorial] = await Promise.all([
    countPageViews(db, "provider_activity", range, citySlug),
    countPageViews(db, "page_events", range, citySlug, CONTENT_PAGE_FILTERS.benefit),
    countPageViews(db, "page_events", range, citySlug, CONTENT_PAGE_FILTERS.guide),
  ]);

  return { total: provider + benefit + editorial, provider, benefit, editorial };
}
