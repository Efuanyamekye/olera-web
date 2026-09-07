-- Migration: Provider Growth Tracking System
--
-- Context (2026-09-07): Tracks claimed providers through their lifecycle from
-- initial claim through verification, profile completion, pitch meetings, and
-- conversion to paying customers. Complements existing systems:
--   - /admin/verification - handles approval/rejection workflow
--   - /admin/provider-outreach - cold outreach to unclaimed providers
--   - /admin/city-broadcasts - automated broadcasts to qualified providers
--   - /admin/medjobs - student hiring platform
--
-- Provider Growth picks up AFTER a provider claims and guides them toward
-- becoming a paying customer. Key insight: dual-track conversion - a provider
-- can convert to Ads AND MedJobs simultaneously.
--
-- Two tables:
--   provider_growth_tracking   - One row per claimed provider. Pipeline stage
--                                tracks sales process (new → meeting → pitched).
--                                Ads and MedJobs status track independent
--                                conversion paths.
--   provider_growth_touchpoints - Audit log of all touchpoints (stage changes,
--                                 meetings, pitches, notes).

CREATE TABLE IF NOT EXISTS provider_growth_tracking (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id        UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,

  -- Pipeline stage (sales process position)
  -- new_claim → meeting_scheduled → pitched → not_interested
  pipeline_stage             TEXT NOT NULL DEFAULT 'new_claim',
  pipeline_stage_changed_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Source attribution (from provider_activity.claim_completed.metadata.source)
  -- Values: 'cold_outreach' (default), 'city_broadcast', 'email', 'page',
  --         'lead_email', 'completion_email', 'instant_claim', 'new_org_signup'
  claim_source               TEXT,
  claimed_at                 TIMESTAMPTZ,

  -- Meeting tracking
  calendly_event_id          TEXT,
  meeting_scheduled_at       TIMESTAMPTZ,
  meeting_completed_at       TIMESTAMPTZ,

  -- Pitch tracking
  pitched_at                 TIMESTAMPTZ,
  pitched_ads                BOOLEAN DEFAULT FALSE,
  pitched_medjobs            BOOLEAN DEFAULT FALSE,
  pitch_notes                TEXT,
  pitch_interest_level       TEXT,

  -- Eligibility (denormalized for fast filtering)
  medjobs_eligible           BOOLEAN DEFAULT FALSE,
  medjobs_catchment_university TEXT,  -- e.g., 'University of Texas at Austin'
  ads_eligible               BOOLEAN DEFAULT TRUE,  -- most providers are eligible

  -- Ads conversion track (independent of pipeline stage)
  -- none → free_intro ($50 promo) → subscribed ($75-600/mo)
  ads_status                 TEXT DEFAULT 'none',
  ads_free_intro_at          TIMESTAMPTZ,  -- when they started free $50 campaign
  ads_subscribed_at          TIMESTAMPTZ,  -- when they became paying

  -- MedJobs conversion track (independent of pipeline stage)
  -- Pilot is derived from interview_terms_accepted_at + 90 days (see lib/medjobs/clients.ts)
  -- none → in_pilot (90-day free) → pilot_expired → subscribed
  medjobs_status             TEXT DEFAULT 'none',
  medjobs_pilot_started_at   TIMESTAMPTZ,  -- = interview_terms_accepted_at
  medjobs_subscribed_at      TIMESTAMPTZ,  -- = medjobs_subscription_active

  -- Not interested tracking
  not_interested_at          TIMESTAMPTZ,
  not_interested_reason      TEXT,

  -- Admin workflow
  assigned_to                UUID,  -- Could reference admin_users if it exists
  notes                      TEXT,
  last_activity_at           TIMESTAMPTZ DEFAULT NOW(),

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT pgt_pipeline_stage_check CHECK (
    pipeline_stage IN ('new_claim', 'meeting_scheduled', 'pitched', 'not_interested')
  ),
  CONSTRAINT pgt_interest_level_check CHECK (
    pitch_interest_level IS NULL OR pitch_interest_level IN ('high', 'medium', 'low', 'none')
  ),
  CONSTRAINT pgt_ads_status_check CHECK (
    ads_status IN ('none', 'free_intro', 'subscribed')
  ),
  CONSTRAINT pgt_medjobs_status_check CHECK (
    medjobs_status IN ('none', 'in_pilot', 'pilot_expired', 'subscribed')
  ),
  CONSTRAINT pgt_unique_provider UNIQUE (business_profile_id)
);

-- Indexes for tab queries (pipeline stages)
CREATE INDEX IF NOT EXISTS idx_pgt_pipeline ON provider_growth_tracking(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_pgt_pipeline_changed ON provider_growth_tracking(pipeline_stage, pipeline_stage_changed_at DESC);

-- Index for source attribution filtering
CREATE INDEX IF NOT EXISTS idx_pgt_source ON provider_growth_tracking(claim_source) WHERE claim_source IS NOT NULL;

-- Indexes for conversion status filtering (partial for common queries)
CREATE INDEX IF NOT EXISTS idx_pgt_ads ON provider_growth_tracking(ads_status) WHERE ads_status != 'none';
CREATE INDEX IF NOT EXISTS idx_pgt_medjobs ON provider_growth_tracking(medjobs_status) WHERE medjobs_status != 'none';

-- Index for meeting scheduled tab (upcoming meetings)
CREATE INDEX IF NOT EXISTS idx_pgt_meeting ON provider_growth_tracking(meeting_scheduled_at)
  WHERE pipeline_stage = 'meeting_scheduled' AND meeting_scheduled_at IS NOT NULL;

-- Index for MedJobs eligibility filtering
CREATE INDEX IF NOT EXISTS idx_pgt_medjobs_eligible ON provider_growth_tracking(medjobs_eligible)
  WHERE medjobs_eligible = TRUE;

-- Composite index for common dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_pgt_dashboard ON provider_growth_tracking(
  pipeline_stage,
  claim_source,
  claimed_at DESC
);


-- Touchpoints table (audit log)
CREATE TABLE IF NOT EXISTS provider_growth_touchpoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id         UUID NOT NULL REFERENCES provider_growth_tracking(id) ON DELETE CASCADE,
  business_profile_id UUID NOT NULL,  -- Denormalized for direct queries
  touchpoint_type     TEXT NOT NULL,
  details             JSONB,
  admin_user_id       UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pgt_touchpoint_type_check CHECK (
    touchpoint_type IN (
      'stage_changed',
      'meeting_scheduled',
      'meeting_completed',
      'meeting_cancelled',
      'pitch_logged',
      'note_added',
      'ads_converted',
      'medjobs_converted',
      'ads_upgraded',
      'medjobs_upgraded',
      'marked_not_interested',
      'eligibility_updated',
      'assigned'
    )
  )
);

-- Index for fetching touchpoints by tracking row
CREATE INDEX IF NOT EXISTS idx_pgt_touchpoints_tracking ON provider_growth_touchpoints(tracking_id, created_at DESC);

-- Index for fetching touchpoints by provider
CREATE INDEX IF NOT EXISTS idx_pgt_touchpoints_provider ON provider_growth_touchpoints(business_profile_id, created_at DESC);


-- Admin-only: RLS on, no policies. Service role only.
ALTER TABLE provider_growth_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_growth_touchpoints ENABLE ROW LEVEL SECURITY;
