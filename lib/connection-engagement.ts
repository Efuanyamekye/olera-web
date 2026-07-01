/**
 * Engagement-based categorization for the connections tracker.
 *
 * Unlike connection-temperature.ts (which tracks message-based state),
 * this module categorizes connections by provider engagement level:
 *
 *   New             → Lead sent, provider hasn't viewed it yet
 *   Viewed          → Provider opened lead or showed interest (revealed contact, clicked inbox)
 *   Connected       → Provider reached out (called, emailed, or messaged)
 *   Needs Follow-up → No provider activity for 10+ days, requires manual intervention
 *
 * This matches the actual provider journey rather than assuming
 * a messaging-based workflow.
 */

export type EngagementLevel =
  | "awaiting"  // Renamed from "new" - provider hasn't engaged, automation still working
  | "viewed"
  | "connected"
  | "needs_follow_up";

/**
 * Family engagement levels - parallel to provider engagement but from family's perspective.
 *
 *   New       → Provider hasn't responded yet (family is waiting)
 *   Awaiting  → Provider responded, family hasn't replied (ball in family's court)
 *   Connected → Family replied at least once (conversation active)
 *   Stuck     → No family activity for 14+ days
 *   Needs Call → No family activity for 24+ days
 */
export type FamilyEngagementLevel =
  | "new"
  | "awaiting"
  | "connected"
  | "stuck"
  | "needs_call";

/**
 * Admin override structure for manually marking connection status.
 * Used when admins verify off-platform activity (phone calls, in-person, etc.)
 */
export interface AdminOverride {
  status: "viewed" | "connected" | "not_interested";
  marked_at: string;
  marked_by: string;
  marked_by_email?: string;
  reason: string;
  notes?: string | null;
}

/**
 * Type-safe parser for admin_override metadata.
 * Returns null if the data doesn't match the expected structure.
 */
export function parseAdminOverride(value: unknown): AdminOverride | null {
  if (!value || typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.status !== "string" || (obj.status !== "viewed" && obj.status !== "connected" && obj.status !== "not_interested")) {
    return null;
  }
  if (typeof obj.marked_at !== "string") return null;
  if (typeof obj.marked_by !== "string") return null;
  if (typeof obj.reason !== "string") return null;

  // Validate optional fields
  if (obj.marked_by_email !== undefined && typeof obj.marked_by_email !== "string") {
    return null;
  }
  if (obj.notes !== undefined && obj.notes !== null && typeof obj.notes !== "string") {
    return null;
  }

  return {
    status: obj.status as "viewed" | "connected" | "not_interested",
    marked_at: obj.marked_at,
    marked_by: obj.marked_by,
    marked_by_email: obj.marked_by_email as string | undefined,
    reason: obj.reason,
    notes: (obj.notes as string | null | undefined) ?? null,
  };
}

export interface EngagementData {
  emailClicked: boolean;
  leadOpened: boolean;
  contactRevealed: boolean;
  /** Provider copied phone number (triggers "phone_clicked" event) */
  phoneClicked: boolean;
  /** Provider copied email address (triggers "email_link_clicked" event) */
  emailLinkClicked: boolean;
  continueInInbox: boolean;
  /** Provider sent a message through the inbox */
  providerMessaged: boolean;
  /** Family self-reported that the provider got back to them */
  familyConfirmed: boolean;
  /** Admin manually marked this connection as "viewed" (verified off-platform activity) */
  adminMarkedViewed: boolean;
  /** Admin manually marked this connection as "connected" (verified off-platform activity) */
  adminMarkedConnected: boolean;
  lastActivityAt: string | null;
  /** Set by cron when all automated outreach is exhausted */
  needsCall?: boolean;
  /**
   * When the follow-up sequence started (Day 0 email sent).
   * For providers who had email from the start, this equals connection creation.
   * For providers who got email added later, this is when email was added.
   */
  sequenceStartAt?: string | null;
  /**
   * Current stage in the follow-up email sequence (0-3).
   * Stage 0 = Day 0 email sent
   * Stage 1 = Nudge 1 (Day 3)
   * Stage 2 = Nudge 2 (Day 7)
   * Stage 3 = Final nudge (sequence complete)
   */
  followupStage?: number | null;
  /**
   * Why the follow-up sequence stopped.
   * "connected" | "responded" | "admin_marked_connected" | "admin_declined" | "needs_call" | etc.
   */
  followupStoppedReason?: string | null;
}

/**
 * Family engagement data - tracks family's actions after provider responds.
 */
export interface FamilyEngagementData {
  /** Provider sent a real message (non-auto-reply) */
  providerResponded: boolean;
  /** Timestamp when provider first responded */
  providerRespondedAt: string | null;
  /** Family sent a message AFTER provider responded */
  familyReplied: boolean;
  /** Number of family messages after provider responded */
  familyMessageCount: number;
  /** Family's last activity timestamp (their last message, not thread's last message) */
  lastFamilyActivityAt: string | null;
  /** Number of times family has been nudged */
  familyNudgeCount: number;
}

export interface EngagementResult {
  level: EngagementLevel;
  label: string;
  /** Days since last activity (any engagement event or connection creation) */
  daysSinceActivity: number;
  /** Whether this connection is going stale */
  isStale: boolean;
}

export interface FamilyEngagementResult {
  level: FamilyEngagementLevel;
  label: string;
  /** Days since last family activity */
  daysSinceActivity: number;
  /** Whether the family engagement is going stale */
  isStale: boolean;
}

// ── Thresholds ──

const DAY_MS = 24 * 60 * 60 * 1000;

// Provider engagement thresholds (compressed for faster human intervention)
/** Provider connections with no activity beyond this need follow-up */
export const PROVIDER_STUCK_THRESHOLD_DAYS = 10;
/** @deprecated No longer used - provider engagement uses single 10-day threshold */
export const PROVIDER_NEEDS_CALL_THRESHOLD_DAYS = 14;

// Family engagement thresholds (more lenient)
/** Family connections with no activity beyond this are "stuck" */
export const FAMILY_STUCK_THRESHOLD_DAYS = 14;
/** Family connections stuck beyond this need manual call intervention */
export const FAMILY_NEEDS_CALL_THRESHOLD_DAYS = 24;

// Legacy exports for backwards compatibility (use provider thresholds)
/** @deprecated Use PROVIDER_STUCK_THRESHOLD_DAYS or FAMILY_STUCK_THRESHOLD_DAYS */
export const STUCK_THRESHOLD_DAYS = PROVIDER_STUCK_THRESHOLD_DAYS;
/** @deprecated Use PROVIDER_NEEDS_CALL_THRESHOLD_DAYS or FAMILY_NEEDS_CALL_THRESHOLD_DAYS */
export const NEEDS_CALL_THRESHOLD_DAYS = PROVIDER_NEEDS_CALL_THRESHOLD_DAYS;

// ── Labels ──

export const ENGAGEMENT_LABELS: Record<EngagementLevel, string> = {
  awaiting: "Awaiting",
  viewed: "Viewed",
  connected: "Connected",
  needs_follow_up: "Needs Follow-up",
};

export const FAMILY_ENGAGEMENT_LABELS: Record<FamilyEngagementLevel, string> = {
  new: "New",
  awaiting: "Awaiting",
  connected: "Connected",
  stuck: "Stuck",
  needs_call: "Needs Call",
};

export const ENGAGEMENT_CONFIG: Record<
  EngagementLevel,
  { label: string; dot: string; text: string; description: string }
> = {
  awaiting: {
    label: "Awaiting",
    dot: "bg-blue-400",
    text: "text-blue-700",
    description: "Provider hasn't engaged yet, automation still working",
  },
  viewed: {
    label: "Viewed",
    dot: "bg-amber-400",
    text: "text-amber-700",
    description: "Provider opened or showed interest in the lead",
  },
  connected: {
    label: "Connected",
    dot: "bg-emerald-400",
    text: "text-emerald-700",
    description: "Provider reached out to family",
  },
  needs_follow_up: {
    label: "Needs Follow-up",
    dot: "bg-red-400",
    text: "text-red-600",
    description: "Email sequence complete, no response - requires manual intervention",
  },
};

export const FAMILY_ENGAGEMENT_CONFIG: Record<
  FamilyEngagementLevel,
  { label: string; dot: string; text: string; description: string }
> = {
  new: {
    label: "New",
    dot: "bg-blue-400",
    text: "text-blue-700",
    description: "Provider hasn't responded yet",
  },
  awaiting: {
    label: "Awaiting",
    dot: "bg-amber-400",
    text: "text-amber-700",
    description: "Provider responded, awaiting family reply",
  },
  connected: {
    label: "Connected",
    dot: "bg-emerald-400",
    text: "text-emerald-700",
    description: "Family replied to provider",
  },
  stuck: {
    label: "Stuck",
    dot: "bg-gray-400",
    text: "text-gray-500",
    description: "No family activity for 14+ days",
  },
  needs_call: {
    label: "Needs Call",
    dot: "bg-red-400",
    text: "text-red-600",
    description: "No family activity for 24+ days",
  },
};

/**
 * Calculate the engagement level for a connection based on provider activity.
 *
 * KEY PRINCIPLE: "Needs Follow-up" is based on SEQUENCE COMPLETION, not time.
 * Automation should try everything before escalating to humans.
 *
 * Hierarchy (highest wins):
 *   1. Connected - provider messaged, called, or emailed
 *   2. Viewed - provider opened the lead or showed interest
 *   3. Awaiting - no engagement yet, automation still working
 *   4. Needs Follow-up - sequence COMPLETE with no response (requires manual intervention)
 */
export function getEngagementLevel(
  engagement: EngagementData,
  connectionCreatedAt: string,
  now: number = Date.now()
): EngagementResult {
  // Calculate days since activity (for display purposes, not for escalation)
  const connectionCreatedTime = new Date(connectionCreatedAt).getTime();
  const sequenceStartTime = engagement.sequenceStartAt
    ? new Date(engagement.sequenceStartAt).getTime()
    : connectionCreatedTime;
  const baselineTime = Math.max(connectionCreatedTime, sequenceStartTime);

  const providerLastActivity = engagement.lastActivityAt
    ? new Date(engagement.lastActivityAt).getTime()
    : baselineTime;
  const lastActivity = Math.max(providerLastActivity, baselineTime);
  const daysSinceActivity = Math.floor((now - lastActivity) / DAY_MS);

  // Sequence completion check
  // Stage 3 = final email sent (sequence complete)
  // needsCall flag is set explicitly when sequence exhausted
  // followupStoppedReason === "needs_call" is another explicit signal
  const sequenceComplete =
    (engagement.followupStage != null && engagement.followupStage >= 3) ||
    engagement.needsCall === true ||
    engagement.followupStoppedReason === "needs_call";

  // isStale is now informational only - we use sequenceComplete for escalation
  const isStale = sequenceComplete;

  // Determine engagement level
  // PRIORITY: Connection signals > Admin overrides > Automatic tracking > Sequence-based escalation
  // Note: familyConfirmed and provider actions OVERRIDE adminMarkedViewed because they are
  // ground-truth connection signals. adminMarkedViewed is a softer "they looked" signal.
  let level: EngagementLevel;

  if (engagement.adminMarkedConnected) {
    // Admin manually verified this connection (off-platform activity)
    // Takes highest priority - admin has confirmed provider connected
    level = "connected";
  } else if (
    engagement.providerMessaged ||
    engagement.phoneClicked ||
    engagement.emailLinkClicked ||
    engagement.familyConfirmed
  ) {
    // Provider reached out (or family confirmed they did) - this is success
    // This OVERRIDES adminMarkedViewed because actual connection > "just viewed"
    level = "connected";
  } else if (engagement.adminMarkedViewed) {
    // Admin manually verified provider viewed the lead
    // Respected only when no actual connection signals exist
    level = "viewed";
  } else if (engagement.leadOpened) {
    // Provider opened the lead drawer
    level = "viewed";
  } else if (sequenceComplete) {
    // Sequence exhausted with NO engagement → needs manual intervention
    level = "needs_follow_up";
  } else {
    // No engagement yet, automation still working
    level = "awaiting";
  }

  return {
    level,
    label: ENGAGEMENT_LABELS[level],
    daysSinceActivity,
    isStale,
  };
}

/**
 * Check if a connection is considered successful.
 * Connected = provider took action to reach the family:
 *   - Sent a message through inbox
 *   - Copied phone number
 *   - Copied email address
 *   - Admin manually verified connection
 */
export function isConnected(engagement: EngagementData): boolean {
  return (
    engagement.adminMarkedConnected ||
    engagement.providerMessaged ||
    engagement.phoneClicked ||
    engagement.emailLinkClicked ||
    engagement.familyConfirmed
  );
}

/**
 * Sort priority for the connections list.
 * Lower = more urgent / needs attention.
 *
 * Priority:
 *   1. Needs Follow-up (requires manual intervention - sequence exhausted)
 *   2. Viewed (warm - they looked or showed interest)
 *   3. Awaiting (automation is working on it)
 *   4. Connected (success - just monitoring)
 */
export const ENGAGEMENT_PRIORITY: Record<EngagementLevel, number> = {
  needs_follow_up: 0, // Urgent - requires manual intervention
  viewed: 1,          // Warm - they looked or showed interest
  awaiting: 2,        // Automation working on it
  connected: 3,       // Success - lowest priority (good problem to have)
};

/**
 * Sort priority for family engagement (family perspective).
 * Lower = more urgent / needs attention.
 */
export const FAMILY_ENGAGEMENT_PRIORITY: Record<FamilyEngagementLevel, number> = {
  needs_call: 0, // Urgent - family unresponsive 24+ days
  awaiting: 1,   // Hot - provider responded, family hasn't
  new: 2,        // Cold - waiting on provider
  stuck: 3,      // Stale - family went silent
  connected: 4,  // Success - family replied
};

/**
 * Calculate family engagement level based on family's activity after provider responds.
 *
 * Key difference from provider engagement:
 * - Family engagement tracking starts AFTER provider responds
 * - Until provider responds, connection shows as "new" (same as provider side)
 *
 * Hierarchy:
 *   1. Provider hasn't responded yet → "new"
 *   2. Provider responded, family hasn't replied → "awaiting"
 *   3. Family replied at least once → "connected" (success state)
 *   4. No family activity for 14+ days (not connected) → "stuck"
 *   5. No family activity for 24+ days → "needs_call"
 */
export function getFamilyEngagementLevel(
  data: FamilyEngagementData,
  connectionCreatedAt: string,
  now: number = Date.now()
): FamilyEngagementResult {
  // If provider hasn't responded yet, escalate to admin based on time
  // This ensures provider-silent connections don't sit in "new" forever
  if (!data.providerResponded) {
    const connectionCreatedTime = new Date(connectionCreatedAt).getTime();
    const daysSinceCreation = Math.floor((now - connectionCreatedTime) / DAY_MS);

    // Provider-silent connections should escalate:
    // - 24+ days → needs_call (admin intervention required)
    // - 14+ days → stuck (re-engagement failed, heading to needs_call)
    // - <14 days → new (normal flow, emails #5 and #7 will handle)
    let level: FamilyEngagementLevel;
    let isStale: boolean;

    if (daysSinceCreation >= FAMILY_NEEDS_CALL_THRESHOLD_DAYS) {
      level = "needs_call";
      isStale = true;
    } else if (daysSinceCreation >= FAMILY_STUCK_THRESHOLD_DAYS) {
      level = "stuck";
      isStale = true;
    } else {
      level = "new";
      isStale = false;
    }

    return {
      level,
      label: FAMILY_ENGAGEMENT_LABELS[level],
      daysSinceActivity: daysSinceCreation,
      isStale,
    };
  }

  // Calculate staleness from family's last activity
  // Use provider response time as baseline (not connection creation) since family
  // engagement only starts after provider responds
  const providerRespondedTime = data.providerRespondedAt
    ? new Date(data.providerRespondedAt).getTime()
    : new Date(connectionCreatedAt).getTime();
  const familyLastActivity = data.lastFamilyActivityAt
    ? new Date(data.lastFamilyActivityAt).getTime()
    : providerRespondedTime;
  // Use the more recent of: family's last activity OR when provider responded
  // (family can't be stale before provider even responded)
  const lastActivity = Math.max(familyLastActivity, providerRespondedTime);
  const daysSinceActivity = Math.floor((now - lastActivity) / DAY_MS);
  const isStale = daysSinceActivity >= FAMILY_STUCK_THRESHOLD_DAYS;
  const needsCallByTime = daysSinceActivity >= FAMILY_NEEDS_CALL_THRESHOLD_DAYS;

  // Determine base level
  let baseLevel: FamilyEngagementLevel;

  if (data.familyReplied) {
    // Family replied at least once - success state
    baseLevel = "connected";
  } else {
    // Provider responded but family hasn't replied
    baseLevel = "awaiting";
  }

  // Connected doesn't become stuck (success state)
  let level: FamilyEngagementLevel;
  if (baseLevel === "connected") {
    level = "connected";
  } else if (needsCallByTime) {
    level = "needs_call";
  } else if (isStale) {
    level = "stuck";
  } else {
    level = baseLevel;
  }

  return {
    level,
    label: FAMILY_ENGAGEMENT_LABELS[level],
    daysSinceActivity,
    isStale,
  };
}
