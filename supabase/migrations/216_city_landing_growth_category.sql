-- 216: allow city ad landing pages into growth_attribution_events.
--
-- /care/{city} is a noindex, paid-only landing page for Olera-owned city ad
-- campaigns. It needs the same page_landed -> lead_started funnel the provider
-- and benefit pages have, otherwise a flight's only observable output is
-- "leads or no leads" and a page that half-fails is indistinguishable from a
-- page that converts badly.
--
-- Deliberately scoped to growth_attribution_events ONLY. growth_page_metrics
-- (migration 173) is the weekly ORGANIC snapshot behind /metrics, and paid city
-- traffic must never enter it. classifyOrganicPage() is likewise left alone for
-- the same reason -- the city page passes its category explicitly instead.
--
-- Run in the Supabase dashboard SQL editor (not the CLI).

alter table public.growth_attribution_events
  drop constraint if exists growth_attribution_events_page_category_check;

alter table public.growth_attribution_events
  add constraint growth_attribution_events_page_category_check
  check (page_category in ('provider', 'benefit', 'editorial', 'city_landing'));
