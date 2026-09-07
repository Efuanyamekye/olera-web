# Provider comms: independent verification reminder

Built from the [latest onboarding handoff](https://www.notion.so/3ce5903a0ffe81d780aee8d9048ddeda) and [audit decisions](https://www.notion.so/3cd5903a0ffe81938ec5d7acfe1b19a8).

The independent 21-day reminder replaces the legacy 7/21-day cron selection. It targets account-bound, unverified organizations and caregivers at least 21 days after **claimed_at**, including older claims. It defers after an accepted same-day weekly digest and uses shared email suppression. Each provider gets one durable attempt; failures and uncertain sends need review, not automatic retries. The existing daily 14:00 UTC schedule remains, with at most 25 attempts per run.

The signed email link opens the correct owned profile's verification modal. It does not verify the provider automatically. Provider Comms shows attempts, delivery, and engagement; verification completion is **not yet attributed**. The template is available in the email gallery and automation preview. Copy requests verification without claiming a 30-day expiry: no claim-release implementation was found.

## Rollout

1. Apply `supabase/migrations/214_provider_verification_dispatch.sql`. This installs the reservation function and explicitly pauses the job. No email is sent by the migration.
2. Preview the template and linked verification flow with an authorized test provider. Confirm already-verified and mismatched profiles do not open verification.
3. Review the initial backlog and approve enablement separately. September 7 read-only snapshot: 10 unverified claimed profiles aged 21+ days, zero previous sent flags, zero missing addresses, before delivery suppression and same-day digest deferral.
4. Check actual delivery and verification activity after enabling. Review failed/pending reservations manually before any retry.

The cron's `dry_run=true` does not reserve or send, but the shared pause wrapper still holds paused runs. The service-only reservation RPC's `p_dry_run=true` probes eligibility without creating an email or changing metadata; its returned profile UUID is only a sentinel.

## Remaining project work

- Complete the notification email's attributed preference-save test. Its email click and settings visit were recorded; manual saves alone do not prove attribution. Notification automation remains paused.
- Preview and enable each new automation deliberately; do not treat a merged PR as a live campaign.
- Decide whether an additional early verification nudge is needed beyond the existing conditional welcome ask. The 21-day reminder is independent of that decision.
- Verification completion attribution and profile-edit attribution remain measurement gaps; delivery/click counts do not establish either outcome.
- The separate notification-loading polish PR #1818 is not part of this branch and remains unmerged.

Validation: TypeScript, cron registry, PostgreSQL migration/eligibility/reservation tests, actual cron route tests, settings UI ownership checks, Provider Comms accounting/UI checks, targeted ESLint.
