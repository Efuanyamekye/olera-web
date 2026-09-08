-- University Activation (ST3-ST7): per-channel state on a campus, the
-- individual records inside the three list channels, and the task types
-- the Live Win engine generates.
--
-- Shape follows 075_medjobs_polymorphic_tasks: one table per entity,
-- FK integrity at the schema level, service-role RLS only. The tasks
-- themselves reuse site_tasks rather than a new table -- 075 left its
-- task_type CHECK deliberately narrow "so we don't paint the schema
-- into a corner before the auto-fire ruleset is designed". This is that
-- ruleset, so the constraint widens here.

-- ── campus_channels ──────────────────────────────────────────────────
-- One row per (campus, channel). Created lazily on first write; a campus
-- with no row for a channel reads as 'not_yet'.

CREATE TABLE IF NOT EXISTS campus_channels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id        UUID NOT NULL REFERENCES student_outreach_campuses(id) ON DELETE CASCADE,
  -- ST3 job board, ST4 advisor listserv, ST5 student orgs,
  -- ST6 campus events, ST7 professors. Matches MATRIX.md numbering.
  channel          TEXT NOT NULL CHECK (channel IN ('st3','st4','st5','st6','st7')),
  -- Derived by lib/medjobs/activation.ts from the criteria below (or, for
  -- list channels, from the records). Persisted so list queries stay cheap.
  status           TEXT NOT NULL DEFAULT 'not_yet'
                     CHECK (status IN ('not_yet','in_progress','live','not_available')),
  -- Required when status = 'not_available'.
  status_reason    TEXT,
  -- Set once, on the first transition to live. Never cleared: the channel
  -- did activate, and that fact does not expire if it later lapses.
  first_activated_at TIMESTAMPTZ,
  -- { criterion_key: ISO timestamp }. Absent key = unticked.
  criteria         JSONB NOT NULL DEFAULT '{}',
  -- Channel-specific scalars: ST3 posting_url, ST7 approval block.
  detail           JSONB NOT NULL DEFAULT '{}',
  notes            JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campus_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_campus_channels_campus ON campus_channels (campus_id);

-- ── campus_channel_records ───────────────────────────────────────────
-- The individual objects inside ST5 / ST6 / ST7. One table rather than
-- three: an organization, an event and a professor are all "a named thing
-- with its own Live Win, its own contacts and its own next check". Their
-- differences live in `detail`, not in the shape.

CREATE TABLE IF NOT EXISTS campus_channel_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id       UUID NOT NULL REFERENCES campus_channels(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('organization','event','professor')),
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'not_yet'
                     CHECK (status IN ('not_yet','in_progress','live','declined')),
  status_reason    TEXT,
  first_activated_at TIMESTAMPTZ,
  criteria         JSONB NOT NULL DEFAULT '{}',
  -- organization: {}; event: kind/date/format/presenter/leader/collateral;
  -- professor: department/course/visit_format/visit_at/presenter.
  detail           JSONB NOT NULL DEFAULT '{}',
  -- At most two, enforced in the API rather than the schema.
  contacts         JSONB NOT NULL DEFAULT '[]',
  notes            JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campus_channel_records_channel
  ON campus_channel_records (channel_id);

-- ── site_tasks: the seven generated types plus custom ─────────────────

ALTER TABLE site_tasks DROP CONSTRAINT IF EXISTS site_tasks_task_type_check;
ALTER TABLE site_tasks
  ADD CONSTRAINT site_tasks_task_type_check
  CHECK (task_type IN (
    'manual_followup',              -- pre-existing, kept
    'activation_job_board_check',   -- ST3 monthly
    'activation_listserv_confirm',  -- ST4 hook, 7 days, answers a criterion
    'activation_listserv_remind',   -- ST4 monthly
    'activation_org_reconnect',     -- ST5 monthly, per organization
    'activation_event_review',      -- ST6 per semester
    'activation_event_day',         -- ST6 per event
    'activation_professor_reengage' -- ST7 seasonal, per professor
  ));

-- Which channel and record a task belongs to. Null on manual_followup
-- rows created before this feature, and on custom tasks scoped to a
-- university only.
ALTER TABLE site_tasks ADD COLUMN IF NOT EXISTS channel TEXT
  CHECK (channel IS NULL OR channel IN ('st3','st4','st5','st6','st7'));
ALTER TABLE site_tasks ADD COLUMN IF NOT EXISTS record_id UUID
  REFERENCES campus_channel_records(id) ON DELETE CASCADE;
-- Which criterion a CRITERION task answers. Null on CHECK and custom tasks.
ALTER TABLE site_tasks ADD COLUMN IF NOT EXISTS answers_criterion TEXT;
-- Months between occurrences. Null on one-shot tasks.
ALTER TABLE site_tasks ADD COLUMN IF NOT EXISTS repeat_months INT;
-- Custom-task checklist: [{ text, done }].
ALTER TABLE site_tasks ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_site_tasks_channel
  ON site_tasks (campus_id, channel) WHERE status = 'pending';

ALTER TABLE campus_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_channel_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on campus_channels" ON campus_channels;
CREATE POLICY "Service role full access on campus_channels"
  ON campus_channels FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on campus_channel_records" ON campus_channel_records;
CREATE POLICY "Service role full access on campus_channel_records"
  ON campus_channel_records FOR ALL TO service_role USING (true) WITH CHECK (true);
