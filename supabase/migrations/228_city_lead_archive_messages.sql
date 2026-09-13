-- Preserve lead attribution/history while closing work and queued messages.
ALTER TABLE public.city_leads ADD COLUMN archived_at timestamptz;
ALTER TABLE public.city_leads ADD COLUMN archive_reason text;
ALTER TABLE public.city_leads ADD COLUMN archived_by text;

CREATE TABLE public.city_lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.city_leads(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  body text NOT NULL,
  subject text,
  send_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  completed_at timestamptz,
  last_error text
);
ALTER TABLE public.city_lead_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX city_lead_messages_due ON public.city_lead_messages(send_after) WHERE status = 'pending';
CREATE UNIQUE INDEX city_lead_messages_pending ON public.city_lead_messages(lead_id, channel) WHERE status IN ('pending','sending');

-- An archived lead cannot be reopened accidentally by an old offer or reply.
CREATE FUNCTION public.city_lead_archive_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL THEN
    IF NEW.status <> 'stopped' THEN RAISE EXCEPTION 'Lead is archived'; END IF;
    NEW.archived_at := OLD.archived_at;
    NEW.archive_reason := OLD.archive_reason;
    NEW.archived_by := OLD.archived_by;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN
    NEW.status := 'stopped';
    NEW.next_offer_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER city_lead_archive_guard BEFORE UPDATE ON public.city_leads FOR EACH ROW EXECUTE FUNCTION public.city_lead_archive_guard();

CREATE FUNCTION public.city_lead_archive_cleanup() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    UPDATE city_lead_messages SET status='canceled', completed_at=now(), last_error='Lead archived'
      WHERE lead_id=NEW.id AND status='pending';
    UPDATE sms_queue SET status='canceled', last_error='City lead archived'
      WHERE status='pending' AND right(regexp_replace(to_phone,'[^0-9]','','g'),10)=right(regexp_replace(NEW.phone,'[^0-9]','','g'),10);
    UPDATE city_lead_offers SET expired_at=now(), expires_at=now()
      WHERE lead_id=NEW.id AND accepted_at IS NULL AND declined_at IS NULL AND expired_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER city_lead_archive_cleanup AFTER UPDATE ON public.city_leads FOR EACH ROW EXECUTE FUNCTION public.city_lead_archive_cleanup();

-- Both the manual blocklist and SMS webhook use this table. Propagate existing
-- and future opt-outs so the city queue never keeps displaying an active lead.
CREATE FUNCTION public.city_lead_apply_optout() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE city_leads SET archived_at=now(), archive_reason='opted_out', archived_by='do_not_contact', updated_at=now()
    WHERE archived_at IS NULL AND (
      (NEW.phone IS NOT NULL AND right(regexp_replace(phone,'[^0-9]','','g'),10)=right(regexp_replace(NEW.phone,'[^0-9]','','g'),10))
      OR (NEW.email IS NOT NULL AND lower(trim(email))=lower(trim(NEW.email)))
    );
  RETURN NEW;
END $$;
CREATE TRIGGER city_lead_apply_optout AFTER INSERT OR UPDATE ON public.do_not_contact FOR EACH ROW EXECUTE FUNCTION public.city_lead_apply_optout();
UPDATE public.city_leads l SET archived_at=now(), archive_reason='opted_out', archived_by='do_not_contact', updated_at=now()
 WHERE archived_at IS NULL AND EXISTS (SELECT 1 FROM public.do_not_contact d WHERE
 (d.phone IS NOT NULL AND right(regexp_replace(l.phone,'[^0-9]','','g'),10)=right(regexp_replace(d.phone,'[^0-9]','','g'),10))
 OR (d.email IS NOT NULL AND lower(trim(l.email))=lower(trim(d.email))));

CREATE FUNCTION public.city_message_open_lead() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE l city_leads;
BEGIN
  SELECT * INTO STRICT l FROM city_leads WHERE id=NEW.lead_id FOR UPDATE;
  IF l.archived_at IS NOT NULL OR l.status='stopped' THEN
    RAISE EXCEPTION 'Lead is archived';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER city_message_open_lead BEFORE INSERT ON public.city_lead_messages FOR EACH ROW EXECUTE FUNCTION public.city_message_open_lead();

CREATE TRIGGER city_offer_open_lead BEFORE INSERT ON public.city_lead_offers FOR EACH ROW EXECUTE FUNCTION public.city_message_open_lead();

CREATE FUNCTION public.city_lead_initial_optout() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM do_not_contact d WHERE
    (d.phone IS NOT NULL AND right(regexp_replace(NEW.phone,'[^0-9]','','g'),10)=right(regexp_replace(d.phone,'[^0-9]','','g'),10))
    OR (d.email IS NOT NULL AND lower(trim(NEW.email))=lower(trim(d.email)))) THEN
    NEW.archived_at := now(); NEW.archive_reason := 'opted_out';
    NEW.archived_by := 'do_not_contact'; NEW.status := 'stopped'; NEW.next_offer_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER city_lead_initial_optout BEFORE INSERT ON public.city_leads FOR EACH ROW EXECUTE FUNCTION public.city_lead_initial_optout();
