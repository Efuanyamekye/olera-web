-- Cortex's voice and one directory field.
--
-- cortex_posts: everything Cortex says in Slack on its own initiative, keyed
-- so it never says the same thing twice and can thread under what it said
-- before. `key` is the idempotency handle: "directory:2026-10-07" for a daily
-- directory digest, "meeting:<notion page id>" for a meeting summary,
-- "thread:directory" for an initiative's standing thread. TJ, 6 Oct 2026:
-- earlier plans evaporated because a cron has no voice; this is the voice's
-- own ledger.
--
-- olera-providers.facebook_url: picked up by the website sweep while it is
-- on the provider's homepage anyway; the page work that shows it comes later.

CREATE TABLE IF NOT EXISTS cortex_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,           -- directory_digest | meeting_summary | thread | handoff_update
  key         text NOT NULL UNIQUE,
  channel     text NOT NULL,           -- "#cortex" or a channel id
  slack_ts    text,                    -- null when Slack refused it; the failure is in `error`
  thread_ts   text,
  text        text NOT NULL,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cortex_posts_kind ON cortex_posts (kind, created_at DESC);

ALTER TABLE cortex_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE "olera-providers" ADD COLUMN IF NOT EXISTS facebook_url text;
