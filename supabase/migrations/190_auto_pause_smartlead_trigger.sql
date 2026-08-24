-- Migration: Auto-pause SmartLead trigger on claim
--
-- When a provider's stage changes to 'claimed', call the edge function
-- to pause them in SmartLead so they stop receiving sequence emails.
--
-- Requires pg_net extension (already enabled in Supabase).

-- Function that calls the edge function via HTTP
CREATE OR REPLACE FUNCTION notify_auto_pause_on_claim()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when stage changes TO 'claimed' (not already claimed)
  IF NEW.stage = 'claimed' AND (OLD.stage IS NULL OR OLD.stage != 'claimed') THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/auto-pause-smartlead-on-claim',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'provider_outreach_tracking',
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS auto_pause_smartlead_trigger ON provider_outreach_tracking;

-- Create trigger on UPDATE
CREATE TRIGGER auto_pause_smartlead_trigger
  AFTER UPDATE ON provider_outreach_tracking
  FOR EACH ROW
  EXECUTE FUNCTION notify_auto_pause_on_claim();

COMMENT ON FUNCTION notify_auto_pause_on_claim() IS
  'Calls edge function to pause SmartLead lead when provider claims';
