# Provider comms reporting — audit and proposed first slice

Audit date: September 7, 2026. The first reporting slice is implemented on `codex/provider-comms-dashboard`; it is not yet deployed. The broader roadmap below includes subsequent work.

## First reporting slice implemented

- `/admin/provider-comms` beside Family Comms, backed by an admin-authenticated read-only endpoint.
- Welcome and profile-preview performance, date/source filters, internal-domain exclusion, distinct-provider summaries, delivery/suppression details and recipient pagination.
- Provider timeline, recipient-filtered email log, template preview and automation-history links.
- Onboarding category in Analytics and a provider onboarding journey on both automation pages; profile preview now belongs to Provider Lifecycle.
- Explicit unavailable states for exact action attribution and eligibility/waiting coverage. Those remain follow-up work, as do the new notifications and conditional verification message.
- Verification: TypeScript, cron registry and focused accounting/identity/pagination tests; the actual report component was exercised with synthetic data and inspected at desktop and 390px mobile width. A GET-only production reconciliation reproduced the aggregate audit counts exactly. Authenticated end-to-end preview QA remains after deployment.

### Preview QA

1. Open Operations → Provider Comms. Switch between 7/30/90-day and custom ranges; refreshing should preserve the URL date/source selection.
2. Compare all sources with Outreach before claim. Unknown source must remain a separate category. Toggle internal recipients and confirm the exclusion note changes.
3. Select welcome or preview, then filter suppressed, send failed and recorded click. Check recipient pagination and empty states.
4. Open a recipient's message link: Emails should have the matching message type and recipient search selected. Open the provider timeline and the automation preview/run-history links.
5. Check that welcome and preview share the onboarding journey and that profile preview belongs to Provider Lifecycle in Automations.
6. Verify that the report does not display invented profile-edit conversion or eligible/missed totals. No test send is needed for this read-only feature.

### Pre-test review fixes

- Analytics previously included suppressed/pending/failed attempts in its newly added onboarding “Sent” total. It now uses the shared accepted-message rule before counting any provider-comms funnel row. Historical totals can decrease appropriately; same-window outcome attribution remains unchanged.
- The existing Emails drill-down could let an older filter response overwrite the latest results, and an older email-preview response could display beneath a newly selected recipient. Reproduced both with deliberately reversed response order, then added cancellation guards and regression tests. Row/preview pairs now also have stable React keys.
- “Inspect activity” now explicitly opens the provider feed rather than the default family feed.
- The original preview build succeeded. Its deployment-specific hostname redirected to the public homepage without a signed-in admin session, so authenticated preview QA remains required. No production authentication was bypassed.

## Recommendation

Add **Provider Comms** under Operations beside Family Comms. Start with the post-claim onboarding journey (welcome and profile preview), with a cold-outreach cohort filter. Reuse the existing sending system, email ledger, webhook events, provider activity, identity resolution, previews, and automation detail pages.

Family Comms supplies the strongest existing interface pattern: journey-ordered message rows, per-type performance, template previews, and separately labeled outcomes. Do not copy its ambiguous “Click” label: its displayed rate is clicks divided by opens.

## Existing admin architecture

Reviewed the full sidebar structure and corresponding code. Live inspection concentrated on Overview, Analytics, Family Comms (expanded email performance), Automations, Emails and onboarding automation details, Provider Outreach (expanded email performance), Relationships, City Broadcasts, Deliverability, Activity, Connections, Questions, and Email Verifier. Other pages below were mapped from navigation/code, not exhaustively exercised. No messages were sent or production records changed.

| Area | Existing responsibility | Relationship to proposed reporting |
| --- | --- | --- |
| Overview | Cross-team queues and activity | Small onboarding summary linking to Provider Comms later |
| Provider Outreach | Cold acquisition, assignments, sequence performance, claims, alternative-channel follow-up | Acquisition source and pre-claim context; retain operational workflow |
| City Broadcasts | Broadcast pool, delivery/claim summaries, waiting/done/excluded states | Separate acquisition journey, linked rather than folded into onboarding |
| Family Comms | Journey-ordered communication performance and family outcomes | Reuse design conventions |
| Analytics | Broad product signals and several funnels/experiments | Reuse shared provider calculations and link to dedicated reporting |
| Automations | Schedules, execution health, run history, samples, controls | Troubleshoot an individual step; retain pause/send controls here |
| Emails | Individual send records, statuses and previews | Drill down from a message row |
| Activity | Provider/family event feed and people view | Inspect landing, sign-in, edits, answers and other observed actions |
| Relationships | Human follow-up, latest touch, next action and provider timeline | Investigate a person and route human follow-up; not a complete onboarding cohort |
| Messages / Support Email | Inbound conversations and reply handling | Route replies to existing inboxes |
| Connections / Questions | Lead and question response queues and delivery issues | Later lifecycle outcomes: responded, connected, answered |
| Directory | Canonical provider record and comms timeline | Recipient drill-down available beyond Relationships coverage |
| Deliverability | Unreachable providers ranked by lost family demand | Currently demand-notification scoped; does not cover every failed onboarding email |
| Email Verifier | Address checks | Existing remediation tool, not a performance report |
| Verification | Claim and verification review | Verification outcomes and manual review |
| Disputes / Removals / Blocklist / Do Not Contact | Ownership, removal and contact restrictions | Explain exclusions; never treat deliberate opt-outs as failures to fix |
| Referrals / Care Seekers / Reviews | Referral operations, family records, review operations | Adjacent workflows, not the onboarding reporting home |
| Ad Boost | Provider campaign operations | Later provider journey; preserve campaign-specific reporting |
| Organic Growth / Benefits / Articles | Acquisition and content operations | Separate reporting domains |
| Team / War Room | Team administration and broader operating view | Potential summary links, not primary ownership |
| MedJobs Sites / In Basket / Stats; Young Caregivers | Other program operations and analytics | Separate audiences and funnels |

## Confirmed gaps

1. `lib/analytics/provider-email-funnels.ts` omits `provider_welcome` and `profile_preview_nudge` from “All provider email.” The old incomplete-profile type remains included. Omission was checked against current main.
2. Profile preview is visibly grouped under **Other** in Automations, not Provider Lifecycle. The independent system map and journey map make new messages easy to miss.
3. Automation email rollups count email-log rows as sent, including failed/suppressed records. The earlier live onboarding audit found 68 welcome rows and 70 profile-preview rows in the inspected windows; those are not equivalent to successfully sent messages. Five inspected preview failures explicitly said “Suppressed: verified undeliverable.” Do not extrapolate that cause to every failure.
4. The existing Analytics provider funnel intersects providers who clicked with providers who acted in the same reporting window. It does not establish that the action followed that email. It also transitions from message counts to distinct-provider counts. Its current approximation should not become a claimed onboarding conversion rate.
5. Current-main Deliverability filters a demand-notification allowlist (leads, connections, questions, messages). Welcome and profile preview are outside its scope. Onboarding needs its own exception visibility or an explicit extension of that view.
6. Provider profile-edit events already exist, but the inspected tracker supplies a provider ID and section, not an originating email-log ID. Email-to-edit attribution requires additional linking or clearly labeled inference.

## Proposed first screen

Default journey: **Onboarding**. Default date range: last 7 days, explicitly **messages attempted in this period**. Offer a separate claim-cohort view when eligibility history is reliable; do not silently mix these populations.

Filters: acquisition source (cold outreach / other known source / unknown), message, date range. Exclude explicitly identified internal/test traffic by default. Do not infer organic acquisition merely from missing outreach metadata.

Top summary: unique providers reached, observed intended actions, providers needing attention. If an outcome cannot be measured, show “Not yet measured,” not zero.

Message table:

| Step | Intended action | Reporting |
| --- | --- | --- |
| Welcome — live | Follow the welcome CTA into the provider experience | Attempted, suppressed, send failures, delivered, unique clicked messages, observed landing/sign-in |
| Profile preview — live | Inspect and improve their profile | Same delivery metrics, then observed profile edits after message exposure |
| Notifications — planned | Configure notifications / use the relevant provider destination | Show planned status until implemented and instrumented |
| Verification communication — conditional | Complete the required verification action | Preserve pending product decision; do not imply a new step is already live |

Selecting a message should expose its existing template preview, recipients and statuses, linked automation runs, and provider timelines. Include a compact attention list with explicit reasons: suppressed, technical failure, overdue eligible, or clicked with no observed follow-through. “Not due yet” is a normal state.

## Measurement contract

- Keep counts of messages and unique providers explicitly labeled.
- Separate evaluation/eligibility, attempted send, suppression, send failure, accepted, delivered, opened, clicked and product action. Accepted by the mail service is not delivered.
- CTR = distinct clicked messages / delivered messages. If click-to-open is useful, label it explicitly. Opens are a secondary signal; recorded engagement alone does not establish a human completed a task.
- Exact attribution: carry the existing email-log ID through the landing/session to a successful product action. Treat resend attempts and multiple messages without double-counting the same outcome.
- Historical fallback: a documented, time-ordered last-touch window (proposed seven days), labeled “associated action,” distinct from exact links. Show immature cohorts separately; a message sent today has not had seven days to convert.
- Cold outreach cohort: use acquisition touchpoints before the claim, join through the existing source-provider and canonical-ID logic, and preserve unknown source. Prefer immutable `claimed_at` to account creation time.
- Do not reconstruct historical eligibility or verification-at-send from present-day mutable flags as if it were certain. Start recording missing decision facts prospectively; avoid writing a new event every hourly no-op.
- Preserve DNC, unsubscribes, verification suppression, the 48-hour preview timing and the existing four-day completion-rung suppression. Overall message exposure should include the digest and human contacts, even when the performance table is filtered to onboarding.

## Implementation sequence

1. **Shared definitions and trustworthy counts.** Register onboarding email types and journey/system placement; centralize aggregation definitions; separate suppression/failure/success. Verify counts against existing email-log drill-downs.
2. **Provider Comms page.** Add sidebar entry and authenticated summary endpoint. Reuse existing preview and detail links. Ship welcome/profile-preview delivery performance and a labeled cold-outreach cohort. Represent unavailable historical outcomes honestly.
3. **Action attribution and coverage.** Connect successful product actions to email-log IDs; add time-ordered historical fallback, eligible/missed reporting where supported, and actionable recipient drill-downs.
4. **Then expand messages.** Add notifications and the agreed verification work, using the same reporting contract as part of each message's completion criteria.

The first PR can deliver steps 1–2 as a useful reporting slice. It must not present inferred profile-edit conversion or an unreconstructable eligible denominator as measured fact.

## Existing components to reuse

- `lib/crons/registry.ts` and `lib/crons/systems.ts`: automation definitions and placement.
- `lib/family-comms/journey.ts`: reusable journey descriptions; add post-claim onboarding alongside existing provider outreach.
- `lib/email-samples.ts`: existing welcome variants and profile-preview sample.
- `lib/email.ts`, `email_log`, `email_events`: sending and delivery history.
- `lib/provider-id-variants.ts`: canonical identity resolution across provider IDs.
- `app/api/activity/track/route.ts`, `provider_activity`, `lib/analytics/track-profile-edit.ts`: observed actions and attribution extension.
- `app/admin/family-comms/page.tsx`: interface reference.
- `app/api/admin/analytics/summary/route.ts`: existing funnel integration to reconcile with shared calculations.

Acceptance checks should cover suppression versus failure, duplicate webhooks, canonical provider IDs, actions before a send, multiple-message attribution, missing source, test traffic, immature cohorts, and pagination completeness. No new sending engine is required.

## Sources

- Live admin: https://olera.care/admin/family-comms, https://olera.care/admin/analytics, https://olera.care/admin/automations, https://olera.care/admin/provider-outreach, https://olera.care/admin/relationships, https://olera.care/admin/deliverability.
- Welcome handoff: https://www.notion.so/3ce5903a0ffe819bb9c0dc4fb45bc96a.
- Profile preview handoff and end-session addendum: https://www.notion.so/3ce5903a0ffe81d780aee8d9048ddeda.
- Production PRs previously reviewed: #1731 (welcome), #1738 (preview), #1794 (Relationships/inbox timeline).

The local checkout trails live production; current-main checks and live observations were used for material recent changes. The subsequently authorized database audit below resolves several initial uncertainties. Causal email-to-action conversion remains unverified.

## Authorized Supabase aggregate audit — September 7 update

Read-only GET queries using the existing credential, authorized by TJ. Raw recipient records and credentials were kept out of reports and were not saved. Pagination was used throughout. Audit snapshot: September 7, 2026, 01:14 UTC; send window starts September 1, 00:00 UTC. One internal `@olera.care` welcome test was excluded; this is an explicit domain exclusion, not proof that all possible tests are removed. Every remaining message resolved to a claimed provider profile.

| Message | Attempts | Delivered | Recorded opens | Recorded clicks | Suppressed | Technical send failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Welcome | 67 | 62 | 44 | 20 | 5 | 0 |
| Profile preview | 70 | 60 | 39 | 18 | 10 | 0 |

CTR using clicked messages / delivered messages is **32.3% welcome** and **30.0% preview**. Counts use delivery/open/click timestamps, not just the latest status label. There were no repeated provider/message-type attempt rows in this window.

All 15 failed-status rows were suppressions: welcome had five verified-undeliverable suppressions; preview had eight verified-undeliverable, one spam-complaint and one other suppression not further classified. These are message attempts, not necessarily 15 different providers. Suppression records must not inflate successfully sent totals or be presented as technical send failures.

### Recorded cold-outreach cohort

Classification requires an outreach touchpoint or dated outreach flag preceding `claimed_at`. It demonstrates recorded prior outreach, not that outreach caused the claim. Absence of evidence remains unknown source.

| Message | Attempts | Delivered | Recorded opens | Recorded clicks | Suppressed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Welcome, outreach before claim | 9 | 8 | 5 | 1 | 1 |
| Preview, outreach before claim | 6 | 5 | 4 | 0 | 1 |

The other 58 welcome and 64 preview attempts had no recorded prior outreach in the inspected acquisition tables. Do not label them organic. Of 38 non-internal claims since September 1, six had recorded prior outreach and 32 had unknown source under this rule. Claim cohorts and send cohorts differ because onboarding messages can concern earlier claims.

These samples are too small to conclude that the cold-outreach message copy underperforms. Their separate visibility is nevertheless essential: overall engagement conceals this difference.

### Coverage and execution

- Two current welcome candidates and 16 preview candidates beyond the 48-hour delay remained unflagged. All had an email and were not admin-archived.
- Each became due without a subsequent weekday 9am–5pm hourly send opportunity in the provider's configured timezone. Their pending state is consistent with normal weekend scheduling, not evidence of missed execution.
- These checks apply to the cron's current lookback cohorts (seven days for welcome, 21 for preview); they do not prove that no historical profile outside those windows was missed.
- 146 welcome runs and 137 preview runs in the window were recorded as `ok`, with zero reported recipient errors. This checks recorded runs, not the completeness of every expected scheduler invocation.

### Outcomes and attribution

- Six providers edited a profile after a nonsuppressed welcome attempt within a proposed seven-day window; three did so after a recorded click.
- One provider edited after a preview attempt and recorded click. These per-message associations can overlap and must not be added together as unique conversions.
- Among 101 profile-edit events in the matched recipient cohort, none carried an `email_log_id`. Exact email-ID attribution is therefore unavailable for these edits.
- No message in this September 1 onward cohort had a full seven-day observation window at audit time.

The priority remains the shared reporting definitions and Provider Comms page, followed by attribution. The audit does not establish a need to change sending cadence or rewrite the copy now. The page should distinguish pending-window, suppressed, technical-failure, delivered and action-observed states, and show the cold-outreach segment without overstating the available sample.
