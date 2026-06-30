-- 121_email_log_channel.sql
--
-- Add a `channel` column to email_log so it can hold SMS (and later WhatsApp)
-- sends, not just email. This is the foundation for care-seeker SMS:
--
--   1. Cross-channel frequency cap — the family nudge cap in lib/email.ts counts
--      governed rows in email_log over a rolling window. Logging SMS here (rather
--      than a separate table) means the SAME count query spans email + SMS, so a
--      family can't be hit with 3 emails AND 3 texts. The shared budget is free.
--   2. Observability — /admin/family-comms reads email_log. Logging SMS here makes
--      every text visible on the existing dashboard with no new query surface.
--
-- Existing rows are all email and backfill to 'email' via the DEFAULT.
--
-- Apply via Supabase dashboard (NOT CLI).

ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS channel TEXT
    CHECK (channel IN ('email', 'sms', 'whatsapp'))
    DEFAULT 'email';

-- Backfill is handled by the DEFAULT above for existing rows. Make it explicit
-- for any rows that somehow predate the default (no-op on a clean apply).
UPDATE email_log SET channel = 'email' WHERE channel IS NULL;

-- The cross-channel cap query filters on recipient + recipient_type='family' +
-- status='sent' + created_at window, then counts. A partial index on the family
-- send path keeps that count cheap as SMS volume grows.
CREATE INDEX IF NOT EXISTS idx_email_log_family_channel_sent
  ON email_log (recipient, created_at)
  WHERE recipient_type = 'family' AND status = 'sent';

COMMENT ON COLUMN email_log.channel IS
  'Delivery channel for this comms row: email (default), sms, or whatsapp. Lets email_log serve as the unified care-seeker comms log so the family nudge cap and /admin/family-comms span all channels. Set by sendEmail (email) and sendSMS (sms).';
