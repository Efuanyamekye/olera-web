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
type TabFilter = "all" | WorkflowState | EngagementLevel | FamilyEngagementLevel | "needs_email" | "declined" | "archived";

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
  new: number;
  viewed: number;
  connected: number;
  needs_follow_up: number;
  needs_email: number; // Combined: no email, delivery failed, or invalid email
  declined: number; // Provider archived with decline reasons
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
interface ProviderActions {
  viewed: number;
  copiedPhone: number;
  copiedEmail: number;
  clickedPhone: number;
  clickedEmail: number;
  continuedToInbox: number;
  // Rates as percentage of viewed
  copiedPhoneRate: number;
  copiedEmailRate: number;
  clickedPhoneRate: number;
  clickedEmailRate: number;
  continuedToInboxRate: number;
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
            website, address, city, state, description, care_types, metadata
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
          website, address, city, state, description, care_types, metadata
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
    for (const r of rows ?? []) {
      const provider = one(r.to_profile as ProfileJoin<ProviderProfile>);
      if (provider?.source_provider_id && !provider?.email?.trim()) {
        uniqueSourceIds.add(provider.source_provider_id);
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
      const providerNudgedRecently = providerNudgedAt
        ? now - new Date(providerNudgedAt).getTime() < SEVEN_DAYS_MS
        : false;
      const familyNudgedRecently = familyNudgedAt
        ? now - new Date(familyNudgedAt).getTime() < SEVEN_DAYS_MS
        : false;

      // Determine who we're waiting on and workflow state
      let workflowState: WorkflowState | null = null;
      let waitingOn: "provider" | "family" | null = null;

      if (!providerIsActive) {
        workflowState = null; // Inactive providers excluded
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
        archivedAt,
        // Admin override for manual status marking
        adminOverride,
        // For engagement-based "Needs Call" tab
        needsCall: meta.followup_stopped_reason === "needs_call" || meta.needs_call === true,
        // When Day 0 email was sent (for staleness calculation)
        // Providers who got email added later start fresh from that date
        sequenceStartAt: (meta.email_sent_at as string) || null,
        // Admin-archived provider (different from individual lead declined)
        isProviderArchived,
      };
    });

    // Search filter (family or provider name) — applied to the full set.
    const searched = search
      ? all.filter(
          (c) =>
            (c.family.display_name || "").toLowerCase().includes(search) ||
            (c.provider.display_name || "").toLowerCase().includes(search)
        )
      : all;

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

      // Build a map of provider_id -> connection_ids for multi-lead email handling
      const providerToConnections = new Map<string, string[]>();
      for (const c of searched) {
        const providerKey = c.provider.activityKey;
        if (!providerKey) continue;
        if (!providerToConnections.has(providerKey)) {
          providerToConnections.set(providerKey, []);
        }
        providerToConnections.get(providerKey)!.push(c.id);
      }

      for (const ev of actEvents ?? []) {
        const meta = ev.metadata as Record<string, unknown> | null;
        // Support both connection_id (from claim-lead flow) and lead_id (from provider portal)
        const connectionId = (meta?.connection_id || meta?.lead_id) as string | undefined;

        // Handle connection-specific events (most common case)
        if (connectionId) {
          const eng = connectionEngagement.get(connectionId);
          if (!eng) {
            // Connection not in our current view (likely filtered out by date range or limit)
            // If this is a lead_opened event, treat it as a provider-wide signal
            // (fallback to multi-lead behavior for old connections)
            if (ev.event_type === "lead_opened" && ev.provider_id) {
              const connectionIds = providerToConnections.get(ev.provider_id) ?? [];
              for (const connId of connectionIds) {
                const e = connectionEngagement.get(connId);
                if (e) {
                  e.lead_opened = true;
                  if (!e.lastActivityAt || (ev.created_at && ev.created_at > e.lastActivityAt)) {
                    e.lastActivityAt = ev.created_at;
                  }
                }
              }
            } else {
              // Non-lead_opened event for connection not in view - skip it
            }
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
        // Handle provider-wide events (multi-lead emails with no specific connection_id)
        // When provider clicks a multi-lead email and lands on inbox, mark ALL their connections as viewed
        else if (ev.event_type === "lead_opened" && ev.provider_id) {
          const connectionIds = providerToConnections.get(ev.provider_id) ?? [];
          for (const connId of connectionIds) {
            const eng = connectionEngagement.get(connId);
            if (eng) {
              eng.lead_opened = true;
              // Track activity time for all connections
              if (!eng.lastActivityAt || (ev.created_at && ev.created_at > eng.lastActivityAt)) {
                eng.lastActivityAt = ev.created_at;
              }
            }
          }
        }
      }
    }

    // Query provider actions with metadata for detailed breakdown
    // Simplified: viewed (opened drawer), copied phone (connected), copied email (connected)
    let actionViewedCount = 0;
    let actionCopiedPhoneCount = 0;
    let actionCopiedEmailCount = 0;

    if (allProviderKeys.length > 0) {
      let actionQuery = db
        .from("provider_activity")
        .select("event_type, metadata")
        .in("provider_id", allProviderKeys)
        .in("event_type", ["lead_opened", "phone_clicked", "email_link_clicked", "contact_revealed"]);

      // Apply date filters to match the connections date range
      if (dateFrom) actionQuery = actionQuery.gte("created_at", dateFrom);
      if (dateTo) actionQuery = actionQuery.lte("created_at", dateTo);

      const { data: actionEvents } = await actionQuery.limit(10000);

      for (const ev of actionEvents ?? []) {
        if (ev.event_type === "lead_opened") {
          actionViewedCount++;
        } else if (ev.event_type === "phone_clicked") {
          // Copying phone = connecting
          actionCopiedPhoneCount++;
        } else if (ev.event_type === "email_link_clicked") {
          // Copying email = connecting
          actionCopiedEmailCount++;
        } else if (ev.event_type === "contact_revealed") {
          // Legacy event (pre-simplification): still count for historical data
          const meta = ev.metadata as Record<string, unknown> | null;
          if (meta?.contact_type === "phone") {
            actionCopiedPhoneCount++;
          } else {
            actionCopiedEmailCount++;
          }
        }
      }
    }

    // Query for connections with failed email delivery to provider
    // This catches: bounced, suppressed (invalid address), or send errors
    // Note: Only finds emails with connection_id in metadata (added June 2026)
    // IMPORTANT: Only mark as "failed" if the MOST RECENT email failed - a successful
    // retry after a bounce should clear the failed status
    const connectionIdsInView = new Set(searched.map(c => c.id));
    const connectionsWithDeliveryFailure = new Set<string>();

    if (connectionIdsInView.size > 0) {
      // Scope query to the date range we're viewing (or last 90 days if no filter)
      const fallbackDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const queryDateFrom = dateFrom || fallbackDate;

      // Query email_log for ALL provider emails (not just failed) to find most recent status
      // We need to check if the MOST RECENT email for each connection failed
      const { data: providerEmails } = await db
        .from("email_log")
        .select("metadata, status, bounced_at, created_at")
        .eq("recipient_type", "provider")
        .gte("created_at", queryDateFrom)
        .order("created_at", { ascending: false })
        .limit(5000);

      // Track the most recent email per connection
      // Key: connection_id, Value: { isFailed: boolean, timestamp: string }
      const mostRecentEmailPerConnection = new Map<string, { isFailed: boolean; timestamp: string }>();

      for (const email of providerEmails ?? []) {
        const meta = email.metadata as Record<string, unknown> | null;
        const connId = meta?.connection_id as string | undefined;
        if (!connId || !connectionIdsInView.has(connId)) continue;

        const existing = mostRecentEmailPerConnection.get(connId);
        const emailTime = email.created_at as string;

        // Only process if this is more recent than what we've seen (or first occurrence)
        if (!existing || emailTime > existing.timestamp) {
          const isFailed = email.status === "failed" || email.bounced_at != null;
          mostRecentEmailPerConnection.set(connId, { isFailed, timestamp: emailTime });
        }
      }

      // Only mark connections where the MOST RECENT email failed
      for (const [connId, { isFailed }] of mostRecentEmailPerConnection) {
        if (isFailed) {
          connectionsWithDeliveryFailure.add(connId);
        }
      }
    }

    // Query for invalid/undeliverable emails (verified by ZeroBounce)
    // Collect all provider emails and check against email_verifications table
    const providerEmails = new Set<string>();
    for (const c of searched) {
      const email = c.provider.email?.trim();
      if (email) providerEmails.add(email);
    }

    const invalidEmailSet = new Set<string>();
    if (providerEmails.size > 0) {
      const emailArray = Array.from(providerEmails);
      // Batch query in chunks of 500 (Supabase IN clause limit)
      for (let i = 0; i < emailArray.length; i += 500) {
        const { data: verifs } = await db
          .from("email_verifications")
          .select("email, status")
          .in("email", emailArray.slice(i, i + 500))
          .eq("status", "invalid");
        for (const v of verifs ?? []) {
          invalidEmailSet.add(v.email as string);
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
      new: 0,
      viewed: 0,
      connected: 0,
      needs_follow_up: 0,
      needs_email: 0,
      declined: 0,
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

    // Calculate engagement level for each connection and store it
    const connectionEngagementLevels = new Map<string, EngagementLevel>();
    const connectionFamilyEngagementLevels = new Map<string, FamilyEngagementLevel>();

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

      const engagementData: EngagementData = {
        emailClicked: eng?.email_clicked ?? false,
        leadOpened: eng?.lead_opened ?? false,
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
      };

      const engResult = getEngagementLevel(engagementData, c.created_at, now);
      connectionEngagementLevels.set(c.id, engResult.level);

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
        } else if (connectionsWithDeliveryFailure.has(c.id)) {
          emailIssueType = "failed";
        } else if (invalidEmailSet.has(providerEmail)) {
          emailIssueType = "invalid";
        }

        // Store the issue type on the connection for filtering/display
        (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType = emailIssueType;

        // Archive classification:
        // - "Archived" tab: leads that are archived AND have no engagement
        // - "Declined" tab: provider explicitly declined (has decline reason like "not_a_fit")
        // - Leads with engagement (viewed/connected) stay in their engagement tab even if archived
        const isAdminArchived = c.isProviderArchived;

        // Connection-level archive without provider decline reason = admin archived
        // Connection-level archive WITH provider decline reason = provider declined in their portal
        const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
        const isProviderDeclined = c.archived && !!c.archiveReason;

        // Archived tab: ONLY if archived AND no engagement (engagement level is "new")
        // Leads with engagement (viewed, connected, needs_follow_up) stay in their engagement tab
        // Provider-level archive always goes to Archived tab (stops all emails)
        const hasEngagement = engResult.level !== "new";
        const belongsToArchivedTab = isAdminArchived || (isConnectionArchivedByAdmin && !hasEngagement);

        // Count archived connections
        if (belongsToArchivedTab) {
          engagementCounts.archived++;
        }
        // Engagement level counts (new, viewed, connected, needs_follow_up):
        // - Exclude provider-level archives (they go to Archived tab)
        // - Exclude provider-declined (they go to Declined tab)
        // - Exclude connections with email issues (they go to "Needs Email" tab)
        // - Include connection-level archives IF they have engagement (they stay in engagement tab)
        else if (!isProviderDeclined && !emailIssueType) {
          engagementCounts[engResult.level]++;
        }

        // Only count non-archived connections in needs_email (consistent with other tabs)
        // Archived and declined leads shouldn't appear in "Needs Email"
        if (emailIssueType && !belongsToArchivedTab && !isProviderDeclined) {
          engagementCounts.needs_email++;
        }

        // Count declined (provider explicitly declined with reason)
        // Exclude admin-archived - they go to "Archived" tab exclusively
        if (isProviderDeclined && !isAdminArchived) {
          engagementCounts.declined++;
        }

        // Count family engagement levels
        // "All" includes everything (all tabs combined)
        familyEngagementCounts.all++;
        familyEngagementCounts[familyEngResult.level]++;

        // Funnel stats (based on provider engagement)
        // Viewed = opened lead drawer
        if (eng?.lead_opened) providerViewedCount++;
        // Count as responded if provider sent a message
        if (c.responded) respondedCount++;
        if (c.familyRepliedAfterProvider) connectedCount++;
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

    // Provider action breakdown - rates as percentage of viewed
    const providerActions: ProviderActions = {
      viewed: actionViewedCount,
      copiedPhone: actionCopiedPhoneCount,
      copiedEmail: actionCopiedEmailCount,
      clickedPhone: actionCopiedPhoneCount, // Same as copied (simplified)
      clickedEmail: actionCopiedEmailCount, // Same as copied (simplified)
      continuedToInbox: 0, // No longer tracked
      copiedPhoneRate: actionViewedCount > 0 ? Math.round((actionCopiedPhoneCount / actionViewedCount) * 100) : 0,
      copiedEmailRate: actionViewedCount > 0 ? Math.round((actionCopiedEmailCount / actionViewedCount) * 100) : 0,
      clickedPhoneRate: actionViewedCount > 0 ? Math.round((actionCopiedPhoneCount / actionViewedCount) * 100) : 0,
      clickedEmailRate: actionViewedCount > 0 ? Math.round((actionCopiedEmailCount / actionViewedCount) * 100) : 0,
      continuedToInboxRate: 0, // No longer tracked
    };

    // Filtering by workflow state or engagement level
    let list = searched.filter(c => c.workflowState !== null); // Exclude inactive providers

    // "All" tab: no additional filtering - shows everything (all tabs combined)

    // Check if filter is an engagement level (provider or family)
    const providerEngagementLevels: EngagementLevel[] = ["new", "viewed", "connected", "needs_follow_up"];
    const familyEngagementLevels: FamilyEngagementLevel[] = ["new", "awaiting", "connected", "stuck", "needs_call"];

    if (responseFilter !== "all") {
      // Special filter: archived
      // Shows: provider-level archives OR connection-level archives with NO engagement
      // Leads with engagement (viewed/connected) stay in their engagement tab
      if (responseFilter === "archived" && perspective === "provider") {
        list = list.filter((c) => {
          const isConnectionArchivedByAdmin = c.archived && !c.archiveReason;
          const engLevel = connectionEngagementLevels.get(c.id);
          const hasEngagement = engLevel && engLevel !== "new";
          // Provider-level archive always shows here
          // Connection-level archive only shows if NO engagement
          return c.isProviderArchived || (isConnectionArchivedByAdmin && !hasEngagement);
        });
      }
      // Special filter: needs_email (provider perspective only)
      // Combines: no email, delivery failed, or invalid email
      // Exclude: provider-level archives, provider-declined, AND connection-level archives without engagement
      // (connection-level archives without engagement belong to Archived tab, not Needs Email)
      else if (responseFilter === "needs_email" && perspective === "provider") {
        list = list.filter((c) => {
          const isConnectionArchivedByAdmin = c.archived === true && !c.archiveReason;
          const engLevel = connectionEngagementLevels.get(c.id);
          const hasEngagement = engLevel && engLevel !== "new";
          const belongsToArchivedTab = c.isProviderArchived || (isConnectionArchivedByAdmin && !hasEngagement);
          const isProviderDeclined = c.archived === true && !!c.archiveReason;
          return (c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType !== null &&
            !belongsToArchivedTab && !isProviderDeclined;
        });
      }
      // Special filter: declined (provider explicitly declined with reason)
      // Exclude admin-archived providers (they go to "Archived" tab)
      else if (responseFilter === "declined" && perspective === "provider") {
        list = list.filter((c) => c.archived && c.archiveReason && !c.isProviderArchived);
      } else if (perspective === "family") {
        // Family perspective - filter by family engagement level
        const isFamilyEngagementFilter = familyEngagementLevels.includes(responseFilter as FamilyEngagementLevel);
        if (isFamilyEngagementFilter) {
          list = list.filter((c) => connectionFamilyEngagementLevels.get(c.id) === responseFilter);
        } else {
          // Filter by workflow state (legacy)
          list = list.filter((c) => c.workflowState === responseFilter);
        }
      } else {
        // Provider perspective - filter by provider engagement level
        const isEngagementFilter = providerEngagementLevels.includes(responseFilter as EngagementLevel);
        if (isEngagementFilter) {
          // All engagement-level tabs (new, viewed, connected, needs_follow_up):
          // - Exclude provider-level archives (they go to Archived tab)
          // - Exclude provider-declined (they go to Declined tab)
          // - Exclude connections with email issues (they go to "Needs Email" tab)
          // - INCLUDE connection-level archives if they have engagement (they stay in engagement tab)
          list = list.filter((c) => {
            const isProviderDeclined = c.archived && !!c.archiveReason;
            return connectionEngagementLevels.get(c.id) === responseFilter &&
              !c.isProviderArchived &&
              !isProviderDeclined &&
              !(c as typeof c & { emailIssueType: EmailIssueType }).emailIssueType;
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
    // This shows engagement specific to each connection, not aggregated across all provider's connections.
    const engagement: Record<string, { email_clicked: boolean; lead_opened: boolean; contact_revealed: boolean; phone_copied: boolean; email_copied: boolean; phone_clicked: boolean; email_link_clicked: boolean; continue_in_inbox: boolean }> = {};
    for (const c of pageRaw) {
      const eng = connectionEngagement.get(c.id);
      if (eng) {
        engagement[c.id] = {
          email_clicked: eng.email_clicked,
          lead_opened: eng.lead_opened,
          contact_revealed: eng.contact_revealed,
          phone_copied: eng.phone_copied,
          email_copied: eng.email_copied,
          phone_clicked: eng.phone_clicked,
          email_link_clicked: eng.email_link_clicked,
          continue_in_inbox: eng.continue_in_inbox,
        };
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
