/**
 * Shared types for the Staffing Outreach feature.
 *
 * Status enum mirrors the CHECK constraint in
 * supabase/migrations/061_staffing_outreach.sql. Touchpoint type enum
 * does the same.
 */

/**
 * V2 Status Model (Simplified)
 *
 * New workflow:
 *   queued → sequencing → needs_call → consented → activated → enrolled
 *                      ↘ bounced
 *                      ↘ closed
 *
 * Legacy statuses kept for backwards compatibility during migration.
 */
export type StaffingStatus =
  // V2 statuses
  | "queued"           // Initial state, ready to be queued for sequence
  | "sequencing"       // Email sequence in progress (Resend automation)
  | "needs_call"       // Sequence complete, no response, needs manual call
  | "consented"        // Got verbal consent on call, enrollment email sent
  | "activated"        // Clicked magic link
  | "enrolled"         // Accepted T&C
  | "bounced"          // Email bounced
  | "closed"           // DNC or gave up
  // Legacy statuses (kept for migration period)
  | "pre_call_outreach"
  | "calling"
  | "connected_no_consent"
  | "nurturing"
  | "do_not_contact"
  | "wrong_number";

export type TouchpointType =
  // pre-call channels (legacy)
  | "research_completed"
  | "pre_call_email_sent"
  | "follow_up_email_sent"
  | "contact_form_submitted"
  | "fax_sent"
  | "mail_sent"
  // V2: Automated sequence events (Resend automation)
  | "sequence_started"        // Resend automation triggered
  | "sequence_email1_sent"    // Email 1 sent by Resend
  | "sequence_email2_sent"    // Email 2 sent by Resend
  | "sequence_completed"      // Both emails sent, moving to needs_call
  // calls
  | "call_no_answer"
  | "call_voicemail"
  | "call_wrong_number"
  | "call_connected_no_consent"
  | "call_connected_consent"
  | "call_not_interested"
  | "manual_dnc"
  // automated email sequence (post-consent)
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
  // V2: Sequence tracking fields
  sequence_started_at: string | null;
  email1_sent_at: string | null;
  email2_sent_at: string | null;
  resend_automation_id: string | null;
  /** Email address used for the sequence - needed to stop sequence properly */
  sequence_email: string | null;
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

/** Engagement signals derived from touchpoints */
export interface EngagementSignals {
  /** Provider opened an email */
  emailOpened?: boolean;
  /** Provider clicked a link in an email */
  emailClicked?: boolean;
  /** Provider replied to an email */
  replied?: boolean;
  /** We have a verified contact for this provider */
  hasContact?: boolean;
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
  /** Engagement signals (email opened, clicked, replied) */
  engagement?: EngagementSignals;
}

/**
 * Map university slugs to their service areas for email personalization.
 * Used in multiple files - centralized here to avoid duplication.
 */
export const SERVICE_AREA_BY_SLUG: Record<string, string> = {
  "ut-austin": "Austin area",
  "texas-am": "Bryan-College Station area",
  "u-houston": "Houston area",
  "u-florida": "Gainesville area",
  "florida-state": "Tallahassee area",
  "u-georgia": "Athens area",
  "emory": "Atlanta area",
  "unc-chapel-hill": "Chapel Hill area",
  "duke": "Durham area",
  "uva": "Charlottesville area",
  "virginia-tech": "Blacksburg area",
  "vanderbilt": "Nashville area",
  "u-tennessee-knoxville": "Knoxville area",
  "u-kentucky": "Lexington area",
  "ohio-state": "Columbus area",
  "u-michigan": "Ann Arbor area",
  "michigan-state": "East Lansing area",
  "penn-state": "State College area",
  "uw-madison": "Madison area",
  "u-minnesota": "Minneapolis area",
  "uiuc": "Champaign area",
  "indiana-bloomington": "Bloomington area",
  "cu-boulder": "Boulder area",
  "arizona-state": "Phoenix area",
  "u-utah": "Salt Lake City area",
};

/**
 * Get the service area name for a university slug.
 * Falls back to "the area" for unknown slugs.
 */
export function getServiceArea(universitySlug: string | undefined): string {
  if (!universitySlug) return "the area";
  return SERVICE_AREA_BY_SLUG[universitySlug] || "the area";
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
