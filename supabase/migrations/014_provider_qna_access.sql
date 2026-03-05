-- Migration: Allow providers to access and answer questions about their profile
-- The provider_questions table already exists (005_provider_questions.sql)
-- This adds RLS policies for provider access

-- Allow providers to read questions for their profile
-- provider_questions.provider_id stores the business_profiles.slug
CREATE POLICY "Providers can view their questions"
  ON provider_questions FOR SELECT
  USING (
    provider_id IN (
      SELECT slug FROM business_profiles
      WHERE account_id = (
        SELECT id FROM accounts WHERE user_id = auth.uid()
      )
      AND type IN ('organization', 'caregiver')
    )
  );

-- Allow providers to update (answer) their questions
CREATE POLICY "Providers can answer their questions"
  ON provider_questions FOR UPDATE
  USING (
    provider_id IN (
      SELECT slug FROM business_profiles
      WHERE account_id = (
        SELECT id FROM accounts WHERE user_id = auth.uid()
      )
      AND type IN ('organization', 'caregiver')
    )
  );
