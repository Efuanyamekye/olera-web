-- Press, led by Cortex (docs/cortex/PRESS.md).
--
-- Journalist queries arrive at press@olera.care (an alias on support@) from
-- the free platforms. The support inbox files them under a new category,
-- `press`; the inbox pass extracts the queries, drafts a pitch for the ones
-- that fit Olera's angles, and the founder approves by number. Approval
-- saves a Gmail draft addressed to the reporter; a person sends it.
-- Every query that was worth a pitch is one row here, so the same query
-- is never pitched twice and the outcome has somewhere to live.

ALTER TABLE support_email_threads DROP CONSTRAINT IF EXISTS support_email_threads_category_check;
ALTER TABLE support_email_threads ADD CONSTRAINT support_email_threads_category_check CHECK (category IN (
  'care_seeker', 'provider', 'partner', 'marketing', 'automated',
  'legal', 'security', 'billing', 'voicemail', 'internal', 'press', 'other'
));

CREATE TABLE IF NOT EXISTS cortex_press (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       uuid REFERENCES support_email_threads(id) ON DELETE SET NULL,
  query_hash      text NOT NULL UNIQUE,
  outlet          text NOT NULL,
  reporter        text,
  reporter_email  text,
  query           text NOT NULL,
  deadline        text,
  fit             numeric(4,3) NOT NULL CHECK (fit BETWEEN 0 AND 1),
  angle           text,
  draft           text,
  gmail_draft_id  text,
  status          text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'drafted', 'sent', 'skipped', 'placed', 'declined')),
  outcome         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cortex_press_status ON cortex_press (status, created_at DESC);

ALTER TABLE cortex_press ENABLE ROW LEVEL SECURITY;
