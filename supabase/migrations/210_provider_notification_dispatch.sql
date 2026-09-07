-- One durable attempt per provider. A worker crash leaves a visible pending
-- email, never an hourly resend loop. Failed/uncertain attempts require review.
BEGIN;
CREATE OR REPLACE FUNCTION public.reserve_notification_nudge(p_profile_id uuid, p_email text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p public.business_profiles%ROWTYPE; log_id uuid;
BEGIN
  SELECT * INTO p FROM business_profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR p.type <> 'organization' OR p.account_id IS NULL OR p.email IS NULL
    OR p.email IS DISTINCT FROM p_email
    OR p.metadata->>'notification_nudge_attempt_id' IS NOT NULL
    OR p.metadata->>'notification_nudge_sent' = 'true'
    OR p.metadata->>'admin_archived' = 'true'
    OR p.metadata->'notification_prefs'->'new_leads'->>'sms' = 'true'
  THEN RETURN NULL; END IF;
  INSERT INTO email_log (recipient, subject, email_type, recipient_type, provider_id, status)
  VALUES (p.email, 'Never miss a family inquiry', 'notification_setup_nudge', 'provider', p.id::text, 'pending')
  RETURNING id INTO log_id;
  UPDATE business_profiles SET metadata = COALESCE(metadata, '{}'::jsonb) ||
    jsonb_build_object('notification_nudge_attempt_id', log_id, 'notification_nudge_attempted_at', now())
    WHERE id = p_profile_id;
  RETURN log_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_notification_nudge(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_notification_nudge(uuid,text) TO service_role;

-- Paused until template/link QA and migration verification are complete.
INSERT INTO cron_config (job_id, enabled, paused_reason)
VALUES ('notification-setup-nudge', false, 'Awaiting SMS default-policy decision and preview QA')
ON CONFLICT (job_id) DO UPDATE SET enabled = false, paused_reason = EXCLUDED.paused_reason;
COMMIT;
