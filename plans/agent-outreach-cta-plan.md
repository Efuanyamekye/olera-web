# Plan: Agent-first Olera — Phase 2 (Wizard of Oz post-question CTA + visual proof hook)

Created: 2026-05-02
Status: Not Started
Notion: [Agent-first Olera: validate demand with Wizard of Oz, capture AI traffic, defer the MCP build](https://www.notion.so/3545903a0ffe81e49efec895a9136ea7)
Branch: TBD (suggested tribute name; off `staging` per CLAUDE.md)

## Goal

Ship a Wizard-of-Oz post-question CTA on `/provider/[slug]`: after a seeker asks a question, render a visual hook ("Have us reach out to top providers in {city} for you") with **3 mini cards of real providers** as proof, capture email + structured intent, drop a Slack alert with everything TJ needs to do the outreach manually with Claude Code on a case-by-case basis. NOT automated — this is the demand-validation step before any agent infrastructure. **No admin UI in v0** — Slack is the fulfillment surface. If volume grows, we layer automation or build a queue UI; not until then.

## Why this design (one-line recap)

Show, don't tell. The 3 real provider cards turn an abstract "AI agent will help" pitch into a concrete "we'll contact these 3 specific providers." Lowers the email-leave risk and leans on Olera's data moat (real photos, real ratings, real trust signals) as the proof general-purpose AI competitors can't render.

## Success Criteria

- [ ] Post-question CTA renders on `/provider/[slug]` success state (excluding pages where SBF is present — see Decision D5)
- [ ] 3 mini cards show real top providers in the same city + category, excluding the current provider
- [ ] Click on a mini card deep-links to that provider's page
- [ ] Email + question payload submits to a new `/api/outreach/request` endpoint
- [ ] Row lands in `agent_outreach_requests` table; visible in admin queue
- [ ] Slack alert fires on submission with target providers + question + asker email
- [ ] Daily digest counts outreach requests
- [ ] Slack alert contains everything TJ needs to fulfill manually (asker email, question text, provider page, 3 target providers with links, city/category) — no admin UI required
- [ ] Zero impact on existing Q&A flow (regression-free) — verified by reading current question-flow paths
- [ ] PostHog events fire for: `outreach_request_clicked`, `outreach_request_card_clicked`, `outreach_request_submitted`
- [ ] Provider page initial-load latency does NOT regress (top-3 fetch must be ≤50ms p95, cached)

## Non-Goals (explicit)

- Auto-sending agent emails (this is Wizard of Oz; humans fulfill)
- Reply routing infrastructure (Phase 4)
- Per-user OAuth or agent-callable tool surface (Phase 4)
- Provider opt-out from being an outreach target (defer; can suppress at fulfillment time)
- A/B testing the three closed sibling copy variants (we picked variant 3 framing)
- Customization of the 3 providers shown (Phase 4)

## Decisions (locked, with rationale)

**D1. Source = same city + same category, current provider excluded.**
Rationale: city is more credible/visual than state; excluding current preserves the "save time NOT just contacting this one" framing.

**D2. Ranking rule = composite.**
Formula: `claimed_status_weight × rating × log(review_count + 1) × highlights_completeness`, where:
- `claimed_status_weight`: verified=1.5, claimed=1.2, unclaimed=1.0
- `rating`: avg star rating from `google_reviews_data` or stored avg
- `review_count`: total review count (log-dampened)
- `highlights_completeness`: count of Tier 1-4 trust signals from `lib/provider-highlights.ts`, divided by 4 (max), as a 0.5–1.0 multiplier

This stays close to existing intuition (rating × engagement) while privileging providers who've claimed/verified — they're more likely to actually reply when contacted.

**D3. Fallback when <3 providers in same city + category.**
Step 1: Try same category in nearest cities (use `lib/provider-utils.ts` distance helpers if present, else state-level). Each card labeled with its city so the seeker knows it's not local-local.
Step 2: If still <3, render the section with whatever count we have (1 or 2) — never pad with unrelated category. If 0, hide the visual hook entirely and fall back to the existing email-only enrichment modal (graceful degradation).

**D4. Auth not required for v0.**
Guest can submit. If user is signed in, attach `seeker_user_id`. Email is the canonical identifier.

**D5. SBF coexistence — skip outreach hook on pages with SBF for v0.**
Existing `hasBenefitsSection` precedent in `QASectionV2.tsx` already skips the soft enrichment modal when SBF is present. Same logic applies: SBF is the live wedge; we don't want two CTAs competing for attention. Reassess after 30-day measurement.

**D6. Rate limit: 3 outreach requests per email per hour.**
Mirrors the existing question rate-limit pattern at `app/api/questions/route.ts:108-117`.

**D7. No capacity cap in v0.**
Volume is low (~46 questions/week today, even at 20% CTA pickup that's ~10/week submissions). TJ handles fulfillment with Claude Code on a case-by-case basis, 24h SLA. If volume materially grows, we layer automation or build a queue UI then — not now. Slack alert is the surface.

**D8. PHI handling at fulfillment is human-curated, not enforced in code.**
TJ writes outreach emails with judgment ("A family in Austin asked about..."). Phase 4 will codify this when automation lands. Memory `feedback_phi_in_subject_lines.md` applies.

**D9. No admin queue UI, no fulfillment status tracking in v0.**
Slack alert is the work item. The DB row is the audit + measurement record. We measure submitted count for the Phase 3 decision gate, not fulfilled count. If TJ wants to mark something handled, he replies in the Slack thread (informal, no enforcement). Status tracking is Phase 4 territory.

## Tasks

### Phase A — Backend foundation (1-2 days)

- [ ] **1. DB migration `064_agent_outreach_requests.sql`**
   - Files: `supabase/migrations/064_agent_outreach_requests.sql` (new)
   - Creates `agent_outreach_requests` table:
     - `id uuid pk`, `seeker_user_id uuid null fk`, `seeker_email text not null`, `provider_id text not null` (page they were on), `city text`, `state text`, `category text`, `question_id uuid fk` (`provider_questions.id`), `question_text text`, `target_provider_ids text[]` (the 3 we showed), `status text default 'queued'` with CHECK in (queued, in_progress, completed, declined), `notes text`, `created_at timestamptz default now()`, `claimed_by uuid null`, `claimed_at timestamptz null`, `fulfilled_at timestamptz null`
     - Indexes: `(status, created_at)` for queue ordering, `(seeker_email)` for rate limit
   - Extends `seeker_activity` event_type CHECK constraint to include: `outreach_request_clicked`, `outreach_request_card_clicked`, `outreach_request_submitted` (per `feedback_event_allowlist_needs_db_migration.md` — DB constraint and app allowlist must match or every insert fails silently)
   - Verify: migration applies cleanly to local Supabase; `\d agent_outreach_requests` shows the table; insert + select round-trips work

- [ ] **2. New lib function `getTopProvidersByCityAndCategory()`**
   - Files: `lib/providers.ts` (new) OR extend `lib/provider-utils.ts`
   - Signature: `(opts: { city: string; state: string; category: string; excludeProviderId?: string; limit?: number = 3 }) => Promise<ProviderCardData[]>`
   - Implements the D2 ranking formula
   - Implements the D3 fallback (same category, nearest cities; then graceful <3)
   - Returns the same `ProviderCardData` shape that `BrowseCard` consumes (so the new mini-card has parity)
   - Caches result by `(city, state, category)` for 10 minutes via Next.js `unstable_cache` or in-memory — providers don't move around
   - Per memory `feedback_select_star_admin.md`: use `select("*")` to avoid hero_image_url-style column-name mismatches
   - Verify: unit test (or one-off script) shows: real provider page in TX returns 3 valid providers, excluding self; small-city case returns 0-2; cache hit on second call

- [ ] **3. New API route `POST /api/outreach/request`**
   - Files: `app/api/outreach/request/route.ts` (new)
   - Body: `{ question_id: string, asker_email: string, target_provider_ids: string[] }` (cards shown were determined server-side; client passes them back so we record what they saw)
   - Validates: email format, question exists, 3 target_provider_ids exist, asker_email rate-limit (D6), honeypot (mirror `app/api/questions/route.ts` pattern)
   - Inserts row in `agent_outreach_requests` with status=`queued`, attaches `seeker_user_id` if authenticated (session via `lib/supabase/server.ts`)
   - Logs `outreach_request_submitted` event in `seeker_activity` (auth users) and `provider_activity` (always)
   - Fires Slack alert via new `slackOutreachRequestSubmitted()` helper (fire-and-forget with `.catch()`)
   - Returns `{ ok: true, id }` or `{ error: '...' }`
   - Verify: curl POST creates a row; rate-limit kicks in on 4th request from same email; Slack alert lands

- [ ] **4. Slack helpers in `lib/slack.ts`**
   - Files: `lib/slack.ts`
   - Add: `slackOutreachRequestSubmitted({ providerName, askerEmail, city, category, questionText, targetProviders })` — primary fulfillment surface. Must be self-contained so TJ can act directly from Slack without needing to log in anywhere. Include:
     - Asker email (the To: address for outreach)
     - Full question text (no truncation — TJ needs full context to draft a reply)
     - Source provider page (link)
     - Three target providers, each with: name, city, link to their Olera detail page (so TJ can look up contact info per provider)
     - City + category metadata
   - Add: `slackOutreachCardClicked({ providerName, fromProviderName, askerEmail })` — lighter engagement signal for funnel measurement
   - Per memory `feedback_slack_formatting.md`: use `<url|label>` inline links, single-asterisk bold, no markdown headers
   - PHI consideration: question text in Slack is acceptable since the channel is already team-restricted. Subject lines / push notifications are the leak surface and we don't use those (per `feedback_phi_in_subject_lines.md`).
   - Verify: helpers compile; manual Slack post shows expected formatting; TJ confirms he has everything he needs from the alert alone

- [ ] **5. Daily digest extension**
   - Files: `app/api/cron/daily-digest/route.ts`
   - Add 24h count of `agent_outreach_requests` (queued + completed) to the existing daily Providers digest section
   - Verify: digest preview shows the new line; count matches manual SQL query

### Phase B — UI surface (1-2 days)

- [ ] **6. Server-side fetch on provider page**
   - Files: `app/provider/[slug]/page.tsx`
   - Add: call `getTopProvidersByCityAndCategory({ city, state, category, excludeProviderId: provider.provider_id })` alongside existing data fetches
   - Pass result as `topProviderAlternates` prop down to `QASectionV2`
   - If SBF is present (`hasBenefitsSection: true`), skip the fetch entirely (D5)
   - Verify: real provider page renders without errors; `topProviderAlternates` prop reaches `QASectionV2` with 3 entries

- [ ] **7. New mini-card component `AgentOutreachMiniCard`**
   - Files: `components/providers/AgentOutreachMiniCard.tsx` (new)
   - Props: `{ provider: ProviderCardData; onCardClick: (providerId: string) => void }`
   - Renders: photo (next/image with `fallbackImage` per PR #670 pattern), name (1-2 line truncate), rating + review count, ONE trust-signal pill from `getProviderHighlights({ ..., skipCapability: true, max: 1 })`, city label
   - Compact size: ~140px wide, ~180px tall
   - Tailwind classes consistent with existing card aesthetic
   - Click fires `onCardClick` (parent handles deep-link via `router.push` + analytics)
   - Verify: storybook-style render in isolation looks right; click navigates correctly

- [ ] **8. Update `QASectionV2.tsx` success state with outreach hook**
   - Files: `components/providers/QASectionV2.tsx`
   - Adds: new `topProviderAlternates: ProviderCardData[]` prop
   - In post-submit success branch (lines 497-574):
     - If `hasBenefitsSection` → fall through to existing soft enrichment modal (no change)
     - Else if `topProviderAlternates.length === 0` → fall through to existing soft enrichment modal (graceful degradation)
     - Else → render new outreach hook section:
       - Headline: `"Want us to contact the top providers in {city} for you?"` (variant 3 framing, city interpolated)
       - Subhead: `"We'll get pricing, intake requirements, and availability from these {N} providers. No phone calls."`
       - Horizontal-scroll row of `AgentOutreachMiniCard` (per memory `feedback_horizontal_scroll_pattern.md`)
       - Email input + submit button
       - Submit calls `POST /api/outreach/request` with `{ question_id, asker_email, target_provider_ids }`
       - On success: confirmation copy `"Got it. We'll reach out within 24 hours."` + "Skip" link to dismiss
       - On error: inline error per `feedback_error_feedback_first.md`
   - Analytics events on mount (impression), card click, submit
   - Verify: render new state on a real provider page in dev; all 4 paths hit (SBF skip, empty fallback, hook visible + happy path, hook visible + error)

- [ ] **9. Coexistence + analytics wiring**
   - Files: `components/providers/QASectionV2.tsx`, possibly `lib/analytics.ts` if shared analytics helpers live there
   - Confirm event names match the DB CHECK constraint added in task 1 (per the silent-failure incident memory)
   - Confirm the existing soft enrichment modal still works on SBF pages and on `topProviderAlternates.length === 0` pages
   - Verify: PostHog events fire with correct properties; DB writes succeed (no silent failure)

### Phase C — Ship (half day)

- [ ] **10. Pre-test review pass**
   - Files: all files above
   - Run grep checks per memory `feedback_grep_after_refactor.md`: no stale references to old function names; no Twilio/server-only imports leaking into client components
   - Confirm DB CHECK constraint matches app event_type allowlist (per `feedback_event_allowlist_needs_db_migration.md`)
   - Confirm rate-limit logic doesn't accidentally trip on legitimate retries
   - Confirm honeypot field exists if we added one
   - Build clean: `bun run build` (3795+/3795+ routes), typecheck 0 errors
   - Verify: full build succeeds locally; no console errors on the provider page in dev

- [ ] **11. Manual end-to-end test**
   - Real provider page in a city with ≥4 same-category providers (Austin/Houston memory care, Dallas home care)
   - Test guest path: ask question → success → 3 cards render → click card #2 → deep-links correctly → back → submit email → confirmation → DB row appears → Slack alert lands with all fulfillment context
   - Test authenticated path: same flow, `seeker_user_id` populated
   - Test SBF page: hook hidden, soft modal still works
   - Test small-city case: <3 providers → fallback to nearest cities OR graceful 0-2 OR empty
   - Test mobile (375px): horizontal scroll works, no overflow
   - TJ self-test: pretend to be a seeker, submit one real outreach request, confirm Slack alert has everything needed to draft an outreach email in Claude Code
   - Take screenshots for PR description
   - Verify: all paths work as designed; no regressions on the existing question flow

- [ ] **12. Open PR to `staging`**
   - Branch off `origin/staging` (per CLAUDE.md)
   - PR description: links to Notion task + this plan, screenshots, decision rule for measurement
   - Reviewers: per project default
   - Verify: Vercel preview deploy succeeds; smoke test on preview URL
   - Per CLAUDE.md: PR targets `staging` not `main`

## Risks

**R1. Provider page latency regression.** Adding a DB query on every provider page load is a high-traffic surface (per the recent leak audit, `/provider/[slug]` is the highest-traffic page). Mitigation: 10-min cache by (city, state, category) per task 2. If still slow, defer fetch to client-side post-question (cards render after submission).

**R2. Image bandwidth.** 3 extra provider images per page. Mitigation: next/image lazy load + LQIP placeholder; reuse existing fallback infra. May want to use smaller image variants if available.

**R3. Wizard-of-Oz capacity overflow.** Volume is low today (~46 questions/week). Even 20% CTA pickup = ~10 outreach/week, well within TJ + Claude Code throughput at 24h SLA. If volume materially grows, signal is the same Slack channel + daily digest count — we'd see it before it hurts. Mitigation = monitoring, not guardrails.

**R4. PHI exposure in Slack.** Question text + asker email together in a Slack channel. Channel is team-restricted; question text full-length is fine (TJ needs it to draft outreach). The leak surface for PHI is subject lines and push notifications, neither of which we use here. Per memory `feedback_phi_in_subject_lines.md`.

**R5. The 3 providers we show might not be the right 3 to actually contact at fulfillment time.** Logan curates manually anyway, but the user saw these specific 3. Mitigation: store `target_provider_ids` so we have an audit trail; allow Logan to substitute at fulfillment with a `notes` field documenting why.

**R6. Rate-limit edge case.** Same email can ask questions on N provider pages within an hour and trigger N outreach requests. The `3/email/hour` cap may be too restrictive if N is high. Mitigation: monitor first week; raise to 10/hour if legitimate users hit it.

**R7. Stale memory `feedback_event_allowlist_needs_db_migration.md`.** Forgetting the migration step caused a 7h silent-failure incident on 2026-04-29. **Task 1 explicitly requires both the app allowlist AND the DB CHECK constraint to be updated together.** Pre-test review (task 11) re-checks this.

**R8. Email collection without delivery harms trust.** FTC implication if "we'll get back to you" doesn't happen. Mitigation: TJ owns the SLA discipline at low volume + Slack alert visibility means missed requests are conspicuous. If TJ ever can't deliver in 24h, the next-best response is to email the seeker the 3 providers' phone numbers + a "sorry, here's the direct path" note — they get value either way.

**R9. Provider receiving outreach might not respond.** OpenClaw's automated reply rate (0.5%) is the cautionary baseline. Mitigation: this is exactly why Wizard of Oz, not automation. TJ + Claude Code crafts each email with judgment; track reply rate as a leading indicator.

## Phase 3 Decision Gate (after 30 days, copied from Notion task)

| # | Metric | Threshold | What it tells us |
|---|--------|-----------|------------------|
| 1 | SBF V3 step-1 pickup | ≥ 55% | Wedge works; orphan rate solvable through existing path |
| 2 | Post-question CTA email capture | ≥ 6% (vs 3% baseline) | Agent framing has real demand |
| 3 | AI-referral trend | ≥ 10/day (vs ~4/day) | Agents consume Olera data at scale |

**2 of 3 good** → greenlight Phase 4 (real MCP/agent-callable build).
**1 or 0 good** → defer indefinitely.

## Dependencies / Sequencing

- Phase 1 (llms.txt + JSON-LD + AI-referral instrumentation) ships in parallel; not blocked by this plan.
- This plan can start as soon as approved.
- 30-day measurement window starts on the date this CTA ships to staging (then promoted to main).

## Files Touched (estimated diff)

- New: `supabase/migrations/064_agent_outreach_requests.sql`, `lib/providers.ts` (or section in `lib/provider-utils.ts`), `app/api/outreach/request/route.ts`, `components/providers/AgentOutreachMiniCard.tsx`
- Modified: `app/provider/[slug]/page.tsx`, `components/providers/QASectionV2.tsx`, `lib/slack.ts`, `app/api/cron/daily-digest/route.ts`

Estimated diff: ~450-650 lines, 7-8 files. (Down from 8-10 after dropping admin UI.)

## Notes

- Branch base: `origin/staging` per CLAUDE.md.
- All commits should follow the imperative-mood convention.
- Single PR (multi-commit) preferred over splitting backend/UI — the value is the end-to-end flow.
- Pre-test review is non-negotiable — recent project pattern shows every pre-test pass finds 1-4 bugs.
- Phase 1 (llms.txt + JSON-LD) is a separate plan / smaller scope — not covered here.
