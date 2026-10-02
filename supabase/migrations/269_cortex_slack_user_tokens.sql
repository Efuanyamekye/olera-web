-- The founder's own Slack token, so Cortex can read his DMs and reply as him.
--
-- A bot token cannot read direct messages between people, his included. TJ,
-- 2026-10-02, chose to authorize Cortex as himself once in Slack so the daily
-- "what you owe" read covers his DMs, and so a reply he approves goes into the
-- thread under his name. The token is encrypted at rest (AES-256-GCM, the same
-- helper and key as the support mailbox's Gmail token). Revoking it in Slack,
-- or setting revoked_at, turns both off.
--
-- Service role only: RLS on, no policies. Additive.

CREATE TABLE IF NOT EXISTS cortex_slack_user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_user_id text NOT NULL UNIQUE,
  team_id text,
  scopes text[] NOT NULL DEFAULT '{}',
  encrypted_access_token text NOT NULL,
  -- The Olera admin who clicked through the authorization.
  connected_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE cortex_slack_user_tokens ENABLE ROW LEVEL SECURITY;
