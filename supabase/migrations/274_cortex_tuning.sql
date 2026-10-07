-- How Cortex is tuned, one row per instruction.
--
-- TJ, 7 Oct 2026: "We will need to tune and adjust not just what it does, but
-- how it communicates, how it asks for feedback, what is autonomous versus
-- what needs approval, how often." Tuning is a conversation, not a config:
-- a reply in an initiative's #cortex thread ("weekly, not daily", "ask me
-- first on renames") lands here, scoped to that initiative, and the next run
-- reads it. A thumbs up or down on a Cortex post lands here too, as a grade.
--
-- kind:
--   cadence  value daily | weekly | off        how often the initiative speaks
--   fence    value <setting>=alone | ask       e.g. renames=ask, archive=alone
--   lesson   value one sentence                a standing correction for this initiative
--   grade    value up | down                   a reaction on a Cortex post (slack_ts)
-- Newest row wins for cadence and each fence setting. Lessons and grades accumulate.

CREATE TABLE IF NOT EXISTS cortex_tuning (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative  text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('cadence', 'fence', 'lesson', 'grade')),
  value       text NOT NULL,
  quote       text,                    -- what the person actually said
  slack_ts    text,                    -- the message or the graded post
  set_by      text,                    -- Slack user id
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cortex_tuning_initiative ON cortex_tuning (initiative, kind, created_at DESC);

ALTER TABLE cortex_tuning ENABLE ROW LEVEL SECURITY;

-- The directory ledger learns one more kind: a permanently closed provider
-- that was flagged instead of archived because the archive fence is "ask".
ALTER TABLE provider_health_actions DROP CONSTRAINT IF EXISTS provider_health_actions_kind_check;
ALTER TABLE provider_health_actions ADD CONSTRAINT provider_health_actions_kind_check CHECK (kind IN (
  'closed_archived', 'closed_flagged', 'closed_temporarily', 'rename_applied', 'rename_flagged',
  'website_dead', 'category_flagged', 'duplicate_flagged'
));
