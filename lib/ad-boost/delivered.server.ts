import { readCampaignRows } from "@/lib/ad-boost/read-campaign-rows";
import { getServiceClient } from "@/lib/admin";

/**
 * Referrer class the analytics pipeline (`lib/analytics/referrer`) stamps on
 * our OWN traffic: admin directory click-throughs, campaign-URL previews, QA
 * sweeps. Never a family who arrived from an ad, so it is excluded from every
 * campaign counter below.
 *
 * This is not cosmetic — it is what makes our numbers agree with the ad
 * platform's. Measured against the operator-entered Google clicks, stripping
 * internal traffic moved HomeWell (Jul) from 18 to 13 against 13 reported, and
 * Legacy Haven from 20 to 15 against 16 reported. Left in, every counter runs
 * hot by 10-30%.
 *
 * NULL-safe by design: rows written before the classifier shipped carry no
 * class and are kept (they are external by default), so only a positive
 * `olera_internal` match is dropped.
 */
const INTERNAL_REFERRER_CLASS = "olera_internal";

function isInternalTraffic(metadata: { referrer_class?: string } | null): boolean {
  return metadata?.referrer_class === INTERNAL_REFERRER_CLASS;
}

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

  // Filter and paginate in the database; neither funnel depends on the other.
  const [leads, bens] = await Promise.all([
    readCampaignRows(wanted, (batch, from, to, signal) => db
      .from("provider_activity").select("metadata", { count: from === 0 ? "exact" : undefined })
      .eq("event_type", "lead_received")
      .filter("metadata->>utm_source", "eq", "olera_managed")
      .in("metadata->>utm_campaign", batch)
      .order("id").range(from, to).abortSignal(signal)),
    readCampaignRows(wanted, (batch, from, to, signal) => db
      .from("seeker_activity").select("profile_id, metadata", { count: from === 0 ? "exact" : undefined })
      .eq("event_type", "benefits_completed")
      .filter("metadata->>utm_source", "eq", "olera_managed")
      .in("metadata->>utm_campaign", batch)
      .order("id").range(from, to).abortSignal(signal)),
  ]);
  for (const row of (leads ?? []) as Array<{
    metadata: { utm_campaign?: string; connection_id?: string; session_id?: string } | null;
  }>) {
    const m = row.metadata;
    const tag = m?.utm_campaign;
    if (tag && wantedSet.has(tag)) {
      idsByTag[tag].add(`lead:${m?.connection_id || m?.session_id || JSON.stringify(m)}`);
    }
  }

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
 * Count managed-ad clicks that actually LANDED, per campaign: session-deduped
 * `page_view` events tagged `utm_source=olera_managed`, EXCLUDING our own
 * internal traffic. ViewTracker stamps the landing UTM onto page_view
 * metadata, so this is the delivery half of the funnel (did the ad's clicks
 * reach the page?) next to the conversion half (`countDeliveredByCampaign`).
 * A stalled campaign shows up here within a day instead of two silent weeks
 * of zero leads.
 *
 * Only counts events from after the managed-UTM instrumentation shipped
 * (first tagged landing: 2026-07-22). Campaigns that flew before that read
 * low or zero here and their operator-entered clicks are the only history
 * available — do NOT read the gap as a tracking fault.
 */
export async function countAdLandingsByCampaign(
  db: ReturnType<typeof getServiceClient>,
  tags: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const wanted = tags.filter((t): t is string => !!t);
  if (wanted.length === 0) return result;
  const wantedSet = new Set(wanted);
  const sessionsByTag: Record<string, Set<string>> = {};
  for (const t of wanted) sessionsByTag[t] = new Set();

  const data = await readCampaignRows(wanted, (batch, from, to, signal) => db
    .from("provider_activity").select("metadata", { count: from === 0 ? "exact" : undefined })
    .eq("event_type", "page_view")
    .filter("metadata->>utm_source", "eq", "olera_managed")
    .in("metadata->>utm_campaign", batch)
    .order("id").range(from, to).abortSignal(signal));
  for (const row of (data ?? []) as Array<{
    metadata: { utm_campaign?: string; session_id?: string; referrer_class?: string } | null;
  }>) {
    if (isInternalTraffic(row.metadata)) continue;
    const tag = row.metadata?.utm_campaign;
    if (tag && wantedSet.has(tag)) {
      sessionsByTag[tag].add(row.metadata?.session_id || JSON.stringify(row.metadata));
    }
  }

  for (const t of wanted) result[t] = sessionsByTag[t].size;
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
 *   visitors = session-deduped `page_view` events, internal traffic excluded
 *   leads    = `lead_received` events (the CTA inquiry — the true conversion)
 *
 * Single-provider attribution by approximation: a managed campaign points only
 * at this provider's page, so "external traffic on the page since launch"
 * ≈ campaign performance. This is deliberately BROADER than
 * `countAdLandingsByCampaign`, which requires the managed UTM on the landing
 * view: a family who clicks the ad, leaves, and returns the next day by
 * searching the provider's name is real campaign traffic that carries no UTM
 * on the second visit. Visitors catches them; ad landings does not. Expect
 * visitors >= landings, and show them as separate numbers rather than letting
 * one stand in for the other.
 *
 * What it must NOT include is us. The `olera_internal` referrer class covers
 * admin directory click-throughs and campaign-URL previews, and it is stripped
 * here — otherwise the count we put in front of a paying provider is inflated
 * with our own clicks. It is a provider-facing number; it has to be clean.
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

  // Visitors = distinct session_id across external page_view (mirrors the
  // dedup the analytics endpoint + nightly rollup use, minus our own traffic).
  // Leads = lead_received count.
  const sessions = new Set<string>();
  let leads = 0;
  for (const row of data as Array<{
    event_type: string;
    metadata: (Record<string, unknown> & { referrer_class?: string }) | null;
  }>) {
    if (row.event_type === "lead_received") {
      // An inquiry is a real conversion whatever page it was reached from, so
      // leads are never filtered on referrer — only the traffic denominator is.
      leads += 1;
    } else if (row.event_type === "page_view") {
      if (isInternalTraffic(row.metadata)) continue;
      const sid = row.metadata?.session_id;
      if (typeof sid === "string" && sid.length > 0) sessions.add(sid);
    }
  }
  return { visitors: sessions.size, leads };
}

/** Questions a campaign drew in. The append-only ask ledger is the source of
 * truth for raw taps and campaign attribution; canonical topics supply answer
 * state. Managed UTM wins when present, with the launch window as fallback for
 * pre-attribution receipts. */
export interface CampaignQuestions {
  /** Raw submission taps, including repeats. */
  received: number;
  /** Raw taps whose canonical topic still needs an answer. */
  unanswered: number;
  uniqueReceived: number;
  uniqueUnanswered: number;
  attribution: "campaign_utm" | "time_window";
}

export async function getCampaignQuestions(
  db: ReturnType<typeof getServiceClient>,
  options: { providerIdVariants: string[]; since: string; campaignTag?: string | null },
): Promise<CampaignQuestions> {
  const variants = options.providerIdVariants.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const empty: CampaignQuestions = {
    received: 0,
    unanswered: 0,
    uniqueReceived: 0,
    uniqueUnanswered: 0,
    attribution: "time_window",
  };
  if (variants.length === 0) return empty;

  const { data: askData, error: askError } = await db
    .from("provider_question_asks")
    .select("question_id, utm_source, utm_campaign, created_at")
    .in("provider_id", variants)
    .gte("created_at", options.since)
    .limit(5000);
  if (askError || !askData) return empty;

  type AskRow = {
    question_id: string;
    utm_source: string | null;
    utm_campaign: string | null;
    created_at: string;
  };
  const activityRows = askData as AskRow[];
  if (activityRows.length === 0) return empty;

  const allQuestionIds = [...new Set(activityRows.map((row) => row.question_id))];
  const { data: topics, error: topicError } = await db
    .from("provider_questions")
    .select("id, answer, status")
    .in("id", allQuestionIds);
  if (topicError) return empty;
  const manageableTopics = new Map(
    (topics ?? [])
      .filter((topic) => topic.status !== "archived" && topic.status !== "rejected")
      .map((topic) => [topic.id, !!topic.answer?.trim()]),
  );
  const manageableRows = activityRows.filter((row) => manageableTopics.has(row.question_id));
  const taggedRows = options.campaignTag
    ? manageableRows.filter((row) =>
        row.utm_source === "olera_managed" && row.utm_campaign === options.campaignTag,
      )
    : [];
  const attributedRows = taggedRows.length > 0 ? taggedRows : manageableRows;
  if (attributedRows.length === 0) return empty;

  const questionIds = [...new Set(attributedRows.map((row) => row.question_id))];
  const unansweredRows = attributedRows.filter(
    (row) => !(manageableTopics.get(row.question_id) ?? false),
  );
  return {
    received: attributedRows.length,
    unanswered: unansweredRows.length,
    uniqueReceived: questionIds.length,
    uniqueUnanswered: new Set(unansweredRows.map((row) => row.question_id)).size,
    attribution: taggedRows.length > 0 ? "campaign_utm" : "time_window",
  };
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
 *  Deliberately NO name / PHI: just date + care need + state + where it came in.
 *  `outcome` is the provider's one-tap self-report ("did this family become a
 *  client?") from connections.metadata.provider_outcome — the receipt that
 *  closes the Franchil outcome-blindness gap. Null until they answer. */
export type ProviderLeadOutcome = "client" | "talking" | "no";

export interface CampaignLead {
  created_at: string;
  careNeed: string | null;
  state: string | null;
  entrySource: string | null;
  connectionId: string | null;
  outcome: ProviderLeadOutcome | null;
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
  const outcomeByConn: Record<string, ProviderLeadOutcome> = {};
  if (connIds.length > 0) {
    const { data: conns } = await db
      .from("connections")
      .select("id, message, metadata")
      .in("id", connIds);
    for (const c of (conns ?? []) as Array<{
      id: string;
      message: string | null;
      metadata: { provider_outcome?: { value?: string } } | null;
    }>) {
      careByConn[c.id] = careFromConnectionMessage(c.message);
      const v = c.metadata?.provider_outcome?.value;
      if (v === "client" || v === "talking" || v === "no") outcomeByConn[c.id] = v;
    }
  }
  for (const r of leadRows) {
    const connectionId = r.metadata?.connection_id || null;
    const care = (connectionId && careByConn[connectionId]) || {
      careNeed: null,
      state: null,
    };
    out.push({
      created_at: r.created_at,
      careNeed: care.careNeed,
      state: care.state,
      entrySource: "Provider page inquiry",
      connectionId,
      outcome: (connectionId && outcomeByConn[connectionId]) || null,
    });
  }

  // Secondary funnel — benefits completions. No connection row exists for
  // these, so there is nothing to hang a provider outcome on.
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
      connectionId: null,
      outcome: null,
    });
  }

  return out.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
}
