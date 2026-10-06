-- Migration: provider_health_actions — the directory's own ledger
--
-- Context (2026-10-06): TJ asked for a continuous sweep of the provider
-- directory (closed businesses, renames, wrong categories, image quality) that
-- is not burdensome, not expensive, and does not evaporate the way earlier
-- plans did. Plans evaporated because a cron has no voice: when it works nobody
-- hears, when it dies nobody hears. This table is the memory. Every action the
-- system takes on a provider lands here with its evidence and its undo, the
-- daily brief reads it through a standing probe, and a quiet week is reported
-- as loudly as a busy one.
--
-- Decisions:
--  1. Actions, not flags. A row is something that happened (an archive, a
--     rename, a flag raised) with `applied_at`; a flag is just an action with
--     nothing applied. `undone_at` is the reversal. Nothing is ever deleted.
--  2. Reversible by construction. `undo` carries what to restore (the old
--     name, the fact it was live), so an admin click can put it back without
--     reading code.
--  3. The observation lives on the provider row (google_status,
--     google_status_checked_at, google_name) so the next pass can skip what
--     was checked. The ledger holds only what changed or needs eyes.

ALTER TABLE "olera-providers"
  ADD COLUMN IF NOT EXISTS google_status text,
  ADD COLUMN IF NOT EXISTS google_status_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_name text;

CREATE INDEX IF NOT EXISTS idx_olera_providers_status_unchecked
  ON "olera-providers" (google_status_checked_at)
  WHERE deleted = false AND place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS provider_health_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   text NOT NULL,
  -- What the system did, or wants a human to decide.
  kind          text NOT NULL CHECK (kind IN (
    'closed_archived',        -- Google: CLOSED_PERMANENTLY → provider soft-deleted (applied)
    'closed_temporarily',     -- Google: CLOSED_TEMPORARILY → flag only
    'rename_applied',         -- Google name differs cosmetically → provider_name updated (applied)
    'rename_flagged',         -- Google name differs substantively → flag only
    'website_dead',           -- provider website unreachable → flag only
    'category_flagged',       -- signal scan / verify says wrong bucket → flag only
    'duplicate_flagged'       -- dedupe pair → flag only
  )),
  -- Where the observation came from: google_status, review_refresh, website_head, scan, admin.
  source        text NOT NULL,
  -- What was seen: the Google status, both names, the HTTP code, the signal.
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- What to restore on undo: {"deleted": false} or {"provider_name": "old"}.
  undo          jsonb,
  applied_at    timestamptz,
  resolved_at   timestamptz,          -- a flag a human looked at and closed
  resolved_by   text,
  undone_at     timestamptz,
  undone_by     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_health_actions_open
  ON provider_health_actions (created_at DESC)
  WHERE resolved_at IS NULL AND undone_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_provider_health_actions_provider
  ON provider_health_actions (provider_id, created_at DESC);

ALTER TABLE provider_health_actions ENABLE ROW LEVEL SECURITY;
-- Service role only; admin routes read and write through it.

COMMENT ON TABLE provider_health_actions IS
  'Every action the directory-health system took on a provider, with evidence and undo. Read by /admin/directory/health and the Cortex directory_health probe.';
