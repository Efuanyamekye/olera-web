-- Migration: city campaigns move from city targets to metro targets
--
-- Context (2026-09-07). Migration 207 seeded two city-level rings, Concord NC and
-- Garland TX, chosen for proximity to providers who might take leads. A Keyword
-- Planner pull that afternoon measured them and both failed the volume gate:
--
--   Concord NC  ~330 core-term searches/month  (gate was ~1,500)
--   Garland TX  ~450 core-term searches/month
--
-- At the ~$2.25 average CPC Google forecasts for this account, $300 buys ~133
-- clicks; a city supplying ~400 searches a month cannot deliver that in fourteen
-- days at any believable impression share. The arms would have underspent and
-- produced 20-30 clicks each, which is an anecdote rather than a conversion read.
--
-- Concierge routing (migration-free, lib/city-ads/config.ts) is what makes the
-- wider net safe: a human calls every family, so a lead outside any one agency's
-- service radius costs nothing. Narrow back to the tight rings once providers are
-- switched on and the chain is doing the routing.
--
-- Every provider already pooled sits inside the new metro:
--   Charlotte -- Graceful (Concord), Legacy Haven (Harrisburg),
--                Cornerstone (Huntersville), HomeWell (Charlotte)
--   Dallas    -- Assisting Hands, Cambridge, Granny NANNIES (Dallas),
--                Palm2Palm (Frisco), Bansfield (Garland),
--                Golden Horizon, Care Mountain (Plano)
--
-- Safe to replay. No leads exist on these slugs except TJ's own loop tests.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

-- Campaigns: re-slug, rename, retag. Flight dates and budgets are unchanged.
UPDATE city_campaigns
SET slug         = 'charlotte-nc',
    city         = 'Charlotte',
    ring_label   = 'Charlotte metro',
    campaign_tag = 'olera-charlotte-sep26',
    updated_at   = NOW()
WHERE slug = 'concord-nc';

UPDATE city_campaigns
SET slug         = 'dallas-tx',
    city         = 'Dallas',
    ring_label   = 'Dallas metro',
    campaign_tag = 'olera-dallas-sep26',
    updated_at   = NOW()
WHERE slug = 'garland-tx';

-- Pools follow their city. city_pool is keyed (slug, provider_id), and no
-- provider appears in both, so a straight re-slug cannot collide.
UPDATE city_pool SET slug = 'charlotte-nc' WHERE slug = 'concord-nc';
UPDATE city_pool SET slug = 'dallas-tx'    WHERE slug = 'garland-tx';

-- Existing leads keep their history but follow the renamed city, so the admin
-- queue does not show an orphaned slug. These are TJ's loop tests only.
UPDATE city_leads SET slug = 'charlotte-nc', updated_at = NOW() WHERE slug = 'concord-nc';
UPDATE city_leads SET slug = 'dallas-tx',    updated_at = NOW() WHERE slug = 'garland-tx';

COMMENT ON COLUMN city_campaigns.ring_label IS
  'Human label for the targeted area. Metro-wide during concierge routing; narrow to a provider ring once the offer chain is live.';
