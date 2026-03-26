-- Migration: Add question_received event type to provider_activity
-- Allows tracking when questions are asked TO a provider (from any source: guest or authenticated)
-- question_responded already exists in the original CHECK constraint

-- Drop and recreate the CHECK constraint to add question_received
ALTER TABLE provider_activity DROP CONSTRAINT IF EXISTS provider_activity_event_type_check;
ALTER TABLE provider_activity ADD CONSTRAINT provider_activity_event_type_check
  CHECK (event_type IN (
    'email_click', 'page_view', 'lead_opened',
    'question_received', 'question_responded',
    'review_viewed'
  ));
