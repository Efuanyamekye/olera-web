-- Q&A Answer Status for Verification Gating
-- Adds answer_status column to track whether an answer is published or pending verification.
-- Unverified providers' answers are saved as 'pending' until they complete verification.

-- 1. Add answer_status column
ALTER TABLE provider_questions
ADD COLUMN IF NOT EXISTS answer_status TEXT DEFAULT 'published'
  CHECK (answer_status IN ('pending', 'published'));

-- 2. Create index for filtering
CREATE INDEX IF NOT EXISTS idx_provider_questions_answer_status
ON provider_questions(answer_status);

-- 3. Update existing answered questions to be published (they were answered before this feature)
UPDATE provider_questions
SET answer_status = 'published'
WHERE answer IS NOT NULL AND answer_status IS NULL;

-- 4. Update RLS policy to only show published answers on public page
DROP POLICY IF EXISTS "Public can read public questions" ON provider_questions;

CREATE POLICY "Public can read public questions"
  ON provider_questions FOR SELECT
  USING (
    is_public = true
    AND status IN ('approved', 'answered')
    AND (answer_status IS NULL OR answer_status = 'published')
  );

-- 5. Comment for documentation
COMMENT ON COLUMN provider_questions.answer_status IS
  'Whether the answer is published (visible) or pending (waiting for provider verification). Default: published for backwards compat.';
