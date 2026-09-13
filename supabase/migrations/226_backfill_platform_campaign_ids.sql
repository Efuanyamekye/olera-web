-- Backfill the Google campaign ID onto every provider flight that has one.
--
-- Until this runs, migration 225's join column is empty, so every campaign the
-- metrics script posts comes back `unmatched` and nothing is written. That is
-- the designed behaviour -- the ingest route refuses to guess -- but it means
-- this file is what actually switches the sync on.
--
-- WHERE THESE IDS COME FROM. Read out of the live Google Ads account
-- (419-933-1442) on 2026-09-11 by a Google Ads Script, which returned all 19
-- campaigns with their IDs, names and 30-day stats. They are transcribed here
-- from that run, not from admin_note prose.
--
-- HOW THE MAPPING WAS MADE, AND WHY IT IS NOT A NAME MATCH. Each Google campaign
-- is named "<Provider> - <City> - <Month Year>", and each row below was matched
-- on provider + city + month having exactly ONE candidate in
-- ad_campaign_requests. Checked before writing: 17 mappings, 17 distinct
-- campaign IDs, 17 distinct tags, every tag present in the table. The "90d"
-- infix in some tags is our own flight-length convention and has no counterpart
-- in the Google name -- it is not evidence of a mismatch.
--
-- Note the tags are NOT derivable from the Google names by any rule: compare
-- "Franchil - Killeen - Aug 2026" -> franchil-killeen-90d-aug26 against
-- "Edmonds Villa AFH - Edmonds - Aug 2026" -> edmonds-villa-edmonds-aug26.
-- One takes the 90d infix, the other does not. This is exactly why the ingest
-- route reports unmatched campaigns instead of fuzzy-matching them: a rule that
-- looked right would have attached one provider's spend to another's row.

UPDATE ad_campaign_requests SET platform_campaign_id = '23961292547' WHERE campaign_tag = 'franchil-killeen-jun26';
UPDATE ad_campaign_requests SET platform_campaign_id = '23981427299' WHERE campaign_tag = 'abode-merrillville-jun26';
UPDATE ad_campaign_requests SET platform_campaign_id = '23998344651' WHERE campaign_tag = 'miracle-lightstar-cleveland-jul26';
UPDATE ad_campaign_requests SET platform_campaign_id = '23998367469' WHERE campaign_tag = 'impact-houston-jul26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24052308622' WHERE campaign_tag = 'homewell-oak-ridge-jul26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24062146484' WHERE campaign_tag = 'legacy-haven-harrisburg-jul26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24072567829' WHERE campaign_tag = 'pacesetter-dallas-ga-jul26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24094557242' WHERE campaign_tag = 'edmonds-villa-edmonds-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24126008389' WHERE campaign_tag = 'rosemonte-phoenix-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24145321901' WHERE campaign_tag = 'lumiwell-fresno-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24151612515' WHERE campaign_tag = 'miracle-lightstar-cleveland-90d-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24162206362' WHERE campaign_tag = 'graceful-concord-90d-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24166094865' WHERE campaign_tag = 'franchil-killeen-90d-aug26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24176699440' WHERE campaign_tag = 'edmonds-villa-edmonds-90d-sep26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24218215574' WHERE campaign_tag = 'assisting-hands-dallas-sep26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24218593406' WHERE campaign_tag = 'pacesetter-dallas-ga-90d-sep26';
UPDATE ad_campaign_requests SET platform_campaign_id = '24223523008' WHERE campaign_tag = 'happy-mountain-fort-lauderdale-sep26';

-- ---------------------------------------------------------------------------
-- DELIBERATELY LEFT UNMAPPED
-- ---------------------------------------------------------------------------
-- homewell-oak-ridge-aug26  (ended, 2026-08-10 -> 2026-08-23)
--   THE ONE REAL AMBIGUITY. Google holds exactly one HomeWell campaign,
--   "HomeWell East Tennessee - Oak Ridge - Jul 2026" (24052308622), but
--   ad_campaign_requests holds two HomeWell flights, July and August. Either the
--   August flight reused the July campaign -- in which case 24052308622's stats
--   span both and belong cleanly to neither -- or its campaign was deleted from
--   Google. Mapping it to the July ID would silently double-count that spend
--   across two provider rows. Needs a human to look at the campaign's change
--   history and decide; until then a NULL is the honest answer.
--
-- graceful-concord-nextdoor-aug26
--   Nextdoor, not Google. Correctly has no Google campaign ID. When Nextdoor
--   metrics are synced they will need their own platform and their own ingest.
--
-- hoop-pascagoula-sep26  (live, starts 2026-09-15)
--   Flight has not started; no Google campaign exists to point at yet. Map it
--   when it is built.
--
-- Four rows carry campaign_tag = NULL. They are status 'requested' and were
-- never launched, so there is nothing to join them to.
