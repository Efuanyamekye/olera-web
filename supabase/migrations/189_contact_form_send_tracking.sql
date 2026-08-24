-- Migration: Add contact form send tracking fields
--
-- Adds tracking columns for contact form submissions as a supplementary
-- outreach channel that does not change the provider's stage.
--
-- contact_form_sent_at: Timestamp of first contact form submission
-- contact_form_send_count: Number of contact form submissions for this provider
-- contact_form_sent touchpoint: Logged each time a form is submitted

-- ── New tracking columns ────────────────────────────────────────────────────

ALTER TABLE provider_outreach_tracking
  ADD COLUMN IF NOT EXISTS contact_form_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_form_send_count INT DEFAULT 0;

-- Index for queries filtering by contact form activity
CREATE INDEX IF NOT EXISTS idx_pot_contact_form_sent
  ON provider_outreach_tracking (contact_form_sent_at)
  WHERE contact_form_sent_at IS NOT NULL;

COMMENT ON COLUMN provider_outreach_tracking.contact_form_sent_at IS
  'Timestamp of first contact form submission';

COMMENT ON COLUMN provider_outreach_tracking.contact_form_send_count IS
  'Number of contact form submissions for this provider';

-- ── Add contact_form_sent touchpoint type ───────────────────────────────────

ALTER TABLE provider_outreach_touchpoints
  DROP CONSTRAINT IF EXISTS provider_outreach_touchpoints_touchpoint_type_check;

ALTER TABLE provider_outreach_touchpoints
  ADD CONSTRAINT provider_outreach_touchpoints_touchpoint_type_check
  CHECK (touchpoint_type IN (
    'stage_changed',
    'email_sent',
    'email_opened',
    'email_clicked',
    'email_replied',
    'email_bounced',
    'call_attempted',
    'outcome_recorded',
    'cycle_started',
    'cycle_exhausted',
    'exclusion_toggled',
    'assignment_changed',
    'sequence_launched',
    'email_changed',
    'email_source_changed',
    'contact_form_sent'
  ));
