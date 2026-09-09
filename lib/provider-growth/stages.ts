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
  "no_show",
  "upgrade_meeting",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new_claim: "Claimed",
  meeting_scheduled: "Meeting Scheduled",
  pitched: "Pitched",
  not_interested: "Not Interested",
  no_show: "No-show",
  upgrade_meeting: "Upgrade Meeting",
};

export const PIPELINE_STAGE_DESCRIPTIONS: Record<PipelineStage, string> = {
  new_claim: "Providers who claimed their profile but haven't had a meeting yet",
  meeting_scheduled: "Providers with upcoming Calendly meetings",
  pitched: "Providers who've had their pitch meeting",
  not_interested: "Providers who declined after being pitched",
  no_show: "Providers who missed their scheduled meeting",
  upgrade_meeting: "Free trial providers with meeting scheduled to discuss paying",
};

// Valid stage transitions
export const VALID_STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  new_claim: ["meeting_scheduled", "upgrade_meeting", "not_interested"],  // upgrade_meeting for self-converted providers
  meeting_scheduled: ["meeting_scheduled", "pitched", "no_show", "not_interested"],  // can reschedule, or log meeting outcomes
  pitched: ["meeting_scheduled", "upgrade_meeting", "not_interested"],  // upgrade_meeting for Converted providers
  not_interested: ["meeting_scheduled", "upgrade_meeting", "pitched"],  // upgrade_meeting for Converted providers re-engaging
  no_show: ["meeting_scheduled", "upgrade_meeting", "not_interested"],  // upgrade_meeting for Converted providers rescheduling
  upgrade_meeting: ["meeting_scheduled", "upgrade_meeting", "pitched", "not_interested"],  // can reschedule (to unified meeting_scheduled), complete, or decline
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
// Meeting Type (for scheduled meetings)
// ─────────────────────────────────────────────────────────────────────────────

export const MEETING_TYPES = ["new", "upgrade"] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  new: "New Meeting",
  upgrade: "Upgrade Meeting",
};

// ─────────────────────────────────────────────────────────────────────────────
// Meeting Focus (product being discussed)
// ─────────────────────────────────────────────────────────────────────────────

export const MEETING_FOCUS_OPTIONS = ["ads", "medjobs", "both"] as const;

export type MeetingFocus = (typeof MEETING_FOCUS_OPTIONS)[number];

export const MEETING_FOCUS_LABELS: Record<MeetingFocus, string> = {
  ads: "Ads",
  medjobs: "MedJobs",
  both: "Both",
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
  "meeting_no_show",
  "pitch_logged",
  "note_added",
  "call_attempted",
  "activity_logged",
  "ads_converted",
  "medjobs_converted",
  "ads_upgraded",
  "medjobs_upgraded",
  "marked_not_interested",
  "eligibility_updated",
  "assigned",
] as const;

export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Call Statuses (for call_attempted touchpoints)
// ─────────────────────────────────────────────────────────────────────────────

export const CALL_STATUSES = [
  "voicemail",
  "no_answer",
  "hung_up",
  "callback",
  "spoke_with",
  "scheduled",
  "note",
] as const;

export type CallStatus = (typeof CALL_STATUSES)[number];

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  voicemail: "Voicemail",
  no_answer: "No Answer",
  hung_up: "Hung Up",
  callback: "Callback Requested",
  spoke_with: "Spoke With",
  scheduled: "Meeting Scheduled",
  note: "Note",
};

export const CALL_STATUS_COLORS: Record<CallStatus, string> = {
  voicemail: "bg-amber-100 text-amber-800",
  no_answer: "bg-gray-100 text-gray-800",
  hung_up: "bg-red-100 text-red-800",
  callback: "bg-blue-100 text-blue-800",
  spoke_with: "bg-purple-100 text-purple-800",
  scheduled: "bg-emerald-100 text-emerald-800",
  note: "bg-slate-100 text-slate-800",
};

export const TOUCHPOINT_TYPE_LABELS: Record<TouchpointType, string> = {
  stage_changed: "Stage Changed",
  meeting_scheduled: "Meeting Scheduled",
  meeting_completed: "Meeting Completed",
  meeting_cancelled: "Meeting Cancelled",
  meeting_no_show: "Meeting No-Show",
  pitch_logged: "Pitch Logged",
  note_added: "Note Added",
  call_attempted: "Call Attempted",
  activity_logged: "Activity Logged",
  ads_converted: "Started Ads Free Trial",
  medjobs_converted: "Started MedJobs Pilot",
  ads_upgraded: "Upgraded to Ads Subscription",
  medjobs_upgraded: "Upgraded to MedJobs Subscription",
  marked_not_interested: "Marked Not Interested",
  eligibility_updated: "Eligibility Updated",
  assigned: "Assigned to Admin",
};

// ─────────────────────────────────────────────────────────────────────────────
// Activity Outcomes (for unified activity logging)
// ─────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_OUTCOMES = [
  // Call outcomes (don't change stage)
  "voicemail",
  "hung_up",
  "callback_requested",
  "left_message",
  "note",
  // Stage-changing outcomes
  "meeting_scheduled",
  "interested",
  "not_interested",
  "no_show",
  "meeting_rescheduled",
  "re_engage",
] as const;

export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const ACTIVITY_OUTCOME_LABELS: Record<ActivityOutcome, string> = {
  voicemail: "Voicemail",
  hung_up: "Hung Up",
  callback_requested: "Callback Requested",
  left_message: "Left Message",
  note: "Note",
  meeting_scheduled: "Meeting Scheduled",
  interested: "Interested",
  not_interested: "Not Interested",
  no_show: "No-show",
  meeting_rescheduled: "Meeting Rescheduled",
  re_engage: "Re-engage",
};

// Which outcomes are available for each stage
// Note: meeting_scheduled and meeting_rescheduled are intentionally excluded
// because they should use MeetingScheduler which sets the actual meeting time
export const STAGE_OUTCOMES: Record<PipelineStage, ActivityOutcome[]> = {
  new_claim: ["voicemail", "hung_up", "callback_requested", "left_message", "note"],
  meeting_scheduled: ["note", "interested", "not_interested", "no_show"],
  pitched: ["voicemail", "hung_up", "callback_requested", "left_message", "note", "not_interested"],
  not_interested: ["voicemail", "hung_up", "callback_requested", "left_message", "note", "interested"],
  no_show: ["voicemail", "hung_up", "callback_requested", "left_message", "note", "not_interested"],
  upgrade_meeting: ["voicemail", "hung_up", "callback_requested", "left_message", "note", "interested", "not_interested", "no_show"],
};

// Outcomes that trigger a confirmation modal (because they change stage)
// Note: meeting_scheduled and meeting_rescheduled excluded - use MeetingScheduler instead
export const STAGE_CHANGING_OUTCOMES: ActivityOutcome[] = [
  "interested",
  "not_interested",
  "no_show",
  "re_engage",
];

// What stage does each outcome transition to (from current stage)
export const OUTCOME_STAGE_TRANSITIONS: Record<ActivityOutcome, Partial<Record<PipelineStage, PipelineStage>>> = {
  voicemail: {},
  hung_up: {},
  callback_requested: {},
  left_message: {},
  note: {},
  meeting_scheduled: {
    new_claim: "meeting_scheduled",
  },
  interested: {
    meeting_scheduled: "pitched",
    upgrade_meeting: "pitched",
    not_interested: "pitched",
  },
  not_interested: {
    meeting_scheduled: "not_interested",
    pitched: "not_interested",
    no_show: "not_interested",
    upgrade_meeting: "not_interested",
  },
  no_show: {
    meeting_scheduled: "no_show",
    upgrade_meeting: "no_show",
  },
  meeting_rescheduled: {
    no_show: "meeting_scheduled",
  },
  re_engage: {
    not_interested: "new_claim",
  },
};

// Human-readable description of what the outcome does
export const OUTCOME_DESCRIPTIONS: Record<ActivityOutcome, string> = {
  voicemail: "Left a voicemail, no answer",
  hung_up: "Provider hung up",
  callback_requested: "Provider asked to call back later",
  left_message: "Left a message with someone",
  note: "Add a note",
  meeting_scheduled: "Meeting booked via Calendly",
  interested: "Provider is interested, move to Follow-up",
  not_interested: "Provider not interested",
  no_show: "Provider missed the meeting",
  meeting_rescheduled: "Provider rescheduled the meeting",
  re_engage: "Try again, move back to New Claims",
};
