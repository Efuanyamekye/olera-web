import { getServiceClient } from "@/lib/admin";

/**
 * Count families delivered by managed-ad campaigns — the Ad Boost ROI signal.
 *
 * A "delivered family" is a campaign-attributed CONVERSION: a family who arrived
 * via a managed-ads link (`utm_source=olera_managed&utm_campaign=<tag>`) and then
 * either
 *   • inquired with the provider     → a `lead_received` provider_activity event, or
 *   • finished the benefits intake    → a `benefits_completed` seeker_activity event,
 * with the campaign's `utm_campaign` on the event metadata. Both are
 * server-confirmed conversions — not clicks — so this is the honest number to
 * show before we ever charge.
 *
 * The inquiry (`lead_received`) is the PRIMARY conversion: an ad points at a
 * provider page, whose natural action is "contact this provider," so that's the
 * funnel most ad-driven families take. `benefits_completed` is the secondary
 * side funnel. Counting only the latter (the old behaviour) systematically
 * read ~0 even when a real inquiry landed — see the Franchil pilot.
 *
 * Dedup: inquiries are deduped within-funnel by connection_id/session_id and
 * benefits completions by family profile_id. A family who did BOTH funnels for
 * the same campaign can count twice — there is no shared key across the two
 * tables (benefits_completed carries no session_id). Negligible at pilot volume;
 * revisit if cross-funnel overlap ever becomes material.
 *
 * Returns a map of campaign_tag → delivered count. Tags with no conversions are
 * present with 0. Scoped to `utm_source=olera_managed` so we only scan managed
 * traffic (cheap at pilot volume).
 */
export async function countDeliveredByCampaign(
  db: ReturnType<typeof getServiceClient>,
  tags: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const wanted = tags.filter((t): t is string => !!t);
  if (wanted.length === 0) return result;
  const wantedSet = new Set(wanted);
  // Per-tag set of dedup keys (across both funnels); count = set size.
  const idsByTag: Record<string, Set<string>> = {};
  for (const t of wanted) idsByTag[t] = new Set();

  // 1. Primary funnel — inquiries. UTM-tagged `lead_received` on provider_activity.
  const { data: leads } = await db
    .from("provider_activity")
    .select("metadata")
    .eq("event_type", "lead_received")
    .filter("metadata->>utm_source", "eq", "olera_managed")
    .limit(50000);
  for (const row of (leads ?? []) as Array<{
    metadata: { utm_campaign?: string; connection_id?: string; session_id?: string } | null;
  }>) {
    const m = row.metadata;
    const tag = m?.utm_campaign;
    if (tag && wantedSet.has(tag)) {
      idsByTag[tag].add(`lead:${m?.connection_id || m?.session_id || JSON.stringify(m)}`);
    }
  }

  // 2. Secondary funnel — benefits completions. UTM-tagged `benefits_completed`.
  const { data: bens } = await db
    .from("seeker_activity")
    .select("profile_id, metadata")
    .eq("event_type", "benefits_completed")
    .filter("metadata->>utm_source", "eq", "olera_managed")
    .limit(50000);
  for (const row of (bens ?? []) as Array<{
    profile_id: string | null;
    metadata: { utm_campaign?: string } | null;
  }>) {
    const tag = row.metadata?.utm_campaign;
    if (tag && wantedSet.has(tag)) {
      idsByTag[tag].add(`benefits:${row.profile_id || JSON.stringify(row.metadata)}`);
    }
  }

  for (const t of wanted) result[t] = idsByTag[t].size;
  return result;
}

/**
 * Real campaign performance for the provider-facing live panel: how many people
 * visited this provider's page and how many converted into leads since the
 * campaign launched.
 *
 * This is deliberately DIFFERENT from countDeliveredByCampaign. That counts
 * `benefits_completed` conversions tagged with the campaign UTM — a side funnel
 * the live provider page mostly doesn't even surface, so for most campaigns it
 * reads ~0 while real inquiries arrive through the page's primary CTA. This
 * instead reads the page's actual traffic + conversion from provider_activity:
 *   visitors = session-deduped `page_view` events
 *   leads    = `lead_received` events (the CTA inquiry — the true conversion)
 *
 * Single-provider attribution by approximation: a managed campaign points only
 * at this provider's page, and a provider's organic baseline is typically ~zero,
 * so "traffic on the page since launch" ≈ campaign performance. Clean
 * per-campaign UTM attribution (for many providers running at once) is a
 * separate, later piece; this is the honest number for a single live campaign.
 *
 * `since` is an ISO timestamp (the campaign's launch anchor). provider_activity
 * keys on the URL slug, so pass the provider's slug (plus profile id as a
 * defensive fallback for legacy rows) as `providerIdVariants`.
 */
export interface CampaignStats {
  visitors: number;
  leads: number;
}

export async function getCampaignStats(
  db: ReturnType<typeof getServiceClient>,
  options: { providerIdVariants: string[]; since: string },
): Promise<CampaignStats> {
  const variants = options.providerIdVariants.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (variants.length === 0) return { visitors: 0, leads: 0 };

  const { data, error } = await db
    .from("provider_activity")
    .select("event_type, metadata")
    .in("provider_id", variants)
    .in("event_type", ["page_view", "lead_received"])
    .gte("created_at", options.since)
    .limit(50000);

  if (error || !data) return { visitors: 0, leads: 0 };

  // Visitors = distinct session_id across page_view (mirrors the dedup the
  // analytics endpoint + nightly rollup use). Leads = lead_received count.
  const sessions = new Set<string>();
  let leads = 0;
  for (const row of data as Array<{
    event_type: string;
    metadata: Record<string, unknown> | null;
  }>) {
    if (row.event_type === "lead_received") {
      leads += 1;
    } else if (row.event_type === "page_view") {
      const sid = row.metadata?.session_id;
      if (typeof sid === "string" && sid.length > 0) sessions.add(sid);
    }
  }
  return { visitors: sessions.size, leads };
}

/** Questions a campaign drew in, counted the SAME way visitors/leads are: since
 *  the launch anchor, no UTM needed (the tracker is a since-launch time window,
 *  not UTM attribution). `received`/`unanswered` exclude admin-removed (rejected)
 *  and dismissed (archived) questions — the same "manageable" exclusion the
 *  provider dashboard card and hero use — so a spam question can't inflate the
 *  campaign's question count. */
export interface CampaignQuestions {
  received: number;
  unanswered: number;
}

export async function getCampaignQuestions(
  db: ReturnType<typeof getServiceClient>,
  options: { providerIdVariants: string[]; since: string },
): Promise<CampaignQuestions> {
  const variants = options.providerIdVariants.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (variants.length === 0) return { received: 0, unanswered: 0 };

  const { data, error } = await db
    .from("provider_questions")
    .select("answer, status")
    .in("provider_id", variants)
    .gte("created_at", options.since)
    .limit(5000);

  if (error || !data) return { received: 0, unanswered: 0 };

  const manageable = (data as Array<{ answer: string | null; status: string }>).filter(
    (q) => q.status !== "archived" && q.status !== "rejected",
  );
  const unanswered = manageable.filter((q) => !q.answer?.trim()).length;
  return { received: manageable.length, unanswered };
}

// UI care-need bucket → human label (mirror of CARE_NEED_LABELS in
// app/api/benefits/save-results). Kept tiny + local to avoid coupling.
const CARE_NEED_LABELS: Record<string, string> = {
  stayingAtHome: "in-home care",
  payingForCare: "paying for care",
  memoryHealth: "memory & medical care",
  companionship: "caregiver & social support",
};

/** One delivered family behind an Ad Boost campaign — the rows behind the count.
 *  Deliberately NO name / PHI: just date + care need + state + where it came in. */
export interface CampaignLead {
  created_at: string;
  careNeed: string | null;
  state: string | null;
  entrySource: string | null;
}

/** Humanize a connection `care_type`/`care_need` slug (e.g. "home_care" →
 *  "Home care"). Falls back to title-casing the raw slug. */
function humanizeCareSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const direct = CARE_NEED_LABELS[slug];
  if (direct) return direct;
  return slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull NO-PHI care signal out of a connection's stringified message payload.
 *  The message holds seeker contact info (name/email/phone) which we must NOT
 *  surface — we read only care_type/care_need + state. */
function careFromConnectionMessage(
  message: string | null,
): { careNeed: string | null; state: string | null } {
  if (!message) return { careNeed: null, state: null };
  try {
    const p = JSON.parse(message) as Record<string, unknown>;
    const careRaw = (p.care_type as string) || (p.care_need as string) || null;
    const state =
      (p.looking_in_state as string) || (p.seeker_state as string) || null;
    return { careNeed: humanizeCareSlug(careRaw), state: state || null };
  } catch {
    return { careNeed: null, state: null };
  }
}

/**
 * List the families a campaign delivered, newest first — the receipts behind
 * `countDeliveredByCampaign`. Merges the PRIMARY funnel (campaign-attributed
 * `lead_received` inquiries, enriched with care need + state from the connection
 * record) with the secondary `benefits_completed` funnel. No PHI — care need +
 * state + entry source only.
 */
export async function listLeadsByCampaign(
  db: ReturnType<typeof getServiceClient>,
  tag: string,
): Promise<CampaignLead[]> {
  if (!tag) return [];

  const [leadRes, benefitsRes] = await Promise.all([
    db
      .from("provider_activity")
      .select("created_at, metadata")
      .eq("event_type", "lead_received")
      .filter("metadata->>utm_source", "eq", "olera_managed")
      .filter("metadata->>utm_campaign", "eq", tag)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("seeker_activity")
      .select("created_at, metadata")
      .eq("event_type", "benefits_completed")
      .filter("metadata->>utm_source", "eq", "olera_managed")
      .filter("metadata->>utm_campaign", "eq", tag)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const out: CampaignLead[] = [];

  // Primary funnel — inquiries. Enrich care need + state from the connection.
  const leadRows = (leadRes.data ?? []) as Array<{
    created_at: string;
    metadata: { connection_id?: string } | null;
  }>;
  const connIds = leadRows
    .map((r) => r.metadata?.connection_id)
    .filter((v): v is string => !!v);
  const careByConn: Record<string, { careNeed: string | null; state: string | null }> = {};
  if (connIds.length > 0) {
    const { data: conns } = await db
      .from("connections")
      .select("id, message")
      .in("id", connIds);
    for (const c of (conns ?? []) as Array<{ id: string; message: string | null }>) {
      careByConn[c.id] = careFromConnectionMessage(c.message);
    }
  }
  for (const r of leadRows) {
    const care = (r.metadata?.connection_id && careByConn[r.metadata.connection_id]) || {
      careNeed: null,
      state: null,
    };
    out.push({
      created_at: r.created_at,
      careNeed: care.careNeed,
      state: care.state,
      entrySource: "Provider page inquiry",
    });
  }

  // Secondary funnel — benefits completions.
  for (const r of (benefitsRes.data ?? []) as Array<{
    created_at: string;
    metadata: { care_need?: string; state?: string; entry_source?: string } | null;
  }>) {
    out.push({
      created_at: r.created_at,
      careNeed: r.metadata?.care_need
        ? CARE_NEED_LABELS[r.metadata.care_need] ?? r.metadata.care_need
        : null,
      state: r.metadata?.state ?? null,
      entrySource: r.metadata?.entry_source ?? null,
    });
  }

  return out.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
}
