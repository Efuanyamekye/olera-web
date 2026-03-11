-- Migration: Guest Connection Flow
-- Allows users to connect with providers without creating an account first.
-- Placeholder profiles are created with a claim_token that can be used to
-- access the inbox before claiming the account via magic link.

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

-- 4. Update RLS policies to allow guest access via claim token
-- First, drop existing select policy if it exists
DROP POLICY IF EXISTS "profiles_select_policy" ON business_profiles;

-- Create new select policy that allows:
-- a) Public read for organization profiles (listings)
-- b) Account owners to read their own profiles
-- c) Guests to read profiles via claim_token (handled at API level)
CREATE POLICY "profiles_select_policy" ON business_profiles
  FOR SELECT
  USING (
    type = 'organization'
    OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );

-- Allow guests to read their placeholder profiles via claim_token
-- This is a separate policy for clarity
DROP POLICY IF EXISTS "profiles_guest_select_policy" ON business_profiles;
CREATE POLICY "profiles_guest_select_policy" ON business_profiles
  FOR SELECT
  USING (
    account_id IS NULL
    AND claim_token IS NOT NULL
  );

-- 5. Update connections RLS to allow access via claim token
-- This allows guests to see connections for their placeholder profile

-- Policy for selecting connections (used by inbox)
DROP POLICY IF EXISTS "connections_select_guest_policy" ON connections;
CREATE POLICY "connections_select_guest_policy" ON connections
  FOR SELECT
  USING (
    -- Allow selecting connections where the from_profile has a claim_token
    -- The actual token validation happens at the API level
    EXISTS (
      SELECT 1 FROM business_profiles bp
      WHERE (bp.id = connections.from_profile_id OR bp.id = connections.to_profile_id)
      AND bp.account_id IS NULL
      AND bp.claim_token IS NOT NULL
    )
  );

-- 6. Add guest_email column to connections for rate limiting
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

CREATE INDEX IF NOT EXISTS idx_connections_guest_email
  ON connections(guest_email)
  WHERE guest_email IS NOT NULL;
