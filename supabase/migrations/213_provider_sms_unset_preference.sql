-- Preserve existing delivery while recording an explicit first SMS choice.
-- No preference backfill and no automation activation.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_notification_preference(
  p_profile_id uuid, p_account_id uuid, p_kind text, p_key text, p_channel text,
  p_enabled boolean, p_email_log_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  profile public.business_profiles%ROWTYPE;
  meta jsonb;
  prefs jsonb;
  previous boolean;
  linked_email uuid;
  linked_type text;
  valid_pref boolean := false;
BEGIN
  SELECT * INTO profile FROM business_profiles
    WHERE id = p_profile_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not owned' USING ERRCODE = '22023'; END IF;
  IF p_kind NOT IN ('view', 'save', 'whatsapp') THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE = '22023'; END IF;
  meta := COALESCE(profile.metadata, '{}'::jsonb);
  prefs := COALESCE(meta->'notification_prefs', '{}'::jsonb);

  IF p_kind = 'save' THEN
    valid_pref := CASE profile.type
      WHEN 'organization' THEN (p_key = 'new_leads' AND p_channel IN ('email','sms','whatsapp'))
        OR (p_key = 'reviews_and_questions' AND p_channel = 'email')
        OR (p_key = 'messages' AND p_channel IN ('email','whatsapp'))
      WHEN 'family' THEN (p_key IN ('messages_and_responses','match_updates') AND p_channel IN ('email','whatsapp'))
        OR (p_key = 'followup_reviews' AND p_channel = 'email')
      WHEN 'caregiver' THEN p_key IN ('interview_requests','application_updates') AND p_channel = 'email'
      WHEN 'student' THEN p_key IN ('interview_requests','application_updates') AND p_channel = 'email'
      ELSE false END;
    IF valid_pref IS NOT TRUE OR p_enabled IS NULL THEN
      RAISE EXCEPTION 'Invalid preference' USING ERRCODE = '22023';
    END IF;
    previous := COALESCE((prefs->p_key->>p_channel)::boolean,
      CASE WHEN p_channel = 'whatsapp' THEN COALESCE((meta->>'whatsapp_opted_in')::boolean, false)
      ELSE p_channel = 'email' END);
    -- Unset provider SMS is distinct from an explicit opt-out.
    IF profile.type = 'organization' AND p_key = 'new_leads' AND p_channel = 'sms'
      AND jsonb_typeof(prefs->p_key->p_channel) IS DISTINCT FROM 'boolean' THEN
      previous := NULL;
    END IF;
    -- Row lock plus a fresh JSON merge prevents stale clients dropping another
    -- channel, opt-out or onboarding flag. No event for an unchanged value.
    IF previous = p_enabled THEN RETURN jsonb_build_object('changed', false); END IF;
    prefs := prefs || jsonb_build_object(p_key,
      COALESCE(prefs->p_key, '{}'::jsonb) || jsonb_build_object(p_channel, p_enabled));
    UPDATE business_profiles SET metadata = meta || jsonb_build_object('notification_prefs', prefs),
      updated_at = now() WHERE id = p_profile_id;
  END IF;

  IF p_kind = 'whatsapp' THEN
    IF profile.phone IS NULL OR profile.type NOT IN ('organization', 'family') THEN
      RAISE EXCEPTION 'WhatsApp unavailable' USING ERRCODE = '22023';
    END IF;
    previous := COALESCE((meta->>'whatsapp_opted_in')::boolean, false);
    IF previous THEN RETURN jsonb_build_object('changed', false); END IF;
    p_key := 'whatsapp_opt_in'; p_channel := 'whatsapp'; p_enabled := true;
    UPDATE business_profiles SET metadata = meta ||
      jsonb_build_object('whatsapp_opted_in', true, 'whatsapp_opted_in_at', now()),
      updated_at = now() WHERE id = p_profile_id;
  END IF;

  -- Email ID alone is not authorization or proof of attribution: bind it to
  -- this profile and a dispatched onboarding message within seven days.
  SELECT id, email_type INTO linked_email, linked_type FROM email_log
    WHERE id = p_email_log_id AND recipient_type = 'provider' AND channel = 'email'
      AND provider_id IN (profile.id::text, profile.slug, profile.source_provider_id)
      AND email_type IN ('provider_welcome', 'profile_preview_nudge', 'notification_setup_nudge')
      AND created_at <= now() AND created_at >= now() - interval '7 days'
      AND status NOT IN ('failed', 'pending')
      AND (resend_id IS NOT NULL OR delivered_at IS NOT NULL)
      AND COALESCE(error_message, '') !~* '^(suppressed:|skipped:|nudge_cap)';
  IF profile.type = 'organization' THEN
    INSERT INTO provider_activity (provider_id, event_type, email_log_id, email_type, metadata)
    VALUES (COALESCE(profile.slug, profile.id::text),
      CASE WHEN p_kind = 'view' THEN 'notification_settings_viewed' ELSE 'notification_preference_saved' END,
      linked_email, linked_type,
      jsonb_build_object('source', 'notification_settings', 'key', p_key, 'channel', p_channel,
        'enabled', p_enabled, 'previous', previous, 'attribution', CASE WHEN linked_email IS NOT NULL THEN 'email_link' ELSE 'none' END));
  END IF;
  RETURN jsonb_build_object('changed', p_kind <> 'view');
END $$;
REVOKE ALL ON FUNCTION public.save_notification_preference(uuid,uuid,text,text,text,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_notification_preference(uuid,uuid,text,text,text,boolean,uuid) TO service_role;
COMMIT;
