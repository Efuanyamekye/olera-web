-- Migration: Staffing Outreach V2 - Automated Email Sequences
--
-- This migration updates the staffing outreach system to use Resend Automations
-- for automated email sequences. Key changes:
--
-- 1. New status values: 'sequencing', 'needs_call', 'bounced'
-- 2. New columns for tracking sequence progress
-- 3. New touchpoint types for sequence events
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

-- ── Update staffing_outreach status constraint ────────────────────────────
-- Add new statuses: sequencing, needs_call, bounced
-- Keep existing statuses for backwards compatibility during transition

ALTER TABLE staffing_outreach
  DROP CONSTRAINT IF EXISTS staffing_outreach_status_check;

ALTER TABLE staffing_outreach
  ADD CONSTRAINT staffing_outreach_status_check CHECK (status IN (
    -- V2 statuses
    'queued',              -- Initial state, ready to be queued for sequence
    'sequencing',          -- Email sequence in progress (Email 1 sent, waiting for Email 2)
    'needs_call',          -- Sequence complete, no response, needs manual call
    'consented',           -- Got verbal consent on call, enrollment email sent
    'activated',           -- Clicked magic link
    'enrolled',            -- Accepted T&C
    'bounced',             -- Email bounced
    'closed',              -- DNC or gave up (renamed from do_not_contact)
    -- Legacy statuses (kept for migration period)
    'pre_call_outreach',
    'calling',
    'connected_no_consent',
    'nurturing',
    'do_not_contact',
    'wrong_number'
  ));

-- ── Add sequence tracking columns ─────────────────────────────────────────

ALTER TABLE staffing_outreach
  ADD COLUMN IF NOT EXISTS sequence_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resend_automation_id TEXT,
  ADD COLUMN IF NOT EXISTS sequence_email TEXT;

-- Index for finding providers in active sequences
CREATE INDEX IF NOT EXISTS idx_staffing_outreach_sequencing
  ON staffing_outreach (sequence_started_at)
  WHERE status = 'sequencing';

-- ── Update touchpoint types ───────────────────────────────────────────────
-- Add new types for V2 sequence events

ALTER TABLE staffing_touchpoints
  DROP CONSTRAINT IF EXISTS staffing_touchpoints_type_check;

ALTER TABLE staffing_touchpoints
  ADD CONSTRAINT staffing_touchpoints_type_check CHECK (type IN (
    -- pre-call channels (legacy + new)
    'research_completed',
    'pre_call_email_sent',
    'follow_up_email_sent',
    'contact_form_submitted',
    'fax_sent',
    'mail_sent',

    -- V2: Automated sequence events
    'sequence_started',           -- Resend automation triggered
    'sequence_email1_sent',       -- Email 1 sent by Resend
    'sequence_email2_sent',       -- Email 2 sent by Resend
    'sequence_completed',         -- Both emails sent, moving to needs_call

    -- calls
    'call_no_answer',
    'call_voicemail',
    'call_wrong_number',
    'call_connected_no_consent',
    'call_connected_consent',
    'call_not_interested',
    'manual_dnc',

    -- automated emails (sequence steps - post consent)
    'email_pre_consent_a_sent',
    'email_pre_consent_b_sent',
    'email_post_consent_step1_sent',
    'email_post_consent_step2_sent',
    'email_post_consent_step3_sent',
    'email_post_consent_step4_sent',
    'email_post_consent_step5_sent',
    'email_welcome_sent',
    'email_new_student_trigger_sent',

    -- email lifecycle
    'email_opened',
    'email_clicked',
    'email_bounced',

    -- system events
    'reply_received',
    'system_activated',
    'system_enrolled',
    'system_auto_dnc',
    'status_reverted'
  ));

-- ── Comments for documentation ────────────────────────────────────────────

COMMENT ON COLUMN staffing_outreach.sequence_started_at IS 'When the Resend automation was triggered';
COMMENT ON COLUMN staffing_outreach.email1_sent_at IS 'When Email 1 was sent by Resend';
COMMENT ON COLUMN staffing_outreach.email2_sent_at IS 'When Email 2 was sent by Resend';
COMMENT ON COLUMN staffing_outreach.resend_automation_id IS 'Resend automation contact ID for tracking';
COMMENT ON COLUMN staffing_outreach.sequence_email IS 'Email address used for sequence (for proper stopping)';
