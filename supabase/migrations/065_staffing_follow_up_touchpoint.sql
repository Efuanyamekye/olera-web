-- Migration: Add follow_up_email_sent touchpoint type
--
-- Extends the staffing_touchpoints type CHECK constraint to include
-- the follow-up reminder email sent after 5 business days of no response.
--
-- Apply via Supabase dashboard (NOT CLI), per project convention.

-- Drop the existing constraint and add updated one with new type
ALTER TABLE staffing_touchpoints
  DROP CONSTRAINT IF EXISTS staffing_touchpoints_type_check;

ALTER TABLE staffing_touchpoints
  ADD CONSTRAINT staffing_touchpoints_type_check CHECK (type IN (
    -- pre-call channels
    'research_completed',
    'pre_call_email_sent',
    'follow_up_email_sent',
    'contact_form_submitted',
    'fax_sent',
    'mail_sent',

    -- calls
    'call_no_answer',
    'call_voicemail',
    'call_wrong_number',
    'call_connected_no_consent',
    'call_connected_consent',
    'call_not_interested',
    'manual_dnc',

    -- automated emails (sequence steps)
    'email_pre_consent_a_sent',
    'email_pre_consent_b_sent',
    'email_post_consent_step1_sent',
    'email_post_consent_step2_sent',
    'email_post_consent_step3_sent',
    'email_post_consent_step4_sent',
    'email_post_consent_step5_sent',
    'email_welcome_sent',
    'email_new_student_trigger_sent',

    -- email lifecycle
    'email_opened',
    'email_clicked',
    'email_bounced',

    -- system events
    'reply_received',
    'system_activated',
    'system_enrolled',
    'system_auto_dnc'
  ));
