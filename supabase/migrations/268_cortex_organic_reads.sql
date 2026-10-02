-- Cortex's daily organic read: one row per day, its memory.
--
-- TJ, 2026-10-02: a daily organic scan that answers what's going on, what's
-- broken, how to improve, what's going well and one out-of-the-box play, and
-- "should get better over time itself". Each row keeps what the read found,
-- the one action it proposed, and the number that action was meant to move,
-- with its value on the day. The next read compares that number again, so it
-- can say whether its last recommendation worked and never re-flag a resolved
-- item. Competitor notes (A Place for Mom, Caring.com, SeniorAdvisor/Seniorly)
-- are refreshed at most weekly and reused from here in between.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_organic_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  read_date date NOT NULL UNIQUE,
  -- The rolling windows compared: last 28 days ending 3 days ago (Search
  -- Console lag) against the 28 before.
  window_start date NOT NULL,
  window_end date NOT NULL,
  prev_start date NOT NULL,
  prev_end date NOT NULL,
  -- The deterministic findings the model was given (category split, top URL
  -- movers, CTR collapses, position drops, impression losses).
  findings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The phone lines and the full report section, as delivered.
  synopsis jsonb NOT NULL DEFAULT '[]'::jsonb,
  read text NOT NULL DEFAULT '',
  -- The one approvable action, and the number it should move:
  -- target_metric is "<scope>:<key>:<measure>", e.g.
  -- "page:/provider/abc:search_clicks" or "category:provider:organic_sessions".
  action jsonb,
  target_metric text,
  target_baseline double precision,
  competitor_notes text,
  competitor_checked_at timestamptz,
  cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cortex_organic_reads_date ON cortex_organic_reads (read_date DESC);

ALTER TABLE cortex_organic_reads ENABLE ROW LEVEL SECURITY;
