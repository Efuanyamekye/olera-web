# Olera city campaign setup

City branch of `/ad-boost-setup`. This is Olera-owned acquisition through the existing four-step quiz, not a provider Ad Boost request. The September 2026 Charlotte/Dallas Google pilot is the implementation baseline; the Nextdoor campaigns for Charlotte and Dallas were submitted on September 9, 2026; both groups were Pending review, so delivery and performance remain unverified.

## 0. Resolve the packet

Use conversation, text, and screenshots first. Collect only missing cities, channel(s) (Google/Nextdoor/Meta), total budget, allocation per city/channel, flight duration/dates, and goal. Never multiply the authorized total when adding a channel or city. An agreed duration can be translated into proposed dates in the advertiser's timezone; show exact dates before publishing. Do not restart an already approved strategy discussion.

## 1. Reuse and verify the destination

Read `lib/city-ads/config.ts`, `app/care/[city]/page.tsx`, `CityLandingClient.tsx`, `app/api/city-leads/route.ts`, and the current city admin implementation. Check the deployed quiz and current records, not migration seeds alone.

- The quiz asks recipient, care type, urgency, then contact/consent. Payment and notes are optional after capture. Match the ad to this real flow.
- A new city needs a `CITY_CONFIGS` entry (slug, city/state, area, ZIP, timezone, campaign tag, routing mode) deployed to production, plus its campaign and fulfillment records. An arbitrary `/care/{city}` URL returns 404; city expansion is not automatic.
- Concierge mode means Olera calls the family. Check current callback coverage and pending leads. Never imply providers are on call when the pool is disabled. Auto routing requires actual provider commitment and enabled, non-test pool rows; do not enable prospects during ad setup.
- Inspect live callback wording and local staffed hours. Ad copy must not promise immediate or same-day service outside coverage. "Free" refers to Olera's help finding care, not free care.
- Do not submit a fake production request or advance quiz answers that trigger external notifications merely to inspect the flow. Use a local/staging environment with messaging mocked for end-to-end tests. Label read-only/source tracing separately from a verified production submission.

## 2. Attribution and city records

Canonical destination:

`https://olera.care/care/{slug}?utm_source=olera_city&utm_medium={medium}&utm_campaign={tag}`

Google uses `paid_search`; Nextdoor uses `paid_social`; Meta uses `paid_meta` in PR #1844. Preserve Nextdoor’s existing medium. Use the exact city campaign tag. Never substitute the provider source `olera_managed`. Verify the deployed classifier before building a Meta campaign; an open PR is not deployed infrastructure.

Read `docs/city-ads/CHANNEL-INFRASTRUCTURE.md` when available. PR #1844 (`lively-carson`) merged into staging on September 9 at `674a94615`, adding Meta conversion tracking, a channel rollup, and migration 220. This verifies staging integration, not production deployment or account configuration. Check current branches and migrations before choosing another number. Reuse the shared attribution and reporting implementation after it lands; do not duplicate it. A missing campaign row can indicate missing registration as well as incorrect attribution—inspect both.

`city_campaigns` has one row per city, channel, and flight. Reconcile existing drafts before inserting; Charlotte already had a Nextdoor draft in the original pilot. Preserve live Google records. Record actual platform ID, dates, budget in cents, status, and notes. Store the actual budget control, advertiser timezone, geo, creative, and authorization in `admin_note`.

The current admin supports editing campaigns, not creating them. If a row is missing, use an available authorized database path or prepare a reviewed, idempotent insert for the real schema. Do not pretend the row exists or replace it with a provider request. Do not mark live until serving is confirmed.

Trace UTMs from server search parameters through quiz submission into `city_leads.utm_source`, `utm_medium`, `utm_campaign`, and `campaign_tag`. Use tag + medium + actual flight window for reporting, exclude test leads, and account for returns outside the paid dates. Shared tags alone do not separate overlapping flights. Never aggregate only by city and call the result a channel comparison.

## 3. Build the selected channel

Use the visible browser and account verification rules in the parent command. In Codex, use the supported CUA workflow; do not run legacy CDP/shell browser recovery commands. If the site fails in Dia, inspect the error and try Chrome when permitted. A second failed surface is a platform/session blocker, not evidence of a saved draft.

### Nextdoor city track

- Verify the advertiser is **Olera**. Never create city campaigns inside Graceful or another provider's advertiser account.
- Objective: website visits, click optimization. Destination: the tagged city quiz, not a Nextdoor lead form.
- One campaign and one initial creative per city. Name: `Olera – {City} – {Mon YYYY} – Nextdoor`; include flight dates when names would otherwise collide.
- Use Olera's logo and inspected Olera-approved imagery. A representative photo must not be described as an actual local customer or partner. Inspect any auto-import and placement crop. Do not imply Nextdoor endorsement.
- Target verified service territories and record exact accepted locations. City pools follow franchise territory, so neither the existing Google metro DMA nor a provider’s 20-mile radius proves coverage. Verify concierge fulfillment for every included area; use supported city/ZIP targeting to match it. Do not accept a whole DMA merely because it is selectable.
- September 9, 2026 UI finding: Advanced Create rejected $50 over 14 days with a $10/day minimum; Quick Create exposed only daily spend running until paused. The historical $50 pilot workflow is not proof that the same controls remain available. Verify the current minimum and control before promising a flight, and resolve budget/duration changes with TJ. Do not switch to an uncapped ongoing daily campaign to evade a lifetime-budget constraint.
- Use the authorized budget control with explicit start/end dates: a lifetime cap where agreed, or a daily amount with a scheduled end when TJ authorizes that control. Daily amount × duration is planned spend, not a proven hard lifetime cap. If below a platform minimum, resolve the changed control/cost before publishing; never silently raise the budget.
- Keep public service-area evidence, direct case acceptance, and enabled automatic routing separate. A provider office address does not define its territory. Read `docs/city-ads/NEXTDOOR-GEOGRAPHY-RESEARCH.md` for the Charlotte/Dallas evidence and dated recommendations. Confirm the care recipient’s actual ZIP during concierge follow-up; the current quiz pre-fills a city ZIP and the automatic candidate selector does not verify ZIP coverage.
- Keep automatic placements for the pilot. Inspect the actual current category requirements for the ad being built; do not copy a provider's checkbox blindly when the offering changes.
- Use a city-specific headline and explain the quiz and Olera callback. CTA: Get started if available, otherwise Learn more. No medical-condition targeting, free-care claim, fabricated ratings, or unsupported callback guarantees.

Conversion tracking is separate from campaign-entry mechanics. Before adding Nextdoor browser/server events, verify its current supported API and deduplication behavior; do not assume Meta’s API applies. Reuse the city-only configuration guard and successful, nonduplicate, routable-lead gate where appropriate. Do not send care answers to an ad platform. A pixel improves measurement; its absence does not establish why a previous flight generated no contactable leads. Do not claim conversion optimization is ready without verifying the account’s event setup.

### Meta city track

PR #1844 supplies infrastructure, not a verified campaign-building procedure. Inspect its deployed prerequisites and the actual account, then record the hand-built workflow before treating this channel as a repeatable launch track. Preserve separate channel sections and the subject-first entry gate.

### Google city track

Reuse the parent Google browser, search-only, account hygiene, policy audit, keyword inspection, negative-keyword, and post-publish verification steps. City-specific destination, Olera identity, geography, budget/CPC, and records override provider defaults. Read an existing city campaign before copying it. The original city pilot used a $300 allocation and $6 CPC cap; those are historical settings, not standing authorization for new cities. Do not apply a home-care negative list to an assisted-living campaign. Match each ad group's care intent to the landing proposition.

## 4. Final review and publish

Present both cities together when possible: advertiser/account ID, exact name, objective, accepted geo, complete URL, headline/body, inspected image/crop, CTA, lifetime cap or actual control, start/end/timezone, city record/tag, and combined total. Distinguish local packets from platform-saved drafts.

Follow the parent command's final gate: **TJ says create/publish after the concrete review, then submit.** A Create button can immediately start review and eventual spend. Respect any stricter tool handoff rule. Do not recreate a campaign because an under-review modal appears.

## 5. Reconcile and learn

Reopen each campaign and verify settings, ID, review/serving state, and no duplication. Reconcile city records behind `/admin/city-ads` immediately after authorized publication; no provider live-email workflow applies. Read the actual schema and current rows first. The current UI cannot insert campaigns or edit every flight field; an authorized direct database operation is appropriate for those gaps, then reload the admin to verify.

Use this record contract:

| Field | Value and verification |
|---|---|
| `slug`, `channel`, `campaign_tag`, `utm_medium` | Existing city slug, `nextdoor`, exact city tag, `paid_social` |
| `platform_campaign_id` | Actual campaign ID, never the group/ad ID |
| `flight_start`, `flight_end` | Platform calendar dates; put exact times and timezone in notes |
| `budget_cents` | Planned whole-flight allocation in cents: $10 × 14 = `14000`; notes must state the daily control, not a hard lifetime cap |
| `max_cpc_cents` | `null` for verified Autobid; do not copy the review page's unexplained $2.25 summary |
| `status` | `scheduled` for a published future flight/pending review; `live` only when serving is confirmed; `ended` after stop verification |
| `ring_label` | Actual included service cities; never retain a copied metro label |
| `admin_note` | Platform review state and observation date, account/group/ad IDs, full URL, copy, image, CTA, placements, exact schedule, budget authorization, concierge routing and relevant caveats |
| Performance fields | Preserve existing metrics; leave unmeasured values null. A dashboard range ending yesterday does not establish today's zero spend |

Reuse a matching unpublished placeholder after checking its tag, null platform ID, draft status and absence of spend. Do not overwrite a historical flight. Insert a missing row only after checking `(slug, channel, flight_start)` and platform ID for duplicates. Preserve existing notes, all Google/Meta rows, leads and provider-pool settings. Re-read both updated rows after writing and compare untouched channels against their pre-write values. Existing `scheduled` plus explicit pending-review notes avoids inventing a new DB status or consuming a migration number. Leave under-review campaigns scheduled with their platform state in notes until serving.

Measure spend/impressions/clicks, tagged landings, quiz engagement, contactable qualified submissions, reached families, and provider outcomes. Platform pixel conversions alone do not decide success. Do not count anonymous engagement as leads or claim statistical superiority from a small pilot. Existing Google/Nextdoor provider pilot CPC is a hypothesis input, not a city lead forecast.

Use equivalent reporting windows where possible; a later Nextdoor launch is a directional comparison. Check delivery soon after serving and assess the agreed day-5/day-14 reads. Do not claim a reminder, Slack report, or monitor is scheduled unless it actually is. Verify the platform stops at flight end. Save the actual campaign IDs, settings, outcomes, and blockers in the session log and use them to improve this runbook.

### Advanced-mode execution and recovery (verified September 9, 2026)

- Save updates persists group geography. Verify selected chip labels and 0 countries; a populated search input is not a selected city. Exact queries such as `Concord, NC` reduce ambiguous matches. Native AX result clicks sometimes only closed the menu; screenshot-based result clicks worked.
- Create in Advanced mode when an explicit end time is required. Quick/Advanced mode switches can reset location, budget, dates and creative; after switching, verify every field. Saved images can be reused through Add media > Saved images, then inspect the placement crop. Text-area writes must update the preview and character count, not just appear in an input.
- Campaign duplication copies groups and ads. Before launching a second city, replace every copied location, rename campaign/group/ad, and use **Actions > Clone creative** before changing city copy/URL so the original creative remains independent.
- Ad-only **Publish/Create ad** can leave the ad Pending review while its campaign/group remains Draft. Verify all levels; do not claim serving from the ad review status.
- Ad-edit **Save and Review** displayed an inconsistent $1,000/day payment panel for a stored $10/day group. Do not publish that screen. Opening the direct group edit, re-entering the authorized `10`, and using **Save and Review** corrected the payment to $10/day in this session. Verify again each time; never lower the real budget to compensate for a suspected display bug.
- The campaign review summary also showed a $2.25 bid and all placement names while the saved group editor showed Autobid and the ad table showed Newsfeed. Record the discrepancy and rely on verified configuration; do not silently claim these were intentional settings.

- After full campaign Publish, both campaign switches were on and both groups changed from Draft to Pending review. Campaign status read No active ad groups until review completes. This is a submitted campaign, not proof of serving. Re-read group budget and Auto bid after publication; both remained $10/day with Sep10–24 dates.
