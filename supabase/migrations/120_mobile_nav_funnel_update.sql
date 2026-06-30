-- Migration: Update mobile nav variant funnel to include nav click metrics
--
-- Adds tracking for:
--   - families_clicked: Providers who clicked "Find Families" / "Families"
--   - hire_clicked: Providers who clicked "Hire Caregivers" / "Hire"
--
-- These metrics help determine if the bottom_tabs variant improves
-- discoverability of key actions compared to the hamburger menu.
--
-- Must DROP first because return type changed (added columns).

DROP FUNCTION IF EXISTS get_mobile_nav_variant_funnel(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_mobile_nav_variant_funnel(
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ
)
RETURNS TABLE (
  variant TEXT,
  impressions BIGINT,
  families_clicked BIGINT,
  hire_clicked BIGINT,
  questions_answered BIGINT,
  leads_connected BIGINT,
  reviews_shared BIGINT,
  boost_requested BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH variant_impressions AS (
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
    SELECT DISTINCT ON (provider_id)
      provider_id,
      variant
    FROM variant_impressions
    ORDER BY provider_id, impression_time DESC
  ),
  conversion_events AS (
    SELECT
      provider_id,
      event_type,
      created_at
    FROM provider_activity
    WHERE created_at >= from_date
      AND created_at < to_date
      AND event_type IN (
        'nav_families_clicked',
        'nav_hire_clicked',
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
    COUNT(DISTINCT CASE WHEN ce.event_type = 'nav_families_clicked' THEN pv.provider_id END) AS families_clicked,
    COUNT(DISTINCT CASE WHEN ce.event_type = 'nav_hire_clicked' THEN pv.provider_id END) AS hire_clicked,
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
