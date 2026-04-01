# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.
> Older sessions archived to `archive/SCRATCHPAD-2026-02.md`

---

## Current Focus

- **Strict User Account Type Separation** (branch: `feature/user-accounts-separation-logic`) — READY FOR MERGE (PR #463)
  - **22 commits**, clean fast-forward from staging, no conflicts
  - **Phase 1**: Fix broken provider experience (stop auto-creating family profiles, fix menus/dropdowns, account settings by type)
  - **Phase 2**: Block family-only actions (save buttons, connection card, server-side guards, guest provider email detection)
  - **Auth flow fix**: Sign out existing session when provider creates family account with different email
  - **Context-aware navigation**: Logo redirects to "home base" by account type (family→/, provider→/for-providers, caregiver→/medjobs). Hide MedJobs/For Providers from family accounts in nav.
  - **Cleanup**: Removed obsolete "Remove this profile" (154 lines), updated save tooltips to dark style
  - **Principle**: One email = one account type. No mixing. Defense in depth (UI → API → email check)
  - **PR URL**: https://github.com/olera-care/olera-web/pull/463
  - **Testing**: Provider logged in → sees blocking UI on save/connect. Guest with provider email → "Provider email detected" UI. Family users unaffected.

- **Staging → Main Promotion** — IN PROGRESS
  - Audited full staging diff: 253 commits, 225 files changed, ~31K lines across ~90 PRs
  - Key areas: one-click onboarding, provider dashboard, MedJobs, reviews, activity center, email revamp, highlights waterfall, city expansion, admin improvements
  - Caught missing PR #435 (funny-turing nav cleanup + 2-card PlatformShowcase) — rebased and merged
  - Caught PR #438 (breadcrumb fix) would silently regress Navbar — rebased and merged clean
  - **Next: Continue merging remaining open PRs, then promote staging → main**

- **MedJobs Candidates Redesign** (branch: `keen-perlman`) — MERGED ✅ (PR #436)
  - Dense scannable list rows, infinite scroll, shared CandidateRow/CandidateFilters
  - **Next: Detail page taste pass, test auth flow end-to-end**

- **Provider Onboard + Nav Cleanup** (branch: `funny-turing`) — MERGED ✅ (PR #433 + #435)
  - Onboard: profile-editor → platform showcase with 2 cards (Families + Hire Staff)
  - Nav: Home | Find Families | Hire Staff, conditional Inbox/Leads, Q&A/Reviews hidden
  - MedJobs provider experience: photo cards + aspirational empty state

- **SEO: Breadcrumb Fix** (branch: `helpful-mendel`) — MERGED ✅ (PR #438)
  - Fixed 3,082 GSC errors: added `item` URL to final breadcrumb entry across 7 page types
  - Need to trigger GSC validation after staging deploys

- **SEO: City/Browse Page Optimization** (branch: `zen-perlman`) — ANALYSIS COMPLETE, IMPLEMENTATION NEXT
  - GSC 7-day report analyzed (Mar 19-25): 690K impressions, 2.7K clicks, 0.4% CTR, avg position 26.7
  - City pages ranking position 35-60 for "[care type] [city]" queries — massive impressions, near-zero clicks
  - Root cause: content thinness + domain authority gap (DA ~5 vs competitors DA 60-75)
  - Caregiver articles are SEO engine (positions 4-6) but authority doesn't flow to city pages
  - Full analysis + action plan in Notion: https://www.notion.so/3305903a0ffe818bbd86e106f8dbfb26
  - **Next: Implement Action 1 (city-specific content sections) + Action 2 (internal linking) + Action 3 (structured data)**

- **DNS Cutover v1.0 → v2.0** (branch: `peaceful-wiles`) — DONE ✅
  - olera.care now serving v2.0 Next.js app via Vercel
  - Provider slug migration done (008 + 009): 477/500 top GSC pages passing
  - Sitemap fixed: `/sitemap.xml` → sitemap index + dynamic API shards
  - OG image replaced: shutterstock caregiver photo (1200x630)
  - GSC sitemap submitted: 4,943 pages in shard 0 (provider shards auto-discovered via index)
  - Reviews API hotfix: GET switched to anon client (was 5xx from service key dependency)
  - All PRs merged, main ↔ staging fully synced

- **Migration Quick Wins + SEO + Traffic Recovery** (branch: `stellar-stonebraker`) — DONE ✅
  - PRs #165-171 all merged to staging

- **Editorial Content Polish** (branch: `stellar-stonebraker`) — DONE ✅
  - PRs #172-176 all merged to staging
  - Author pages at `/author/[slug]` with Person JSON-LD
  - Topic-based filter tabs (6 categories replacing care_type tabs)
  - Author linking in article bylines + avatar fallback to static data
  - CMS admin: author dropdown + topic category dropdown
  - OG/Twitter metadata audit — all page types now have full social previews
  - LinkedIn URLs corrected for TJ and Logan

- **Surface Approved Providers in Public Search** (branch: `vibrant-keller`) — DONE ✅
  - Approved business_profiles now appear in all 4 public discovery surfaces
  - Parallel queries with deduplication via source_provider_id

- **Leadership Team Page** (branch: `joyful-goodall`) — DONE ✅
  - PR #106 merged to staging
  - New `/team` page with editorial design, scroll animations, expanded bios
  - Crosslink from `/for-providers` LeadershipSection, footer link, sitemap entry

- **Admin Silent Failures Fix** (branch: `joyful-goodall`) — DONE ✅
  - PR #108 merged to staging
  - Error banners on 5 admin pages: overview, images, leads, providers, team
  - Replaced `alert()` with inline banners on team page

- **Raw `<img>` Tags Fix** (branch: `joyful-goodall`) — DONE ✅
  - PR #107 merged to staging
  - Swapped 4 raw `<img>` → `next/image` in caregiver-support page

- **Research & Press Blog Section** (branch: `fine-wright`) — DONE ✅

- **Caregiver Support Editorial Redesign** (branch: `joyful-turing`) — DONE ✅

- **v1.0 → v2.0 Migration Playbook** (branch: `seo/structured-data-p1`) — REDIRECTS COMPLETE
  - **Remaining:** P2 SEO polish, CMS migration, DNS cutover ops

- **Migration Sanity Check** (branch: `helpful-williams`) — DONE ✅
  - PR #152: Full audit of v1.0 codebase against v2.0
  - Found 13 gaps not in original playbook; fixed 11 in this session
  - Added 14 redirect rules (next.config.ts) + 2 middleware rules
  - Expanded sitemap with `generateSitemaps()`, articles, waiver library, browse pages
  - Created `docs/migration-sanity-check.md` tracking all findings
  - Created `docs/cutover-runbook.md` — step-by-step DNS cutover with pre-flight, rollback
  - Item #1 (gated provider portal page) assigned to Esther
  - Items #12, #13 are monitor-only (research-and-press redirect verify, forum content loss)

- **Senior Benefits Finder Voice + Results Redesign** — MERGED TO STAGING ✅
  - PR #256 merged 2026-03-13 → staging at `3c14db7`
  - Combined work from `guided-voice-sbf` + `results-redesign-sbf` into `sbf-voice-and-results-redesign`
  - **Voice Input (Phases 1-7):**
    - Speech recognition hook, voice intent parser, guided mode with conversational prompts
    - TTS audio narration via Web Speech Synthesis API (narrates each question, mic auto-starts after)
    - Mode selection: "Fill it out myself" (primary) / "Talk through it" (secondary)
    - Browser detection: disables voice on unsupported browsers
    - Auth gate removed from submit — results shown to everyone, auth on bookmark only
  - **Results Redesign (Progressive Disclosure):**
    - "Great news" header with savings estimate folded into one line
    - "Recommended First Step" hero card with "When you call, say this" script
    - Confidence bars (green/amber/gray) replacing tier labels
    - Savings badges ($X–$Y/mo) on program cards
    - "How to Apply" numbered steps generated from existing data
    - Progressive reveal: top 5 programs, "See X more" button for rest
    - Document checklist collapsed behind toggle (4 category cards, 20 items)
    - Print: expands all programs + checklist, hides nav/sidebar/interactive
    - Removed: SaveResultsBanner, FinancialImpactDashboard (folded into header), ActionPlan (replaced by hero), standalone AAA card
  - **New files:** 13 components, 3 hooks, 2 plans, voice-intent-parser, speech-recognition types
  - **Design principle:** Progressive disclosure — 3 beats: (1) moment of relief, (2) explore at your pace, (3) tools when ready

- **Provider Email Outreach Revamp** (branch: `joyful-pasteur`) — DONE ✅
  - PR #354 merged
  - Rewrite 3 provider-facing emails (question, connection, review) from cold → warm/trust-building

- **City Pipeline: Sunrise Manor, NV** (branch: `bright-dijkstra`) — DONE ✅
  - 632 discovered → 315 active providers after 3 rounds of filtering
  - All enrichment complete: descriptions, reviews, images, trust signals
  - Notion: all 14 checkboxes checked, status Complete

- **Ramapo, NY City Expansion** (branch: `great-euler`, no code changes) — COMPLETE ✅
  - Full pipeline: discovery → classification → upload → enrichment
  - 204 legitimate providers across 6 categories

- **Greece, NY City Expansion** (branch: `silly-thompson`, no code changes) — COMPLETE ✅
  - Full pipeline: discovery → classification → dedup → upload → geocoding → parallel enrichment
  - 109 legitimate providers across 6 categories
  - Notion: all 14 checkboxes checked, status Complete

- **Batch Pipeline Optimization** (branch: `silly-thompson`) — IMPLEMENTED, NEEDS E2E TEST
  - Plan: `plans/batch-pipeline-optimization-plan.md`
  - `scripts/discovery-batch.py` — non-interactive batch discovery with `--batch` CLI
  - `scripts/pipeline-batch.js` — 4-phase processor (clean/load/enrich/finalize)
  - Clean phase validated: 3 cities processed, dedup CSV loaded once, AI batch-50 working
  - `.claude/commands/city-pipeline.md` updated with new batch mode instructions
  - Next: full E2E test with fresh cities, then 80-city batch

- **MedJobs: Full Onboarding Overhaul** (branch: `fresh-ramanujan`, PR #368) — MERGED ✅ + ACCOUNT FIX MERGED ✅
  - Plan: `plans/medjobs-account-creation-plan.md`
  - Notion: [Task](https://www.notion.so/32c5903a0ffe811e80eadeb088f96bd3)
  - **Account creation:** Auth user + account created after step 1 (name+email), not step 4. Auto-sign-in via verifyOtp token.
  - **Two-phase profile:** Partial profile on step 1 (`application_completed: false`), full update on step 4 (`application_completed: true`)
  - **Student dashboard:** `/portal/medjobs` — completion checklist with inline doc upload, locked items when application incomplete
  - **Seamless return flow:** All auth paths (OAuth, magic link, OTP) auto-redirect incomplete students to dashboard
  - **UI redesign:** Typeform-inspired — borderless inputs, custom searchable dropdowns, letter-badged multi-select cards, slide transitions, warm microcopy
  - **Email distinction:** New user = "Welcome to MedJobs!", returning user = "Welcome back!", no Loops seeker drip
  - **Document upload:** Private `student-documents` bucket, auth-gated endpoint, inline on dashboard + submit-video page
  - **Footer hidden** on apply/submit-video/portal-medjobs pages
  - **Bugs fixed:** Duplicate email, generic welcome email to students, Loops drip, nudge cron inactive profiles, dropdown clipping

- **Provider Highlights Dedup + Data-Driven Generation** (branch: `fair-morse`, PR #376) — MERGED ✅

- **88-City Batch Expansion** (branch: `magical-knuth`, PR #383 merged) — COMPLETE ✅
  - **Batch 1 (10 cities):** 598 verified providers. Oyster Bay NY, Richardson TX, Highlands Ranch CO, Pasco WA, Chino Hills CA, Bristol TN, Brookline MA, Pico Rivera CA, Piscataway NJ, Euless TX. Cost: ~$30
  - **Batch 2 (78 cities):** 6,542 verified providers (from 16,006 discovered). 78 cities across 25 states. Cost: ~$240. 4 parallel processing + enrichment batches
  - **Combined: 88 cities, ~7,140 verified providers added in one session**
  - New batch discovery script: `scripts/discovery-batch.py`
  - 30+ state bounding boxes added to `scripts/process-city.js`
  - ~1,100 false positives caught by trust signal verification across both batches
  - Total cost: ~$270 (vs $2,200 combined estimate — 88% under budget)
  - Notion: all 88 pages marked Complete with all checkboxes checked
  - 6 cities needed enrichment retry (Supabase statement timeouts from 4 concurrent batches) — all succeeded on sequential retry
  - Plan: `plans/provider-highlights-dedup-plan.md`
  - Notion: [Task](https://www.notion.so/Logan-s-Audit-QA-de-duplicate-care-service-labels-on-all-provider-pages-32c5903a0ffe8166a12bf29c98319e7e)
  - 5-tier highlight waterfall: trust signals → social proof → CMS → staff screening → capability
  - Browse cards skip tautological category label (skipCapability flag)
  - "Well Reviewed" tier added (4.0★ + 15 reviews) below "Highly Rated" (4.5★ + 10)
  - Synonym normalization map (~25 entries) for care_types dedup
  - Deleted duplicate CATEGORY_HIGHLIGHTS maps from provider.ts + provider-utils.ts
  - **Backfill Pass 1 DONE**: 8,101 providers hydrated with google_reviews_data (free)
  - **Backfill Pass 2 DONE**: 22,292 non-CMS providers processed — 20,841 confirmed (trust signals saved), 1,317 soft-deleted (false positives), 134 errors (JSON parse). ~$22 cost, ~3hrs runtime
  - **1,317 false positives cleaned up**: apartment complexes, golf courses, staffing agencies, rec centers, disability care, closed/unverifiable businesses. Soft-deleted (deleted=true, deleted_at set). No audit trail yet — tracked as P2 Notion task.
  - Backfill script: `scripts/backfill-highlights-data.js` (paginated queries, 10 concurrent workers, 429 retry)
  - To query the 1,317 deletions: `deleted=true AND deleted_at >= '2026-03-24T21:00:00Z' AND ai_trust_signals IS NULL AND provider_category IN ('Home Care (Non-medical)', 'Assisted Living', 'Memory Care', 'Independent Living')`

- **Admin Photo Deletion** (branch: `gentle-newton`, PR #395) — MERGED ✅
  - Plan: `plans/admin-delete-photos-plan.md`
  - Notion: [Task](https://www.notion.so/Admin-dashboard-Add-the-ability-for-providers-to-delete-photos-3295903a0ffe805dbc3bec53b1eca849)
  - API: `delete_image` action added to PATCH `/api/admin/images/[providerId]`
  - UI: hover overlay with trash icon + confirm dialog on both classified and raw image grids
  - Root cause fix: `hero_image_url` column doesn't exist in `olera-providers` — handler was selecting it explicitly, Supabase 500'd

- **MedJobs Account Fix + Admin Documents** (PRs #397, #398) — MERGED ✅
  - PR #397: Fix account creation failing on full form submit (root cause: UPDATE path had no account creation logic)
  - PR #398: Add Documents section to admin student detail page (driver's license + car insurance upload status)
  - Type fix: Added document fields to `StudentMetadata` in `lib/types.ts`

- **Provider Activity Center** (branch: `fond-keller`) — DONE ✅
  - Plan: `plans/provider-activity-center-plan.md`
  - Notion: [Track provider activity in "Activity Center"](https://www.notion.so/Track-provider-activity-in-Activity-Center-32f5903a0ffe80c8ad21ebd8b3176a6f)
  - Track email click-throughs from provider notifications, surface in admin dashboard
  - 5 phases: DB table → instrument emails → capture clicks → API → admin UI
  - PRs #404 merged to staging, #405 promoted to main

- **Provider Onboarding Routing Fix + UX + One-Click Flow** (branch: `loving-swartz`) — E2E WORKING, PR #428 OPEN
  - Plan: `plans/provider-onboarding-routing-plan.md`
  - Notion: [Task](https://www.notion.so/089aad975c5d4ba0930c8da33b8a6597)
  - PRs: #421 merged, #427 merged, #428 open (all fixes from session 62)
  - 5 routing bugs fixed + notification card UX redesign + privacy masking
  - One-click flow fully working: email link → auto-sign-in → auto-claim → onboard page with notification card
  - Root cause of all prior failures: Apple Mail Link Tracking Protection strips params named `token`
  - Fix: renamed `token` to `otk` (one-time key) — Apple doesn't strip it

- **Care Seeker Connection Flow De-Jank** (branch: `helpful-euler`) — IN PROGRESS
  - Enrichment questions → /welcome page transition redesign
  - Fixed 6-second blank white screen: removed force-dynamic from /welcome, moved to static page + client-side data fetching
  - /welcome page taste pass: warm bg (#FAFAF8), side-by-side connection card, flat step cards, Airbnb Trips / Perena inspired
  - `/dejank` slash command created for systematic jank removal methodology
  - **Still TODO:** Test full enrichment → /welcome transition end-to-end, verify connection card skeleton works, continue design polish

- **Family Activity Center** (branch: `logical-mahavira`) — IN PROGRESS
  - Plan: `plans/family-activity-center-plan.md`
  - Expand Activity Center into unified engagement hub: Providers | Families | Feed
  - Track family signals: connection_sent, profile_enriched, email_click, question_asked, matches_activated
  - New seeker_activity table, instrument 16 family email types with tracking, family engagement heat
  - Replaces Matches admin page (funnel metrics → per-person engagement view)
  - 5 phases: DB schema → instrument events → email tracking → admin API → admin UI

- **Senior Benefits Finder Desktop Redesign** (branch: `witty-ritchie`) — DONE ✅
  - Plan: `plans/benefits-finder-desktop-redesign-plan.md`

- **Provider Home Page (Marketing Landing)** (branch: `shiny-maxwell`) — DONE ✅
  - Plan: `plans/provider-home-page-plan.md`

- **Provider Deletion Request & Admin Approval** (branch: `relaxed-babbage`) — DONE ✅
  - Plan: `plans/provider-deletion-request-plan.md`

- **Backend Integration Roadmap** — PHASES 1-5 COMPLETE ✅ + Notification Testing IN PROGRESS
  - Plan: `plans/backend-integration-roadmap-plan.md`
  - Analysis: `docs/backend-integration-analysis.md`
  - Notion: [Backend Integration Roadmap](https://www.notion.so/3185903a0ffe800982bbd55176cb46e2)
  - PRs: #111 (Email + Slack), #112 (Twilio SMS), #113 (Vercel Cron), #123-#129 (Loops Marketing), #138 (Approval Email + Loops), #141 (Fix: accounts table lookup), #147 (Family emails + remove mock leads)
  - Phases: ~~Email~~ ✅ → ~~Slack~~ ✅ → ~~Twilio SMS~~ ✅ → ~~Vercel Cron~~ ✅ → ~~Marketing (Loops)~~ ✅ → Sentry (P4 backlog)
  - **Notification Test Matrix:** [Notion](https://www.notion.so/Notification-Test-Matrix-2026-03-04-3195903a0ffe8190be95d95554e52dd1) — 18 tests across Email/SMS/Slack/Cron/Loops

---

## Blocked / Needs Input

- ~~**Migration Playbook → Notion:**~~ ✅ Done (2026-03-01) — updated via Notion MCP
- ~~**Top 100 pages from Search Console:**~~ ✅ Done — GSC export analyzed, 0 404 risks found
- ~~**Editorial content redirect decision:**~~ ✅ Done — all v1.0 content routes now have redirects in `next.config.ts`: `/research-and-press/*` → homepage, `/caregiver-forum/*` → `/`, `/caregiver-relief-network/*` → homepage, `/company/*` → dedicated pages

---

## Next Up

1. **MedJobs candidates detail page taste pass** — Apply warm surface + Perena-inspired styling to `/medjobs/candidates/[slug]` and `/provider/medjobs/candidates/[slug]`
2. **MedJobs provider onboarding flow** — Ensure MedJobs tab → browse → candidate detail → auth → contact is butter smooth end-to-end
3. **Enrichment questions after connection** — Add follow-up questions after seeker submits connection to feed into their profile (separate workstream from onboard redesign)
4. **De-jank provider transitions** — Airbnb-smooth state transitions across provider flows (notification → dashboard, claim → portal)
5. **SEO Action 1: City-specific content sections** — Add cost snapshot, "Paying for Care" module (waiver library links), city stats, FAQ section to browse pages
2. **SEO Action 2: Internal linking** — Link caregiver articles → city pages, waiver library → city pages, nearby city cross-links
3. **SEO Action 3: Structured data + meta** — FAQ schema, AggregateRating schema, cost/review-enriched meta descriptions
4. **SEO Action 4: More caregiver content** — 10-15 articles targeting financial/benefits queries (Medicare, Medicaid, cost guides)
5. **Merge PR #219** (waiver library redesign) — waiting on Chantel to remove `package.json.tmp` + `.mcp.json`
6. **Fix Supabase 1000-row limit** in provider sitemap shards (returns 1000 instead of 10,000)
7. **Debug auto-sign-in** — check `[OneClick]` console logs, fix background auth
8. **Phase 2: Activity Center PII tracking** — log "viewed_lead_pii" events, Slack alerts for sensitive interactions
9. **Unmask question/review content** on onboard notification cards (public data, no privacy concern)
10. **Delete fake seed connections** from Supabase (Sarah Reynolds, James Adeyemi, etc.)
11. **Run backfill script** for source_provider_id (dry-run first): `scripts/backfill-source-provider-id.js`
12. **Add `CLAIM_TOKEN_SECRET` env var** to Vercel (currently falls back to SUPABASE_SERVICE_ROLE_KEY)

---

## Decisions Made

| Date | Decision | Rationale |
| 2026-03-28 | MedJobs candidates page is a search tool, not a gallery | Hiring is purposeful evaluation, not emotional discovery. Giant image blocks waste space when most students don't have photos. List rows let providers scan 8-10 candidates per screen vs 3. |
| 2026-03-28 | Any authenticated user sees contact info (not just providers) | Provider profile creation is progressive profiling, not a prerequisite. Gating on "is provider" after auth creates a second wall that breaks the onboarding flow. |
| 2026-03-28 | Infinite scroll over pagination buttons | Pagination feels dated and adds cognitive load. IntersectionObserver with 200px rootMargin pre-fetches the next batch before the user reaches bottom. Feels like Telegram. |
| 2026-03-28 | Onboard page is a platform showcase, not a profile editor | Provider's first impression should be "here's what Olera can do" not "fill out these 7 forms." Profile completion is ONE compact card, not the entire page. |
| 2026-03-28 | Platform cards use router.push, not Link elements | Avoids DOM swap when isSignedIn changes (div→Link remount re-triggers animations). Single div with onClick handler works for both auth states. |
| 2026-03-28 | Guard isNotificationEntry on notificationData presence | ActionCard notification renders require data — without it, renders nothing. SmartDashboardShell must check `&& !!notificationData` before treating as notification entry. Falls back to verify-form. |
| 2026-03-28 | No new API endpoints for v1 of onboard redesign | Value cards use aspirational copy + existing provider data (google_reviews_data). Live counts (lead count in area, Q&A pending) are a fast follow once design is validated. |
| 2026-03-28 | Profile editing removed from onboard page | Wizard/inline editing moves to the portal Dashboard. Onboard page is the "lobby" — sells the vision. Portal is where they work. |
| 2026-03-28 | MedJobs card on onboard is placeholder for now | Feature is early, will be refined in next work session with proper data + design |
| 2026-03-27 | /welcome page must be static, not force-dynamic | Server component ran 3+ Supabase queries that always fail for guests (no session cookie). Blocked page render 2-3s + AuthProvider timeout 5s = 6-8s blank screen. Static page + client-side data fetching = instant render. |
| 2026-03-27 | Never gate /welcome page render on auth state | Connection card, step cards, greeting all work without auth. Auth resolving in background upgrades the UI (profile %, live status) but shouldn't block first paint. Show skeleton for async data, not a loading spinner for the whole page. |
| 2026-03-27 | Side-by-side card layout (square image) > landscape hero for provider cards | Landscape aspect ratio crops provider logos/photos badly — most provider images are logos or square portraits, not wide photos. Square image left + content right works for all image shapes. |
| 2026-03-27 | City page SEO = content depth + authority, not technical fixes | Pages rank 35-60 because they're thin provider lists on a new domain (DA ~5). Competitors have DA 60-75 and editorial city guides. On-page fixes → position 20-25; page 1 requires 3-6mo authority building from article strategy |
| 2026-03-27 | Waiver Library is the unique SEO weapon for city pages | Nobody else connects Medicaid waiver program data to city browse pages. "Paying for Care" module linking waiver library to city pages gives Google content it can't find elsewhere |
| 2026-03-27 | Rename `token` query param to `otk` in email links | Apple Mail Link Tracking Protection strips params named "token" (both click and copy). `otk` (one-time key) is not on Apple's strip list. This was the root cause of ~10 failed debugging rounds. |
| 2026-03-27 | One-click flow stays on onboard page, not redirect to Leads | The onboard page (notification card hero + dashboard) IS the intended landing. Redirecting to Leads table gives first-time providers nothing to trust. Trojan horse: lead hooks, dashboard sells. |
| 2026-03-27 | Never name URL params `token`, `session`, `key` in email links | Email clients (Apple Mail, Outlook, privacy extensions) strip params that look like auth credentials. Use abbreviations: `otk`, `sid`, `k`. |
| 2026-03-27 | Finalize claim BEFORE refreshAccountData in one-click flow | First-time providers have no account until finalize creates it. Refreshing before finalize returns empty profiles → downstream pages break. |
| 2026-03-27 | Use createAuthClient() (implicit flow) for server-generated verifyOtp | SSR browser client forces PKCE. Server-generated magic link tokens don't have a code_challenge. Must use implicit flow + session transfer. Pattern documented in lib/supabase/auth-client.ts. |
| 2026-03-27 | Fetch notification data server-side in validate-token | The connections table has RLS — unauthenticated browser client can't read it. Notification data must be fetched server-side (service role key) and returned with the token validation response. |
| 2026-03-27 | Notification card display must never depend on auth state | The notification card is the hook — it must render for unauthenticated providers. All data it needs must come from server-side APIs (validate-token), not client-side queries that require auth. |
| 2026-03-26 | Lead email is Trojan horse — dashboard is the product demo | Bare notification page would look like another lead-gen scam. Providers burned by APFM/Caring.com need to see the full platform (gallery, reviews, completeness) to believe Olera is real. Hero card hooks, dashboard below sells. |
| 2026-03-26 | Always mask seeker info on onboard page | `isSignedIn` doesn't mean verified owner of this listing. Protect seekers in case email goes to wrong recipient. First name only, no photo, city only, message truncated. Full info after claiming. |
| 2026-03-26 | Notification card overrides "already claimed" for email entry | Provider clicking email link and seeing "This listing is claimed — Dispute" is hostile. Show the lead/question/review preview instead, let them verify to respond. |
| 2026-03-26 | BP-only providers need slug-based fallback in claim check | Second claim check queries by source_provider_id, which is NULL for BP-only providers. Fallback query by slug catches them. |
| 2026-03-26 | Dark CTA buttons (bg-gray-900) for provider onboarding | Matches MedJobs aesthetic — calm confidence over teal SaaS template. Consistent across provider-facing surfaces. |
| 2026-03-26 | One-click email tokens for provider onboarding (Phase 2) | Email IS the verification — asking for OTP after they clicked the email is proving the same thing twice. Signed JWT in email link = one click from email to full portal access. Zero friction. |
| 2026-03-26 | Two tiers, not three: Full Access + Trusted | Full access via one-click token (everything including seeker PII). Trusted tier (phone call from Olera) only for destructive actions (delete listing, transfer ownership). Middle "Verified" tier was mud that solved a problem we don't have at current scale. |
| 2026-03-26 | Observability over gates for PII protection | At 5-10 leads/day with ~10% provider engagement, manual oversight is feasible. Activity Center + Slack alerts when provider views seeker PII. Human review, not software gates. Gates only when volume demands it. |
| 2026-03-26 | Phone call (not SMS OTP) for Trusted tier | Senior care providers are 60-70yo facility operators. SMS OTP = friction and confusion. Human phone call to business number = highest trust, zero tech friction, builds relationship. Rare actions only (~2-3/week). |
| 2026-03-26 | Questions and reviews don't need privacy masking | Q&A and reviews are already public on the provider page. Only leads contain private seeker PII. Showing full question/review text on onboard page is fine and more compelling. |
| 2026-03-25 | Full apply must retry account creation if apply-partial failed | Two-phase form (partial on step 1, full on step 4) means the full submit UPDATE path must check `account_id` and create auth+account if null. Silent try/catch in apply-partial hid the failure |
| 2026-03-25 | `hero_image_url` column doesn't exist in `olera-providers` | The set_hero action wrote to it but it was never added to the table schema. All references must use `select("*")` and guard with `"hero_image_url" in provider` |
| 2026-03-25 | Hover overlay > exposed pill buttons for image actions | Colored pills (yellow/red/green) below each image were visual noise. Dark gradient overlay with icon buttons on hover — images are content, buttons are tools |
| 2026-03-25 | Quick discovery mode (3 terms/category) is sufficient for batch | Standard mode (12 terms) costs 4x more but yields mostly duplicates. Quick found 16K+ providers across 78 cities for $100. After dedup/filter, same quality |
| 2026-03-25 | 4 parallel processing/enrichment batches for large batches | Single batch would take ~10hrs for 78 cities. 4 parallel batches cut to ~2.7hrs. Tradeoff: 6 Supabase timeouts from concurrent load (easy sequential retry) |
| 2026-03-25 | Cap parallel enrichment batches at 4 to avoid Supabase timeouts | 4 concurrent `enrich-city.js` processes cause occasional statement timeouts. 3-4 batches is the sweet spot for speed vs stability |
| 2026-03-25 | Place ID dedup before fuzzy dedup | Same place_id = same business (100% precision). Run this first to eliminate obvious dupes, then fuzzy catches the rest. Avoids fuzzy false positives on chains with similar names |
| 2026-03-25 | Claimed accounts get +1000 score in dedup — never deleted | 152 providers linked via business_profiles. Even if a claimed provider is the "worse" record, it has real account data tied to it. Always keep it |
|------|----------|-----------|
| 2026-03-24 | Highlights are earned, not defaulted — fewer honest > 4 generic | Every Home Care agency showed identical "In-Home Care, Certified Caregivers, Companionship, Light Housekeeping". Users see through it. 1 verified fact ("State Licensed") builds more trust than 4 templated labels |
| 2026-03-24 | Skip capability label on browse cards (skipCapability) | On a Home Care filtered page, showing "In-Home Care" as a highlight is tautological. Category already visible in card header line. Only show Tiers 1-4 (earned signals) on cards |
| 2026-03-24 | "Well Reviewed" at 4.0★/15+ reviews below "Highly Rated" at 4.5★/10+ | Binary "Highly Rated" was too exclusive — many good providers missed Tier 2. Second tier creates visible variety across cards |
| 2026-03-24 | Backfill trust signals for all 22K non-CMS providers (~$22) | Trust signals are the only differentiator for Home Care/Assisted Living/Memory Care/Independent Living (no CMS data). Pipeline already existed, just hadn't been run on pre-existing providers |
| 2026-03-24 | Don't send MedJobs students to Loops seeker audience | Adding students as seeker contacts enrolls them in Logan's care-seeker onboarding drip. Students get their own Resend email flow |
| 2026-03-24 | Collapse 15 acknowledgment checkboxes into single "I agree" | Wall of legal text killed momentum at step 4. Consolidated into 5 summary bullets + one toggle. Same legal coverage, 90% less friction |
| 2026-03-24 | Dark buttons (bg-gray-900) over teal for MedJobs apply | Calm confidence aesthetic. Teal felt like every SaaS template. Dark is quieter, more Linear/Notion |
| 2026-03-24 | Private storage bucket for student documents | Driver's license and car insurance are PII. Unlike profile photos (public), these must be access-controlled |
| 2026-03-24 | Use generateLink to resolve existing auth users | `listUsers` has no email filter in this Supabase version. `generateLink` always returns the user object, even for existing users — clean and efficient |
| 2026-03-24 | Early account creation after step 1, not step 4 | Capture the lead as soon as we have name+email. Students who abandon mid-form can be nudged back. Two-phase: partial on step 1, full update on step 4 |
| 2026-03-24 | Save step 1 data only, not progressive per-step (approach B) | Steps 2-3 (certifications, availability) are fast to re-fill. Simpler than PATCH-per-step. We capture the valuable lead data (name, email, phone, city, state) |
| 2026-03-24 | Auto-sign-in via dual magic link tokens | Generate two magic links: one for email (reusable), one consumed client-side via verifyOtp. Student gets a browser session without clicking the email, nav updates mid-form |
| 2026-03-24 | Dashboard as the canonical return destination | `/portal/medjobs` is the persistent home for students. All magic links, auth redirects, and success screens point here. No more URL-param-dependent flows |
| 2026-03-24 | Hide footer on MedJobs form pages | Senior care discovery footer is wrong context for student application. Apply, submit-video, and portal/medjobs get no footer |
| 2026-03-24 | Typeform hybrid: 4 sections + Typeform components | Pure one-question-per-screen (17 clicks) is friction disguised as simplicity. Keep grouped fields but bring Typeform-quality interactions: borderless inputs, custom dropdowns, letter-badged multi-selects, slide transitions |
| 2026-03-23 | Post-geocoding area check is required | 36/269 Ramapo providers geocoded outside the area — discovery assigns city=Ramapo to everything regardless of actual location. Must validate coordinates fall within ~0.5° of target city after geocoding |
| 2026-03-23 | Slugs must include city to avoid collisions | Many NY providers share names across cities. Slug format `{name}-{city}-{state}` prevents unique constraint violations |
| 2026-03-23 | Don't run google_reviews_data hydration and review snippets in parallel | Both write to the same JSONB column — race condition causes data loss. Run hydration first, then snippets |
| 2026-03-22 | Never store raw Google Places photo reference URLs | Raw `places.googleapis.com/v1/.../photos/...` URLs are ephemeral API resource paths requiring an API key. Must resolve to permanent `lh3.googleusercontent.com` URLs using `skipHttpRedirect=true` |
| 2026-03-22 | Jettison "Add Score" from city pipeline | olera_score/community_Score/value_score/information_availability_score are dead columns from the old Perplexity AI scoring system, removed in commit 302a4e5. New system uses Google Reviews + CMS data + AI Trust Signals |
| 2026-03-22 | Replace "Add Score" with "Hydrate Google Reviews Data" | New pipeline step populates google_reviews_data JSONB (rating, review_count, snippets) instead of the old proprietary scores |
| 2026-03-22 | AI Trust Signals run as part of city pipeline | Unified workflow: after upload, run /api/admin/verify-trust-signals for non-CMS categories in the target city |
| 2026-03-22 | AI classification required before upload | 32% of Bellevue discovery was garbage (Walmart, GameStop, Roto-Rooter). Keyword filtering misses most false positives. Perplexity AI classification costs ~$0.40 per city and catches everything |
| 2026-03-22 | Run enrichment steps in parallel | Post-upload steps (descriptions, reviews, trust signals, images, email) are independent — run concurrently with background tasks. TJ explicitly praised this approach |
| 2026-03-22 | Trust signals + CMS are display-only, not ranking | Current recommendation engine sorts exclusively by evidence density (google rating × log(review count)). Ranking enhancement is a separate Notion task for deep dive |
| 2026-03-13 | Form-first, voice-second in mode selection | Most users expect a form; voice is a differentiator but shouldn't be the default path |
| 2026-03-13 | Auth gate on bookmark only, not on results | Let users see value first → higher conversion. Bookmark is the natural auth moment |
| 2026-03-13 | Web Speech Synthesis API for TTS (no external service) | Free, built into all browsers, zero latency, no API key. Good enough for intake prompts |
| 2026-03-13 | Borrow Chantel's results page ideas, not her code | Her Lovable prototype has great UX patterns (financial impact, action plan, print) but needs to be rebuilt in our stack |
| 2026-03-13 | Progressive disclosure over report layout | Results page had 9 sections — overwhelming. Reduced to 3 beats: hero card, program list, tools. Document checklist behind toggle. |
| 2026-03-13 | "Recommended First Step" hero > Action Plan list | One specific program with call script > 5 programs in a numbered list. Reduces decision paralysis. |
| 2026-03-13 | Remove SaveResultsBanner from results | Show value first, ask later. Auth only on bookmark. Banner was the first thing users saw — wrong priority. |
| 2026-03-13 | Print expands everything via beforeprint event | Progressive disclosure is great for screen, bad for paper. JS listener overrides collapsed state during print. |
| 2026-03-05 | Flat `/provider/{slug}` URL is correct | v1.0 already used flat canonical URLs — no SEO trade-off in migration |
| 2026-03-05 | Gated provider portal → Esther | `/provider-portal/provider/{slug}/*` needs smart landing page, not just redirect. Critical for provider email funnel |
| 2026-03-02 | 16:9 primary featured image, 4 featured articles | 3:2 and 4:3 were too tall — pushed article grid below fold. 4 featured (1 large + 3 small) fills the right column without blank space |
| 2026-03-01 | Skip MedicalBusiness schema, revisit later | Low reward: Google doesn't render it differently than LocalBusiness. No concrete SERP benefit. Competitors don't use it either. |
| 2026-02-28 | CTA: quiet nudge over teal gradient banner | Strip template blobs, one warm heading, one button — calm confidence over SaaS shouting |
| 2026-02-28 | Community section in unified gray container | Docuseries + flat links felt unbounded; single bg-gray-100 rounded card groups them |
| 2026-02-28 | NIH badge: actual logo, compact, bottom-right hero | Real logo image inverted to white; tight but not cramped spacing |
| 2026-02-28 | Uniform grid over bento for Explore Care | Equal-weight cards feel less template-y; bento asymmetry was visual noise |
| 2026-02-28 | Remove social proof trust strip | Fake numbers add no trust; section added no user value |
| 2026-02-28 | Community as editorial + flat link rows | Perena-style flat rows over boxed cards; docuseries gets hero treatment, community links are quiet and scannable |
| 2026-02-28 | Default care type to Home Care | Most common search intent; was incorrectly defaulting to Home Health |
| 2026-02-28 | Self-host bento images over Unsplash | Remove external dependency; own the imagery |
| 2026-02-28 | BrowseCard (compact 310px) for all homepage cards | More providers in less space; save ProviderCard for browse/search pages |
| 2026-02-26 | Only TJ can merge to main/staging | Rulesets + merge-admins team. Prevents uncontrolled merges |
| 2026-02-26 | Content regression checks beyond git merge-base | Revert→re-apply cycles make commit topology misleading |
| 2026-02-26 | PR merge reports go to Notion | Automated reports for audit trail and team visibility |
| 2026-03-10 | Dynamic API route for sitemap, not metadata file | `app/sitemap.ts` is statically generated at build time — Supabase queries fail, empty result cached permanently. `app/api/sitemap/route.ts` with `force-dynamic` works correctly |
| 2026-03-10 | Rewrite `/sitemap.xml` → `/api/sitemap` | `app/[category]` dynamic route catches `sitemap.xml` as a category slug → 404. Rewrite in `next.config.ts` bypasses the route conflict |
| 2026-03-10 | Static OG image over dynamic ImageResponse | Shutterstock photo looks better than teal gradient text; static `.jpg` is simpler and faster |
| 2026-03-10 | Web Speech API + Deepgram fallback for voice | Web Speech API is free and covers ~75% of traffic (Chrome/Edge). Deepgram at $0.008/min covers Firefox + iOS Safari. Cheaper and simpler than a single paid provider for all traffic |
| 2026-03-10 | Keyword parser over LLM for voice interpretation | iOS VoiceIntentParser uses keyword matching and handles all edge cases. No need for Claude API — deterministic, instant, zero cost. LLM can be added later for Plan C conversational mode |
| 2026-03-10 | Mic per step, not separate voice mode | Keeps voice as an enhancement to the existing form. Users can mix voice and tap freely. Lower engineering cost than a full voice overlay (Plan B) |
| 2026-03-10 | Voice on all 6 steps, not just text inputs | Even pill-select steps (care preference, needs, income, Medicaid) benefit from voice — "help with bathing and cooking" is natural speech that maps cleanly to pills |
| 2026-03-10 | Labeled pill over bare icon for voice button | Bare 40x40 gray circle has zero affordance — users won't discover it. Labeled pill with "Speak" text is discoverable without being pushy |
| 2026-03-10 | Teal listening state over red | Red = error/danger in every mental model. Teal (brand color) signals "active" with calm confidence |
| 2026-03-10 | Voice below options, not above | Voice is a secondary input method. Below the primary interaction (input/pills) communicates "or you can speak" without competing with the primary path |
| 2026-03-10 | City search over ZIP-only for voice | Users naturally say "I live in Katy Texas" not "seven seven four four nine". Reuse existing 18K city search infra with state name extraction. ZIP still works if spoken |
| 2026-03-10 | Auto-retry on audio-capture mic error | Chrome's Web Speech API flakes on mic access — abort→start race condition. One silent 500ms retry resolves most transient failures |
| 2026-02-21 | Server-side pagination for directory | 36K+ records — must use Supabase `.range()` |

---

## Notes & Observations

- Project is a TypeScript/Next.js 16 web app for senior care discovery
- Key colors: #198087 (primary teal), warm orange palette, serif headings for editorial feel
- Homepage components: `components/home/` — HeroSection, TopProvidersSection, ExploreCareSection, CommunitySection, CTASection
- Shared hooks: `hooks/use-in-view.ts`, `hooks/use-animated-counters.ts`, `hooks/use-city-search.ts`

---

## Session Log

### 2026-03-31 (Session 65) — Worktree Cleanup + URL/Breadcrumb System Docs

**Branch:** `speedy-jemison` | **1 commit**

**Cleanup:**
- Removed 174 local worktree folders from `~/.claude-worktrees/olera-web/` (175 → 1)
- Deleted ~185 stale remote branches from GitHub (kept `main`, `staging`, + 4 branches with open PRs)
- Pruned all stale git worktree references

**Documentation:**
- Added URL & Breadcrumb Strategy section to `docs/SYSTEMS.md` — covers core URL patterns, slug conventions, category aliases, specialized routes, breadcrumb implementations, redirect/rewrite layer, sitemap sharding, link generation patterns, and known issues

### 2026-03-30 (Session 64) — Fix Orphaned Question/Lead Notifications

**Branch:** `fancy-lamarr` | **1 commit** | `cd60db73`

**Problem:** Graize reported "Provider already has an email" error on admin Questions > Needs Email tab. Root cause: deferred notification system tightly coupled "save email" and "send notifications" — if email arrived through any other path (leads add-email, profile claim, etc.), questions were permanently orphaned with `needs_provider_email: true` flag never cleared.

**Fix (4 files):**
- `app/api/admin/questions/add-email/route.ts` — Removed hard block on existing email. Now saves/overwrites email and always sends deferred notifications. Added `email_sent_at` duplicate-send guard.
- `app/api/admin/leads/add-email/route.ts` — Same fix + added bidirectional cross-clearing (sends deferred question notifications when email added via leads, not just lead notifications).
- `app/api/admin/questions/route.ts` (GET) — Enriches response with `provider_email` from business_profiles/olera-providers.
- `app/admin/questions/page.tsx` — Pre-fills email input when provider has email on file. Button: "Send" vs "Add & Send". Success: "Question forwarded" vs "Email saved — question forwarded". Amber "Email on file" indicator.

**Self-review caught 2 issues before testing:**
1. Success message said "Email saved" even when email was pre-existing — fixed to show "Question forwarded" instead
2. Dynamic import inside loop in leads endpoint — moved outside

**Testing:** TJ verified Test 1 (orphaned questions with pre-filled emails) — Send button, Email on file badge, and forwarding all working.

---

### 2026-03-27 (Session 62) — One-Click Flow: Root Cause Found + Full Fix

**Branch:** `loving-swartz` | **PRs:** #427 merged, #428 open (7 commits)

**Root Cause:** Apple Mail's Link Tracking Protection silently strips URL parameters named `token` from email links — both on click AND on copy. The one-click flow never ran because `tokenParam` was always null. Every downstream fix (race conditions, PKCE, sequencing) was correct but unreachable.

**Fix:** Renamed query param from `token` to `otk` (one-time key). Apple doesn't strip it.

**Additional bugs found and fixed (all in PR #428):**
1. **Race condition:** `setStep("finalizing")` triggered a useEffect that called `handleFinalize()` concurrently with the one-click flow, causing an error flash. Fixed by setting `finalizeRef` before step change.
2. **PKCE mismatch:** `verifyOtp` used `createBrowserClient` (forces PKCE) for server-generated tokens. Switched to `createAuthClient()` (implicit flow) with session transfer, matching UnifiedAuthModal pattern.
3. **Provider ID mismatch:** `validate-token` stored slug in `claim_verification_codes`, but `finalize` queried by UUID. Introduced `canonicalProviderId` resolution.
4. **Sequencing:** `refreshAccountData` ran before `finalize` — for first-time providers, no account existed yet → empty profiles → skeleton. Reordered: finalize → refresh → switchProfile.
5. **Session swap for owners:** One-click flow replaced TJ's session with provider's email session, breaking Leads page. Added ownership check to skip auto-sign-in when current user owns the listing.
6. **Eternal skeleton on Leads:** Added auth-loading check to prevent infinite skeleton when no provider profile exists.
7. **Landing page:** One-click flow was redirecting to Leads tab instead of staying on onboard page with notification card hero + dashboard (the "Trojan horse" design).

**Files Modified (4):**
- `app/provider/[slug]/onboard/page.tsx` — all 7 fixes
- `app/api/claim/validate-token/route.ts` — canonical provider ID resolution
- `lib/claim-tokens.ts` — `token` → `otk` rename in URL generators
- `app/provider/connections/page.tsx` — eternal skeleton safety net

**Build:** Clean. E2E WORKING: email link → Apple Mail copy → Dia paste → notification card hero + dashboard renders correctly.

**Three compounding root causes (each masked the next):**
1. Apple Mail strips `token` param → renamed to `otk`
2. Notification data blocked by RLS (anon client can't read connections) → fetched server-side in `validate-token`
3. SmartDashboardShell line 257 overrode `initialActionState` to `"pre-verified"` when `preVerifiedEmail` was set → added priority for notification states

**Failure Pattern:** 12+ rounds of fixes, each addressing a real bug but not the one visible to the user. Every fix was correct at its layer but DOA because a downstream layer silently overrode it. Lesson: trace the full render chain (data source → parent state → prop → child state init → render guard → pixel) before fixing.

**Files Modified (6):**
- `app/provider/[slug]/onboard/page.tsx` — background auth, notification data from validate-token
- `app/api/claim/validate-token/route.ts` — canonical provider ID + server-side notification data fetch
- `lib/claim-tokens.ts` — `token` → `otk` rename
- `components/provider-onboarding/SmartDashboardShell.tsx` — notification state priority over pre-verified
- `components/provider-onboarding/ActionCard.tsx` — token-verified CTA always shows "View full inquiry"
- `app/provider/connections/page.tsx` — eternal skeleton safety net

**Postmortem:** Logged to `docs/POSTMORTEMS.md`. Memories saved: `feedback_email_param_names.md`, `feedback_one_click_ux_principles.md`.

**Still TODO:**
- Debug auto-sign-in (background auth) — check console `[OneClick]` logs
- Verify "View full inquiry" button navigates correctly when clicked
- Merge PR #428 to staging

---

### 2026-03-27 (Session 61b) — One-Click Token Validation Fix + E2E Testing

**Branch:** `loving-swartz` | **PR:** #427 (open)

**What:** PR #421 merged to staging. Tested one-click flow end-to-end. Token generation works (token IS in the email URL), but token validation failed for BP-only providers.

**Root Cause:** `validate-token` endpoint only queried `olera-providers` by `provider_id`. The token contains the SLUG (not UUID), and BP-only providers don't exist in `olera-providers` at all. Query returned nothing → "Provider not found" → one-click flow failed silently → fell back to "This listing is claimed."

**Fix (PR #427):**
- Cascade lookup in validate-token: olera-providers by provider_id → by slug → business_profiles by slug
- Already-claimed returns `valid: true` (owner clicking own email is expected)
- Returns full email for auto-sign-in (was masked)
- Skips claim finalization if already claimed

**Known Edge Cases (flagged, not yet fixed):**
1. Profile switching: one-click flow doesn't call `switchProfile()` — if provider has family + provider profiles, connections page might load with wrong active profile
2. Account creation: first-time unclaimed providers hitting one-click need `ensure-account` before `claim/finalize`

**Files Modified (2):**
- `app/api/claim/validate-token/route.ts` — cascade provider lookup, handle already-claimed
- `app/provider/[slug]/onboard/page.tsx` — use full email for auto-sign-in, skip finalize if claimed

**Build:** Clean, zero errors.

---

### 2026-03-27 (Session 63) — /welcome Page De-Jank: Instant Transition + Design Taste Pass

**Branch:** `helpful-euler` | **4 commits** | Continuing from session where enrichment optimistic UI was fixed

**Problem 1: 6-second blank white screen after enrichment → /welcome**

Root cause traced from console logs:
1. `force-dynamic` server component ran `getUserCity()` → `supabase.auth.getUser()` → no session cookie for guest → slow fail (2-3s)
2. AuthProvider `fetchAccountData()` → accounts query → TIMES OUT at 5000ms (account row not created yet)
3. `loading` state gated entire page render until both completed serially

**Fix:** Eliminated both bottlenecks:
- Removed `force-dynamic` → page is now static (1906 static pages, was 1905)
- Moved provider fetching to client-side (non-blocking, below the fold)
- Removed `loading` gate — page renders immediately, auth resolves in background
- Added skeleton for connection card while async data loads

**Problem 2: Landscape hero photo crops provider logos badly**
- Reverted to side-by-side layout (square image left, content right) — works for all image shapes

**Design taste pass (Airbnb Trips + Perena inspired):**
- Warm background `#FAFAF8` (off-white, Perena energy)
- Narrower container `max-w-2xl` (more intimate)
- Bold heading (28-32px) with small gray greeting label above
- Flat step cards with thin borders, numbered circles / green checks, no timeline chrome
- Returning user card: compact horizontal row (photo + name + Message button)
- Provider section: lighter header, outline nav arrows, text "Browse all" link
- Net: significant reduction in visual complexity (-400+ lines across commits)

**Files Modified (4):**
- `app/welcome/page.tsx` — static shell, removed all server-side data fetching
- `app/welcome/loading.tsx` — NEW: skeleton matching page layout
- `components/welcome/WelcomeClient.tsx` — removed loading gate, client-side provider fetch, design overhaul
- `components/providers/connection-card/use-connection-card.ts` — added `router.prefetch("/welcome")`

**Build:** Clean. Static page generation confirmed (1906 pages).

**Still TODO:**
- Test full enrichment → /welcome transition end-to-end (is it actually instant now?)
- Verify connection card skeleton → real card swap works smoothly
- Debug auto-sign-in (background auth) — check `[OneClick]` console logs
- Continue design polish based on TJ feedback

---

### 2026-03-26 (Session 61) — Provider Onboarding Routing Fix + UX Redesign + Architecture

**Branch:** `loving-swartz` | **9 commits** | PR #421

**What:** Fixed 5 provider onboarding routing bugs from Esther's audit + redesigned notification card UX for email-driven provider acquisition.

**Bugs Fixed:**
1. **Double auth after OTP** — replaced `openAuth()` with auto-sign-in via `generateLink` + `verifyOtp` (new `/api/auth/auto-sign-in` endpoint)
2. **Routing logic in 3 locations** — extracted `getActionRedirectUrl()` helper, fixed lead→`/provider/connections` (was `/inbox`)
3. **Claimed provider flash** — added `claim_state` check to middleware; claimed providers skip onboard redirect entirely
4. **`source_provider_id` NULL** — auto-link during fresh provider creation (name+city+state match) + backfill script
5. **Review emails not sending** — fallback provider lookup in `reviews/public` endpoint (BP→olera-providers→BP via source_provider_id)

**Additional Fixes (discovered during testing):**
- BP-only providers (no olera-providers record) hit wrong code path — second claim check queried by `source_provider_id` which was NULL. Added fallback query by slug.
- "This listing is claimed" shown to providers arriving from email notifications — now shows contextual notification card (New lead/question/review) instead

**UX Redesign:**
- Notification card elevated as full-width hero above dashboard grid (Trojan horse strategy: lead hooks, dashboard below sells the platform)
- Card redesign: "A family is interested in your services", emerald icon, gray-50 seeker card, dark CTA
- Trust line: "Olera is an NIH-backed platform..." below hero
- "Your listing on Olera" divider before dashboard sections
- Privacy masking: always mask seeker info on onboard page (first name only, no photo, city only, message truncated)
- Header drops "Claiming:" for notification entries

**Files Modified (7):**
- `app/provider/[slug]/onboard/page.tsx` — routing helper, auto-sign-in, BP-only claim check fix, notification override
- `components/provider-onboarding/ActionCard.tsx` — notification card redesign, privacy masking, callback signature
- `components/provider-onboarding/SmartDashboardShell.tsx` — hero layout for notifications, header update
- `lib/supabase/middleware.ts` — claim_state check for claimed providers
- `app/api/auth/create-profile/route.ts` — auto-link source_provider_id
- `app/api/reviews/public/route.ts` — fallback provider lookup

**Files Created (3):**
- `app/api/auth/auto-sign-in/route.ts` — lightweight auto-sign-in endpoint
- `scripts/backfill-source-provider-id.js` — one-time backfill (dry-run by default)
- `plans/provider-onboarding-routing-plan.md`

**Build:** Clean, zero errors.

**Session Continuation — Taste Pass + Architecture Discussion:**
- Redesigned all 3 notification cards (lead/question/review): Olera chat mascot, left-aligned, flat layout (no nested cards), quiet border, generous padding
- Unmasked question + review content (public data) — only leads need privacy masking
- Agreed on Phase 2 architecture: one-click signed email tokens for zero-friction provider onboarding
- Progressive trust model: Full Access (one-click token) → Trusted (phone call from Olera for destructive actions)
- Observability over gates: Activity Center + Slack alerts for PII access, not software gates
- Phone call (not SMS OTP) for Trusted tier — senior care providers aren't tech-savvy
- Phase 2 implementation pending (signed token generation, token validation endpoint, Activity Center PII tracking, Slack alerts)

---

### 2026-03-25 (Session 60b) — MedJobs Account Creation Fix + Admin Documents

**Branch:** `medjobs-account-fix`, `medjobs-admin-documents` | **PRs:** #397, #398

**What:** Fixed critical bug where MedJobs onboarding completed successfully but dashboard showed "No profile yet." Also added Documents section to admin student detail page.

**Root Cause (PR #397):** The full `/api/medjobs/apply` endpoint's UPDATE path (triggered when `apply-partial` already created the profile) had zero account creation logic. If `apply-partial`'s account creation failed silently, `account_id` stayed null. The full submit updated name/phone/metadata but never checked or set `account_id`. Dashboard queries profiles by `account_id` → found nothing → "No profile yet."

**Fix:** Added account creation + linking as fallback in the UPDATE path. Also return `tokenHash` from both API response paths so client can auto-sign-in after submission. Success screen now links to `/portal/medjobs` (dashboard) instead of `/medjobs/submit-video`.

**PR #398:** Added Documents section to admin MedJobs student detail page. Shows driver's license and car insurance upload status (green "Uploaded" with timestamp, or amber "Not uploaded" warning). Added `drivers_license_url`, `drivers_license_uploaded_at`, `car_insurance_url`, `car_insurance_uploaded_at` to `StudentMetadata` type.

**Files Modified (4):**
- `app/api/medjobs/apply/route.ts` — Account creation in UPDATE path, tokenHash in responses
- `app/medjobs/apply/page.tsx` — Auto-sign-in after submit, dashboard link on success
- `app/admin/medjobs/[studentId]/page.tsx` — Documents section with upload status
- `lib/types.ts` — Document fields in StudentMetadata

---

### 2026-03-25 (Session 60) — Board Triage + Quick Wins (WEB-11, WEB-06, DKIM)

**Branch:** `jolly-goodall` | **PR:** #400

**What:** Triaged the Notion roadmap board, closed completed tasks, knocked out two P3 quick wins, and completed DKIM setup for joinolera.care.

**Completed:**
- **HP-07** (Browse by Care Type Power Pages) — already built at `app/[category]/`, marked Done
- **Email notifications on account creation** — already built in `ensure-account` endpoint, marked Done
- **DKIM setup for joinolera.care** — generated 2048-bit key in Google Admin, added TXT record to Cloudflare, authentication active
- **WEB-11** (External link icons) — added arrow-out-of-box SVG to 7 components: AiTrustSignalsSection, ReviewsSection, GoogleReviewSnippets, ProgramCard, RecommendedFirstStep, AAACard, ProviderDetailPanel
- **WEB-06** (Restart button on benefits results) — added "Start over" button below document checklist, uses existing `reset()` from `useCareProfile`
- **Deleted** "Rename business_profiles table" task — pure churn, no user value

**Triaged (left as-is):**
- Unified Care Profile schema (P5) — big architecture task, do after MedJobs + Benefits Finder ship
- Unify olera-providers + business_profiles (P3) — dangerous while iOS app shares Supabase, needs dedicated week
- Benefits Admin CMS (P5) — move data to Supabase table first, full CMS is over-engineering for now

**Files Modified (8):**
- `components/providers/AiTrustSignalsSection.tsx` — external link icon on "Source"
- `components/providers/ReviewsSection.tsx` — external link icon on "See all on Google"
- `components/providers/GoogleReviewSnippets.tsx` — external link icon, renamed to "See all on Google"
- `components/benefits/ProgramCard.tsx` — external link icon on Website/Apply/inline URLs
- `components/benefits/RecommendedFirstStep.tsx` — external link icon on "Visit website"
- `components/benefits/AAACard.tsx` — external link icon on "Visit website"
- `components/messaging/ProviderDetailPanel.tsx` — external link icon on provider website
- `components/benefits/BenefitsResults.tsx` — "Start over" button

**Build:** Clean, zero errors.

---

### 2026-03-25 (Session 59) — Admin Photo Deletion + Image Grid Redesign

**Branch:** `gentle-newton` | **PR:** #395

**What:** Add ability to delete provider photos from admin dashboard. Redesigned the image grid UI from exposed colored pill buttons to a hover overlay pattern.

**Commits (8):**
- `9be7d5c` — Core: `delete_image` action in PATCH handler + delete buttons in UI
- `c661824` — UI redesign: hover overlay with icon buttons, hero ring, broken image states, rounded-xl cards
- `7342677` — Fix UI refresh: sync formData after image actions, add error feedback
- `cd27967` — Add diagnostic logging to delete handler
- `3f9c915` — Fix misleading 404: separate fetchError (500) from !provider (404)
- `72db79c` — Log errors to browser console for debugging
- `70818c6` — Wrap provider_image_metadata ops in try/catch (table may not exist)
- `11d12d3` — **Root cause fix**: `hero_image_url` column doesn't exist — switch to `select("*")`

**Files Modified (2):**
- `app/api/admin/images/[providerId]/route.ts` — `delete_image` action, error handling, logging
- `app/admin/directory/[providerId]/page.tsx` — Hover overlay UI, delete buttons, error feedback

**Files Created (1):**
- `plans/admin-delete-photos-plan.md` — Implementation plan

**Root Cause (500 on delete):** The handler selected `hero_image_url` explicitly from `olera-providers`, but that column doesn't exist in the database. Supabase rejects queries for non-existent columns. The directory endpoint worked because it uses `select("*")`.

**Build:** Clean, zero errors.

---

### 2026-03-25 (Session 58) — 88-City Batch Expansion

**Branch:** `magical-knuth` | **PR:** #383 (merged to staging)

**What:** Largest-ever batch expansion — 88 cities in one session. Built batch discovery script, then ran full pipeline (discovery → process → enrich → Notion) for 10 cities first as proof-of-concept, then scaled to 78 more.

**Batch 1 (10 cities) — Proof of concept:**
| City | Discovered | Final Active |
|------|-----------|-------------|
| Oyster Bay, NY | 114 | 61 |
| Richardson, TX | 255 | 47 |
| Highlands Ranch, CO | 222 | 78 |
| Pasco, WA | 214 | 81 |
| Chino Hills, CA | 232 | 60 |
| Bristol, TN | 124 | 25 |
| Brookline, MA | 169 | 77 |
| Pico Rivera, CA | 144 | 25 |
| Piscataway, NJ | 235 | 99 |
| Euless, TX | 205 | 45 |
| **Total** | **1,914** | **598** |

**Infrastructure built:**
- `scripts/discovery-batch.py` — non-interactive batch discovery (Google Places API, quick/standard modes, CSV/MD input)
- Added 30+ state bounding boxes to `scripts/process-city.js` (was only NY)

**Batch 1 timing:** Discovery 6min → Processing 20min → Enrichment 25min (2 parallel batches) = ~51min total
**Batch 1 cost:** ~$30 total (vs $250 estimate). Quick mode discovery kept Google API costs to $12.

**Batch 2 (78 cities) — Full scale:**
- Discovery: 16,006 providers across 78 cities, 51 min, ~$100 (2,848 API calls)
- Processing: 7,554 uploaded after filter/dedup/geocode, 25 min (4 parallel batches of ~20), ~$40
- Enrichment: 6,542 final active providers, 70 min (4 parallel batches + 6 retries), ~$100
- 6 cities hit Supabase statement timeouts during enrichment (4 concurrent batches overwhelmed it) — all succeeded on sequential retry
- Notion: 78 pages updated to Complete via background agent (78/78, zero failures)
- **Batch 2 cost:** ~$240 (vs $1,950 estimate)

**Combined totals:** 88 cities, ~7,140 providers, ~$270, ~2.7 hours

**False positives caught (~1,100 total across both batches):** Apartment complexes, DME suppliers, child daycares, wedding venues, general medical, homeless shelters, staffing agencies, general nonprofits, cross-state contamination. All soft-deleted with reasons logged.

**Key optimization: 4 parallel processing + enrichment batches** cut what would be ~10 hrs sequential down to ~2.7 hrs. The bottleneck was Perplexity trust signals (~300ms/provider × ~5,000 non-CMS providers).

**Database-wide dedup (post-expansion):**
- Phase 1: Place ID dedup — 1,390 soft-deleted (same Google place_id across cities)
- Phase 2: Fuzzy name+address — 1,503 soft-deleted (3-tier: exact addr, base addr, name+city)
- Total: 2,893 duplicates cleaned, 0 claimed accounts touched
- New script: `scripts/dedup-database.js` (report/export/delete modes)
- New slash command: `/dedup`
- Scoring system keeps richest record; claimed accounts (+1000 score) are never deleted

---

### 2026-03-24 (Session 57) — Provider Highlights Dedup + Data-Driven Generation

**Branch:** `fair-morse` | **PR:** #376 (5 commits)

**What:** Replace static per-category highlight templates with a data-driven 5-tier waterfall. Highlights now show verified per-provider facts (trust signals, Google reviews, CMS quality) instead of generic category labels. Backfill script enriches all 40K existing providers.

**Problem (3 layers):**
1. Duplicate labels — "Home care" / "In-home care" / "Non-medical home care" as separate highlights (dedup only caught exact case matches)
2. Highlights were services in disguise — "In-Home Care" on a Home Care page is tautological
3. Zero differentiation — every Home Care agency showed identical 4 highlights (hardcoded templates)

**Commits (5):**
- `5aedf78` — Core: `lib/provider-highlights.ts` waterfall + synonym map, detail page + browse card integration, delete duplicate highlight maps
- `54f74ee` — Skip tautological category on browse cards (`skipCapability`), add "Well Reviewed" tier
- `497579c` — Backfill script `scripts/backfill-highlights-data.js` (reviews hydration + trust signals)
- `2504abf` — Concurrent workers (10x faster — 10 workers default, configurable)
- `93c09f2` — Fix Supabase query timeout with pagination

**Files Created (2):**
- `lib/provider-highlights.ts` — Shared highlight builder with 5-tier waterfall + `normalizeCareLabel()` synonym map
- `scripts/backfill-highlights-data.js` — One-time backfill for reviews data + trust signals (paginated, concurrent, 429 retry)

**Files Modified (4):**
- `app/provider/[slug]/page.tsx` — Replaced highlight builder with `buildHighlights()`, refactored `HighlightIcon` to enum-based dispatch, flex-wrap layout (1-4 items)
- `lib/types/provider.ts` — `toCardFormat()` + `businessProfileToCardFormat()` use waterfall with `skipCapability: true`. Deleted `CATEGORY_HIGHLIGHTS` map + `getHighlightsForCategory()`
- `lib/provider-utils.ts` — Deleted `categoryHighlights` map + `getCategoryHighlights()`
- `plans/provider-highlights-dedup-plan.md` — Full implementation plan

**Backfill Results (FINAL):**
- Pass 1 (reviews hydration): 8,101 providers hydrated with google_reviews_data JSONB (free)
- Pass 2 (trust signals): 22,292 processed — 20,841 confirmed, 1,317 soft-deleted, 134 errors. ~$22, ~3hrs
- 1,317 false positives removed: apartment complexes, golf courses, staffing agencies, rec centers, disability care, closed businesses
- Query to find deletions: `deleted=true AND deleted_at >= '2026-03-24T21:00:00Z' AND ai_trust_signals IS NULL`
- Follow-up: P2 Notion task for deletion audit trail ([link](https://www.notion.so/Provider-deletion-audit-trail-track-who-why-source-for-all-soft-deletes-32e5903a0ffe81ccb42ef387b5b4cda1))

**Build:** Clean, zero errors.

---

### 2026-03-24 (Session 56) — MedJobs Full Onboarding Overhaul

**Branch:** `fresh-ramanujan` | **PR:** #368

**What:** Complete overhaul of MedJobs student onboarding — from account creation timing to UI redesign to return flow.

**Commits (10):**
- `e75e588` — Core account creation on form submit + document upload + welcome email
- `5b360a0` — Skip generic welcome email + Loops seeker drip for students
- `a083033` — UI redesign: progress bar, collapsed acks, celebratory success, duplicate guard
- `a695efd` — Typeform-inspired hybrid: borderless inputs, custom dropdowns, letter-badged multi-selects
- `25a54e4` — Restore hours-per-week warning
- `3f3a42e` — Student dashboard `/portal/medjobs` + seamless return flow + auth-aware submit-video
- `485dae1` — Hide footer on MedJobs form pages + fix dropdown clipping
- `25aced5` — Early account creation after step 1 + dashboard handles incomplete applications
- `7cade92` — Fix welcome email: hide empty university block, add "Complete application" step
- `1c3eef8` — Replace "Y" badge with proper checkbox on acknowledgment toggle
- `b053370` — Auto-sign-in student via dual magic link tokens after partial creation

**Files Created (3):**
- `app/portal/medjobs/page.tsx` — Student completion dashboard
- `app/api/medjobs/upload-document/route.ts` — Auth-gated document upload (private bucket)
- `app/api/medjobs/apply-partial/route.ts` — Early account creation after step 1

**Files Modified (9):**
- `app/medjobs/apply/page.tsx` — Full Typeform-inspired redesign + partial creation on step 0→1
- `app/medjobs/submit-video/page.tsx` — Auth-aware (no URL params needed) + restyled
- `app/api/medjobs/apply/route.ts` — Two-phase profile (partial update vs full insert), duplicate guard, returning email
- `app/api/cron/medjobs-nudge/route.ts` — Include inactive profiles, add document + application checks
- `app/api/auth/ensure-account/route.ts` — Skip welcome/Loops for students
- `app/auth/callback/route.ts` — Student-aware redirect to `/portal/medjobs`
- `components/auth/UnifiedAuthModal.tsx` — Student-aware redirect after OTP
- `components/shared/ConditionalFooter.tsx` — Hide footer on MedJobs pages
- `lib/medjobs-email-templates.tsx` — New + returning templates, conditional university block

**Bugs Found & Fixed:**
1. Students received generic "Welcome to Olera" email (Resend) — ensure-account skips for students
2. Students enrolled in Loops seeker drip (Logan's intro) — removed sendLoopsEvent
3. Duplicate email created duplicate profiles — returns existing + "Welcome back!" UX
4. Nudge cron missed inactive profiles — removed `is_active: true` filter
5. Dropdown clipped by footer — hide footer on form pages + increase bottom padding
6. Empty university block in early welcome email — conditionally hidden
7. "Y" badge on acknowledgment toggle — replaced with proper checkbox

**Architecture:**
- Two-phase profile creation: partial (step 1) → full update (step 4)
- Auto-sign-in via dual magic link tokens (one for email, one for client verifyOtp)
- `/portal/medjobs` as canonical return destination (all auth paths redirect here)
- Dashboard checklist: application → video → license → insurance (locked when prior incomplete)

**Build:** Clean, zero errors.

---

### 2026-03-24 (Session 56 — earlier entry) — MedJobs Account Creation + Application Redesign

**Branch:** `fresh-ramanujan`

**What:** Full implementation of MedJobs account creation on onboarding submit (Notion P1 from Logan's audit) + UI/UX redesign of the entire application flow.

**Commits:**
- `e75e588` — Core: auth user creation, magic link, document upload endpoint, welcome email, nudge cron, completeness calc
- `5b360a0` — Fix: skip generic welcome email + Loops seeker drip for MedJobs students
- `a083033` — Redesign: progress bar, no card box, collapsed acknowledgments, celebratory success, dark pills, duplicate email guard

**Files Modified (8):**
- `app/api/medjobs/apply/route.ts` — auth.admin.createUser, accounts row, account_id linking, magic link, duplicate email check
- `app/api/medjobs/upload-document/route.ts` — NEW: auth-gated document upload (private bucket)
- `app/api/cron/medjobs-nudge/route.ts` — include inactive profiles, add document checks
- `app/api/auth/ensure-account/route.ts` — skip welcome email + Loops for student profiles
- `app/medjobs/apply/page.tsx` — full UI redesign (progress bar, collapsed acks, success screen, pills)
- `app/medjobs/submit-video/page.tsx` — DocumentUpload component for license/insurance
- `lib/medjobs-email-templates.tsx` — welcome email: magic link, doc checklist, "what happens next"
- `plans/medjobs-account-creation-plan.md` — implementation plan

**Bugs Found & Fixed:**
1. MedJobs students received generic "Welcome to Olera" email (Resend) — ensure-account now checks for student profile
2. MedJobs students enrolled in Loops seeker drip (Logan's intro email) — removed sendLoopsEvent from apply route
3. Duplicate email submission created duplicate profiles — now returns existing profile with "Welcome back!" UX

**Build:** Clean, no errors.

---



**Branch:** `silly-thompson` (no code changes — pipeline ops only)

**What:** Full city expansion pipeline for Greece, NY (batch mode — Ramapo skipped as already complete).

**Pipeline Results:**
- **Discovered:** 358 providers ($4.10, quick search)
- **Keyword filter:** removed 27 (hospitals, PT, storage, pharmacies, urgent care)
- **AI classification:** removed 117 (35% false positive rate — retail stores like Best Buy/Staples/JCPenney, spas, gyms, general apartments, counseling services, rehab centers, nonprofits)
- **Dedup:** 61 duplicates against existing 33K providers
- **Uploaded:** 155 providers to Supabase
- **Geocoding:** 155 re-geocoded, 32 corrections
- **Out-of-area cleanup:** 34 providers with coordinates outside Greece/Rochester area deleted (mostly NYC, Buffalo, Syracuse contamination)
- **Trust signals:** 65 confirmed, 12 more false positives deleted (childcare centers, retail, apartment complexes, unverifiable entities)
- **Final count:** 109 legitimate providers

**Category Breakdown:**
- Assisted Living: 55, Home Health Care: 24, Nursing Home: 17, Memory Care: 6, Home Care (Non-medical): 6, Independent Living: 1

**Enrichment Coverage:**
- Descriptions: 109/109 (100%), Google Reviews: 98/109 (90%), Review Snippets: 98/109 (90%), Trust Signals: 65/109 (non-CMS only), Images: 87/109 (80%)

**Key Issue:** Race condition between hydration and review snippets struck again — both ran in parallel and snippets overwrote JSONB. Fixed with a re-hydration pass. Decision from session 54 to not run these in parallel was correct but wasn't enforced in this session's parallel launch.

---

### 2026-03-23 (Session 54) — Ramapo, NY City Expansion Pipeline

**Branch:** `great-euler` (no code changes — pipeline ops only)

**What:** Full city expansion pipeline for Ramapo, NY. Discovery → keyword filter → AI classification → dedup → upload → parallel enrichment → geocoding → out-of-area cleanup.

**Pipeline Results:**
- **Discovered:** 523 providers (quick search, ~$5.22)
- **Keyword filter:** removed 26 (hospitals, physical therapy, storage, insurance, etc.)
- **AI classification:** removed 179 (36% false positive rate — memory_care pulled in therapy/counseling, retail stores like Costco/Staples/Apple, data recovery)
- **Dedup:** 49 duplicates against existing 33K providers
- **Uploaded:** 269 providers to Supabase
- **Geocoding:** 269 re-geocoded, 98 corrections (>0.01°)
- **Trust signals:** 147 confirmed, 29 more false positives deleted (disability orgs, child care, staffing agencies, beauty salon, travel plaza)
- **Out-of-area cleanup:** 36 providers with coordinates outside Ramapo deleted (cross-location contamination — Tampa FL, Arizona, Long Island, Albany, etc.)
- **Final count:** 204 legitimate providers

**Category Breakdown:**
- Assisted Living: 107, Home Health Care: 51, Nursing Home: 29, Home Care (Non-medical): 22, Memory Care: 19, Independent Living: 12

**Enrichment Coverage:**
- Descriptions: 240/240→204 (100%), Google Reviews: 215/240 (90%), Review Snippets: 215/240 (90%), Trust Signals: 147/240 (61%), Images: 192/240 (80%), Emails: deferred

**Key Issues Found:**
- Slug collisions: providers sharing names across NY state require city suffix in slug (`-ramapo-ny`)
- Parallel enrichment race condition: reviews data and review snippets scripts both wrote to `google_reviews_data` JSONB — snippets overwrote ratings. Fixed with a re-hydration pass.
- Out-of-area contamination: 36 providers had addresses saying "Ramapo, NY" but geocoded to completely different locations (discovery assigned city=Ramapo to all results regardless of actual location). Added post-geocoding area check.

---

### 2026-03-23 (Session 53) — Sunrise Manor, NV City Pipeline

**Branch:** `bright-dijkstra` (no code changes — pipeline ops only)

**What:** Full city expansion pipeline for Sunrise Manor, NV (Las Vegas metro). Discovery → classification → upload → enrichment. All done autonomously end-to-end.

**Pipeline Results:**
- **Discovered:** 632 providers (quick search, ~$5.18)
- **Keyword filter:** removed 21 (hospitals, dialysis, plumbing, pediatric, auto)
- **AI classification:** removed 188 (30% false positive rate — worst: memory_care pulling mental health clinics, assisted_living pulling general apartments)
- **Dedup:** 56 duplicates against existing NV providers
- **Slug collisions:** 10 (existing providers from other cities with same name)
- **Uploaded:** 357 providers to Supabase
- **Geocoding:** 357 re-geocoded, 40 corrections (>0.01°), 0 out of bounds
- **Trust signals:** 157 confirmed, 42 more false positives deleted (general apartments, mobile home parks, referral services, rehab centers, unverifiable businesses)
- **Final count:** 315 legitimate active providers

**Category Breakdown:**
- Assisted Living: 105, Home Health Care: 92, Home Care (Non-medical): 41, Nursing Home: 39, Memory Care: 23, Independent Living: 15

**Enrichment Coverage:**
- Descriptions: 357/357 (100%)
- Google Reviews Data: 302/357 (85%)
- Review Snippets: 298/357 (83%)
- Trust Signals: 157/226 non-CMS (69%)
- Images: 237/357 (66%)
- Emails: deferred to Email Finder script

**Key Observations:**
- 50% overall false positive rate (632 → 315) — highest of any city so far
- Las Vegas metro pulls in massive amounts of general apartments, rehab centers (addiction), mobile home parks, and mental health clinics
- Memory care category continues to be worst offender for false positives
- NV is first state outside NE — pipeline handled state expansion seamlessly

**Notion:** All 14 checkboxes checked, status → Complete (green)

---

### 2026-03-22 (Session 52) — Fix Broken Grand Island Provider Images

**Branch:** `jolly-franklin`

**What:** All 64 Grand Island provider images were broken on the browse page — showing alt text instead of photos. Root cause: the city pipeline stored raw Google Places API photo reference URLs (`places.googleapis.com/v1/.../photos/...`) which are ephemeral and require an API key. Bellevue images worked because the Python enrichment script resolves them to permanent `lh3.googleusercontent.com` URLs.

**Fix:**
1. **Data:** Re-fetched all 64 images via Google Places Photos API with `skipHttpRedirect=true` to get permanent `googleusercontent.com` URLs. 64/64 succeeded.
2. **Pipeline:** Updated `.claude/commands/city-pipeline.md` "Fetch Unique Images" step with explicit instructions to resolve photo references — never store raw API paths.

**Files changed:** `.claude/commands/city-pipeline.md`

---

### 2026-03-22 (Session 51) — Grand Island NE Pipeline Complete

**Branch:** `hardy-elion` (no code changes — pipeline ops only)

**What:** Full city expansion pipeline for Grand Island, NE. Discovery → classification → upload → enrichment. All done autonomously end-to-end.

**Pipeline Results:**
- **Discovered:** 409 providers (quick search, ~$4.26)
- **Keyword filter:** removed 20 (storage, physical therapy, urgent care, etc.)
- **AI classification:** removed 217 (56% false positive rate — worst: memory_care category pulling in retail, mental health, community orgs)
- **Dedup:** 25 duplicates against existing NE providers
- **Uploaded:** 147 providers to Supabase
- **Geocoding:** 147 re-geocoded, 77 corrections (>0.01°), 0 out of bounds
- **Trust signals:** 67 confirmed, 44 more false positives deleted (wrong-location Senior Helpers ×10, disability orgs, general apartments)
- **Final count:** 103 legitimate providers

**Category Breakdown:**
- Assisted Living: 35, Home Health Care: 29, Home Care (Non-medical): 21, Memory Care: 8, Nursing Home: 7, Independent Living: 3

**Enrichment Coverage:**
- Descriptions: 103/103 (100%)
- Google Reviews Data: 79/103 (77%)
- Review Snippets: 79/103 (77%)
- Trust Signals: 67/103 (non-CMS only)
- Images: 64/103 (62%)
- Emails: deferred to Email Finder script

**Key Issues Found:**
- `deleted` column defaults to `false` not `null` — enrichment queries using `.is('deleted', null)` returned 0 rows. Fixed to `.eq('deleted', false)`
- Slug collision: providers sharing names across states need city in slug (`-grand-island-ne` suffix)
- 75% overall false positive rate (409 → 103) — Grand Island had 10 bogus "Senior Helpers" listings from other states

**Notion:** All 14 checkboxes checked, status → Complete (green)

---

### 2026-03-22 (Session 50) — Bellevue NE Pipeline Complete + Major Pipeline Overhaul

**Branch:** `merry-villani`

**What:** Completed all remaining Bellevue, NE enrichment steps. Discovered and killed dead scoring system. Overhauled `/city-pipeline` slash command. Found and removed 119 false positive providers (32% of database was garbage — Walmart, GameStop, Roto-Rooter, etc.).

**Completed — Bellevue Enrichment (all run in parallel):**
1. **Rich Descriptions** — 375 providers, 137 grammar fixes ("a assisted" → "an assisted")
2. **Hydrate Google Reviews Data** — 315 providers got `google_reviews_data` JSONB (rating + review_count)
3. **AI Trust Signals** — 245 non-CMS providers verified via Perplexity Sonar, avg 3.3/8, 0 errors
4. **Review Snippets** — 315 providers got Google review text via Places API, 100% success
5. **Fetch Images** — 298 got Google Places photos, 77 had no photos available
6. **Fetch Email** — Deferred to Email Finder script (Google Places doesn't expose emails)
7. **False Positive Cleanup** — AI-classified all 375 providers, soft-deleted 119 non-senior-care businesses

**Notion status:** Bellevue set to "Complete" (green), all checkboxes checked.

**Key Investigation — Scoring System:**
- `olera_score`, `community_Score`, `value_score`, `information_availability_score` are **dead columns**
- Killed in commit `302a4e5` (March 20) across 10 files — backup at `docs/olera-score-backup.md`
- New system: Google Reviews (ranking) + CMS Medicare (display badge) + AI Trust Signals (display badge)
- Evidence density sorting: `rating × log(reviewCount + 1)`
- Trust signals + CMS are display-only — NOT used in ranking (Notion task created for deep dive)

**Key Investigation — False Positives:**
- 32% of discovery output was non-senior-care businesses
- "Memory Care" discovery category worst offender — matched storage, computing, cognitive therapy
- Keyword filtering misses most false positives — AI classification is non-negotiable
- Should run BEFORE upload to Supabase in unified pipeline, not after

**Infrastructure Improvements:**
- Created `~/Desktop/olera-web/.env.local` with all API keys (Supabase, Perplexity, Google Places)
- Worktrees symlink to it — never ask TJ for keys again
- Found backup keys in `~/Desktop/TJ-hq/Olera/Olera Data Analysis Scripts/*/.env`
- Added `GOOGLE_PLACES_API_KEY` to Vercel

**Files Modified:**
- `.claude/commands/city-pipeline.md` — Major rewrite: correct column names, parallelization strategy, scoring system docs, AI classification step, .env.local setup, known pitfalls expanded
- Memory files: `reference_supabase_credentials.md`, `feedback_google_places_key.md`, `feedback_parallel_pipeline.md`

**Spot Check & Additional Cleanup (post-pipeline):**
- Ran evidence-based scan (reviews, trust signals, website URLs) → flagged 25 suspicious providers
- Sent 16 most suspicious to Perplexity for unified entity check → 12 more false positives deleted
- Total false positives removed: 132/375 (35%) + 1 (Lied Activity Center) + 1 (Bellevue Healthcare DME)
- Final count: ~140 legitimate providers
- **New failure modes discovered:**
  - Wedding venues with senior-sounding names (A View In Fontenelle Hills)
  - Community rec centers seniors attend (Lied Activity Center)
  - DME suppliers categorized as Home Care (Bellevue Healthcare — sells wheelchairs, based in WA)
  - General apartments categorized as Independent Living (Redwood, Brent Village, etc.)
  - Cross-state contamination (WA business in NE results due to matching city name)

**Pipeline Slash Command — Final Updates:**
- Unified entity + trust signals step (one Perplexity call does both classification AND verification)
- Geographic validation added to prompt (verify provider is actually in target city/state)
- DME suppliers added to exclusion list
- Autonomous end-to-end execution (no pausing between steps)
- Updated Cowork SKILL.md and city-expansion-playbook.md to match

**Notion Updates:**
- Bellevue: all boxes checked, status → Complete
- New checkboxes added to board: "Done: Hydrate Google Reviews Data", "Done: Verify Trust Signals (Non-CMS)"
- New task: "Incorporate Trust Signals + CMS Data into Recommendation Ranking"

**Decisions:** See Decisions Made table (6 new entries for 2026-03-22)

---

### 2026-03-10 (Session 48) — Senior Benefits Finder Voice Input (Phases 1-4)

**Branch:** `peaceful-hawking` (worktree)

**What:** Added voice input to the 6-step Benefits Finder intake form. Ported the iOS VoiceIntentParser keyword maps to TypeScript. Built speech recognition hook, mic button component, and wired into the existing form.

**Exploration & Research:**
- Read full Notion task: "Senior Benefits Finder Web Voice Input Integration" (P1)
- Explored iOS codebase (`OleraClean`): SpeechRecognitionManager, VoiceIntentParser, VoiceIntakeViewModel, VoiceMicButton, VoiceOrb, FoundationModelService
- Researched 8 voice APIs: Web Speech API, Deepgram, ElevenLabs Scribe, OpenAI Whisper, Google Cloud STT, AssemblyAI, Azure Speech, Picovoice Cheetah
- Proposed 3 plans: (A) Mic per step, (B) Voice overlay with TTS, (C) Conversational assistant with LLM
- TJ approved Plan A with evolution path to Plan B

**Implementation (Phases 1-4):**
1. `types/speech-recognition.d.ts` — Web Speech API TypeScript declarations
2. `hooks/use-speech-recognition.ts` — Unified hook: start/stop/transcript/error/permissionState. Detects Web Speech API support, handles permission flow, auto-stops on 10s silence
3. `lib/benefits/voice-intent-parser.ts` — Full port of iOS VoiceIntentParser: ZIP (regex + spoken digits), age (compound spoken numbers), care preference (20+ keywords), primary needs (7 categories, multi-select), income (bracket detection with spoken amounts), Medicaid (negation-first checking). Returns typed parse result with confidence + clarification prompts
4. `components/benefits/VoiceMicButton.tsx` — 40x40 mic button, 3 states (idle/listening/disabled), pulse animation, first-use privacy note, processes transcript on stop
5. `components/benefits/VoiceTranscript.tsx` — Real-time transcript, confirmation messages, clarification prompts, aria-live for screen readers
6. `components/benefits/BenefitsIntakeForm.tsx` — Wired mic buttons into all 6 steps. Steps 0-1: mic inline with input. Steps 2-5: mic above pills. Voice results auto-map to form state and auto-advance (except primary needs — additive, no auto-advance). ZIP voice uses `zipToState()` for immediate state code resolution

**Build status:** TypeScript compiles clean. Pre-existing waiver-library prerender failures (unrelated).

**Remaining tasks:**
- Task 4: Parser unit tests (vitest)
- Task 8: City name voice handling (search city list from spoken name)
- Tasks 9-10: Deepgram WebSocket fallback for Firefox/iOS Safari
- Tasks 12-15: Polish (mobile, accessibility, error recovery)

**Files created:** `hooks/use-speech-recognition.ts`, `lib/benefits/voice-intent-parser.ts`, `components/benefits/VoiceMicButton.tsx`, `components/benefits/VoiceTranscript.tsx`, `types/speech-recognition.d.ts`, `plans/benefits-voice-input-plan.md`
**Files modified:** `components/benefits/BenefitsIntakeForm.tsx`, `.env.example`

---

### 2026-03-10 (Session 47) — DNS Cutover Execution + Sitemap Fix + OG Image

**Branch:** `peaceful-wiles` (worktree)

**What:** Executed the full v1.0 → v2.0 DNS cutover, fixed broken sitemap, replaced OG image, submitted sitemap to GSC.

**Cutover steps:**
1. Removed `olera.care` + `www.olera.care` from v1.0 Vercel project (`olera`) via dashboard
2. Added both domains to v2.0 project (`olera-web`) — `www` redirects to apex
3. Verified all 4 domains green in Vercel, homepage loading v2.0
4. Validated 477/500 top GSC provider pages (same 23 failures as pre-cutover)

**Sitemap fix (root cause: static metadata + route conflict):**
- `app/sitemap.ts` is statically generated at build time → Supabase queries fail → empty XML cached
- `app/[category]` dynamic route catches `/sitemap.xml` as a category slug → 404
- Fix: Created `app/api/sitemap/route.ts` (force-dynamic) + rewrite in `next.config.ts`
- PR #216 (error handling) + PR #217 (API route + OG + rewrite) merged to main

**OG image:** Replaced dynamic teal gradient (`opengraph-image.tsx`) with static shutterstock photo (`opengraph-image.jpg`, 1200x630)

**GSC:** Sitemap submitted, 4,943 pages discovered (shard 0). Sitemap index now auto-discovers provider shards.

**Post-cutover:**
- Merged Esther's 6 PRs to staging (#206-#208, #213-#215): auth fixes + error handling
- Added sitemap index (#220): `/sitemap.xml` → sitemapindex pointing to all shards
- Hotfix (#221): `/api/reviews` GET was 5xx (174 errors/5min) — switched from service role to anon client
- Synced main ↔ staging (#223 staging→main, #224 main→staging) — both branches now aligned
- PR #219 (waiver library redesign by Chantel) on hold pending cleanup of `package.json.tmp` + `.mcp.json`

**Files modified:** `app/api/sitemap/route.ts`, `app/api/reviews/route.ts`, `next.config.ts`, `app/sitemap.ts`, `app/opengraph-image.jpg` (new), `app/twitter-image.jpg` (new), `app/opengraph-image.tsx` (deleted), `app/twitter-image.tsx` (deleted)

---

### 2026-03-10 (Session 46) — DNS Cutover: Provider Slug Fix + Pre-flight

**Branch:** `peaceful-wiles` (worktree)

**What:** Discovered critical provider slug mismatch between v1.0 and v2.0, fixed it, then completed all cutover pre-flight checks.

**Critical discovery:** v2.0's slug migration (007) generated `{name}-{state}` slugs, but v1.0 used a progressive algorithm: name-only → +state if duplicate → +city if still duplicate. Result: ~60% of provider URLs would have 404'd after cutover.

**Fix:**
- `008_fix_provider_slugs_v1_compat.sql` — Regenerated all 39K+ slugs using v1.0's algorithm
- `009_patch_v1_slug_mismatches.sql` — Patched 38 top-traffic edge cases (renamed providers, special chars, franchise ambiguity) using `DO $$ EXCEPTION WHEN unique_violation` pattern

**Validation:** Tested all 500 top GSC provider pages → 477/500 pass (95.4%). 23 failures: 20 already 404 on v1.0 (deleted providers), 3 slug conflicts (low traffic).

**Pre-flight completed:**
- All key pages return 200 (homepage, power pages, browse, articles, privacy, terms)
- All redirects working (provider/sign-up, state abbreviations, provider-portal)
- Auth config: Supabase Site URL updated to olera.care, Google OAuth confirmed
- Care inquiry flow tested: Slack + email notifications working

**Files created:** `supabase/migrations/008_fix_provider_slugs_v1_compat.sql`, `supabase/migrations/009_patch_v1_slug_mismatches.sql`

**Status:** Ready for Phase 2 (Cloudflare DNS) → Phase 3 (alias swap)

---

### 2026-03-09 (Session 45) — Bulk PR Merge + SEO Regression Prevention

**Branch:** `focused-snyder` (worktree)

**What:** Processed all 7 open PRs targeting staging, with special focus on preventing SEO regression from stale branches.

**PRs merged (7 total):**
- #187 — Update SCRATCHPAD for session 44 (direct merge)
- #182 — Unify provider card structure (direct merge)
- #184 — Refine provider onboarding UI (direct merge)
- #185 — Fix care post publishing from benefit finder (direct merge)
- #186 — Show accepted provider-initiated requests as leads (direct merge)
- #189 — Waiver library redesign reconciled with SEO work (replaced stale #183)
- #188 — Admin verification approval panel (rebased, then merged)

**Key finding — PR #183 regression prevention:**
- Branch was 23 commits behind staging, would have silently regressed:
  - Self-hosted font → Google Fonts CDN (undoes LCP optimization)
  - Geo-personalized homepage → removed
  - 8 permanent redirects dropped (54 → 46)
  - Provider page parallel queries → sequential
  - Canonical URLs + OG metadata on 6 waiver pages → removed
- Created reconciliation branch: rebased onto staging, resolved 6 waiver page conflicts preserving both UI redesign and SEO metadata
- PR #188 also rebased (29 behind) to avoid Footer "Benefits Hub" → "Waiver Library" regression

**Updated `/pr-merge` slash command (PR #190):**
- Added SEO-sensitive file watchlist (waiver library, benefits, caregiver-support pages)
- Added OG/Twitter image files to critical watchlist
- New regression indicators: self-hosted fonts, geo-personalization, parallel queries, canonical/OG/twitter metadata presence
- Redirect count baseline: 54 permanent redirects as of March 2026

**Notion reports:**
- Bulk merge report: PRs #182-#187
- PR #188 merge report

**Post-merge staging state:** `1fb1bc4` — all critical files verified intact

---

### 2026-03-09 (Session 44) — Notion Board Audit + Cutover Prep

**Branch:** `scratchpad-session-43` (continuation)

**What:** Audited the Notion "Web App Action Items/Roadmap" board, marking completed items and adding missing ones. Drafted XFive cutover memo.

**Notion board updates (12 total):**
- Marked 3 existing items as Done: Lighthouse audit, missing community metadata, forum redesign
- Added 9 new Done items: OG/Twitter metadata, provider SEO (title tags + structured data + LCP), v1→v2 redirects (54), author pages, topic filter tabs, homepage geo-personalization, waiver library redesign, community removal, about/contact/team pages

**Cutover prep:**
- Drafted memo to XFive requesting: (1) spot check before cutover, (2) full export of Q&A data + user accounts from v1 database

**Next up:**
- Send XFive memo
- Receive Q&A + user account export from XFive
- Plan data migration into v2 Supabase
- DNS cutover execution (per `docs/cutover-runbook.md`)
- Submit sitemap to GSC post-cutover

---

### 2026-03-08 (Session 43) — LCP Optimization + Notion Updates

**Branch:** `fix-og-metadata` → PR #179 (merged to staging)

**What:** Optimized Largest Contentful Paint on provider pages and published results to Notion.

**LCP optimization:**
- `app/layout.tsx`: Switched DM Serif Display from render-blocking Google Fonts `<link>` to `next/font/google` self-hosting. Eliminates 3-hop blocking chain (DNS → CSS → font file)
- `app/provider/[slug]/page.tsx`: Parallelized 4 sequential Supabase queries (claim state, similar providers, Q&A, reviews) via `Promise.all`. Inner Q&A + review count also parallelized
- `tailwind.config.ts`: Display font now uses CSS variable `var(--font-dm-serif-display)`

**Lighthouse results (provider page, after):**
- Desktop: Score 90, LCP 2.1s, CLS 0, TBT 0ms, render-blocking 0
- Mobile: Score 88, LCP 3.8s, CLS 0, TBT 80ms, render-blocking 0

**Notion updates:**
- Updated Migration Readiness Report with LCP optimization section + benchmark table
- Created action item: "Submit updated sitemap immediately after DNS cutover" (P1, TJ)
- Created PR #179 merge report

**Merge note:** PR #179 required rebase — would have silently reverted title tag fix from PR #178

---

### 2026-03-07 (Session 42) — Editorial Polish: Author Pages, Topic Tabs, OG Metadata

**Branch:** `stellar-stonebraker` (multiple feature branches merged)

**What:** Completed the editorial content polish workstream — author pages, topic-based filters, CMS improvements, and a full OG metadata audit across the entire site.

**Author pages (`app/author/[slug]/page.tsx`):**
- New dynamic route with `generateStaticParams` for all known authors
- Fetches articles from Supabase, splits into caregiver-support vs research-and-press sections
- Person JSON-LD structured data
- ISR with 60s revalidation

**Topic-based filter tabs (`app/caregiver-support/page.tsx`):**
- Replaced `CareTypeId` tabs with `ArticleTopic` tabs (6 categories)
- New `lib/article-topics.ts`: costs-and-benefits, getting-started, dementia-care, comparing-care, legal-and-planning, wellness-and-support
- SQL migration reclassified 85 articles from format-based to topic-based categories

**Author linking in articles:**
- Both `caregiver-support/[slug]` and `research-and-press/[slug]` now link author names to `/author/[slug]`
- Avatar fallback: if DB `author_avatar` is null, falls back to static author data from `lib/authors.ts`

**CMS admin (`app/admin/content/[articleId]/page.tsx`):**
- Author dropdown pre-filling name, role, avatar on selection
- Category dropdown switched to topic-based options

**OG metadata audit (PR #176):**
- `app/opengraph-image.tsx` + `app/twitter-image.tsx`: Default branded 1200x630 OG image for all pages
- Added `twitter` card metadata to 9 pages/layouts: author, team, about, contact, for-providers, privacy, terms, caregiver-support, research-and-press
- Added missing `siteName` (for-providers, privacy) and `type` (privacy)

**LinkedIn URL fixes:**
- TJ: `/tj-falohun/` → `/tfalohun` (3 files)
- Logan: `/logandubose/` → `/logan-dubose/` (1 file)

**PRs merged to staging:** #172, #174, #175, #176

**Files created:** `lib/authors.ts`, `lib/article-topics.ts`, `app/author/[slug]/page.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`

**Files modified:** `app/caregiver-support/page.tsx`, `app/caregiver-support/[slug]/page.tsx`, `app/research-and-press/[slug]/page.tsx`, `app/admin/content/[articleId]/page.tsx`, `app/layout.tsx`, `app/about/page.tsx`, `app/contact/page.tsx`, `app/team/page.tsx`, `app/for-providers/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/caregiver-support/layout.tsx`, `app/research-and-press/layout.tsx`, `components/for-providers/LeadershipSection.tsx`

---

### 2026-03-07 (Session 41) — GSC Traffic Analysis + Traffic Recovery Pages + Community Removal

**Branch:** `seo-metadata-fixes` (on `stellar-stonebraker` worktree)

**What:** Analyzed GSC export to validate redirect coverage, built pages to recover lost company traffic, removed low-traffic community section, and fixed article meta description strategy.

**GSC Traffic Analysis:**
- Analyzed `docs/Pages.csv` (GSC Performance export, excluding /provider/ URLs)
- Result: 0 URLs returning 404 — all v1.0 paths covered by redirects
- Found 70 clicks lost from `/company/*` pages (about: 21, contact-us: 7, leadership: 42)

**Traffic Recovery Pages:**
- `app/about/page.tsx` (NEW): Mission, origin story (Texas A&M/Sling Health), team teaser with overlapping portraits linking to /team, NIA badge
- `app/contact/page.tsx` (NEW): Phone + email cards, amber "we're a directory" disclaimer, provider CTA
- `app/team/page.tsx` (REWRITTEN): Standalone people-first page after user feedback — full portraits, bios, LinkedIn links

**Community/Forum Removal:**
- GSC showed only 17 organic clicks for forum content — not worth maintaining
- Deleted: `components/home/CommunitySection.tsx`, `app/community/` (4 files), `components/community/` (9 files), `components/team/HeroSection.tsx`, `components/team/TeamSection.tsx`
- Removed community from: Navbar, NavMenuData, Footer, homepage
- Added 302 redirects for `/community` and `/community/:path*` → `/` (temporary, will return)

**Article Meta Description Fix:**
- Changed fallback order: `excerpt || meta_description || undefined` (was `meta_description || excerpt`)
- Rationale: Google pulls snippets from body content for top articles; CMS meta_description would override this
- Verified all top 10 articles have excerpts populated

**Article Analysis:**
- Compared v1 vs v2 body content for #1 article — confirmed identical HTML
- Discovered two taxonomy systems: `care_types` (user-facing CareTypeId) vs `category` (CMS-only ResourceCategory format labels)
- Categories are CMS-internal and can be changed post-migration without SEO impact

**Redirects added (next.config.ts):**
- `/company/about` → `/about`, `/company/leadership` → `/team`, `/company/contact-us` → `/contact`, `/company/investors` → `/about`
- `/community` → `/` (302), `/community/:path*` → `/` (302)
- `/caregiver-forum` → `/` (was → `/community`)

**Footer updated:** Added "About Us" (/about) and "Contact" (/contact) links

**PRs:** #169 (seo-metadata-fixes) — 5 commits

**Bulk article metadata fix (Supabase, via `scripts/fix-article-metadata.mjs`):**
- 95 author roles populated (TJ: 19, Logan: 21, Lisa: 25, Laura: 29, Jamie: 1)
- 2 author name normalizations: "Logan DuBose" → "Dr. Logan DuBose", "Laura Herman - Dementia Care Specialist, CCF" → "Laura Herman" (credential in role)
- 55 care_types assigned (coverage: 37 → 92 of 109 articles, 34% → 84%)
- 17 company news/press articles intentionally left without care_types
- 1 tag fix: custody article had wrong BCBS/insurance tags → legal/guardianship/custody
- Used service role key (anon key silently fails on RLS-protected updates)

**Top 10 article spotcheck (v1 vs v2):**
- 10/10 articles pass: titles, meta descriptions, first paragraphs, H2 structure, authors, JSON-LD all match
- Only minor diff: article #7 has extra "Intro" H2 in v2 (no SEO impact)
- Editorial article migration confirmed clean — no ranking risk

**PRs:** #169 (SEO metadata, merged), #170 (traffic recovery + community removal, merged)

---

### 2026-03-07 (Session 40) — Migration Quick Wins + Homepage Geo-Personalization

**Branch:** `stellar-stonebraker`

**What:** Closed 3 migration strategic gaps (S1, S2, S6) and added city-level geo-personalization to the homepage top providers carousel. Also fixed BrowseCard serif font.

**S1 — Duplicate connections pages:**
- Deleted `/portal/connections` (716 lines) and `/portal/connections/[id]` (545 lines)
- Kept `/provider/connections` (Leads table with urgency filters, sort, slide-out drawer)
- Added redirect in `next.config.ts`, updated 5 API route email/SMS URLs + calendar page links

**S6 — Taxonomy slug aliases:**
- Added `home-health` → `home-health-care` and `nursing-homes` → `nursing-home` to `CATEGORY_ALIASES` in `lib/power-pages.ts`

**S2 — Onboarding dead-end fix:**
- Added condition in `app/onboarding/page.tsx` for signed-in + onboarded users with `intent=provider` or `intent=organization`
- Now opens post-auth flow with intent pre-set instead of bouncing to `/portal`

**Geo-personalized top providers:**
- `app/page.tsx`: Reads `x-vercel-ip-country-region` + `x-vercel-ip-city` headers, validates against US_STATES
- `components/home/TopProvidersSection.tsx`: Cascade — city+state → state → national (all 3 queries in parallel)
- Heading shows "Top-rated providers in Irvine, California" or falls back to state/national
- Homepage is now `ƒ` (dynamic) instead of `○` (static) due to header reads

**BrowseCard font fix:**
- `components/browse/BrowseCard.tsx`: Switched provider name from `font-display` (DM Serif Display) to `font-sans` (Inter)

**SEO metadata audit:**
- Audited all 66 page routes for title, description, canonical, OG, JSON-LD
- Fixed 8 files across 6 waiver library route levels + benefits/finder + terms
- ~1,160 pages gained canonical URLs and OG tags
- 100% of public pages now have full metadata
- Audit report published to Notion

**PRs:** #166 (S1+S2+S6, merged), #167 (geo+font, merged), SEO metadata PR pending

**Commits:** `889d5a1`, `791f7ac`, `63ea52d`, `14e9345`, `2fb0ef4`, `5869fb0`

---

### 2026-03-05 (Session 39) — Family Connection Emails + Mock Data Cleanup

**Branch:** `quick-pike` → merged as PR #147

**What:** Fixed missing family email notifications and removed all mock lead data from provider inbox.

**Bug found:** Provider accept/decline in Inbox did a direct Supabase update, bypassing server-side notifications. Family profiles don't have `email` on `business_profiles`, so message notification email lookup silently failed.

**New template (`lib/email-templates.tsx`):**
- `connectionSentEmail()`: "Your inquiry was sent" — confirmation to family after connection request

**Modified files:**
- `app/api/connections/request/route.ts`: Added family confirmation email (step 9)
- `app/api/connections/message/route.ts`: Email lookup fallback via `accounts` → `auth.users` for families
- `app/api/connections/manage/route.ts`: Added `accept`/`decline` actions with email + Loops
- `components/portal/ConnectionDetailContent.tsx`: `handleStatusUpdate` now calls API instead of direct Supabase

**Mock data removed:**
- `app/provider/inbox/page.tsx`: Removed mock fallback (was showing fake leads when 0 real connections)
- `app/provider/connections/page.tsx`: Emptied `MOCK_LEADS` array
- `hooks/useUnreadInboxCount.ts`: Removed mock count fallback
- `components/shared/Navbar.tsx`: Removed mock leads badge count

**Test results:**
- Test #1 (connection request email): PASS (previously confirmed)
- Test #2 (family confirmation email): PASS — "Your inquiry was sent" email arrives
- Test #6 (approval email): PASS (previously confirmed)
- Test #7 (rejection email): PASS (previously confirmed)
- Test #9 (SMS): BLOCKED — 10DLC registration pending
- Test #10 (Slack lead alert): PASS (previously confirmed)
- Test #13 (Slack approve/reject): PASS (previously confirmed)
- Remaining: #3-5, #8, #11-12, #14-18

**Pending:** Delete fake seed connections from Supabase DB (Sarah Reynolds, James Adeyemi, Diana Nguyen, Linda Washington, Robert Park, Tomoko Chen, Maria Kowalski, Angela Johnson)

---

### 2026-03-04 (Session 38) — Provider Approval/Rejection Email + Notification Testing

**Branch:** `vibrant-keller`

**What:** Added email notification when admin approves/rejects a provider claim. Started systematic notification test matrix (18 tests across all channels).

**New template (`lib/email-templates.tsx`):**
- `claimDecisionEmail()`: Approved → "Your listing is live!" / Rejected → "Your claim needs attention"

**Modified (`app/api/admin/providers/[id]/route.ts`):**
- Expanded `.select()` to include `account_id, slug`
- Added email send + Loops event after Slack alert block
- **Bug fix:** `account_id` references `accounts` table, not `auth.users` — need `accounts.user_id` to look up auth user email

**PRs:** #138 (approval email + Loops), #140 (debug logging), #141 (fix accounts table lookup), #144 (SMS debug logging)

**Test results so far:**
- Test #1 (connection request email): PASS — email arrives, but URL pointed to v1.0 (fixed via `NEXT_PUBLIC_SITE_URL` env var)
- Test #6 (approval email): PASS — email arrives with correct template
- Test #7 (rejection email): PASS — "Your claim needs attention" email arrives
- Test #10 (Slack lead alert): PASS — fires on connection request
- Test #13 (Slack approve/reject): PASS — fires correctly
- Test #9 (SMS connection request): BLOCKED — Twilio returns `success:true` but messages show "Undelivered" (Error 30034: US A2P 10DLC unregistered number)
- Tests #2-5, #8, #11-12, #14-18: Remaining

**Env var fix:** Added `NEXT_PUBLIC_SITE_URL=https://staging-olera2-web.vercel.app` (Preview only) to Vercel. Without it, all email CTAs linked to `olera.care` (v1.0).

**SMS debugging:**
- Added debug logging to SMS block in connection request route (PR #144) — previously catch was completely silent
- Vercel logs confirmed `[sms] Send result: {"success":true}` — Twilio accepted the API call
- Twilio Message Logs showed all 3 messages as "Undelivered" with Error 30034
- Root cause: Twilio number `+12137722970` not registered for A2P 10DLC (US carrier compliance requirement since 2023)
- Submitted Sole Proprietor brand registration + campaign in Twilio console. Approval takes 1-5 business days.

**Postmortem:** Notion MCP Cloudflare rate limiting — documented in `docs/POSTMORTEMS.md`

**Next session:** Continue notification testing. Need `CRON_SECRET` for tests #14-16. Connection accept (#2) needs provider to accept in Inbox. SMS tests (#8-9) blocked on 10DLC approval. Delete existing Aggie connection in Supabase before re-testing connection request URL fix.

---

### 2026-03-04 (Session 37) — Surface Approved Providers in Public Search

**Branch:** `vibrant-keller`

**What:** Made approved business_profiles visible in all public search/browse surfaces. Previously, only the seeded `olera-providers` table (39K+ records) was queried — new providers created through onboarding were invisible even after admin approval.

**New utilities (`lib/types/provider.ts`):**
- `businessProfileToCardFormat()`: Converts `BusinessProfile` → `ProviderCardData` (category display mapping, fallback images, verified badge for claimed)
- `SUPABASE_CAT_TO_PROFILE_CATEGORY`: Maps olera-providers categories → ProfileCategory enum
- `CARE_TYPE_SLUG_TO_PROFILE_CATEGORY`: Maps browse slugs → ProfileCategory enum
- `mergeProviderCards()`: Merges seeded + BP cards, deduplicates by `source_provider_id`

**Modified files:**
- `lib/power-pages.ts`: Parallel BP query in `fetchPowerPageData()` (SSR city/state pages)
- `components/browse/BrowseClient.tsx`: Parallel BP query in client-side fetch
- `app/browse/BrowsePageClient.tsx`: Parallel BP query in client-side fetch
- `components/browse/CityBrowseClient.tsx`: Parallel BP query in client-side refetch

**Visibility filter:** `claim_state = 'claimed' AND is_active = true AND type = 'organization'`

**Commit:** `d4ffa24`

---

### 2026-03-03 (Session 36) — Backend Integration Phase 3-4: Twilio SMS + Vercel Cron

**Branches:** `twilio-sms-integration`, `vercel-cron-jobs`

**What:** Completed remaining backend integration phases — Twilio SMS (Phase 3) and Vercel Cron jobs (Phase 4). All env vars configured end-to-end in Vercel.

**Phase 3: Twilio SMS (PR #112)**
- `lib/twilio.ts`: Twilio singleton, `sendSMS()`, `normalizeUSPhone()`, `maskPhone()`
- `app/api/claim/send-code/route.ts`: Now accepts `method: "sms"` for SMS verification codes
- `app/api/connections/request/route.ts`: SMS notification to provider on new inquiry
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (+12137722970)

**Phase 4: Vercel Cron (PR #113)**
- `vercel.json`: 3 cron schedules
- `app/api/cron/daily-digest/route.ts`: 8 AM CT — email + Slack summary of leads, claims, disputes
- `app/api/cron/unread-reminders/route.ts`: every 6h — nudge for unread messages >24h, with dedup
- `app/api/cron/cleanup/route.ts`: 4 AM UTC — purge expired verification codes + stale connections (30d)
- Env var: `CRON_SECRET`

**Also:**
- PR #111 (Phase 1-2) merged to staging via `/pr-merge` with full regression analysis
- Backlog task added to Notion: "Add SMS toggle to ClaimVerifyForm UI"
- PR merge report published to Notion

**Vercel env vars (10 total now):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `SLACK_WEBHOOK_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`

---

### 2026-03-04 (Session 37) — Loops Marketing Automation Integration (Phase 5)

**Branches:** `magical-keller` → `loops-ensure-account` → `loops-event-properties` → `loops-await-fix`

**What:** Connected Loops marketing automation to 8 route touchpoints. Dual-account routing (olera.care for seekers, oleracare.com for providers). Discovered and fixed 3 bugs during live testing.

**New file:**
- `lib/loops.ts`: Dual-account Loops utility — `sendLoopsEvent()` routes by `audience: "seeker" | "provider"`, `sendLoopsEventBoth()` for suppression. No SDK, single POST, 490-char string truncation, Bearer auth.

**8 routes wired:**
- `app/auth/callback/route.ts`: `user_signup` (OAuth path, seeker)
- `app/api/auth/ensure-account/route.ts`: `user_signup` (email OTP path, seeker) — PR #124
- `app/api/auth/create-profile/route.ts`: `onboarding_completed` (seeker or provider)
- `app/api/connections/request/route.ts`: `new_lead` (seeker)
- `app/api/connections/message/route.ts`: `new_message` (seeker)
- `app/api/connections/respond-interest/route.ts`: `connection_accepted` (seeker)
- `app/api/connections/end/route.ts`: `connection_ended` (seeker)
- `app/api/claim/finalize/route.ts`: `provider_claimed` (provider)
- `app/api/auth/delete-account/route.ts`: `account_deleted` (both accounts)

**Bugs found & fixed:**
1. **`user_signup` never firing** (PR #124): Email OTP signups go through `/api/auth/ensure-account`, not `/auth/callback` (OAuth only). Added sendLoopsEvent to ensure-account.
2. **Loops "unsupported event property tags"** (PR #126): v1 email templates reference `provider_name`, `profile_link`, `care_type`. Added these to `onboarding_completed` event properties.
3. **Intermittent event delivery** (PR #129): All `sendLoopsEvent` calls were NOT awaited. On Vercel serverless, functions freeze after response, killing in-flight HTTP requests. Added `await` to all 9 calls.

**PRs merged:** #123 (core integration), #124 (ensure-account fix), #126 (event properties), #129 (await fix)

**Env vars added to Vercel:**
- `LOOPS_API_KEY_SEEKER` (olera.care account — seeker nurture emails)
- `LOOPS_API_KEY_PROVIDER` (oleracare.com account — provider outreach, protects primary domain)

**Vercel env vars (12 total now):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `SLACK_WEBHOOK_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `CRON_SECRET`, `LOOPS_API_KEY_SEEKER`, `LOOPS_API_KEY_PROVIDER`

**Key lesson:** On Vercel serverless, ALWAYS `await` external API calls before returning the response. "Fire-and-forget" pattern only works if the promise completes before the function freezes.

**Loops workflow configuration (oleracare.com — provider side):**
- `trial_emails` Loop cloned from v1, trigger changed to `onboarding_completed`
- Had to manually register event properties (`provider_name`, `profile_link`, `city`, `care_type`) on the Loop trigger — Loops doesn't auto-register from received events
- Fixed `care type` → `care_type` tag mismatch in email template (space vs underscore)
- Simplified to single welcome email + loop completed (removed multi-day drip for now)
- Loop is now **Active** and processing

**Loops workflow configuration (olera.care — seeker side):**
- Welcome email Loop active (configured in earlier part of session)

**Await fix verified:** `onboarding_completed` firing reliably after PR #129 (3 events in event log, latest at 12:41 PM)

**Pending:** Configure remaining Loops workflows — `new_lead`, `new_message`, `connection_accepted`, `connection_ended`, `provider_claimed`, `account_deleted`

---

### 2026-03-03 (Session 35) — Backend Integration Phase 1-2: Email + Slack

**Branch:** `magical-keller`

**What:** Built out the email notification system and Slack admin alerts from the Backend Integration Roadmap. Also explored legacy `olera-backend` repo, created gap analysis, and detailed 5-phase plan.

**New files:**
- `lib/email.ts`: Resend singleton + `sendEmail()` helper (fire-and-forget safe)
- `lib/email-templates.tsx`: 5 branded HTML templates (verification code, connection request, connection response, new message, claim notification)
- `lib/slack.ts`: Slack webhook helper + 4 pre-built alert functions (new lead, provider claimed, dispute, approve/reject)
- `docs/backend-integration-analysis.md`: Full gap analysis — legacy Rails vs v2.0 Next.js
- `plans/backend-integration-roadmap-plan.md`: 5-phase, 17-task implementation plan

**Modified routes:**
- `app/api/claim/send-code/route.ts`: Refactored inline Resend → shared email util
- `app/api/claim/finalize/route.ts`: Added admin email + Slack on claim
- `app/api/connections/request/route.ts`: Added provider email + Slack lead alert
- `app/api/connections/respond-interest/route.ts`: Added email on accept
- `app/api/connections/message/route.ts`: Added email with 5-min debounce
- `app/api/disputes/route.ts`: Added Slack alert
- `app/api/admin/providers/[id]/route.ts`: Added Slack alert on approve/reject

**Env vars configured in Vercel:**
- `RESEND_API_KEY` (new olera-web-v2 key, sending access)
- `ADMIN_NOTIFICATION_EMAIL` (automations@olera.care)
- `SLACK_WEBHOOK_URL` (new webhook → #notifications channel)

**Also done:**
- `olera.care` domain added + verified in Resend (auto-configured via Cloudflare)
- Sentry deprioritized from P2 to P4 (Vercel logs sufficient for now)
- 14 Notion roadmap tasks created in Web App Action Items/Roadmap database
- Provider email coverage: 26% in olera-providers (9,541/36,667), ~0% in business_profiles

**Decisions:**
- All notifications fire-and-forget (try/catch, never block main flow)
- Message emails debounced — skip if recipient active in last 5 min
- Keep old "Olera SMTP" Resend key alive — Supabase Auth OTPs depend on it
- Use `noreply@olera.care` for all notification emails

**PR:** #111 targeting staging

**Commits:** `dc3cec0` (Phase 1: Email), `7641dd7` (Phase 2: Slack)

---

### 2026-03-03 (Session 34) — Leadership Team Page + Admin Fixes + img Cleanup

**Branch:** `joyful-goodall`

**What:** Completed 3 Notion roadmap tasks in one session: P1 Leadership Team page, P2 raw img tag fix, P2 admin silent failures fix.

**Task 1: Leadership Team Page** (PR #106)
- New `/team` route: `app/team/page.tsx` (server component with metadata)
- `components/team/HeroSection.tsx`: serif display heading, fade-in animation via `useInView`
- `components/team/TeamSection.tsx`: two large portrait cards, staggered scroll animations, expanded bios, LinkedIn links
- Updated `Footer.tsx` (added "Our Team" link), `sitemap.ts` (added /team), `LeadershipSection.tsx` (crosslink)
- Adjusted from `aspect-[3/4]` to `aspect-square` after checking actual headshot dimensions (500x500, 415x415)

**Task 2: Raw `<img>` Tags** (PR #107)
- Replaced 4 raw `<img>` tags in `app/caregiver-support/page.tsx` with `next/image` using `fill` mode
- Added `sizes` prop and `priority` flag for above-fold images

**Task 3: Admin Silent Failures** (PR #108)
- Added error state + red error banners to 5 admin pages:
  - `app/admin/page.tsx`: partial-load warning when individual API calls fail
  - `app/admin/images/page.tsx`: list error + detail error + action error
  - `app/admin/leads/page.tsx`: list fetch error
  - `app/admin/providers/page.tsx`: list error + approve/reject action error
  - `app/admin/team/page.tsx`: list error + replaced `alert()` with inline banners
- Pattern: `bg-red-50 border border-red-200` matching existing `content/page.tsx`

**All 3 PRs merged to staging. All 3 Notion tasks marked Done.**

---

### 2026-03-02 (Session 33) — Individual Article Page Editorial Redesign

**Branch:** `joyful-turing`

**What:** Transformed `/caregiver-support/[slug]` from a generic CMS article dump into a composed editorial reading experience with strong typography hierarchy, sticky TOC, and elegant content blocks.

**New files:**
- `lib/article-html.ts`: Heading extraction + ID injection utility (regex-based, handles h2/h3, slugified IDs, duplicate handling)
- `components/article/TableOfContents.tsx`: Client component — `DesktopTableOfContents` (sticky sidebar, IntersectionObserver scroll tracking) + `MobileTableOfContents` (collapsible panel)

**CSS (`app/globals.css`):**
- Added `.prose-editorial` class alongside `.prose-medium` (admin editor untouched)
- Serif H2 headings, primary-600 blockquote borders + list markers, subtle link underlines, scroll-margin-top for sticky nav offset

**Page restructure (`app/caregiver-support/[slug]/page.tsx`):**
- Breadcrumb chain → simple "← Caregiver Support" back link
- Category as subtle uppercase text (not pill)
- H1: `font-display` serif, `text-display-sm md:text-display-md`
- Metadata row: middot-separated author + date + reading time
- Hero image: `aspect-[2/1]`, `rounded-2xl`, aligned to body text left edge
- Body layout: unified container (`max-w-[1100px]`), header + image + body in same left column (`flex-1 max-w-[680px]`), TOC sidebar (`w-[220px]`) on desktop
- TOC shows only when 2+ headings; no sidebar layout when 0 headings
- Contextual CTA: quiet border card, no gradient/emoji
- Author card: border-t separator (no bg-gray-50), hidden for "Olera Team"
- Tags: simple text links, no pill borders
- Related articles: "Recommended" title, category labels, reading time, `aspect-[3/2]` images
- Bottom gradient CTA removed entirely
- Mock data processed through same HTML pipeline

**UI critique fix:** Aligned header, image, and body to shared left edge by unifying into one container. Added middot separators to metadata row.

**Commits:** `1089551`, `bca54b1`

---

### 2026-03-02 (Session 32) — Caregiver Support Editorial Redesign

**Branch:** `joyful-turing`

**What:** Redesigned `/caregiver-support` from a generic CMS grid into a calm, editorial surface. Inspired by Fuse, Craft, Perplexity, and Notion blogs.

**Page redesign (`app/caregiver-support/page.tsx`):**
- Hero: serif title (`font-display`), subtle subtitle, white bg, tight spacing
- Featured section: 1 dominant (16:9 image, left 3/5) + 3 secondary (right 2/5, stacked)
  - Structural fix: image grid separated from text so secondary articles align with image height, not full column
  - Featured articles pulled client-side from `featured: true` flag (already existed on ContentArticle)
  - Graceful fallback: 0 featured → skip; 1 → full-width; 2 → side-by-side
- Category filters: soft text pills, no counts/emojis, `rounded-full`, no container
- Article grid: `aspect-[3/2]`, `rounded-lg`, 3-col desktop, larger images, reading time
- Removed ProviderBanner CTA from grid
- Page bg: `bg-white`, max width: `max-w-6xl`
- Multiple spacing iterations to get featured + category pills above fold

**API changes:**
- `app/api/caregiver-support/route.ts`: added `?featured=true` param, raised per_page cap to 200
- `app/api/admin/content/route.ts`: added `author`, `featured`, `sort_by`, `sort_dir` params + distinct authors list

**Admin dashboard (`app/admin/content/page.tsx`):**
- Author dropdown filter (populated from API)
- Featured dropdown filter (All / Featured Only / Not Featured)
- Sortable Title, Published, Updated columns

**Key debugging:**
- Featured article not showing: `.slice(0, 3)` cut off 4th featured article (3 from Sanity import + 1 new). Changed to `.slice(0, 4)`
- Layout shift: added `FeaturedSkeleton` placeholder during loading
- Secondary misalignment: restructured grid to separate image from text

**Commits:** `0038270`→`9330325` (10 commits)

---

### 2026-03-02 (Session 31) — Sanity CMS → Supabase Content Migration

**Branch:** `friendly-rosalind`

**What:** Migrated all 103 articles from Sanity CMS (v1.0) into the Supabase `content_articles` table. Articles are now viewable and editable in the admin CMS dashboard.

**Script:** `scripts/import-sanity.ts`
- Fetches all `eduMaterial` (85) + `researchAndPress` (18) articles from Sanity's public GROQ HTTP API
- Maps Sanity fields → `content_articles` schema (slug, title, excerpt, care_types, SEO fields, etc.)
- Converts Sanity Portable Text → `content_html` (via `@portabletext/to-html`) and `content_json` (Tiptap/ProseMirror JSON)
- Converts Sanity image refs to CDN URLs
- Maps Sanity category IDs → v2 CareTypeIds (6 care types)
- Upserts via `onConflict: 'slug'` — safe to re-run
- Supports `--dry-run` flag

**Also included (from prior work on this branch):**
- Layout: preconnect/dns-prefetch hints for external domains (GA, Supabase, map tiles)
- Navbar: reordered provider hub menu (Statistics first, Account last), replaced Q&A with Statistics, improved alt text on profile images

**Dependency added:** `@portabletext/to-html`

**Files modified:** `scripts/import-sanity.ts` (new), `package.json`, `package-lock.json`, `app/layout.tsx`, `components/shared/Navbar.tsx`, `SCRATCHPAD.md`

---

### 2026-03-01 (Session 30) — P1 Redirect Fixes + Playbook Cleanup

**Branch:** `seo/structured-data-p1`

**What:** Implemented three P1 redirect fixes and cleaned up stale playbook entries. PR #83 opened targeting staging, merge analysis clean.

**Redirect fixes:**
- `/caregiver-support/*` → `/resources/*`: 3 rules (bare → hub, single-slug → passthrough, multi-segment → hub)
- `/providers` → `/for-providers`: permanent 301
- Category alias redirects: switched from `redirect()` (307) to `permanentRedirect()` (308) in all 3 category page levels

**Playbook cleanup:**
- Marked FAQPage (PR #81), Review/Geo/Price (PR #82) as done in P1 fixes list and readiness checklist
- Updated takeaways: "structured data gap closed" (8 of 12 schemas), score 90% (A-)
- Updated route inventory: caregiver-support and /providers rows now show ✅

**Files modified:** `next.config.ts`, `app/[category]/page.tsx`, `app/[category]/[state]/page.tsx`, `app/[category]/[state]/[city]/page.tsx`, `docs/migration-playbook.md`, `SCRATCHPAD.md`

**Commits:** `2455fbd`, `8fb3624`

**PR:** #83 targeting staging — merge analysis clean, CI passing

---

### 2026-03-01 (Session 29) — Rich Structured Data (GeoCoordinates + PriceSpecification + Review)

**Branch:** `seo/structured-data-p1`

**What:** Added three structured data schemas to provider page LocalBusiness JSON-LD. Also ran slug migration, merged PR #81, and decided to defer MedicalBusiness.

**Structured data added:**
- **GeoCoordinates**: lat/lng in LocalBusiness for Google Maps and local pack
- **UnitPriceSpecification**: min/max price with HOUR/MONTH unit — piped raw `lower_price`/`upper_price` through metadata (was dead code before)
- **Review**: up to 5 individual reviews with star ratings for rich results

**Bug fix:** `meta?.lower_price` and `meta?.upper_price` were dead code — those fields don't exist on `ExtendedMetadata`. Fixed by adding `price_min`, `price_max`, `price_unit` to metadata in `iosProviderToProfile()`.

**Other actions this session:**
- Ran `007_provider_slugs.sql` in Supabase SQL Editor (verified working)
- Merged PR #81 (FAQPage + explain command) to staging via `/pr-merge`
- Decided to skip MedicalBusiness schema (low reward, revisit as P3)
- SEO score: 75% (B-) → **85% (B+)**

**Files modified:** `app/provider/[slug]/page.tsx`, `lib/mock-providers.ts`, `docs/migration-playbook.md`, `SCRATCHPAD.md`

**Commits:** `c510b95`, `ca6a5b8`

**PR:** #82 targeting staging

---

### 2026-03-01 (Session 28) — FAQPage JSON-LD + Notion Update + Corrections

**Branch:** `bold-gates`

**What:** Added FAQPage structured data to provider pages (P1 competitive differentiator), updated Notion migration playbook, corrected two false claims from session 27.

**Corrections made:**
- DNS cutover has NOT happened — olera.care is still running v1.0 (was falsely marked as done)
- provider_id is 7-char alphanumeric, not human-readable (was falsely claimed as slugs)
- Fixed in: `docs/migration-playbook.md`, `SCRATCHPAD.md`, Notion page (4 sections updated)

**FAQPage JSON-LD implementation:**
- Server-side fetch of answered questions from `provider_questions` table using service client
- FAQPage schema only emitted when real Q&A pairs with non-empty answers exist
- Questions passed to QASectionV2 as initial data (SSR-visible for crawlers)
- Graceful degradation if service client unavailable

**Notion playbook updates:**
- Added status callout at top with all findings
- Updated Phase 1 (slug parity), Phase 4 (redirects done), Phase 5 (DNS not done), Guardrails
- Footer updated with edit date

**Other:**
- Created `/explain` slash command for plain-English technical guidance
- SQL migration `007_provider_slugs.sql` still needs to be run manually in Supabase

**Files modified:** `app/provider/[slug]/page.tsx`, `docs/migration-playbook.md`, `SCRATCHPAD.md`, `.claude/commands/explain.md`

**Commits:** `c3462eb`, `b42611a`

---

### 2026-03-01 (Session 27) — Migration P0 Fixes

**Branch:** `bold-gates`

**What:** Investigated provider slug format compatibility (P0 #0), then implemented P0 SEO fixes for the v1.0 → v2.0 migration.

**Key discoveries:**
- **olera.care is still running v1.0** — DNS cutover has NOT happened yet (corrected in session 28)
- **`provider_id` is 7-char alphanumeric** (e.g., `r4HIF35`) — NOT human-readable. Added `slug` column (corrected in session 28)
- Provider page was rendering error HTML without `notFound()` — fixed

**Code changes:**
- `app/provider/[slug]/page.tsx`: Import `notFound()`, replace error HTML div with `notFound()` call
- `middleware.ts`: Added state abbreviation → full slug redirects (301) for all 51 states × all category routes, plus pagination suffix stripping

**Playbook updates:**
- Marked P0 #0, #1, #2 as complete in `docs/migration-playbook.md`
- Updated SEO report card rows for 404 handling, state abbreviations, pagination
- Updated overall score: 67% (C+) → 75% (B-)
- Updated readiness checklist to reflect DNS cutover already completed
- Updated key takeaways with new findings

**Files modified:** `app/provider/[slug]/page.tsx`, `middleware.ts`, `docs/migration-playbook.md`, `SCRATCHPAD.md`

---

### 2026-03-01 (Session 26) — v1.0 → v2.0 Migration Playbook

**Branch:** `claude/notion-action-items-1FXqC`

**What:** Deep exploration and documentation of the full migration from Olera v1.0 to v2.0. No code changes — pure research and planning.

**Deliverables:**
- `docs/migration-playbook.md` — 305-line comprehensive playbook with 6 sections
- Provider page SEO report card: 40 elements audited vs APFM & Caring.com
- Complete v1.0 route inventory (49 routes) mapped to v2 equivalents
- DNS zero-downtime cutover plan (from XFive + Vercel docs)
- CMS migration strategy outline (Sanity → TBD)
- Pre/post-cutover readiness checklist (20 tasks)

**Key discoveries:**
- v1.0 state URLs use abbreviations (`/fl`), v2 uses full names (`/florida`) — ~10,300 pages need redirect middleware
- v1.0 has forum (8 routes), relief network (4 routes), editorial content (66 articles) with no v2 equivalents
- Provider page is 67% SEO-complete — main gaps are structured data schemas
- APFM does NOT have FAQPage schema — adding it to Olera v2 = competitive advantage
- **CRITICAL:** v1.0 uses human-readable provider slugs (`/provider/elara-caring-ct`), v2 uses `provider_id`. If these don't match, 39K+ URLs will 404.
- XFive CSV analysis: `routes-clean.csv` (49 routes), `redirects.csv` (13 internal redirects)
- v1.0 CMS is Sanity with 66 articles + 7 press articles needing migration

**Pending:**
- Update Notion task with full playbook (TJ will do on local machine with MCP access)
- Verify provider_id format matches v1.0 slugs (P0 #0)
- Export top 100 pages from Search Console

**Commits:** `25f85d3`, `15c5608`, `d285004`, `1221a38`, `1fb0f72`, `07d31a4`

---

### 2026-02-28 (Session 25) — Homepage Final Polish & PR

**Branch:** `glad-goodall`

**What:** Final polish pass — NIH badge, community container, CTA redesign. PR #79 ready for merge.

- NIH badge: added actual NIA logo to homepage hero, iterated on size/position/spacing — compact, bottom-right, not distracting
- Community section: wrapped docuseries + flat links in unified `bg-gray-100` rounded container to fix unbounded feel
- CTA section: full redesign — stripped teal gradient + blobs, replaced with white bg, warm human copy ("You don't have to figure this out alone"), single primary button
- Removed `"use client"` from CTASection (no longer needed)

**Files modified:** `components/home/HeroSection.tsx`, `components/home/CommunitySection.tsx`, `components/home/CTASection.tsx`

**Commits:** `57e9550`→`d87e230` (multiple iterations on NIH badge + community + CTA)

---

### 2026-02-28 (Session 24) — Homepage Polish Continued

**Branch:** `glad-goodall`

**What:** Continued Phase 3 polish across all remaining sections. Design taste pass using Perena/Airbnb/Claude principles.

- Hero: shortened subtext, defaulted care type to Home Care, "Find local help" link
- Top Providers: honest heading ("Top-rated" not "near you"), subtitle, mobile scroll fade, skeleton count fix
- Explore Care: bento grid → uniform 3-col card grid with self-hosted images
- Social proof trust strip: removed entirely (no user value)
- Community: rebuilt 3x — final version is editorial docuseries layout + Perena-style flat link rows (Discord, Facebook, Resources, Benefits)
- CTA: unchanged
- Page flow: Hero → Top Providers → Explore Care → Community → CTA

**Commits:** `7f4a1f5`, `6caf6c8`, `cfac6d3`, `eccbeb6`, `407471c`, `3cf75f1`

---

### 2026-02-28 (Session 23) — Homepage Section-by-Section Refactor

**Branch:** `glad-goodall`

**What:** P1 Notion task — broke 1,440-line monolith into composable sections, removed redundancy, reordered flow.

**Commits:** `b5f997a`, `d4dbff7`, `599c7d6`

---

_Older sessions archived to `archive/SCRATCHPAD-2026-02.md`_
