import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";

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
      if (view === "people" || view === "families") {
        return handleFamiliesPeopleView(db, opts);
      }
      return handleFamiliesFeedView(db, opts);
    }

    // Provider views (default + backward compat)
    if (view === "providers" || view === "people") {
      return handleProvidersView(db, { ...opts, emailType: eventType });
    }

    return handleFeedView(db, { ...opts, emailType: eventType });
  } catch (err) {
    console.error("Admin activity error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFeedView(db: any, opts: {
  emailType: string | null;
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}) {
  const { emailType, sinceISO, search, limit, offset, countOnly } = opts;
  // Provider feed — existing behavior

  // If searching, find matching provider IDs first
  let searchProviderIds: string[] | null = null;
  if (search) {
    const { data: matches } = await db
      .from("olera-providers")
      .select("provider_id")
      .ilike("provider_name", `%${search}%`)
      .limit(200);

    searchProviderIds = (matches ?? []).map(
      (p: { provider_id: string }) => p.provider_id
    );
    if (searchProviderIds!.length === 0) {
      return NextResponse.json({ events: [], total: 0 });
    }
  }

  // Build query
  let query = db
    .from("provider_activity")
    .select("*", { count: "exact" })
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (emailType) {
    query = query.eq("email_type", emailType);
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

    // Also check business_profiles for providers not found in olera-providers (slug-based IDs)
    const missingIds = providerIds.filter((id) => !providerMap[id]);
    if (missingIds.length > 0) {
      const { data: bps } = await db
        .from("business_profiles")
        .select("slug, display_name, category, city, state")
        .in("slug", missingIds);

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
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}) {
  const { emailType, sinceISO, search, limit, offset, countOnly } = opts;

  // Use raw SQL via RPC for aggregation — Supabase JS doesn't support GROUP BY
  // Fallback: fetch all activity and aggregate in JS (fine for current scale)
  let query = db
    .from("provider_activity")
    .select("provider_id, event_type, email_type, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (emailType) {
    query = query.eq("email_type", emailType);
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

    if (event.email_type) {
      providerStats[pid].email_types[event.email_type] =
        (providerStats[pid].email_types[event.email_type] || 0) + 1;
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

    // Check which ones are claimed
    const { data: claimedProfiles } = await db
      .from("business_profiles")
      .select("source_provider_id, slug, display_name, category, city, state, claim_state")
      .in("source_provider_id", providerIds)
      .eq("claim_state", "claimed");

    const claimedSet = new Set(
      (claimedProfiles || []).map(
        (bp: { source_provider_id: string }) => bp.source_provider_id
      )
    );

    if (providers) {
      for (const p of providers) {
        providerMap[p.provider_id] = {
          name: p.provider_name,
          category: p.provider_category,
          city: p.city,
          state: p.state,
          slug: p.slug,
          claimed: claimedSet.has(p.provider_id),
        };
      }
    }

    // Also check slug-based provider IDs
    const missingIds = providerIds.filter((id) => !providerMap[id]);
    if (missingIds.length > 0) {
      const { data: bps } = await db
        .from("business_profiles")
        .select("slug, display_name, category, city, state, claim_state")
        .in("slug", missingIds);

      if (bps) {
        for (const bp of bps) {
          providerMap[bp.slug] = {
            name: bp.display_name,
            category: bp.category,
            city: bp.city,
            state: bp.state,
            slug: bp.slug,
            claimed: bp.claim_state === "claimed",
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
      return info?.name?.toLowerCase().includes(lowerSearch);
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
  sinceISO: string;
  search: string;
  limit: number;
  offset: number;
  countOnly: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFamiliesFeedView(db: any, opts: FamilyOpts) {
  const { eventType, sinceISO, search, limit, offset, countOnly } = opts;

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

  if (eventType) {
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
  const profileIds = Array.from(
    new Set((events || []).map((e: { profile_id: string }) => e.profile_id))
  ) as string[];

  const familyMap: Record<string, {
    name: string; email: string | null; city: string | null;
    state: string | null; care_types: string[]; timeline: string | null;
  }> = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await db
      .from("business_profiles")
      .select("id, display_name, email, city, state, care_types, metadata")
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
  const { eventType, sinceISO, search, limit, offset, countOnly } = opts;

  let query = db
    .from("seeker_activity")
    .select("profile_id, event_type, email_type, related_provider_id, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (eventType) {
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
  const profileIds = sortedFamilies.map((f) => f.profile_id);
  const familyMap: Record<string, {
    name: string; email: string | null; city: string | null;
    state: string | null; care_types: string[]; timeline: string | null;
    account_id: string | null;
  }> = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await db
      .from("business_profiles")
      .select("id, display_name, email, city, state, care_types, metadata, account_id")
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
