-- What Cortex put in front of the founder, and what he did with it.
--
-- Cortex could not tell a move he acted on from one he ignored, so it kept
-- repeating moves he had passed over. Each brief line, each message Cortex
-- sends first (a "ping"), and each weekly rating request is one row here, and
-- his reaction is filled in: replied, acted (the data shows it was done),
-- pushed back (he corrected it), or ignored (nothing within a day). A move
-- ignored twice is dropped or reframed. Every ping is judged here on whether it
-- landed, which is what keeps unprompted messages worth sending.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('brief', 'ping', 'rate_me')),
  -- What the move is about, stable across days: 'proposal:<id>',
  -- 'moment:<thread id>', 'lead:<id>', 'flight:<id>', 'renewal:<name>'.
  subject_key text NOT NULL,
  text text NOT NULL,
  surface text NOT NULL DEFAULT 'telegram' CHECK (surface IN ('telegram', 'slack')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  reaction text CHECK (reaction IN ('replied', 'acted', 'pushed_back', 'ignored')),
  reacted_at timestamptz,
  reaction_note text
);

CREATE INDEX IF NOT EXISTS cortex_moves_sent ON cortex_moves (sent_at DESC);
CREATE INDEX IF NOT EXISTS cortex_moves_subject ON cortex_moves (subject_key, sent_at DESC);

ALTER TABLE cortex_moves ENABLE ROW LEVEL SECURITY;
