-- Migration: Agent Outreach Requests (H1 Wizard-of-Oz capture surface)
--
-- Context: Tests demand for an Olera-hosted AI agent that does provider
-- outreach for families. Ships as the 4th arm of the SBF intake A/B test
-- on provider pages (random djb2 mod 4 split, sticky 30 days). 25% of
-- visitors see the AgentOutreachModule on the Q&A surface instead of the
-- BenefitsDiscoveryModule. On submit, this table records the request and
-- a Slack alert fires; TJ fulfills outreach manually in Claude Code with
-- a 24h SLA. No admin UI in v0.
--
-- This migration does TWO coupled things in one transaction:
--   1. Creates agent_outreach_requests table.
--   2. Extends the seeker_activity event_type CHECK constraint with the
--      three new event types this feature emits.
--
-- The two MUST ship together. Per feedback_event_allowlist_needs_db_migration.md,
-- adding a new event_type to the app allowlist without extending the DB CHECK
-- causes every insert to fail silently — fire-and-forget activity-track
-- routes swallow the rejection. Cost a 7h diagnosis loop on 2026-04-29.
--
-- Apply via Supabase dashboard (NOT CLI).

-- ============================================================================
-- 1. agent_outreach_requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_outreach_requests (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Who the request is for. seeker_email is the canonical identifier (guests
  -- can submit). seeker_user_id is attached when the submitter is signed in.
  seeker_user_id       UUID,
  seeker_email         TEXT NOT NULL,

  -- The provider page the family was on when they submitted.
  source_provider_id   TEXT NOT NULL,

  -- Geographic + category context for fulfillment.
  city                 TEXT,
  state                TEXT,
  category             TEXT,

  -- The question they had just asked (the engagement moment that triggered
  -- the module). question_id is soft-linked; we store the text inline so
  -- TJ has full context in the Slack alert without a join.
  question_id          UUID,
  question_text        TEXT,

  -- The 3 provider IDs we showed as visual proof. Stored for audit so we
  -- can reconcile what the family saw vs. who TJ actually contacted.
  target_provider_ids  TEXT[] NOT NULL DEFAULT '{}',

  -- Fulfillment status. Slack is the work surface in v0; this column exists
  -- for measurement and future admin UI. TJ may update informally; no
  -- enforcement.
  status               TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'declined')),
  notes                TEXT,

  -- Optional fulfillment metadata (Phase 4 territory; columns exist now so
  -- we don't need a follow-up migration when we layer admin UI).
  claimed_by           UUID,
  claimed_at           TIMESTAMPTZ,
  fulfilled_at         TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue ordering for the (eventual) admin queue and daily-digest counts.
CREATE INDEX IF NOT EXISTS idx_agent_outreach_requests_status_created
  ON agent_outreach_requests (status, created_at DESC);

-- Rate-limit lookup: 3 submissions per email per hour (D6).
CREATE INDEX IF NOT EXISTS idx_agent_outreach_requests_email_created
  ON agent_outreach_requests (seeker_email, created_at DESC);

-- Per-source-provider analytics (which pages convert to outreach).
CREATE INDEX IF NOT EXISTS idx_agent_outreach_requests_source_provider
  ON agent_outreach_requests (source_provider_id);

-- Service-role only, matching seeker_activity / provider_activity.
ALTER TABLE agent_outreach_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Extend seeker_activity event_type CHECK constraint
-- ============================================================================
-- New event types emitted by the AgentOutreachModule:
--   outreach_module_impression  — fires on mount when the module renders
--   outreach_card_clicked       — fires when a mini provider card is clicked
--   outreach_request_submitted  — fires on successful POST /api/outreach/request
--
-- Includes ALL existing event types from prior migrations (027, 038, 056, 059).
-- Adding a new event type without listing the existing ones would drop them.

ALTER TABLE seeker_activity DROP CONSTRAINT IF EXISTS seeker_activity_event_type_check;
ALTER TABLE seeker_activity ADD CONSTRAINT seeker_activity_event_type_check
  CHECK (event_type IN (
    'connection_sent',
    'profile_enriched',
    'email_click',
    'question_asked',
    'matches_activated',
    'benefits_completed',
    'save_nudge_shown',
    'save_nudge_signup_clicked',
    'save_nudge_dismissed',
    'save_nudge_converted',
    'benefits_results_viewed',
    'outreach_module_impression',
    'outreach_card_clicked',
    'outreach_request_submitted'
  ));
