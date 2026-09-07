-- Migration: mark test rows in the city ad pool, and keep them off the public page
--
-- Found 2026-09-07 during a pre-test review of the loop test.
--
-- app/care/[city]/page.tsx builds the provider cards on the paid landing page
-- from city_pool WHERE enabled = true. Its own comment says "a test row is
-- never a public card" but nothing implemented that, and business_profiles
-- rows used for testing can carry verification_state = 'verified'. Switching
-- the loop-test provider on to run a test would therefore have printed
--
--   Ad Boost Promotion Test · Killeen · In-home care · Verified on Olera
--
-- to a family in Charlotte, on a page whose whole promise is that we only show
-- things we can stand behind.
--
-- This adds the flag the comment assumed. A flagged row is excluded from the
-- public cards and from automatic selection in the offer chain. Handing a lead
-- to a named provider from /admin/city-ads still works on a flagged row, which
-- is how the loop test is meant to be driven.
--
-- Safe to replay.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

ALTER TABLE city_pool
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN city_pool.is_test IS
  'Row exists to exercise the relay, not to take real families. Never a public card, never auto-selected; can still be handed a lead by name from the admin panel.';

-- The loop-test provider ("Ad Boost Promotion Test", Killeen TX), pooled in
-- both metros so the chain can be exercised in either.
UPDATE city_pool
SET is_test = TRUE
WHERE provider_id = '205be0ba-796f-47e2-8255-356ae8354fe7';
