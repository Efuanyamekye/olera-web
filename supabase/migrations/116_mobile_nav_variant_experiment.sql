-- Migration: mobile_nav_variant experiment seed
--
-- Context: Mobile navigation A/B test for provider dashboard. Tests
-- different mobile nav layouts (hamburger-only vs bottom tabs) to optimize
-- provider engagement on mobile devices.
--
-- This seeds the experiment_weights row for mobile_nav_variant. The current
-- variant (hamburger-only) starts at 100% — System 3 (UI implementation)
-- must be deployed before traffic is shifted to bottom_tabs.
--
-- Apply via Supabase dashboard (NOT CLI).

INSERT INTO experiment_weights (experiment_id, weights, version)
VALUES (
  'mobile_nav_variant',
  '{"current":100,"bottom_tabs":0}'::jsonb,
  1
)
ON CONFLICT (experiment_id) DO NOTHING;
