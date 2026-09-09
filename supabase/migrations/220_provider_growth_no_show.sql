-- Add no-show tracking columns to provider_growth_tracking
-- Tracks when providers miss scheduled meetings

ALTER TABLE provider_growth_tracking
ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0;

ALTER TABLE provider_growth_tracking
ADD COLUMN IF NOT EXISTS last_no_show_at TIMESTAMPTZ;

-- Add index for querying providers with no-shows
CREATE INDEX IF NOT EXISTS idx_provider_growth_tracking_no_show_count
ON provider_growth_tracking (no_show_count)
WHERE no_show_count > 0;

COMMENT ON COLUMN provider_growth_tracking.no_show_count IS 'Number of times provider missed scheduled meetings';
COMMENT ON COLUMN provider_growth_tracking.last_no_show_at IS 'Timestamp of most recent no-show';
