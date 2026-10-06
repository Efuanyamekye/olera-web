-- Team logins (TJ, 2026-10-06).
--
-- An agency had exactly one login: business_profiles.account_id. Colorado
-- CareAssist's intake director (Jacob) does every family call, but the account
-- is the owner's (Jason), so Jacob's alert emails ended at a sign-in he could
-- not complete. Assisting Hands needs the same: Robbie hands families to his
-- owners.
--
-- A member is an email added to an agency. They sign in with that email (Google,
-- code, or a signed link from an alert) and act for the agency next to the
-- owner. Keyed by email, not account, so a member can be added before they have
-- ever signed in. Members can read and update the agency and its inquiries;
-- they cannot delete it and do not become the owner.
--
-- Also closes a hole that predates this: any signed-in user could point their
-- own accounts.active_profile_id at any profile (the accounts UPDATE policy
-- checks only the row's user_id), and two routes then acted as that profile.
-- The trigger below rejects an active profile the user cannot act for.
--
-- Additive: new table, new function, new policies, one trigger. No existing
-- policy is changed.

CREATE TABLE IF NOT EXISTS business_profile_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff')),
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, email)
);
CREATE INDEX IF NOT EXISTS business_profile_members_email_idx ON business_profile_members (email);

ALTER TABLE business_profile_members ENABLE ROW LEVEL SECURITY;

-- A member sees their own rows, so the browser can list the agencies they belong to.
DROP POLICY IF EXISTS "Members can view own memberships" ON business_profile_members;
CREATE POLICY "Members can view own memberships" ON business_profile_members
  FOR SELECT USING (email = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Service role can manage profile members" ON business_profile_members;
CREATE POLICY "Service role can manage profile members" ON business_profile_members
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- True when the signed-in user owns the profile or is a member of it.
-- SECURITY DEFINER so policies can call it without recursing through RLS.
CREATE OR REPLACE FUNCTION public.can_act_for_profile(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_profiles bp
    JOIN accounts a ON a.id = bp.account_id
    WHERE bp.id = pid AND a.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM business_profile_members m
    WHERE m.profile_id = pid AND m.email = lower(auth.jwt() ->> 'email')
  );
$$;

-- Members read and edit the agency (including an inactive one); no insert or delete.
DROP POLICY IF EXISTS "Members can view their agency" ON business_profiles;
CREATE POLICY "Members can view their agency" ON business_profiles
  FOR SELECT USING (
    id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Members can update their agency" ON business_profiles;
CREATE POLICY "Members can update their agency" ON business_profiles
  FOR UPDATE USING (
    id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
  );

-- The update policy above checks only that the row is the member's agency, so
-- on its own a member could rewrite account_id and take the agency over. Only
-- the current owner, or server code, may change who owns a profile.
CREATE OR REPLACE FUNCTION public.guard_profile_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NOT DISTINCT FROM OLD.account_id
     OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = OLD.account_id AND a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner can change who owns this profile' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_profiles_guard_owner ON business_profiles;
CREATE TRIGGER business_profiles_guard_owner
  BEFORE UPDATE OF account_id ON business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_owner();

-- Members see and update the agency's inquiries, as the owner does.
DROP POLICY IF EXISTS "Members can view agency connections" ON connections;
CREATE POLICY "Members can view agency connections" ON connections
  FOR SELECT USING (
    from_profile_id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
    OR to_profile_id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Members can update agency connections" ON connections;
CREATE POLICY "Members can update agency connections" ON connections
  FOR UPDATE USING (
    from_profile_id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
    OR to_profile_id IN (SELECT profile_id FROM business_profile_members WHERE email = lower(auth.jwt() ->> 'email'))
  );

-- A signed-in user may only make a profile active if they can act for it.
-- Server code (service role) is trusted and skips the check: claim and
-- create flows set the active profile in the same request that assigns it.
CREATE OR REPLACE FUNCTION public.guard_active_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active_profile_id IS NULL
     OR NEW.active_profile_id IS NOT DISTINCT FROM OLD.active_profile_id
     OR coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.can_act_for_profile(NEW.active_profile_id) THEN
    RAISE EXCEPTION 'You cannot switch to that profile' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_guard_active_profile ON accounts;
CREATE TRIGGER accounts_guard_active_profile
  BEFORE UPDATE OF active_profile_id ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_active_profile();
