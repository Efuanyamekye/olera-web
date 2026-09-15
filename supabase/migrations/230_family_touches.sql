-- Migration: Family touch log — the care-seeker counterpart to provider_touches
--
-- Context (2026-09-15): the care-seeker Relationships page reads seven feeds and
-- six of them already existed. This is the seventh, and the only one that is new
-- capture. Without it a call leaves no trace: TJ phoned a city lead on 14 Sep,
-- her voicemail was full, he texted instead — and her timeline showed the text
-- (the app sent it) and not the call (the app didn't). Same shape as the Ann
-- McDade problem: the app only records what the app does.
--
-- Deliberately identical to provider_touches (migration 205) rather than
-- "improved". The two logs should stay readable as one idea, the merge code is
-- already written against that shape, and every column below has already earned
-- its place on the provider side.
--
-- Three decisions carried over unchanged:
--
--  1. No stage, no pipeline, no score. State is derived from rows at read time
--     (lib/seeker-touches/timeline.server.ts). This table stores events, never
--     status, so the list can never disagree with what happened.
--
--  2. `source` says how the row knows: typed by a person, synced from a mailbox,
--     or emitted by the system. System sends stay in email_log and are merged at
--     read time — they are NOT copied here. This table holds only what would
--     otherwise be lost: calls, meetings, texts from a personal phone, anything
--     said out loud.
--
--  3. `occurred_at` is separate from `created_at`, so last night's call can be
--     logged this morning without pretending it was logged live.
--
-- ONE ADDITION the provider table has no need for: `reached`. For a provider,
-- logging a touch means you talked to them. For a family it very often does not
-- — a full mailbox, a number that does not ring, a text into silence. The list
-- marks a family "Owed a call" in red, and that must NOT clear because someone
-- tried. It clears when `reached = true`, or when a next action with a date is
-- declared. Trying is not reaching, and a tool that confuses the two quietly
-- drops the people who are hardest to get hold of.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

CREATE TABLE IF NOT EXISTS family_touches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The care seeker: business_profiles with type='family'. CASCADE because the
  -- admin care-seeker page deletes the profile, and a touch pointing at a dead
  -- profile is worse than no touch (migration 217 makes the same argument).
  seeker_id             UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,

  channel               TEXT NOT NULL,
  direction             TEXT NOT NULL,          -- out = we reached them, in = they reached us
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Did we actually get hold of them? NULL for rows where it makes no sense
  -- (a note, an inbound message). FALSE is the important value: it is what
  -- "called, no answer" looks like, and it keeps the row red.
  reached               BOOLEAN,

  summary               TEXT NOT NULL,          -- one line, what happened
  detail                TEXT,                   -- the note, quote, or pasted thread

  contact_name          TEXT,
  contact_handle        TEXT,                   -- the number or address actually used

  source                TEXT NOT NULL DEFAULT 'manual',
  source_ref            TEXT,

  -- The only forward-looking fields. A new declaration closes the family's
  -- earlier open ones, so "the next action" is always the latest declared.
  next_action           TEXT,
  next_action_due       DATE,
  next_action_owner     TEXT,
  next_action_done_at   TIMESTAMPTZ,

  author                TEXT NOT NULL,
  admin_user_id         UUID REFERENCES admin_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT family_touches_channel_check CHECK (
    channel IN ('email', 'text', 'call', 'meeting', 'in_app', 'note')
  ),
  CONSTRAINT family_touches_direction_check CHECK (
    direction IN ('out', 'in')
  ),
  CONSTRAINT family_touches_source_check CHECK (
    source IN ('manual', 'gmail', 'system')
  ),
  -- A due date or an owner with no action is noise.
  CONSTRAINT family_touches_next_action_shape CHECK (
    next_action IS NOT NULL
    OR (next_action_due IS NULL AND next_action_owner IS NULL AND next_action_done_at IS NULL)
  )
);

-- Admin-only: RLS on, no policies, service role only. This table holds family
-- names, personal phone numbers, health situations and candid notes about
-- people in a hard week. Nothing here may be readable through PostgREST.
ALTER TABLE family_touches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS family_touches_seeker_idx
  ON family_touches (seeker_id, occurred_at DESC);

-- Powers the open-action read on the list.
CREATE INDEX IF NOT EXISTS family_touches_open_action_idx
  ON family_touches (next_action_due)
  WHERE next_action IS NOT NULL AND next_action_done_at IS NULL;

COMMENT ON TABLE family_touches IS
  'One row per human-level touch with a care seeker on any channel, plus the single next action it implies. The care-seeker counterpart to provider_touches. State is derived at read time and never stored; system sends live in email_log and are merged, not copied.';

COMMENT ON COLUMN family_touches.reached IS
  'TRUE = we actually spoke to them. FALSE = we tried and did not (no answer, full mailbox, dead number). NULL = not applicable. Only TRUE clears an owed call: trying is not reaching, and treating them the same drops the families who are hardest to get hold of.';

COMMENT ON COLUMN family_touches.occurred_at IS
  'When the touch happened, separate from created_at, so a call can be logged the next morning without pretending it was logged live.';
