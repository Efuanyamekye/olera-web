-- 122_sms_queue.sql
--
-- Deferred-send queue for care-seeker SMS that lands outside the recipient's
-- quiet-hours window (8am–8pm local; see lib/sms/quiet-hours.ts). A reactive
-- reply-alert that fires at 11pm is enqueued with send_after = next 8am local,
-- and the sms-queue-flush cron delivers it when due. The family still gets the
-- email immediately; the SMS just waits for a civil hour.
--
-- Reactive reply-alerts are transactional (cap-exempt), so this queue is a
-- timing buffer, not a frequency gate — the per-day safety throttle and the
-- opted-out check are re-evaluated at flush time.
--
-- Apply via Supabase dashboard (NOT CLI).

CREATE TABLE IF NOT EXISTS sms_queue (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone           TEXT NOT NULL,                    -- E.164 destination
  body               TEXT NOT NULL,                    -- rendered SMS body (stable link, no magic link)
  email_type         TEXT NOT NULL,                    -- maps to channel-policy + email_log.email_type
  recipient_type     TEXT,                             -- 'family' for care-seeker alerts
  family_profile_id  UUID,                             -- business_profiles.id, for opt-out re-check at flush
  send_after         TIMESTAMPTZ NOT NULL,             -- becomes eligible at this instant
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at            TIMESTAMPTZ
);

-- The flush cron selects pending rows whose send_after has passed, oldest first.
CREATE INDEX IF NOT EXISTS idx_sms_queue_due
  ON sms_queue (send_after)
  WHERE status = 'pending';

ALTER TABLE sms_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sms_queue"
  ON sms_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE sms_queue IS
  'Deferred-send queue for care-seeker SMS held by quiet hours. Enqueued by lib/sms/reactive-alerts.ts when a send lands outside 8am-8pm recipient-local; drained by the sms-queue-flush cron. opted-out + per-day throttle are re-checked at flush.';
