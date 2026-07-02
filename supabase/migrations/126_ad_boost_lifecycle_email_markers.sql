-- Provider Ad Boost lifecycle emails.
--
-- These timestamps are durable idempotency markers for provider-facing managed
-- ads lifecycle notifications after the initial request:
-- 1. campaign launched
-- 2. early traction / performance update
-- 3. starter promo complete / budget discussion

ALTER TABLE ad_campaign_requests
  ADD COLUMN IF NOT EXISTS launched_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS traction_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promo_complete_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN ad_campaign_requests.launched_email_sent_at IS
  'Set when the campaign-launched Ad Boost email is reserved for this request.';
COMMENT ON COLUMN ad_campaign_requests.traction_email_sent_at IS
  'Set when the early-traction Ad Boost performance email is reserved for this request.';
COMMENT ON COLUMN ad_campaign_requests.promo_complete_email_sent_at IS
  'Set when the starter-promo-complete Ad Boost email is reserved for this request.';
