-- Migration 128: do_not_contact
--
-- Hard suppression list ("kill switch") for provider/family contacts who have
-- asked to be removed from ALL Olera communications — typically an angry reply
-- to cold provider outreach ("take my listing down and stop emailing me").
--
-- This is deliberately SEPARATE from the softer opt-out mechanisms:
--
--   • provider_unsubscribes (084) — per-channel opt-out (leads / analytics_digest)
--     that a provider self-selects. Honored only by the weekly digest cron.
--   • business_profiles.metadata flags — claimed-account notification prefs.
--   • email_overrides — the INVERSE allowlist (send-anyway).
--
-- None of those give us a single, admin-controlled "never contact this address
-- again, on any channel" switch. This table is that switch. It is enforced
-- centrally in lib/email.ts sendEmail() (every ~10 provider senders funnel
-- through it) and lib/twilio.ts sendSMS(), so no individual sender can bypass
-- it. Auth/verification mail the recipient actively triggers stays exempt
-- (SUPPRESSION_EXEMPT_TYPES) — a person on this list who tries to log in still
-- gets their OTP.
--
-- Keyed by email (required today) with an optional phone for the SMS lane.
-- Admin-only (RLS + service role for all reads/writes).
-- Surfaced at /admin/do-not-contact for human visibility + edits.
--
-- Apply via Supabase dashboard SQL editor (NOT CLI).

CREATE TABLE IF NOT EXISTS do_not_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Store lowercased/trimmed; enforcement lowercases the recipient before lookup.
  email text,
  -- E.164 (+1XXXXXXXXXX) when present. Enables the SMS kill switch (sendSMS).
  phone text,
  reason text NOT NULL DEFAULT 'provider_request'
    CHECK (reason IN ('provider_request', 'angry_optout', 'legal', 'spam_complaint', 'other')),
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- At least one identifier is required for the row to mean anything.
  CONSTRAINT do_not_contact_identifier_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- One row per address / number. Partial unique indexes so a NULL identifier
-- (e.g. phone-only rows) doesn't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_do_not_contact_email ON do_not_contact(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_do_not_contact_phone ON do_not_contact(phone) WHERE phone IS NOT NULL;

ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE do_not_contact IS
  'Hard "do not contact" kill switch. An address/number here is suppressed across ALL non-auth email (lib/email.ts) and SMS (lib/twilio.ts). Distinct from per-channel provider_unsubscribes. Managed via /admin/do-not-contact.';

-- ============================================================================
-- Seed: 2 emails flagged for immediate removal (Product Dev meeting 2026-07-02)
-- ============================================================================
-- Larkins Center (Director: Jeannette Perez Gruber). Replied to support@olera.care
-- stating they are NOT a nursing home and demanding their location, photos, and
-- all associated info be removed from the website and all communications. They
-- use two addresses; both suppressed.
INSERT INTO do_not_contact (email, reason, note, created_by)
VALUES
  ('lrk.710075@gmail.com', 'provider_request', 'Larkins Center (Jeannette Perez Gruber) — not a nursing home; demanded full removal from site + comms. Support email 2026-07-02.', 'meeting-seed'),
  ('larkinscenter7100@gmail.com', 'provider_request', 'Larkins Center (Jeannette Perez Gruber) — not a nursing home; demanded full removal from site + comms. Support email 2026-07-02.', 'meeting-seed')
ON CONFLICT DO NOTHING;
