-- Migration: mark test rows in city_leads, so a public number can never count one
--
-- Context (2026-09-07). Migration 210 added `city_pool.is_test` after a pre-test
-- review found a test provider could print onto the paid landing page. The same
-- gap exists one table over, and it bites at the other end of the funnel.
--
-- `city_leads` holds the loop-test requests TJ files against production to prove
-- the relay (one on 7 Sep at 06:59Z, and more will follow every time the chain
-- changes). Nothing distinguishes them from a real family. That was harmless
-- while the only reader was the admin queue, where a human recognizes their own
-- test. It stops being harmless the moment a count of these rows is published:
-- the /managed-ads explainer prints families-delivered to providers we are
-- asking to trust our numbers, and a test row inflating that count is exactly
-- the kind of error that costs more credibility than the number was worth.
--
-- A flagged row keeps its full history and stays visible in /admin/city-ads. It
-- is excluded from public counts only.
--
-- Deliberately NOT back-filled by a phone-number guess. The existing test rows
-- are identified by the one thing that is actually recorded about them: they
-- were offered to the test provider flagged in migration 210. A test request
-- that never reached the offer stage is left for a human to flag, because
-- guessing at which real family was "probably a test" is the worse error.
--
-- Safe to replay.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

ALTER TABLE city_leads
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN city_leads.is_test IS
  'Request filed to exercise the relay, not a real family. Keeps its history and stays in the admin queue; excluded from every published count.';

-- Flag any lead that was offered to the loop-test provider from migration 210.
UPDATE city_leads l
SET is_test = TRUE, updated_at = NOW()
FROM city_lead_offers o
WHERE o.lead_id = l.id
  AND o.provider_id = '205be0ba-796f-47e2-8255-356ae8354fe7'
  AND l.is_test = FALSE;

-- Public counts filter on this, so give them an index that matches.
CREATE INDEX IF NOT EXISTS city_leads_public_idx ON city_leads (slug, created_at DESC) WHERE is_test = FALSE;
