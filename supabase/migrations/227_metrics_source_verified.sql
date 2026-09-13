-- metrics_source gains a fourth value: `verified`.
--
-- Migration 225 recorded where ad figures came from so the provider-facing
-- receipt could withhold hand-typed ones. That was right -- Edmonds Villa's
-- August flight showed the provider $0.00 / 4 impressions against a real
-- $43.52 / 391 -- but it left no way back. A campaign the Google Ads Script
-- cannot reach (Meta, Nextdoor, or a Google flight with no
-- platform_campaign_id) was withheld permanently, even from an admin who had
-- the real numbers on screen.
--
-- `verified` is that way back. POST /api/admin/ad-boost now stamps it whenever
-- an admin writes ad_spend_cents / ad_clicks / ad_impressions: a human read
-- them off the ad platform and entered them deliberately, which is a different
-- claim from the historical `typed` rows nobody has re-checked. Both
-- provider-facing gates accept `script` and `verified` and withhold the rest
-- (lib/ad-boost/metrics-provenance.ts).
--
-- COMMENT ONLY. No data changes: the existing `typed` rows stay withheld,
-- which is the point -- re-entering one is exactly how it gets released. And
-- no CHECK constraint here, consistent with 224/225: this column is written by
-- an hourly script and by an admin route, and a CHECK that rejects a value
-- neither of them expects fails the write rather than the value.

COMMENT ON COLUMN ad_campaign_requests.metrics_source IS
  'Where ad_spend_cents/ad_clicks/ad_impressions came from: script (Google Ads Script), verified (admin read them off the ad platform and entered them by hand), typed (hand-entered before provenance tracking, never re-checked), NULL (predates tracking). Provider-facing surfaces show script + verified and withhold the rest.';

COMMENT ON COLUMN city_campaigns.metrics_source IS
  'Where ad_spend_cents/ad_clicks/ad_impressions came from: script (Google Ads Script), verified (admin read them off the ad platform and entered them by hand), typed (hand-entered before provenance tracking, never re-checked), NULL (predates tracking). Provider-facing surfaces show script + verified and withhold the rest.';
