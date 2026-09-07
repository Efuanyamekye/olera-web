-- One durable attempt per claimed provider; never overwrite notification preferences.
BEGIN;
CREATE OR REPLACE FUNCTION public.reserve_verification_reminder(
  p_profile_id uuid, p_email text, p_dry_run boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p public.business_profiles%ROWTYPE; log_id uuid;
BEGIN
  SELECT * INTO p FROM business_profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR p.type NOT IN ('organization', 'caregiver') OR p.account_id IS NULL
    OR p.verification_state IS DISTINCT FROM 'unverified'
    OR p.claimed_at IS NULL OR p.claimed_at > now() - interval '21 days'
    OR p.email IS NULL OR p.email IS DISTINCT FROM p_email
    OR p.metadata->>'verification_reminder_21d_attempt_id' IS NOT NULL
    OR p.metadata->>'verification_reminder_21d_sent' = 'true'
    OR p.metadata->>'admin_archived' = 'true'
  THEN RETURN NULL; END IF;
  -- Digest uses the recipient address. Also cover historical provider identifiers.
  IF EXISTS (SELECT 1 FROM email_log e
    WHERE e.email_type = 'weekly_analytics_digest'
      AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND (lower(e.recipient) = lower(p.email) OR e.provider_id IN (p.id::text, p.slug, p.source_provider_id))
      AND e.status NOT IN ('failed', 'suppressed')
      AND (e.resend_id IS NOT NULL OR e.status IN ('sent','delivered','opened','clicked'))
      AND coalesce(e.error_message, '') !~* '^(suppressed:|skipped:)'
  ) THEN RETURN NULL; END IF;
  -- Read-only eligibility probe: the profile UUID is a sentinel, not an email ID.
  IF p_dry_run THEN RETURN p.id; END IF;
  INSERT INTO email_log (recipient, subject, email_type, recipient_type, provider_id, status)
  VALUES (p.email, 'Complete verification for ' || coalesce(p.display_name, 'your organization'),
    'verification_reminder_21d', 'provider', p.id::text, 'pending') RETURNING id INTO log_id;
  UPDATE business_profiles SET metadata = coalesce(metadata, '{}'::jsonb) ||
    jsonb_build_object('verification_reminder_21d_attempt_id', log_id, 'verification_reminder_21d_attempted_at', now())
    WHERE id = p_profile_id;
  RETURN log_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_verification_reminder(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_verification_reminder(uuid,text,boolean) TO service_role;
INSERT INTO cron_config (job_id, enabled, paused_reason, paused_until)
VALUES ('verification-reminders', false, 'Awaiting verification reminder preview QA and rollout review', NULL)
ON CONFLICT (job_id) DO UPDATE SET enabled = false, paused_reason = EXCLUDED.paused_reason, paused_until = NULL;
COMMIT;
