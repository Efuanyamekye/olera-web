-- Cortex's memory of its conversations with the founder.
--
-- Until now Cortex remembered one exchange for fifteen minutes (a single row in
-- war_room_source_state). "What about Robbie?" the next morning had nothing to
-- attach to. Cortex is now meant to be a thinking partner the founder talks to
-- on Telegram, so it keeps every message and a rolling summary of the older
-- ones, and reads both on every answer.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL CHECK (surface IN ('telegram', 'slack')),
  chat_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('founder', 'cortex')),
  -- A daily brief or an unprompted ping is Cortex speaking first.
  kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'brief', 'ping')),
  text text NOT NULL,
  -- Telegram retries a webhook it thinks failed. The update id is unique, so a
  -- retry cannot be answered (and charged) twice.
  telegram_update_id bigint UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cortex_chat_messages_chat_created
  ON cortex_chat_messages (chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cortex_chat_summaries (
  chat_id text PRIMARY KEY,
  summary text NOT NULL,
  -- Messages up to and including this time are folded into the summary.
  through_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cortex_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex_chat_summaries ENABLE ROW LEVEL SECURITY;
