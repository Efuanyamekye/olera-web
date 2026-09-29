-- ===========================================================================
-- 267 — hiding a university from the board
-- ===========================================================================
-- A campus nobody is working still has records, still has tasks, and still
-- takes a row on the board. Four campuses being worked properly read better
-- than six where two are noise, so the board gets a way to put a campus out
-- of sight.
--
-- Shared, not per person. The whole point is that the team looks at the same
-- short list: one operator hiding a campus in their own browser while
-- everybody else still sees it is the confusion this is meant to end.
--
-- A nullable timestamp rather than a boolean, matching viewed_at and
-- research_complete_at on this same table. NULL means visible. It costs
-- nothing over a boolean and answers "when did we stop working this?", which
-- is the question anybody asks the moment they notice a campus is missing.
--
-- This hides a row. It does not archive the campus, touch its records, its
-- tasks or its assignments, or take it out of any rollup. Unhiding is
-- setting the column back to NULL and the board is exactly as it was.
-- ===========================================================================

ALTER TABLE student_outreach_campuses
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN student_outreach_campuses.hidden_at IS
  'When this campus was hidden from the MedJobs task board. NULL means '
  'visible. A view of the board only: records, tasks, assignments and every '
  'rollup are unaffected.';

COMMENT ON COLUMN student_outreach_campuses.hidden_by IS
  'Which admin hid it. Cleared along with hidden_at when it is unhidden.';

-- Partial, because the hidden set is the small one and the common query is
-- "everything still showing". Same shape as idx_so_campuses_demo.
CREATE INDEX IF NOT EXISTS idx_so_campuses_hidden
  ON student_outreach_campuses (id) WHERE hidden_at IS NOT NULL;

-- ── confirm ───────────────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'student_outreach_campuses'
  AND column_name IN ('hidden_at', 'hidden_by')
ORDER BY column_name;
