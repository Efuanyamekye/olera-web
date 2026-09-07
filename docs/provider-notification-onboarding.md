# Provider notifications — implementation and launch handoff

September 7, 2026. Notification implementation and timeline fixes merged to staging in PRs #1811 and #1815. See the latest SMS decision below for follow-up work.

## What this adds

- Chantel's **Email 3**, “Never miss a family inquiry,” 72 hours after profile preview, during weekday 9am–5pm provider-local runs. Original body and CTA are preserved; “Hi there” avoids greeting an organization by its first word. Uses the existing sender, suppression checks, email ledger, template gallery and automation registry.
- A signed portal link to `/account/settings?tab=notifications`. Both automatic auth redirects use the same allowlist. The existing missing `matches` allowlist entry is fixed too. Multi-profile accounts switch to the linked owned profile; preferences remain disabled if that profile is unavailable.
- An authenticated settings API and service-only PostgreSQL function. Preference updates merge under a row lock. The update and outcome event commit together; failed saves roll back, unchanged values produce no outcome. The existing WhatsApp enable button uses the same atomic path. Family and caregiver preferences remain supported.
- Provider Comms shows notification settings visits, saved preferences and explicit SMS off-to-on changes. Recipient filters drill into each outcome. Counts are distinct messages, linked by email-log ID, within seven days after send. Repeated visits do not inflate counts. Saved preferences include disabling a channel. SMS preference enablement does **not** prove a delivered SMS or measure the effect of the existing default policy.
- Eligibility is organization-only because this CTA's SMS setting does not exist for caregivers. Requires a US-formatted phone, email, claim within 30 days, preview at least 72h ago, no prior attempt, and SMS not explicitly enabled. Existing DNC and email suppression remain in `sendEmail`.

## Confirmed launch decision

TJ chose to **preserve current SMS delivery and keep the new email paused** until the preference-default mismatch is resolved. No SMS sending-policy code was changed.

The settings screen treats missing `notification_prefs.new_leads.sms` as off. `shouldSendNotification` currently treats a missing preference (and lookup failure) as permission to send. Therefore the seven explicit opt-ins below do not establish that only seven providers receive SMS. Resolving that policy is required before enabling the new email; it must not be changed implicitly by this PR.

The migration seeds `notification-setup-nudge` as paused in `cron_config`. Rerunning the migration reasserts this launch hold. The usual automation controls remain available, but leave this job paused per TJ's decision.

## Dispatch recovery

A service-only transaction reserves an email-log row and stamps its attempt ID on the provider before any external send. Duplicate workers cannot reserve another attempt. Reservation also checks the current email so a concurrent email-address change cannot send to a stale recipient.

There is deliberately no automatic resend after a failed or uncertain attempt. A worker crash leaves a pending ledger row; an explicit sender failure leaves a failed row. Review the individual email and mail-service result before any retry. This avoids inheriting the existing send-then-metadata-stamp resend loop. No bulk metadata write can undo notification choices. The dashboard's pending/failed filters and automation error counts are the inspection surfaces.

## Read-only cohort refresh

Snapshot September 7, 2026, 04:32 UTC. Excludes explicit `@olera.care` recipients and admin-archived profiles. Paginated GET-only reads; no messages sent or data written.

| Measure | Count |
| --- | ---: |
| Claimed organizations | 905 |
| US-formatted phone present | 799 |
| Explicit SMS preference enabled | 7 |
| Currently due for this email, before business hours and sender suppressions | 50 |

Phone formatting does not establish mobile capability. Delivery counts and the cohort should be refreshed when the job is eventually enabled. The 50-provider backlog is not a proposal to bypass business hours or suppression.

## Deployment and QA

1. Apply **211_provider_notification_outcomes.sql**, then **212_provider_notification_dispatch.sql** in the shared Supabase database before deploying this code. They have been executed against an isolated PostgreSQL runtime and rerun for idempotency; they have **not** been applied to the live database. Existing settings toggles use the new RPC after deployment, so migration 209 is a prerequisite.
2. Preview the notification email in the gallery. Check the settings link as a signed-in owner, a signed-out owner, and an owner with another active profile. Wrong-account access must not change preferences.
3. With a dedicated test profile, open the notifications tab, save an SMS choice, then change a different channel. Confirm preferences persist together and no automatic opt-in occurs. A failed save must not create an outcome.
4. Compare Provider Comms message totals and recipient outcome filters with the email/activity records. A repeated visit or repeated save of the same value must not inflate message counts. An unrelated or older-than-seven-day email ID must not receive attribution.
5. Verify the new job remains paused. Resolve the SMS-default decision before enabling it; then refresh eligibility and run a controlled QA send through the existing admin workflow.

Automated validation: TypeScript; focused ESLint (one existing settings dependency warning); cron registry; existing Provider Comms tests; new `npm run check:provider-notifications` eligibility/routing, actual React settings interaction and PostgreSQL migration/transaction tests. The report was visually inspected with synthetic data. Authenticated deployment QA remains outstanding.

## Sources

- [Latest onboarding handoff and end-session addendum](https://www.notion.so/3ce5903a0ffe81d780aee8d9048ddeda).
- [Original implementation commit](https://github.com/olera-care/olera-web/commit/331ff504c): `notification-setup-nudge/route.ts` supplies 72h-after-preview timing; the template supplies Chantel's copy. The detailed Notion child remains unshared to the integration, so this is the implemented specification rather than a claim to have read that page directly.
- [Reporting plan](./provider-comms-reporting-plan.md).

## Pre-test review — September 7

Two confirmed issues fixed on PR #1811:

- **Saved preference looked reverted after a failed refresh.** `refreshAccountData` catches errors and retains the old profile snapshot. Clearing all optimistic state after awaiting it exposed that stale snapshot even when the save succeeded. Confirmed values now stay visible per profile until the server snapshot acknowledges them. Failed subsequent writes restore the last displayed value; overrides do not leak between profiles. The same fix covers the global WhatsApp enable button.
- **Notification outcomes disappeared from activity drilldowns.** Both the Activity feed and directory comms timeline filtered out the two new server-written event types. They now admit and label settings visits and saved preferences under setup. The public tracking endpoint still cannot submit these trusted outcome events.

Regressions reproduce refresh failure, repeated saves, server acknowledgment, profile isolation, and both admin event allowlists. TypeScript, notification tests, Provider Comms tests and cron checks pass. Focused lint passes; the existing Activity route contains disable comments for an unavailable `@typescript-eslint/no-explicit-any` rule, so that file was checked with `--no-inline-config` instead.

A GET-only live API-schema check confirmed that `save_notification_preference` and `reserve_notification_nudge` are not deployed. Apply migrations 209 and 210 before testing preference persistence. The pre-fix Vercel build passed; the new commit requires its own preview build. No database writes, live sends or merges were performed during this review.

## Merge review — September 7

TJ applied both notification migrations and the RPC availability and paused cron configuration were verified. During merge review, their filenames were renumbered from 209/210 to 211/212 because staging used 209/210 for city campaigns. SQL contents are unchanged; no rerun is needed. TJ confirmed SMS on/off preferences persist after refresh. The tab persistence follow-up passed UI regression checks. The notification email remains paused.


## SMS preference decision — September 7 follow-up

TJ approved preserving delivery for missing preferences and showing an unset state. The settings UI now explains “Using existing notification settings” and offers explicit On and Off choices. No existing preference is backfilled and the sender default is unchanged.

Apply **213_provider_sms_unset_preference.sql** before testing this follow-up. It fixes first-choice Off being discarded as a no-op. An unset provider SMS preference produces `previous: null`; an explicit On from unset counts as a confirmed SMS preference in reporting. Repeating the same saved choice creates no new event. This migration replaces only the preference RPC and does not unpause the email.

The email now asks providers to review preferences instead of assuming text alerts are off. All scheduled sends remain paused until a controlled signed-link test passes. The controlled test provider/inbox is awaiting TJ's confirmation.

QA: use a dedicated organization with no SMS preference saved; opening settings must not save a choice. Choose Off, refresh, and verify explicit false was stored. Test On on another unset test profile. A failed first save must return to the unset prompt. Existing explicit preferences retain their toggles. Verify the signed email action is attributed once within the seven-day window before rollout.
