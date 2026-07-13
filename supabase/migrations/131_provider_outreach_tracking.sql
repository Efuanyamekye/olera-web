-- Migration: Provider Cold Outreach Tracking
--
-- Context: Admin system to track cold outreach to unclaimed providers, helping
-- them claim their accounts. This is structure-only — no email integration.
-- The workflow is city-centric: pick a state, see cities with unclaimed provider
-- counts, prepare providers (add emails), track progress through stages.
--
-- Stages:
--   not_contacted — Default. Unclaimed providers not yet in outreach
--   in_sequence   — Outreach started (marked, but no emails sent yet in v0)
--   needs_call    — Sequence done, didn't claim
--   called        — We called, ball in their court
--   claimed       — Success! (terminal)
--   not_interested — They declined (terminal)
--   archived      — Invalid, out of business, etc. (terminal)
--
-- Apply via Supabase dashboard (NOT CLI).

-- ============================================================================
-- 1. provider_outreach_tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_outreach_tracking (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- References olera-providers.provider_id (TEXT, not FK — separate logical DB)
  provider_id        TEXT NOT NULL UNIQUE,

  -- Current outreach stage
  stage              TEXT NOT NULL DEFAULT 'not_contacted'
    CHECK (stage IN (
      'not_contacted',
      'in_sequence',
      'needs_call',
      'called',
      'claimed',
      'not_interested',
      'archived'
    )),

  -- Denormalized for filtering (copied from olera-providers on insert)
  city               TEXT,
  state              TEXT,

  -- When the stage was last changed (for timing/analytics)
  stage_changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Free-form notes for admin context
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary query: filter by state + stage, order by city
CREATE INDEX IF NOT EXISTS idx_provider_outreach_tracking_state_stage
  ON provider_outreach_tracking (state, stage);

-- City-level grouping queries
CREATE INDEX IF NOT EXISTS idx_provider_outreach_tracking_city_state
  ON provider_outreach_tracking (city, state);

-- Provider lookup (unique constraint handles this, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_provider_outreach_tracking_provider_id
  ON provider_outreach_tracking (provider_id);

-- Service-role only (admin access via service client)
ALTER TABLE provider_outreach_tracking ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Auto-update updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_provider_outreach_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Also update stage_changed_at if stage changed
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_provider_outreach_tracking_updated_at
  BEFORE UPDATE ON provider_outreach_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_outreach_tracking_updated_at();
