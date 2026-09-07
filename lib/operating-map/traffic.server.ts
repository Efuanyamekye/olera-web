import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_PAGE_FILTERS } from "@/lib/analytics/content-pages";
import {
  CHANNELS,
  CHANNEL_SIGNALS_START,
  classifyChannel,
  type Channel,
} from "@/lib/analytics/channel";

/**
 * CR1 — every visitor, split by how they arrived.
 *
 * "Visitors", precisely: distinct `olera_session` ids. That cookie is a
 * 30-day sliding id (see lib/analytics/session.ts), so it identifies a
 * returning person, not a GA-style 30-minute session. Compare against GA4
 * users, never GA sessions.
 *
 * The population is exactly the one CR4 covers — provider pages plus the
 * benefits and editorial content pages — which the platform splits across two
 * tables with two different shapes:
 *
 *   provider_activity  visitor id in metadata->>session_id
 *   page_events        visitor id in a top-level session_id column
 *
 * ONE PASS, TEN BUCKETS. An earlier version ran a separate scan per channel;
 * with ten of them that is ten reads of the same rows. This reads each row
 * once, classifies it in memory, and buckets the visitor.
 *
 * A visitor with views from two channels is assigned to the FIRST channel we
 * see for them, ordered by time. That is the acquisition channel — the one
 * that brought them — rather than whichever page they happened to read last.
 * Without it the ten would double-count and stop summing to the total.
 *
 * Internal traffic is dropped entirely rather than shown as a channel: our
 * own QA sweeps are not demand, and leaving them in inflates whatever
 * campaign the tester happened to open.
 */

const PAGE_SIZE = 1000;

/**
 * Ceiling on rows scanned per table. Distinct visitors cannot be counted in
 * the database through PostgREST, so the rows have to come back to be
 * de-duplicated here. If this trips the result is a floor and says so.
 */
const MAX_ROWS = 150_000;

/**
 * The date `lib/analytics/referrer.ts` shipped. Page views before it carry no
 * `referrer_class` at all.
 */
export const REFERRER_INSTRUMENTATION_START = "2026-08-12";

/**
 * The date visitor city started being recorded. Before this no event carries
 * a city, so a city-scoped count over an earlier range is structurally zero
 * rather than genuinely quiet.
 */
export const VISITOR_GEO_START = "2026-09-06";

export { CHANNEL_SIGNALS_START };

export interface TrafficByChannel {
  /** Distinct visitors, internal excluded. The ten below sum to this. */
  total: number;
  byChannel: Record<Channel, number>;
  /** A row ceiling was hit, so every figure here is a floor. */
  truncated: boolean;
  /** The range predates referrer classification. */
  partialInstrumentation: boolean;
  /** The range predates utm_medium / gclid / ref being recorded. */
  partialChannelSignals: boolean;
  /** The range predates visitor city being recorded. */
  partialCityData: boolean;
}

type Row = {
  sid: string | null;
  at: string | null;
  metadata: Record<string, unknown> | null;
};

/** Read one table's page views, oldest first so the first hit wins. */
async function collect(
  db: SupabaseClient,
  table: "provider_activity" | "page_events",
  rows: Row[],
  from: string | null,
  to: string | null,
  citySlug: string | null,
): Promise<boolean> {
  let scanned = 0;

  for (;;) {
    if (scanned >= MAX_ROWS) return true;

    let query = db
      .from(table)
      .select(
        table === "page_events"
          ? "sid:session_id, at:created_at, metadata"
          : "sid:metadata->>session_id, at:created_at, metadata",
      )
      .eq("event_type", "page_view")
      .order("created_at", { ascending: true });

    // page_events carries surfaces CR4 does not count. Narrowing to the same
    // two keeps CR1 a true parent of the box below it.
    if (table === "page_events") {
      query = query.or(`${CONTENT_PAGE_FILTERS.benefit},${CONTENT_PAGE_FILTERS.guide}`);
    }
    // Visitor city, recorded at the edge since VISITOR_GEO_START.
    if (citySlug) query = query.filter("metadata->>geo_city", "eq", citySlug);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lt("created_at", to);

    const { data, error } = await query.range(scanned, scanned + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as unknown as Row[];
    if (page.length === 0) return false;
    rows.push(...page);

    scanned += page.length;
    if (page.length < PAGE_SIZE) return false;
  }
}

export async function getTrafficByChannel(
  db: SupabaseClient,
  range: { from: string | null; to: string | null },
  citySlug: string | null = null,
): Promise<TrafficByChannel> {
  const rows: Row[] = [];
  const truncatedProvider = await collect(
    db, "provider_activity", rows, range.from, range.to, citySlug,
  );
  const truncatedContent = await collect(
    db, "page_events", rows, range.from, range.to, citySlug,
  );

  // Both tables were read oldest-first individually; merge them so "first
  // channel seen" means first across the whole population, not first within
  // whichever table happened to be scanned first.
  rows.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));

  const channelOf = new Map<string, Channel>();
  for (const row of rows) {
    const sid = row.sid;
    if (typeof sid !== "string" || sid.length === 0) continue;
    if (channelOf.has(sid)) continue; // first arrival wins

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    channelOf.set(
      sid,
      classifyChannel({
        referrer_class: meta.referrer_class as string | null,
        utm_source: meta.utm_source as string | null,
        utm_medium: meta.utm_medium as string | null,
        gclid: meta.gclid === true,
        ref: meta.ref as string | null,
      }),
    );
  }

  const byChannel = Object.fromEntries(
    CHANNELS.map((c) => [c, 0]),
  ) as Record<Channel, number>;

  let total = 0;
  for (const channel of channelOf.values()) {
    // Internal is dropped rather than shown: our own QA traffic is not
    // demand, and it has no bucket in CHANNELS to land in.
    if (channel === "internal") continue;
    byChannel[channel] += 1;
    total += 1;
  }

  return {
    total,
    byChannel,
    truncated: truncatedProvider || truncatedContent,
    partialInstrumentation: !range.from || range.from < REFERRER_INSTRUMENTATION_START,
    partialChannelSignals: !range.from || range.from < CHANNEL_SIGNALS_START,
    partialCityData: Boolean(citySlug) && (!range.from || range.from < VISITOR_GEO_START),
  };
}
