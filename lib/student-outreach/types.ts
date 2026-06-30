/**
 * Shared types for the Student Outreach Funnel.
 *
 * Enums mirror CHECK constraints in supabase/migrations/064_student_outreach.sql.
 * Keep them in sync.
 */

export type StakeholderType = "student_org" | "advisor" | "professor" | "dept_head";

export type Status =
  | "prospect"
  | "researched"
  | "outreach_sent"
  | "engaged"
  | "meeting_scheduled"
  | "active_partner"
  | "not_interested"
  | "no_response_closed"
  | "do_not_contact"
  | "wrong_contact"
  | "redirected"
  // Whole-prospect "Archive" — halts the running cadence and parks the row.
  // Distinct from the other closed statuses in that it is explicitly meant to
  // be reopened later (the campus page shows it as an "Archived" tag).
  | "archived";

/**
 * Legacy values still accepted by the DB CHECK constraint but no longer
 * produced by application code (migration 065 collapsed them). Used only
 * to render historical rows that haven't been migrated yet.
 */
export type LegacyStatus = "agreed" | "distributed";

export type ContactPermission =
  | "not_yet"
  | "granted_direct"
  | "via_dept"
  | "via_listserv"
  | "denied";

export type DistributionEvidence =
  | "explicit_email"
  | "explicit_verbal"
  | "observed_external"
  | "self_reported";

// ── Department-Head partnership documentation ────────────────────────────
// Dept heads convert differently from other partners: the terminal step is
// NOT a portal hand-off but a documented decision about whether (and how) we
// may reach the department's professors. Captured at mark-partner time.
export type DeptHeadConfirmedVia = "verbal" | "email" | "meeting" | "other";
export type ProfessorPermission = "yes" | "no" | "not_yet" | "unclear";
export type DeptHeadNextStep =
  | "email_professors"
  | "will_forward"
  | "will_introduce"
  | "need_followup"
  | "do_not_contact_yet"
  | "other";

export interface DeptHeadPartnership {
  /** How the partnership was confirmed. */
  confirmed_via: DeptHeadConfirmedVia;
  /** Whether we may contact professors in this department. */
  professor_permission: ProfessorPermission;
  /** The agreed next step for (eventual) professor outreach. */
  next_step: DeptHeadNextStep;
  /** Free-text scope / context. */
  notes: string;
}

export type PartnerHealth = "healthy" | "at_risk" | "dormant";

export type ContactStatus = "active" | "stale" | "incorrect" | "no_longer_valid";

/**
 * v9 Phase 9: callable channels on a contact. Email + phone are
 * the primary lines; mobile + extension stack on top as optional
 * dialing metadata.
 *   phone     primary callable line (general office, direct, etc.)
 *   mobile    direct cell when known
 *   extension PBX extension dialed after phone connects (not a
 *             separate channel — it's metadata on the phone call)
 * Call eligibility for cadence task generation = phone OR mobile.
 */

export type TouchpointType =
  | "email_sent"
  | "email_replied"
  | "email_bounced"
  // v9 Phase 8: webhook-emitted on Resend complaint / soft-fail.
  // Drive auto-DNC (complained) and admin-visible retry copy (failed).
  | "email_complained"
  | "email_failed"
  | "call_no_answer"
  | "call_voicemail"
  | "call_connected"
  | "call_wrong_number"
  | "ig_dm_sent"
  | "ig_dm_replied"
  | "contact_form_submitted"
  | "meeting_scheduled"
  | "meeting_held"
  | "meeting_no_show"
  | "meeting_rescheduled"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "approval_expired"
  | "distribution_confirmed"
  | "contact_added"
  | "contact_marked_stale"
  | "contact_replaced"
  | "redirect_initiated"
  | "stage_change"
  | "note_added"
  | "snoozed"
  | "task_cancelled"
  | "task_superseded"
  | "step_skipped"
  | "system_seasonal_due";

export type Channel = "email" | "phone" | "ig_dm" | "contact_form" | "meeting" | "system";

export type ApprovalType = "department" | "marketing" | "listserv" | "job_board" | "other";

export type ApprovalStatus = "requested" | "granted" | "denied" | "expired";

export type TaskType =
  | "research_initial"
  | "outreach_day_0"
  | "outreach_multichannel_orgs"
  | "outreach_email_send"
  | "outreach_followup_email"
  | "outreach_followup_call"
  | "meeting_held_logging"
  | "agreement_followup"
  | "distribution_confirmation"
  | "move_to_active_partner"
  | "partner_seasonal_checkin"
  | "partner_share_update"
  | "partner_event_coordination"
  | "approval_request_followup"
  | "yearly_leadership_recheck"
  | "manual_followup";

export type TaskStatus = "pending" | "completed" | "cancelled" | "superseded";

export interface ResearchData {
  website?: string;
  official_email?: string;
  phone?: string;
  address?: string;
  semester_calendar?: string;
  meeting_at?: string; // ISO; informational mirror, source of truth is meeting_scheduled touchpoint
  meeting_link?: string;
  meeting_kind?: "phone" | "video" | "in_person";
  notes?: string;
  /**
   * v9 final: per-outreach overrides for the General Contact section
   * (provider drawer). Each field, when present, takes precedence
   * over the business_profiles fallback. Used when admin discovers
   * different general office info than what's in the directory
   * (e.g. directory has stale info@ but admin found a new hiring@).
   * Edits write here ONLY — never to student_outreach_contacts.
   */
  general_contact?: {
    email?: string | null;
    phone?: string | null;
    fax?: string | null;
    contact_form_url?: string | null;
    /** v9 final: per-outreach website override. business_profiles
     *  already has bp.website; this slot only stores a correction
     *  when admin discovers a different operational URL than what's
     *  in the directory. Pre-flight requires the effective website
     *  to be set so outreach copy + future automations can link to it. */
    website?: string | null;
    /** v9 final: structured snail-mail address. Each slot is an
     *  override on top of the directory record (bp.address /
     *  bp.city / bp.state); ZIP has no bp fallback since
     *  business_profiles lacks a ZIP column. Effective render =
     *  override OR directory value joined into one line. Keeping
     *  separate slots avoids the brittle free-text parsing the
     *  earlier `mailing_address` blob required. */
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    /** v9.x research-card "Mark not available" overrides. Each flag, when
     *  true, satisfies the matching research-card row without an actual
     *  value (rural agency with no fax line, agency with no public
     *  contact form). Pre-Flight Checklist rows render as resolved;
     *  the Launch gate doesn't look at these directly (it gates on
     *  verified-or-overridden call AND email on file). */
    fax_unavailable?: boolean;
    contact_form_unavailable?: boolean;
    website_unavailable?: boolean;
    phone_unavailable?: boolean;
    email_unavailable?: boolean;
    address_unavailable?: boolean;
  };
  /** Social channels (Instagram / Discord / GroupMe …) surfaced by the AI for
   *  an organization (mainly student orgs). Set at Generate; read-only in the
   *  drawer. */
  socials?: { platform: string; url: string }[];
  /** v9.x single Decision Maker slot — the named person on the team admin
   *  identified as the right recipient (owner, hiring manager, etc.). Stored
   *  here (not in `student_outreach_contacts`) so the Pre-Flight UI surfaces
   *  ONE prominent slot instead of a multi-contact hierarchy. Existing rows
   *  with `student_outreach_contacts` entries remain readable as a legacy
   *  section in the Research Card; new edits write here. The Smartlead fan-out
   *  emails General Contact + Decision Maker (max 2 leads per row). */
  decision_maker?: {
    name?: string | null;
    role?: string | null;
    phone?: string | null;
    email?: string | null;
    /** Admin marked the Decision Maker as not findable after reasonable
     *  effort. Counts as resolved on the Research Card; the row launches
     *  with the General Contact lead only. */
    unavailable?: boolean;
  };
  /** v9.x admin bypass of the Pre-Flight verification gate. Set by the
   *  "Override Pre-Flight" outcome in the call log modal — for cases
   *  where the prospect was already verified elsewhere, came from a
   *  trusted source, or a leadership exception. Launch Outreach unlocks
   *  when (pre_flight_overridden OR verified-by-call) AND email-on-file.
   *  Audit trail: each override emits a note_added touchpoint with
   *  payload.reason = "pre_flight_override". */
  pre_flight_overridden?: boolean;
  /** v9.x Smartlead bridge linkage (cold-email engine). Set when the row's
   *  General Contact (and any Named Contacts) are enrolled into its campus
   *  Smartlead campaign. JSONB on research_data — no schema migration. The
   *  join key for the D2 reply/bounce webhook is the Smartlead lead's
   *  `custom_fields.outreach_id`; `contact_id` (also a custom field) picks
   *  out the specific Named Contact when present. `enrolled_contact_ids`
   *  mirrors the fan-out for fast lookup without re-querying Smartlead. */
  smartlead?: {
    campaign_id: number;
    lead_email: string | null;
    enrolled_at: string;
    /** v9.x Named-Contact fan-out: contact_ids of Specific Contacts that
     *  were enrolled alongside the General Contact. Empty array (or
     *  undefined for rows enrolled before fan-out shipped) means General
     *  Contact only. */
    enrolled_contact_ids?: string[];
    /** v9.x D2 webhook: aggregated open/click counters for the row's
     *  Smartlead campaign. Updated by the webhook on EMAIL_OPEN /
     *  EMAIL_CLICK events. Per-event timeline noise would be unhelpful
     *  (Apple Mail Privacy Protection inflates open counts), so these
     *  stay as row-level metadata, not touchpoints. */
    engagement?: {
      opens: number;
      clicks: number;
      last_opened_at?: string;
      last_clicked_at?: string;
    };
  };
  /** Activation cadence Smartlead linkage — a SEPARATE per-campus campaign
   *  from the cold `smartlead` one above, enrolling the engaged contact into
   *  the activation sequence. Set by enrollRowIntoActivationCampaign. */
  smartlead_activation?: {
    campaign_id: number;
    lead_email: string | null;
    enrolled_at: string;
  };
  /** Partner welcome cadence Smartlead linkage — a SEPARATE per-campus
   *  campaign enrolling a freshly-activated Recruitment Partner into the
   *  long welcome/nurture sequence. Set by enrollRowIntoWelcomeCampaign when
   *  the "Make a partner" button promotes the row. */
  smartlead_welcome?: {
    campaign_id: number;
    lead_email: string | null;
    enrolled_at: string;
  };
}

export interface Campus {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  city: string | null;
  notes: string | null;
  is_active: boolean;
  research_complete: boolean;
  created_at: string;
  updated_at: string;
  /** v9 final: optional per-campus PDF override (migration 080).
   *  Set via SQL today; admin upload UI ships in a follow-up. When
   *  populated, supersedes the code-defined template config for
   *  attaching to provider outreach emails. */
  program_pdf_url?: string | null;
}

export interface OutreachRow {
  id: string;
  campus_id: string;
  /** v9.0: stakeholder_type is NULL in the DB for kind='provider' rows
   *  (migration 073). The queue endpoint coerces NULL to 'student_org'
   *  before the row reaches React, so the type stays non-null and the
   *  hundreds of call sites in the workflow drawer don't need guards.
   *  Kind-aware UIs (StakeholderCard, etc.) read `kind` first; the
   *  legacy stakeholder_type is only a fallback label. */
  stakeholder_type: StakeholderType;
  /** v9.0: polymorphic kind discriminator. Migration 072 added the
   *  column with backfill from stakeholder_type, so legacy rows get
   *  one of the four stakeholder kinds; v9.0 provider materialization
   *  writes 'provider'. */
  kind: StakeholderType | "provider";
  /** v9.0: FK to business_profiles when kind='provider'. NULL otherwise. */
  provider_business_profile_id: string | null;
  organization_name: string;
  /** v9.0 Phase 4: per-row read state. NULL = unread (renders bold).
   *  Set when the workflow drawer mounts; cleared by mark_unread or
   *  by any new touchpoint via insertTouchpoint. */
  viewed_at: string | null;
  department: string | null;
  programs: string[];
  status: Status;
  contact_permission: ContactPermission;
  permission_dependency_id: string | null;
  research_data: ResearchData;
  cadence_day: number;
  snoozed_until: string | null;
  distribution_evidence: DistributionEvidence | null;
  distribution_evidence_notes: string | null;
  reopen_at: string | null;
  partner_health: PartnerHealth | null;
  notes: string | null;
  redirected_to_id: string | null;
  referred_from_id: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
}

export interface Contact {
  id: string;
  outreach_id: string;
  /** Legacy full-name field. Kept for backward compatibility — new code
   *  reads/writes first_name + last_name and the server derives `name`. */
  name: string;
  first_name: string | null;
  last_name: string | null;
  /** Optional formal title (e.g. "Dr.", "Prof."). Drives the {salutation}
   *  variable in email templates for dept_head + professor stakeholders. */
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  /** v9 Phase 9: direct mobile / cell when known. Optional. */
  mobile: string | null;
  /** v9 Phase 9: PBX extension to dial after phone connects. Optional.
   *  Dialing metadata — admin sees "555-1000 ext 405" rendered. */
  extension: string | null;
  instagram: string | null;
  contact_form_url: string | null;
  is_primary: boolean;
  status: ContactStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  last_edited_by: string | null;
  last_edited_at: string;
}

export interface Touchpoint {
  id: string;
  outreach_id: string;
  contact_id: string | null;
  touchpoint_type: TouchpointType;
  channel: Channel | null;
  outcome: string | null;
  notes: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  outreach_id: string;
  approval_type: ApprovalType;
  approval_for: string;
  approval_from: string | null;
  status: ApprovalStatus;
  next_followup_at: string | null;
  requested_at: string;
  resolved_at: string | null;
  notes: string | null;
  created_by: string | null;
  last_updated_by: string | null;
  last_updated_at: string;
}

export interface Task {
  id: string;
  outreach_id: string;
  approval_id: string | null;
  task_type: TaskType;
  due_at: string;
  status: TaskStatus;
  payload: Record<string, unknown>;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * v8 Replies tab sub-state. Derived server-side in the queue endpoint
 * and rendered as one of seven state cards. Single source of truth for
 * "what action does the row need next?" — UI is dumb.
 *
 * Precedence (when a row matches multiple): needs_followup > booked >
 * wants_meeting > awaiting_callback > stale > engaged > mid_cadence.
 */
export type RepliesState =
  | "mid_cadence"
  | "engaged"
  | "wants_meeting"
  | "booked"
  | "needs_followup"
  | "awaiting_callback"
  | "stale";

/** Reason for an awaiting-callback state — surfaces in the row card copy. */
export type AwaitingCallbackKind = "voicemail" | "promised";

/**
 * v7/v8 TabRow — what the queue endpoint returns per row, enriched with
 * indicators that drive the per-tab UI (custom task star, stale flag,
 * meeting state, post-meeting follow-up notes, due-call shortcut,
 * v8 replies sub-state, awaiting-callback details).
 */
export interface TabRow extends OutreachRow {
  /** v9 final: stable React key for list rendering. Defaults to
   *  outreach `id`, but the Calls tab fans out one row per pending
   *  call task and emits unique `${outreach_id}-${task_id}` keys
   *  so the General Contact card and each Specific Contact card
   *  render independently. */
  row_key?: string;
  campus_name: string;
  campus_slug: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_role: string | null;
  has_custom_task: boolean;
  custom_task_summary: string | null;
  /** Days since last email_sent (no reply since). Only populated for Replies tab. */
  stale_days: number | null;
  meeting_state: "none" | "in_flight" | "scheduled";
  meeting_at: string | null;
  followup_notes: string | null;
  followup_author: string | null;
  followup_at: string | null;
  last_activity_at: string | null;
  /** Calls tab only: the due call task to surface "Tap to dial" UX.
   *  v10 Bullet 7 (2026-06-04): now includes both past-due and upcoming
   *  call tasks (window: due_at <= end_of_next_week). MedJobsTabPage
   *  client-side splits the rendered list into Today + Upcoming sections.
   *  `cadence_day` lets the per-row purpose hint render ("Day 3 — Did
   *  you get our email Monday?"). */
  due_call_task: {
    id: string;
    due_at: string;
    cadence_day: number | null;
  } | null;
  /** v10 Bullet 7: engagement sub-state for the Calls tab priority
   *  sort + per-row "clicked" pill. Read from the latest email_sent
   *  touchpoint's payload (Bullet 3 wires the counters). Null when
   *  not applicable (Pilot Active, or row not in cadence). */
  engagement_substate?:
    | "no_engagement"
    | "opened_not_clicked"
    | "clicked_not_activated"
    | null;
  /** v10 Bullet 7: smartlead linkage for the "Reply via Smartlead inbox"
   *  deep-link button on the Emails tab (Bullet 9). Reads from
   *  research_data.smartlead.{lead_id, campaign_id}. Both null when
   *  the row hasn't been enrolled via the bridge yet. */
  smartlead_linkage?: {
    lead_id: string | null;
    campaign_id: string | null;
  } | null;
  /**
   * v9 Phase 9: list of recipient names from pending call tasks
   * (per-recipient mode). Populated on Calls tab. Legacy rows
   * (single call task per outreach) produce an empty array.
   */
  due_call_recipients: string[];
  /** v8 Replies tab only: which state card to render. Null otherwise. */
  replies_state: RepliesState | null;
  /** v8: when the awaiting-callback state began (for "N days ago" copy). */
  awaiting_callback_at: string | null;
  /** v8: voicemail vs. they-said-they'd-call-back. */
  awaiting_callback_kind: AwaitingCallbackKind | null;
  /** v8: humanized next-scheduled-action label (Partners tab today). */
  next_step_label: string | null;
  /** v8.7: stakeholder has a pending 'Post to job board' task. */
  has_pending_job_board_task: boolean;
  /** v9 final: business_profiles.slug for kind='provider' rows.
   *  Powers the "Open in directory ↗" overflow shortcut without an
   *  extra fetch. Null for stakeholder rows. */
  provider_slug?: string | null;
  /** v9 final: per-recipient card identifier for Calls/Replies fan-out.
   *  'general' = synthetic General Contact card; 'specific' = a
   *  named Specific Contact card; null = non-fan-out row (Prospects,
   *  All, Archive — represents the outreach as a whole). Drives the
   *  card's copy hierarchy. */
  recipient_kind?: "general" | "specific" | null;
}

/** Legacy alias kept while cleaning up old call sites. */
export type QueueRow = TabRow;

/**
 * v8.4 campus card shown at the top of the Research tab. Acts as a
 * bulk-input entry point. Stakeholder rows still appear below it in the
 * tab — campus cards don't replace the rows, they augment them.
 */
export interface ResearchCampusCard {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  city: string | null;
  /** Stakeholders still in research stage (prospect + researched). */
  research_stakeholder_count: number;
  /** Most recent stakeholder created_at across this campus, regardless of status. */
  last_added_at: string | null;
  /** v9.0 Phase 2: optional campus stage. Populated when the queue
   *  computes catchment-derived state. UI surfaces a special banner
   *  variant when stage='stakeholder_prospecting' to prompt research. */
  stage?: "provider_prospecting" | "stakeholder_prospecting" | "active";
  /** v9.0 Phase 2: count of clients currently in the campus's catchment.
   *  Used to label the research-needed banner. */
  client_count?: number;
  /** Per-category prospecting completion (from partner_research.audit). The
   *  research card persists until all three are complete; the card shows which
   *  categories are done (Advising ✓ · Orgs ◻ · Dept heads ◻). */
  partner_audit?: { advisor: boolean; student_org: boolean; dept_head: boolean };
}

/** v7 tab counts — one number per tab in the new workflow.
 *  v8.10.33: "prospects" is the new label for what was previously
 *  "research" (prospect/researched stakeholders being qualified).
 *  v8.10.42: "candidates" added — count of LIVE candidate profiles
 *  visible to providers on the job board (Candidates ⊂ Signups).
 *  v9.0: clients + campuses are optional on the type so existing queue
 *  responses don't break before Phase 2 wires up real counts. The In
 *  Basket page treats undefined as 0. */
export interface TabCounts {
  candidates: number;
  prospects: number;
  calls: number;
  replies: number;
  meetings: number;
  partners: number;
  archive: number;
  all: number;
  clients?: number;
  campuses?: number;
  // Audience queues — server-composed totals for the In Basket primary bar.
  // providers   = virtual provider prospects + clients-with-task
  // partner_book = partner prospects + research cards + active-partners-with-task
  providers?: number;
  partner_book?: number;
  // v9.0 Phase 5: legacy menu-tab keys retained on the type so
  // callers indexing by TabKey type-check, even though these tabs
  // are no longer rendered in In Basket (their content moved to
  // All Tasks as quick filters).
  outbound?: number;
  emails_sent?: number;
  signups?: number;
  // v9.0 Phase 6: state-based In Basket tabs (legacy union members).
  unread?: number;
  undone?: number;
  // v9.0 Phase 7: Sites = the renamed Campuses tab + new Site-task
  // surfacing. Same numeric shape as campuses.
  sites?: number;
}

/** v9.0 Phase 4: per-tab unread counts, mirroring TabCounts shape.
 *  unread = rows in that tab where viewed_at IS NULL. Tab labels
 *  render as `Label unread/total` and bold when unread > 0. Only
 *  populated for tabs backed by student_outreach (Prospects /
 *  Replies / Meetings / Calls / Partners / All / Archive); other
 *  tabs (Clients / Candidates / Campuses) report 0. */
export interface TabUnreadCounts {
  candidates: number;
  prospects: number;
  calls: number;
  replies: number;
  meetings: number;
  partners: number;
  archive: number;
  all: number;
  clients?: number;
  campuses?: number;
  providers?: number;
  partner_book?: number;
  outbound?: number;
  emails_sent?: number;
  signups?: number;
  // v9.0 Phase 6: state-based In Basket tabs (legacy union members).
  unread?: number;
  undone?: number;
  // v9.0 Phase 7: Sites = the renamed Campuses tab + new Site-task
  // surfacing. Same numeric shape as campuses.
  sites?: number;
}

/** What the drawer needs to render every section. */
export interface DrawerContext {
  outreach: OutreachRow;
  campus: Campus;
  contacts: Contact[];
  touchpoints: Touchpoint[];
  approvals: Approval[];
  pending_tasks: Task[];
  referred_from: Pick<OutreachRow, "id" | "organization_name" | "stakeholder_type"> | null;
  redirected_to: Pick<OutreachRow, "id" | "organization_name" | "stakeholder_type"> | null;
  permission_dependency: Pick<OutreachRow, "id" | "organization_name" | "stakeholder_type" | "status"> | null;
  /** user_id → first-name display string. Used by history narration. */
  admin_first_names: Record<string, string>;
  /** v8.3 — server-derived state used by the NextStepPanel guidance. */
  replies_state: RepliesState | null;
  meeting_state: "none" | "in_flight" | "scheduled";
  meeting_at: string | null;
  followup_notes: string | null;
  awaiting_callback_at: string | null;
  awaiting_callback_kind: AwaitingCallbackKind | null;
  /**
   * Provider business_profile fields, surfaced only when the outreach
   * row is kind='provider' (a materialized catchment prospect). Lets
   * the drawer pre-fill the Launch outreach email field without an
   * extra round-trip.
   *
   * v9: metadata is included so deriveStage() can detect converted
   * providers (interview_terms_accepted_at within 90d OR
   * medjobs_subscription_active). Without metadata, the drawer's
   * stage derivation would miss the Client transition for provider
   * rows whose underlying business_profile became a Client.
   */
  provider_business_profile: {
    email: string | null;
    display_name: string | null;
    city: string | null;
    state: string | null;
    /** Ownership/claim signals for the pre-flight lock. owned = account_id
     *  present → MedJobs never edits this provider's directory content. */
    account_id: string | null;
    claim_state: string | null;
    verification_state: string | null;
    metadata: Record<string, unknown> | null;
    // v9 SnapshotCard mirror fields — admin sees the directory at a glance
    // without leaving the drawer. Live-page link uses the slug.
    slug: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    /** v9 final: business_profiles.zip column (was missing earlier;
     *  business_profiles HAS a ZIP column, the prior assumption that
     *  ZIP needed override-only was wrong). Falls back to the iOS
     *  olera-providers row via source_provider_id when bp.zip is
     *  null. */
    zip: string | null;
  } | null;

  /**
   * v9 outreach timeline: per-email engagement data, keyed by
   * email_log.id. Hydrated server-side from email_log's denormalized
   * columns (set by the Resend webhook). The OutreachTimeline reads
   * these to render delivered/opened/clicked/bounced chips on each
   * email_sent touchpoint row without a per-row client fetch.
   *
   * Empty object when the row has no email_sent touchpoints yet.
   */
  email_engagement: Record<
    string,
    {
      delivered_at: string | null;
      first_opened_at: string | null;
      first_clicked_at: string | null;
      bounced_at: string | null;
      complained_at: string | null;
      last_event_type: string | null;
    }
  >;

  /**
   * Smartlead-native preview — what the server will actually send when
   * admin clicks Launch. Precomputed server-side so the modal renders
   * recipient roster + rendered body + schedule + sender pool without
   * bundling `lib/smartlead.ts` into the client. Null only when the row
   * has no usable recipient (no General Contact email and no Named
   * Contacts with emails) — the pre-flight checklist gates this before
   * Launch is reachable.
   */
  smartlead_preview: SmartleadPreviewSnapshot | null;
}

/** Mirror of `lib/medjobs/smartlead-bridge.ts:SmartleadPreview` — kept here
 *  so DrawerContext doesn't pull a server-only module into client bundles. */
export interface SmartleadPreviewSnapshot {
  campaign_name: string;
  recipients: Array<{
    contact_id: string | null;
    recipient_kind: "general" | "named";
    name: string;
    email: string;
    role: string | null;
    salutation: string;
  }>;
  steps: Array<{
    seq_number: number;
    delay_in_days: number;
    cadence_day: number;
    subject_template: string;
    subject_preview: string;
    body_html_template: string;
    body_html_preview: string;
  }>;
  sample_used: {
    salutation: string;
    first_name: string;
    company: string;
    campus: string;
  };
  sender_pool: string[];
}

// Semantic convention: an "advisor" row is the advising OFFICE (the org
// prospect). Individual advisors live as office members inside it, not as their
// own rows — so the row-level label is "Advising Office", not "Advisor".
export const STAKEHOLDER_TYPE_LABELS: Record<StakeholderType, string> = {
  student_org: "Student Org",
  advisor: "Advising Office",
  professor: "Professor",
  dept_head: "Dept Head",
};

/**
 * v9.0 Phase 2: human label for any kind (stakeholder + provider).
 * Use this anywhere a row's kind needs to be surfaced — falls back
 * gracefully when stakeholder_type is NULL (provider rows).
 */
export const KIND_LABELS: Record<StakeholderType | "provider", string> = {
  student_org: "Student Org",
  advisor: "Advising Office",
  professor: "Professor",
  dept_head: "Dept Head",
  provider: "Provider",
};

// v8.10.20: "Active Partner" → "Partner" everywhere admins see the
// label. The Status enum value `active_partner` stays as the database
// code; only the display string changes.
export const STATUS_LABELS: Record<Status | LegacyStatus, string> = {
  prospect: "Prospect",
  researched: "Researched",
  outreach_sent: "Outreach Sent",
  engaged: "Interested",
  meeting_scheduled: "Meeting Scheduled",
  active_partner: "Partner",
  not_interested: "Not Interested",
  no_response_closed: "No Response (Closed)",
  do_not_contact: "Do Not Contact",
  wrong_contact: "Wrong Contact",
  redirected: "Redirected",
  archived: "Archived",
  // Legacy — only present on un-migrated historical rows.
  agreed: "Partner",
  distributed: "Partner",
};

/**
 * Simplified labels admins see in lists / pills. We collapse the
 * granular state machine into 4 buckets so admins don't have to learn
 * 11 stage names. The granular STATUS_LABELS are still used for history
 * narration where the precise transition matters.
 */
export type StatusGroup = "research" | "in_progress" | "active_partner" | "closed";

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  research: "Research",
  in_progress: "In Progress",
  active_partner: "Partner",
  closed: "Closed",
};

export const STATUS_GROUP_TOOLTIPS: Record<StatusGroup, string> = {
  research: "Still gathering info. Add contacts and programs, then start outreach.",
  in_progress: "Outreach is running. Wait for replies, work the queued tasks.",
  active_partner: "They're sharing with students. Maintain the relationship.",
  closed: "No further outreach. Reopen if circumstances change.",
};

export function statusGroup(status: Status | LegacyStatus): StatusGroup {
  switch (status) {
    case "prospect":
    case "researched":
      return "research";
    case "outreach_sent":
    case "engaged":
    case "meeting_scheduled":
      return "in_progress";
    case "active_partner":
    case "agreed":
    case "distributed":
      return "active_partner";
    case "not_interested":
    case "no_response_closed":
    case "do_not_contact":
    case "wrong_contact":
    case "redirected":
    case "archived":
      return "closed";
  }
}

/**
 * Tab membership rules. Keep this list as the single source of truth for
 * which statuses fall into which tab.
 */
export const IN_PROGRESS_STATUSES: Status[] = [
  "prospect",
  "researched",
  "outreach_sent",
  "engaged",
  "meeting_scheduled",
];

export const PARTNERED_STATUSES: Status[] = ["active_partner"];

export const CLOSED_STATUSES: Status[] = [
  "not_interested",
  "no_response_closed",
  "do_not_contact",
  "wrong_contact",
  "redirected",
  "archived",
];

/** Stages from which "Mark as Partner" should be visible as a CTA. */
export const PARTNER_CTA_STAGES: Status[] = ["outreach_sent", "engaged", "meeting_scheduled"];
