# Ad Boost queue performance audit

Date: September 14, 2026. Scope: `/admin/ad-boost`, the admin provider queue shown in the screenshots, its API, campaign detail, shared admin layout/auth/sidebar, activity readers, and committed database indexes.

## Implementation follow-up

Implemented locally on `codex/ad-boost-queue-performance`, based on staging `16038abcb`:

- Campaign-scoped, chunked and paginated activity/email reads; counted first pages avoid unnecessary empty-page requests. Independent enrichments and tab counts run concurrently.
- Queue query failures return an explicit unavailable response instead of successful zeros or empty communication summaries. The client retains the previous successful snapshot and offers retry.
- A 60-second memory cache survives admin navigation, preserves filters/sort/expanded providers, and clears on identity changes or attempted campaign mutations. Background requests are cancellable, bounded, and guarded against late tab responses.
- Stable initial skeletons, unknown initial counts, refresh timestamps, smaller review-badge payloads, and deferred MedJobs startup work on cold queue visits.
- Campaign details reuse the receipt's leads, stats and questions. The API exposes per-stage Server-Timing headers and private/no-store responses.
- Migration `229_ad_boost_queue_indexes.sql` prepares matching activity, email, and provider-question indexes. It has NOT been applied to a database. Review live indexes/query plans and apply through the deployment workflow; no database credentials were available here.

Validation: `npx --no-install tsc --noEmit`, twelve regression checks via `node --test scripts/tests/ad-boost-performance.test.cjs` (including React behavior in a simulated DOM), `npm run check:crons`, and `git diff --check` passed. Production speedup and live query plans remain unmeasured. The intentional timeout fixture logs an error during the regression run; its expected result is HTTP 503 with no false metrics.

Pre-test review: reproduced and fixed two additional regressions. A failed optional landing/traction lookup after a committed save no longer interrupts launch/photo notifications; it returns a save warning and skips only the unverified traction email. A remembered lifecycle filter falls back to All if that status no longer exists; the active attention filter and All escape remain visible even at zero. Both have regression coverage. At pre-test, GitHub confirmed no PR existed for this branch. Quicksave subsequently prepared the changes for a staging PR.

Deployment follow-up: apply/review the index migration, deploy a staging preview, compare Server-Timing and time-to-first-provider with the baseline, and confirm the established campaign metrics. Database-side aggregate RPCs and hosting-region changes are deferred until these scoped queries can be measured; this implementation does not require either to run.

## Evidence and limits

The working checkout is `52b56428f` (September 4). Remote refs were refreshed and the findings checked against production branch `949df26c7` and staging `16038abcb` (September 14). The relevant queue/API/activity/receipt files have no differences between those current remote branches. No application code or deployed configuration was changed.

The authenticated live page was inspected. It showed 25 queue campaigns, eight live provider rows, and zero landings for all eight visible rows; the user's earlier screenshot showed nonzero landings. This is an observed discrepancy, not proof of a particular database failure. The browser inspection interface did not expose Resource Timing, and native browser inspection timed out. No local dependencies or `.env.local` were present, and no Supabase or Vercel diagnostic connector was available. Consequently there are no measured endpoint percentiles, query execution plans, verified deployed indexes, or verified function/database regions in this audit. Code findings below are confirmed; their relative runtime contribution remains to be measured.

## Main finding: the first rows wait for an entire analytics response

The client starts its queue fetch in an effect after the admin layout permits it to mount. On a fresh admin entry, the layout first waits for `/api/admin/auth`. The queue API then performs its own authorization and builds the entire response before the browser receives any campaign rows.

The normal populated queue path has this dependency chain:

```text
Admin layout authorization → mount page → fetch queue
  → admin membership lookup
  → campaign rows
  → email history and summary
  → [lead activity → benefits activity] alongside landing activity
  → question asks → question topic statuses
  → active/archive counts
  → send response → render providers
  → fetch overdue review badges
```

There are up to ten database requests in the list handler, including its admin lookup, arranged across roughly eight sequential database stages. Token validation and the separate admin-auth endpoint are additional. Query count is bounded rather than one query per provider, but unnecessary sequential stages still add their latency together.

Sources: `app/admin/ad-boost/page.tsx:48`, `app/admin/layout.tsx:45`, `hooks/useAdminAuth.ts:31`, `app/api/admin/ad-boost/route.ts:54`, `:246`, `:290`, `:338`, `:376`, `:448`.

## Prioritized changes

### 1. Scope the activity and email queries; verify supporting indexes

`countAdLandingsByCampaign` requests managed page-view metadata across all campaigns, with a 50,000-row limit, then filters to requested tags and deduplicates in JavaScript. `countDeliveredByCampaign` does the same with two more activity queries; its inquiry and benefits reads run sequentially. None filters `utm_campaign` in SQL. A one-campaign detail request therefore still reads activity for the whole program.

The email summary requests the latest 5,000 Ad Boost emails across all campaigns, including full metadata, then checks request IDs in JavaScript. Older relevant emails can disappear from the summary as unrelated campaigns generate more mail. This could eventually produce false missing-email warnings as well as excess work.

First restrict activity by the actual requested campaign tags and emails by request IDs inside the database query. Deduplicate input tags and bound/chunk long filters. Then move campaign counts and communication summaries into database aggregation so the response transfers aggregate rows rather than raw event histories. Preserve current attribution semantics: landing session deduplication, internal-traffic exclusion, inquiry connection/session fallback, benefits profile deduplication, and the existing question attribution fallback.

Committed migrations have ordinary activity event/provider indexes, but no matching expression indexes for these managed-UTM JSON filters or email request-ID JSON lookups. Check the deployed catalog before adding anything. Candidate designs are a partial activity index on event type and `metadata->>'utm_campaign'` for managed-source events, a corresponding benefits-completion index, and an email index on `metadata->>'request_id'`, email type, and creation time. Validate exact predicates and column order with query plans and production distributions. Question asks have identity/date and campaign indexes in migration 185. Implementation review confirmed that the identity/date index uses provider_identity_key, whereas this reader filters provider_id; those are different columns.

The 50,000 and 5,000 values are requested caps, not measured result sizes; server-side API limits can further restrict results. Increasing caps is not a fix. Exact summaries need SQL aggregation or complete pagination rather than silently capped raw reads.

Sources: `lib/ad-boost/delivered.server.ts:51`, `:68`, `:89`, `:125`, `:138`; `app/api/admin/ad-boost/route.ts:291`; migrations 024, 026, 027, 185. [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization) and [index guidance](https://supabase.com/docs/guides/database/postgres/indexes).

### 2. Remove unnecessary sequential query stages

Start tab counts alongside the campaign list after authorization. Once campaign rows are known, run communications, landings, delivered counts, and questions concurrently; keep only real dependencies, such as asks before topic lookup. Run the two delivered-funnel reads together. This reduces the critical path without changing the displayed data or introducing staleness.

Avoid replacing ten requests with hundreds of per-row requests. The existing batched questions approach is valuable and should remain batched. An aggregate RPC can later reduce round trips further.

### 3. Stop converting failed reads into zero performance

Activity readers destructure only `data`, discarding database errors. Null data becomes an empty array, which becomes zeros. The queue's questions reads likewise ignore errors, and communication errors are logged but become empty summaries. A query timeout can therefore delay the page and then report misleading numbers or missing-email actions.

Represent success, loading, unavailable, and stale separately. Preserve the last good metric value with an update timestamp on refresh failure. Do not use unavailable metrics to compute a definitive operational priority or missing-send warning. A successful zero remains a real zero. This is especially important before adding caching, so failed zeros do not become cached truth.

### 4. Keep the queue visible during navigation and refresh

The page has only component-local state. Mounting it or changing Queue/Archived clears requests to null and shows a plain loading line. There is no explicit queue cache, request cancellation, stale-response guard, or fetch timeout. Rapid tab changes can allow an old response to overwrite the current view. Every successful load also resets the status filter to Live/All, including reloads following a row action.

Use an admin-session-scoped cache keyed by queue view. Show a recent successful result immediately, refresh in the background, and invalidate affected entries after archive/restore/status changes. Clear session data on sign-out. Preserve the user's selected filter, expanded providers, and scroll position. Add cancellation or request-generation guards plus a bounded timeout and retry control.

For a truly cold visit, use stable row skeletons and unknown count placeholders rather than `Queue (0)`. If measurements still show expensive optional enrichment, return provider identities/status first and populate metrics independently. Until enrichment is complete, show a loading state for next actions and avoid changing priority order repeatedly under the operator's pointer.

Overdue badges already load after rows are set, so they do not explain the first-row delay. Their endpoint returns full case details where this page only needs request-ID counts; make that response smaller as a secondary improvement.

### 5. Eliminate duplicate work when opening a campaign

The detail API calls `listLeadsByCampaign` directly and also inside `getCampaignReceipt`. For live/ended campaigns it calls `getCampaignStats` and `getCampaignQuestions` after the receipt has already called both for the same campaign/window. Reuse one computed result and expose the additional question fields needed by the detail response, or share request-local promises. Keep rolling-week reads separate where the windows differ.

This does not explain initial queue loading, but it directly affects the next interaction: opening a provider. The receipt does not fetch live Google Ads data on this read path; ad figures come from stored request fields, so waiting for the Google Ads API is not the queue's cause.

Sources: `app/api/admin/ad-boost/route.ts:147`, `:224`; `lib/ad-boost/receipts.server.ts:106`.

### 6. Reduce unrelated sidebar work and measure hosting locality

On admin mount, the sidebar requests favorites, MedJobs counts, SMS counts, and support-email counts alongside the queue. The MedJobs endpoint starts ten top-level query/helper operations, with further processing, even on Ad Boost. Cache its successful result briefly and defer refresh until the active page is usable; consider fetching it on expansion when appropriate. SMS/support-email already use count-only paths, so they are smaller targets. These requests are concurrent competition, not an explicit dependency holding queue rendering.

The shared auth provider already skips public profile hydration on admin routes. The layout also explicitly avoids waiting for that hydration, and sidebar links disable prefetch. These optimizations are present already. Do not remove authorization to save a database read; consolidate duplicate checks within a server request if restructuring the shell, while retaining authorization on every API.

No explicit function region is set for this API in the inspected route/config. Verify project settings and Supabase placement before recommending relocation. A function far from the database makes every sequential query more expensive. [Vercel recommends placing functions close to their data source](https://vercel.com/docs/functions/configuring-functions/region). Cold starts, database CPU/IO/connection pressure, cron overlap, and browser/network latency remain hypotheses until measured. Global marketing scripts are a lower-priority bundle/CPU check; no profile supports blaming React rendering for eight visible rows.

## Implementation and verification order

1. Add server timings for authorization, campaign rows, communications, each activity reader, questions, counts, and total response. Log query errors, returned-row counts, and truncation without raw event metadata. Capture fresh-page, repeat navigation, archive switching, and campaign-detail timings.
2. Fix error-versus-zero handling, scope database filters, and parallelize independent reads. Review deployed query plans and add validated indexes. Keep existing metric definitions intact.
3. Add session-scoped queue reuse, stable loading states, cancellation, filter preservation, and mutation invalidation. Reuse detail computations and defer the unrelated sidebar workload.
4. Add SQL aggregates if filtered raw reads remain expensive or capped. Consider a short-lived aggregate cache only after correctness and invalidation are defined.

Compare p50/p95 queue API time and time-to-first-provider before/after using the same representative campaigns, both warm and cold, plus response bytes and database rows read. Suggested product targets—not predictions—are sub-second warm queue responses and immediate rendering on a cached return visit. Baseline measurements should determine realistic cold-load goals.

Regression coverage should include real zero versus query failure, internal landing exclusion, repeated session deduplication, both conversion funnels, custom/default campaign tags, repeated providers across flights, question status/attribution fallback, successful/bounced email handling, rapid tab switching, mutation refresh, and sign-out cache clearing. Validate unchanged business metrics against a known-good database result. For implementation, run the repository TypeScript check once dependencies are installed; cron checks are needed only if cron code changes. No code tests were run for this read-only audit.
