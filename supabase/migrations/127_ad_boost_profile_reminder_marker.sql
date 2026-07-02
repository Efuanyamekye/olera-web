-- Provider Ad Boost queued-profile reminder.
--
-- A provider can queue Ad Boost before their page is launch-ready. This marker
-- makes the follow-up reminder idempotent: if the request is still
-- pending_profile after the quiet window, the daily cron can nudge once without
-- duplicating sends on retries or manual re-runs.

ALTER TABLE ad_campaign_requests
  ADD COLUMN IF NOT EXISTS profile_reminder_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN ad_campaign_requests.profile_reminder_email_sent_at IS
  'Set when the queued-profile Ad Boost reminder email is reserved for this request.';
