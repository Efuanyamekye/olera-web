-- What Cortex proposed from the support inbox and the SMS inbox, and what the
-- founder decided.
--
-- Each inbox pass proposes a few items: a triage batch ("archive 126 noise
-- threads"), a reply to a family's text, a Gmail draft for a provider email,
-- or one question. Nothing goes out until he approves it by number on
-- Telegram. This table is the record of those proposals and his decisions,
-- per category, which is what would let a category run on its own later
-- (about ten approvals with no edits); autonomy is not turned on anywhere.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id text NOT NULL,
  -- The number he replies with ("send 2"), unique within a pass.
  number int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('triage_batch', 'sms_draft', 'email_draft', 'question')),
  -- For the autonomy record: 'email:noise', 'sms:keywords', 'sms:reply', 'email:draft:provider', ...
  category text NOT NULL,
  -- What to act on: { last10 } | { threadId } | { phones: [...] } | { count }
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'done', 'skipped', 'failed', 'expired')),
  -- He changed the draft before approving it.
  edited boolean NOT NULL DEFAULT false,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (pass_id, number)
);

CREATE INDEX IF NOT EXISTS cortex_inbox_items_created ON cortex_inbox_items (created_at DESC);
CREATE INDEX IF NOT EXISTS cortex_inbox_items_category ON cortex_inbox_items (category, status);

ALTER TABLE cortex_inbox_items ENABLE ROW LEVEL SECURITY;
