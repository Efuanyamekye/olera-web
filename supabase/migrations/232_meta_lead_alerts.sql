-- Durable Slack notifications, separate from lead import and family messages.
CREATE TABLE public.meta_lead_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('new_lead','import_failed','system_error')),
  receipt_id text REFERENCES public.meta_lead_receipts(leadgen_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text
);
ALTER TABLE public.meta_lead_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_lead_alerts FROM anon,authenticated;
GRANT ALL ON public.meta_lead_alerts TO service_role;
CREATE INDEX meta_lead_alerts_pending ON public.meta_lead_alerts(created_at) WHERE status='pending';
CREATE FUNCTION public.queue_meta_lead_alert() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (NEW.form_config->>'testOnly')::boolean IS DISTINCT FROM false THEN RETURN NEW; END IF;
  IF NEW.status='imported' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO meta_lead_alerts(event_key,kind,receipt_id) VALUES('lead:'||NEW.leadgen_id,'new_lead',NEW.leadgen_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.status='failed' AND NEW.attempts >= 3 THEN
    INSERT INTO meta_lead_alerts(event_key,kind,receipt_id) VALUES('failure:'||NEW.leadgen_id,'import_failed',NEW.leadgen_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER queue_meta_lead_alert AFTER UPDATE ON public.meta_lead_receipts FOR EACH ROW EXECUTE FUNCTION public.queue_meta_lead_alert();
