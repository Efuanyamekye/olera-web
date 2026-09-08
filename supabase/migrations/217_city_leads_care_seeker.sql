-- Migration: link a city lead to its care seeker profile
--
-- Context (2026-09-08): a city lead was a private row with no counterpart
-- anywhere in the product. It could not be opened, annotated or removed, and a
-- family who later inquired through a provider page became a second unrelated
-- record. The admin queue had no delete at all, which is how two loop-test
-- rows ended up sitting next to the pilot's first real family.
--
-- A care seeker is `business_profiles` with type='family', and it already
-- supports account_id NULL + claim_state='unclaimed' — a real profile with no
-- login. The city form's questions map onto it almost exactly, so leads now
-- create one (lib/city-ads/care-seeker.server.ts) and the admin queue links
-- straight through to /admin/care-seekers/{id}.
--
-- ON DELETE CASCADE is the point of the column, not a detail. Deleting the
-- care seeker on that page must also clear the lead; without the cascade the
-- profile would vanish and leave the lead behind in the queue pointing at a
-- dead link, which is worse than having no link.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

ALTER TABLE city_leads
  ADD COLUMN IF NOT EXISTS care_seeker_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS city_leads_care_seeker_idx ON city_leads (care_seeker_id);

COMMENT ON COLUMN city_leads.care_seeker_id IS
  'The business_profiles(type=family) row for this family. ON DELETE CASCADE: deleting the care seeker removes the lead, which is how the admin queue is cleared.';
