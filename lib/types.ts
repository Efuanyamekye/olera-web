// ============================================================
// Database Types — mirrors the Supabase schema
// ============================================================

export type ProfileType = "organization" | "caregiver" | "family";

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

export type ClaimState = "unclaimed" | "pending" | "claimed" | "rejected";
export type VerificationState = "unverified" | "pending" | "verified";
export type ProfileSource = "seeded" | "user_created";

export type MembershipPlan = "free" | "pro";
export type MembershipStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "free";
export type BillingCycle = "monthly" | "annual";

export type ConnectionType = "inquiry" | "save" | "application" | "invitation";
export type ConnectionStatus = "pending" | "accepted" | "declined" | "archived";

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
  metadata: OrganizationMetadata | CaregiverMetadata | FamilyMetadata;
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
  created_at: string;
  updated_at: string;
}

// ============================================================
// Metadata Types (JSONB per profile type)
// ============================================================

export interface OrganizationMetadata {
  license_number?: string;
  year_founded?: number;
  bed_count?: number;
  staff_count?: number;
  accepts_medicaid?: boolean;
  accepts_medicare?: boolean;
  amenities?: string[];
  hours?: string;
  price_range?: string;
}

export interface CaregiverMetadata {
  hourly_rate_min?: number;
  hourly_rate_max?: number;
  certifications?: string[];
  years_experience?: number;
  languages?: string[];
  availability?: string;
}

export interface FamilyMetadata {
  care_needs?: string[];
  timeline?: "immediate" | "within_1_month" | "within_3_months" | "exploring";
  budget_min?: number;
  budget_max?: number;
  relationship_to_recipient?: string;
}

// ============================================================
// Deferred Action (sessionStorage)
// ============================================================

export interface DeferredAction {
  action: "save" | "inquiry" | "apply" | "claim" | "create_profile";
  targetProfileId?: string;
  returnUrl: string;
  createdAt: string;
}

// ============================================================
// Auth Context
// ============================================================

export interface AuthState {
  user: { id: string; email: string } | null;
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
