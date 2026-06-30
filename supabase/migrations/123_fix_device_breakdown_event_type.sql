-- Fix Device Breakdown to use mobile_nav_variant_impression instead of dashboard_arrival
--
-- The Device Breakdown section was using dashboard_arrival events, which only fire
-- on specific redirects (e.g., ?from=qa-success). This meant mobile users weren't
-- being counted since they don't trigger dashboard_arrival.
--
-- This migration updates the function to use mobile_nav_variant_impression events,
-- which correctly capture all mobile provider dashboard visits for the A/B test.

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
    COALESCE(metadata->>'ua_class', 'unknown') AS ua_class,
    COUNT(*) AS visit_count,
    COUNT(DISTINCT provider_id) AS unique_providers
  FROM provider_activity
  WHERE created_at >= from_date
    AND created_at < to_date
    AND event_type = 'mobile_nav_variant_impression'
  GROUP BY COALESCE(metadata->>'ua_class', 'unknown')
  ORDER BY visit_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_provider_device_breakdown(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
