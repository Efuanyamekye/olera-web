-- Which landing-page arm produced this request.
--
-- WHY A COLUMN RATHER THAN A JOIN. The arm IS already recoverable without this:
-- city_leads.session_id and growth_attribution_events.anonymous_id both come
-- from getOrCreateSessionId(), so the join is a clean 1:1 and it works. That is
-- not the reason for the column.
--
-- The reason is durability. Twice this week a growth event has been dropped in
-- silence — once because page_category had a CHECK that did not list
-- 'city_landing' (fixed by migration 216, after four days of a funnel that
-- looked empty), once because event_type had a CHECK that did not list the two
-- new funnel events (caught before shipping, migration 223). The tracker's
-- fetch swallows its own errors by design, so a dropped landing event leaves no
-- trace. If that happens again, a lead whose arm lives only in a growth row has
-- no arm at all, and the one number this experiment exists to produce —
-- completed submissions per arm — loses a row it cannot get back.
--
-- The second reason is that the Slack alert can then name the arm without a
-- lookup, so whoever picks up the call knows which page the family came through.
--
-- Nullable on purpose. Leads that predate the experiment have no arm and must
-- not be given a fake one: the single real city lead so far arrived 7 Sep, before
-- any of this existed. Read a NULL as "before the experiment", never as control.
--
-- Deliberately NOT a CHECK constraint. Arm names are product copy that will
-- change between flights, and a CHECK here would mean a migration every time an
-- arm is renamed — plus, per the two incidents above, a rejected insert on this
-- path fails silently. A bad value is a reporting nuisance; a rejected lead is
-- a lost family.

ALTER TABLE city_leads
  ADD COLUMN IF NOT EXISTS landing_arm text;

COMMENT ON COLUMN city_leads.landing_arm IS
  'A/B arm of /care/{city} that produced this request (providers_first, one_screen, guidance). NULL means the lead predates the experiment — never read NULL as control.';

-- The rollup groups by arm within a city over the flight window.
CREATE INDEX IF NOT EXISTS idx_city_leads_arm
  ON city_leads (slug, landing_arm, created_at DESC)
  WHERE is_test = false;
