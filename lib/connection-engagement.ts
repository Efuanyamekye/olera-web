/**
 * Engagement-based categorization for the connections tracker.
 *
 * Unlike connection-temperature.ts (which tracks message-based state),
 * this module categorizes connections by provider engagement level:
 *
 *   New        → Lead sent, provider hasn't viewed it yet
 *   Viewed     → Provider opened the lead page
 *   Engaged    → Provider revealed contact info (opened drawer)
 *   Connected  → Provider reached out (called, emailed, or messaged)
 *   Stuck      → No activity for 14+ days, awaiting re-engagement
 *   Needs Call → Re-engagement email sent, still no response (24+ days)
 *
 * This matches the actual provider journey rather than assuming
 * a messaging-based workflow.
 */

export type EngagementLevel =
  | "new"
  | "viewed"
  | "engaged"
  | "connected"
  | "stuck"
  | "needs_call";

export interface EngagementData {
  emailClicked: boolean;
  leadOpened: boolean;
  contactRevealed: boolean;
  phoneClicked: boolean;
  emailLinkClicked: boolean;
  continueInInbox: boolean;
  providerMessaged: boolean;
  /** Provider explicitly marked the lead as "Replied" in their drawer */
  markedReplied: boolean;
  /** Provider archived with reason "already_connected" */
  alreadyConnected: boolean;
  lastActivityAt: string | null;
  /** Set by cron when all automated outreach is exhausted */
  needsCall?: boolean;
}

export interface EngagementResult {
  level: EngagementLevel;
  label: string;
  /** Days since last activity (any engagement event or connection creation) */
  daysSinceActivity: number;
  /** Whether this connection is going stale */
  isStale: boolean;
}

// ── Thresholds ──

const DAY_MS = 24 * 60 * 60 * 1000;

/** Connections with no activity beyond this are "stuck" */
export const STUCK_THRESHOLD_DAYS = 14;

/** Connections stuck beyond this need manual call intervention */
export const NEEDS_CALL_THRESHOLD_DAYS = 24;

// ── Labels ──

export const ENGAGEMENT_LABELS: Record<EngagementLevel, string> = {
  new: "New",
  viewed: "Viewed",
  engaged: "Engaged",
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
    description: "Provider opened the lead",
  },
  engaged: {
    label: "Engaged",
    dot: "bg-orange-400",
    text: "text-orange-700",
    description: "Provider revealed contact info",
  },
  connected: {
    label: "Connected",
    dot: "bg-emerald-400",
    text: "text-emerald-700",
    description: "Provider reached out to family",
  },
  stuck: {
    label: "Stuck",
    dot: "bg-gray-400",
    text: "text-gray-500",
    description: "No activity for 14+ days",
  },
  needs_call: {
    label: "Needs Call",
    dot: "bg-red-400",
    text: "text-red-600",
    description: "Re-engagement failed, requires manual call",
  },
};

/**
 * Calculate the engagement level for a connection based on provider activity.
 *
 * Hierarchy (highest wins):
 *   1. Connected - provider messaged, called, or emailed
 *   2. Engaged - provider revealed contact info
 *   3. Viewed - provider opened the lead
 *   4. New - no engagement yet
 *   5. Stuck - any of above but stale (14+ days)
 *   6. Needs Call - stuck beyond 24 days OR marked by cron as needing manual intervention
 */
export function getEngagementLevel(
  engagement: EngagementData,
  connectionCreatedAt: string,
  now: number = Date.now()
): EngagementResult {
  // Calculate staleness
  // Use the MORE RECENT of: provider's last activity OR connection creation
  // A connection can't be "stale" before it was created!
  const connectionCreatedTime = new Date(connectionCreatedAt).getTime();
  const providerLastActivity = engagement.lastActivityAt
    ? new Date(engagement.lastActivityAt).getTime()
    : connectionCreatedTime;
  // If provider's activity is older than this connection, use connection creation time
  const lastActivity = Math.max(providerLastActivity, connectionCreatedTime);
  const daysSinceActivity = Math.floor((now - lastActivity) / DAY_MS);
  const isStale = daysSinceActivity >= STUCK_THRESHOLD_DAYS;
  const needsCallByTime = daysSinceActivity >= NEEDS_CALL_THRESHOLD_DAYS;

  // If explicitly marked as needs_call by cron AND actually old enough, return that
  // This double-check prevents data corruption from showing new leads as needs_call
  if (engagement.needsCall && daysSinceActivity >= NEEDS_CALL_THRESHOLD_DAYS) {
    return {
      level: "needs_call",
      label: ENGAGEMENT_LABELS.needs_call,
      daysSinceActivity,
      isStale: true,
    };
  }

  // Determine base level (before stuck check)
  let baseLevel: EngagementLevel;

  if (
    engagement.providerMessaged ||
    engagement.phoneClicked ||
    engagement.emailLinkClicked ||
    engagement.markedReplied ||    // Provider explicitly marked as "Replied"
    engagement.alreadyConnected    // Provider archived with "Already connected" reason
  ) {
    // Provider reached out - this is success
    baseLevel = "connected";
  } else if (engagement.contactRevealed || engagement.continueInInbox) {
    // Provider revealed contact info or clicked to continue in inbox - actively interested
    baseLevel = "engaged";
  } else if (engagement.leadOpened) {
    // Provider viewed the lead - passive interest
    baseLevel = "viewed";
  } else {
    // No engagement yet
    baseLevel = "new";
  }

  // Connected connections don't become stuck or needs_call (they're successful)
  let level: EngagementLevel;
  if (baseLevel === "connected") {
    level = "connected";
  } else if (needsCallByTime) {
    // 24+ days without engagement → needs manual intervention
    level = "needs_call";
  } else if (isStale) {
    // 14+ days → stuck (awaiting re-engagement email)
    level = "stuck";
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
 * Connected = provider took action to reach the family.
 */
export function isConnected(engagement: EngagementData): boolean {
  return (
    engagement.providerMessaged ||
    engagement.phoneClicked ||
    engagement.emailLinkClicked ||
    engagement.markedReplied ||
    engagement.alreadyConnected
  );
}

/**
 * Sort priority for the connections list.
 * Lower = more urgent / needs attention.
 *
 * Priority:
 *   1. Needs Call (requires immediate manual intervention)
 *   2. Engaged (hot leads - provider interested but hasn't reached out)
 *   3. Viewed (warm - they looked)
 *   4. New (cold - need to nudge)
 *   5. Stuck (stale - awaiting re-engagement)
 *   6. Connected (success - just monitoring)
 */
export const ENGAGEMENT_PRIORITY: Record<EngagementLevel, number> = {
  needs_call: 0, // Urgent - requires manual call
  engaged: 1,    // Hot - prioritize these
  viewed: 2,     // Warm
  new: 3,        // Cold
  stuck: 4,      // Stale - awaiting re-engagement
  connected: 5,  // Success - lowest priority (good problem to have)
};
