import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import { calculateProviderCompleteness } from "@/lib/admin/profile-completeness";

/**
 * Batch size for .in() queries to avoid URL length limits.
 * Each UUID is 36 chars; 150 UUIDs ≈ 5400 chars, safely under ~8000 limit.
 */
const IN_CLAUSE_BATCH_SIZE = 150;

/**
 * Helper to batch .in() queries and combine results.
 * Prevents URL length limit issues with large ID arrays.
 */
async function batchedInQuery<T>(
  db: ReturnType<typeof getServiceClient>,
  table: "olera-providers" | "business_profiles" | "provider_outreach_tracking",
  selectColumns: string,
  inColumn: string,
  ids: string[],
  additionalFilters?: { state?: string; city?: string; notDeleted?: boolean }
): Promise<T[]> {
  if (ids.length === 0) return [];

  const results: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CLAUSE_BATCH_SIZE) {
    const batch = ids.slice(i, i + IN_CLAUSE_BATCH_SIZE);
    let query = db.from(table).select(selectColumns).in(inColumn, batch);

    if (additionalFilters?.state) {
      query = query.eq("state", additionalFilters.state);
    }
    if (additionalFilters?.city) {
      query = query.eq("city", additionalFilters.city);
    }
    if (additionalFilters?.notDeleted) {
      query = query.or("deleted.is.null,deleted.eq.false");
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[provider-outreach] Batched query error on ${table}:`, error);
      throw new Error(`Failed to query ${table}`);
    }
    if (data) {
      results.push(...(data as T[]));
    }
  }
  return results;
}

/**
 * Outreach stages and their properties
 *
 * UI tabs: Needs Email | Ready | In Sequence | Follow Up | Re-Engage | Claimed | Archived
 *
 * "Needs Email" and "Ready" are filtered views of "not_contacted" (based on email presence)
 * "Follow Up" is the UI label for "needs_call" stage
 * "Re-Engage" is a new stage for providers needing re-engagement
 */
export const OUTREACH_STAGES = [
  "not_contacted",
  "in_sequence",
  "needs_call",  // UI: "Follow Up"
  "re_engage",   // Re-engagement waiting period (Alternative Channels)
  "call_exhausted",  // Final call state: manual resolution required
  "not_interested",  // Soft terminal: no outreach, but questions/connections still flow
  "claimed",
  "archived",  // Hard terminal: system-wide block
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

// Terminal stages - no more outreach
// not_interested = soft (questions/connections still flow)
// archived = hard (system-wide block)
export const TERMINAL_STAGES: OutreachStage[] = ["claimed", "not_interested", "archived"];

interface ProviderRow {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  zipcode: number | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
}

// Apollo contact structure stored in JSONB
interface ApolloContactData {
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  linkedin_url: string | null;
  found_at: string;
  credits_used?: number;
}

interface TrackingRow {
  id: string;
  provider_id: string;
  // Use string to allow for legacy "not_interested" values from database
  stage: string;
  city: string | null;
  state: string | null;
  stage_changed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Follow-up queue fields
  due_date: string | null;
  resend_count: number;
  no_answer_count: number;
  needs_call_reason: string | null;
  // Re-engage fields
  re_engage_entered_at: string | null;
  re_engage_channel: string | null;
  // Enrichment fields for alternative channels
  fax_number: string | null;
  fax_confidence: string | null;
  fax_source_url: string | null;
  mail_address: string | null;
  contact_form_url: string | null;
  contact_form_status: "found" | "not_found" | null;
  contact_form_send_count: number | null;
  // Assignment
  assigned_to: string | null;
  // Generic email warning state (persisted for page refresh)
  generic_email_called_at: string | null;
  generic_email_skipped_at: string | null;
  // Confirmation state (Ready tab)
  confirmed_at: string | null;
  // Apollo.io decision-maker enrichment
  apollo_contact: ApolloContactData | null;
  confirmed_by: string | null;
  // Email source tracking
  email_source: string | null;
}

export interface OutreachProvider {
  provider_id: string;
  provider_name: string;
  provider_category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  zipcode: number | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  slug: string | null;
  // Tracking info (if exists)
  tracking_id: string | null;
  stage: OutreachStage;
  stage_changed_at: string | null;
  notes: string | null;
  // Follow-up queue fields
  due_date: string | null;
  resend_count: number;
  no_answer_count: number;
  needs_call_reason: string | null;
  // Re-engage fields
  re_engage_entered_at: string | null;
  re_engage_channel: string | null;
  // Enrichment fields for alternative channels
  fax_number: string | null;
  fax_confidence: string | null;
  fax_source_url: string | null;
  mail_address: string | null;
  contact_form_url: string | null;
  contact_form_status: "found" | "not_found" | null;
  contact_form_send_count?: number;
  // Assignment
  assigned_to: string | null;
  // Sequence progress (for in_sequence stage)
  emails_sent?: number;
  sequence_status?: {
    last_email_at?: string;  // When last email was sent (for recency display)
    failed_step?: number;    // Cadence day that failed (0, 3, 7, 14)
    failed_reason?: string;  // Why it failed
  };
  // Engagement data (for needs_call stage) - powers intelligence recommendations
  engagement?: {
    emails_sent: number;
    opens: number;
    clicks: number;
    resends: number;  // Count of resend_link touchpoints
  };
  // For claimed providers
  verification_state?: "verified" | "pending" | "unverified" | "not_required" | "rejected" | null;
  profile_completeness?: number;
  // Email verification status from email_verifications table
  email_verification_status?: "valid" | "invalid" | "risky" | "unknown" | null;
  // Whether email has been manually overridden/trusted (from email_overrides table)
  is_email_overridden?: boolean;
  // Generic email warning state (persisted for page refresh)
  generic_email_called_at?: string | null;
  generic_email_skipped_at?: string | null;
  // Confirmation state (Ready tab)
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  // Questions and leads context
  questions_count?: number;
  leads_count?: number;
  // Apollo.io decision-maker enrichment
  apollo_contact?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    linkedin_url: string | null;
    found_at: string;
  } | null;
  // Email source: 'organization' (scraped/manual) or 'decision_maker' (Apollo)
  email_source?: "organization" | "decision_maker" | null;
  // Count of notes in provider_outreach_notes table (for icon fill state)
  notes_count?: number;
}

/**
 * Enrich providers with email verification status and override status.
 * Queries both email_verifications and email_overrides tables.
 */
async function enrichWithEmailVerification(
  db: ReturnType<typeof getServiceClient>,
  providers: OutreachProvider[]
): Promise<OutreachProvider[]> {
  // Get all unique emails (lowercase, trimmed)
  const emails = providers
    .map((p) => p.email?.toLowerCase().trim())
    .filter((e): e is string => !!e);

  if (emails.length === 0) return providers;

  // Fetch verification statuses and overrides in parallel
  const [{ data: verifications }, { data: overrides }] = await Promise.all([
    db.from("email_verifications").select("email, status").in("email", emails),
    db.from("email_overrides").select("email").in("email", emails),
  ]);

  // Build lookup maps
  const statusMap = new Map(
    (verifications || []).map((v) => [v.email.toLowerCase(), v.status as "valid" | "invalid" | "risky" | "unknown"])
  );
  const overrideSet = new Set(
    (overrides || []).map((o) => o.email.toLowerCase())
  );

  // Enrich providers
  return providers.map((p) => {
    const emailKey = p.email?.toLowerCase().trim();
    return {
      ...p,
      email_verification_status: emailKey ? statusMap.get(emailKey) ?? null : null,
      is_email_overridden: emailKey ? overrideSet.has(emailKey) : false,
    };
  });
}

/**
 * Enrich providers with questions count and leads count.
 * Questions: linked by slug in provider_questions.provider_id
 * Leads: linked via business_profiles.id -> connections.to_profile_id
 */
async function enrichWithQuestionsAndLeads(
  db: ReturnType<typeof getServiceClient>,
  providers: OutreachProvider[]
): Promise<OutreachProvider[]> {
  if (providers.length === 0) return providers;

  // Get slugs for question lookup
  const slugs = providers
    .map((p) => p.slug)
    .filter((s): s is string => !!s);

  // Get provider_ids for business_profile lookup (to get leads)
  const providerIds = providers.map((p) => p.provider_id).filter(Boolean);

  // Parallel queries: questions by slug, business_profiles by source_provider_id
  const [questionsResult, bpResult] = await Promise.all([
    slugs.length > 0
      ? db
          .from("provider_questions")
          .select("provider_id")
          .in("provider_id", slugs)
      : Promise.resolve({ data: [] }),
    providerIds.length > 0
      ? db
          .from("business_profiles")
          .select("id, source_provider_id")
          .in("source_provider_id", providerIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Count questions per slug
  const questionCounts = new Map<string, number>();
  for (const q of questionsResult.data || []) {
    const slug = q.provider_id;
    questionCounts.set(slug, (questionCounts.get(slug) || 0) + 1);
  }

  // Map provider_id -> business_profile.id
  const bpIdByProviderId = new Map<string, string>();
  for (const bp of bpResult.data || []) {
    if (bp.source_provider_id && bp.id) {
      bpIdByProviderId.set(bp.source_provider_id, bp.id);
    }
  }

  // Get business profile IDs that exist
  const bpIds = [...bpIdByProviderId.values()];

  // Query leads (connections with type = 'inquiry')
  let leadCounts = new Map<string, number>();
  if (bpIds.length > 0) {
    const { data: connections } = await db
      .from("connections")
      .select("to_profile_id")
      .in("to_profile_id", bpIds)
      .eq("type", "inquiry");

    for (const c of connections || []) {
      const bpId = c.to_profile_id;
      leadCounts.set(bpId, (leadCounts.get(bpId) || 0) + 1);
    }
  }

  // Enrich providers
  return providers.map((p) => {
    const qCount = p.slug ? questionCounts.get(p.slug) || 0 : 0;
    const bpId = bpIdByProviderId.get(p.provider_id);
    const lCount = bpId ? leadCounts.get(bpId) || 0 : 0;
    return {
      ...p,
      questions_count: qCount,
      leads_count: lCount,
    };
  });
}

/**
 * Enrich providers with notes count from provider_outreach_notes table.
 * This is used for the notes icon fill state in the UI.
 * Uses batching to avoid URL length limits with large provider lists.
 */
async function enrichWithNotesCount(
  db: ReturnType<typeof getServiceClient>,
  providers: OutreachProvider[]
): Promise<OutreachProvider[]> {
  if (providers.length === 0) return providers;

  const providerIds = providers.map((p) => p.provider_id).filter(Boolean);

  if (providerIds.length === 0) return providers;

  // Query notes in batches to avoid URL length limits
  const notesCounts = new Map<string, number>();

  for (let i = 0; i < providerIds.length; i += IN_CLAUSE_BATCH_SIZE) {
    const batch = providerIds.slice(i, i + IN_CLAUSE_BATCH_SIZE);

    const { data: notesRows, error } = await db
      .from("provider_outreach_notes")
      .select("provider_id")
      .in("provider_id", batch);

    if (error) {
      console.error("[enrichWithNotesCount] Query error:", error);
      // Continue with other batches, don't fail entirely
      continue;
    }

    // Count notes per provider
    for (const row of notesRows || []) {
      const count = notesCounts.get(row.provider_id) || 0;
      notesCounts.set(row.provider_id, count + 1);
    }
  }

  // Enrich providers
  return providers.map((p) => ({
    ...p,
    notes_count: notesCounts.get(p.provider_id) || 0,
  }));
}

/**
 * GET /api/admin/provider-outreach
 *
 * List providers by stage with optional city filter.
 *
 * Query params:
 *   - state (required): State to filter by
 *   - stage (optional): Filter by stage (default: "not_contacted")
 *   - city (optional): Filter by city
 *
 * For "not_contacted" stage:
 *   Returns unclaimed providers not in tracking table (or with stage = not_contacted)
 *
 * For other stages:
 *   Returns providers from tracking table with that stage, joined with provider details
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
    const state = searchParams.get("state");
    // Allow "hidden" as a special stage for viewing admin-hidden providers
    const stage = (searchParams.get("stage") || "not_contacted") as OutreachStage | "hidden";
    const city = searchParams.get("city");
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    // email_filter: "needs_email" | "has_email" - only applies to not_contacted stage
    const emailFilter = searchParams.get("email_filter") as "needs_email" | "has_email" | null;
    // assigned_to: "me" to filter by current admin, or a specific admin user ID
    const assignedToParam = searchParams.get("assigned_to");

    if (!state) {
      return NextResponse.json({ error: "State parameter is required" }, { status: 400 });
    }

    // Allow legacy "hidden" stage queries but don't include in validation
    const validStages = [...OUTREACH_STAGES, "hidden"] as string[];
    if (!validStages.includes(stage)) {
      return NextResponse.json({ error: "Invalid stage parameter" }, { status: 400 });
    }

    const db = getServiceClient();

    // Get stage counts for tabs, admin counts for filter chips, and follow-ups due today
    // Wrap in individual try-catches so one failing doesn't crash the whole request
    const [stageCounts, adminCounts, followUpsTodayStats] = await Promise.all([
      getStageCounts(db, state).catch((err) => {
        console.error("[provider-outreach] getStageCounts error:", err);
        return {
          not_contacted: 0, in_sequence: 0, needs_call: 0, re_engage: 0, call_exhausted: 0,
          not_interested: 0, claimed: 0, archived: 0, needs_email: 0, ready: 0, hidden: 0,
        };
      }),
      // Admin counts are not applicable for "hidden" stage - skip the call
      stage === "hidden"
        ? Promise.resolve({})
        : getAdminCounts(db, state, stage, emailFilter).catch((err) => {
            console.error("[provider-outreach] getAdminCounts error:", err);
            return {};
          }),
      getFollowUpsTodayStats(db, state).catch((err) => {
        console.error("[provider-outreach] getFollowUpsTodayStats error:", err);
        return { total: 0, by_admin: [] };
      }),
    ]);

    // If search is provided, search across ALL stages and return flat results
    if (search) {
      const searchResults = await searchProviders(db, state, search);
      const withEmail = await enrichWithEmailVerification(db, searchResults);
      const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
      const enriched = await enrichWithNotesCount(db, withQuestions);
      return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats, is_search: true });
    }

    if (stage === "not_contacted") {
      // Special case: providers NOT in tracking OR with stage = not_contacted
      // email_filter allows splitting into "Needs Email" and "Ready" tabs
      const providers = await getNotContactedProviders(db, state, city, emailFilter);
      const withEmail = await enrichWithEmailVerification(db, providers);
      const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
      const enriched = await enrichWithNotesCount(db, withQuestions);
      // Compute admin counts from the providers list (includes display_name for filter chips)
      const computedAdminCounts = await computeAdminCountsFromProviders(db, providers);
      return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: computedAdminCounts, follow_ups_today: followUpsTodayStats });
    }

    if (stage === "claimed") {
      // Special case: "Claimed" shows ACTUAL claimed providers (from business_profiles)
      const providers = await getClaimedProviders(db, state, city);
      const withEmail = await enrichWithEmailVerification(db, providers);
      const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
      const enriched = await enrichWithNotesCount(db, withQuestions);
      return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats });
    }

    // Resolve assigned_to filter: "me" means current admin user
    const assignedToFilter = assignedToParam === "me" ? adminUser.id : assignedToParam;

    // For ALL non-claimed stages: query tracking but exclude providers who have since claimed
    // This ensures a provider only appears in ONE tab (Claimed wins if they've claimed)
    let trackingQuery = db
      .from("provider_outreach_tracking")
      .select("*")
      .eq("state", state);

    // When querying "hidden", show admin_hidden providers for recovery
    if (stage === "hidden") {
      const providers = await getHiddenProviders(db, state, city);
      const withEmail = await enrichWithEmailVerification(db, providers);
      const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
      const enriched = await enrichWithNotesCount(db, withQuestions);
      return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats });
    }

    // When querying "archived", use special function that merges tracking + system-wide archived
    if (stage === "archived") {
      const providers = await getArchivedProviders(db, state, city);
      const withEmail = await enrichWithEmailVerification(db, providers);
      const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
      const enriched = await enrichWithNotesCount(db, withQuestions);
      return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats });
    }

    // For other stages: query tracking but exclude providers who have since claimed
    // Also exclude admin_hidden providers (removed from outreach view)
    trackingQuery = trackingQuery
      .eq("stage", stage)
      .or("admin_hidden.is.null,admin_hidden.eq.false");

    if (city) {
      trackingQuery = trackingQuery.eq("city", city);
    }

    // Filter by assigned admin if specified
    if (assignedToFilter) {
      trackingQuery = trackingQuery.eq("assigned_to", assignedToFilter);
    }

    const { data: trackingRows, error: trackingError } = await trackingQuery;

    if (trackingError) {
      console.error("[provider-outreach] Tracking query error:", trackingError);
      return NextResponse.json({ error: "Failed to fetch tracking data" }, { status: 500 });
    }

    if (!trackingRows || trackingRows.length === 0) {
      return NextResponse.json({ providers: [], stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats });
    }

    // Get provider details for tracked providers (exclude deleted)
    const providerIds = trackingRows.map((t) => t.provider_id);
    const { data: providerRows, error: provError } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
      .in("provider_id", providerIds)
      .or("deleted.is.null,deleted.eq.false");

    if (provError) {
      console.error("[provider-outreach] Provider query error:", provError);
      return NextResponse.json({ error: "Failed to fetch provider details" }, { status: 500 });
    }

    // Exclude providers who have since claimed (they belong in "Claimed" tab now)
    let claimedProviderIds = new Set<string>();
    if (providerIds.length > 0) {
      const { data: claimedBps } = await db
        .from("business_profiles")
        .select("source_provider_id")
        .in("source_provider_id", providerIds)
        .not("account_id", "is", null);

      claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));
    }

    // Exclude system-archived providers (they belong in "Archived" tab now)
    // System-archived = admin_archived=true in business_profiles (from Questions/Connections)
    let systemArchivedProviderIds = new Set<string>();
    if (providerIds.length > 0) {
      const { data: archivedBps } = await db
        .from("business_profiles")
        .select("source_provider_id")
        .in("source_provider_id", providerIds)
        .filter("metadata->>admin_archived", "eq", "true");

      systemArchivedProviderIds = new Set(
        (archivedBps || []).map((bp) => bp.source_provider_id).filter(Boolean)
      );
    }

    // For in_sequence stage, get email sent counts from touchpoints
    // Only count emails sent during the CURRENT sequence (since stage_changed_at)
    let emailsSentMap = new Map<string, number>();
    // For needs_call stage, get full engagement data for intelligence recommendations
    // Only count touchpoints from the CURRENT cycle (after entering needs_call)
    let engagementMap = new Map<string, { emails_sent: number; opens: number; clicks: number; resends: number }>();

    if (stage === "needs_call" && providerIds.length > 0) {
      // Build map of provider_id -> stage_changed_at for filtering to current cycle
      // We look at when they entered their PREVIOUS stage (in_sequence) to get all sequence touchpoints
      // Actually, for needs_call we want engagement from the sequence that led here,
      // so we need to look back further. For now, fetch all and let the UI interpret.
      // A better approach would be to store engagement summary when transitioning stages.
      const { data: touchpoints } = await db
        .from("provider_outreach_touchpoints")
        .select("provider_id, touchpoint_type, details")
        .in("provider_id", providerIds);

      // Aggregate engagement metrics per provider
      // Use email_sent touchpoint's open_count/click_count (SmartLead aggregates) as primary source
      // Don't double-count from separate email_opened/email_clicked events
      for (const tp of touchpoints || []) {
        if (!engagementMap.has(tp.provider_id)) {
          engagementMap.set(tp.provider_id, { emails_sent: 0, opens: 0, clicks: 0, resends: 0 });
        }
        const metrics = engagementMap.get(tp.provider_id)!;
        const details = tp.details as Record<string, unknown> | null;

        switch (tp.touchpoint_type) {
          case "email_sent":
            metrics.emails_sent += 1;
            // SmartLead touchpoints include open_count and click_count in details
            // Use these as the authoritative source (they're aggregates per email)
            if (details) {
              metrics.opens += Number(details.open_count ?? 0);
              metrics.clicks += Number(details.click_count ?? 0);
            }
            break;
          // Note: We intentionally skip email_opened/email_clicked touchpoint types
          // to avoid double-counting with the open_count/click_count in email_sent details
          case "resend_link":
            metrics.resends += 1;
            break;
        }
      }
    }

    // Sequence status map for in_sequence providers (last email, failed tasks)
    let sequenceStatusMap = new Map<string, { last_email_at?: string; failed_step?: number; failed_reason?: string }>();

    if (stage === "in_sequence" && providerIds.length > 0) {
      // Build map of provider_id -> stage_changed_at for filtering
      const stageChangedMap = new Map<string, string>();
      for (const t of trackingRows as TrackingRow[]) {
        if (t.stage_changed_at) {
          stageChangedMap.set(t.provider_id, t.stage_changed_at);
        }
      }

      const { data: touchpoints } = await db
        .from("provider_outreach_touchpoints")
        .select("provider_id, created_at, details")
        .in("provider_id", providerIds)
        .eq("touchpoint_type", "email_sent");

      // Count emails per provider, only those created after entering in_sequence
      // Also track engagement (opens/clicks) and the most recent email sent time
      for (const tp of touchpoints || []) {
        const stageChangedAt = stageChangedMap.get(tp.provider_id);
        // Only count if touchpoint was created after entering current sequence
        if (stageChangedAt && tp.created_at >= stageChangedAt) {
          const count = emailsSentMap.get(tp.provider_id) || 0;
          emailsSentMap.set(tp.provider_id, count + 1);

          // Track engagement (opens/clicks from SmartLead)
          const details = tp.details as Record<string, unknown> | null;
          if (!engagementMap.has(tp.provider_id)) {
            engagementMap.set(tp.provider_id, { emails_sent: 0, opens: 0, clicks: 0, resends: 0 });
          }
          const metrics = engagementMap.get(tp.provider_id)!;
          metrics.emails_sent += 1;
          if (details) {
            metrics.opens += Number(details.open_count ?? 0);
            metrics.clicks += Number(details.click_count ?? 0);
          }

          // Track last email time
          const existing = sequenceStatusMap.get(tp.provider_id);
          if (!existing?.last_email_at || tp.created_at > existing.last_email_at) {
            sequenceStatusMap.set(tp.provider_id, { ...existing, last_email_at: tp.created_at });
          }
        }
      }

      // Query tasks to find failed sequences - use tracking_ids to filter to current sequence only
      const trackingIds = (trackingRows as TrackingRow[])
        .filter(t => t.stage === "in_sequence")
        .map(t => t.id);

      if (trackingIds.length > 0) {
        const { data: tasks } = await db
          .from("provider_outreach_tasks")
          .select("provider_id, cadence_day, status, payload")
          .in("tracking_id", trackingIds)
          .eq("status", "failed");

        // Build failed task info per provider (take the first/most relevant failed task)
        for (const task of tasks || []) {
          const existing = sequenceStatusMap.get(task.provider_id) || {};
          // Only set if not already set (first failed task takes priority)
          if (existing.failed_step === undefined) {
            const payload = task.payload as Record<string, unknown> | null;
            sequenceStatusMap.set(task.provider_id, {
              ...existing,
              failed_step: task.cadence_day,
              failed_reason: (payload?.error as string) || "Send failed",
            });
          }
        }
      }
    }

    // Join tracking with provider data
    const providerMap = new Map((providerRows || []).map((p) => [p.provider_id, p as ProviderRow]));
    const providers = (trackingRows as TrackingRow[])
      .map((t): OutreachProvider | null => {
        const p = providerMap.get(t.provider_id);
        if (!p) return null;
        // Skip if provider has claimed - they belong in Claimed tab now
        if (claimedProviderIds.has(p.provider_id)) return null;
        // Skip if provider is system-archived - they belong in Archived tab now
        if (systemArchivedProviderIds.has(p.provider_id)) return null;
        return {
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          provider_category: p.provider_category,
          city: p.city,
          state: p.state,
          address: p.address,
          zipcode: p.zipcode,
          email: p.email,
          phone: p.phone,
          website: p.website,
          slug: p.slug,
          tracking_id: t.id,
          stage: t.stage as OutreachStage,
          stage_changed_at: t.stage_changed_at,
          notes: t.notes,
          // Follow-up queue fields
          due_date: t.due_date,
          resend_count: t.resend_count ?? 0,
          no_answer_count: t.no_answer_count ?? 0,
          needs_call_reason: t.needs_call_reason ?? null,
          // Re-engage fields
          re_engage_entered_at: t.re_engage_entered_at ?? null,
          re_engage_channel: t.re_engage_channel ?? null,
          // Enrichment fields for alternative channels
          fax_number: t.fax_number ?? null,
          fax_confidence: t.fax_confidence ?? null,
          fax_source_url: t.fax_source_url ?? null,
          mail_address: t.mail_address ?? null,
          contact_form_url: t.contact_form_url ?? null,
          contact_form_status: t.contact_form_status ?? null,
          contact_form_send_count: t.contact_form_send_count ?? 0,
          // Assignment
          assigned_to: t.assigned_to ?? null,
          // Sequence progress (for in_sequence)
          emails_sent: stage === "in_sequence" ? (emailsSentMap.get(p.provider_id) || 0) : undefined,
          sequence_status: stage === "in_sequence" ? sequenceStatusMap.get(p.provider_id) : undefined,
          // Engagement data (for in_sequence and needs_call)
          engagement: (stage === "in_sequence" || stage === "needs_call") ? engagementMap.get(p.provider_id) : undefined,
          // Generic email warning state (persisted for page refresh)
          generic_email_called_at: t.generic_email_called_at ?? null,
          generic_email_skipped_at: t.generic_email_skipped_at ?? null,
          // Apollo.io decision-maker enrichment
          apollo_contact: t.apollo_contact ?? null,
        };
      })
      .filter((p): p is OutreachProvider => p !== null)
      .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

    const withEmail = await enrichWithEmailVerification(db, providers);
    const withQuestions = await enrichWithQuestionsAndLeads(db, withEmail);
    const enriched = await enrichWithNotesCount(db, withQuestions);
    return NextResponse.json({ providers: enriched, stage_counts: stageCounts, admin_counts: adminCounts, follow_ups_today: followUpsTodayStats });
  } catch (err) {
    console.error("[provider-outreach] Error:", err);
    return NextResponse.json(
      { error: `Internal server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * Get providers in "not_contacted" stage:
 * - Not deleted
 * - Not claimed (no business_profile with account_id)
 * - Not in tracking table OR in tracking with stage = not_contacted
 *
 * FIXED: Avoids large IN clauses by querying exclusion sets separately
 */
async function getNotContactedProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  city: string | null,
  emailFilter?: "needs_email" | "has_email" | null
): Promise<OutreachProvider[]> {
  // Step 1: Get all claimed provider IDs (small set ~600 total)
  // We query ALL claimed, then filter in JS - avoids large IN clause
  const { data: allClaimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .not("source_provider_id", "is", null)
    .not("account_id", "is", null);

  const claimedProviderIds = new Set(
    (allClaimedBps || []).map((bp) => bp.source_provider_id).filter(Boolean)
  );

  // Step 2: Get all tracked provider IDs for this state (filtered by state, small set)
  // Include admin_hidden to filter out hidden providers
  const { data: trackedInState, error: trackingError } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, id, stage, stage_changed_at, notes, due_date, resend_count, no_answer_count, needs_call_reason, cycle_number, re_engage_entered_at, re_engage_channel, fax_number, fax_confidence, fax_source_url, mail_address, contact_form_url, contact_form_status, contact_form_send_count, assigned_to, state, admin_hidden, generic_email_called_at, generic_email_skipped_at, confirmed_at, confirmed_by, apollo_contact, email_source")
    .eq("state", state);

  if (trackingError) {
    console.error("[getNotContactedProviders] Tracking query error:", trackingError);
  }

  // Collect hidden provider IDs (these should be excluded regardless of stage)
  // Use truthy check (not strict ===) to handle any DB type variations
  const hiddenProviderIds = new Set(
    (trackedInState || [])
      .filter((t) => t.admin_hidden)
      .map((t) => t.provider_id)
  );

  // Collect providers with non-not_contacted stages (these should also be excluded from Ready)
  // These are providers actively being worked in other stages
  const nonNotContactedTracking = (trackedInState || []).filter(
    (t) => t.stage !== "not_contacted" && !t.admin_hidden
  );

  const trackedProviderIds = new Set(
    nonNotContactedTracking.map((t) => t.provider_id)
  );

  // Build map for not_contacted tracking records (for tracking_id)
  // Exclude hidden providers - they shouldn't appear in the list at all
  const notContactedMap = new Map(
    (trackedInState || [])
      .filter((t) => t.stage === "not_contacted" && !t.admin_hidden)
      .map((t) => [t.provider_id, t])
  );

  // Step 3: Get city owners for this state (for auto-assignment of new providers)
  const { data: cityOwners } = await db
    .from("provider_outreach_city_owners")
    .select("city, owner_id")
    .eq("state", state)
    .not("owner_id", "is", null);

  const cityOwnerMap = new Map<string, string>();
  for (const co of cityOwners || []) {
    if (co.city && co.owner_id) {
      cityOwnerMap.set(co.city, co.owner_id);
    }
  }

  // Step 4: Get all providers in this state (we need to display them anyway)
  let providerQuery = db
    .from("olera-providers")
    .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (city) {
    providerQuery = providerQuery.eq("city", city);
  }

  const { data: providers, error: provError } = await providerQuery;

  if (provError) {
    console.error("[provider-outreach] Provider query error:", provError);
    throw new Error("Failed to fetch providers");
  }

  if (!providers || providers.length === 0) {
    return [];
  }

  // Step 5: Filter in JavaScript (no large IN clause needed)
  // Exclude claimed, tracked (in other stages), and hidden providers
  let result: OutreachProvider[] = (providers as ProviderRow[])
    .filter((p) => !claimedProviderIds.has(p.provider_id) && !trackedProviderIds.has(p.provider_id) && !hiddenProviderIds.has(p.provider_id))
    .map((p) => {
      const tracking = notContactedMap.get(p.provider_id);
      return {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        address: p.address,
        zipcode: p.zipcode,
        email: p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: tracking?.id ?? null,
        stage: "not_contacted" as OutreachStage,
        stage_changed_at: tracking?.stage_changed_at ?? null,
        notes: tracking?.notes ?? null,
        // Follow-up queue fields (not applicable for not_contacted)
        due_date: null,
        resend_count: 0,
        no_answer_count: 0,
        needs_call_reason: null,
        // Re-engage fields
        re_engage_entered_at: null,
        re_engage_channel: null,
        fax_number: null,
        fax_confidence: null,
        fax_source_url: null,
        mail_address: null,
        contact_form_url: null,
        contact_form_status: null,
        contact_form_send_count: 0,
        // Assignment: use tracking assignment, or fall back to city owner
        assigned_to: tracking?.assigned_to ?? (p.city ? cityOwnerMap.get(p.city) : null) ?? null,
        // Generic email warning state (from tracking if exists)
        generic_email_called_at: tracking?.generic_email_called_at ?? null,
        generic_email_skipped_at: tracking?.generic_email_skipped_at ?? null,
        // Confirmation state (Ready tab)
        confirmed_at: tracking?.confirmed_at ?? null,
        confirmed_by: tracking?.confirmed_by ?? null,
        // Apollo.io decision-maker enrichment
        apollo_contact: tracking?.apollo_contact ?? null,
        // Email source: 'organization' or 'decision_maker'
        email_source: (tracking?.email_source as "organization" | "decision_maker") ?? "organization",
      };
    });

  // Step 6: Apply email filter if specified (for Needs Email / Ready tabs)
  // A provider "has email" if they have EITHER a generic email OR an Apollo email
  if (emailFilter === "needs_email") {
    result = result.filter((p) =>
      (!p.email || !p.email.trim()) && !p.apollo_contact?.email
    );
  } else if (emailFilter === "has_email") {
    result = result.filter((p) =>
      (p.email && p.email.trim()) || p.apollo_contact?.email
    );
  }

  return result.sort((a, b) => a.provider_name.localeCompare(b.provider_name));
}

/**
 * Get providers who have ACTUALLY claimed their accounts (from business_profiles)
 * This is the source of truth for "Claimed" - not the tracking table
 */
async function getClaimedProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  city: string | null
): Promise<OutreachProvider[]> {
  // FIXED: Query claimed business_profiles first (small set ~600), then fetch provider details
  // Previous approach queried all providers in state (~10k) and used .in() which exceeded URL limits

  // Step 1: Get all claimed business_profiles with source_provider_id
  // Include fields needed for profile completeness calculation
  const { data: claimedBps, error: bpError } = await db
    .from("business_profiles")
    .select("source_provider_id, created_at, updated_at, verification_state, email, phone, website, address, city, state, display_name, description, image_url, care_types, metadata")
    .not("source_provider_id", "is", null)
    .not("account_id", "is", null);

  if (bpError) {
    console.error("[provider-outreach] Business profiles query error:", bpError);
    throw new Error("Failed to fetch claimed providers");
  }

  if (!claimedBps || claimedBps.length === 0) {
    return [];
  }

  // Step 2: Get provider details for the claimed ones, filtered by state
  // Uses batched query to avoid URL length limits
  const claimedProviderIds = claimedBps.map((bp) => bp.source_provider_id).filter(Boolean) as string[];

  const providers = await batchedInQuery<ProviderRow>(
    db,
    "olera-providers",
    "provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug",
    "provider_id",
    claimedProviderIds,
    { state, city: city || undefined, notDeleted: true }
  );

  if (providers.length === 0) {
    return [];
  }

  // Create a map of claimed provider_id -> { timestamp, verification_state, email, profile data }
  const claimedMap = new Map(
    claimedBps.map((bp) => {
      // Calculate profile completeness
      const completeness = calculateProviderCompleteness({
        display_name: bp.display_name as string | null,
        image_url: bp.image_url as string | null,
        phone: bp.phone as string | null,
        email: bp.email as string | null,
        website: bp.website as string | null,
        address: bp.address as string | null,
        city: bp.city as string | null,
        state: bp.state as string | null,
        description: bp.description as string | null,
        care_types: bp.care_types as string[] | null,
        metadata: bp.metadata as Record<string, unknown> | null,
      });

      return [
        bp.source_provider_id,
        {
          timestamp: bp.updated_at || bp.created_at,
          verification_state: bp.verification_state as OutreachProvider["verification_state"],
          email: bp.email as string | null,
          profile_completeness: completeness.percentage,
        },
      ];
    })
  );

  // Build result with business_profiles email taking precedence
  const result: OutreachProvider[] = (providers as ProviderRow[])
    .map((p) => {
      const claimInfo = claimedMap.get(p.provider_id);
      return {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        address: p.address,
        zipcode: p.zipcode,
        email: claimInfo?.email || p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: null,
        stage: "claimed" as OutreachStage,
        stage_changed_at: claimInfo?.timestamp || null,
        notes: null,
        // Follow-up queue fields (not applicable for claimed)
        due_date: null,
        resend_count: 0,
        no_answer_count: 0,
        needs_call_reason: null,
        // Re-engage fields
        re_engage_entered_at: null,
        re_engage_channel: null,
        fax_number: null,
        fax_confidence: null,
        fax_source_url: null,
        mail_address: null,
        contact_form_url: null,
        contact_form_status: null,
        contact_form_send_count: 0,
        // Assignment (not applicable for claimed)
        assigned_to: null,
        verification_state: claimInfo?.verification_state || null,
        profile_completeness: claimInfo?.profile_completeness,
        // Generic email warning state (not applicable for claimed)
        generic_email_called_at: null,
        generic_email_skipped_at: null,
      };
    })
    .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

  return result;
}

/**
 * Get providers that have been hidden from outreach (admin_hidden = true).
 * Used for viewing and recovering accidentally hidden providers.
 *
 * Excludes claimed providers (they belong in Claimed tab, not Hidden).
 */
async function getHiddenProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  city: string | null
): Promise<OutreachProvider[]> {
  // Query tracking records where admin_hidden = true
  let trackingQuery = db
    .from("provider_outreach_tracking")
    .select("*")
    .eq("state", state)
    .eq("admin_hidden", true);

  if (city) {
    trackingQuery = trackingQuery.eq("city", city);
  }

  const { data: trackingRows, error: trackingError } = await trackingQuery;

  if (trackingError) {
    console.error("[getHiddenProviders] Tracking query error:", trackingError);
    throw new Error("Failed to query hidden providers");
  }

  if (!trackingRows || trackingRows.length === 0) {
    return [];
  }

  // Get provider details
  const providerIds = trackingRows.map((t) => t.provider_id);
  const { data: providerRows, error: provError } = await db
    .from("olera-providers")
    .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
    .in("provider_id", providerIds)
    .or("deleted.is.null,deleted.eq.false");

  if (provError) {
    console.error("[getHiddenProviders] Provider query error:", provError);
    throw new Error("Failed to fetch provider details");
  }

  // Exclude providers who have since claimed (they belong in Claimed tab)
  let claimedProviderIds = new Set<string>();
  if (providerIds.length > 0) {
    const { data: claimedBps } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .in("source_provider_id", providerIds)
      .not("account_id", "is", null);

    claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));
  }

  const providerMap = new Map((providerRows || []).map((p) => [p.provider_id, p as ProviderRow]));

  // Build result (excluding claimed providers)
  const providers = (trackingRows as TrackingRow[])
    .map((t): OutreachProvider | null => {
      const p = providerMap.get(t.provider_id);
      if (!p) return null;
      // Skip if provider has claimed - they belong in Claimed tab now
      if (claimedProviderIds.has(p.provider_id)) return null;

      return {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        address: p.address,
        zipcode: p.zipcode,
        email: p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: t.id,
        stage: t.stage as OutreachStage,
        stage_changed_at: t.stage_changed_at,
        notes: t.notes,
        due_date: t.due_date,
        resend_count: t.resend_count ?? 0,
        no_answer_count: t.no_answer_count ?? 0,
        needs_call_reason: t.needs_call_reason ?? null,
        re_engage_entered_at: t.re_engage_entered_at ?? null,
        re_engage_channel: t.re_engage_channel ?? null,
        fax_number: t.fax_number ?? null,
        fax_confidence: t.fax_confidence ?? null,
        fax_source_url: t.fax_source_url ?? null,
        mail_address: t.mail_address ?? null,
        contact_form_url: t.contact_form_url ?? null,
        contact_form_status: t.contact_form_status ?? null,
        contact_form_send_count: t.contact_form_send_count ?? 0,
        assigned_to: t.assigned_to ?? null,
        // Generic email warning state (persisted for page refresh)
        generic_email_called_at: t.generic_email_called_at ?? null,
        generic_email_skipped_at: t.generic_email_skipped_at ?? null,
        // Apollo.io decision-maker enrichment
        apollo_contact: t.apollo_contact ?? null,
      };
    })
    .filter((p): p is OutreachProvider => p !== null)
    .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

  return providers;
}

/**
 * Get archived providers from BOTH sources:
 * 1. provider_outreach_tracking where stage = "archived" (hard terminal only)
 * 2. business_profiles where metadata.admin_archived = true
 *
 * Note: "not_interested" is now a separate soft-terminal stage with its own tab.
 * This function only handles hard-archived providers.
 */
async function getArchivedProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  city: string | null
): Promise<OutreachProvider[]> {
  // Track all archived provider IDs to dedupe
  const archivedProviderMap = new Map<string, OutreachProvider>();

  // Step 1: Get providers from tracking table with stage = archived (hard terminal only)
  // Exclude admin_hidden providers (they're hidden from all tabs)
  let trackingQuery = db
    .from("provider_outreach_tracking")
    .select("*")
    .eq("state", state)
    .eq("stage", "archived")
    .or("admin_hidden.is.null,admin_hidden.eq.false");

  if (city) {
    trackingQuery = trackingQuery.eq("city", city);
  }

  const { data: trackingRows } = await trackingQuery;

  if (trackingRows && trackingRows.length > 0) {
    const trackingProviderIds = trackingRows.map((t) => t.provider_id);

    // Get provider details
    const { data: providerRows } = await db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
      .in("provider_id", trackingProviderIds);

    const providerMap = new Map((providerRows || []).map((p) => [p.provider_id, p as ProviderRow]));

    // Exclude claimed providers
    const { data: claimedBps } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .in("source_provider_id", trackingProviderIds)
      .not("account_id", "is", null);

    const claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));

    for (const t of trackingRows as TrackingRow[]) {
      const p = providerMap.get(t.provider_id);
      if (!p) continue;
      if (claimedProviderIds.has(p.provider_id)) continue;

      archivedProviderMap.set(p.provider_id, {
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_category: p.provider_category,
        city: p.city,
        state: p.state,
        address: p.address,
        zipcode: p.zipcode,
        email: p.email,
        phone: p.phone,
        website: p.website,
        slug: p.slug,
        tracking_id: t.id,
        stage: "archived" as OutreachStage,
        stage_changed_at: t.stage_changed_at,
        notes: t.notes,
        // Follow-up queue fields (not applicable for archived)
        due_date: null,
        resend_count: 0,
        no_answer_count: 0,
        needs_call_reason: null,
        // Re-engage fields
        re_engage_entered_at: t.re_engage_entered_at ?? null,
        re_engage_channel: t.re_engage_channel ?? null,
        fax_number: t.fax_number ?? null,
        fax_confidence: t.fax_confidence ?? null,
        fax_source_url: t.fax_source_url ?? null,
        mail_address: t.mail_address ?? null,
        contact_form_url: t.contact_form_url ?? null,
        contact_form_status: t.contact_form_status ?? null,
        contact_form_send_count: t.contact_form_send_count ?? 0,
        // Assignment
        assigned_to: t.assigned_to ?? null,
        // Generic email warning state
        generic_email_called_at: t.generic_email_called_at ?? null,
        generic_email_skipped_at: t.generic_email_skipped_at ?? null,
        // Apollo.io decision-maker enrichment
        apollo_contact: t.apollo_contact ?? null,
      });
    }
  }

  // Step 2: Get system-wide archived providers (admin_archived = true in business_profiles)
  const { data: adminArchivedBps } = await db
    .from("business_profiles")
    .select("source_provider_id, metadata, updated_at")
    .not("source_provider_id", "is", null)
    .filter("metadata->>admin_archived", "eq", "true");

  if (adminArchivedBps && adminArchivedBps.length > 0) {
    const adminArchivedSourceIds = adminArchivedBps
      .map((bp) => bp.source_provider_id)
      .filter(Boolean) as string[];

    // Get provider details from olera-providers, filtered by state
    let providerQuery = db
      .from("olera-providers")
      .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
      .in("provider_id", adminArchivedSourceIds)
      .eq("state", state)
      .or("deleted.is.null,deleted.eq.false");

    if (city) {
      providerQuery = providerQuery.eq("city", city);
    }

    const { data: providerRows } = await providerQuery;

    if (providerRows && providerRows.length > 0) {
      // Exclude claimed providers
      const { data: claimedBps } = await db
        .from("business_profiles")
        .select("source_provider_id")
        .in("source_provider_id", providerRows.map((p) => p.provider_id))
        .not("account_id", "is", null);

      const claimedProviderIds = new Set((claimedBps || []).map((bp) => bp.source_provider_id));

      // Create a map of provider_id -> metadata for archive info
      const metaMap = new Map(
        adminArchivedBps.map((bp) => [
          bp.source_provider_id,
          {
            metadata: bp.metadata as Record<string, unknown>,
            updated_at: bp.updated_at,
          },
        ])
      );

      for (const p of providerRows as ProviderRow[]) {
        // Skip if already in map (tracking takes precedence) or if claimed
        if (archivedProviderMap.has(p.provider_id)) continue;
        if (claimedProviderIds.has(p.provider_id)) continue;

        const bpInfo = metaMap.get(p.provider_id);
        const meta = bpInfo?.metadata ?? {};
        const archiveReason = meta.admin_archived_reason as string | undefined;
        const archiveNotes = meta.admin_archived_notes as string | undefined;
        const archivedAt = (meta.admin_archived_at as string) || bpInfo?.updated_at || null;

        // Build notes string from metadata
        let notes: string | null = null;
        if (archiveReason) {
          notes = archiveNotes ? `${archiveReason} - ${archiveNotes}` : archiveReason;
        }

        archivedProviderMap.set(p.provider_id, {
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          provider_category: p.provider_category,
          city: p.city,
          state: p.state,
          address: p.address,
          zipcode: p.zipcode,
          email: p.email,
          phone: p.phone,
          website: p.website,
          slug: p.slug,
          tracking_id: null, // No tracking row for system-archived
          stage: "archived" as OutreachStage,
          stage_changed_at: archivedAt,
          notes,
          // Follow-up queue fields (not applicable for archived)
          due_date: null,
          resend_count: 0,
          no_answer_count: 0,
          needs_call_reason: null,
          // Re-engage fields
          re_engage_entered_at: null,
          re_engage_channel: null,
          fax_number: null,
          fax_confidence: null,
          fax_source_url: null,
          mail_address: null,
          contact_form_url: null,
          contact_form_status: null,
          contact_form_send_count: 0,
          // Assignment (not applicable for system-archived)
          assigned_to: null,
          // Generic email warning state (not applicable for system-archived)
          generic_email_called_at: null,
          generic_email_skipped_at: null,
        });
      }
    }
  }

  // Return all archived providers, sorted by name
  return Array.from(archivedProviderMap.values()).sort((a, b) =>
    a.provider_name.localeCompare(b.provider_name)
  );
}

/**
 * Search providers by name across ALL stages within a state.
 * Returns a flat list with stage info included for each provider.
 */
async function searchProviders(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  search: string
): Promise<OutreachProvider[]> {
  // Get all providers in this state matching the search term
  const { data: providers, error: provError } = await db
    .from("olera-providers")
    .select("provider_id, provider_name, provider_category, city, state, address, zipcode, email, phone, website, slug")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false")
    .ilike("provider_name", `%${search}%`)
    .limit(100);

  if (provError) {
    console.error("[provider-outreach] Search query error:", provError);
    throw new Error("Failed to search providers");
  }

  if (!providers || providers.length === 0) {
    return [];
  }

  const providerIds = providers.map((p) => p.provider_id);

  // Get claimed providers (have business_profile with account_id)
  const { data: claimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id, created_at, updated_at, verification_state, email")
    .in("source_provider_id", providerIds)
    .not("account_id", "is", null);

  const claimedMap = new Map(
    (claimedBps || []).map((bp) => [
      bp.source_provider_id,
      {
        timestamp: bp.updated_at || bp.created_at,
        verification_state: bp.verification_state as OutreachProvider["verification_state"],
        email: bp.email as string | null,
      },
    ])
  );

  // Get tracking data for all matched providers (include admin_hidden to filter)
  const { data: trackingRows } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, id, stage, stage_changed_at, notes, due_date, resend_count, no_answer_count, needs_call_reason, cycle_number, re_engage_entered_at, re_engage_channel, fax_number, fax_confidence, fax_source_url, mail_address, contact_form_url, contact_form_status, contact_form_send_count, assigned_to, admin_hidden, generic_email_called_at, generic_email_skipped_at, confirmed_at, confirmed_by, apollo_contact, email_source")
    .in("provider_id", providerIds);

  // Collect hidden provider IDs to exclude from results
  // Use truthy check to handle any DB type variations
  const hiddenProviderIds = new Set(
    (trackingRows || [])
      .filter((t) => t.admin_hidden)
      .map((t) => t.provider_id)
  );

  const trackingMap = new Map(
    (trackingRows || []).map((t) => [t.provider_id, t])
  );

  // For in_sequence providers, compute emails_sent count (same logic as main query)
  const inSequenceProviderIds = (trackingRows || [])
    .filter((t) => t.stage === "in_sequence" && !claimedMap.has(t.provider_id))
    .map((t) => t.provider_id);

  let emailsSentMap = new Map<string, number>();
  let sequenceStatusMap = new Map<string, { last_email_at?: string; failed_step?: number; failed_reason?: string }>();

  if (inSequenceProviderIds.length > 0) {
    // Build map of provider_id -> stage_changed_at for filtering
    const stageChangedMap = new Map<string, string>();
    for (const t of trackingRows || []) {
      if (t.stage === "in_sequence" && t.stage_changed_at) {
        stageChangedMap.set(t.provider_id, t.stage_changed_at);
      }
    }

    const { data: touchpoints } = await db
      .from("provider_outreach_touchpoints")
      .select("provider_id, created_at")
      .in("provider_id", inSequenceProviderIds)
      .eq("touchpoint_type", "email_sent");

    // Count emails per provider, only those created after entering current sequence
    // Also track the most recent email sent time
    for (const tp of touchpoints || []) {
      const stageChangedAt = stageChangedMap.get(tp.provider_id);
      if (stageChangedAt && tp.created_at >= stageChangedAt) {
        const count = emailsSentMap.get(tp.provider_id) || 0;
        emailsSentMap.set(tp.provider_id, count + 1);

        // Track last email time
        const existing = sequenceStatusMap.get(tp.provider_id);
        if (!existing?.last_email_at || tp.created_at > existing.last_email_at) {
          sequenceStatusMap.set(tp.provider_id, { ...existing, last_email_at: tp.created_at });
        }
      }
    }

    // Query tasks to find failed sequences - use tracking_ids to filter to current sequence only
    const inSequenceTrackingIds = (trackingRows || [])
      .filter(t => t.stage === "in_sequence" && !claimedMap.has(t.provider_id))
      .map(t => t.id);

    if (inSequenceTrackingIds.length > 0) {
      const { data: tasks } = await db
        .from("provider_outreach_tasks")
        .select("provider_id, cadence_day, status, payload")
        .in("tracking_id", inSequenceTrackingIds)
        .eq("status", "failed");

      // Build failed task info per provider
      for (const task of tasks || []) {
        const existing = sequenceStatusMap.get(task.provider_id) || {};
        if (existing.failed_step === undefined) {
          const payload = task.payload as Record<string, unknown> | null;
          sequenceStatusMap.set(task.provider_id, {
            ...existing,
            failed_step: task.cadence_day,
            failed_reason: (payload?.error as string) || "Send failed",
          });
        }
      }
    }
  }

  // Get system-wide archived providers (admin_archived = true in business_profiles)
  const { data: adminArchivedBps } = await db
    .from("business_profiles")
    .select("source_provider_id, metadata, updated_at")
    .in("source_provider_id", providerIds)
    .filter("metadata->>admin_archived", "eq", "true");

  const adminArchivedMap = new Map(
    (adminArchivedBps || []).map((bp) => [
      bp.source_provider_id,
      {
        metadata: bp.metadata as Record<string, unknown>,
        updated_at: bp.updated_at,
      },
    ])
  );

  // Build results with stage info (exclude hidden providers)
  const result: OutreachProvider[] = (providers as ProviderRow[])
    .filter((p) => !hiddenProviderIds.has(p.provider_id))
    .map((p) => {
    const claimInfo = claimedMap.get(p.provider_id);
    const tracking = trackingMap.get(p.provider_id);
    const adminArchived = adminArchivedMap.get(p.provider_id);

    // Determine stage - claimed takes precedence, then system-archived, then tracking
    // Priority order matches getStageCounts: claimed > adminArchived > tracking stage
    let stage: OutreachStage;
    let stageChangedAt: string | null = null;
    let notes: string | null = null;

    if (claimInfo) {
      stage = "claimed";
      stageChangedAt = claimInfo.timestamp;
    } else if (adminArchived) {
      // System-wide archived (from Questions/Connections) takes precedence over tracking stage
      stage = "archived";
      const meta = adminArchived.metadata ?? {};
      stageChangedAt = (meta.admin_archived_at as string) || adminArchived.updated_at || null;
      const archiveReason = meta.admin_archived_reason as string | undefined;
      const archiveNotes = meta.admin_archived_notes as string | undefined;
      if (archiveReason) {
        notes = archiveNotes ? `${archiveReason} - ${archiveNotes}` : archiveReason;
      }
    } else if (tracking) {
      // not_interested is now a distinct soft-terminal stage
      stage = tracking.stage as OutreachStage;
      stageChangedAt = tracking.stage_changed_at;
      notes = tracking.notes;
    } else {
      stage = "not_contacted";
    }

    return {
      provider_id: p.provider_id,
      provider_name: p.provider_name,
      provider_category: p.provider_category,
      city: p.city,
      state: p.state,
      address: p.address,
      zipcode: p.zipcode,
      email: claimInfo?.email || p.email,
      phone: p.phone,
      website: p.website,
      slug: p.slug,
      tracking_id: tracking?.id ?? null,
      stage,
      stage_changed_at: stageChangedAt,
      notes,
      // Follow-up queue fields (from tracking if available)
      due_date: tracking?.due_date ?? null,
      resend_count: tracking?.resend_count ?? 0,
      no_answer_count: tracking?.no_answer_count ?? 0,
      needs_call_reason: tracking?.needs_call_reason ?? null,
      // Re-engage fields
      re_engage_entered_at: tracking?.re_engage_entered_at ?? null,
      re_engage_channel: tracking?.re_engage_channel ?? null,
      fax_number: tracking?.fax_number ?? null,
      fax_confidence: tracking?.fax_confidence ?? null,
      fax_source_url: tracking?.fax_source_url ?? null,
      mail_address: tracking?.mail_address ?? null,
      contact_form_url: tracking?.contact_form_url ?? null,
      contact_form_status: tracking?.contact_form_status ?? null,
      contact_form_send_count: tracking?.contact_form_send_count ?? 0,
      // Assignment
      assigned_to: tracking?.assigned_to ?? null,
      // Sequence progress (for in_sequence)
      emails_sent: stage === "in_sequence" ? (emailsSentMap.get(p.provider_id) || 0) : undefined,
      sequence_status: stage === "in_sequence" ? sequenceStatusMap.get(p.provider_id) : undefined,
      verification_state: claimInfo?.verification_state || null,
      // Generic email warning state (from tracking if available)
      generic_email_called_at: tracking?.generic_email_called_at ?? null,
      generic_email_skipped_at: tracking?.generic_email_skipped_at ?? null,
      // Confirmation state (Ready tab)
      confirmed_at: tracking?.confirmed_at ?? null,
      confirmed_by: tracking?.confirmed_by ?? null,
      // Apollo.io decision-maker enrichment
      apollo_contact: tracking?.apollo_contact ?? null,
      // Email source: 'organization' or 'decision_maker'
      email_source: (tracking?.email_source as "organization" | "decision_maker") ?? "organization",
    };
  });

  // Sort by name
  return result.sort((a, b) => a.provider_name.localeCompare(b.provider_name));
}

/**
 * Get counts for each stage in a state
 *
 * FIXED: Avoids large IN clauses by querying smaller tables first
 *
 * Key logic:
 * - "claimed" count = actual claimed providers (from business_profiles with account_id)
 * - Active stages (in_sequence, needs_call) = tracking count MINUS those who have since claimed
 * - "archived" = tracking count + system-wide archived (admin_archived = true in business_profiles)
 * - "not_contacted" = total providers - claimed - tracked - system-archived
 */
interface StageCounts extends Record<OutreachStage, number> {
  // Additional counts for email-based filtering of not_contacted
  needs_email: number;
  ready: number;  // has_email
  // Hidden providers (admin_hidden = true)
  hidden: number;
}

async function getStageCounts(
  db: ReturnType<typeof getServiceClient>,
  state: string
): Promise<StageCounts> {
  const counts: StageCounts = {
    not_contacted: 0,
    in_sequence: 0,
    needs_call: 0,
    re_engage: 0,
    call_exhausted: 0,  // Final call state
    not_interested: 0,  // Soft terminal
    claimed: 0,
    archived: 0,  // Hard terminal
    // Additional email-based counts
    needs_email: 0,
    ready: 0,
    // Hidden providers
    hidden: 0,
  };

  // Step 1: Get total provider count for this state (just count, not all IDs)
  const { count: totalProviders } = await db
    .from("olera-providers")
    .select("provider_id", { count: "exact", head: true })
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (!totalProviders || totalProviders === 0) {
    return counts;
  }

  // Step 2: Get claimed providers by querying business_profiles first (small set ~600 total)
  // Then filter to those whose source_provider_id exists in olera-providers for this state
  const { data: allClaimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .not("source_provider_id", "is", null)
    .not("account_id", "is", null);

  // Get the provider IDs that are claimed
  const claimedSourceIds = (allClaimedBps || [])
    .map((bp) => bp.source_provider_id)
    .filter(Boolean) as string[];

  // Now verify which of these are in the target state (using batched query)
  const claimedProviderIds = new Set<string>();

  if (claimedSourceIds.length > 0) {
    const claimedInStateProviders = await batchedInQuery<{ provider_id: string }>(
      db,
      "olera-providers",
      "provider_id",
      "provider_id",
      claimedSourceIds,
      { state, notDeleted: true }
    );

    for (const p of claimedInStateProviders) {
      claimedProviderIds.add(p.provider_id);
    }
  }
  counts.claimed = claimedProviderIds.size;

  // Step 3: Get all tracking rows for this state (small set, filtered by state)
  // Include admin_hidden to filter out hidden providers from counts
  // Include apollo_contact to check for decision-maker emails in ready count
  const { data: trackingRows } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, stage, admin_hidden, apollo_contact")
    .eq("state", state);

  // Collect all tracked provider IDs and their stages
  const trackedProviderIds = new Set<string>();
  // Track hidden providers separately (to exclude from not_contacted counts)
  const hiddenProviderIds = new Set<string>();
  // Track apollo_contact emails for not_contacted providers (for ready count)
  const apolloEmailMap = new Map<string, string>();
  const stageCounts: Record<string, number> = {};

  if (trackingRows) {
    for (const row of trackingRows) {
      const stage = row.stage as string;
      // Use truthy check to handle any DB type variations
      const isHidden = !!row.admin_hidden;

      // Track hidden providers (regardless of stage) for exclusion from not_contacted counts
      if (isHidden) {
        hiddenProviderIds.add(row.provider_id);
        continue; // Skip counting hidden providers entirely
      }

      // For not_contacted providers, track apollo_contact email (for ready count)
      if (stage === "not_contacted") {
        const apolloContact = row.apollo_contact as { email?: string } | null;
        if (apolloContact?.email) {
          apolloEmailMap.set(row.provider_id, apolloContact.email);
        }
      }

      // Skip not_contacted and claimed - they're calculated separately
      if (stage === "not_contacted" || stage === "claimed") {
        continue;
      }

      // Track this provider ID (we'll verify it exists later)
      trackedProviderIds.add(row.provider_id);

      // Skip counting if provider has since claimed
      if (claimedProviderIds.has(row.provider_id)) {
        continue;
      }

      // Accumulate stage counts (we'll adjust after verifying provider existence)
      stageCounts[row.provider_id] = stageCounts[row.provider_id] || 0;
      if (stage in counts) {
        stageCounts[row.provider_id] = stage as unknown as number; // Store the stage for later
      }
    }
  }

  // Step 4: Get system-wide archived providers FIRST (admin_archived = true in business_profiles)
  // We need this before counting stages so we can exclude them from their tracking stage
  const { data: adminArchivedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .not("source_provider_id", "is", null)
    .filter("metadata->>admin_archived", "eq", "true");

  const adminArchivedSourceIds = (adminArchivedBps || [])
    .map((bp) => bp.source_provider_id)
    .filter(Boolean) as string[];

  // Verify which system-archived are in the target state and not claimed
  const systemArchivedProviderIds = new Set<string>();

  if (adminArchivedSourceIds.length > 0) {
    const archivedInStateProviders = await batchedInQuery<{ provider_id: string }>(
      db,
      "olera-providers",
      "provider_id",
      "provider_id",
      adminArchivedSourceIds,
      { state, notDeleted: true }
    );

    for (const p of archivedInStateProviders) {
      if (!claimedProviderIds.has(p.provider_id)) {
        systemArchivedProviderIds.add(p.provider_id);
      }
    }
  }

  // Step 5: Verify tracked providers still exist in olera-providers (not deleted)
  const trackedIds = [...trackedProviderIds];
  const existingTrackedIds = new Set<string>();

  if (trackedIds.length > 0) {
    const existingProviders = await batchedInQuery<{ provider_id: string }>(
      db,
      "olera-providers",
      "provider_id",
      "provider_id",
      trackedIds,
      { state, notDeleted: true }
    );

    for (const p of existingProviders) {
      existingTrackedIds.add(p.provider_id);
    }
  }

  // Now count stages only for providers that still exist, aren't claimed, and aren't system-archived
  // System-archived providers should ONLY be counted in archived (via additionalSystemArchived)
  if (trackingRows) {
    for (const row of trackingRows) {
      const stage = row.stage as string;
      // not_interested is now its own stage, not grouped with archived
      if (stage === "not_contacted" || stage === "claimed") continue;
      if (claimedProviderIds.has(row.provider_id)) continue;
      if (!existingTrackedIds.has(row.provider_id)) continue; // Skip deleted providers
      // Skip system-archived - they'll be counted via additionalSystemArchived
      if (systemArchivedProviderIds.has(row.provider_id)) continue;

      if (stage in counts) {
        counts[stage as OutreachStage]++;
      }
    }
  }

  // Step 6: Add system-archived providers to archived count
  // Dedupe: only count those NOT already tracked as archived (via tracking table)
  const trackingArchivedIds = new Set<string>();
  if (trackingRows) {
    for (const row of trackingRows) {
      // Only count hard-archived (not soft not_interested)
      if (row.stage === "archived" && existingTrackedIds.has(row.provider_id) && !claimedProviderIds.has(row.provider_id)) {
        trackingArchivedIds.add(row.provider_id);
      }
    }
  }

  // System-archived providers: count those not already tracked as archived
  // (They may have tracking rows with different stages, but admin_archived = true takes precedence)
  let additionalSystemArchived = 0;
  for (const pid of systemArchivedProviderIds) {
    if (!trackingArchivedIds.has(pid)) {
      additionalSystemArchived++;
    }
  }
  counts.archived += additionalSystemArchived;

  // Step 7: Calculate not_contacted = total - claimed - tracked (only existing, non-claimed, non-system-archived) - system-archived - hidden
  const trackedExistingNotClaimed = [...existingTrackedIds].filter(
    (id) => !claimedProviderIds.has(id) && !systemArchivedProviderIds.has(id)
  ).length;
  // Hidden providers who aren't already excluded by other means (avoid double-counting)
  // A hidden provider might also be claimed or system-archived
  const hiddenNotOtherwiseExcluded = [...hiddenProviderIds].filter(
    (id) => !claimedProviderIds.has(id) && !systemArchivedProviderIds.has(id)
  ).length;
  counts.not_contacted = Math.max(0, totalProviders - counts.claimed - trackedExistingNotClaimed - additionalSystemArchived - hiddenNotOtherwiseExcluded);

  // Count hidden providers (for the Hidden tab)
  // Exclude claimed providers - they belong in Claimed tab, not Hidden
  counts.hidden = [...hiddenProviderIds].filter(id => !claimedProviderIds.has(id)).length;

  // Step 8: Calculate needs_email and ready counts (subsets of not_contacted)
  // We need to query providers to check email status
  // Build exclusion sets for efficient filtering (includes hidden providers)
  const excludedIds = new Set([
    ...claimedProviderIds,
    ...existingTrackedIds,  // Already tracked in a stage
    ...systemArchivedProviderIds,
    ...hiddenProviderIds,   // Admin-hidden from outreach view
  ]);

  // Query providers with email vs without email
  const { data: providersWithEmail } = await db
    .from("olera-providers")
    .select("provider_id, email")
    .eq("state", state)
    .or("deleted.is.null,deleted.eq.false");

  if (providersWithEmail) {
    for (const p of providersWithEmail) {
      if (excludedIds.has(p.provider_id)) continue;
      // Provider "has email" if they have generic email OR apollo_contact email
      const hasGenericEmail = p.email && p.email.trim();
      const hasApolloEmail = apolloEmailMap.has(p.provider_id);
      if (hasGenericEmail || hasApolloEmail) {
        counts.ready++;
      } else {
        counts.needs_email++;
      }
    }
  }

  return counts;
}

/**
 * Get counts of providers per assigned admin for the current stage.
 * Used for the filter chip row in the UI.
 *
 * For needs_call (Follow Up) stage, only counts providers with due_date <= today.
 */
interface AdminCounts {
  [adminId: string]: {
    count: number;
    display_name?: string;
  };
}

async function getAdminCounts(
  db: ReturnType<typeof getServiceClient>,
  state: string,
  stage: OutreachStage,
  emailFilter?: "needs_email" | "has_email" | null
): Promise<AdminCounts> {
  const counts: AdminCounts = {};

  // Get admin display names for lookup
  const { data: admins } = await db
    .from("admin_users")
    .select("id, display_name");

  const adminNameMap = new Map(
    (admins || []).map((a) => [a.id, a.display_name || a.id])
  );

  // For not_contacted stage (Needs Email / Ready tabs):
  // Most providers are untracked, so we return empty counts here.
  // The frontend computes counts from the provider list instead.
  // This avoids expensive queries on 10k+ providers.
  if (stage === "not_contacted") {
    return {};
  }

  // For claimed stage, there's no assignment tracking
  if (stage === "claimed") {
    return {};
  }

  // For archived, we'd need to merge tracking + system-archived which is complex
  // For now, return empty - the UI can compute from the provider list
  if (stage === "archived") {
    return {};
  }

  // For active stages: query tracking table (exclude hidden providers)
  let query = db
    .from("provider_outreach_tracking")
    .select("assigned_to")
    .eq("state", state)
    .eq("stage", stage)
    .or("admin_hidden.is.null,admin_hidden.eq.false");

  // For needs_call (Follow Up), only count providers with due_date <= today
  if (stage === "needs_call") {
    // Use Central Time (business timezone) to avoid UTC timezone mismatches
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    query = query.lte("due_date", today);
  }

  const { data: trackingRows, error } = await query;

  if (error) {
    console.error("[admin-counts] Query error:", error);
    return {};
  }

  if (!trackingRows) {
    return {};
  }

  // Count by assigned_to
  for (const row of trackingRows) {
    const key = row.assigned_to || "unassigned";
    if (!counts[key]) {
      counts[key] = {
        count: 0,
        display_name: key === "unassigned" ? undefined : adminNameMap.get(key),
      };
    }
    counts[key].count++;
  }

  return counts;
}

/**
 * Compute admin counts from a providers list.
 * Used for stages where we already have the providers (not_contacted, claimed, archived)
 * to avoid returning empty counts and forcing client-side computation.
 */
async function computeAdminCountsFromProviders(
  db: ReturnType<typeof getServiceClient>,
  providers: Array<{ assigned_to?: string | null }>
): Promise<AdminCounts> {
  // Get admin display names for lookup
  const { data: admins } = await db
    .from("admin_users")
    .select("id, display_name");

  const adminNameMap = new Map(
    (admins || []).map((a) => [a.id, a.display_name || a.id])
  );

  const counts: AdminCounts = {};

  for (const p of providers) {
    const key = p.assigned_to || "unassigned";
    if (!counts[key]) {
      counts[key] = {
        count: 0,
        display_name: key === "unassigned" ? undefined : adminNameMap.get(key),
      };
    }
    counts[key].count++;
  }

  return counts;
}

/**
 * Get follow-ups due today stats with admin breakdown.
 * Used for the "Due Today" stat box in the Outreach Funnel.
 */
interface FollowUpsTodayStats {
  total: number;
  by_admin: Array<{
    admin_id: string | null;
    display_name: string;
    count: number;
  }>;
}

async function getFollowUpsTodayStats(
  db: ReturnType<typeof getServiceClient>,
  state: string
): Promise<FollowUpsTodayStats> {
  // Use Central Time (business timezone) to avoid UTC timezone mismatches
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  // Get admin display names for lookup
  const { data: admins } = await db
    .from("admin_users")
    .select("id, display_name");

  const adminNameMap = new Map(
    (admins || []).map((a) => [a.id, a.display_name || a.id])
  );

  // Query follow-ups due today (need provider_id to check exclusions)
  // Exclude admin_hidden providers
  const { data: trackingRows, error } = await db
    .from("provider_outreach_tracking")
    .select("provider_id, assigned_to")
    .eq("state", state)
    .eq("stage", "needs_call")
    .lte("due_date", today)
    .or("admin_hidden.is.null,admin_hidden.eq.false");

  if (error || !trackingRows) {
    console.error("[follow-ups-today] Query error:", error);
    return { total: 0, by_admin: [] };
  }

  // Get claimed providers (have account_id in business_profiles)
  // These should be excluded even if tracking row still says needs_call
  const { data: claimedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .not("source_provider_id", "is", null)
    .not("account_id", "is", null);

  const claimedProviderIds = new Set(
    (claimedBps || []).map((bp) => bp.source_provider_id).filter(Boolean)
  );

  // Get system-archived providers (admin_archived = true in business_profiles)
  const { data: archivedBps } = await db
    .from("business_profiles")
    .select("source_provider_id")
    .not("source_provider_id", "is", null)
    .filter("metadata->>admin_archived", "eq", "true");

  const archivedProviderIds = new Set(
    (archivedBps || []).map((bp) => bp.source_provider_id).filter(Boolean)
  );

  // Count by assigned_to, excluding claimed and system-archived
  const countMap = new Map<string, number>();
  let totalCount = 0;
  for (const row of trackingRows) {
    // Skip providers who have since claimed or been system-archived
    if (claimedProviderIds.has(row.provider_id)) continue;
    if (archivedProviderIds.has(row.provider_id)) continue;

    const key = row.assigned_to || "unassigned";
    countMap.set(key, (countMap.get(key) || 0) + 1);
    totalCount++;
  }

  // Convert to sorted array (highest count first, then unassigned last)
  const byAdmin: FollowUpsTodayStats["by_admin"] = [];
  for (const [adminId, count] of countMap.entries()) {
    byAdmin.push({
      admin_id: adminId === "unassigned" ? null : adminId,
      display_name: adminId === "unassigned" ? "Unassigned" : (adminNameMap.get(adminId) || adminId),
      count,
    });
  }

  // Sort: assigned admins first (by count desc), then unassigned
  byAdmin.sort((a, b) => {
    if (a.admin_id === null && b.admin_id !== null) return 1;
    if (a.admin_id !== null && b.admin_id === null) return -1;
    return b.count - a.count;
  });

  return {
    total: totalCount,
    by_admin: byAdmin,
  };
}
