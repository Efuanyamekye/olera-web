-- Two new growth event types for the /care/{city} landing-page A/B test.
--
-- WHY A MIGRATION IS REQUIRED, AND WHAT HAPPENS WITHOUT ONE.
-- growth_attribution_events.event_type is a TEXT column with a CHECK listing
-- six allowed values (migration 174). An insert carrying anything else is
-- rejected, and the tracker in lib/analytics/growth-attribution.ts fires into
-- a fetch with .catch(() => {}) — so a rejected event disappears with no error
-- anywhere. This is the same failure mode as the city landing page itself:
-- page_category had a CHECK of ('provider','benefit','editorial') and every
-- /care/* event was silently dropped for four days until migration 216 added
-- 'city_landing'. During those four days a page that half-failed and a page
-- that converted badly looked identical.
--
--   question_viewed    Fired once per quiz screen actually shown, carrying
--                      {step} in metadata. cta_engaged and lead_started only
--                      bracket the quiz; they cannot tell a visitor who quit
--                      on question three from one who quit on question one.
--                      The fewer_questions arm is uninterpretable without it:
--                      if it wins we would not know which dropped question was
--                      the barrier, and if it loses we would not know whether
--                      the one remaining question was the problem.
--
--   provider_expanded  Fired when a visitor taps a provider card open on the
--                      providers_first arm. That arm's whole claim is that
--                      people want proof before they commit, and this is the
--                      only event that measures someone taking the proof
--                      without taking the ask.
--
-- Additive only: every existing value is preserved, so nothing already writing
-- to this table is affected.

ALTER TABLE growth_attribution_events
  DROP CONSTRAINT IF EXISTS growth_attribution_events_event_type_check;

ALTER TABLE growth_attribution_events
  ADD CONSTRAINT growth_attribution_events_event_type_check
  CHECK (event_type IN (
    'page_landed',
    'cta_visible',
    'cta_engaged',
    'lead_started',
    'lead_created',
    'contact_intent',
    'question_viewed',
    'provider_expanded'
  ));
