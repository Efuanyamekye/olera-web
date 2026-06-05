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
  type EngagementLevel,
  type EngagementData,
} from "@/lib/connection-engagement";

/**
 * GET /api/admin/connections — rows for the connections tracker's
 * intervention queue, each tagged with its temperature (whose-turn + staleness)
 * and sorted most-needs-attention first.
 *
 * Query params:
 *   - filter         "all" | "needs_attention" | "provider_nudged" | "family_nudged" | "responded" | "no_email"
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
type TabFilter = "all" | WorkflowState | EngagementLevel;

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
  engaged: number;
  connected: number;
  stuck: number;
  needs_call: number;
}

// Funnel stats for the stats row
interface FunnelStats {
  total: number;
  providerViewed: number;
  providerViewedRate: number;
  providerEngaged: number;
  providerEngagedRate: number;
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
    const stateFilter = searchParams.get("state") as ConnectionTemperatureState | null;
    const includeClosed = searchParams.get("include_closed") === "true";
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const offset = Number(searchParams.get("offset")) || 0;

    const db = getServiceClient();

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
      .limit(FETCH_CAP)
      .not("metadata", "cs", JSON.stringify({ archived: true }));
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo) q = q.lte("created_at", dateTo);

    const { data: rows, error } = await q;
    if (error) {
      console.error("[connections] query error:", error);
      return NextResponse.json({ error: "Failed to load connections" }, { status: 500 });
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
      const markedReplied = meta.marked_replied === true;
      const archiveReason = meta.archive_reason as string | undefined;
      const alreadyConnected = archiveReason === "already_connected";

      // Check if family has replied AFTER provider's response
      // This determines if we need to nudge the family
      // Only counts REAL replies (non-auto, non-system, with actual text)
      let familyRepliedAfterProvider = false;
      if (responded && providerMsg?.created_at) {
        const providerResponseTime = new Date(providerMsg.created_at).getTime();
        familyRepliedAfterProvider = thread.some(
          (m) =>
            m.from_profile_id === r.from_profile_id &&
            m.is_auto_reply !== true &&
            m.type !== "system" &&
            !!m.text?.trim() &&
            m.created_at &&
            new Date(m.created_at).getTime() > providerResponseTime
        );
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
          email: provider?.email ?? null,
          phone: provider?.phone ?? null,
          image_url: provider?.image_url ?? null,
          is_active: providerIsActive,
          completeness: providerCompleteness,
          activityKey: provider?.slug || provider?.source_provider_id || provider?.id || null,
        },
        messagePreview,
        responded,
        familyRepliedAfterProvider,
        providerNudgeCount,
        familyNudgeCount,
        providerNudgedAt,
        familyNudgedAt,
        workflowState,
        waitingOn,
        lastMessageAt,
        temperature,
        // Explicit connection signals from provider metadata
        markedReplied,
        alreadyConnected,
        // For engagement-based "Needs Call" tab
        needsCall: meta.followup_stopped_reason === "needs_call" || meta.needs_call === true,
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
    const providerEngagement = new Map<string, {
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

    // Initialize all providers as not engaged
    for (const key of allProviderKeys) {
      providerEngagement.set(key, {
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

    // Fetch engagement events by provider (include metadata for contact_revealed type)
    if (allProviderKeys.length > 0) {
      const { data: actEvents } = await db
        .from("provider_activity")
        .select("provider_id, event_type, created_at, metadata")
        .in("provider_id", allProviderKeys)
        .in("event_type", ["email_click", "lead_opened", "contact_revealed", "phone_clicked", "email_link_clicked", "continue_in_inbox"])
        .order("created_at", { ascending: false })
        .limit(10000);

      for (const ev of actEvents ?? []) {
        const eng = providerEngagement.get(ev.provider_id);
        if (!eng) continue;

        if (ev.event_type === "email_click") eng.email_clicked = true;
        else if (ev.event_type === "lead_opened") eng.lead_opened = true;
        else if (ev.event_type === "contact_revealed") {
          eng.contact_revealed = true;
          // Track what was copied (phone vs email)
          const meta = ev.metadata as Record<string, unknown> | null;
          if (meta?.contact_type === "phone") {
            eng.phone_copied = true;
          } else {
            eng.email_copied = true; // Default to email if not specified
          }
        }
        else if (ev.event_type === "phone_clicked") eng.phone_clicked = true;
        else if (ev.event_type === "email_link_clicked") eng.email_link_clicked = true;
        else if (ev.event_type === "continue_in_inbox") eng.continue_in_inbox = true;

        // Track most recent activity
        if (!eng.lastActivityAt || (ev.created_at && ev.created_at > eng.lastActivityAt)) {
          eng.lastActivityAt = ev.created_at;
        }
      }
    }

    // Query provider actions with metadata for detailed breakdown
    // This gives us granular counts: viewed, copied phone, copied email, clicked phone, clicked email, continued to inbox
    let actionViewedCount = 0;
    let actionCopiedPhoneCount = 0;
    let actionCopiedEmailCount = 0;
    let actionClickedPhoneCount = 0;
    let actionClickedEmailCount = 0;
    let actionContinuedToInboxCount = 0;

    if (allProviderKeys.length > 0) {
      let actionQuery = db
        .from("provider_activity")
        .select("event_type, metadata")
        .in("provider_id", allProviderKeys)
        .in("event_type", ["lead_opened", "contact_revealed", "phone_clicked", "email_link_clicked", "continue_in_inbox"]);

      // Apply date filters to match the connections date range
      if (dateFrom) actionQuery = actionQuery.gte("created_at", dateFrom);
      if (dateTo) actionQuery = actionQuery.lte("created_at", dateTo);

      const { data: actionEvents } = await actionQuery.limit(10000);

      for (const ev of actionEvents ?? []) {
        if (ev.event_type === "lead_opened") {
          actionViewedCount++;
        } else if (ev.event_type === "contact_revealed") {
          const meta = ev.metadata as Record<string, unknown> | null;
          if (meta?.contact_type === "phone") {
            actionCopiedPhoneCount++;
          } else if (meta?.contact_type === "email") {
            actionCopiedEmailCount++;
          } else {
            // Default to email if contact_type not specified
            actionCopiedEmailCount++;
          }
        } else if (ev.event_type === "phone_clicked") {
          actionClickedPhoneCount++;
        } else if (ev.event_type === "email_link_clicked") {
          actionClickedEmailCount++;
        } else if (ev.event_type === "continue_in_inbox") {
          actionContinuedToInboxCount++;
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
      engaged: 0,
      connected: 0,
      stuck: 0,
      needs_call: 0,
    };

    // Funnel stats
    let providerViewedCount = 0;
    let providerEngagedCount = 0;
    let respondedCount = 0;
    let connectedCount = 0;

    // Calculate engagement level for each connection and store it
    const connectionEngagementLevels = new Map<string, EngagementLevel>();

    for (const c of searched) {
      // Get engagement data for this provider
      const eng = c.provider.activityKey ? providerEngagement.get(c.provider.activityKey) : null;

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

      const engagementData: EngagementData = {
        emailClicked: eng?.email_clicked ?? false,
        leadOpened: eng?.lead_opened ?? false,
        contactRevealed: eng?.contact_revealed ?? false,
        phoneClicked: eng?.phone_clicked ?? false,
        emailLinkClicked: eng?.email_link_clicked ?? false,
        continueInInbox: eng?.continue_in_inbox ?? false,
        providerMessaged: c.responded,
        markedReplied: c.markedReplied,
        alreadyConnected: c.alreadyConnected,
        lastActivityAt: combinedLastActivity,
        needsCall: c.needsCall,
      };

      const engResult = getEngagementLevel(engagementData, c.created_at, now);
      connectionEngagementLevels.set(c.id, engResult.level);

      // Only count active connections (those with workflowState)
      // This ensures tab counts match the displayed connections
      if (c.workflowState) {
        // Count workflow states
        workflowCounts.all++;
        workflowCounts[c.workflowState]++;

        // Count engagement levels
        engagementCounts.all++;
        engagementCounts[engResult.level]++;

        // Funnel stats (based on provider engagement)
        if (eng?.lead_opened) providerViewedCount++;
        if (eng?.contact_revealed || eng?.phone_clicked || eng?.email_link_clicked || eng?.continue_in_inbox) providerEngagedCount++;
        // Count as responded if: sent message, marked as replied, or already connected
        if (c.responded || c.markedReplied || c.alreadyConnected) respondedCount++;
        if (c.familyRepliedAfterProvider) connectedCount++;
      }
    }

    // Calculate funnel rates
    const totalActive = workflowCounts.all;
    const funnelStats: FunnelStats = {
      total: totalActive,
      providerViewed: providerViewedCount,
      providerViewedRate: totalActive > 0 ? Math.round((providerViewedCount / totalActive) * 100) : 0,
      providerEngaged: providerEngagedCount,
      providerEngagedRate: totalActive > 0 ? Math.round((providerEngagedCount / totalActive) * 100) : 0,
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
      clickedPhone: actionClickedPhoneCount,
      clickedEmail: actionClickedEmailCount,
      continuedToInbox: actionContinuedToInboxCount,
      copiedPhoneRate: actionViewedCount > 0 ? Math.round((actionCopiedPhoneCount / actionViewedCount) * 100) : 0,
      copiedEmailRate: actionViewedCount > 0 ? Math.round((actionCopiedEmailCount / actionViewedCount) * 100) : 0,
      clickedPhoneRate: actionViewedCount > 0 ? Math.round((actionClickedPhoneCount / actionViewedCount) * 100) : 0,
      clickedEmailRate: actionViewedCount > 0 ? Math.round((actionClickedEmailCount / actionViewedCount) * 100) : 0,
      continuedToInboxRate: actionViewedCount > 0 ? Math.round((actionContinuedToInboxCount / actionViewedCount) * 100) : 0,
    };

    // Filtering by workflow state or engagement level
    let list = searched.filter(c => c.workflowState !== null); // Exclude inactive providers

    // Check if filter is an engagement level
    const engagementLevels: EngagementLevel[] = ["new", "viewed", "engaged", "connected", "stuck", "needs_call"];
    const isEngagementFilter = engagementLevels.includes(responseFilter as EngagementLevel);

    if (responseFilter !== "all") {
      if (isEngagementFilter) {
        // Filter by engagement level
        list = list.filter((c) => connectionEngagementLevels.get(c.id) === responseFilter);
      } else {
        // Filter by workflow state (legacy)
        list = list.filter((c) => c.workflowState === responseFilter);
      }
    }

    // Sort by most recent first (matches Leads page behavior)
    list.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    const pageRaw = list.slice(offset, offset + limit);

    // Add engagement level to each connection in the page
    const page = pageRaw.map((c) => ({
      ...c,
      engagementLevel: connectionEngagementLevels.get(c.id) ?? "new",
    }));

    // Per-provider engagement data for UI badges (keyed by provider activityKey)
    // Note: "messaged", "markedReplied", "alreadyConnected" are NOT included here
    // because they're per-connection, not per-provider. The frontend should use
    // c.responded, c.markedReplied, c.alreadyConnected directly.
    const engagement: Record<string, { email_clicked: boolean; lead_opened: boolean; contact_revealed: boolean; phone_copied: boolean; email_copied: boolean; phone_clicked: boolean; email_link_clicked: boolean; continue_in_inbox: boolean }> = {};
    for (const c of pageRaw) {
      const key = c.provider.activityKey;
      if (key && !engagement[key]) {
        const eng = providerEngagement.get(key);
        engagement[key] = {
          email_clicked: eng?.email_clicked ?? false,
          lead_opened: eng?.lead_opened ?? false,
          contact_revealed: eng?.contact_revealed ?? false,
          phone_copied: eng?.phone_copied ?? false,
          email_copied: eng?.email_copied ?? false,
          phone_clicked: eng?.phone_clicked ?? false,
          email_link_clicked: eng?.email_link_clicked ?? false,
          continue_in_inbox: eng?.continue_in_inbox ?? false,
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
      workflowCounts,
      engagementCounts,
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
