-- Let Google Ads write its own numbers, and make it obvious which numbers it wrote.
--
-- THE PROBLEM THIS SOLVES. ad_spend_cents, ad_clicks and ad_impressions have
-- never been synced from anywhere. A human reads the Google Ads UI and types
-- them into a form. On 2026-09-04 Edmonds Villa's August flight was recorded as
-- $0.00 / 4 impressions; Google's own API returned $43.52 / 391 for the same
-- campaign on 2026-09-11. That is not a rounding difference, it is a different
-- campaign's worth of truth, and every decision made off that row was made
-- blind.
--
-- Internally a wrong number is an annoyance. The reason this became urgent is
-- that these figures are about to face providers, who are paying for the spend
-- being described. Being wrong by 100x once in front of a customer discredits
-- every other number on the page permanently.
--
-- WHY TWO COLUMNS AND NOT A METRICS TABLE. A time series would let us draw
-- spend-over-time later. We do not need it to stop typing numbers by hand, and
-- the whole point of this change is to make the CURRENT number trustworthy.
-- A snapshot table can be added when something actually asks for a series.

-- ---------------------------------------------------------------------------
-- 1. The join that did not exist.
-- ---------------------------------------------------------------------------
-- city_campaigns has carried platform_campaign_id since it was created.
-- ad_campaign_requests never did: the Google campaign ID for a provider flight
-- lives in admin_note prose and in the /ad-boost-audit registry, which means
-- there is no way to get from an API response back to a provider's row.
-- Nullable, because historic rows will be backfilled deliberately rather than
-- guessed at from campaign names -- a fuzzy name match that attaches Graceful's
-- spend to Rosemonte's row is worse than a null.

ALTER TABLE ad_campaign_requests
  ADD COLUMN IF NOT EXISTS platform_campaign_id text;

COMMENT ON COLUMN ad_campaign_requests.platform_campaign_id IS
  'Google Ads campaign ID for this flight. The join key for metrics ingest. NULL means not yet backfilled, and an unmatched ingest is reported rather than guessed.';

CREATE INDEX IF NOT EXISTS idx_ad_campaign_requests_platform_campaign
  ON ad_campaign_requests (platform_campaign_id)
  WHERE platform_campaign_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Provenance, so a stale number cannot pass for a fresh one.
-- ---------------------------------------------------------------------------
-- Deliberately NOT a CHECK constraint. The same argument as migration 224: a
-- rejected write on an ingest path fails somewhere nobody is watching, and the
-- set of sources will grow (the Google Ads API proper, once there is a manager
-- account and a developer token). A bad value here is a reporting nuisance; a
-- rejected metrics write means the dashboard silently keeps showing yesterday.
--
-- 'typed'  -- a human read the Google UI and typed it. Assume stale, possibly wrong.
-- 'script' -- a Google Ads Script posted it. Trust it to within Google's own
--             reporting lag, which is a few hours for cost and clicks.
-- NULL     -- predates this migration. Read exactly like 'typed'.

ALTER TABLE ad_campaign_requests
  ADD COLUMN IF NOT EXISTS metrics_source text;

ALTER TABLE city_campaigns
  ADD COLUMN IF NOT EXISTS metrics_source text;

COMMENT ON COLUMN ad_campaign_requests.metrics_source IS
  'Where ad_spend_cents/ad_clicks/ad_impressions came from: script (Google Ads Script), typed (hand-entered), NULL (predates provenance tracking -- treat as typed).';

COMMENT ON COLUMN city_campaigns.metrics_source IS
  'Where ad_spend_cents/ad_clicks/ad_impressions came from: script (Google Ads Script), typed (hand-entered), NULL (predates provenance tracking -- treat as typed).';

-- Everything already in these tables was typed by a human. Say so, rather than
-- leaving a NULL that a later reader has to guess at. metrics_updated_at is left
-- exactly as-is: where it is NULL the row was never even claimed to be current,
-- and inventing a timestamp here would manufacture a freshness that never existed.
UPDATE ad_campaign_requests
  SET metrics_source = 'typed'
  WHERE metrics_source IS NULL
    AND (ad_spend_cents IS NOT NULL OR ad_clicks IS NOT NULL OR ad_impressions IS NOT NULL);

UPDATE city_campaigns
  SET metrics_source = 'typed'
  WHERE metrics_source IS NULL
    AND (ad_spend_cents IS NOT NULL OR ad_clicks IS NOT NULL OR ad_impressions IS NOT NULL);
