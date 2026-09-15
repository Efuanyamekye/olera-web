-- Migration: Add metadata column to provider_growth_tracking
--
-- Context (2026-09-14): Adds JSONB metadata column to store AI briefing cache
-- and other extensible data without schema changes.

ALTER TABLE provider_growth_tracking
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for JSONB queries if needed in the future
CREATE INDEX IF NOT EXISTS idx_pgt_metadata ON provider_growth_tracking USING gin(metadata);
