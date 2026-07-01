import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  PROVIDER_CATEGORIES,
  eventTypesForCategory,
  isProviderCategory,
  type ProviderCategoryKey,
} from "@/lib/activity/provider-categories";
import {
  SEEKER_CATEGORIES,
  SEEKER_ALL_EVENT_TYPES,
  eventTypesForSeekerCategory,
  isSeekerCategory,
  type SeekerCategoryKey,
} from "@/lib/activity/seeker-categories";

// The Providers tab answers "what are providers DOING on the platform?" — so it
// must show only events a provider's own session performed. The provider_activity
// table is overloaded: anonymous care-seeker browsing (multi_provider_viewed,
// cta_variant_impression, benefits_*_viewed, enrichment_*, etc.) is written here
// too, keyed on the *page's* provider slug — NOT because the provider did anything.
// In production those care-seeker rows are ~89% of the table, so a blacklist of
// page_view + question_received let them drown the real provider signal in both
// the feed and the per-provider People aggregation (which caps at 5000 rows).
//
// This allowlist is the inverse fix: surface only genuine provider-session
// actions. Anything not on this list (anonymous care-seeker events, question/
// review/lead "_received" mirrors that are care-seeker-driven) is excluded.
// Keep in sync with PROVIDER_EVENT_TYPES in app/api/activity/track/route.ts —
// add new provider actions here when they're added there.
const PROVIDER_ACTION_EVENT_TYPES = [
  // Lead engagement (provider opened / acted on a care-seeker lead)
  "lead_opened",
  "contact_revealed",
  "phone_clicked",
  "email_link_clicked",
  "continue_in_inbox",
  "one_click_access",
  "email_click", // provider clicked a tracked link in a notification email
  // Question answering
  "question_responded",
  // Reviews
  "review_viewed",
  "reviews_cta_clicked",
  // Profile / claim lifecycle
  "provider_profile_edited",
  "provider_saved",
  "claim_completed",
  "suspicious_claim",
  // Dashboard / activation funnel
  "dashboard_arrival",
  "provider_picker_impression",
  "provider_picker_clicked",
  "analytics_teaser_impression",
  "analytics_teaser_cta_clicked",
  // Find Families / market outreach
  "matches_page_viewed",
  "matches_card_clicked",
  "matches_message_generated",
  "matches_outreach_sent",
  "market_diagnostic_viewed_no_leads",
  "market_outreach_status_updated",
  // Managed Ads funnel + Your Market (migration 105)
  "managed_ads_pitch_viewed",
  "managed_ads_cta_clicked",
  "managed_ads_boost_viewed",
  "managed_ads_requested",
  "your_market_viewed",
  "your_market_playbook_clicked",
  // Ad pitch touchpoint tracking
  "ads_touchpoint_viewed",
  "ads_touchpoint_clicked",
  "ads_touchpoint_dismissed",
];

/**
 * Constrain a provider_activity query to a taxonomy category (see
 * lib/activity/provider-categories.ts). "flags" is special: it folds in
 * low-trust one_click_access events the same way the standalone "Suspicious
 * claims" filter does, so the trust signal isn't split across two places.
 * Returns the query unchanged for an unknown category.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCategoryFilter(query: any, category: ProviderCategoryKey) {
  if (category === "flags") {
    return query.or(
      "event_type.eq.suspicious_claim,and(event_type.eq.one_click_access,metadata->>trust_level.eq.low)"
    );
  }
  return query.in("event_type", eventTypesForCategory(category));
}

/**
 * GET /api/admin/activity
 *
 * Admin Activity Center data. Supports two actor types:
 * - actor=providers (default): provider email click engagement
 * - actor=families: care seeker engagement (connections, profile, email clicks)
 *
 * Each actor type has two views:
 * - view=feed: chronological events
 * - view=people (or view=providers for backward compat): aggregated per person
 *
 * Query params:
 * - actor: "providers" | "families"
 * - view: "feed" | "people" | "providers" (legacy alias for "people")
 * - event_type: filter by event type
 * - days: time window (7, 30, 90). Default 30
 * - search: name search
 * - limit: pagination limit. Default 50
 * - offset: pagination offset. Default 0
 * - count_only: return only total count
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
    const actor = searchParams.get("actor") || "providers";
    const view = searchParams.get("view") || "feed";
    const eventType = searchParams.get("event_type") || searchParams.get("email_type");
    const categoryParam = searchParams.get("category");
    const category = isProviderCategory(categoryParam) ? categoryParam : null;
    const seekerCategory = isSeekerCategory(categoryParam) ? categoryParam : null;
    // Drill-down: isolate one exact action within a category. Validated against
    // the relevant allowlist so it can't smuggle in an out-of-scope event type.
    const eventParam = searchParams.get("event");
    const exactEvent =
      eventParam && PROVIDER_ACTION_EVENT_TYPES.includes(eventParam) ? eventParam : null;
    const seekerExactEvent =
      eventParam && SEEKER_ALL_EVENT_TYPES.includes(eventParam) ? eventParam : null;
    const days = parseInt(searchParams.get("days") || "30", 10);
    const search = searchParams.get("search")?.trim() || "";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const countOnly = searchParams.get("count_only") === "true";

    const db = getServiceClient();

    // Calculate time window
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    const opts = { eventType, sinceISO, search, limit, offset, countOnly };

    if (actor === "families") {
      if (view === "summary") {
        return handleSeekerSummary(db, sinceISO, seekerCategory);
      }
      const familyOpts = { ...opts, category: seekerCategory, exactEvent: seekerExactEvent };
      if (view === "people" || view === "families") {
        return handleFamiliesPeopleView(db, familyOpts);
      }
      return handleFamiliesFeedView(db, familyOpts);
    }

    // Orientation summary — per-category counts, or per-event counts when a
    // category is given (drill-down chip row).
    if (view === "summary") {
      return handleProviderSummary(db, sinceISO, category);
    }

    // Provider views (default + backward compat)
    if (view === "providers" || view === "people") {
      return handleProvidersView(db, { ...opts, emailType: eventType, category, exactEvent });
    }

    return handleFeedView(db, { ...opts, emailType: eventType, category, exactEvent });
  } catch (err) {
    console.error("Admin activity error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Per-category counts for the Providers orientation strip. One exact head-count
 * query per category, run in parallel — accurate beyond the 5000-row aggregation
 * cap, and cheap (no rows transferred). Returns counts in PROVIDER_CATEGORIES
 * order plus the grand total of provider actions in the window.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProviderSummary(db: any, sinceISO: string, category: ProviderCategoryKey | null) {
  // Drill-down: per-event-type counts within one category (the sub-chip row).
  // "flags" has no useful sub-breakdown (it's already a narrow overlay), so it
  // falls through to the category-level summary.
  if (category && category !== "flags") {
    const types = eventTypesForCategory(category);
    const events = await Promise.all(
      types.map(async (et) => {
        const { count } = await db
          .from("provider_activity")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO)
          .eq("event_type", et);
        return { event_type: et, count: count || 0 };
      })
    );
    return NextResponse.json({ category, events });
  }

  const counts = await Promise.all(
    PROVIDER_CATEGORIES.map(async (cat) => {
      let q = db
        .from("provider_activity")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sinceISO);
      q = applyCategoryFilter(q, cat.key);
      const { count } = await q;
      return { key: cat.key, count: count || 0 };
    })
  );

  // Grand total = all genuine provider actions (matches the feed's "All" view),
  // not the sum of categories — "flags" overlaps Leads (low-trust sign-ins).
  const { count: total } = await db
    .from("provider_activity")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceISO)
    .in("event_type", PROVIDER_ACTION_EVENT_TYPES);

  return NextResponse.json({ categories: counts, total: total || 0 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFeedView(db: any, opts: {
  emailType: string | null;
  category: ProviderCategoryKey | null;
  exactEvent: string | null;
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}) {
  const { emailType, category, exactEvent, sinceISO, search, limit, offset, countOnly } = opts;
  // Provider feed — existing behavior

  // If searching, find matching provider IDs first (check both tables)
  let searchProviderIds: string[] | null = null;
  if (search) {
    const [{ data: iosMatches }, { data: bpMatches }] = await Promise.all([
      db.from("olera-providers").select("provider_id, slug").ilike("provider_name", `%${search}%`).limit(200),
      db.from("business_profiles").select("slug, source_provider_id").in("type", ["organization", "caregiver"]).ilike("display_name", `%${search}%`).limit(200),
    ]);

    const ids = new Set<string>();
    ids.add(search);
    for (const p of iosMatches ?? []) {
      if (p.provider_id) ids.add(p.provider_id);
      if (p.slug) ids.add(p.slug);
    }
    for (const p of bpMatches ?? []) {
      if (p.slug) ids.add(p.slug);
      if (p.source_provider_id) ids.add(p.source_provider_id);
    }
    searchProviderIds = Array.from(ids);

    if (searchProviderIds.length === 0) {
      return NextResponse.json({ events: [], total: 0 });
    }
  }

  // Build query.
  // Restrict to genuine provider-session actions (see PROVIDER_ACTION_EVENT_TYPES).
  // This excludes anonymous care-seeker browsing events that also live in
  // provider_activity keyed on the page's provider slug — they are NOT provider
  // actions and previously dominated this feed (~89% of rows).
  let query = db
    .from("provider_activity")
    .select("*", { count: "exact" })
    .gte("created_at", sinceISO)
    .in("event_type", PROVIDER_ACTION_EVENT_TYPES)
    .order("created_at", { ascending: false });

  if (emailType) {
    if (emailType === "suspicious_claim") {
      // Trust is now carried on one_click_access events via metadata.trust_level.
      // Legacy standalone suspicious_claim rows are also surfaced.
      query = query
        .or("event_type.eq.suspicious_claim,and(event_type.eq.one_click_access,metadata->>trust_level.eq.low)");
    } else if (["contact_revealed", "one_click_access", "lead_opened", "email_click", "question_responded", "market_diagnostic_viewed_no_leads", "market_outreach_status_updated"].includes(emailType)) {
      // These are event_type values, not email_type
      query = query.eq("event_type", emailType);
    } else {
      query = query.eq("email_type", emailType);
    }
  }
  // Drill-down to one exact action takes precedence over its category.
  if (exactEvent) {
    query = query.eq("event_type", exactEvent);
  } else if (category) {
    // Category navigation (orientation tiles) narrows to a taxonomy bucket.
    query = applyCategoryFilter(query, category);
  }
  if (searchProviderIds) {
    query = query.in("provider_id", searchProviderIds);
  }

  if (countOnly) {
    query = query.limit(0);
    const { count } = await query;
    return NextResponse.json({ count: count || 0 });
  }

  query = query.range(offset, offset + limit - 1);
  const { data: events, count, error } = await query;

  if (error) {
    console.error("Activity feed query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }

  // Hydrate with provider info from olera-providers
  const providerIds = Array.from(
    new Set((events || []).map((e: { provider_id: string }) => e.provider_id))
  ) as string[];

  let providerMap: Record<
    string,
    { name: string; category: string; city: string; state: string; slug: string }
  > = {};

  if (providerIds.length > 0) {
    const { data: providers } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, slug")
      .in("provider_id", providerIds);

    if (providers) {
      for (const p of providers) {
        providerMap[p.provider_id] = {
          name: p.provider_name,
          category: p.provider_category,
          city: p.city,
          state: p.state,
          slug: p.slug,
        };
      }
    }

    // Also check olera-providers.slug and business_profiles for canonical slug / BP slug IDs.
    const missingIds = providerIds.filter((id) => !providerMap[id]);
    if (missingIds.length > 0) {
      const { data: providersBySlug } = await db
        .from("olera-providers")
        .select("provider_id, provider_name, provider_category, city, state, slug")
        .in("slug", missingIds);

      if (providersBySlug) {
        for (const p of providersBySlug) {
          providerMap[p.slug] = {
            name: p.provider_name,
            category: p.provider_category,
            city: p.city,
            state: p.state,
            slug: p.slug,
          };
        }
      }
    }

    const stillMissingIds = providerIds.filter((id) => !providerMap[id]);
    if (stillMissingIds.length > 0) {
      const { data: bps } = await db
        .from("business_profiles")
        .select("slug, display_name, category, city, state")
        .in("slug", stillMissingIds);

      if (bps) {
        for (const bp of bps) {
          providerMap[bp.slug] = {
            name: bp.display_name,
            category: bp.category,
            city: bp.city,
            state: bp.state,
            slug: bp.slug,
          };
        }
      }
    }
  }

  // Enrich events with provider info
  const enrichedEvents = (events || []).map(
    (e: { provider_id: string; [key: string]: unknown }) => ({
      ...e,
      provider: providerMap[e.provider_id] || null,
    })
  );

  return NextResponse.json({
    events: enrichedEvents,
    total: count || 0,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProvidersView(db: any, opts: {
  emailType: string | null;
  category: ProviderCategoryKey | null;
  exactEvent: string | null;
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}) {
  const { emailType, category, exactEvent, sinceISO, search, limit, offset, countOnly } = opts;

  // Use raw SQL via RPC for aggregation — Supabase JS doesn't support GROUP BY
  // Fallback: fetch all activity and aggregate in JS (fine for current scale).
  // Mirror of handleFeedView: restrict to genuine provider-session actions so
  // per-provider counts reflect what providers DO, not care-seeker browsing on
  // their page. Also keeps the 5000-row cap below full of real signal instead of
  // ~89% anonymous noise (which previously truncated real provider activity out).
  let query = db
    .from("provider_activity")
    .select("provider_id, event_type, email_type, created_at, metadata")
    .gte("created_at", sinceISO)
    .in("event_type", PROVIDER_ACTION_EVENT_TYPES)
    .order("created_at", { ascending: false });

  if (emailType) {
    if (emailType === "suspicious_claim") {
      query = query
        .or("event_type.eq.suspicious_claim,and(event_type.eq.one_click_access,metadata->>trust_level.eq.low)");
    } else if (["contact_revealed", "one_click_access", "lead_opened", "question_responded", "market_diagnostic_viewed_no_leads", "market_outreach_status_updated"].includes(emailType)) {
      query = query.eq("event_type", emailType);
    } else {
      query = query.eq("email_type", emailType);
    }
  }
  if (exactEvent) {
    query = query.eq("event_type", exactEvent);
  } else if (category) {
    query = applyCategoryFilter(query, category);
  }

  // Cap at 5000 events for aggregation (covers most scenarios)
  const { data: allEvents, error } = await query.limit(5000);

  if (error) {
    console.error("Activity providers query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }

  // Aggregate per provider
  const providerStats: Record<
    string,
    {
      provider_id: string;
      total_clicks: number;
      last_active: string;
      email_types: Record<string, number>;
      recent_clicks_7d: number;
    }
  > = {};

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const event of allEvents || []) {
    const pid = event.provider_id;
    if (!providerStats[pid]) {
      providerStats[pid] = {
        provider_id: pid,
        total_clicks: 0,
        last_active: event.created_at,
        email_types: {},
        recent_clicks_7d: 0,
      };
    }

    providerStats[pid].total_clicks++;

    // Use email_type for email clicks, event_type for direct question events
    const typeKey = event.email_type || event.event_type;
    if (typeKey) {
      providerStats[pid].email_types[typeKey] =
        (providerStats[pid].email_types[typeKey] || 0) + 1;
    }

    // Trust signal aggregation: low-trust one_click_access events also count as
    // "suspicious_claim" for the People-view badge, since the trust check now
    // lives on the one_click_access event instead of a standalone row.
    if (
      event.event_type === "one_click_access" &&
      (event.metadata as Record<string, string> | null)?.trust_level === "low"
    ) {
      providerStats[pid].email_types["suspicious_claim"] =
        (providerStats[pid].email_types["suspicious_claim"] || 0) + 1;
    }

    if (new Date(event.created_at) > sevenDaysAgo) {
      providerStats[pid].recent_clicks_7d++;
    }

    // Keep the most recent timestamp
    if (event.created_at > providerStats[pid].last_active) {
      providerStats[pid].last_active = event.created_at;
    }
  }

  // Sort by last_active descending
  let sortedProviders = Object.values(providerStats).sort(
    (a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
  );

  // Search filter (applied after aggregation)
  if (search) {
    // We'll hydrate first then filter — need provider names
  }

  // Hydrate with provider info
  const providerIds = sortedProviders.map((p) => p.provider_id);
  let providerMap: Record<
    string,
    {
      name: string;
      category: string;
      city: string;
      state: string;
      slug: string;
      claimed: boolean;
    }
  > = {};

  if (providerIds.length > 0) {
    // Check olera-providers
    const { data: providers } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, slug")
      .in("provider_id", providerIds);

    // Check which ones are claimed — query by both source_provider_id AND slug
    // since activity provider_id can be either format (after the slug backfill).
    // A provider is considered "claimed" if:
    //   1. claim_state = 'claimed' (formal claim completed), OR
    //   2. account_id IS NOT NULL (user is linked, even if claim process incomplete)
    // This ensures active providers (signing in, opening leads) show as claimed.
    const [{ data: profilesBySourceId }, { data: profilesBySlug }] = await Promise.all([
      db
        .from("business_profiles")
        .select("source_provider_id, slug, claim_state, account_id")
        .in("source_provider_id", providerIds),
      db
        .from("business_profiles")
        .select("source_provider_id, slug, claim_state, account_id")
        .in("slug", providerIds),
    ]);

    // Build a set containing all identifiers (both source_provider_id and slug)
    // that belong to claimed profiles, so lookups work regardless of ID format
    const claimedSet = new Set<string>();
    for (const bp of profilesBySourceId || []) {
      const isClaimed = bp.claim_state === "claimed" || bp.account_id != null;
      if (isClaimed) {
        if (bp.source_provider_id) claimedSet.add(bp.source_provider_id);
        if (bp.slug) claimedSet.add(bp.slug);
      }
    }
    for (const bp of profilesBySlug || []) {
      const isClaimed = bp.claim_state === "claimed" || bp.account_id != null;
      if (isClaimed) {
        if (bp.source_provider_id) claimedSet.add(bp.source_provider_id);
        if (bp.slug) claimedSet.add(bp.slug);
      }
    }

    if (providers) {
      for (const p of providers) {
        providerMap[p.provider_id] = {
          name: p.provider_name,
          category: p.provider_category,
          city: p.city,
          state: p.state,
          slug: p.slug,
          claimed: claimedSet.has(p.provider_id) || claimedSet.has(p.slug),
        };
      }
    }

    // Also check canonical olera-providers.slug and business_profiles slug IDs.
    const missingIds = providerIds.filter((id) => !providerMap[id]);
    if (missingIds.length > 0) {
      const { data: providersBySlug } = await db
        .from("olera-providers")
        .select("provider_id, provider_name, provider_category, city, state, slug")
        .in("slug", missingIds);

      if (providersBySlug) {
        for (const p of providersBySlug) {
          providerMap[p.slug] = {
            name: p.provider_name,
            category: p.provider_category,
            city: p.city,
            state: p.state,
            slug: p.slug,
            claimed: claimedSet.has(p.provider_id) || claimedSet.has(p.slug),
          };
        }
      }
    }

    const stillMissingIds = providerIds.filter((id) => !providerMap[id]);
    if (stillMissingIds.length > 0) {
      const { data: bps } = await db
        .from("business_profiles")
        .select("slug, display_name, category, city, state, claim_state, account_id")
        .in("slug", stillMissingIds);

      if (bps) {
        for (const bp of bps) {
          providerMap[bp.slug] = {
            name: bp.display_name,
            category: bp.category,
            city: bp.city,
            state: bp.state,
            slug: bp.slug,
            claimed: bp.claim_state === "claimed" || bp.account_id != null,
          };
        }
      }
    }
  }

  // Apply search filter after hydration
  if (search) {
    const lowerSearch = search.toLowerCase();
    sortedProviders = sortedProviders.filter((p) => {
      const info = providerMap[p.provider_id];
      return (
        p.provider_id.toLowerCase().includes(lowerSearch) ||
        info?.slug?.toLowerCase().includes(lowerSearch) ||
        info?.name?.toLowerCase().includes(lowerSearch)
      );
    });
  }

  if (countOnly) {
    return NextResponse.json({ count: sortedProviders.length });
  }

  // Paginate
  const total = sortedProviders.length;
  const paged = sortedProviders.slice(offset, offset + limit);

  // Enrich with provider info
  const enrichedProviders = paged.map((p) => ({
    ...p,
    provider: providerMap[p.provider_id] || null,
  }));

  return NextResponse.json({
    providers: enrichedProviders,
    total,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/activity
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { actor, mode, ids, person_id } = body as {
      actor: "providers" | "families";
      mode: "events" | "person";
      ids?: string[];
      person_id?: string;
    };

    const table = actor === "families" ? "seeker_activity" : "provider_activity";
    const db = getServiceClient();

    if (mode === "events") {
      if (!ids || ids.length === 0) {
        return NextResponse.json({ error: "No event IDs provided" }, { status: 400 });
      }
      const { error, count } = await db
        .from(table)
        .delete({ count: "exact" })
        .in("id", ids);

      if (error) {
        console.error("Activity delete error:", error);
        return NextResponse.json({ error: "Failed to delete events" }, { status: 500 });
      }
      return NextResponse.json({ deleted: count || 0 });
    }

    if (mode === "person") {
      if (!person_id) {
        return NextResponse.json({ error: "No person_id provided" }, { status: 400 });
      }
      const idColumn = actor === "families" ? "profile_id" : "provider_id";
      const { error, count } = await db
        .from(table)
        .delete({ count: "exact" })
        .eq(idColumn, person_id);

      if (error) {
        console.error("Activity person delete error:", error);
        return NextResponse.json({ error: "Failed to delete events" }, { status: 500 });
      }
      return NextResponse.json({ deleted: count || 0 });
    }

    return NextResponse.json({ error: "Invalid mode — use 'events' or 'person'" }, { status: 400 });
  } catch (err) {
    console.error("Admin activity delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Family handlers — seeker_activity table
// ---------------------------------------------------------------------------

interface FamilyOpts {
  eventType: string | null;
  category?: SeekerCategoryKey | null;
  exactEvent?: string | null;
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}

/**
 * Per-category counts for the Families orientation strip (mirrors
 * handleProviderSummary). With a category, returns per-event counts for the
 * drill-down row. Total is all seeker_activity in the window — families has no
 * allowlist (the table is purely care-seeker events), so this matches the feed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSeekerSummary(db: any, sinceISO: string, category: SeekerCategoryKey | null) {
  if (category) {
    const types = eventTypesForSeekerCategory(category);
    const events = await Promise.all(
      types.map(async (et) => {
        const { count } = await db
          .from("seeker_activity")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO)
          .eq("event_type", et);
        return { event_type: et, count: count || 0 };
      })
    );
    return NextResponse.json({ category, events });
  }

  const counts = await Promise.all(
    SEEKER_CATEGORIES.map(async (cat) => {
      const { count } = await db
        .from("seeker_activity")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sinceISO)
        .in("event_type", cat.eventTypes);
      return { key: cat.key, count: count || 0 };
    })
  );

  const { count: total } = await db
    .from("seeker_activity")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceISO);

  return NextResponse.json({ categories: counts, total: total || 0 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFamiliesFeedView(db: any, opts: FamilyOpts) {
  const { eventType, category, exactEvent, sinceISO, search, limit, offset, countOnly } = opts;

  // If searching, find matching family profile IDs first
  let searchProfileIds: string[] | null = null;
  if (search) {
    const { data: matches } = await db
      .from("business_profiles")
      .select("id")
      .eq("type", "family")
      .or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
      .limit(200);

    searchProfileIds = (matches ?? []).map((p: { id: string }) => p.id);
    if (searchProfileIds!.length === 0) {
      return NextResponse.json({ events: [], total: 0 });
    }
  }

  // Build query
  let query = db
    .from("seeker_activity")
    .select("*", { count: "exact" })
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  // Drill-down exact event > category bucket > legacy single event_type.
  if (exactEvent) {
    query = query.eq("event_type", exactEvent);
  } else if (category) {
    query = query.in("event_type", eventTypesForSeekerCategory(category));
  } else if (eventType) {
    query = query.eq("event_type", eventType);
  }
  if (searchProfileIds) {
    query = query.in("profile_id", searchProfileIds);
  }

  if (countOnly) {
    query = query.limit(0);
    const { count } = await query;
    return NextResponse.json({ count: count || 0 });
  }

  query = query.range(offset, offset + limit - 1);
  const { data: events, count, error } = await query;

  if (error) {
    console.error("Family activity feed query error:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }

  // Hydrate with family profile info
  // Filter out null profile_ids (guest events like save_nudge_* don't have profiles)
  const profileIds = Array.from(
    new Set((events || []).map((e: { profile_id: string | null }) => e.profile_id).filter(Boolean))
  ) as string[];

  const familyMap: Record<string, {
    name: string; email: string | null; city: string | null;
    state: string | null; care_types: string[]; timeline: string | null;
    phone: string | null; contact_preference: string | null;
    relationship: string | null;
  }> = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await db
      .from("business_profiles")
      .select("id, display_name, email, phone, city, state, care_types, metadata")
      .in("id", profileIds);

    if (profiles) {
      for (const p of profiles) {
        const meta = (p.metadata || {}) as Record<string, unknown>;
        familyMap[p.id] = {
          name: p.display_name || "Unknown",
          email: p.email,
          city: p.city,
          state: p.state,
          care_types: p.care_types || [],
          timeline: (meta.timeline as string) || null,
          phone: p.phone || null,
          contact_preference: (meta.contact_preference as string) || null,
          relationship: (meta.relationship_to_recipient as string) || null,
        };
      }
    }
  }

  const enrichedEvents = (events || []).map(
    (e: { profile_id: string; [key: string]: unknown }) => ({
      ...e,
      family: familyMap[e.profile_id] || null,
    })
  );

  return NextResponse.json({ events: enrichedEvents, total: count || 0 });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFamiliesPeopleView(db: any, opts: FamilyOpts) {
  const { eventType, category, exactEvent, sinceISO, search, limit, offset, countOnly } = opts;

  let query = db
    .from("seeker_activity")
    .select("profile_id, event_type, email_type, related_provider_id, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (exactEvent) {
    query = query.eq("event_type", exactEvent);
  } else if (category) {
    query = query.in("event_type", eventTypesForSeekerCategory(category));
  } else if (eventType) {
    query = query.eq("event_type", eventType);
  }

  const { data: allEvents, error } = await query.limit(5000);

  if (error) {
    console.error("Family activity people query error:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }

  // Aggregate per family
  const familyStats: Record<string, {
    profile_id: string;
    total_events: number;
    last_active: string;
    event_types: Record<string, number>;
    recent_events_7d: number;
    connections_count: number;
    providers_contacted: Set<string>;
  }> = {};

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const event of allEvents || []) {
    const pid = event.profile_id;
    // Skip events without a profile_id (guest events like save_nudge_*)
    // People view aggregates per-person, so guest events don't belong here
    if (!pid) continue;
    if (!familyStats[pid]) {
      familyStats[pid] = {
        profile_id: pid,
        total_events: 0,
        last_active: event.created_at,
        event_types: {},
        recent_events_7d: 0,
        connections_count: 0,
        providers_contacted: new Set(),
      };
    }

    familyStats[pid].total_events++;

    if (event.event_type) {
      familyStats[pid].event_types[event.event_type] =
        (familyStats[pid].event_types[event.event_type] || 0) + 1;
    }

    if (event.event_type === "connection_sent") {
      familyStats[pid].connections_count++;
      if (event.related_provider_id) {
        familyStats[pid].providers_contacted.add(event.related_provider_id);
      }
    }

    if (new Date(event.created_at) > sevenDaysAgo) {
      familyStats[pid].recent_events_7d++;
    }

    if (event.created_at > familyStats[pid].last_active) {
      familyStats[pid].last_active = event.created_at;
    }
  }

  // Sort by last_active descending
  let sortedFamilies = Object.values(familyStats)
    .map(f => ({
      ...f,
      providers_contacted: f.providers_contacted.size,
    }))
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime());

  // Hydrate with family profile info
  // Filter is defensive — null profile_ids are already skipped above
  const profileIds = sortedFamilies.map((f) => f.profile_id).filter(Boolean) as string[];
  const familyMap: Record<string, {
    name: string; email: string | null; phone: string | null; city: string | null;
    state: string | null; care_types: string[]; timeline: string | null;
    contact_preference: string | null; relationship: string | null;
    account_id: string | null;
  }> = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await db
      .from("business_profiles")
      .select("id, display_name, email, phone, city, state, care_types, metadata, account_id")
      .in("id", profileIds);

    if (profiles) {
      for (const p of profiles) {
        const meta = (p.metadata || {}) as Record<string, unknown>;
        familyMap[p.id] = {
          name: p.display_name || "Unknown",
          email: p.email,
          phone: p.phone || null,
          city: p.city,
          state: p.state,
          care_types: p.care_types || [],
          timeline: (meta.timeline as string) || null,
          contact_preference: (meta.contact_preference as string) || null,
          relationship: (meta.relationship_to_recipient as string) || null,
          account_id: p.account_id,
        };
      }
    }
  }

  // Apply search filter after hydration
  if (search) {
    const lowerSearch = search.toLowerCase();
    sortedFamilies = sortedFamilies.filter((f) => {
      const info = familyMap[f.profile_id];
      return (
        info?.name?.toLowerCase().includes(lowerSearch) ||
        info?.email?.toLowerCase().includes(lowerSearch)
      );
    });
  }

  if (countOnly) {
    return NextResponse.json({ count: sortedFamilies.length });
  }

  const total = sortedFamilies.length;
  const paged = sortedFamilies.slice(offset, offset + limit);

  const enrichedFamilies = paged.map((f) => ({
    ...f,
    family: familyMap[f.profile_id] || null,
  }));

  return NextResponse.json({ families: enrichedFamilies, total });
}
