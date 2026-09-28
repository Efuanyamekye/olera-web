-- A provider seeing, taking or passing on a family Olera offered them, from
-- the inbox (app/api/provider/ad-families). Viewed is the denominator, so the
-- take rate is takes over views, not over offers sent.
-- Keeps every existing value, including ones added on other branches.
DO $$
DECLARE existing_check text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_check FROM pg_constraint
  WHERE conrelid = 'public.provider_activity'::regclass
    AND conname = 'provider_activity_event_type_check';
  IF existing_check IS NULL THEN RAISE EXCEPTION 'Missing provider activity event constraint'; END IF;
  ALTER TABLE public.provider_activity DROP CONSTRAINT provider_activity_event_type_check;
  EXECUTE 'ALTER TABLE public.provider_activity ADD CONSTRAINT provider_activity_event_type_check CHECK (' ||
    regexp_replace(existing_check, '^CHECK \((.*)\)$', '\1') ||
    ' OR event_type IN (''ad_family_offer_viewed'', ''ad_family_taken'', ''ad_family_passed''))';
END $$;
