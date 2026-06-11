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
  | "new"
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
  status: "viewed" | "connected";
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
  if (typeof obj.status !== "string" || (obj.status !== "viewed" && obj.status !== "connected")) {
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
    status: obj.status as "viewed" | "connected",
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
   * Used to calculate staleness - provider can't be "stale" before receiving the lead.
   */
  sequenceStartAt?: string | null;
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
  new: "New",
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
  new: {
    label: "New",
    dot: "bg-blue-400",
    text: "text-blue-700",
    description: "Lead sent, provider hasn't viewed yet",
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
    description: "No activity for 10+ days, requires manual intervention",
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
 * Hierarchy (highest wins):
 *   1. Connected - provider messaged, called, or emailed
 *   2. Viewed - provider opened the lead or showed interest
 *   3. New - no engagement yet
 *   4. Needs Follow-up - no activity for 10+ days (requires manual intervention)
 */
export function getEngagementLevel(
  engagement: EngagementData,
  connectionCreatedAt: string,
  now: number = Date.now()
): EngagementResult {
  // Calculate staleness
  // Use sequenceStartAt (when Day 0 email was sent) if available, otherwise connection creation
  // This handles providers who got email added later - they can't be "stale" before receiving the lead
  const connectionCreatedTime = new Date(connectionCreatedAt).getTime();
  const sequenceStartTime = engagement.sequenceStartAt
    ? new Date(engagement.sequenceStartAt).getTime()
    : connectionCreatedTime;
  // Use the later of: connection creation OR sequence start (handles edge cases)
  const baselineTime = Math.max(connectionCreatedTime, sequenceStartTime);

  const providerLastActivity = engagement.lastActivityAt
    ? new Date(engagement.lastActivityAt).getTime()
    : baselineTime;
  // Use the more recent of: provider's last activity OR baseline
  const lastActivity = Math.max(providerLastActivity, baselineTime);
  const daysSinceActivity = Math.floor((now - lastActivity) / DAY_MS);
  const isStale = daysSinceActivity >= PROVIDER_STUCK_THRESHOLD_DAYS;

  // Determine base level first (before applying time-based rules)
  // PRIORITY: Admin override > Automatic tracking
  let baseLevel: EngagementLevel;

  if (engagement.adminMarkedConnected) {
    // Admin manually verified this connection (off-platform activity)
    // Takes highest priority - admin has confirmed provider connected
    baseLevel = "connected";
  } else if (engagement.adminMarkedViewed) {
    // Admin manually verified provider viewed the lead (off-platform confirmation)
    // Takes priority over automatic tracking
    baseLevel = "viewed";
  } else if (
    engagement.providerMessaged ||
    engagement.phoneClicked ||
    engagement.emailLinkClicked
  ) {
    // Provider reached out - this is success
    // Connected when: sent message, copied phone, or copied email
    baseLevel = "connected";
  } else if (
    engagement.leadOpened
  ) {
    // Provider opened the lead drawer
    baseLevel = "viewed";
  } else {
    // No engagement yet
    baseLevel = "new";
  }

  // Determine final engagement level (purely time-based for UI tabs)
  // - Connected: provider reached out (success) - never becomes needs_follow_up
  // - Viewed: provider showed interest, keep in their tab and continue sequence
  // - Admin-marked viewed: can still escalate if very stale (prevents zombie records)
  // - Needs Follow-up: 10+ days with NO engagement (requires manual intervention)
  let level: EngagementLevel;
  if (baseLevel === "connected") {
    level = "connected";
  } else if (baseLevel === "viewed") {
    // Check if this is admin-marked viewed vs automatic tracking
    const isAdminMarkedViewed = engagement.adminMarkedViewed && !engagement.leadOpened && !engagement.contactRevealed;

    if (isAdminMarkedViewed && isStale) {
      // Admin verified they viewed, but it's been 10+ days with no actual activity
      // Escalate to needs_follow_up to prevent zombie records stuck in viewed forever
      level = "needs_follow_up";
    } else {
      // Automatic viewed OR admin-marked but not yet stale - keep in viewed tab
      level = baseLevel;
    }
  } else if (isStale) {
    // 10+ days with NO engagement → needs_follow_up (requires manual intervention)
    level = "needs_follow_up";
  } else {
    level = baseLevel;
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
    engagement.emailLinkClicked
  );
}

/**
 * Sort priority for the connections list.
 * Lower = more urgent / needs attention.
 *
 * Priority:
 *   1. Needs Follow-up (requires manual intervention)
 *   2. Viewed (warm - they looked or showed interest)
 *   3. New (cold - need to nudge)
 *   4. Connected (success - just monitoring)
 */
export const ENGAGEMENT_PRIORITY: Record<EngagementLevel, number> = {
  needs_follow_up: 0, // Urgent - requires manual intervention
  viewed: 1,          // Warm - they looked or showed interest
  new: 2,             // Cold
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
