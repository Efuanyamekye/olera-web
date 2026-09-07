-- Migration: city lead follow-ups (the measurement layer)
--
-- Context (2026-09-07): the city campaign can already put a family in front of
-- a provider. It cannot yet tell whether the provider called, or whether the
-- family became a client. That is precisely the gap that made Ad Boost
-- unprovable: Franchil closed a paying client in July and every in-app signal
-- read zero, so the wrap-up email asked for money without being able to say
-- "you just got a client" (see memory project_adboost_outcome_blindness).
--
-- Two questions, asked on a clock, are the whole instrument:
--
--   Day 2, to the FAMILY:   "Did {Provider} reach you?"  1 yes / 2 not yet
--   Day 7 and 21, to the PROVIDER: "Did {name} become a client?"
--                                   1 yes / 2 still talking / 3 no
--
-- The family answer is dual-purpose, the same shape as the family-comms
-- outcome check: a Yes marks the connection real, a No is a re-route trigger
-- (nudge the provider, then offer the request to the next one). The provider
-- answer is the only honest KPI the pilot has, and the number every future
-- pitch will quote.
--
-- Markers are columns rather than JSON so a due-set query is an index scan and
-- a partial send can never be replayed. Every marker is stamped BEFORE the send
-- and cleared if the send fails, the same reservation-as-idempotency shape the
-- Ad Boost lifecycle emails use.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

ALTER TABLE city_leads
  -- Day 2: did the provider actually reach them?
  ADD COLUMN IF NOT EXISTS family_check_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS family_check_reply       TEXT,
  ADD COLUMN IF NOT EXISTS family_check_reply_at    TIMESTAMPTZ,
  -- The one nudge a provider gets after a family says "not yet".
  ADD COLUMN IF NOT EXISTS provider_nudged_at       TIMESTAMPTZ,
  -- Day 7 and day 21: did this become a client?
  ADD COLUMN IF NOT EXISTS outcome_ping_1_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_ping_2_at        TIMESTAMPTZ;

ALTER TABLE city_leads DROP CONSTRAINT IF EXISTS city_leads_family_check_reply_check;
ALTER TABLE city_leads ADD CONSTRAINT city_leads_family_check_reply_check CHECK (
  family_check_reply IS NULL OR family_check_reply IN ('reached', 'not_yet')
);

-- The due-set scans: accepted leads with a marker still null. Partial indexes
-- because the overwhelming majority of rows are already answered or closed.
CREATE INDEX IF NOT EXISTS city_leads_family_check_due_idx
  ON city_leads (accepted_offer_id, family_check_sent_at)
  WHERE family_check_sent_at IS NULL AND accepted_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS city_leads_outcome_due_idx
  ON city_leads (accepted_offer_id, outcome_ping_1_at, outcome_ping_2_at)
  WHERE accepted_offer_id IS NOT NULL AND outcome IS DISTINCT FROM 'client';

COMMENT ON COLUMN city_leads.family_check_reply IS
  'Family answer to the day-2 "did they reach you?" text. reached = the connection is real; not_yet = nudge the provider, then re-offer.';
