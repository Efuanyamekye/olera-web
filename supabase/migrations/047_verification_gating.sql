-- Migration: Add verification gating for suspicious claims
--
-- Adds 'not_required' to verification_state for high-trust providers who
-- don't need to go through verification gating.
--
-- State semantics:
-- - 'not_required': High trust (domain match) - no verification needed, full access
-- - 'unverified': Default / Low-medium trust - verification required to unlock features
-- - 'pending': Verification form submitted, awaiting review
-- - 'verified': Approved (auto or manual) - full access
-- - 'rejected': Rejected, can resubmit - still gated

-- 1. Update verification_state CHECK constraint to include 'not_required'
ALTER TABLE business_profiles
DROP CONSTRAINT IF EXISTS business_profiles_verification_state_check;

ALTER TABLE business_profiles
ADD CONSTRAINT business_profiles_verification_state_check
  CHECK (verification_state IN ('unverified', 'pending', 'verified', 'rejected', 'not_required'));

-- 2. Add event type for tracking unverified answers
-- IMPORTANT: Must include ALL existing event types from migration 044 + new ones
ALTER TABLE provider_activity DROP CONSTRAINT IF EXISTS provider_activity_event_type_check;
ALTER TABLE provider_activity ADD CONSTRAINT provider_activity_event_type_check
  CHECK (event_type IN (
    'email_click',
    'page_view',
    'lead_opened',
    'lead_received',
    'question_received',
    'question_responded',
    'review_viewed',
    'review_received',
    'one_click_access',
    'contact_revealed',
    'reviews_cta_clicked',
    'suspicious_claim',
    'search_click',
    'cta_click_public',
    'answered_before_verified'
  ));

-- Note: No backfill needed for existing providers.
-- - Existing claimed providers with 'unverified' state stay as-is
-- - Going forward, high trust claims will get 'not_required'
-- - Low/medium trust claims will stay 'unverified' (means verification required)
