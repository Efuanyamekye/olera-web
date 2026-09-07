/**
 * Provider Growth Pipeline Stages
 *
 * Defines the sales pipeline stages and conversion statuses.
 * Key insight: Pipeline stage (sales process) is independent of
 * conversion status (Ads/MedJobs).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Stages (Sales Process)
// ─────────────────────────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  "new_claim",
  "meeting_scheduled",
  "pitched",
  "not_interested",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new_claim: "New Claims",
  meeting_scheduled: "Meeting Scheduled",
  pitched: "Pitched",
  not_interested: "Not Interested",
};

export const PIPELINE_STAGE_DESCRIPTIONS: Record<PipelineStage, string> = {
  new_claim: "Providers who claimed but haven't had a pitch meeting yet",
  meeting_scheduled: "Providers with upcoming Calendly meetings",
  pitched: "Providers who've had their pitch meeting",
  not_interested: "Providers who declined after being pitched",
};

// Valid stage transitions
export const VALID_STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  new_claim: ["meeting_scheduled", "not_interested"],
  meeting_scheduled: ["pitched", "new_claim", "not_interested"],  // can cancel meeting
  pitched: ["meeting_scheduled", "not_interested"],  // can schedule follow-up meeting
  not_interested: ["new_claim"],  // can re-engage
};

export function canTransitionTo(from: PipelineStage, to: PipelineStage): boolean {
  return VALID_STAGE_TRANSITIONS[from].includes(to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ads Conversion Status
// ─────────────────────────────────────────────────────────────────────────────

export const ADS_STATUSES = ["none", "free_intro", "subscribed"] as const;

export type AdsStatus = (typeof ADS_STATUSES)[number];

export const ADS_STATUS_LABELS: Record<AdsStatus, string> = {
  none: "Not Started",
  free_intro: "Free $50 Campaign",
  subscribed: "Paying ($75-600/mo)",
};

// ─────────────────────────────────────────────────────────────────────────────
// MedJobs Conversion Status
// ─────────────────────────────────────────────────────────────────────────────

export const MEDJOBS_STATUSES = ["none", "in_pilot", "pilot_expired", "subscribed"] as const;

export type MedjobsStatus = (typeof MEDJOBS_STATUSES)[number];

export const MEDJOBS_STATUS_LABELS: Record<MedjobsStatus, string> = {
  none: "Not Started",
  in_pilot: "In 90-Day Pilot",
  pilot_expired: "Pilot Expired",
  subscribed: "Subscribed",
};

// ─────────────────────────────────────────────────────────────────────────────
// Pitch Interest Levels
// ─────────────────────────────────────────────────────────────────────────────

export const INTEREST_LEVELS = ["high", "medium", "low", "none"] as const;

export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export const INTEREST_LEVEL_LABELS: Record<InterestLevel, string> = {
  high: "High Interest",
  medium: "Medium Interest",
  low: "Low Interest",
  none: "Not Interested",
};

export const INTEREST_LEVEL_COLORS: Record<InterestLevel, string> = {
  high: "text-emerald-700 bg-emerald-50 border-emerald-200",
  medium: "text-amber-700 bg-amber-50 border-amber-200",
  low: "text-orange-700 bg-orange-50 border-orange-200",
  none: "text-gray-600 bg-gray-50 border-gray-200",
};

// ─────────────────────────────────────────────────────────────────────────────
// Claim Source Attribution
// ─────────────────────────────────────────────────────────────────────────────

export const CLAIM_SOURCES = [
  "cold_outreach",
  "city_broadcast",
  "email",
  "page",
  "lead_email",
  "completion_email",
  "instant_claim",
  "new_org_signup",
] as const;

export type ClaimSource = (typeof CLAIM_SOURCES)[number];

export const CLAIM_SOURCE_LABELS: Record<ClaimSource, string> = {
  cold_outreach: "Directory Claim",
  city_broadcast: "Directory Claim",
  email: "Directory Claim",
  page: "Directory Claim",
  lead_email: "Directory Claim",
  completion_email: "Directory Claim",
  instant_claim: "Directory Claim",
  new_org_signup: "Self-Created",
};

export const CLAIM_SOURCE_COLORS: Record<ClaimSource, string> = {
  cold_outreach: "text-gray-600 bg-gray-50 border-gray-200",
  city_broadcast: "text-gray-600 bg-gray-50 border-gray-200",
  email: "text-gray-600 bg-gray-50 border-gray-200",
  page: "text-gray-600 bg-gray-50 border-gray-200",
  lead_email: "text-gray-600 bg-gray-50 border-gray-200",
  completion_email: "text-gray-600 bg-gray-50 border-gray-200",
  instant_claim: "text-gray-600 bg-gray-50 border-gray-200",
  new_org_signup: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

// ─────────────────────────────────────────────────────────────────────────────
// Not Interested Reasons
// ─────────────────────────────────────────────────────────────────────────────

export const NOT_INTERESTED_REASONS = [
  { value: "no_budget", label: "No budget right now" },
  { value: "using_competitor", label: "Using a competitor" },
  { value: "not_hiring", label: "Not hiring students (MedJobs)" },
  { value: "no_marketing_need", label: "Don't need marketing (Ads)" },
  { value: "bad_timing", label: "Bad timing" },
  { value: "no_response", label: "No response after pitch" },
  { value: "other", label: "Other" },
] as const;

export type NotInterestedReason = (typeof NOT_INTERESTED_REASONS)[number]["value"];

export const NOT_INTERESTED_REASON_VALUES = NOT_INTERESTED_REASONS.map((r) => r.value);

// ─────────────────────────────────────────────────────────────────────────────
// Touchpoint Types
// ─────────────────────────────────────────────────────────────────────────────

export const TOUCHPOINT_TYPES = [
  "stage_changed",
  "meeting_scheduled",
  "meeting_completed",
  "meeting_cancelled",
  "pitch_logged",
  "note_added",
  "ads_converted",
  "medjobs_converted",
  "ads_upgraded",
  "medjobs_upgraded",
  "marked_not_interested",
  "eligibility_updated",
  "assigned",
] as const;

export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

export const TOUCHPOINT_TYPE_LABELS: Record<TouchpointType, string> = {
  stage_changed: "Stage Changed",
  meeting_scheduled: "Meeting Scheduled",
  meeting_completed: "Meeting Completed",
  meeting_cancelled: "Meeting Cancelled",
  pitch_logged: "Pitch Logged",
  note_added: "Note Added",
  ads_converted: "Started Ads Free Trial",
  medjobs_converted: "Started MedJobs Pilot",
  ads_upgraded: "Upgraded to Ads Subscription",
  medjobs_upgraded: "Upgraded to MedJobs Subscription",
  marked_not_interested: "Marked Not Interested",
  eligibility_updated: "Eligibility Updated",
  assigned: "Assigned to Admin",
};
