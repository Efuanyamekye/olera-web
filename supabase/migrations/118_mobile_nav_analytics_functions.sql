-- Mobile Nav Analytics Functions
-- Provides device breakdown and variant funnel metrics for admin analytics

-- 1. Device breakdown: Count provider dashboard visits by device type (ua_class)
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
    AND event_type = 'dashboard_arrival'
  GROUP BY COALESCE(metadata->>'ua_class', 'unknown')
  ORDER BY visit_count DESC;
$$;

-- 2. Variant funnel: Track conversions by mobile nav variant
-- Links variant impressions to downstream actions within same session window (24h)
CREATE OR REPLACE FUNCTION get_mobile_nav_variant_funnel(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
)
RETURNS TABLE (
  variant TEXT,
  impressions BIGINT,
  questions_answered BIGINT,
  leads_connected BIGINT,
  reviews_shared BIGINT,
  boost_requested BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH variant_impressions AS (
    -- Get all mobile nav variant impressions with their variant
    SELECT
      provider_id,
      metadata->>'variant' AS variant,
      created_at AS impression_time
    FROM provider_activity
    WHERE created_at >= from_date
      AND created_at < to_date
      AND event_type = 'mobile_nav_variant_impression'
      AND metadata->>'variant' IS NOT NULL
  ),
  provider_variants AS (
    -- Get the most recent variant each provider saw (for attribution)
    SELECT DISTINCT ON (provider_id)
      provider_id,
      variant
    FROM variant_impressions
    ORDER BY provider_id, impression_time DESC
  ),
  conversion_events AS (
    -- Get all conversion events in the window
    SELECT
      provider_id,
      event_type,
      created_at
    FROM provider_activity
    WHERE created_at >= from_date
      AND created_at < to_date
      AND event_type IN (
        'question_responded',
        'continue_in_inbox',
        'phone_clicked',
        'email_link_clicked',
        'reviews_cta_clicked',
        'managed_ads_requested'
      )
  )
  SELECT
    pv.variant,
    COUNT(DISTINCT vi.provider_id) AS impressions,
    COUNT(DISTINCT CASE WHEN ce.event_type = 'question_responded' THEN pv.provider_id END) AS questions_answered,
    COUNT(DISTINCT CASE WHEN ce.event_type IN ('continue_in_inbox', 'phone_clicked', 'email_link_clicked') THEN pv.provider_id END) AS leads_connected,
    COUNT(DISTINCT CASE WHEN ce.event_type = 'reviews_cta_clicked' THEN pv.provider_id END) AS reviews_shared,
    COUNT(DISTINCT CASE WHEN ce.event_type = 'managed_ads_requested' THEN pv.provider_id END) AS boost_requested
  FROM provider_variants pv
  LEFT JOIN variant_impressions vi ON vi.provider_id = pv.provider_id AND vi.variant = pv.variant
  LEFT JOIN conversion_events ce ON ce.provider_id = pv.provider_id
  GROUP BY pv.variant
  ORDER BY impressions DESC;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_provider_device_breakdown(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mobile_nav_variant_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
