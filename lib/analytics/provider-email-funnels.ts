/**
 * Maps a Provider Comms Funnel filter key (the dropdown on the analytics page)
 * to the `email_log.email_type` values it covers.
 *
 * Used by /api/admin/analytics/summary to compute the cohort funnel + engagement
 * bounce for each bucket, and by /admin/analytics to render the dropdown.
 *
 * `recipient_type = 'provider'` is applied at the query level — these buckets
 * just narrow further by type. A provider may receive multiple types in a
 * window; with approximate attribution they'll count in every bucket they
 * clicked. Tooltip in the UI names this caveat.
 */

import { ONBOARDING_EMAIL_TYPES } from "@/lib/provider-comms/reporting";

export type ProviderEmailFunnelKey =
  | "all"
  | "onboarding"
  | "question_received"
  | "weekly_digest"
  | "verification"
  | "nudges"
  | "connections";

export const PROVIDER_EMAIL_FUNNEL_LABELS: Record<ProviderEmailFunnelKey, string> = {
  all: "All provider email",
  onboarding: "Onboarding",
  question_received: "Q&A (question_received)",
  weekly_digest: "Weekly digest",
  verification: "Verification flow",
  nudges: "Profile nudges",
  connections: "Connections & messages",
};

/**
 * Order matters — drives the dropdown order. `all` first so it's the default.
 */
export const PROVIDER_EMAIL_FUNNEL_ORDER: ProviderEmailFunnelKey[] = [
  "all",
  "onboarding",
  "question_received",
  "weekly_digest",
  "verification",
  "nudges",
  "connections",
];

const QUESTION_RECEIVED = ["question_received"] as const;
const WEEKLY_DIGEST = ["weekly_analytics_digest"] as const;
// Verification covers the full onboarding/claim arc: OTP codes from the claim
// flow, reminders, and the decision emails. (claim_notification is admin-bound,
// not provider, so it's not here.)
const VERIFICATION = [
  "verification_code",
  "verification_otp",
  "verification_pending_review",
  "verification_decision",
  "verification_approved",
  "verification_rejected",
  "verification_method_failed",
  "verification_reminder_7d",
  "verification_reminder_21d",
] as const;
const NUDGES = ["provider_nudge", "provider_incomplete_profile"] as const;
// new_message also goes to families; recipient_type='provider' separates them
// at query time.
const CONNECTIONS = [
  "connection_request",
  "new_message",
  "new_review",
  "reach_out_accepted",
  "add_email_notification",
] as const;

const ALL_PROVIDER_EMAIL_TYPES: readonly string[] = [
  ...ONBOARDING_EMAIL_TYPES,
  ...QUESTION_RECEIVED,
  ...WEEKLY_DIGEST,
  ...VERIFICATION,
  ...NUDGES,
  ...CONNECTIONS,
];

export const PROVIDER_EMAIL_FUNNEL_TYPES: Record<ProviderEmailFunnelKey, readonly string[]> = {
  all: ALL_PROVIDER_EMAIL_TYPES,
  onboarding: ONBOARDING_EMAIL_TYPES,
  question_received: QUESTION_RECEIVED,
  weekly_digest: WEEKLY_DIGEST,
  verification: VERIFICATION,
  nudges: NUDGES,
  connections: CONNECTIONS,
};

/**
 * Returns the bucket a given email_type belongs to. The `all` bucket isn't
 * returned (it's a union and would double-count). Returns null if the type
 * isn't a known provider email type.
 *
 * Used by the route's partition step: one email_log row maps to one bucket
 * (plus the implicit `all` count). If a future email_type lands in multiple
 * buckets, the first match wins — order it intentionally in this function.
 */
export function bucketForEmailType(emailType: string): ProviderEmailFunnelKey | null {
  if ((ONBOARDING_EMAIL_TYPES as readonly string[]).includes(emailType)) return "onboarding";
  if ((QUESTION_RECEIVED as readonly string[]).includes(emailType)) return "question_received";
  if ((WEEKLY_DIGEST as readonly string[]).includes(emailType)) return "weekly_digest";
  if ((VERIFICATION as readonly string[]).includes(emailType)) return "verification";
  if ((NUDGES as readonly string[]).includes(emailType)) return "nudges";
  if ((CONNECTIONS as readonly string[]).includes(emailType)) return "connections";
  return null;
}
