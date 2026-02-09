-- ============================================================
-- Admin Dashboard Tables
-- ============================================================

-- admin_users: who has admin access
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'master_admin')),
  granted_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- audit_log: track admin actions
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_audit_log_admin_user_id ON audit_log(admin_user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default.
-- Admin can read their own row via authenticated client.
CREATE POLICY "admin_users_self_read"
  ON admin_users FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_log_admin_read"
  ON audit_log FOR SELECT
  USING (
    admin_user_id IN (
      SELECT id FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- Add "rejected" to business_profiles claim_state check constraint
-- First drop the existing check, then recreate with rejected included
ALTER TABLE business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_claim_state_check;

ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_claim_state_check
  CHECK (claim_state IN ('unclaimed', 'pending', 'claimed', 'rejected'));
