-- Fix Device Breakdown to capture both desktop and mobile traffic
--
-- The Device Breakdown section was using only dashboard_arrival events, which
-- missed most mobile traffic. This migration combines both event types:
--   - dashboard_arrival: captures desktop visits (and some mobile redirects)
--   - mobile_nav_variant_impression: captures mobile A/B test visits
--
-- Also filters out events without ua_class metadata to remove "unknown" noise.

DROP FUNCTION IF EXISTS get_provider_device_breakdown(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_provider_device_breakdown(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
)
RETURNS TABLE (
  ua_class TEXT,
  visit_count BIGINT,
  unique_providers BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    metadata->>'ua_class' AS ua_class,
    COUNT(*) AS visit_count,
    COUNT(DISTINCT provider_id) AS unique_providers
  FROM provider_activity
  WHERE created_at >= from_date
    AND created_at < to_date
    AND event_type IN ('dashboard_arrival', 'mobile_nav_variant_impression')
    AND metadata->>'ua_class' IS NOT NULL
  GROUP BY metadata->>'ua_class'
  ORDER BY visit_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_provider_device_breakdown(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
