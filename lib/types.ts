// ============================================================
// Database Types — mirrors the Supabase schema
// ============================================================

export type ProfileType = "organization" | "caregiver" | "family" | "student";

export type ProfileCategory =
  // Home-based organizations
  | "home_care_agency"
  | "home_health_agency"
  | "hospice_agency"
  // Facility-based organizations
  | "independent_living"
  | "assisted_living"
  | "memory_care"
  | "nursing_home"
  | "inpatient_hospice"
  | "rehab_facility"
  | "adult_day_care"
  | "wellness_center"
  // Caregivers
  | "private_caregiver";

export type ClaimState = "unclaimed" | "pending" | "claimed" | "rejected" | "archived";
export type VerificationState = "not_required" | "unverified" | "pending" | "verified" | "rejected";
// ProfileSource indicates how the profile was created:
// - "seeded": Test/demo data from dev seeding scripts
// - "user_created": User created their own profile from scratch
// - "claimed_from_directory": Real provider claimed an existing directory listing
export type ProfileSource = "seeded" | "user_created" | "claimed_from_directory";

export type MembershipPlan = "free" | "pro" | "basic" | "professional" | "enterprise";
export type MembershipStatus =
  | "trial"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "free";
export type BillingCycle = "monthly" | "annual";

// Generic notification channel preference type
export interface NotificationChannelPrefs {
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
}

// Base notification preferences type - used by all profile metadata types
// This allows different profile types to have different preference keys
// while remaining compatible when extended together
export type NotificationPrefs = {
  // Organization preferences
  new_leads?: NotificationChannelPrefs;
  reviews_and_questions?: NotificationChannelPrefs;
  messages?: NotificationChannelPrefs;
  // Organization legacy
  lead_notifications?: NotificationChannelPrefs;
  review_alerts?: NotificationChannelPrefs;
  // Caregiver/Student preferences
  interview_requests?: NotificationChannelPrefs;
  application_updates?: NotificationChannelPrefs;
  // Caregiver/Student legacy
  job_alerts?: NotificationChannelPrefs;
  interview_reminders?: NotificationChannelPrefs;
  // Family preferences
  messages_and_responses?: NotificationChannelPrefs;
  match_updates?: NotificationChannelPrefs;
  followup_reviews?: NotificationChannelPrefs;
  // Family legacy
  connection_updates?: NotificationChannelPrefs;
  saved_provider_alerts?: NotificationChannelPrefs;
  profile_reminders?: NotificationChannelPrefs;
  // Shared legacy
  message_notifications?: NotificationChannelPrefs;
};

export type ConnectionType = "inquiry" | "save" | "match" | "request" | "application" | "invitation" | "dismiss";
export type ConnectionStatus = "pending" | "accepted" | "declined" | "expired" | "archived" | "pending_verification";

// ============================================================
// Table Row Types
// ============================================================

export interface Account {
  id: string;
  user_id: string;
  active_profile_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// BusinessProfile - stored in "business_profiles" table
// Note: iOS has a separate "profiles" table for user identity (like our "accounts")
export interface BusinessProfile {
  id: string;
  account_id: string | null;
  source_provider_id: string | null; // Links to olera-providers.provider_id when claiming
  slug: string;
  type: ProfileType;
  category: ProfileCategory | null;
  display_name: string;
  description: string | null;
  image_url: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  service_area: string | null;
  care_types: string[];
  metadata: OrganizationMetadata | CaregiverMetadata | FamilyMetadata | StudentMetadata;
  claim_state: ClaimState;
  verification_state: VerificationState;
  source: ProfileSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Alias for backwards compatibility
export type Profile = BusinessProfile;

export interface Membership {
  id: string;
  account_id: string;
  plan: MembershipPlan;
  billing_cycle: BillingCycle | null;
  status: MembershipStatus;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  free_responses_used: number;
  free_responses_reset_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Connection {
  id: string;
  from_profile_id: string;
  to_profile_id: string;
  type: ConnectionType;
  status: ConnectionStatus;
  message: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Reviews
// ============================================================

export type ReviewStatus = "published" | "under_review" | "rejected" | "removed";

export interface Review {
  id: string;
  provider_id: string;
  account_id: string | null;
  reviewer_name: string;
  rating: number;
  title: string | null;
  comment: string;
  relationship: string | null;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
  // Provider reply fields
  provider_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  // Migration tracking
  migration_source?: string | null;
  // Read tracking
  metadata?: Record<string, unknown>;
  isNew?: boolean;
}

// ============================================================
// Metadata Types (JSONB per profile type)
// ============================================================

/** Demo review structure - used only for test/demo profiles */
export interface DemoReview {
  name: string;
  rating: number;
  date: string;
  comment: string;
  relationship?: string;
}

/** Google Places data - external, read-only */
export interface GoogleMetadata {
  rating?: number;
  review_count?: number;
  place_id?: string;
  last_synced?: string;
}

/** Cached Google review snippet — stored as JSONB on olera-providers */
export interface GoogleReviewSnippet {
  author_name: string;
  rating: number;
  text: string;
  relative_time: string;
  profile_photo_url: string | null;
  time: number; // Unix timestamp (seconds)
}

/** Full cached Google review data for a provider */
export interface GoogleReviewsData {
  rating: number;
  review_count: number;
  reviews: GoogleReviewSnippet[];
  last_synced: string; // ISO 8601
}

/** CMS (Medicare) quality data — stored as JSONB on olera-providers */
export interface CMSData {
  ccn: string; // CMS Certification Number
  source: "home_health" | "nursing_home" | "hospice";
  overall_rating: number | null; // 1-5 stars
  health_inspection_rating?: number | null;
  staffing_rating?: number | null;
  quality_rating?: number | null;
  provider_name: string; // CMS name (may differ from ours)
  certification_date?: string | null;
  deficiency_count?: number;
  penalty_count?: number;
  total_fines?: number;
  abuse_icon?: string;
  last_synced: string; // ISO 8601
}

/** AI-verified trust signal — individual verification result */
export interface AiTrustSignal {
  signal: string; // e.g., "state_licensed", "accredited"
  status: "confirmed" | "not_found" | "unclear";
  detail: string | null;
  source_url: string | null;
}

/** AI-verified trust signals for a provider */
export interface AiTrustSignals {
  provider_name: string;
  state: string;
  category: string;
  signals: AiTrustSignal[];
  summary_score: number; // count of confirmed signals (0-8)
  last_verified: string; // ISO 8601
  model: string; // e.g., "sonar"
  confidence: "high" | "medium" | "low";
}

/** Staff/owner info displayed on provider detail pages */
export interface StaffInfo {
  name: string;
  position: string;
  bio: string;
  image: string;
  care_motivation?: string;
}

export interface OrganizationMetadata {
  staff?: StaffInfo;
  license_number?: string;
  year_founded?: number;
  bed_count?: number;
  staff_count?: number;
  accepts_medicaid?: boolean;
  accepts_medicare?: boolean;
  accepted_payments?: string[];
  amenities?: string[];
  hours?: string;

  // Pricing fields
  price_range?: string; // Legacy: formatted string like "$3,500 monthly"
  lower_price?: number; // Minimum price (e.g., 3500)
  upper_price?: number; // Maximum price (optional, for ranges)
  price_frequency?: string; // e.g., "per month", "per hour"
  contact_for_pricing?: boolean;
  pricing_details?: {
    service: string;
    rate: string;
    rateType: string;
  }[];

  // Verification fields
  verification_id_type?: string;
  verification_id_image?: string;
  verification_manager_photo?: string;
  verification_role?: string;
  verification_affiliation_image?: string;

  // === Review Data Sources (clearly separated) ===

  // Demo/test data - only shown on demo profiles, clearly labeled
  demo_mode?: boolean;
  demo_reviews?: DemoReview[];

  // Google Places data (external, read-only)
  google_metadata?: GoogleMetadata;

  // Olera proprietary scores (admin/algorithm set)
  community_score?: number;
  value_score?: number;
  info_score?: number;

  // DEPRECATED: Old fields - should not be used for new profiles
  // These exist for backwards compatibility with old seeded data
  /** @deprecated Use demo_reviews instead */
  reviews?: DemoReview[];
  /** @deprecated Use google_metadata.rating or compute from reviews table */
  rating?: number;
  /** @deprecated Use reviews table count */
  review_count?: number;

  // Notification preferences (activity-based, user-controllable)
  whatsapp_opted_in?: boolean;
  whatsapp_opted_in_at?: string;
  notification_prefs?: NotificationPrefs;
}

export interface CaregiverMetadata {
  hourly_rate_min?: number;
  hourly_rate_max?: number;
  certifications?: string[];
  years_experience?: number;
  languages?: string[];
  availability?: string;

  // Notification preferences (activity-based, user-controllable)
  whatsapp_opted_in?: boolean;
  whatsapp_opted_in_at?: string;
  notification_prefs?: NotificationPrefs;
}

// ============================================================
// Nudge Sequence Types (for care seeker re-engagement)
// ============================================================

export type NudgeSequencePhase = "active" | "maintenance";

export interface NudgeSequence {
  nudge_count: number;        // 0-4 in active, 5+ in maintenance
  last_nudge_at?: string;     // ISO timestamp
  phase: NudgeSequencePhase;
}

export interface FamilyMetadata {
  age?: number;
  care_needs?: string[];
  timeline?: "immediate" | "within_1_month" | "within_3_months" | "exploring";
  budget_min?: number;
  budget_max?: number;
  relationship_to_recipient?: string;
  who_needs_care?: string;
  profile_completeness?: number;
  last_active_at?: string;
  // Enrichment fields
  country?: string;
  contact_preference?: "call" | "text" | "email";
  payment_methods?: string[];
  saved_benefits?: string[];
  living_situation?: string;
  schedule_preference?: string;
  care_location?: string;
  language_preference?: string | string[];
  about_situation?: string;
  // Benefits intake fields
  income_range?: string;
  medicaid_status?: string;
  whatsapp_opted_in?: boolean;
  whatsapp_opted_in_at?: string;
  notification_prefs?: NotificationPrefs;
  care_post?: {
    status: "draft" | "active" | "paused";
    published_at?: string;
  };
  care_post_deleted?: {
    deleted_at: string;
    reasons?: string[];
    published_at?: string;
  };
  benefits_results?: {
    answers?: Record<string, unknown>;
    results?: Record<string, unknown>;
    location_display?: string;
    completed_at?: string;
    matchCount?: number;
  };

  // ── Nudge Sequence Tracking (new re-engagement system) ──
  // Phase 1: Profile Completion nudges
  completion_sequence?: NudgeSequence;
  // Phase 2: Publish Profile nudges
  publish_sequence?: NudgeSequence;
  // Global opt-out for all nudge sequences (set via /account/settings)
  nudges_unsubscribed?: boolean;

  // ── Milestone Emails ──
  // One-time celebration when profile reaches 100% complete
  completion_celebrated_at?: string;
  // Monthly provider recommendations for published families (max 12)
  monthly_recommendations_sent_at?: string;
  monthly_recommendations_count?: number;
  // Inactivity re-engagement (max 2 attempts)
  reengagement_sent_at?: string;
  reengagement_count?: number;

  // ── Legacy nudge flags (backward compatibility) ──
  // These are superseded by the sequence system but kept for migration
  go_live_reminder_sent?: boolean;
  profile_incomplete_reminder_sent?: boolean;
  provider_recommendation_sent?: boolean;
  dormant_reengagement_sent?: boolean;
  post_connection_followup_sent?: boolean;
}

// ============================================================
// MedJobs Types
// ============================================================

export type IntendedProfessionalSchool =
  | "medicine" | "nursing" | "pa" | "pt" | "public_health" | "undecided";

export type StudentProgramTrack =
  | "pre_nursing"
  | "nursing"
  | "pre_med"
  | "pre_pa"
  | "pre_health"
  | "other";

export interface StudentMetadata {
  // Education
  university?: string;
  university_id?: string;         // FK to medjobs_universities
  campus?: string;
  major?: string;
  graduation_year?: number;
  gpa?: number;
  program_track?: StudentProgramTrack;

  // Experience
  certifications?: string[];       // CNA, BLS, First Aid, etc.
  years_caregiving?: number;
  care_experience_types?: string[];  // "dementia", "post_surgical", "mobility", etc.
  languages?: string[];

  // Availability
  availability_type?: "part_time" | "full_time" | "flexible" | "summer_only" | "weekends";
  hours_per_week?: number;
  available_start?: string;        // ISO date
  transportation?: boolean;
  willing_to_relocate?: boolean;
  max_commute_miles?: number;

  // Media
  resume_url?: string;
  video_intro_url?: string;
  linkedin_url?: string;

  // Documents (private, PII)
  drivers_license_url?: string;
  drivers_license_uploaded_at?: string;
  car_insurance_url?: string;
  car_insurance_uploaded_at?: string;

  // Credential engine (data model ready, UI Phase 2)
  total_verified_hours?: number;
  verified_care_types?: string[];

  // New structured fields (Phase 1)
  intended_professional_school?: IntendedProfessionalSchool;
  availability_types?: string[];        // multi-select: "in_between_classes", "evenings", "weekends", "overnights"
  seasonal_availability?: string[];     // "summer", "winter_break", "fall_semester", "spring_semester"
  duration_commitment?: string;         // "1_semester", "multiple_semesters", "1_plus_year"
  hours_per_week_range?: string;        // "5-10", "10-15", "15-20", "20+"
  acknowledgments_completed?: boolean;
  acknowledgment_date?: string;
  application_completed?: boolean;

  // Motivation & Personal Statement
  why_caregiving?: string;
  personal_statement?: string;

  // Course Schedule
  course_schedule_description?: string;
  course_schedule_grid?: string;      // JSON serialized ScheduleGrid (day-slot toggles)
  course_schedule_semester?: string;  // e.g. "Fall 2026"

  // Availability & Commitment
  commitment_statement?: string;        // Required free-text on commitment to shifts
  availability_notes?: string;          // Free-text: finals, breaks, travel, constraints
  schedule_update_date?: string;        // Next date schedule needs updating (ISO date)
  summer_availability?: string;         // Legacy — migrated to year_round_availability
  winter_availability?: string;         // Legacy — migrated to year_round_availability

  // Year-round availability (structured)
  year_round_availability?: {
    spring?: { status: string; year: number; notes?: string };
    summer?: { status: string; year: number; notes?: string };
    fall?: { status: string; year: number; notes?: string };
    winter?: { status: string; year: number; notes?: string };
  };

  // Document Expiration
  drivers_license_expiration?: string;  // ISO date
  car_insurance_expiration?: string;    // ISO date

  // Commitments & Pledges
  ncns_pledge?: boolean;
  school_balance_pledge?: boolean;
  advance_notice_pledge?: boolean;
  prn_willing?: boolean;

  // Scenario Responses
  scenario_responses?: Array<{
    question: string;
    answer: string;
  }>;

  // References
  references?: Array<{
    name: string;
    relationship: string;
    note?: string;
  }>;

  // Social Links
  instagram_url?: string;
  facebook_url?: string;
  tiktok_url?: string;

  // Status
  profile_completeness?: number;   // 0-100
  seeking_status?: "actively_looking" | "open" | "not_looking";

  // Notification preferences (activity-based, user-controllable)
  whatsapp_opted_in?: boolean;
  whatsapp_opted_in_at?: string;
  notification_prefs?: NotificationPrefs;
}

// ── Interview Scheduling ──

export type InterviewStatus = "proposed" | "confirmed" | "completed" | "cancelled" | "no_show" | "rescheduled";
export type InterviewType = "video" | "in_person" | "phone";

export interface Interview {
  id: string;
  provider_profile_id: string;
  student_profile_id: string;
  connection_id: string | null;
  status: InterviewStatus;
  type: InterviewType;
  proposed_time: string;
  alternative_time: string | null;
  confirmed_time: string | null;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  proposed_by: string;
  /** When true, interview is saved but student not notified until provider verifies */
  is_pending_verification: boolean;
  created_at: string;
  updated_at: string;
}

export type ExperienceLogStatus = "pending" | "confirmed" | "disputed";

export interface ExperienceLog {
  id: string;
  student_profile_id: string;
  provider_profile_id: string;
  hours: number;
  care_type: string;
  start_date: string;
  end_date: string | null;
  supervisor_name: string | null;
  supervisor_title: string | null;
  notes: string | null;
  status: ExperienceLogStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedJobsUniversity {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  logo_url: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type JobPostStatus = "draft" | "active" | "paused" | "closed";
export type JobLocationType = "on_site" | "hybrid" | "flexible";

export interface MedJobsJobPost {
  id: string;
  provider_profile_id: string;
  title: string;
  description: string | null;
  care_types: string[];
  hours_per_week_min: number | null;
  hours_per_week_max: number | null;
  pay_rate_min: number | null;
  pay_rate_max: number | null;
  location_type: JobLocationType;
  status: JobPostStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Deferred Action (localStorage)
// ============================================================

export interface DeferredAction {
  action: "save" | "inquiry" | "apply" | "claim" | "claim-listing" | "create_profile" | "phone_reveal" | "connection_request" | "save_benefit" | "review" | "question" | "hire-candidate" | "medjobs-onboard";
  targetProfileId?: string;
  benefitProgramName?: string;
  /** For question deferred action - preserve the question text */
  questionText?: string;
  /** For review deferred action - preserve the review data */
  reviewData?: {
    rating: number;
    comment: string;
    title?: string;
    relationship?: string;
    reviewer_name?: string;
  };
  returnUrl: string;
  createdAt: string;
}

// ============================================================
// Auth Context
// ============================================================

export interface AuthState {
  user: { id: string; email: string; email_confirmed_at?: string } | null;
  account: Account | null;
  activeProfile: Profile | null;
  profiles: Profile[];
  membership: Membership | null;
  isLoading: boolean;
  /** True when the initial data fetch failed and no cache was available */
  fetchError: boolean;
}

// ============================================================
// Admin Types
// ============================================================

export type AdminRole = "admin" | "master_admin";

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
  // Joined fields
  admin_email?: string;
}

// ============================================================
// Directory (olera-providers) Types
// ============================================================

export interface DirectoryProvider {
  provider_id: string;
  provider_name: string;
  provider_category: string;
  main_category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_rating: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipcode: number | null;
  lat: number | null;
  lon: number | null;
  place_id: string | null;
  provider_images: string | null;
  provider_logo: string | null;
  provider_description: string | null;
  community_Score: number | null;
  value_score: number | null;
  information_availability_score: number | null;
  lower_price: number | null;
  upper_price: number | null;
  contact_for_price: string | null;
  deleted: boolean;
  deleted_at: string | null;
  hero_image_url: string | null;
}

export interface DirectoryListItem {
  provider_id: string;
  provider_name: string;
  provider_category: string;
  city: string | null;
  state: string | null;
  google_rating: number | null;
  deleted: boolean;
  hero_image_url: string | null;
  has_images: boolean;
  image_count: number;
  source: "olera-providers" | "business_profiles";
  slug: string | null;
}

export const PROVIDER_CATEGORIES = [
  "Home Care (Non-medical)",
  "Home Health Care",
  "Assisted Living",
  "Independent Living",
  "Memory Care",
  "Nursing Home",
  "Hospice",
  "Assisted Living | Independent Living",
  "Memory Care | Assisted Living",
] as const;
