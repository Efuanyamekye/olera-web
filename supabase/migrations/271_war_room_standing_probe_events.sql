-- Standing probe readings (lib/war-room/probes.server.ts STANDING_PROBE_IDS).
--
-- A probe used to run only when an open investigation named it, and its
-- answer hung off that investigation. The Benefits Finder is a priority, not a
-- condition: nothing ever asked about it, so the brief's Benefits line read
-- "No measured number moved" through a week of shipped Benefits work (TJ,
-- 2026-10-05). The scan now runs a standing Benefits probe daily and records
-- the reading as a probe_completed event with no investigation behind it.
--
-- Additive: every existing row keeps its investigation. The brief reads
-- probe_completed events by probe_id and never joins the investigation.
ALTER TABLE war_room_investigation_events
  ALTER COLUMN investigation_id DROP NOT NULL;

COMMENT ON COLUMN war_room_investigation_events.investigation_id IS
  'The condition this event belongs to. NULL for a standing probe reading: a daily measurement of a priority that no investigation asked for.';
