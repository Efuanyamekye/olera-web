-- Migration: Add meeting type and focus tags
--
-- Context (2026-09-09): When scheduling a meeting, admin now tags it with:
--   - meeting_type: 'new' (first pitch) or 'upgrade' (upgrade discussion)
--   - meeting_focus: 'ads', 'medjobs', or 'both' (what product is being discussed)
--
-- This allows merging meeting_scheduled and upgrade_meeting into one unified
-- "Meeting Scheduled" tab with subtabs by product focus (Ads/MedJobs/Both).

-- Add meeting_type column
ALTER TABLE provider_growth_tracking
  ADD COLUMN IF NOT EXISTS meeting_type TEXT;

ALTER TABLE provider_growth_tracking
  ADD CONSTRAINT pgt_meeting_type_check CHECK (
    meeting_type IS NULL OR meeting_type IN ('new', 'upgrade')
  );

-- Add meeting_focus column
ALTER TABLE provider_growth_tracking
  ADD COLUMN IF NOT EXISTS meeting_focus TEXT;

ALTER TABLE provider_growth_tracking
  ADD CONSTRAINT pgt_meeting_focus_check CHECK (
    meeting_focus IS NULL OR meeting_focus IN ('ads', 'medjobs', 'both')
  );

-- Index for filtering by meeting_focus (used in Meeting Scheduled subtabs)
CREATE INDEX IF NOT EXISTS idx_pgt_meeting_focus ON provider_growth_tracking(meeting_focus)
  WHERE meeting_focus IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN provider_growth_tracking.meeting_type IS 'Type of meeting: new (first pitch) or upgrade (conversion discussion)';
COMMENT ON COLUMN provider_growth_tracking.meeting_focus IS 'Product focus of meeting: ads, medjobs, or both';
