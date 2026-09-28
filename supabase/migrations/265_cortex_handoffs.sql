-- Briefs Cortex writes for a Claude Code session ("hand this off" on Telegram).
--
-- Cortex runs on Vercel and cannot write to the founder's Mac, where Jade's
-- briefs live, so its briefs are stored here. His /handoff skill lists the
-- open ones next to Jade's and closes each with the PR URL, and Cortex reads
-- that result back into its record.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  -- The brief itself, Markdown.
  body text NOT NULL,
  repo text NOT NULL DEFAULT 'olera-web',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'done', 'dropped')),
  -- What came of it: the PR URL, or what is left when partial.
  result text,
  -- What he typed after "hand this off", if anything.
  note text,
  chat_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS cortex_handoffs_status ON cortex_handoffs (status, created_at DESC);

ALTER TABLE cortex_handoffs ENABLE ROW LEVEL SECURITY;
