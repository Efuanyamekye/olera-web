/**
 * Shared types for the Staffing Outreach feature.
 *
 * Status enum mirrors the CHECK constraint in
 * supabase/migrations/061_staffing_outreach.sql. Touchpoint type enum
 * does the same.
 */

export type StaffingStatus =
  | "queued"
  | "pre_call_outreach"
  | "calling"
  | "connected_no_consent"
  | "consented"
  | "nurturing"
  | "activated"
  | "enrolled"
  | "do_not_contact"
  | "wrong_number";

export type TouchpointType =
  // pre-call channels
  | "research_completed"
  | "pre_call_email_sent"
  | "follow_up_email_sent"
  | "contact_form_submitted"
  | "fax_sent"
  | "mail_sent"
  // calls
  | "call_no_answer"
  | "call_voicemail"
  | "call_wrong_number"
  | "call_connected_no_consent"
  | "call_connected_consent"
  | "call_not_interested"
  | "manual_dnc"
  // automated email sequence
  | "email_pre_consent_a_sent"
  | "email_pre_consent_b_sent"
  | "email_post_consent_step1_sent"
  | "email_post_consent_step2_sent"
  | "email_post_consent_step3_sent"
  | "email_post_consent_step4_sent"
  | "email_post_consent_step5_sent"
  | "email_welcome_sent"
  | "email_new_student_trigger_sent"
  // email lifecycle
  | "email_opened"
  | "email_clicked"
  | "email_bounced"
  // system
  | "reply_received"
  | "system_activated"
  | "system_enrolled"
  | "system_auto_dnc"
  | "status_reverted";

export interface ResearchData {
  general_email?: string;
  fax?: string;
  contact_form_url?: string;
}

export interface StaffingBatch {
  id: string;
  university_slug: string;
  university_name: string;
  category: string;
  catchment_cities: Array<{ city: string; state: string }>;
  status: "active" | "paused" | "completed";
  total_providers: number;
  total_enrolled: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffingOutreachRow {
  id: string;
  batch_id: string;
  provider_id: string;
  status: StaffingStatus;
  next_action_due_at: string | null;
  attempts_count: number;
  last_engagement_at: string | null;
  claimed_by: string | null;
  claimed_until: string | null;
  research_data: ResearchData;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffingTouchpoint {
  id: string;
  outreach_id: string;
  type: TouchpointType;
  notes: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface StaffingContact {
  id: string;
  outreach_id: string;
  provider_id: string;
  name: string;
  role: string | null;
  email: string;
  phone: string | null;
  is_primary: boolean;
  consent_given_at: string;
  consent_source: "call" | "reply" | "web_form";
  consent_notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** A queue row is the outreach record joined with the provider's display info. */
export interface QueueRow extends StaffingOutreachRow {
  provider_name: string;
  provider_phone: string | null;
  provider_city: string | null;
  provider_state: string | null;
  provider_website: string | null;
  provider_slug: string | null;
  /** University name - included for Action Needed tab (cross-university view) */
  university_name?: string;
  /** Initials of the admin who claimed this row (e.g., "TJ") */
  claimed_by_initials?: string;
}

/** What the drawer needs to render every section. */
export interface DrawerContext {
  outreach: StaffingOutreachRow;
  batch: StaffingBatch;
  provider: {
    provider_id: string;
    provider_name: string;
    provider_category: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    slug: string | null;
  };
  contacts: StaffingContact[];
  touchpoints: StaffingTouchpoint[];
}
