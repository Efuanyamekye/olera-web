-- Add explicit job board visibility toggle for MedJobs providers
-- This gives admins direct control over which providers appear on the student job board,
-- independent of the "ready for students" workflow status.

ALTER TABLE student_outreach
ADD COLUMN IF NOT EXISTS job_board_visible BOOLEAN DEFAULT false;

-- Backfill: Set job_board_visible = true for all providers already marked "ready_for_students"
-- This preserves existing job board visibility during the migration
UPDATE student_outreach
SET job_board_visible = true
WHERE kind = 'provider'
  AND status = 'ready_for_students'
  AND (job_board_visible IS NULL OR job_board_visible = false);

-- Add index for efficient job board queries
CREATE INDEX IF NOT EXISTS idx_student_outreach_job_board_visible
ON student_outreach (job_board_visible)
WHERE kind = 'provider' AND job_board_visible = true;

COMMENT ON COLUMN student_outreach.job_board_visible IS
'When true, this provider appears on the student job board. Toggled explicitly by admins, independent of status.';
