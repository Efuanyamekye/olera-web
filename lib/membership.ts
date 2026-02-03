import type { Membership, Profile } from "@/lib/types";

/**
 * Engagement access rules.
 *
 * - Families always have full access (they never pay).
 * - Saves and viewing inquiry existence are always free.
 * - For providers, engagement actions (viewing details, responding,
 *   initiating contact) require either:
 *   1. An active Pro membership, OR
 *   2. Remaining free connections (3 total before paywall)
 */

export const FREE_CONNECTION_LIMIT = 3;

export type EngageAction =
  | "save"
  | "receive_inquiry"
  | "view_inquiry_metadata"
  | "view_inquiry_details"
  | "respond_to_inquiry"
  | "initiate_contact";

export function canEngage(
  profileType: Profile["type"] | undefined,
  membership: Membership | null,
  action: EngageAction
): boolean {
  // Families always can
  if (profileType === "family") return true;

  // Saves are always free
  if (action === "save") return true;

  // Receiving/viewing inquiry existence is always free
  if (action === "receive_inquiry" || action === "view_inquiry_metadata")
    return true;

  // Everything else requires paid membership OR remaining free connections
  if (!membership) return false;

  // Active paid membership
  if (membership.status === "active") return true;

  // Past due — grace period
  if (membership.status === "past_due") return true;

  // Free tier — check connection limit
  if (membership.status === "free" || membership.status === "trialing") {
    return (membership.free_responses_used ?? 0) < FREE_CONNECTION_LIMIT;
  }

  return false;
}

/**
 * Returns how many free connections remain, or null if on a paid plan.
 */
export function getFreeConnectionsRemaining(
  membership: Membership | null
): number | null {
  if (!membership) return FREE_CONNECTION_LIMIT;

  if (membership.status === "active" || membership.status === "past_due") {
    return null; // unlimited on paid plan
  }

  const used = membership.free_responses_used ?? 0;
  return Math.max(0, FREE_CONNECTION_LIMIT - used);
}
