-- Migration: Add meeting reminder tracking to Provider Growth
--
-- Context (2026-09-09): Adds fields to track when meeting reminders have been
-- sent to providers. This prevents duplicate reminders and enables automated
-- reminder emails via cron job.
--
-- Reminder schedule:
--   - 2 days before meeting: First reminder
--   - 1 day before meeting: Final reminder
--
-- If meeting is scheduled less than 2 days out, appropriate reminders are skipped.

-- Add reminder tracking columns to provider_growth_tracking
ALTER TABLE provider_growth_tracking
ADD COLUMN IF NOT EXISTS reminder_2d_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reminder_1d_sent_at TIMESTAMPTZ;

-- Add 'reminder_sent' touchpoint type for tracking in Admin Activity
-- First drop the existing constraint, then recreate with new type
ALTER TABLE provider_growth_touchpoints
DROP CONSTRAINT IF EXISTS pgt_touchpoint_type_check;

ALTER TABLE provider_growth_touchpoints
ADD CONSTRAINT pgt_touchpoint_type_check CHECK (
  touchpoint_type IN (
    'stage_changed',
    'meeting_scheduled',
    'meeting_completed',
    'meeting_cancelled',
    'pitch_logged',
    'note_added',
    'ads_converted',
    'medjobs_converted',
    'ads_upgraded',
    'medjobs_upgraded',
    'marked_not_interested',
    'eligibility_updated',
    'assigned',
    'call_attempted',
    'reminder_sent'
  )
);

-- Index for efficient reminder queries (find meetings needing reminders)
CREATE INDEX IF NOT EXISTS idx_pgt_meeting_reminders ON provider_growth_tracking(meeting_scheduled_at)
WHERE pipeline_stage IN ('meeting_scheduled', 'upgrade_meeting')
  AND meeting_scheduled_at IS NOT NULL;

COMMENT ON COLUMN provider_growth_tracking.reminder_2d_sent_at IS 'When the 2-day reminder email was sent';
COMMENT ON COLUMN provider_growth_tracking.reminder_1d_sent_at IS 'When the 1-day reminder email was sent';
