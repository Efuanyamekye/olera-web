-- MedJobs Job Board Diagnostic Queries
-- Run these in Supabase SQL Editor to identify root cause

-- 1. Get all 5 providers marked "ready_for_students" with their full details
SELECT
  id,
  organization_name,
  status,
  provider_business_profile_id,
  research_data->>'olera_provider_id' as olera_provider_id,
  research_data->'general_contact'->>'city' as gc_city,
  research_data->'general_contact'->>'state' as gc_state
FROM student_outreach
WHERE kind = 'provider'
  AND status = 'ready_for_students';

-- 2. For each olera_provider_id, check what's in olera-providers table
-- Including exact city/state format to detect mismatches
SELECT
  provider_id,
  provider_name,
  city,
  state,
  LENGTH(state) as state_length,  -- 2 = state code, longer = full name
  deleted,
  created_at
FROM "olera-providers"
WHERE provider_id IN (
  SELECT research_data->>'olera_provider_id'
  FROM student_outreach
  WHERE kind = 'provider'
    AND status = 'ready_for_students'
    AND research_data->>'olera_provider_id' IS NOT NULL
);

-- 3. Check if there are business_profiles that might match by name+city
-- This could cause unwanted deduplication
SELECT
  bp.id,
  bp.display_name,
  bp.city,
  bp.state,
  bp.claim_state,
  bp.is_active
FROM business_profiles bp
WHERE bp.is_active = true
  AND bp.type IN ('organization', 'caregiver')
  AND (
    LOWER(bp.display_name) LIKE '%comfort keepers%'
    OR LOWER(bp.display_name) LIKE '%cornerstone%'
    OR LOWER(bp.display_name) LIKE '%home helpers%'
    OR LOWER(bp.display_name) LIKE '%visiting angels%'
    OR LOWER(bp.display_name) LIKE '%amada%'
  );

-- 4. Verify Wisconsin-Madison catchment cities are correct
-- Expected format: "madison|WI" (lowercase city, uppercase state code)
-- Check if olera-providers state format matches
SELECT
  op.provider_id,
  op.provider_name,
  op.city,
  op.state,
  LOWER(op.city) || '|' || op.state as catchment_key,
  -- This should match the catchment set for Wisconsin-Madison:
  -- Madison, Middleton, Sun Prairie, Verona, Fitchburg, Waunakee, McFarland, Stoughton, Janesville, Mount Horeb
  CASE
    WHEN LOWER(op.city) || '|' || op.state IN (
      'madison|WI', 'middleton|WI', 'sun prairie|WI', 'verona|WI',
      'fitchburg|WI', 'waunakee|WI', 'mcfarland|WI', 'stoughton|WI',
      'janesville|WI', 'mount horeb|WI'
    ) THEN 'MATCHES_CATCHMENT'
    ELSE 'NOT_IN_CATCHMENT'
  END as catchment_status
FROM "olera-providers" op
WHERE op.provider_id IN (
  SELECT research_data->>'olera_provider_id'
  FROM student_outreach
  WHERE kind = 'provider'
    AND status = 'ready_for_students'
    AND research_data->>'olera_provider_id' IS NOT NULL
);

-- 5. Check if any providers have conflicting business_profile links
-- that could cause them to go to bpIds instead of oleraIds
SELECT
  so.id,
  so.organization_name,
  so.provider_business_profile_id,
  so.research_data->>'olera_provider_id' as olera_id,
  CASE
    WHEN so.provider_business_profile_id IS NOT NULL THEN 'Goes to bpIds'
    WHEN so.research_data->>'olera_provider_id' IS NOT NULL THEN 'Goes to oleraIds'
    ELSE 'Manual entry only'
  END as routing
FROM student_outreach so
WHERE kind = 'provider'
  AND status = 'ready_for_students';

-- 6. Full verification: What SHOULD the API return for scope=all?
-- (scope=all means no catchment filter)
WITH ready_providers AS (
  SELECT
    id as outreach_id,
    organization_name,
    provider_business_profile_id,
    research_data->>'olera_provider_id' as olera_id,
    research_data->'general_contact'->>'city' as gc_city,
    research_data->'general_contact'->>'state' as gc_state
  FROM student_outreach
  WHERE kind = 'provider'
    AND status = 'ready_for_students'
),
olera_details AS (
  SELECT
    rp.*,
    op.provider_name,
    op.city as olera_city,
    op.state as olera_state,
    op.deleted
  FROM ready_providers rp
  LEFT JOIN "olera-providers" op ON op.provider_id = rp.olera_id
),
bp_matches AS (
  SELECT
    od.*,
    bp.id as matching_bp_id,
    bp.display_name as bp_name,
    bp.city as bp_city,
    bp.state as bp_state
  FROM olera_details od
  LEFT JOIN business_profiles bp ON (
    bp.is_active = true
    AND bp.type IN ('organization', 'caregiver')
    AND (
      LOWER(bp.display_name) LIKE '%' || LOWER(od.organization_name) || '%'
      OR LOWER(od.organization_name) LIKE '%' || LOWER(bp.display_name) || '%'
    )
    AND LOWER(bp.city) = LOWER(COALESCE(od.gc_city, od.olera_city))
    AND bp.state = COALESCE(od.gc_state, od.olera_state)
  )
)
SELECT
  outreach_id,
  organization_name,
  olera_id,
  olera_city,
  olera_state,
  deleted as olera_deleted,
  matching_bp_id,
  bp_name,
  bp_city,
  bp_state,
  CASE
    WHEN matching_bp_id IS NOT NULL THEN 'Will use business_profile (higher priority)'
    WHEN olera_id IS NOT NULL AND deleted IS NOT TRUE THEN 'Will use olera-providers'
    ELSE 'Manual entry fallback'
  END as expected_source
FROM bp_matches
ORDER BY organization_name;
