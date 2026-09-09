-- Migration: Add upgrade_meeting pipeline stage
--
-- Context (2026-09-08): Add 'upgrade_meeting' stage for Converted providers
-- who have scheduled a meeting to discuss becoming a Paying customer.
--
-- Flow:
--   New Claim → Meeting Scheduled → Pitched → Converted → Upgrade Meeting → Paying
--
-- The 'upgrade_meeting' stage is specifically for free trial users (Converted)
-- who have booked a meeting to discuss upgrading to a paid subscription.
-- This is distinct from 'meeting_scheduled' which is for initial pitch meetings.

-- Drop and recreate the pipeline_stage constraint to include 'upgrade_meeting'
ALTER TABLE provider_growth_tracking
  DROP CONSTRAINT IF EXISTS pgt_pipeline_stage_check;

ALTER TABLE provider_growth_tracking
  ADD CONSTRAINT pgt_pipeline_stage_check CHECK (
    pipeline_stage IN ('new_claim', 'meeting_scheduled', 'pitched', 'not_interested', 'upgrade_meeting')
  );

-- Add call_attempted to touchpoint types (needed for call logging)
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
      'call_attempted'
    )
  );

-- Index for upgrade meeting tab (upcoming upgrade meetings)
CREATE INDEX IF NOT EXISTS idx_pgt_upgrade_meeting ON provider_growth_tracking(meeting_scheduled_at)
  WHERE pipeline_stage = 'upgrade_meeting' AND meeting_scheduled_at IS NOT NULL;
