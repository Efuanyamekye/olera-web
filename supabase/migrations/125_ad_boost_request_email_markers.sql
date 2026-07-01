-- Provider Ad Boost request emails.
--
-- Each campaign request can trigger up to three provider emails:
-- 1. pending_profile confirmation (queued, profile/verification work remains)
-- 2. requested confirmation (launch-ready request received)
-- 3. promotion confirmation (queued request became launch-ready)
--
-- These timestamps are the durable idempotency markers used by the server route
-- before sending, so retries / double-clicks / GET promotion races do not
-- duplicate provider mail.

ALTER TABLE ad_campaign_requests
  ADD COLUMN IF NOT EXISTS queued_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promotion_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN ad_campaign_requests.queued_email_sent_at IS
  'Set when the pending-profile Ad Boost queued email is reserved for this request.';
COMMENT ON COLUMN ad_campaign_requests.requested_email_sent_at IS
  'Set when the launch-ready Ad Boost request confirmation email is reserved for this request.';
COMMENT ON COLUMN ad_campaign_requests.promotion_email_sent_at IS
  'Set when a pending-profile Ad Boost request promotion email is reserved for this request.';
