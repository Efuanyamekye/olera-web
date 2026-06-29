import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  getConnectionTemperature,
  INTERVENTION_PRIORITY,
  type ConnectionTemperatureState,
} from "@/lib/connection-temperature";
import {
  calculateFamilyCompleteness,
  calculateProviderCompleteness,
} from "@/lib/admin/profile-completeness";
import {
  getEngagementLevel,
  getFamilyEngagementLevel,
  parseAdminOverride,
  type EngagementLevel,
  type FamilyEngagementLevel,
  type EngagementData,
  type FamilyEngagementData,
} from "@/lib/connection-engagement";

// Valid archive reasons from provider portal (must match ArchiveLeadModal)
const VALID_ARCHIVE_REASONS = [
  "not_a_fit",
  "not_accepting_clients",
  "unable_to_reach",
  "other",
] as const;

type ArchiveReason = typeof VALID_ARCHIVE_REASONS[number];

/**
 * Type-safe parser for archive_reason metadata.
 * Returns null if the value isn't a valid archive reason.
 */
function parseArchiveReason(value: unknown): ArchiveReason | null {
  if (typeof value !== "string") return null;
  return VALID_ARCHIVE_REASONS.includes(value as ArchiveReason) ? (value as ArchiveReason) : null;
}

/**
 * GET /api/admin/connections — rows for the connections tracker's
 * intervention queue, each tagged with its temperature (whose-turn + staleness)
 * and sorted most-needs-attention first.
 *
 * Query params:
 *   - filter         "all" | "needs_attention" | "provider_nudged" | "family_nudged" | "responded" | "needs_email"
 *   - state          (legacy) one of awaiting_provider|awaiting_family|live|going_cold|closed
 *   - include_closed "true" to include declined/expired/ended connections (default: excluded)
 *   - search         case-insensitive match on family or provider display name
 *   - date_from/to   filter by connection created_at
 *   - limit/offset   pagination (default 50 / 0)
 *
 * Temperature is computed in-memory (the thread lives in metadata JSONB, so it
 * can't be a SQL filter) over a capped active set, exactly like the needs-email
 * path in /api/admin/leads. Returns `counts` over the full set (pre-pagination,
 * pre-state-filter) so the UI can label its sections.
 *
 * v2: Added response-based filtering (filter param) and profile completeness.
 */
const FETCH_CAP = 3000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Label maps for care type and timeline display
const CARE_TYPE_LABELS: Record<string, string> = {
  home_care: "Home Care",
  home_health: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
};

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "ASAP",
  asap: "ASAP",
  within_1_month: "Within 1 month",
  within_month: "Within 1 month",
  within_3_months: "Within 3 months",
  few_months: "Within 3 months",
  exploring: "Exploring",
  researching: "Exploring",
};

type FamilyProfile = {
  id?: string;
  display_name?: string | null;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  image_url?: string | null;
  city?: string | null;
  description?: string | null;
  care_types?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

type ProviderProfile = {
  id?: string;
  display_name?: string | null;
  slug?: string | null;
  source_provider_id?: string | null;
  email?: string | null;
  phone?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  care_types?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

type ProfileJoin<T> = T[] | T | null;

function one<T>(p: ProfileJoin<T>): T | undefined {
  return Array.isArray(p) ? p[0] : p ?? undefined;
}

// Workflow-based tab filters (legacy)
type WorkflowState = "needs_attention" | "awaiting_provider" | "awaiting_family" | "connected" | "stuck";
type TabFilter = "all" | WorkflowState | EngagementLevel | FamilyEngagementLevel | "needs_email" | "delivery_issues" | "declined" | "admin_not_interested" | "archived";

// Email issue types for the "Needs Email" tab
type EmailIssueType = "no_email" | "failed" | "invalid" | null;

// Stuck threshold: 3+ nudges with no response
const STUCK_NUDGE_THRESHOLD = 3;

interface WorkflowCounts {
  all: number;
  needs_attention: number;
  awaiting_provider: number;
  awaiting_family: number;
  connected: number;
  stuck: number;
}

// Engagement-based tab counts (new system)
interface EngagementCounts {
  all: number;
  awaiting: number; // Renamed from "new" - provider hasn't engaged, automation still working
  viewed: number;
  connected: number;
  needs_follow_up: number;
  needs_email: number; // Provider has no email on file
  delivery_issues: number; // Email bounced, failed, or invalid - can try override
  declined: number; // Provider archived with decline reasons (via portal)
  admin_not_interested: number; // Admin marked provider as not interested (soft rejection)
  archived: number; // Admin-archived providers - no emails sent
}

// Family engagement-based tab counts (family perspective)
interface FamilyEngagementCounts {
  all: number;
  new: number;
  awaiting: number;
  connected: number;
  stuck: number;
  needs_call: number;
}

// Perspective type
type Perspective = "provider" | "family";

// Funnel stats for the stats row
interface FunnelStats {
  total: number;
  providerViewed: number;
  providerViewedRate: number;
  responded: number;
  respondedRate: number;
  connected: number;
  connectedRate: number;
}

// Provider action breakdown stats
// Tracks: viewed, copied phone, copied email, messaged, declined
interface ProviderActions {
  viewed: number;
  copiedPhone: number;
  copiedEmail: number;
  messaged: number;
  declined: number;
  // Rates as percentage of viewed
  copiedPhoneRate: number;
  copiedEmailRate: number;
  messagedRate: number;
  declinedRate: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const admin = await getAdminUser(user.id);
    if (!admin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const responseFilter = (searchParams.get("filter") || "all") as TabFilter;
    const direction = (searchParams.get("direction") || "inbound") as "inbound" | "outbound";
    const perspective = (searchParams.get("perspective") || "provider") as Perspective;
    const stateFilter = searchParams.get("state") as ConnectionTemperatureState | null;
    const includeClosed = searchParams.get("include_closed") === "true";
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const offset = Number(searchParams.get("offset")) || 0;
    const countOnly = searchParams.get("count_only") === "true";

    const db = getServiceClient();

    // ═══════════════════════════════════════════════════════════════════════════
    // OUTBOUND CONNECTIONS (provider-initiated via "Find Families")
    // Separate code path that returns early - does NOT touch existing inbound logic
    // ═══════════════════════════════════════════════════════════════════════════
    if (direction === "outbound") {
      // Outbound tabs: all, accepted, pending, declined
      type OutboundTab = "all" | "accepted" | "pending" | "declined";
      const outboundFilter = (searchParams.get("filter") || "all") as OutboundTab;

      let outboundQuery = db
        .from("connections")
        .select(`
          id,
          type,
          status,
          message,
          metadata,
          created_at,
          from_profile_id,
          to_profile_id,
          from_profile:business_profiles!connections_from_profile_id_fkey(
            id, display_name, slug, source_provider_id, email, phone, image_url, is_active,
            website, address, city, state, description, care_types, metadata, account_id, verification_state
          ),
          to_profile:business_profiles!connections_to_profile_id_fkey(
            id, display_name, type, email, phone, image_url, city, description, care_types, metadata
          )
        `)
        .eq("type", "request")
        .contains("metadata", { provider_initiated: true })
        .order("created_at", { ascending: false })
        .limit(FETCH_CAP);

      if (dateFrom) outboundQuery = outboundQuery.gte("created_at", dateFrom);
      if (dateTo) outboundQuery = outboundQuery.lte("created_at", dateTo);

      const { data: outboundRows, error: outboundError } = await outboundQuery;
      if (outboundError) {
        console.error("[connections/outbound] query error:", outboundError);
        return NextResponse.json({ error: "Failed to load outbound connections" }, { status: 500 });
      }

      // For outbound: provider = from_profile, family = to_profile (SWAPPED from inbound)
      const outboundAll = (outboundRows ?? []).map((r) => {
        const provider = one(r.from_profile as ProfileJoin<ProviderProfile>);
        const family = one(r.to_profile as ProfileJoin<FamilyProfile>);
        const meta = (r.metadata as Record<string, unknown>) ?? {};

        // Map status to outbound status: accepted, pending, declined
        const outboundStatus = r.status === "accepted" ? "accepted"
          : r.status === "declined" ? "declined"
          : "pending";

        // Extract thread and reply info
        type ThreadMsg = { from_profile_id: string; text?: string; is_auto_reply?: boolean; created_at?: string };
        const thread = (meta.thread as ThreadMsg[]) || [];

        // Message preview from the initial outreach message
        let messagePreview = "";
        if (r.message) {
          try {
            const msgJson = JSON.parse(String(r.message));
            messagePreview = msgJson.message || msgJson.notes || "";
          } catch {
            messagePreview = String(r.message);
          }
        }
        if (messagePreview.length > 80) {
          messagePreview = messagePreview.substring(0, 77) + "...";
        }

        // Family's reply (if any)
        const familyReply = thread.find(
          (m) => m.from_profile_id === r.to_profile_id && m.text && !m.is_auto_reply
        );
        const replyMessage = familyReply?.text || meta.reply_message as string | undefined || null;
        const repliedAt = familyReply?.created_at || meta.replied_at as string | undefined || null;

        return {
          id: r.id,
          type: r.type,
          status: outboundStatus,
          created_at: r.created_at,
          // For outbound, family and provider are swapped from the connection record
          family: {
            id: family?.id ?? null,
            display_name: family?.display_name ?? null,
            email: family?.email ?? null,
            phone: family?.phone ?? null,
            image_url: family?.image_url ?? null,
            city: family?.city ?? null,
          },
          provider: {
            id: provider?.id ?? null,
            display_name: provider?.display_name ?? null,
            slug: provider?.slug ?? null,
            email: provider?.email ?? null,
            phone: provider?.phone ?? null,
            image_url: provider?.image_url ?? null,
            is_active: provider?.is_active !== false,
            city: provider?.city ?? null,
            state: provider?.state ?? null,
            isAccountClaimed: !!(provider as Record<string, unknown>)?.account_id,
            verificationState: (provider as Record<string, unknown>)?.verification_state as string | null ?? null,
          },
          messagePreview,
          replyMessage,
          repliedAt,
          threadLength: thread.length,
        };
      });

      // Search filter
      const outboundSearched = search
        ? outboundAll.filter(
            (c) =>
              (c.family.display_name || "").toLowerCase().includes(search) ||
              (c.provider.display_name || "").toLowerCase().includes(search)
          )
        : outboundAll;

      // Tab counts for outbound
      const outboundCounts = {
        all: outboundSearched.length,
        accepted: outboundSearched.filter((c) => c.status === "accepted").length,
        pending: outboundSearched.filter((c) => c.status === "pending").length,
        declined: outboundSearched.filter((c) => c.status === "declined").length,
      };

      // Stats for outbound
      const outboundStats = {
        total: outboundCounts.all,
        accepted: outboundCounts.accepted,
        pending: outboundCounts.pending,
        declined: outboundCounts.declined,
        acceptRate: outboundCounts.all > 0
          ? Math.round((outboundCounts.accepted / outboundCounts.all) * 100)
          : 0,
      };

      // Filter by tab
      let outboundList = outboundSearched;
      if (outboundFilter !== "all") {
        outboundList = outboundSearched.filter((c) => c.status === outboundFilter);
      }

      // Paginate
      const outboundPage = outboundList.slice(offset, offset + limit);

      return NextResponse.json({
        connections: outboundPage,
        total: outboundList.length,
        direction: "outbound",
        outboundCounts,
        outboundStats,
        truncated: (outboundRows ?? []).length >= FETCH_CAP,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INBOUND CONNECTIONS (family-initiated inquiries) - EXISTING CODE UNCHANGED
    // ═══════════════════════════════════════════════════════════════════════════

    let q = db
      .from("connections")
      .select(`
        id,
        type,
        status,
        message,
        metadata,
        created_at,
        from_profile_id,
        to_profile_id,
        from_profile:business_profiles!connections_from_profile_id_fkey(
          id, display_name, type, email, phone, image_url, city, description, care_types, metadata
        ),
        to_profile:business_profiles!connections_to_profile_id_fkey(
          id, display_name, slug, source_provider_id, email, phone, image_url, is_active,
          website, address, city, state, description, care_types, metadata, account_id, verification_state
        )
      `)
      .eq("type", "inquiry")
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);

    // NOTE: We do NOT exclude archived connections at query level.
    // All connections are fetched, then filtered in-memory so that:
    // - engagementCounts.archived can be computed for all tabs
    // - The correct connections are shown per tab
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo) q = q.lte("created_at", dateTo);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[connections] query error:", error);
      return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
    }

    // CRITICAL FIX: Fetch missing provider emails from olera-providers table
    // This ensures email display matches email sending logic (which checks both tables)
    const providerEmailFallback = new Map<string, string>();

    // Collect unique source_provider_ids that need email lookup from iOS table
    // Use Set to deduplicate (same provider may appear in multiple connections)
    const uniqueSourceIds = new Set<string>();
    // Also collect source_provider_ids for INACTIVE providers to get deletion info
    const inactiveProviderSourceIds = new Set<string>();
    for (const r of rows ?? []) {
      const provider = one(r.to_profile as ProfileJoin<ProviderProfile>);
      if (provider?.source_provider_id) {
        if (!provider?.email?.trim()) {
          uniqueSourceIds.add(provider.source_provider_id);
        }
        // Track inactive providers for deletion info lookup
        if (provider.is_active === false) {
          inactiveProviderSourceIds.add(provider.source_provider_id);
        }
      }
    }

    // Batch fetch emails from olera-providers for providers missing email
    // Filter out deleted providers to match email sending behavior
    if (uniqueSourceIds.size > 0) {
      const sourceIds = Array.from(uniqueSourceIds);
      const { data: iosProviders, error: iosError } = await db
        .from("olera-providers")
        .select("provider_id, email")
        .in("provider_id", sourceIds)
        .not("deleted", "is", true);

      if (iosError) {
        console.error("[connections] olera-providers email lookup failed:", iosError);
        // Continue with empty fallback map - fail gracefully
      }

      // Build map of source_provider_id -> email for quick lookup
      // Trim emails to prevent whitespace-only values from being stored
      for (const ios of iosProviders ?? []) {
        const trimmedEmail = ios.email?.trim();
        if (trimmedEmail) {
          providerEmailFallback.set(ios.provider_id, trimmedEmail);
        }
      }
    }

    // Fetch deletion info from olera-providers for INACTIVE providers
    // This tells us WHO deleted the provider (admin vs provider request)
    type DeletionInfo = {
      deleted: boolean;
      deletedAt: string | null;
      deletionReason: "data_sweep" | "provider_request" | "duplicate" | "out_of_scope" | "other" | null;
    };
    const providerDeletionInfo = new Map<string, DeletionInfo>();

    if (inactiveProviderSourceIds.size > 0) {
      const sourceIds = Array.from(inactiveProviderSourceIds);
      // Query olera-providers INCLUDING deleted ones (no .not("deleted", "is", true))
      const { data: iosProviders, error: iosError } = await db
        .from("olera-providers")
        .select("provider_id, deleted, deleted_at, deletion_reason")
        .in("provider_id", sourceIds);

      if (iosError) {
        console.error("[connections] olera-providers deletion info lookup failed:", iosError);
        // Continue with empty map - we'll show "Unknown" for these
      }

      for (const ios of iosProviders ?? []) {
        providerDeletionInfo.set(ios.provider_id, {
          deleted: ios.deleted === true,
          deletedAt: ios.deleted_at as string | null,
          deletionReason: ios.deletion_reason as DeletionInfo["deletionReason"],
        });
      }
    }

    const now = Date.now();
    const all = (rows ?? []).map((r) => {
      const family = one(r.from_profile as ProfileJoin<FamilyProfile>);
      const provider = one(r.to_profile as ProfileJoin<ProviderProfile>);
      const meta = (r.metadata as Record<string, unknown>) ?? {};

      const temperature = getConnectionTemperature(
        {
          from_profile_id: r.from_profile_id ?? "",
          to_profile_id: r.to_profile_id ?? "",
          status: r.status,
          created_at: r.created_at,
          metadata: r.metadata,
        },
        now
      );

      // Calculate profile completeness
      const familyCompleteness = family
        ? calculateFamilyCompleteness(family, family.email)
        : { percentage: 0, missingFields: [] };
      const providerCompleteness = provider
        ? calculateProviderCompleteness(provider)
        : { percentage: 0, missingFields: [] };

      // Extract nudge info from metadata
      const providerNudgedAt = (meta.nudged_at as string) || null;
      const familyNudgedAt = (meta.family_nudged_at as string) || null;
      const providerNudgeCount = (meta.nudge_count as number) || 0;
      const familyNudgeCount = (meta.family_nudge_count as number) || 0;

      // Check for provider response and conversation state
      type ThreadMsg = { from_profile_id: string; text?: string; is_auto_reply?: boolean; created_at?: string; type?: string };
      const thread = (meta.thread as ThreadMsg[]) || [];

      // Find provider's first REAL response (non-auto, non-system, with actual text)
      const providerMsg = thread.find(
        (m) =>
          m.from_profile_id === r.to_profile_id &&
          m.is_auto_reply !== true &&
          m.type !== "system" &&
          !!m.text?.trim()
      );
      const responded = !!providerMsg;

      // Check metadata for explicit connection signals from provider
      // archiveReason = valid provider decline reason (not_a_fit, not_accepting_clients, etc.)
      // This distinguishes provider-declined (Declined tab) from admin-archived (Archived tab)
      const archiveReason = parseArchiveReason(meta.archive_reason);
      // rawArchiveReason = the actual free-text reason entered (for admin archive display)
      // This preserves whatever text was typed, even if not a predefined reason
      const rawArchiveReason = typeof meta.archive_reason === "string" ? meta.archive_reason : null;
      // archived = true if provider declined OR admin archived from leads page
      // - Provider decline: archived=true + valid archiveReason → Declined tab
      // - Admin archive: archived=true + no valid archiveReason → Archived tab
      const archived = meta.lead_archived === true || meta.archived === true;
      const archivedAt = meta.archived_at as string | undefined;

      // Extract admin override (manually marked status)
      const adminOverride = meta.admin_override ? parseAdminOverride(meta.admin_override) : null;

      // Check if family has replied AFTER provider's response
      // This determines if we need to nudge the family
      // Only counts REAL replies (non-auto, non-system, with actual text)
      let familyRepliedAfterProvider = false;
      let familyMessageCountAfterProvider = 0;
      let lastFamilyMessageAt: string | null = null;
      const providerRespondedAt = providerMsg?.created_at || null;

      if (responded && providerMsg?.created_at) {
        const providerResponseTime = new Date(providerMsg.created_at).getTime();

        // Find all family messages after provider responded
        const familyMessagesAfterProvider = thread.filter(
          (m) =>
            m.from_profile_id === r.from_profile_id &&
            m.is_auto_reply !== true &&
            m.type !== "system" &&
            !!m.text?.trim() &&
            m.created_at &&
            new Date(m.created_at).getTime() > providerResponseTime
        );

        familyRepliedAfterProvider = familyMessagesAfterProvider.length > 0;
        familyMessageCountAfterProvider = familyMessagesAfterProvider.length;

        // Find the most recent family message (for staleness calculation)
        if (familyMessagesAfterProvider.length > 0) {
          lastFamilyMessageAt = familyMessagesAfterProvider.reduce((latest, m) => {
            if (!latest) return m.created_at!;
            return new Date(m.created_at!).getTime() > new Date(latest).getTime() ? m.created_at! : latest;
          }, null as string | null);
        }
      }

      // Find the last message timestamp (for staleness calculation)
      const realMessages = thread.filter(
        (m) => m.is_auto_reply !== true && m.type !== "system" && !!m.text?.trim() && !!m.created_at
      );
      const lastMessageAt = realMessages.length > 0
        ? realMessages.reduce((latest, m) => {
            if (!latest) return m.created_at!;
            return new Date(m.created_at!).getTime() > new Date(latest).getTime() ? m.created_at! : latest;
          }, null as string | null)
        : null;

      // Extract message preview and care metadata
      let messagePreview = "";
      let careType: string | null = null;
      let timeline: string | null = null;

      if (r.message) {
        try {
          const msgJson = JSON.parse(String(r.message));
          messagePreview = msgJson.additional_notes || msgJson.message || msgJson.notes || "";
          // Extract care type and timeline for collapsed row display
          if (msgJson.care_type) {
            careType = CARE_TYPE_LABELS[msgJson.care_type] || msgJson.care_type;
          }
          if (msgJson.urgency) {
            timeline = TIMELINE_LABELS[msgJson.urgency] || msgJson.urgency;
          }
        } catch {
          messagePreview = String(r.message);
        }
      }
      // Fallback to family profile care_types
      if (!careType && family?.care_types?.length) {
        careType = CARE_TYPE_LABELS[family.care_types[0]] || family.care_types[0];
      }
      // Fallback to family metadata timeline
      if (!timeline && family?.metadata) {
        const familyMeta = family.metadata as Record<string, unknown>;
        if (familyMeta.timeline) {
          timeline = TIMELINE_LABELS[familyMeta.timeline as string] || (familyMeta.timeline as string);
        }
      }

      if (!messagePreview && thread.length > 0) {
        const familyMsg = thread.find(
          (m) => m.from_profile_id === r.from_profile_id && m.text && !m.is_auto_reply
        );
        if (familyMsg?.text) messagePreview = familyMsg.text;
      }
      if (messagePreview.length > 80) {
        messagePreview = messagePreview.substring(0, 77) + "...";
      }

      // Determine workflow state
      // Logic: Check if stuck first, then determine waiting state
      const providerIsActive = provider?.is_active !== false;
      const isProviderInactive = !providerIsActive;
      const providerNudgedRecently = providerNudgedAt
        ? now - new Date(providerNudgedAt).getTime() < SEVEN_DAYS_MS
        : false;
      const familyNudgedRecently = familyNudgedAt
        ? now - new Date(familyNudgedAt).getTime() < SEVEN_DAYS_MS
        : false;

      // Determine who we're waiting on and workflow state
      let workflowState: WorkflowState | null = null;
      let waitingOn: "provider" | "family" | null = null;

      if (isProviderInactive) {
        // Inactive providers get a default state so they're not filtered out
        // They'll be shown in the Archived tab with "Provider Inactive" indicator
        workflowState = "awaiting_provider";
      } else if (familyRepliedAfterProvider) {
        // Both parties engaged - truly connected
        workflowState = "connected";
        waitingOn = null;
      } else if (responded) {
        // Provider responded, waiting on family
        waitingOn = "family";
        if (familyNudgeCount >= STUCK_NUDGE_THRESHOLD) {
          workflowState = "stuck";
        } else if (familyNudgedRecently) {
          workflowState = "awaiting_family";
        } else {
          workflowState = "needs_attention"; // Ready to nudge family
        }
      } else {
        // Provider hasn't responded yet
        waitingOn = "provider";
        if (providerNudgeCount >= STUCK_NUDGE_THRESHOLD) {
          workflowState = "stuck";
        } else if (providerNudgedRecently) {
          workflowState = "awaiting_provider";
        } else {
          workflowState = "needs_attention"; // Ready to nudge provider
        }
      }

      // Check if provider is admin-archived (different from provider declining individual leads)
      const providerMeta = (provider?.metadata as Record<string, unknown>) ?? {};
      const isProviderArchived = providerMeta.admin_archived === true;

      return {
        id: r.id,
        type: r.type,
        status: r.status,
        created_at: r.created_at,
        family: {
          id: family?.id ?? null,
          display_name: family?.display_name ?? null,
          email: family?.email ?? null,
          phone: family?.phone ?? null,
          image_url: family?.image_url ?? null,
          completeness: familyCompleteness,
          careType,
          timeline,
        },
        provider: {
          id: provider?.id ?? null,
          display_name: provider?.display_name ?? null,
          slug: provider?.slug ?? null,
          source_provider_id: provider?.source_provider_id ?? null,
          // CRITICAL FIX: Fall back to olera-providers email if business_profiles.email is null/empty
          // Use || instead of ?? to catch empty strings, matching email sending logic
          email: provider?.email?.trim() || (provider?.source_provider_id ? providerEmailFallback.get(provider.source_provider_id) : null) || null,
          phone: provider?.phone ?? null,
          image_url: provider?.image_url ?? null,
          is_active: providerIsActive,
          completeness: providerCompleteness,
          activityKey: provider?.slug || provider?.source_provider_id || provider?.id || null,
          isAccountClaimed: !!(provider as Record<string, unknown>)?.account_id,
          // Verification state for claimed providers (null if not claimed)
          verificationState: (provider as Record<string, unknown>)?.verification_state as string | null ?? null,
        },
        messagePreview,
        responded,
        providerRespondedAt,
        familyRepliedAfterProvider,
        familyMessageCountAfterProvider,
        lastFamilyMessageAt,
        providerNudgeCount,
        familyNudgeCount,
        providerNudgedAt,
        familyNudgedAt,
        workflowState,
        waitingOn,
        lastMessageAt,
        temperature,
        // Archive state (provider archived in their portal)
        archived,
        archiveReason,
        // Raw archive reason (free-text from leads page, for display in Archived tab)
        rawArchiveReason,
        archivedAt,
        // Admin override for manual status marking
        adminOverride,
        // For engagement-based "Needs Call" tab
        needsCall: meta.followup_stopped_reason === "needs_call" || meta.needs_call === true,
        // When Day 0 email was sent (for staleness calculation)
        // Providers who got email added later start fresh from that date
        sequenceStartAt: (meta.email_sent_at as string) || null,
        // Email sequence progress (0-3, where 3 = sequence complete)
        followupStage: (meta.followup_stage as number) ?? null,
        // Why sequence stopped (connected, responded, needs_call, etc.)
        followupStoppedReason: (meta.followup_stopped_reason as string) ?? null,
        // Admin-archived provider (different from individual lead declined)
        isProviderArchived,
        // Provider is inactive (deleted account, removed, etc.) - shows in Archived tab
        isProviderInactive,
        // Inactive provider info - shows who deleted them (admin vs provider themselves)
        inactiveProviderInfo: isProviderInactive ? (() => {
          // Check business_profiles.metadata for self-deletion flag
          const selfDeleted = providerMeta.deleted_by_account_deletion === true;

          // Check olera-providers for deletion info (if we have source_provider_id)
          const iosDeletion = provider?.source_provider_id
            ? providerDeletionInfo.get(provider.source_provider_id)
            : null;

          // Determine deletion source:
          // 1. Self-deleted: metadata.deleted_by_account_deletion = true
          // 2. Provider requested (via admin): olera-providers.deletion_reason = "provider_request"
          // 3. Admin deleted: olera-providers.deleted = true with other reasons
          // 4. Unknown: none of the above
          let deletionSource: "self" | "provider_request" | "admin" | "unknown" = "unknown";

          if (selfDeleted) {
            deletionSource = "self";
          } else if (iosDeletion?.deleted && iosDeletion.deletionReason === "provider_request") {
            deletionSource = "provider_request";
          } else if (iosDeletion?.deleted) {
            // Deleted in olera-providers (may or may not have specific reason)
            deletionSource = "admin";
          }

          return {
            deletionSource,
            deletionReason: iosDeletion?.deletionReason ?? null,
            deletedAt: iosDeletion?.deletedAt ?? null,
          };
        })() : null,
        // Archive info for display in UI
        providerArchiveInfo: isProviderArchived ? {
          reason: providerMeta.admin_archived_reason as string | null,
          archivedBy: providerMeta.admin_archived_by as string | null,
          archivedAt: providerMeta.admin_archived_at as string | null,
          notes: providerMeta.admin_archived_notes as string | null,
        } : null,
        // Admin hidden flag - hides from admin UI without affecting anything else
        adminHidden: meta.admin_hidden === true,
      };
    });

    // Filter out admin-hidden connections FIRST - they don't appear anywhere in admin UI
    const visible = all.filter(c => !c.adminHidden);

    // Search filter (family or provider name) — applied to the visible set.
    const searched = search
      ? visible.filter(
          (c) =>
            (c.family.display_name || "").toLowerCase().includes(search) ||
            (c.provider.display_name || "").toLowerCase().includes(search)
        )
      : visible;

    // Build provider keys for engagement lookup
    const allProviderKeys = [...new Set(
      searched.map((c) => c.provider.activityKey).filter(Boolean) as string[]
    )].slice(0, 1000);

    // Per-provider engagement tracking
    // CONNECTION-SPECIFIC engagement tracking (not provider-level)
    // Each connection has its own engagement data based on events with matching connection_id
    const connectionEngagement = new Map<string, {
      email_clicked: boolean;
      lead_opened: boolean;
      contact_revealed: boolean;
      phone_copied: boolean;
      email_copied: boolean;
      phone_clicked: boolean;
      email_link_clicked: boolean;
      continue_in_inbox: boolean;
      lastActivityAt: string | null;
    }>();

    // Initialize engagement data for each CONNECTION (not provider)
    for (const r of rows ?? []) {
      connectionEngagement.set(r.id, {
        email_clicked: false,
        lead_opened: false,
        contact_revealed: false,
        phone_copied: false,
        email_copied: false,
        phone_clicked: false,
        email_link_clicked: false,
        continue_in_inbox: false,
        lastActivityAt: null,
      });
    }

    // Fetch engagement events filtered by CONNECTION_ID in metadata
    // This ensures each connection shows only its own engagement, not provider-wide

    if (allProviderKeys.length > 0) {
      const { data: actEvents } = await db
        .from("provider_activity")
        .select("provider_id, event_type, created_at, metadata")
        .in("provider_id", allProviderKeys)
        .in("event_type", ["email_click", "lead_opened", "contact_revealed", "phone_clicked", "email_link_clicked", "continue_in_inbox"])
        .order("created_at", { ascending: false })
        .limit(10000);

      for (const ev of actEvents ?? []) {
        const meta = ev.metadata as Record<string, unknown> | null;
        // Support both connection_id (from claim-lead flow) and lead_id (from provider portal)
        const connectionId = (meta?.connection_id || meta?.lead_id) as string | undefined;

        // Handle connection-specific events (most common case)
        if (connectionId) {
          const eng = connectionEngagement.get(connectionId);
          if (!eng) {
            // Connection not in our current view (likely filtered out by date range or limit)
            // Skip this event - we only trust connection-specific events for connections in view
            continue;
          }

          if (ev.event_type === "email_click") eng.email_clicked = true;
          else if (ev.event_type === "lead_opened") eng.lead_opened = true;
          else if (ev.event_type === "contact_revealed") {
            eng.contact_revealed = true;
            // Track what was copied (phone vs email)
            if (meta?.contact_type === "phone") {
              eng.phone_copied = true;
            } else {
              eng.email_copied = true; // Default to email if not specified
            }
          }
          else if (ev.event_type === "phone_clicked") eng.phone_clicked = true;
          else if (ev.event_type === "email_link_clicked") eng.email_link_clicked = true;
          else if (ev.event_type === "continue_in_inbox") eng.continue_in_inbox = true;

          // Track most recent activity FOR THIS CONNECTION
          if (!eng.lastActivityAt || (ev.created_at && ev.created_at > eng.lastActivityAt)) {
            eng.lastActivityAt = ev.created_at;
          }
        }
        // Events without connection_id are ignored for lead_opened
        // A provider landing on /provider/connections without opening a specific lead
        // should NOT mark any leads as "viewed" - that's inflated data.
        // Only connection-specific lead_opened events (with connection_id) count.
      }
    }

    // Query for connections with failed email delivery to provider
    // This catches: bounced, suppressed (invalid address), or send errors
    // Note: Only finds emails with connection_id in metadata (added June 2026)
    // IMPORTANT: Only mark as "failed" if the MOST RECENT email failed - a successful
    // retry after a bounce should clear the failed status
    const connectionIdsInView = new Set(searched.map(c => c.id));
    const connectionsWithDeliveryFailure = new Set<string>();
    const connectionsWithSuccessfulDelivery = new Set<string>();
    // Also track by recipient email (catches emails without connection_id like cron reminders)
    const recipientsWithDeliveryFailure = new Set<string>();
    const recipientsWithSuccessfulDelivery = new Set<string>();

    // Collect provider emails early so we can filter the email_log query
    const providerEmailsInView: string[] = [];
    for (const c of searched) {
      const email = c.provider.email?.trim().toLowerCase();
      if (email) providerEmailsInView.push(email);
    }

    if (connectionIdsInView.size > 0 && providerEmailsInView.length > 0) {
      // Scope query to the date range we're viewing (or last 90 days if no filter)
      const fallbackDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const queryDateFrom = dateFrom || fallbackDate;

      // Query email_log for provider emails, then filter in memory by lowercase recipient
      // We don't filter by recipient in the query to avoid case-sensitivity issues
      // (email_log stores recipients with original case, but we normalize to lowercase)
      // Use a high limit since we filter in memory anyway
      const { data: rawEmailLogEntries } = await db
        .from("email_log")
        .select("metadata, status, bounced_at, created_at, recipient")
        .eq("recipient_type", "provider")
        .gte("created_at", queryDateFrom)
        .order("created_at", { ascending: false })
        .limit(10000);

      // Filter to only emails for providers we're displaying (using lowercase comparison)
      const providerEmailSet = new Set(providerEmailsInView); // already lowercase
      const emailLogEntries = (rawEmailLogEntries ?? []).filter(e => {
        const recipient = (e.recipient as string | null)?.toLowerCase().trim();
        return recipient && providerEmailSet.has(recipient);
      });

      // Track the most recent email per connection
      // Key: connection_id, Value: { isFailed: boolean, timestamp: string }
      const mostRecentEmailPerConnection = new Map<string, { isFailed: boolean; timestamp: string }>();

      // Also track by recipient email address (catches emails without connection_id)
      // Key: recipient email (lowercase), Value: { isFailed: boolean, timestamp: string }
      const mostRecentEmailPerRecipient = new Map<string, { isFailed: boolean; timestamp: string }>();

      for (const email of emailLogEntries ?? []) {
        const meta = email.metadata as Record<string, unknown> | null;
        const emailTime = email.created_at as string;
        const isFailed = email.status === "failed" || email.bounced_at != null;
        const recipient = (email.recipient as string | null)?.toLowerCase().trim();

        // Track by recipient email address (catches ALL emails including those without connection_id)
        if (recipient) {
          const existing = mostRecentEmailPerRecipient.get(recipient);
          if (!existing || emailTime > existing.timestamp) {
            mostRecentEmailPerRecipient.set(recipient, { isFailed, timestamp: emailTime });
          }
        }

        // Also track by connection_id for more precise per-connection tracking
        // Support both formats:
        // - connection_id: "abc" (single lead emails)
        // - connection_ids: ["abc", "def"] (multi-lead cron emails)
        const singleConnId = meta?.connection_id as string | undefined;
        const multiConnIds = meta?.connection_ids as string[] | undefined;

        const connIds: string[] = [];
        if (singleConnId) connIds.push(singleConnId);
        if (Array.isArray(multiConnIds)) connIds.push(...multiConnIds);

        // Update status for each connection in this email
        for (const connId of connIds) {
          if (!connectionIdsInView.has(connId)) continue;

          const existing = mostRecentEmailPerConnection.get(connId);

          // Only process if this is more recent than what we've seen (or first occurrence)
          if (!existing || emailTime > existing.timestamp) {
            mostRecentEmailPerConnection.set(connId, { isFailed, timestamp: emailTime });
          }
        }
      }

      // Track connections based on most recent email status
      // - connectionsWithDeliveryFailure: most recent email FAILED
      // - connectionsWithSuccessfulDelivery: most recent email SUCCEEDED (delivered/opened/clicked)
      for (const [connId, { isFailed }] of mostRecentEmailPerConnection) {
        if (isFailed) {
          connectionsWithDeliveryFailure.add(connId);
        } else {
          connectionsWithSuccessfulDelivery.add(connId);
        }
      }

      // Also track failures by recipient email (for emails without connection_id)
      // Key: recipient email, Value: true if most recent email failed
      for (const [recipient, { isFailed }] of mostRecentEmailPerRecipient) {
        if (isFailed) {
          recipientsWithDeliveryFailure.add(recipient);
        } else {
          recipientsWithSuccessfulDelivery.add(recipient);
        }
      }
    }

    // Query for invalid/undeliverable emails (verified by ZeroBounce)
    // Reuse providerEmailsInView from earlier (already lowercase and trimmed)
    const providerEmailAddresses = new Set(providerEmailsInView);

    const invalidEmailSet = new Set<string>();
    if (providerEmailAddresses.size > 0) {
      const emailArray = Array.from(providerEmailAddresses);
      // Batch query in chunks of 500 (Supabase IN clause limit)
      for (let i = 0; i < emailArray.length; i += 500) {
        const { data: verifs } = await db
          .from("email_verifications")
          .select("email, status")
          .in("email", emailArray.slice(i, i + 500))
          .eq("status", "invalid");
        for (const v of verifs ?? []) {
          // Normalize to lowercase for case-insensitive matching
          invalidEmailSet.add((v.email as string).toLowerCase());
        }
      }
    }

    // Human-trust allowlist (email_overrides): addresses an admin explicitly
    // overrode/trusted (e.g. "Save anyway" after phoning the provider). At send
    // time these already bypass ZeroBounce + suppression (lib/email.ts). Mirror
    // that here so a manual override STICKS — without this, the classifier below
    // re-derives "invalid"/"failed" from stale ZeroBounce/email_log data every
    // load and bounces the provider back to Needs Email / Delivery Issues.
    const trustedEmailSet = new Set<string>();
    if (providerEmailAddresses.size > 0) {
      const lowerEmails = Array.from(providerEmailAddresses).map((e) => e.toLowerCase());
      for (let i = 0; i < lowerEmails.length; i += 500) {
        const { data: trusted } = await db
          .from("email_overrides")
          .select("email")
          .in("email", lowerEmails.slice(i, i + 500));
        for (const t of trusted ?? []) {
          trustedEmailSet.add((t.email as string).toLowerCase());
        }
      }
    }

    // Workflow-based counts (legacy)
    const workflowCounts: WorkflowCounts = {
      all: 0,
      needs_attention: 0,
      awaiting_provider: 0,
      awaiting_family: 0,
      connected: 0,
      stuck: 0,
    };

    // Engagement-based counts (new system)
    const engagementCounts: EngagementCounts = {
      all: 0,
      awaiting: 0,
      viewed: 0,
      connected: 0,
      needs_follow_up: 0,
      needs_email: 0,
      delivery_issues: 0,
      declined: 0,
      admin_not_interested: 0,
      archived: 0,
    };

    // Family engagement-based counts (family perspective)
    const familyEngagementCounts: FamilyEngagementCounts = {
      all: 0,
      new: 0,
      awaiting: 0,
      connected: 0,
      stuck: 0,
      needs_call: 0,
    };

    // Funnel stats
    let providerViewedCount = 0;
    let respondedCount = 0;
    let connectedCount = 0;
    // Provider action counts (per-connection, not raw events)
    let copiedPhoneCount = 0;
    let copiedEmailCount = 0;
    let declinedCount = 0;

    // Calculate engagement level for each connection and store it
    const connectionEngagementLevels = new Map<string, EngagementLevel>();
    const connectionFamilyEngagementLevels = new Map<string, FamilyEngagementLevel>();
    // Store computed badge data during engagement level calculation
    // This ensures badge data uses the SAME computed values as tab placement
    const connectionBadgeData = new Map<string, {
      email_clicked: boolean;
      lead_opened: boolean;
      contact_revealed: boolean;
      phone_copied: boolean;
      email_copied: boolean;
      phone_clicked: boolean;
      email_link_clicked: boolean;
      continue_in_inbox: boolean;
    }>();

    for (const c of searched) {
      // Get engagement data for THIS SPECIFIC CONNECTION (not provider-wide)
      const eng = connectionEngagement.get(c.id) ?? null;

      // Calculate engagement level for this connection
      // Use the most recent of: engagement event OR message timestamp
      const engagementLastActivity = eng?.lastActivityAt ?? null;
      const messageLastActivity = c.lastMessageAt ?? null;
      let combinedLastActivity: string | null = null;
      if (engagementLastActivity && messageLastActivity) {
        combinedLastActivity = new Date(engagementLastActivity).getTime() > new Date(messageLastActivity).getTime()
          ? engagementLastActivity
          : messageLastActivity;
      } else {
        combinedLastActivity = engagementLastActivity || messageLastActivity;
      }

      // Use admin override from connection object (already parsed earlier)
      const adminMarkedViewed = c.adminOverride?.status === "viewed";
      const adminMarkedConnected = c.adminOverride?.status === "connected";

      // Only count lead_opened if provider has claimed their account
      // Unclaimed providers can view leads via magic link but shouldn't be in "Viewed" tab
      // because they haven't committed to the platform yet
      const providerIsClaimed = c.provider.isAccountClaimed === true;
      const effectiveLeadOpened = providerIsClaimed && (eng?.lead_opened ?? false);

      const engagementData: EngagementData = {
        emailClicked: eng?.email_clicked ?? false,
        leadOpened: effectiveLeadOpened,
        contactRevealed: eng?.contact_revealed ?? false,
        phoneClicked: eng?.phone_clicked ?? false,
        emailLinkClicked: eng?.email_link_clicked ?? false,
        continueInInbox: eng?.continue_in_inbox ?? false,
        providerMessaged: c.responded,
        adminMarkedViewed,
        adminMarkedConnected,
        lastActivityAt: combinedLastActivity,
        needsCall: c.needsCall,
        // When Day 0 email was sent - providers who got email added later start fresh
        sequenceStartAt: c.sequenceStartAt,
        // Email sequence progress for sequence-based escalation
        followupStage: c.followupStage,
        followupStoppedReason: c.followupStoppedReason,
      };

      const engResult = getEngagementLevel(engagementData, c.created_at, now);
      connectionEngagementLevels.set(c.id, engResult.level);

      // Store badge data using the SAME computed values as engagement level
      // This ensures badge displays match tab placement
      // CRITICAL: lead_opened uses effectiveLeadOpened (respects providerIsClaimed check)
      connectionBadgeData.set(c.id, {
        email_clicked: eng?.email_clicked ?? false,
        lead_opened: engagementData.leadOpened,  // Use effectiveLeadOpened, not raw eng.lead_opened
        contact_revealed: eng?.contact_revealed ?? false,
        phone_copied: eng?.phone_copied ?? false,
        email_copied: eng?.email_copied ?? false,
        phone_clicked: eng?.phone_clicked ?? false,
        email_link_clicked: eng?.email_link_clicked ?? false,
        continue_in_inbox: eng?.continue_in_inbox ?? false,
      });

      // Calculate family engagement level for this connection
      const familyEngagementData: FamilyEngagementData = {
        providerResponded: c.responded,
        providerRespondedAt: c.providerRespondedAt,
        familyReplied: c.familyRepliedAfterProvider,
        familyMessageCount: c.familyMessageCountAfterProvider,
        lastFamilyActivityAt: c.lastFamilyMessageAt,
        familyNudgeCount: c.familyNudgeCount,
      };

      const familyEngResult = getFamilyEngagementLevel(familyEngagementData, c.created_at, now);
      connectionFamilyEngagementLevels.set(c.id, familyEngResult.level);

      // Only count active connections (those with workflowState)
      // This ensures tab counts match the displayed connections
      if (c.workflowState) {
        // Count workflow states
        workflowCounts.all++;
        workflowCounts[c.workflowState]++;

        // Count engagement levels (provider perspective)
        const isDeclinedArchive = c.archived && c.archiveReason;

        // "All" count: include everything (all tabs combined)
        engagementCounts.all++;

        // Determine email issue type FIRST (needed for engagement level counting)
        // Combines: no email, delivery failed, or invalid email
        const providerEmail = c.provider.email?.trim();
        let emailIssueType: EmailIssueType = null;

        if (!providerEmail) {
          emailIssueType = "no_email";
        } else if (trustedEmailSet.has(providerEmail.toLowerCase())) {
          // Admin-trusted override (email_overrides). Mirror send-side semantics:
          // bypass BOTH the verification verdict and the delivery-failure
          // heuristics so the provider stays out of needs_email/delivery_issues
          // after a manual override. Leave emailIssueType null.
          emailIssueType = null;
        } else if (connectionsWithDeliveryFailure.has(c.id)) {
          // Connection-specific email failed
          emailIssueType = "failed";
        } else {
          // Check recipient-level failures (catches emails without connection_id like cron reminders)
          const recipientKey = providerEmail.toLowerCase();
          const recipientHasFailure = recipientsWithDeliveryFailure.has(recipientKey);
          const recipientHasSuccess = recipientsWithSuccessfulDelivery.has(recipientKey);
          const connectionHasSuccess = connectionsWithSuccessfulDelivery.has(c.id);

          if (recipientHasFailure && !recipientHasSuccess && !connectionHasSuccess) {
            // Recipient's most recent email failed, and no recent success at any level
            emailIssueType = "failed";
          } else if (invalidEmailSet.has(recipientKey) && !connectionHasSuccess && !recipientHasSuccess) {
            // Only mark as "invalid" if ZeroBounce says invalid AND recent emails aren't working
            // If recent emails were delivered/opened/clicked, the email is clearly working
            // (ZeroBounce verification may be stale or was a false positive)
            // NOTE: Uses recipientKey (lowercase) for case-insensitive matching
            emailIssueType = "invalid";
          }
        }

        // Store the issue type on the connection for filtering/display
        (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType = emailIssueType;

        // Surface whether the current email is on the human-trust allowlist so the
        // UI can show a "Trusted" state (the override stuck) instead of a warning.
        (c as typeof c & { emailTrusted: boolean }).emailTrusted =
          !!providerEmail && trustedEmailSet.has(providerEmail.toLowerCase());

        // Archive classification:
        // - "Archived" tab: admin-archived provider OR connection archived without provider decline reason
        //   OR provider inactive (deleted account, removed, etc.)
        // - "Declined" tab: provider explicitly declined (has decline reason like "not_a_fit")
        const isAdminArchived = c.isProviderArchived;

        // Connection-level archive without provider decline reason = admin archived on leads page
        // Connection-level archive WITH provider decline reason = provider declined in their portal
        const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
        const isProviderDeclined = c.archived && !!c.archiveReason;

        // Archived tab: provider-level OR connection-level admin archive OR provider inactive
        const belongsToArchivedTab = isAdminArchived || isConnectionArchivedByAdmin || c.isProviderInactive;

        // Count archived connections (both provider-level and connection-level admin archives)
        if (belongsToArchivedTab) {
          engagementCounts.archived++;
        }
        // Engagement level counts (awaiting, viewed, connected, needs_follow_up):
        // Exclude all archived types, declined, and admin_not_interested - they go to their own tabs
        //
        // ENGAGEMENT PRIORITY: If provider has VIEWED or CONNECTED, they go to engagement tab
        // even if they have email issues. Providers can come in through different channels
        // (magic links, direct login, etc.) - once engaged, email status is secondary.
        //
        // Only "Needs Email" for connections with email issues AND no engagement (awaiting/needs_follow_up)
        const isAdminNotInterested = c.adminOverride?.status === "not_interested";
        const hasProviderEngagement = engResult.level === "viewed" || engResult.level === "connected";
        const emailIssueButEngaged = emailIssueType && hasProviderEngagement;
        const isProviderClaimed = c.provider.isAccountClaimed === true;

        // Delivery Issues is a "quarantine" - ALL connections with failed/invalid emails go there
        // regardless of engagement level or claimed status. Once fixed, they return to their journey.
        const hasDeliveryIssue = emailIssueType === "failed" || emailIssueType === "invalid";

        // Count in engagement tab if: not archived/inactive AND no delivery issue AND one of:
        // - No email issue at all, OR
        // - Has no_email but is claimed (can't add email, stays in engagement), OR
        // - Has no_email but is engaged (already connected somehow)
        const hasNoEmailIssue = emailIssueType === "no_email";
        const noEmailButClaimed = hasNoEmailIssue && isProviderClaimed;
        const noEmailButEngaged = hasNoEmailIssue && hasProviderEngagement;
        if (!belongsToArchivedTab && !isProviderDeclined && !isAdminNotInterested && !hasDeliveryIssue && (!emailIssueType || noEmailButClaimed || noEmailButEngaged)) {
          engagementCounts[engResult.level]++;
        }

        // Count in Delivery Issues if: failed/invalid email (regardless of engagement or claimed)
        // This is the single place to fix ALL email delivery problems
        if (hasDeliveryIssue && !belongsToArchivedTab && !isProviderDeclined && !isAdminNotInterested) {
          engagementCounts.delivery_issues++;
        }

        // Count in Needs Email if: no_email AND unclaimed AND not engaged
        // (Claimed providers with no_email stay in engagement tabs since we can't add email)
        // (Engaged providers with no_email stay in engagement tabs since they're reachable somehow)
        if (hasNoEmailIssue && !isProviderClaimed && !hasProviderEngagement && !belongsToArchivedTab && !isProviderDeclined && !isAdminNotInterested) {
          engagementCounts.needs_email++;
        }

        // Count declined (provider explicitly declined with reason)
        // Exclude admin-archived and inactive - they go to "Archived" tab exclusively
        if (isProviderDeclined && !isAdminArchived && !c.isProviderInactive) {
          engagementCounts.declined++;
        }

        // Count admin "not interested" (soft rejection by admin)
        // These are NOT archived, just have admin_override with status "not_interested"
        // Exclude provider-level archived and inactive - those stay in "Archived" tab
        if (c.adminOverride?.status === "not_interested" && !c.isProviderArchived && !c.isProviderInactive) {
          engagementCounts.admin_not_interested++;
        }

        // Count family engagement levels (exclude archived/inactive - they don't appear in family tabs)
        if (!belongsToArchivedTab && !isProviderDeclined) {
          familyEngagementCounts.all++;
          familyEngagementCounts[familyEngResult.level]++;
        }

        // Funnel stats (based on provider engagement)
        // Viewed = opened lead drawer
        if (eng?.lead_opened) providerViewedCount++;
        // Count as responded if provider sent a message
        if (c.responded) respondedCount++;
        if (c.familyRepliedAfterProvider) connectedCount++;
        // Provider action counts (per-connection)
        if (eng?.phone_copied || eng?.phone_clicked) copiedPhoneCount++;
        if (eng?.email_copied || eng?.email_link_clicked) copiedEmailCount++;
        // Declined = provider explicitly declined (has archive reason, not admin-archived)
        if (isProviderDeclined && !isAdminArchived) declinedCount++;
      }
    }

    // Calculate funnel rates
    const totalActive = workflowCounts.all;
    const funnelStats: FunnelStats = {
      total: totalActive,
      providerViewed: providerViewedCount,
      providerViewedRate: totalActive > 0 ? Math.round((providerViewedCount / totalActive) * 100) : 0,
      responded: respondedCount,
      respondedRate: totalActive > 0 ? Math.round((respondedCount / totalActive) * 100) : 0,
      connected: connectedCount,
      connectedRate: totalActive > 0 ? Math.round((connectedCount / totalActive) * 100) : 0,
    };

    // Provider action breakdown - per-connection counts, rates as percentage of viewed
    // Uses connection-level metrics (not raw events) for consistency with Connection Funnel
    const providerActions: ProviderActions = {
      viewed: providerViewedCount,
      copiedPhone: copiedPhoneCount,
      copiedEmail: copiedEmailCount,
      messaged: respondedCount, // Actual messages sent, not just "clicked inbox"
      declined: declinedCount, // Provider explicitly declined the lead
      copiedPhoneRate: providerViewedCount > 0 ? Math.round((copiedPhoneCount / providerViewedCount) * 100) : 0,
      copiedEmailRate: providerViewedCount > 0 ? Math.round((copiedEmailCount / providerViewedCount) * 100) : 0,
      messagedRate: providerViewedCount > 0 ? Math.round((respondedCount / providerViewedCount) * 100) : 0,
      declinedRate: providerViewedCount > 0 ? Math.round((declinedCount / providerViewedCount) * 100) : 0,
    };

    // Early return for count_only mode — skip filtering/pagination, just return counts
    if (countOnly) {
      return NextResponse.json({
        total: engagementCounts.all,
        engagementCounts,
        familyEngagementCounts,
        funnelStats,
        providerActions,
      });
    }

    // Filtering by workflow state or engagement level
    let list = searched.filter(c => c.workflowState !== null); // Exclude inactive providers

    // "All" tab: no additional filtering - shows everything (all tabs combined)

    // Check if filter is an engagement level (provider or family)
    const providerEngagementLevels: EngagementLevel[] = ["awaiting", "viewed", "connected", "needs_follow_up"];
    const familyEngagementLevels: FamilyEngagementLevel[] = ["new", "awaiting", "connected", "stuck", "needs_call"];

    if (responseFilter !== "all") {
      // Special filter: archived
      // Shows: provider-level admin-archived OR connection-level admin-archived (from leads page)
      // OR provider inactive (deleted account, removed, etc.)
      // Connection archived WITHOUT reason = admin archived on leads page
      // Connection archived WITH reason = provider declined (goes to Declined tab instead)
      if (responseFilter === "archived" && perspective === "provider") {
        list = list.filter((c) => {
          const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
          return c.isProviderArchived || isConnectionArchivedByAdmin || c.isProviderInactive;
        });
      }
      // Special filter: needs_email (provider perspective only)
      // Only providers with NO email on file
      // Exclude if provider has ENGAGED (viewed/connected) - they go to engagement tab
      // Exclude CLAIMED providers - we can't change their email anyway (it's locked)
      else if (responseFilter === "needs_email" && perspective === "provider") {
        list = list.filter((c) => {
          const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
          const isProviderDeclined = c.archived && !!c.archiveReason;
          const isAdminNotInterested = c.adminOverride?.status === "not_interested";
          const engLevel = connectionEngagementLevels.get(c.id);
          const hasProviderEngagement = engLevel === "viewed" || engLevel === "connected";
          const isProviderClaimed = c.provider.isAccountClaimed === true;
          const emailIssue = (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType;
          return emailIssue === "no_email" &&
            !hasProviderEngagement &&
            !isProviderClaimed &&
            !c.isProviderArchived && !c.isProviderInactive && !isConnectionArchivedByAdmin && !isProviderDeclined && !isAdminNotInterested;
        });
      }
      // Special filter: delivery_issues (provider perspective only)
      // ALL connections with failed/invalid email go here - regardless of engagement or claimed status
      // This is the single "quarantine" to fix email problems. Once fixed, they return to their journey.
      else if (responseFilter === "delivery_issues" && perspective === "provider") {
        list = list.filter((c) => {
          const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
          const isProviderDeclined = c.archived && !!c.archiveReason;
          const isAdminNotInterested = c.adminOverride?.status === "not_interested";
          const emailIssue = (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType;
          // failed or invalid - includes ALL providers regardless of engagement or claimed status
          return (emailIssue === "failed" || emailIssue === "invalid") &&
            !c.isProviderArchived && !c.isProviderInactive && !isConnectionArchivedByAdmin && !isProviderDeclined && !isAdminNotInterested;
        });
      }
      // Special filter: declined (provider explicitly declined with reason)
      // Exclude admin-archived providers and inactive providers (they go to "Archived" tab)
      else if (responseFilter === "declined" && perspective === "provider") {
        list = list.filter((c) => c.archived && c.archiveReason && !c.isProviderArchived && !c.isProviderInactive);
      }
      // Special filter: admin_not_interested (admin marked as not interested - soft rejection)
      // These are NOT archived, provider can still see/engage with the lead
      // Exclude provider-level archived and inactive providers - those stay in "Archived" tab
      else if (responseFilter === "admin_not_interested" && perspective === "provider") {
        list = list.filter((c) => c.adminOverride?.status === "not_interested" && !c.isProviderArchived && !c.isProviderInactive);
      } else if (perspective === "family") {
        // Family perspective - filter by family engagement level
        // Exclude inactive/archived providers - these are dead connections
        const isFamilyEngagementFilter = familyEngagementLevels.includes(responseFilter as FamilyEngagementLevel);
        if (isFamilyEngagementFilter) {
          list = list.filter((c) => {
            const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
            return connectionFamilyEngagementLevels.get(c.id) === responseFilter &&
              !c.isProviderArchived &&
              !c.isProviderInactive &&
              !isConnectionArchivedByAdmin;
          });
        } else {
          // Filter by workflow state (legacy)
          list = list.filter((c) => c.workflowState === responseFilter);
        }
      } else {
        // Provider perspective - filter by provider engagement level
        const isEngagementFilter = providerEngagementLevels.includes(responseFilter as EngagementLevel);
        if (isEngagementFilter) {
          // All engagement-level tabs (awaiting, viewed, connected, needs_follow_up):
          // - Exclude all archived types (provider-level, connection-level admin, provider declined)
          // - Exclude admin "not interested" (they have their own tab)
          // - Exclude failed/invalid emails → they go to Delivery Issues (quarantine)
          //
          // Connections with no_email stay here if claimed or engaged (can't fix, but reachable)
          list = list.filter((c) => {
            const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
            const isProviderDeclined = c.archived && !!c.archiveReason;
            const isAdminNotInterested = c.adminOverride?.status === "not_interested";
            const engLevel = connectionEngagementLevels.get(c.id);
            const hasProviderEngagement = engLevel === "viewed" || engLevel === "connected";
            const emailIssue = (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType;
            const isProviderClaimed = c.provider.isAccountClaimed === true;

            // Delivery issues (failed/invalid) go to Delivery Issues tab - exclude them here
            const hasDeliveryIssue = emailIssue === "failed" || emailIssue === "invalid";
            // no_email is okay if claimed or engaged (can't fix, but connection exists)
            const hasNoEmailIssue = emailIssue === "no_email";
            const noEmailButOk = hasNoEmailIssue && (isProviderClaimed || hasProviderEngagement);

            return engLevel === responseFilter &&
              !c.isProviderArchived &&
              !c.isProviderInactive &&
              !isConnectionArchivedByAdmin &&
              !isProviderDeclined &&
              !isAdminNotInterested &&
              !hasDeliveryIssue &&
              (!emailIssue || noEmailButOk);
          });
        } else {
          // Filter by workflow state (legacy)
          list = list.filter((c) => c.workflowState === responseFilter);
        }
      }
    }

    // Sort by most recent first
    // For "declined" tab: sort by archive date (most recently declined first)
    // For other tabs: sort by creation date (most recent inquiry first)
    list.sort((a, b) => {
      if (responseFilter === "declined") {
        // Guard against invalid date strings (corrupted data)
        const aDate = a.archivedAt ? new Date(a.archivedAt) : null;
        const bDate = b.archivedAt ? new Date(b.archivedAt) : null;
        const aTime = aDate && !isNaN(aDate.getTime()) ? aDate.getTime() : 0;
        const bTime = bDate && !isNaN(bDate.getTime()) ? bDate.getTime() : 0;
        return bTime - aTime; // Most recently archived first
      } else {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime; // Most recent inquiry first
      }
    });

    const pageRaw = list.slice(offset, offset + limit);

    // Add engagement level to each connection in the page
    // Include both provider and family engagement levels so UI can display appropriately
    const page = pageRaw.map((c) => {
      return {
        ...c,
        engagementLevel: connectionEngagementLevels.get(c.id) ?? "new",
        familyEngagementLevel: connectionFamilyEngagementLevels.get(c.id) ?? "new",
        // adminOverride is already included in c from earlier mapping
      };
    });

    // Per-CONNECTION engagement data for UI badges (keyed by connection_id)
    // Use pre-computed values from connectionBadgeData (computed during engagement level calculation)
    // This ensures badge data matches tab placement - both use the same computed values
    const engagement: Record<string, { email_clicked: boolean; lead_opened: boolean; contact_revealed: boolean; phone_copied: boolean; email_copied: boolean; phone_clicked: boolean; email_link_clicked: boolean; continue_in_inbox: boolean }> = {};
    for (const c of pageRaw) {
      const badge = connectionBadgeData.get(c.id);
      if (badge) {
        engagement[c.id] = badge;
      }
    }

    const truncated = (rows ?? []).length >= FETCH_CAP;
    if (truncated) {
      console.warn(`[connections] fetch hit cap ${FETCH_CAP}; counts/queue may be incomplete`);
    }

    return NextResponse.json({
      connections: page,
      total: list.length,
      perspective,
      workflowCounts,
      engagementCounts,
      familyEngagementCounts,
      funnelStats,
      providerActions,
      engagement,
      truncated,
    });
  } catch (err) {
    console.error("[connections] fatal:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
