-- ===========================================================================
-- 266 — who leads which admin page
-- ===========================================================================
-- One row means "this person leads this sidebar page". The page is named by
-- its href, the same string admin_users.favorites already stores for pins.
--
-- The UNIQUE is on the PAIR, not on page_key. That is the whole difference
-- from medjobs_assignments, where UNIQUE (campus_id, section) makes one owner
-- the rule. A page here has as many leaders as it needs, and assigning
-- somebody who is already on it is a no-op rather than a conflict.
--
-- No CHECK constraint on page_key on purpose. The list of admin pages lives
-- in the sidebar's TypeScript and gains an entry most months; a CHECK would
-- mean a migration every time somebody adds a page. The route validates the
-- shape instead, and the sidebar resolves labels from its own nav config, so
-- a key it cannot resolve is skipped in silence — the same thing a pinned
-- href pointing at a retired route already does.
--
-- This is a view, not a permission. Nothing here gates who may open a page.
-- It answers "who is in charge of this?" from the sidebar.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS admin_page_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key      TEXT NOT NULL,
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_admin_page_assignment UNIQUE (page_key, admin_user_id)
);

-- The sidebar's only question: everybody who leads this page.
CREATE INDEX IF NOT EXISTS idx_admin_page_assignments_page
  ON admin_page_assignments (page_key);

-- "Everything Chantel leads", for whatever asks it next.
CREATE INDEX IF NOT EXISTS idx_admin_page_assignments_person
  ON admin_page_assignments (admin_user_id);

ALTER TABLE admin_page_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admin_page_assignments IS
  'Who leads which admin sidebar page. page_key is the nav href, the same '
  'string admin_users.favorites stores. Many leaders per page: the unique '
  'constraint is on (page_key, admin_user_id), not on page_key. Read by '
  'AdminSidebar to print names under a tab. Not a permission: it does not '
  'gate who may open the page.';

-- ── confirm ───────────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'admin_page_assignments'::regclass
ORDER BY conname;
