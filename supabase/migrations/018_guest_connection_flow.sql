-- Migration: Guest Connection Flow
-- Allows users to connect with providers without creating an account first.
-- Placeholder profiles are created with a claim_token that can be used to
-- access the inbox before claiming the account via magic link.
--
-- Note: Guest operations use the service role which bypasses RLS entirely.
-- We don't need to modify RLS policies - the existing policies work fine
-- because the API uses admin client (service role) for all guest operations.

-- 1. Make account_id nullable on business_profiles
-- This allows creating placeholder profiles for guest users
ALTER TABLE business_profiles
  ALTER COLUMN account_id DROP NOT NULL;

-- 2. Add claim_token for localStorage-based guest access
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS claim_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 3. Indexes for efficient claim token lookups
CREATE INDEX IF NOT EXISTS idx_profiles_claim_token
  ON business_profiles(claim_token)
  WHERE account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_unclaimed_email
  ON business_profiles(email)
  WHERE account_id IS NULL AND email IS NOT NULL;

-- 4. Add guest_email column to connections for rate limiting
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

CREATE INDEX IF NOT EXISTS idx_connections_guest_email
  ON connections(guest_email)
  WHERE guest_email IS NOT NULL;
