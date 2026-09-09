-- Migration: Add no_show pipeline stage
--
-- Context (2026-09-09): Add 'no_show' as a pipeline stage for providers who
-- missed their scheduled meeting. This moves no-show handling from a flag
-- to a proper stage in the Follow-up section.
--
-- Follow-up now has 3 subtabs:
--   - Active (pitched) - provider showed up, following up for conversion
--   - No-show (no_show) - provider missed meeting, following up to reschedule
--   - Not Interested (not_interested) - provider expressed no interest

-- Drop and recreate the pipeline_stage constraint to include 'no_show'
ALTER TABLE provider_growth_tracking
  DROP CONSTRAINT IF EXISTS pgt_pipeline_stage_check;

ALTER TABLE provider_growth_tracking
  ADD CONSTRAINT pgt_pipeline_stage_check CHECK (
    pipeline_stage IN ('new_claim', 'meeting_scheduled', 'pitched', 'not_interested', 'upgrade_meeting', 'no_show')
  );

-- Add meeting_no_show and activity_logged to touchpoint types
ALTER TABLE provider_growth_touchpoints
  DROP CONSTRAINT IF EXISTS pgt_touchpoint_type_check;

ALTER TABLE provider_growth_touchpoints
  ADD CONSTRAINT pgt_touchpoint_type_check CHECK (
    touchpoint_type IN (
      'stage_changed',
      'meeting_scheduled',
      'meeting_completed',
      'meeting_cancelled',
      'meeting_no_show',
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
      'activity_logged'
    )
  );

-- Index for no_show stage queries
CREATE INDEX IF NOT EXISTS idx_pgt_no_show ON provider_growth_tracking(pipeline_stage)
  WHERE pipeline_stage = 'no_show';
