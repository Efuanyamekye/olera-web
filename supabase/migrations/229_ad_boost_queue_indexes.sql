-- Scoped Ad Boost reads. These indexes match the JSON text expressions used
-- by PostgREST, rather than indexing the entire metadata document.
-- Apply through the normal migration process before measuring the preview.
-- For large live tables, schedule index creation or execute equivalent CREATE
-- INDEX CONCURRENTLY statements outside a migration transaction.
CREATE INDEX IF NOT EXISTS idx_provider_activity_managed_campaign_event
  ON provider_activity ((metadata->>'utm_campaign'), event_type, id)
  WHERE metadata->>'utm_source' = 'olera_managed';

CREATE INDEX IF NOT EXISTS idx_seeker_activity_managed_campaign_event
  ON seeker_activity ((metadata->>'utm_campaign'), event_type, id)
  WHERE metadata->>'utm_source' = 'olera_managed';

CREATE INDEX IF NOT EXISTS idx_email_log_campaign_request_type
  ON email_log ((metadata->>'request_id'), email_type, created_at DESC, id)
  WHERE metadata->>'request_id' IS NOT NULL;

-- The existing similarly named index uses provider_identity_key, whereas the
-- admin reader accepts legacy slugs and profile IDs through provider_id.
CREATE INDEX IF NOT EXISTS idx_provider_question_asks_provider_id_created
  ON provider_question_asks (provider_id, created_at, id);
