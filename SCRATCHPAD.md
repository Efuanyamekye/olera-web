# Scratchpad

> A living document for tracking work in progress, decisions, and context between sessions.
> Older sessions archived to `archive/SCRATCHPAD-2026-04.md`

---

## Current Focus

### 2026-05-03 — Build Olera into the agent-callable layer for senior care (P1)

Day-long strategic + writing session to lock the thesis behind the three sibling P1 CTA-copy variants and ship a clean Notion workbook.

**Thesis:** Olera becomes the data and functions AI calls when families make senior care decisions. Two routes hit the same primitives. **H1**: Olera-hosted agent on olera.care. **H2**: bring-your-own-AI calling Olera via MCP/ChatGPT App/REST. We test both. Build value first, gate later (Resend/Airtable/Fathom Loops playbook).

**What we ship now** — three categories, parallel clocks, all TJ-owned:
- **Engineering** (a few hours capture + a day for outreach module): llms.txt + JSON-LD + AI-referral instrumentation + new outreach arm as 4th SBF intake A/B variant. djb2 4-way split. AgentOutreachModule renders on Q&A surface for the 25% in outreach arm. 3 mini provider cards (top in city + category, current excluded) as visual proof. Email submit → DB row + Slack alert with full fulfillment context.
- **Content** (a few days, TJ writes/records): Medicaid guide as **article + YouTube video**. "How to apply for Medicaid for a parent in Texas using ChatGPT and Olera." Founder voice. TJ as AI-use expert, Olera as real-world tool layer. Be one of one. Article ranks on Google, video ranks on YouTube and gets cited by AI agents that browse video sources. Cap the bet at one of each.
- **Operations** (continuous, TJ owns): outreach fulfilled manually in Claude Code via Slack alert. 24h SLA. No admin UI in v0.

**Decision gate at 30-90 days** — three usage signals: SBF step-1 pickup ≥55%, outreach email-capture ≥6% (vs 3% baseline), AI referrals ≥10/day + Medicaid content ranks. 2 of 3 = greenlight scaling.

**Notion (canonical):** [Build Olera into the agent-callable layer for senior care](https://www.notion.so/Build-Olera-into-the-agent-callable-layer-for-senior-care-3555903a0ffe81e18e63f566794560a6). Old duct-taped parent + child workbook trashed. Three sibling CTA-copy tasks were closed earlier with "superseded by [old parent]" notes — those links break against the trashed page but the siblings are Done so it's cosmetic.

**Local mirror:** [`plans/agent-outreach-cta-workbook.md`](plans/agent-outreach-cta-workbook.md). Stays in sync with Notion. [`plans/agent-outreach-cta-plan.md`](plans/agent-outreach-cta-plan.md) is the engineering task breakdown.

**Doc structure choices made along the way:** hybrid (strategic narrative on top + execution by category + decision gate + conditional scale). Not phase-numbered for execution because the work runs in parallel on different clocks. Verb-led titles for orientation. TJ voice throughout: no em dashes (use `--`), direct, no PR-speak, no jargon ("lever," "asymmetry buys us," etc. all dropped). Multi-session-friendly.

**Working-pattern split (locked):** markdown file is the source of truth for content (mine to edit). Notion is the presentation surface (TJ's to format with collapsibles, callouts, headings). When iterating on this task in future sessions, work from `plans/agent-outreach-cta-workbook.md`. Surface content changes in chat; TJ syncs to Notion. If TJ changes copy in Notion, he'll tell me to sync the markdown — otherwise the two will quietly diverge.

**Tooling note:** Notion `update-a-block` MCP wraps payload in `body.type` which the API rejects. Workaround pattern that worked: delete-old + patch-block-children with `after` anchor to insert at the correct position. Used this to surgically add the article+video split without duct-taping. Documented in case I hit the same flow again.

**Team comms (drafted in chat for TJ's Slack to #marketing-team):** "Build Olera into the AI agent layer for senior care. ChatGPT already sends us referrals every day. We make Olera the data and tools AI agents call when families apply for Medicaid, find providers, or send connection requests. Two tracks running in parallel: an Olera-hosted AI on our site, and a bring-your-own-AI version for families using ChatGPT, Claude, or Gemini." TJ's broader Slack message reframes team focus: Chantel mostly on care shifts (1 article every 3 weeks), Logan on staffing (revenue path), TJ owns this agent-layer work for the next few weeks.

**End of session — final state of the strategic doc:**
- Cut redundant sections: Operations H3 (was duplicating "What we capture and how TJ acts on it") and the entire Non-goals H2 (most items were already implied; the load-bearing ones — MCP premature, OpenClaw lesson, auto-submission — are covered in surrounding sections).
- "Read the signals" simplified from 3 to 2 signals. Cut signal #1 (SBF benefits prompt) — wasn't about agent-callable, was anchoring on the wrong thing. New gate: H1 signal (outreach email capture ≥6%) + H2 signal (AI referrals ≥10/day + Medicaid content ranks). Decision: scale whichever route signaled.
- Final structure: 8 H2 sections, 3 H3 under "What we ship now" (Capture, Olera-hosted outreach module, Medicaid guide), 4 H4 under the outreach module.
- Notion is fully structured by TJ — toggles wrap Scale/Risks/Where-the-gate. Markdown stays in sync as of session end.

**Tooling note for future Notion writes:** `mcp__notion__API-update-a-block` rejects `body.type` wrapper — workaround is delete + `patch-block-children` with `after` anchor. Also: when TJ formats in Notion (creating toggles, converting list types), block IDs and parent relationships shift — stale anchors fail with "not parented by" errors. Solution: refetch children before patching, or ask TJ to paste content himself.

### 2026-05-03 (PM) — Phase 2 build: H1 Olera-hosted outreach module shipped end-to-end

All 6 build tasks from `plans/agent-outreach-cta-plan.md` landed in one focused session. Branch: `lively-poitras` (one commit behind staging at session start; rebase later when ready). Migration 064 applied to Supabase by TJ mid-session. Typecheck clean across all touched files (sole noise was a duplicate `BenefitsFunnelByVariant` declaration in `app/admin/analytics/page.tsx` that was caught + fixed).

**What's now live as code (not yet deployed):**

1. **Migration `064_agent_outreach_requests.sql`** — creates `agent_outreach_requests` table (id, seeker_user_id, seeker_email, source_provider_id, city/state/category, question_id/text, target_provider_ids[], status, claim metadata) + extends `seeker_activity_event_type_check` to allow `outreach_module_impression`, `outreach_card_clicked`, `outreach_request_submitted`. App allowlist + DB CHECK coupled in one migration per `feedback_event_allowlist_needs_db_migration.md`. RLS enabled (service-role only). 3 indexes: status+created (queue), email+created (rate limit), source_provider (per-page analytics).

2. **`lib/analytics/variant.ts`** — added `IntakeVariant` (4 arms with "outreach") + `assignIntakeVariant` (mod 4) alongside the legacy 3-arm `BenefitsVariant`/`assignBenefitsVariant`. Kept legacy intact so BenefitsDiscoveryModule's internal mod-3 copy A/B continues working untouched. **Math note: gcd(3,4)=1, so independent mod-3 + mod-4 on the same sessionId yield a uniform 1/4 distribution across all 4 arms.** No need to lift variant assignment to a single source.

3. **`lib/agent-outreach-providers.ts`** — `getTopProvidersByCityAndCategory({ city, state, category, excludeProviderId, limit })`. Composite score `weight × rating × log(reviews+1) × completeness`. Score precomputed once per provider (not per sort comparison — would burn ~140 buildHighlights calls otherwise). City → state fallback. Claim weight wired up properly via parallel business_profiles query (verified=1.5, claimed=1.2, unclaimed=1.0) — TJ pushed back on the "stub at 1.0 for v0" approach with "Claude Code makes hard things easy, don't underdo it" ([feedback_default_to_now_not_later.md](feedback_default_to_now_not_later.md) reflex). Completeness floor 0.5 / ceiling 1.0 so unenriched providers can still compete in small-city pools. 10-min in-memory cache keyed by `(state|city|category)`; cache stores `limit+1` and excludes self at read time so adjacent provider pages share hits.

4. **`components/providers/AgentOutreachModule.tsx`** — client component with horizontal-scroll mini cards (next/image + onError fallback to category stock), email capture, honeypot, inline error + success states. Slate/cream palette. Impression fires once via ref guard (handles React strict-mode double-mount). Submit body now passes `target_providers: { id, name, slug, address }[]` so the Slack alert has rich per-provider links without a server-side slug lookup.

5. **`app/api/activity/track/route.ts`** — added 3 new event types to `FAMILY_EVENT_TYPES` AND `profileOptionalEvents` (so guests fire them without a profile_id, matching `save_nudge_*` precedent).

6. **`components/providers/IntakeVariantSlots.tsx` (new)** — `BenefitsArmGate` (renders children eagerly during SSR; hides post-mount on outreach arm) + `AgentOutreachSlot` (renders AgentOutreachModule iff outreach arm). Both share the same `assignIntakeVariant(getOrCreateSessionId())` call. SSR trade: 25% in outreach arm see brief flash of BenefitsDiscoveryModule disappearing + AgentOutreachModule appearing on Q&A surface; 75% see no change. Chose to preserve first-paint UX for the majority arm.

7. **`app/provider/[slug]/page.tsx`** — added 4th item to existing `Promise.all` for top providers fetch (cached, returns [] gracefully on missing context). Wrapped `<div id="benefits">` in `BenefitsArmGate`. Inserted `AgentOutreachSlot` inside `<div id="qa">` below `QASectionV2` with `mt-6` spacing. Exported `PROFILE_CAT_TO_SUPABASE_CAT` from `lib/types/provider.ts` for the ProfileCategory→supabase string map.

8. **`POST /api/outreach/request`** — validates email + target_providers shape + honeypot, rate-limits 3/email/hour, attaches seeker_user_id when authenticated, inserts row, fires `outreach_request_submitted` to seeker_activity (fire-and-forget), fires Slack via `slackOutreachRequestSubmitted` (fire-and-forget). Returns `{ ok, id }`.

9. **`slackOutreachRequestSubmitted` in `lib/slack.ts`** — self-contained fulfillment alert. Reply-to email, source page link, target provider bullet list with name + city + Olera detail link, full question text (no truncation — TJ needs full context), city/state/category metadata, request-ID footer with 24h SLA reminder. The `text` notification preview is PHI-free per `feedback_phi_in_subject_lines.md` ("Outreach request: 3 Memory Care providers in Austin, TX").

10. **Admin analytics 4th row** — extended `BenefitsFunnelByVariant` type (in BOTH `app/api/admin/analytics/summary/route.ts` and the duplicate declaration in `app/admin/analytics/page.tsx`), added `outreach: emptyStages()` to bucket sets, separate seeker_activity query for outreach events, distinct-session bucketing into the new `outreach` `BenefitsBucket`. UI table renders `—` for the middle "Care need ✓" cell on outreach since the funnel skips that step. Subtitle now reads "1/4 split by djb2 mod 4 — 3 benefits-copy arms + 1 outreach arm."

**Files touched:**
- New: `supabase/migrations/064_agent_outreach_requests.sql`, `lib/agent-outreach-providers.ts`, `components/providers/AgentOutreachModule.tsx`, `components/providers/IntakeVariantSlots.tsx`, `app/api/outreach/request/route.ts`, `plans/agent-outreach-cta-plan.md`, `plans/agent-outreach-cta-workbook.md`
- Modified: `lib/analytics/variant.ts`, `lib/types/provider.ts`, `lib/slack.ts`, `app/api/activity/track/route.ts`, `app/api/admin/analytics/summary/route.ts`, `app/admin/analytics/page.tsx`, `app/provider/[slug]/page.tsx`

**What's NOT done (intentional — out of scope for v0):**
- Daily digest extension (Phase A task 5 in `plans/agent-outreach-cta-plan.md`) — admin row covers daily visibility for now.
- Manual end-to-end test on a real provider page — TJ to do this when ready.
- Vercel preview / staging promotion / PR.

### 2026-05-03 (late PM) — Design pass + Slack fire-and-forget bug fix (post-test iteration)

TJ tested the v1 module on a Washington DC nursing-home page. Visual was solid but he had a sharper design vision and one functional bug: no Slack alert landed.

**Design crit + redesign — both sides agreed direction first, then I shipped:**

- **Killed cream-bg + full border container.** Was reading as "ad callout" — too much chrome around content. Now borderless with a subtle top divider (`mt-8 pt-8 border-t border-slate-200`) so the module reads as part of the page flow.
- **Two-line H2:** outcome hook ("Skip the phone calls.") + mechanic line ("Have an AI agent contact the top providers in [City] for you."). TJ's argument for keeping "AI agent" in the second line: brand-education tax to drop entirely; this plants the seed for future agent-callable products (Medicaid apps, etc.). Outcome leads, mechanic supports.
- **Anthropic/Claude/Grok-style 3x3 pulsing dot grid** prefixed to H2 (and persists into success state). Staggered diagonal wave on a 1.5s cycle. Visual shorthand for "AI is at work" without saying "loading." TJ proposed this from a walk; locked the inline-grid (option A) over background-texture (option B) — more explicit signal, gives the static module a motion moment. Custom keyframe in `app/globals.css` (`animate-outreach-dot`) with prefers-reduced-motion override.
- **Caption above cards:** "Top 3 [Category] providers in [City], where families are actively reaching out." Social proof anchored to behavior we actually measure (engagement events) — not "booking" data we don't have. TJ originally said "booking"; we negotiated honest framing. ✅ landed in sentence case after pre-test caught all-caps reading badly on a sentence-length string.
- **Optional relationship chip row:** Parent / Spouse / Me / Family. Toggling on/off; selected = inverted dark slate. Lifts fulfillment context without forcing collection. TJ confirmed name field NOT viable (we don't capture it on questions).
- **Card click → opens in new tab** (`target="_blank" rel="noopener noreferrer"`). Was a conversion leak; family who clicked a card lost their place in the form.
- **Pill colors unified** to single muted slate (was multi-color from trust-signals system, looked ad-hoc).
- **Submit copy:** "Get the answers" (was "Send the agent" — cold/novel).
- **Success state honest:** "On it. We'll email you back with what we hear from these N providers." Dropped the "24h SLA" promise — TJ flagged we can't guarantee it.

**Then a real bug bit:** TJ submitted, got the success state, no Slack alert.

**Root cause:** `app/api/outreach/request/route.ts` was firing both the `seeker_activity` insert and `sendSlackAlert` as fire-and-forget Promises after returning the response. **In Vercel's serverless runtime the function instance can be torn down right after the response goes out, killing pending Promises.** Every other `sendSlackAlert` call site in the codebase awaits; mine didn't. Pre-test review missed it because I traced the logic but didn't compare to the rest-of-codebase pattern.

**Fix:** Both side effects now run via `await Promise.allSettled([activityInsert, sendSlackAlert])` before the response. Parallel so neither blocks the other; failure-tolerant so neither aborts the response (the canonical `agent_outreach_requests` row is already saved at that point). Adds ~200-400ms response latency. Logged this lesson — pre-test reviews need a "does this match the rest-of-codebase pattern" pass.

**Other bugs caught in two pre-test review rounds (all fixed):**
- Phantom `mt-6` div for 75% of visitors who weren't in outreach arm (wrapping div rendered without children → empty 24px gap)
- Double-fire of `outreach_request_submitted` event (server route + client both fired; set semantics in admin saved the count, but raw log got dupes — dropped client fire)
- Unused `Link` import
- Caption all-caps unreadable on long sentence (sentence case)
- Pulsing dots ignored `prefers-reduced-motion` (added override to existing reduced-motion block)

**Final commit chain on `lively-poitras`:**
- `02c4098e` — Initial 6-task build
- `01ee2420` — First pre-test fixes (phantom div, double-fire, unused import)
- `4a2b3c2a` — Design pass (dots, caption, chips, kill cream box, kept "AI agent" line per TJ)
- `a8b85c28` — Second pre-test fixes (caption case, prefers-reduced-motion)
- `b3ad7ee5` — Slack fire-and-forget fix (await + Promise.allSettled)

**Resume next session here →** Re-test on the same DC nursing-home page (or any Texas memory-care page). Slack alert should land this time. If healthy, open PR to staging. If still no alert, first diagnostic: confirm `SLACK_WEBHOOK_URL` is set in the test environment (other Slack alerts working = it's set).

### 2026-05-02 — Places Photo + Reviews API leak patches (P1)

Mercury alert May 1: $4,531 April Google Cloud bill, +184% MoM on Places API (New), $25K/yr pace.

**Three suspected leaks identified, in order of likely cost share**:
1. **Google Reviews per-pageview leak** on `/provider/[slug]` (high-traffic page) — backfill route silently returns on null without writing to DB, so providers Google has no reviews for (or any API hiccup) re-fetch on every visit forever. 12.4% of providers (9,159) in this leak surface. Plan: [`plans/google-reviews-leak-patch-plan.md`](plans/google-reviews-leak-patch-plan.md). Branch: `quiet-tabby` (off `staging`).
2. **Discovery pipeline Text Search** in `scripts/discovery-batch.py` — re-ran across 2,362 cities in 90d at $0.035/call. Deferred to follow-up plan.
3. **Photo leak in `/api/provider/[slug]/info`** — already patched in [PR #717](https://github.com/olera-care/olera-web/pull/717) on branch `fierce-panini`. Honest re-assessment: probably <5% of the bill since `/review/[slug]` gets minimal traffic. Ship as cleanup, expectations calibrated.

**Process learning** (saved as [feedback_no_killswitch_for_slow_leaks.md](feedback_no_killswitch_for_slow_leaks.md)): for cost leaks, audit ALL Places API callers + measure traffic before scoping a fix. Anchored on the named culprit too early; missed the bigger leak on the provider profile page. TJ pushed back twice before I revised. Lesson: when user says "we ran X a lot" or "nobody goes to Y," that's a measurement signal, not a side note.
### 2026-04-30 → 2026-05-01 — SBF redesign (P1) — full V3 stack + Phase 6 + multiple QA-driven fixes shipped to `good-thompson`, awaiting final QA

Branch `good-thompson` has 11 commits covering the complete V3 redesign + welcome-email upgrade + multiple post-QA refinements. **Migrations applied to Supabase** (057, 058, 059). Vercel preview deploys on each push for build validation.

**Plan:** [`plans/sbf-2step-redesign-plan.md`](plans/sbf-2step-redesign-plan.md) — original was 9 phases / 8 PRs; actual ship was 5 commits on a single branch (faster iteration cycle).

**Notion:** [P1 task](https://app.notion.com/p/3525903a0ffe81338f59d5b5326b1796) · [sibling P2 closed via metadata-blob deletion](https://app.notion.com/p/3525903a0ffe81a2b7a8c0e746ad35ae) · [SBF Copy Variants tracking DB](https://app.notion.com/p/ec27110d1c6a4cc1a76bdf991344f63d) (5 rows seeded — control/money_loss legacy, availability/loss/empathic planned)

**Commits on `good-thompson`:**

- `a9631f90` — Phase 0/1/2: 3 migrations + token lib + email validation extension + Resend bounce → `email_validity` flag + save-results route major update (channel toggle, drops `metadata.benefits_results.answers` duplicate blob, hardened validation, token issuance, SMS-anonymous path via Supabase phone auth, channel-specific welcome dispatch). Backend foundation, silent.
- `3fe7531e` — Phase 4/5: `ResultsSheet` unified component (mobile bottom sheet / desktop right panel, Telegram-grade animation, body-scroll lock, focus mgmt) + `/m/[token]` standalone page (token-as-auth, no login wall, force-dynamic, noindex robots) + `lib/benefits/provider-tie-in.ts` (heuristic overlap → "Some of these may help cover services at {Provider X}.") + new `panel-in-right` keyframe in globals.css. Components silent — not yet wired.
- `c749e993` — Phase 3 CUTOVER: variant rename (`control|money_loss` → `availability|loss|empathic`, djb2 mod 3) + rewrote `BenefitsDiscoveryModule` for 2 steps (was 917 → 585 lines) + admin analytics 3-arm split table with auto-collapsing legacy V2 row + `care_need_selected` event property for per-card pickup + provider page passes `care_types`/`category` for tie-in. **Visible change.**
- `22cb1933` — pre-test review fixes (4 bugs caught before user testing): Twilio Node SDK leaking into client bundle via `lib/twilio` import in ResultsSheet (would have failed prod build); hero copy *"0 programs"* mismatch with empty-state below; last_viewed_at error handler used `.then(undefined, ...)` which never fires for Supabase resolved-with-error promises; `preferred_contact_channel` read from metadata blob instead of column.
- `ab05f9dd` — 3-step restructure (TJ flagged step 2 felt unnatural): inserted *"Who is care for?"* tap-question between care need + contact (4 cards: parent/spouse/me/other-family) → step 3 H2 personalized via `relationshipPhrase()` ("Save your parent's 11 matches"). Switched framing from "send" to "save" (matches actual experience — matches are computed, we're preserving them). Killed channel toggle in favor of email + phone both visible, phone optional. Combined honest consent. Empathic H2 anchored to state ("Care is expensive in {state}." — was naked). All variant subs use "find" not "show" — fixes show/send framing whiplash.
- `6a8ec1fe` — Phase 6 welcome email upgrade: replaces generic "your results saved" body with state-filtered top-5 program list, personalized for relationship, primary CTA → `/m/{token}` (token IS auth — dropped Supabase magic-link generateLink + verifyOtp roundtrip, saves ~200-400ms). Subject personalized: "Your parent's 11 care benefit matches in Texas." Email body uses display-font headers, scannable program cards with savings + tap-through to `/benefits/{state}/{programId}`. SMS body also relationship-aware. Helpers extracted: `relationshipFamilyPhrase` / `relationshipPossessive` / `stateDisplayName` / `topSavingsCopy` / `CARE_NEED_LABEL_FOR_COPY`. Drops the unsubscribe link (transactional email; existing `/unsubscribe/[slug]` route is provider-focused).
- `f936f117` — pre-test review caught critical regression from sibling P2 cleanup: removing `metadata.benefits_results.answers` entirely broke `WelcomeClient.tsx:401-411` which reads `benefitsAnswers.careNeed` for the careNeedLabel switch + careNeedProviderCategory mapping. The UI care-need bucket has NO flat-metadata equivalent (top-level `care_needs` is the granular array). V3 users clicking "See full list at olera.care" from the overlay would land on degraded `/welcome`. Fix: restored minimal `answers: { careNeed }` blob; truly-duplicate fields (age/income/medicaid/stateCode) stayed deleted.
- `6b77a107` — dejank pass (TJ: "progress bars don't really make sense and the animation transitions look odd and janky"): replaced 3 segmented progress bars with a single proportional bar across the full width (the old design's filled segment only spanned ~30% of visual width — eye reads as "barely started" not "1/3 done"). Added `step-in` keyframe (220ms slide-up + fade) + keyed wrapper `<div key={step}>` so React remounts on step change → animation plays. Dropped indefinite progress-dot pulse (was annoying on step 3 where it never filled). Tightened post-click setTimeout 180ms → 140ms now that step-in animation provides smooth visual continuity.
- `31bd59f5` — two QA-found bugs: (1) 🔴 clicking match cards → 404. Root cause: `app/benefits/[slug]/[program]/page.tsx`'s `resolveProgram()` only looked up programs in pipelineDrafts, but `getEnrichedProgram` returns waiver-library IDs for any program in base data — those never matched. Added waiver-library fallback path. (2) 🟡 `/portal/profile` "Who needs care" empty after V3 submit. Root cause: V3 wrote relationship to `metadata.relationship` (new V3 enum field) but every existing UI consumer reads `metadata.relationship_to_recipient` (free-form text). Fix: added `relationshipDisplayName()` mapping ("my-parent" → "Parent") and write to BOTH fields. Profile + admin views + completeness scorer all light up.
- `f0e685bf` — copy refresh based on TJ feedback ("There's help paying for care in Texas + Paying for care as an option as a low-income user"): dropped trust strip (Free · Under a minute · Never sold to insurers · N programs — chrome fighting for attention), bumped subtitle visual weight (text-sm/gray-500 → text-base/gray-700) so it carries the "do this" beat. Reframed H2 vocabulary from "paying for care" (overlapped with the first card label) to "care benefits" (umbrella concept above the cards): availability *"Texas care benefits for families like yours."* / loss *"Most Texas families miss the care benefits they qualify for."* / empathic unchanged. Notion variant rows synced to deployed copy.

**Locked decisions:** retire 5-step entirely (no gated revert — git is revert); 3-arm A/B on entry-point copy (availability/loss/empathic) replaces V2 control/money_loss; "Paying for care" first card (highest pain-universality + H2 fluency across all arms); per-card pickup tracking via `care_need_selected` property on existing `benefits_step_completed` event; phone is now optional bonus signal (not forced channel); welcome notifications fire email always + SMS additionally when phone provided; `/welcome` stays untouched as opt-in destination via "See full list" CTA only. Decision rule = step-1 pickup (39% → 55%+) AND contact submission (8.2% → 15%+); <8% triggers revert.

**Phase 0.1 verification result** (preserved at `scripts/verify-arm-b-dollar-floor.ts`): sampled enriched program data across TX/FL/CA × 4 care needs → 10/12 combos clear the $400/mo floor. `payingForCare` (most-clicked card) clears comfortably everywhere. Two failures: `companionship` in FL+CA (programs match but no savings data). Verdict: ship Arm B as written; "often" qualifier defends population-level claim. Watch for companionship-pickup conversion under Arm B in FL/CA. Logged in Notion `loss` row.

**Audience truth that drove the design:** TJ's sustained-audience knowledge → ~95% of users won't engage with email (and senior-care families are typical users). This made Pattern G (in-session overlay as deliverable) the right move over the original Pattern A (redirect to /welcome): the SESSION is the conversion, email is a backup for the 5%. SMS (~98% read rate) is the strategic upside — driven the channel toggle decision, then evolved to phone-as-optional-bonus when toggle felt too friction-y.

**What's NOT polished (intentionally — known follow-up phases):**
- ~~Phase 6: welcome email body~~ ✅ shipped in `6a8ec1fe` — state-filtered top-5 list, personalized, links to `/m/{token}`
- Phase 7: Privacy policy page not yet updated. Inline consent text in module IS shipped.
- Phase 8: Admin per-card pickup chart not yet — data flowing via `care_need_selected` event property, just no UI exposure.
- Phase 9: Notion legacy `control`/`money_loss` archival → wait for V3 to have a few weeks of data before flipping their Status to Archived with final numbers.

**Pre-test reviews caught real bugs at every stage:**
- 4 bugs in initial cutover (Twilio in client bundle, hero "0 programs" mismatch, last_viewed_at error swallow, preferred_contact_channel from wrong location)
- 1 bug after Phase 6 (sibling P2 cleanup over-deletion broke WelcomeClient)
- 0 bugs in dejank pass (clean)
- 2 bugs from QA on preview (404 on match clicks, "Who needs care" empty)
The pattern of every-pass-finds-1-4-bugs continues to hold. Skipping the pre-test would have shipped most of these.

**Surprising data discoveries that shape the system:**
- `getEnrichedProgram` returns the waiver-library ID for any program in base data, even when a draft fuzzy-matches it. Pipeline-only programs return draft IDs. Mixed sourcing of IDs means routes that consume "any program ID" need to handle both. The `/benefits/[slug]/[program]` route was waiver-library-blind — fixed in `31bd59f5`.
- `metadata.relationship_to_recipient` is the canonical display field across `/portal/profile`, admin views, CarePostSidebar, ProfileEditWizard, completeness scorer. Anything writing relationship data to a different field is invisible to the existing UI. V3 now writes both the enum and the display version.
- Removing the `benefits_results.answers` blob entirely is NOT safe even though most fields have flat-metadata equivalents — `answers.careNeed` (UI bucket) has no flat equivalent. Single source of truth is fine; over-deleting breaks downstream consumers.

**Vercel preview status:** auto-deploys on each push to `good-thompson`. PR creation URL: https://github.com/olera-care/olera-web/pull/new/good-thompson

### 2026-04-30 — SBF redesign — original planning entry (kept for context)

Cutting the embedded SBF on provider pages from 5 steps to 2 (care need → contact). Silent profile creation via existing `/api/benefits/save-results`. Pattern G post-submit: side-panel/bottom-sheet overlay on the provider page, not a redirect to `/welcome`. Same component renders at new `/m/[token]` route. Email or SMS — user picks. Three copy arms (`availability` / `loss` / `empathic`) replace the existing copy A/B.

**Locked decisions** (from extended exploration with TJ): retire 5-step entirely (no gated revert — git is revert), three copy arms in 3-way A/B, refined trust strip (drops "Private" filler + the now-false "No signup to start"), 4 cards reordered with "Paying for care" first (highest pain-universality + H2 fluency), per-card pickup tracking, contact channel toggle (email default, SMS opt-in via existing Twilio infra) — TJ's audience knowledge = ~95% won't engage with email, so SMS (~98% read rate) is the strategic upside. Pattern G makes the in-session experience the deliverable rather than email follow-up. `/welcome` stays untouched as opt-in destination only. Decision rule = two metrics: step-1 pickup (39% → 55%+) AND contact submission (8.2% → 15%+ for clear win, <8% revert).

**Pre-implementation check** (Phase 0): sample SBF match output for $400+ floor in Arm B's subhead; if matched programs don't credibly hit that range, soften Arm B to drop the dollar specificity.

### 2026-04-30 — /product-led-growth strategic session: revenue architecture embedded, 5 Notion tasks queued

Long strategic session. Started as a /product-led-growth daily run, surfaced a 3-day state drift (post-answer hook shipped 4/29 across 9 PRs, never tracked on Active Experiments board), pivoted into a deep revenue conversation, ended with 5 tasks on the Web App Action Items board and the slash command rewired to load revenue context up front.

**State hygiene first.** Post-answer hook (Strategic Backlog #5 / TJ Task B) finally landed on the Active Experiments board with shipped 2026-04-29, decide-by 2026-05-13. Strategic Backlog row 5 status updated to shipped. Run entry appended to the Running Thread. Daily Report created at https://app.notion.com/p/3525903a0ffe81ea978cd7a9c0e30bb5. Three skipped daily runs (4/27-29) had let the post-answer hook ship into prod with no measurement plan or kept/rolled-back trigger — the failure mode the Running Thread exists to prevent.

**Pulled real funnel data instead of relying on the screenshot.** 7d window: page views 9x prior week (642 → 5,996), question volume slightly down (497 → 458), provider distinct sign-ins flat (25 → 25), benefits intake completion 7/50 = 14%. Q&A funnel cohort: 377 sent → 145 opened (56% of delivered) → 110 clicked (76% of opened) → 25 signed in (~23% of clicked) → 21 answered (84% of signed-in). My initial "click-to-signin leak" framing was sloppy because of time-window misalignment between email-send-date and activity-event-date. TJ called it: "providers are skeptical, get tons of spam, don't know we're legit." The right read on the Q&A funnel is provider trust, not a backend bug. Could spend hours diagnosing residual unexplained drop — agreed not the highest-leverage next move.

**The 96% asker orphan rate is the actual structural ceiling.** 458 weekly questions, only ~12 askers leave email (3-4%). One `questionAnsweredEmail` actually fires per week (because asker_email is empty for 96% of askers). My family-return instrumentation play was dead in the water as framed — the link doesn't exist for 96% of askers. This is the variable that bounds revenue across all three streams.

**Revenue architecture conversation.** TJ pushed back on me re-explaining what he'd already documented. Read what I'd missed: `/Users/tfalohun/Desktop/olera-hq/strategy/BUSINESS-MODEL.md` (canonical) + Olera Strategic Narrative (Notion `3025903a-0ffe-816d-9ceb-c8986c17425a`). Ranked the three streams: MedJobs ($49/mo, live since 4/10, 0 paid in 20d, retarget at senior living not small home care), Olera Pro (intentionally unpackaged, Q&A is the de facto provider acquisition funnel — 24/24 sign-ins via Q&A, 0 via claim CTA), Marketplace transaction rails (parked, Phase 3). The wedge (SBF) is acquisition not revenue. TJ explicitly chose to stay build-value-first per Resend / Airtable / Fathom Loops playbook — don't gate prematurely, watch usage form, gate where logical. Acknowledged risk: defers revenue, requires discipline reading signal.

**Embedded revenue context into /product-led-growth command.** New "Revenue architecture" section (lines 18-30) lays out the three streams + customer profiles + the wedge + company horizon ($1M ARR threshold). New "Product philosophy" section (lines 32-46) states the build-value-first bet explicitly and tells future runs not to propose paywalls or pricing changes as daily/weekly moves. Phase 1 context-loading expanded to read BUSINESS-MODEL.md + Strategic Narrative before drawing conclusions. Reference section updated. Memory file `feedback_build_value_first_gate_later.md` saved + indexed in MEMORY.md so the philosophy is durable across conversations even outside /product-led-growth.

**Deep research on what makes Olera sticky for senior care providers, staffing aside.** Walked the operator's day, the competitive landscape (APFM/Caring on lead gen; Birdeye/Reputation on review management; HubSpot/Salesforce on CRM; Tadpoles for daycare communication as a model; nothing strong on family communication for home care; nothing on benefits navigation for providers). Identified three things Olera is uniquely positioned to build: lead intelligence (Zillow Premier Agent model, intent signals competitors can't replicate), SBF for providers as a tour-day tool ($1,800/mo paying-capacity unlock for the family at the moment of decision), Q&A SEO attribution (turn answered questions into measurable marketing). Three rhythms align with sticky power-user behavior: daily / per-prospect / weekly.

**Five tasks created on the Web App Action Items board:**

- [Lead intelligence: turn provider analytics into a daily intent feed](https://app.notion.com/p/3525903a0ffe816ebc6de2392d161ace) — P3, concept exploration
- [SBF for providers: pre-tour benefits screening tool](https://app.notion.com/p/3525903a0ffe8125b4b4c15575db52d7) — P3, concept exploration
- [Q&A SEO attribution: show providers what their answers earn](https://app.notion.com/p/3525903a0ffe8152b920fc367f30f190) — P3, concept exploration
- [SBF redesign: cut embedded form to Care Need + Email, silently create the care profile](https://app.notion.com/p/3525903a0ffe81338f59d5b5326b1796) — **P1, frontend, TJ owning**
- [Unify SBF results with existing care profile: one family record, not two parallel systems](https://app.notion.com/p/3525903a0ffe81a2b7a8c0e746ad35ae) — P2, backend

**The SBF redesign discovery is the headline of this session.** Pulled per-step funnel data on the embedded `BenefitsDiscoveryModule.tsx`. 14-day window: 50 sessions started, 18 reached care need (36%), 8 reached age (16%), 4 reached financial (8%), 3 saved (6%). 64% of starters never even pick a care need. Of 3 completers, 1 is the Aggie test profile — so 2 real completions in 14 days. The 5-step SBF on provider pages is structurally broken at step 1. TJ's proposal: cut to 2 steps (Care Need → Email), silently create the care profile, redirect to `/welcome` (`app/welcome/page.tsx` rendering `components/welcome/WelcomeClient.tsx` — the existing "Your matches are saved" page). Conservative estimate of completion lift: 3% → 18-26%. The orphan-rate ceiling (which has been blocking everything across the three revenue streams) gets a 6-9x lift. This is the move TJ flagged as next.

**Files modified:**

- `.claude/commands/product-led-growth.md` — added revenue architecture (lines 18-30) and product philosophy (lines 32-46) sections; expanded Phase 1 to load BUSINESS-MODEL.md + Strategic Narrative; expanded Reference section with the new doc paths

**Memory updates** (outside git):

- `feedback_build_value_first_gate_later.md` — TJ's Resend / Airtable / Fathom Loops monetization sequencing philosophy
- MEMORY.md index entry pointing to it

**Next up:** TJ working on the SBF redesign (P1, Care Need + Email + redirect to /welcome). Sibling tasks queue behind it. Three concept tasks deserve due diligence as separate explorations. Post-answer hook continues measuring through 2026-05-13. First /weekly run scheduled for Mon 2026-05-04.

### 2026-04-29 — Post-answer hook P1 + dashboard hero overhaul — all merged to staging

Massive day. 6 PRs merged to staging in sequence. Architecture pivoted twice based on TJ feedback. Hero is now a fully dynamic, photo-driven, 6-tier priority surface with per-section imagery and skeleton loading.

**PR #676 — `60bab22c`.** Smart picker folded into existing DashboardHero as 6-tier priority stack:
1. Fresh leads → "View inquiries" (engagement, leads supersede questions per TJ)
2. Unanswered Qs → "Review questions" (engagement)
3. View spike ≥25% → no CTA (positive reinforcement)
4. Views ≥ 10 + incomplete → engagement headline + section-specific CTA
5. Views < 10 + incomplete → section-specific completion pick (full headline)
6. Views < 10 + complete → "Your page is live" fallback (no CTA)

Engagement-tier CTAs (1-3) navigate via `<Link>`; completion-tier CTAs (4-5) fire `provider_picker_clicked` with `metadata.source: "hero"` and open the relevant edit modal in place. Pre-test caught one phantom-impression race — fixed by reading localStorage in `useState` initializer. [Notion merge report](https://app.notion.com/p/3515903a0ffe8187b714d2d097cbcf42).

**PR #679 — `3df7442e`.** Post-answer hook on `/provider/[slug]/onboard`. After 4/10 self-assessment of the picker-on-success-state approach (4 stacked cards), pivoted to **auto-redirect**: brief 400ms "✓ Response sent" pulse → `router.push("/provider?from=qa-success")` → dashboard hero handles next-action from there. Pure subtraction — deleted `PostAnswerPicker.tsx`, `SmartNextActionCard.tsx`, simplified ActionCard + DashboardPage. Funnel sharpened: dropped `picker_qa_success_clickers` bucket, added `qa_success_arrivals` column backed by new `dashboard_arrival` event. Diagnostic: separates "did redirect work?" from "did hero nudge action?" Bug shipped to staging then fixed (`9731698a`): redirect was via `useEffect` on `submitted`, but `onSubmitted` flipped parent's `questionAnswered`, the `{!questionAnswered && (...)}` conditional collapsed children, React's reconciler unmounted `InlineQuestionResponse`, useEffect cleanup killed the timer. Fix: moved `setTimeout` into submit handler closure (timer survives unmount; `router` from `useRouter` is stable global). [Notion merge report](https://app.notion.com/p/3515903a0ffe8108ae80f54e70d04ce4).

**PR #683 — `614d0738`.** Hotfix: `/api/provider/dashboard` resolved wrong profile for multi-profile accounts. Query did `.eq("account_id", id) .in("type", [org, caregiver]) .limit(1)` with no ORDER BY — Postgres returned rows in unspecified order. With TJ's account having both Aggie + a `[TEST]` profile, dashboard rendered Aggie's "4 inquiries" hero on the test profile. Fix: query by `account.active_profile_id` first, fall back to limit(1) for legacy accounts. Same anti-pattern in ~14 other endpoints (review-requests, care-post/*, medjobs/*, etc.) — flagged in commit message, latent until multi-profile becomes a real flow.

**PR #685 + #686 — `b0a78dae` + `30256cba`.** Per-tier and per-section hero images. 11 unique 1920×1080 images sourced via Pexels/Unsplash:
- Tier 1: `dashboard-hero-leads.jpg`
- Tier 2: `dashboard-hero-questions.jpg`
- Tier 3: `dashboard-hero-spike.jpg`
- Tier 4 + 5: section-specific (gallery, about, pricing, services, screening, payment, overview)
- Tier 6: `dashboard-hero-fallback.jpg`

Visual mood matches the ask — gallery prompt gets a community/photographer image, leads get an active inquiry image, etc. `imageUrl` field on `Hook` interface; `hook.imageUrl ?? HERO_IMAGE_DEFAULT` fallback. Image hunt spec saved at `docs/hero-image-hunt.md` for future hunts.

**PR #687 — `91ec835f`.** De-jank: hero used to wait ~500ms for V2 fetch with empty slot, then pop in causing layout shift. Fixed three ways: (a) inline `DashboardHeroSkeleton` reserves identical dimensions (no layout shift on swap), (b) "Hey {firstName}" greeting renders immediately during skeleton (we have it from auth context — partial-content load, not pure shimmer), (c) all 11 tier images preloaded on mount via `new Image()` so tier swaps during the session are instant from cache. Dropped the misplaced top-level `DashboardPillarsSkeleton` (62 lines removed) — it was rendered above the page header, causing a double layout shift TJ wasn't even seeing.

**PR #688 — Slack alerts + daily digest extension.** Three new alerts: 🎯 dashboard arrival (qa-success only), ✋ hero CTA click, ✅ profile edit. Daily digest gains a 3rd Providers row covering same chain. `slackHeroCtaClicked` + `slackDashboardArrival` + `slackProfileEdited` helpers in `lib/slack.ts`. Wired through activity-track route. Daily digest extended in `app/api/cron/daily-digest/route.ts`.

**PR #690 — engagement-tier click tracking.** TJ caught on prod that clicking Aggie's leads banner (Tier 1) didn't fire a Slack alert. Original tracking only covered completion-tier (section pickers). Engagement-tier `<Link>` CTAs were navigations with no event handler. Fix: added `engagementTier?: "leads" | "questions"` to `NavCta`, fire `provider_picker_clicked` from Link onClick with metadata.tier + metadata.destination. `slackHeroCtaClicked` extended to render engagement shape ("Going to: Inquiries (/provider/connections)") OR completion shape ("Opening section: Gallery") based on which fields are present. PR #691 — cosmetic tooltip update on /admin/analytics to reflect that the "Clicked dashboard" hero bucket now covers both engagement + completion tiers.

**Test infrastructure used + cleaned up:**
- Created `[TEST] Empty State Provider` (Tier 5 — gallery completion pick, place-based memory care) — TJ screenshot grabbed, deleted.
- Created `[TEST] Questions State Provider` with 3 unanswered questions (Tier 2 — questions hero) — TJ screenshot grabbed, deleted.
- Created `[TEST] Completion State Provider` (memory care, place-based) — TJ screenshot grabbed, deleted.
- TJ's `active_profile_id` restored to Aggie (`d4242723-f94b-4c3a-92c3-dc65ad44e72a`).
- Three distinct hero visual states captured for team demo (leads / questions / completion).

**🚨 PR #693 — CRITICAL silent-failure bug + hotfix.** After staging→main promote, TJ noticed engagement-tier hero clicks were producing no Slack alerts. Diagnostic: ZERO rows in `provider_activity` for any of the four new event types (`provider_picker_impression`, `provider_picker_clicked`, `provider_profile_edited`, `dashboard_arrival`) across the entire history. Root cause: PRs #676 / #679 / #688 / #690 added the events to the application allowlist but **NEVER added a migration to extend the DB CHECK constraint** on `provider_activity.event_type`. Every insert failed silently — route's fire-and-forget client `.catch(() => {})` swallowed the rejection. Memory `feedback_schema_text_not_enum.md` (43 days old) literally documented this pattern. I had it but didn't apply it. **Detection latency: ~7 hours. Resolution latency: ~30 min.** Migration `055_post_answer_engagement_event_types.sql` extends the constraint. TJ applied via Supabase dashboard SQL editor; events started landing immediately, Slack alerts began firing on real engagement.

**PR #694 — postmortem.** Documented in `docs/POSTMORTEMS.md`. New memory `feedback_event_allowlist_needs_db_migration.md` saved (sharper guidance than the 43-day-old one — leads with the specific reflex `grep -rn "provider_activity_event_type_check" supabase/migrations/` whenever adding event types).

**Notion tasks created:**
- [Mobile-optimize provider portal: drop card containers on phones](https://app.notion.com/p/3515903a0ffe81baa949f4e34b5ebfb8) — P2, triple-nesting wastes horizontal real estate on mobile
- [Hero image library: per-tier asset hunt + wiring](https://app.notion.com/p/3515903a0ffe81709c0eef2b1bf74cee) — P3, completed (all 11 images sourced)

**Memories saved (4 project dirs):**
- `feedback_default_to_now_not_later.md` in olera-web, olera-hq, TJ-hq, olera-expansion-map. TJ called out the "save it for later" reflex as outdated — AI-paired dev inverts the cost calculus.
- `feedback_event_allowlist_needs_db_migration.md` in olera-web. Sharper guidance for adding event types, born from the 7h silent-failure incident.

**Live on main:** all of today's work has been promoted (staging → main multiple times). All 4 new event types now logging + Slack alerts firing + funnel columns incrementing.

**Still open:**
- Mobile container cleanup (separate P2)
- Image preload could be optimized (currently 1.6MB on mount; lazy load per-tier on demand would be lighter but needs more code)
- ~14 other endpoints share the `account_id + .limit(1)` anti-pattern — latent until multi-profile becomes a real flow

### 2026-04-28 — Post-answer hook + smart picker (P1) — planned, not started

Three-PR sequence to capture peak engagement at the post-answer moment and redirect providers into the V2 dashboard. Plan: [`plans/post-answer-hook-and-smart-picker-plan.md`](plans/post-answer-hook-and-smart-picker-plan.md). Notion: [P1 task](https://www.notion.so/Hook-the-post-answer-moment-lure-providers-into-the-V2-profile-edit-dashboard-34e5903a0ffe818eb372fb6539e65391).

Discovery confirmed: the answer form already lives on `/provider/[slug]/onboard` (`ActionCard.tsx`), so this is a success-state UI swap, not an architecture rebuild. Esther confirmed the verification gate on answer publication is intentional — keep it, monitor. Smart picker is a single component shared between the post-answer surface and the dashboard's existing static 30%-banner (which gets upgraded in the same work).

- **PR A (funnel instrumentation, ships first):** extend `qa_funnel` rollup with `clicked_dashboard` (reads existing `analytics_teaser_cta_clicked` events) + `edited_profile` columns on `/admin/analytics`. Baseline before any UI ships.
- **PR B (smart picker on dashboard):** new `<SmartNextActionCard>` + `lib/next-best-action.ts` scoring function. Replaces the static "Complete your profile" banner on `DashboardPage.tsx`. Category-aware soft-honest copy (no data-claim multipliers).
- **PR C (post-answer hook):** swap the `if (submitted)` branch in `ActionCard.tsx` for the same picker with `source="qa-success"`. Source-tagged links + per-source funnel attribution.

### 2026-04-28 — Restore category stock-image fallback (P2) — shipped to staging via PR #670

**[PR #670](https://github.com/olera-care/olera-web/pull/670)** on branch `feat/provider-stock-image-fallback`. Two commits:

1. **`8a5b488b`** — empty-array fix. Wired `getCategoryFallbackImage` into the provider detail hero (`app/provider/[slug]/page.tsx`) and fixed `businessProfileToCardFormat` so `imageType: "photo"` for stock URLs (was `"placeholder"`, short-circuiting three card components to gradient). Helper + 15-image library at `public/images/fallback/` had existed since `d4ffa24a` but was never wired to the V2 hero. TJ verified the photoless case works on staging across all 6 in-scope categories.

2. **`17ce40cf`** — runtime-failure extension (TJ asked to keep the extension on the same PR to avoid context fragmentation). TJ found a second case via DevTools: providers WITH image URLs that 502 through next/image (R2 / cdn-api hosts on staging) still showed gradient. The carousel cycled "1/6 → 1/5 → ... → 1/1 → gradient" as each onError fired. Fix: new `fallbackImage` prop on `ProviderHeroGallery` and new `fallbackImage` field on `ProviderCardData`. When `validImages.length === 0` (whether from empty array OR runtime onError cascade) the gallery now renders the stock photo, not the gradient. Same fallback path added to all three browse-card components. Verified working on Visiting Angels + Choice Home Care detail pages, plus Comfort Keepers / Visiting Angels browse cards.

3. **`217a2f7a`** — polish (TJ flagged "a little bit of jank" — the counter cycling "1/6 → 1/5 → ..." was still visible during the onError cascade even though the end state was correct). Render-stack approach: stock photo as a base layer (z-0) always rendered when fallback available; real image(s) as overlay (z-1). While real image is loading it's transparent, so the stock shows through — no flash. Once real image loads, it covers stock. If it fails, stock stays. Gallery's counter + arrows now gated on `anyRealImageLoaded` — only appear once a real image confirms `onLoad`, hiding the cycling visibility entirely. Same pattern applied to all three browse-card components (`BrowsePageClient`, `BrowseCard`, `ProviderCard`).

**Diff: 8 files, +258 / -110.** Build clean (3795/3795), typecheck 0 errors. Pre-test review traced 18 vectors — no bugs.

**Categories in scope:** 6 (Home Care Non-medical, Home Health Care, Assisted Living, Independent Living, Memory Care, Nursing Home). Two home-care types share the home-care pool. Artifact categories (hospice/rehab/adult day care/wellness/private caregiver) fall through to home-care imagery via `DEFAULT_FALLBACK_POOL` — separate cleanup project per TJ.

**Underlying root cause** (not addressed in this PR): some real provider image URLs are 502'ing through Vercel's `/next/image` optimizer on staging — could be stale R2 URLs, image-domain config, or a transient. Worth its own investigation; this PR makes the symptom invisible.

**Next:** TJ to re-verify the polish commit on staging (counter "1/6 → 1/1" cycle should no longer be visible on detail pages with broken images), then merge to main via `/pr-merge`.

### 2026-04-28 — Benefits QA queue populated for all 49 remaining states

Bulk-populated the [Benefits QA — Program Review Queue](https://www.notion.so/fb03b87a9918460086ae728ee879b9e2) Notion DB with **614 program rows** across all states with completed pipeline data (FL + TX were already there). Queue now has 626 total rows. Cess can filter by State and work through states one at a time; the high-severity rows (62 across 49 states) are the priority since they're real numeric mismatches >15% from a fresh source check.

**Approach:** built `scripts/build-qa-rows.js` to assemble row data from `data/pipeline/{STATE}/{classify,drafts,factcheck}.json`, derive Severity from flag list, format flag fields as readable summaries. Split into 100-page batches and delegated insertion to a subagent (the MCP `notion-create-pages` payload was too large to inline). One typo introduced in a Wyoming source URL (`Database` → `Department`) caught and corrected via update-page.

**Flag totals across 49 new states:** 161 programs flagged, 62 high-severity, 99 medium. Most medium flags are phone mismatches where pipeline drafted local numbers and verifier returned a national hotline — judgment calls, not defects.

### 2026-04-28 — Benefits intake conversion lift (P1) — planned, not started

Three-PR sequence to lift visit→started + started→completed on the embedded benefits intake on provider pages. Plan: [`plans/benefits-intake-conversion-lift-plan.md`](plans/benefits-intake-conversion-lift-plan.md). Notion: [P1 task](https://www.notion.so/Improve-benefits-intake-conversion-copy-visual-treatment-to-lift-completion-rate-34e5903a0ffe813aa547d2cc4378e761).

Audit of all 5 steps showed only the **save step** has fat to trim (the others are clean). Resequenced to fix that first — instrumenting before the redesign would give us a week of baseline data on a form we're about to change.

- **PR A (save-step rework, ships first):** drop name field; cut redundant "We found programs for your family." H2 (eyebrow + button already carry the proof); drop pointless "1 ·" / "2 ·" field-label numbering (one field doesn't need a counter). Backend tolerates missing firstName via existing `display_name: "Care Seeker"` fallback. Single-field forms convert dramatically better than multi-field — likely 10-25% lift on its own.
- **PR B (per-step instrumentation, after PR A stable):** new `/api/benefits/track-step` route + `useTrackStep` helper; fires `benefits_entry_viewed`, `benefits_step_viewed`, `benefits_step_completed` to `provider_activity`. All carry a `variant` field (forced to `"control"` in PR B). No Slack pings on the new events. Watch ~1 week before PR C.
- **PR C (entry-point copy A/B + trust strip, after PR B watch):** deterministic 50/50 hash on `session_id` (no GrowthBook installed); money-loss headline + dynamic-state sub-line on the variant arm; trust strip on **both** arms. Decision rule: 20%+ lift → ship; <5% movement → kill and look downstream.
- **Scope:** ONLY `BenefitsDiscoveryModule` (the embedded 5-step entry on provider pages). Standalone `BenefitsIntakeForm` out of scope.

### 2026-04-27 — Sweep #1 (provider data-quality cleanup) shipped

End-to-end provider directory cleanup. Started with 73,304 active providers, ended with 70,722 — net 2,582 deletes + 270 reclassifications.

**Approach evolution (regex iteration → LLM self-correction):**
- v1 (sweep day): regex amnesia detector caught 320 amnesia cases (199 reclass-eligible).
- v2.0–v2.2 (this morning): widened regex 4x to catch ThedaCare-style long-list-negation FPs, Lexie Rae-style "residential care facility" FNs, Joyful-style definitional-context confusions. Reached 245 reclass / 2,569 deletions.
- **Final: scrapped regex.** Did a focused LLM re-pass (4.1 min, ~$5) on the 2,936 OUT_OF_SCOPE verdicts with a forced-choice anti-amnesia prompt. 354 recovered (271 reclass / 83 silent), 2,582 confirmed deletions. Replaced regex output with this.
- **Disagreement file:** generated alongside (regex v2.2 vs re-pass) — 233 cases where the two signals diverged. Useful sanity-check artifact for TJ's spot-check.

**Total cost: ~$170** ($0 Tier 1 + $3 calibration + $160 Phase 3 LLM verify + $5 LLM re-pass + $2 retries).

**Files in this PR (`feat/data-sweep-skill` off staging):**
- `docs/provider-category-definitions.md` (NEW) — 6-category source of truth, with state-specific terms (RCFE, PCH, AFH).
- `docs/data-sweep-runbook.md` (NEW) — operational details: Tier 1 regex, inverted Phase 3 prompt, contradiction detection logic, MD format, cost expectations, change log.
- `.claude/commands/data-sweep.md` (NEW) — slash command / skill for future sweeps.
- `scripts/pipeline-batch.js` — three Stream A prompts now share the new `SIX_CATEGORY_DEFINITIONS` + `OUT_OF_SCOPE_TYPES` constants. Tight YES list (the 6) + comprehensive NO list. Stream B Places call now also fetches `types`/`businessStatus`/`addressComponents` (stored in `google_reviews_data` for future filter logic).
- `scripts/discovery-batch.py` — search terms tightened: removed '55+', 'senior apartments', 'rehabilitation center', 'cognitive care', 'memory support', 'visiting nurse' (alone), and other contamination sources. New comment block documents the rationale.

**Backups for revert (in `~/Desktop/TJ-hq/Olera/Provider Database/Cleanup/`):**
- `deletions-executed-2026-04-27.csv` (2,582 rows: provider_id, name, current_category, city, state)
- `reclassifications-executed-2026-04-27.csv` (270 rows: provider_id, name, old_category, new_category, city, state)
- All MD versions kept: `*.v1.md`, `*.v2-regex.md`, current files = LLM re-pass output.

**Key learnings → runbook for sweep #2:**
- Free-text LLM reasoning + regex parsing = compounding fragility. Default to forced-choice prompts when possible.
- Whenever you find yourself patching regex 5+ times, step back and ask if the approach is wrong.
- LLM re-pass with anti-amnesia prompt gives structured output for ~$5; replaces regex post-processing entirely.
- Some patterns regex still catches that LLM misses, and vice versa — disagreement file surfaces these for human triage.

**Next steps after this PR merges:**
- Phase 7 reflection (already in runbook — formalize once we run sweep #2).
- Wrong-category cleanup of INSUFFICIENT_EVIDENCE providers (~50K) — would need different prompt + signal.
- Backfill `google_reviews_data.{places_types, business_status, country_code}` for existing providers (separate workstream).
- Migrate the 13-type backend ProfileCategory enum to match the 6 (longer-term cleanup).

---

### 2026-04-27 EOD — Phase 2 A/B live in prod, Phase 3 picked up tomorrow

Four PRs shipped in one day across Phase 1 + Phase 2:
- PR #648 / #651 — Phase 1 funnel visibility on `/admin/analytics`
- PR #653 — Phase 2 A/B variant assignment + admin split table
- PR #658 — Phase 2 to prod (bundled with Cess's FL editorial)
- PR #659 / #661 — visibility fix so the A/B table renders before first send

Slack [addendum thread](https://oleraworkspace.slack.com/archives/C0A91BA205T/p1777334076195659?thread_ts=1777319720.741329) live in `#ai-product-development` to inform the team.

Resuming tomorrow: Phase 3 (follow-ups for unopened — biggest open-rate lever per audit). Notion task ([Phase 3 Resume-here pre-flight](https://www.notion.so/34f5903a0ffe81809188d977573d27d2)) updated with file paths, sequence priority, and the Phase 2 dependency note. Pre-flight summary:
- All infra in place: cron route just needs to be added at `app/api/cron/qa-email-followups/route.ts` + `vercel.json` cron entry
- Sequence #1 (24h unopened resend) ships first; #2 (channel switch via Twilio/Slack) and #3 (6h opened-not-clicked nudge) are follow-ups
- Earliest clean ship date: 2026-05-04 (lets Phase 2 A/B accumulate ~1 week of un-tainted signal). Or accept noise and run concurrently — velocity call

---

### 2026-04-27 — Q&A email A/B test on subject + preheader (Phase 2 of P1) — PR #653

**Status:** shipped to staging via PR #653, promoted to main via PR #658. Visibility fix shipped via PR #659/#661. Notion task moved to In Progress/Doing — awaiting 2-3 weeks of A/B data.

Started Phase 2 ([Notion](https://www.notion.so/34f5903a0ffe81dc8d6fd39cdb40fe23)) the same day Phase 1 shipped — startup velocity, no point waiting for clean baseline data to start iterating on copy. First commit was a tame "for"-instead-of-"about" subject + preheader = question excerpt. TJ pushed back twice: (1) PHI concern on asker name in subject, (2) "we can do way better, do research." Refolded into a real A/B with research-backed B variant.

**Variants:**
- A (control) — exact production: `A family has a question about {Provider}`, no preheader
- B — the question text itself, quote-wrapped, truncated 48 chars: `"Can residents bring their own furniture?"` + preheader `From a family on Olera · {Provider}`
- B PHI-fallback — when question text matches `/(dementi|alzheim|parkinson|cancer|stroke|hospice|als|dialysis|...)/i`, fall back to `A new family question for {Provider}` + generic preheader

**Why this B:** B2B subject-line research (2026 benchmarks, Apollo/Prospeo/Campaign Monitor) shows question-format subjects average ~46% open vs ~32% for statements; short subjects (≤4 words) lift opens 45%; marketing-urgency language drops opens below 36% and 69% of decision-makers report being annoyed by it. The format that wins is "looks like a colleague forwarded a real question" — which is literally what B is.

**Implementation:**
- `lib/email-templates.tsx` — `assignQuestionVariant()` (random 50/50), `questionReceivedInbox()` returns `{subject, preheader, phiFiltered}`, PHI keyword regex
- 3 send sites (live + 2 deferred) use the same helper, persist `variant` + `phi_filtered` to `email_log.metadata`
- `app/api/admin/analytics/summary/route.ts` — `qa_funnel_by_variant` rollup added; reads `metadata.variant` from each `email_log` row
- `app/admin/analytics/page.tsx` — new `<VariantSplit>` table inside Q&A funnel card, shows per-variant sent/delivered/opened/clicked + open rate + CTR. Hidden until variant data exists. Footnote when pre-deploy emails (no variant) appear in the window.

**Volume math:** 70 sends/day ÷ 2 arms = 35/arm/day. Directional signal in 2-3 weeks; statistical significance in 6-8 weeks. Ship the directional winner without waiting for p<0.05.

**Memory:** `feedback_phi_in_subject_lines.md` saved (no asker names / health detail in subjects — server logs, push notifications, lock screens leak).

**Next up:**
- Wait for Vercel green, merge PR #653 → staging
- Then promote staging → main (Q&A funnel admin tile already on main from PR #651, but A/B variants need to flow to prod sends)
- Watch the Variant Split table on /admin/analytics over the next 2-3 weeks
- Phase 3 ([follow-ups for unopened](https://www.notion.so/34f5903a0ffe81809188d977573d27d2)) is queued; biggest open-rate lever per audit but blocks on Phase 2 isolation

**Skipped (deliberate):**
- Resend backfill — send-only API key blocks `GET /emails/:id`; cohort self-corrects by 2026-05-03 once 7d window is entirely post-webhook
- Send-time / sender / DMARC audit — flagged for follow-up, not on critical path
- Preheaders on the other 5+ email templates — strict improvement, deferred (infra now in place)

---

### 2026-04-27 — Production missing V2 dashboard hero — FF removed (PR #647)

**Symptom:** olera.care `/provider` was showing the old "Profile completeness + provider card" layout. Staging had the V2 hero ("34 questions waiting for your answer" orientation banner), prod did not. Slack to Logan/Esther: TJ flagged the gap to avoid duplicate work before resuming the post-care-secret-question optimization.

**Root cause:** `NEXT_PUBLIC_FF_PROVIDER_ANALYTICS_ONBOARD` env var was set in Vercel staging but not production. Both branches had identical code; the gate at `components/provider-dashboard/DashboardPage.tsx:39-40` and `components/provider-onboarding/ActionCard.tsx:10-11` short-circuited the V2 layout when the flag wasn't `"true"`.

**Fix path chosen:** Path B — rip the flag out (vs Path A flip the env var). V2 has been live on staging since 2026-04-23, no remaining "off" use case. PR #647 open against staging.

**Diff: -202 lines.** Net deletion. Files:
- `components/provider-dashboard/DashboardPage.tsx` — flag const + 4 inline references removed; `useProviderDashboardV2Data("30d", true, user?.id)`
- `components/provider-onboarding/ActionCard.tsx` — flag const + both FF-off branches deleted; dead helpers stripped from `ProfilePreviewCard` (`handleReviewsCtaClick`, `reviewsCta`, `reviewsContent`, `snippetText`, `starPath`); `googleReviewSnippet` and `unansweredCount` props dropped

**Validation:** typecheck 0 errors, build clean (3,794 static pages), eslint shows only pre-existing 8 errors on `<a href="/provider/reviews">` (unchanged from staging baseline). Pre-test review found nothing — the V2 path being kept is the same path staging has been running for 4 days.

**Next up:**
- Merge PR #647 staging → main → olera.care redeploys with hero visible
- Then resume the post-answer provider journey optimization (the original Slack thread context: "before optimizing the provider journey from care secret question")
- Reply in `#ai-product-development` once merged so Logan/Esther know the gap is closed

---

### 2026-04-27 — Q&A email funnel visibility shipped (Phase 1 of P1 task) — PR #648 / #651

**Status:** shipped to staging via PR #648, promoted to main via PR #651. Notion task marked Done 🙌. Phase 2 ([Notion](https://www.notion.so/34f5903a0ffe81dc8d6fd39cdb40fe23)) and Phase 3 ([Notion](https://www.notion.so/34f5903a0ffe81809188d977573d27d2)) split off as sibling tasks.

Audited the P1 task ([Notion](https://www.notion.so/34e5903a0ffe80a3989ee19c09dc110a)). Key finding: the leak is the provider notification email open rate, not anything on the care-seeker side. Last 7d on staging: 520 sent → 36 opens → 27 sign-ins → 19 answered. Once they open, ~58% answer. Once they sign in, we got them.

The visibility gap: we saw opens (existing `qa_email_openers` tile) and downstream sign-ins/answered, but nothing upstream. Sent / delivered / bounced / marked-spam were all captured in `email_events` + denormalized on `email_log` (since 2026-04-26 commit `9b1f74f5`), just not displayed. PR #648 surfaces them as a new "Provider Q&A Email Funnel" card on `/admin/analytics`.

Two-file diff (`app/api/admin/analytics/summary/route.ts` + `app/admin/analytics/page.tsx`). Pre-test review caught one bug pre-ship: cohort vs event anchor mismatch on bounced/complained — fixed by event-anchoring those side stats so they stay in lockstep with the issues list.

Resend backfill skipped: full-access API key required (current key is send-only). Instead, the cohort will fully reconcile by 2026-05-03 once the 7d window is entirely post-webhook. Phase 2 (subject line / preheader / sender rep / send-time) and Phase 3 (follow-ups for unopened) build on this baseline.

Notion task body updated with TARGET METRIC + Phase 1/2/3. Memory `project_qa_funnel.md` saved so future sessions don't re-misread the funnel direction.

---

### 2026-04-27 — Benefits QA: em-dash cleanup shipped (PR #650), Cess's FL audits surfaced

**PR #650 shipped to staging** — em-dash stragglers + draft prompt hardening.
- Branch: `chore/em-dash-stragglers-cleanup`. 2 commits: `fce38c6c` (9 sites in FL drafts.json + Rule 9 in prompt), `3d6d18e2` (pre-test follow-up: cleaned ~14 prose em dashes from prompt EXEMPLARs/placeholders that were teaching Claude by example).
- Cause of stragglers: prior sweep (`6a0f8c99`) regex matched literal `—` but JSON stores `—` escape form; 9 leaked through in TJ's WAP audit content. Five replaced with comma, 1 period, 2 semicolons, 1 parens (failing roof / active mold / unsafe electrical comma-soup).
- Pre-test review caught Rule 9 contradicting itself via the `applicationNotes` EXEMPLAR (3 em dashes in sample "good" output) + ~10 placeholder descriptions. Fixed in second commit. Icon-menu structural separators (47, "House" — home care) left intentionally; clearly list format, not prose.
- Renderer chain verified: callout text rendered via `String(section.text)` plain, FAQ answers via `<p>{faq.answer}</p>` + JSON-LD schema. Both safe.

**🚨 Critical discovery — Cess has been QA'ing FL programs since 2026-04-22 and her work was invisible to my Notion query.**
- TJ called this out by sharing a screenshot showing 11/14 FL rows with all 5 checkboxes ticked. My API filter (`Status equals Approved/In Progress/Needs Changes/Blocked`) returned only 3 rows because **Cess ticks per-step checkboxes but leaves Status="Not Started" and Reviewer="Open"**.
- 8 Cess-touched FL rows discovered: CCE (1 phone flag), Elder Options, HCE, MoW, Legal Aid, LIHEAP, PACE, SHINE. Audit findings live inside page bodies under "## Audit Results", not on the queue row metadata.
- Read 4 of 8 page bodies so far (CCE/HCE/MoW/PACE). Remaining 4: SHINE, Elder Options, Legal Aid, LIHEAP — fetching next.

**Patterns surfacing in Cess's audits (so far):**
- **Real factual errors:** PACE income `$2,901 → $2,982/mo` (300% FBR 2026, same fix as SMMC-LTC). PACE service-area: page says "Miami-Dade only" but Cess reports "now available in 30+ counties incl. Tampa, Orlando, Jacksonville, Panhandle." CCE phone `211 → 1-800-963-5337` (Elder Helpline).
- **Site-wide bugs (every FL page she touched):** "Related programs" cross-links broken on every program (renderer issue, not content). "Free — no cost to you" header showing on programs that aren't free (HCE has $160/mo subsidy; PACE has private-pay premium for non-Medicaid).
- **Editorial scripts pending:** Full prose rewrites for Overview / Eligibility details / How to apply / Steps / Multiple FAQs across CCE, HCE, MoW, PACE. Substantial.

**Recommended path forward (3-PR split):**
1. Site-wide bug PR — debug "Related programs" cross-link breakage + "Free" header gate. Fixes apply to all 51 states, highest leverage.
2. FL factual corrections PR — PACE income + service area, CCE phone. Small/fast, denial-risk numbers.
3. FL editorial rewrites PR — apply Cess's prose scripts. Bigger, taste-driven, slower review.

**Memory saved:** `feedback_benefits_qa_status_filter.md` — Notion QA queue: Cess ticks checkboxes without changing Status; don't filter by Status alone, query all rows + read page bodies.

**Read all 8 Cess-reviewed FL page bodies. Full audit inventory captured.**

**Chunk 1 shipped — PR #652** `qa/benefits-site-wide-bugs` — three site-wide renderer bugs in `components/waiver-library/ProgramPageV3.tsx` (+31/-20):
- `relatedPrograms` filter: drop unresolvable entries instead of rendering gray non-link pills. Audit showed 1,820 of 2,332 entries (78%) across all 51 states currently render as broken-looking pills because they reference programs not in our pipeline (TANF, SSI, Senior Farmers Market, etc.). Now: section either shows working links or doesn't render at all. Net 2,332 visible pills → 512 working links.
- "Free, no cost to you" hero banner: removed entirely. Was tripping on HCE ($160/mo subsidy), PACE (private-pay premium), Elder Options (sliding-scale co-pay) — promotional rather than editorial. `savingsRange` already handles the truly-free case.
- `useSectionObserver` rewrite: was only reacting to `isIntersecting=true`, leaving active id stuck on prior sections. Now tracks the set of currently-intersecting sections and picks topmost in document order. Fixes the "Eligibility highlighted while at Overview" screenshot Cess sent twice.
- Typecheck clean. Both production routes (`/benefits/[slug]/[program]` + `/senior-benefits/[state]/[benefit]`) use V3; V2 is unimported dead code.

**Chunk 2 shipped — PR #654** `qa/fl-factual-corrections` — 6 denial-risk fact fixes in `data/pipeline/FL/drafts.json` (+drafts.ts auto-regen):
- PACE income $2,901 → **$2,982/mo** (FAQ); same correction we applied to SMMC-LTC.
- PACE service area Miami-Dade only → **30+ counties** (4 sites: localEntities, intro, applicationNotes, FAQ). Page was actively turning away caregivers in 30+ counties.
- CCE top-level phone `null` → **`1-800-963-5337`** (Elder Helpline) + replaced placeholder DOEA contact + filled empty `sourceUrl`.
- Elder Options home equity cap $585,000 → **$752,000** (3 sites: exemptAssets, structuredEligibility.homeEquityCap numeric, FAQ Q1 + spouse-waives-cap nuance added).
- Elder Options service area 5 counties → **16 counties** (4 sites: intro, eligibility requirements, applicationNotes, FAQ Q2). Page was telling caregivers in 11 N.C. FL counties they were out of area when ElderOptions actually serves them.
- LIHEAP "not all Florida counties participate" → **"active in all 67 Florida counties"** + heating cycle (through March 31) + cooling cycle (April 1+).

**Editorial inventory for chunk 3 (still pending):**
- CCE: Overview, "What's Covered" (medication clarity), Eligibility details, Steps, FAQ Q2/3/5/6/7/8
- HCE: Header, Overview ($160/mo subsidy detail), asset/income/medical scripts, How to apply, FAQ Q4
- MoW: Overview ¶2 ($7-9.49/meal pricing), Other Requirements, How to apply, Get in touch contacts, FAQ Q4/5/8
- PACE: Header (already partly handled by chunk 1), Overview, eligibility scripts, Good to Know, Steps, FAQ Q2/Q7
- SHINE: Remove personal staff email, use Elder Helpline + floridashine.org Find-a-Site
- Elder Options: 16-county throughout (factual core handled by chunk 2; remaining script-rewrites for Good to know + Get in touch voicemail + Step 2 financial eligibility)
- Legal Aid: Senior Legal Helpline hours fix, Coast-to-Coast Legal Aid (Broward) phone fix
- LIHEAP: All-67-counties throughout (factual core handled by chunk 2; remaining application steps + processing/waitlist context + FAQ Q2)

**Next up:**
- Chunk 3 starting now (per TJ "let's continue" after chunk 2 ship)
- After chunk 3: investigate the related-programs data fix (update prompt to constrain to in-state programs, regen) as a separate PR
- Test chunks 1+2 on staging preview when TJ has bandwidth

---

### 2026-04-26 — /product-led-growth bootstrap + Esther/TJ task split shipped

**Built and shipped `/product-led-growth` slash command.** PR #642 merged to staging (squash, commit `0e674a43`). Two PRs total: V1 daily-mode + V1.5 reframe to daily-build / weekly-stats / monthly-strategy after the dry-run revealed daily-pulse produced false signal from Sunday baselines. Files: `.claude/commands/product-led-growth.md`, `scripts/growth-pull.js`. PR #643 open with Working Principle #8 (trust the implementer, don't over-prescribe when writing Notion tasks for the team).

**Notion infrastructure set up:**
- 📈 [Growth Command Center](https://www.notion.so/34e5903a0ffe81ca950ed0d00dde74a9) — weekly snapshot dashboard
- 🧠 [Growth Running Thread](https://www.notion.so/34e5903a0ffe8165abf5c4b84d84d06c) — patterns, observations, open questions, run entries
- 🧭 [Growth Strategy Brief](https://www.notion.so/34e5903a0ffe8159b1eef1d266f9c62c) — diagnosis, seeker journey design, backlog play, Strategic Backlog

**Strategic diagnosis confirmed by 4-flow code walk:** Olera has no relational mechanism today. Q&A is page comments (no `connections` row, no thread, no reply path). Saves are silent (provider never learns). Benefits intake creates a profile that does nothing afterward. The `connections` table primitive exists in schema; it just isn't being written to for the highest-value interactions.

**Six Notion tasks created/refined across Esther + TJ owners.** Esther's active P1 queue narrowed to 2 items (focus on hire-ROI):
- [Fix save button for non-signed-in users](https://www.notion.so/34e5903a0ffe81fb85baf7b7c502859a) — 401s silently for guests; includes contextual save prompt + Slack alerts + admin tile
- [10-views provider nudge](https://www.notion.so/34e5903a0ffe8064b7b8c0f8cd7ff8f4) — email providers with proven page-view demand to complete Meet the Author + Photos

TJ's active P1 queue:
- [Increase open rates via follow-up emails](https://www.notion.so/34e5903a0ffe80a3989ee19c09dc110a) for unanswered questions
- [Hook the post-answer moment](https://www.notion.so/34e5903a0ffe818eb372fb6539e65391) to bring providers into the V2 dashboard
- [Improve benefits intake conversion](https://www.notion.so/34e5903a0ffe813aa547d2cc4378e761) — TJ kept this since he built the original with Chantel

Backlog (deferred for focus): question = profile hook, save = profile strategic UX layer.

**Team kickoff Slack** sent to `#ai-product-development` ([link](https://oleraworkspace.slack.com/archives/C0A91BA205T/p1777244098651849)). Frame: providers respond at ~70% when they land on the answer page, so a lot of the work is about getting them there. Esther + product team meeting tomorrow.

**Writing-style learnings captured to memory** (`feedback_tj_writing_style.md` updated 3x this session):
- Notion tasks: 3 sections max (Context / What we need / Done when), context-rich, don't over-prescribe — collaborators are capable humans with their own design opinions
- TJ voice: no em dashes (use `--`), no rhetorical colons, no flourishes ("the wedge is real but unattended"), no marketing words, numbers stand alone
- Sunday-baseline trap: ran growth-pull on Sunday afternoon and locked "52 questions/day" into multiple tasks. Actual rate is ~70/day. Single-day pulls are not canonical
- Don't simplify TJ's product framing: Olera Pro is a package (reviews, leads, growth tools, GBP optimizations, comparison data, insights, family care profile access), not just one thing. Reducing it to make a clean argument misleads audiences

**Next up:**
- Esther/product team meeting tomorrow on the new task split
- PR #643 (Working Principle #8) ready to merge — ~12 lines added
- First `/product-led-growth --weekly` run on Monday will baseline funnel ratios; revisit deferred items after that data arrives

---

### 2026-04-26 — Resend webhook integration — SHIPPED + VERIFIED (PRs #635, #637)

**Status:** ✅ live and verified. First real `opened` event landed and `email_log` denormalized columns updated correctly. Loop is closed.

**Verification (2026-04-26 ~12:57 UTC):**
- `email_events` row: `event_type=opened`, `svix_id=msg_3CtZbMfHTSucgRzuXhkRzvH8E9f`, `occurred_at=2026-04-26T12:34:55Z`
- This was a Resend retry of an event that earlier 403'd against Vercel — proves the URL change worked, signature verified, idempotent insert succeeded
- `email_log` denormalized state for the matching email (question_received → tfalohun@gmail.com): `first_opened_at=2026-04-26T12:34:55Z`, `last_event_type=opened`, `last_event_at=2026-04-26T12:34:55Z` ✓

**The pivot:** started from the open Olera Action Items task "Audit provider question/lead notification email — find the open-rate lift" (P1 🔥). Territory mapping uncovered the foundational gap: we don't track email opens at all (only sends + click-throughs via `appendTrackingParams`). Without webhooks, the audit's data path is one-shot (call Resend's API per email, retain nothing). Promoted webhook integration to the primary task; audit becomes downstream and gets re-run on real data once webhooks live.

**The pivot:** started from the open Olera Action Items task "Audit provider question/lead notification email — find the open-rate lift" (P1 🔥). Territory mapping uncovered the foundational gap: we don't track email opens at all (only sends + click-throughs via `appendTrackingParams`). Without webhooks, the audit's data path is one-shot (call Resend's API per email, retain nothing). Promoted webhook integration to the primary task; audit becomes downstream and gets re-run on real data once webhooks live.

**Notion task created** for the new scope: [Resend webhook integration — unlock email open/click tracking (prerequisite for the email audit)](https://www.notion.so/Resend-webhook-integration-unlock-email-open-click-tracking-prerequisite-for-the-email-audit-34e5903a0ffe81ef87facb32a7437132) — P1 🔥, owner TJ, timeline 2026-05-02. Sibling to the original audit task.

**PR #635 — MERGED to staging** (commit `d6a7387f`). 9 files, +694/-15. Breakdown:
- `supabase/migrations/051_email_webhook_events.sql` (new) — applied to Supabase ✅
- `app/api/resend/webhook/route.ts` (new) — POST handler, raw body, svix signature verify, returns 200 always so Resend doesn't retry
- `lib/resend-events.ts` (new) — `verifyResendSignature()` (uses `svix` npm package, NOT raw HMAC — Resend uses Svix infra) + `recordEmailEvent()` (idempotent insert + monotonic email_log update)
- `scripts/backfill-resend-events.js` (new) — one-shot, manual `--apply` invocation, ~2 req/sec, deterministic `backfill-{resend_id}` svix_id so re-runs are no-ops
- `app/api/admin/emails/route.ts` + `.../export/route.ts` (modified) — extended SELECT to include 7 new lifecycle columns + CSV export columns
- `app/admin/emails/page.tsx` (modified) — `EmailLog` interface extended, new `lifecycleBadge()` helper prefers `last_event_type` (opened/clicked/bounced/etc) over send-time status, preview drawer shows lifecycle timestamps
- `package.json` + `package-lock.json` — `svix@^1.92.2` added at top-level (was transitive only — Vercel `npm ci` would have failed without this)

**Schema design (chosen — hybrid):**
- New `email_events` table — full event history, one row per webhook delivery, `UNIQUE(svix_id)` for idempotency, joined to `email_log` via `resend_id`
- Denormalized columns on `email_log` — `delivered_at` / `first_opened_at` / `first_clicked_at` / `bounced_at` / `complained_at` / `last_event_type` / `last_event_at` so "open rate" SQL stays a flat scan, no join required
- Why hybrid: pure events table forces a join + aggregation per query; pure denormalized columns lose timeline data. Hybrid gives both.

**Idempotency:** `UNIQUE(svix_id)` enforced at DB level. Replays from Resend hit the constraint and silently no-op. Email_log denormalized columns use monotonic UPDATEs ("first" timestamps only set when null, "last_event" only advances when newer) so out-of-order replays can't move time backward.

**Pre-test bugs caught + fixed before push:**
1. Initial `delivered_at` guard used wrong field (`logRow.last_event_at` instead of `logRow.delivered_at`) and didn't SELECT the column for guarding. Fixed both.
2. Backfill script was treating `result.error` from Resend SDK as "no last_event" instead of surfacing it. Now checks `result.error` explicitly and reports failures.

**Setup state — COMPLETE:**
- ✅ Migration 051 applied to Supabase
- ✅ PR #635 merged (Vercel route + DB schema + admin UI) at `d6a7387f`
- ✅ Vercel returned 403 on Resend POSTs as predicted (Bot Protection vs Svix-on-GCP) — same pattern as Stripe
- ✅ PR #637 merged — webhook ported to Supabase Edge Function
- ✅ Edge Function deployed: `https://ocaabzfiiikjcgqwhbwr.supabase.co/functions/v1/resend-webhook`
- ✅ `RESEND_WEBHOOK_SECRET` set as Supabase secret (and still in Vercel env for the deprecated route as fallback)
- ✅ Resend webhook URL updated to point at the Supabase function
- ✅ First real `opened` event landed and verified end-to-end (see Verification section above)

**Vercel Bot Protection (confirmed + mitigated):** Resend uses Svix infra on GCP. Vercel's edge Bot Protection layer blocked GCP-origin POSTs with 403. Migrated to Supabase Edge Function — same Svix verify, same idempotent insert, same monotonic UPDATE, just outside Vercel's edge. Vercel route at `app/api/resend/webhook/route.ts` retained with deprecation notice as documented backup.

**Apple Mail caveat (framing for the audit re-open):** Apple Mail Privacy Protection prefetches images on receipt, inflating opens 30-50% for that cohort. Click rate is the cleaner signal for iteration. The audit's "find the open-rate lift" framing should reframe to "find the engagement lift, primarily measured by clicks" when the audit task re-opens.

**Next steps:**
1. ✅ Webhook live + verified.
2. New tile in `/admin/analytics` Providers section: "Opened Q&A emails" (distinct providers who opened a `question_received` email in the window) — shipping in a separate PR alongside this scratchpad update. Apple Mail caveat in the tooltip. Ratio is implicit vs the existing "Questions" tile in Engagement (every question → one email).
3. Re-open the audit task ([Notion](https://www.notion.so/Audit-provider-question-lead-notification-email-Resend-find-the-open-rate-lift)) once ~7 days of real data has accumulated.
4. Optional: run `node scripts/backfill-resend-events.js` to populate ~30 days of history from Resend's retained per-email status.

**Stranded local branches (cleanup):**
- `chore/scratchpad-resend-webhook-pivot` (local, never pushed) — yesterday's mid-session save with the pivot decision but pre-execution state. Superseded by this entry; safe to delete.
- `chore/scratchpad-2026-04-26-webhooks` (current) — this entry.

**Deferred follow-ups (post-merge, separate PRs):**
- Auto-suppression for hard bounces / complaints — needs policy doc (false-positive risk for 60-70yo audience is real)
- `/admin/analytics` Opens tile — best designed as part of the audit re-run, where the consumer picks the right windowed denominator
- A/B testing framework for subject lines — webhooks unlock the data; testing UI is its own scope
- Periodic reconciliation cron — for `email_events` rows where `email_log_id IS NULL` (race: webhook arrives before our send pipeline writes resend_id). Low priority unless we observe lookup misses in practice.
- `email_events` retention policy — table grows ~1k-3k rows/day. Not blocking, but worth a 12-month archive policy eventually.

---

### 2026-04-25 — Admin Analytics — KPI strip rebuilt + design pass (3 PRs)

**Where it landed:**
- ✅ **PR #632 MERGED** to staging (commit `1519f266`) — grouped KPI strip (Discovery / Engagement / Families), range-aware (follows the date picker), benefits_started instrumentation. Migration 049 applied to staging Supabase.
- ⏸ **PR #633 OPEN** — Providers section (5 distinct-provider tiles). Migration 050 applied. **Superseded by #634** — close after #634 lands.
- ⏸ **PR #634 OPEN** — Design pass (audience grouping, deltas, insight strip, animated counters, URL-encoded range, click-throughs, tooltips, top-providers polish). Includes #633's commits cherry-picked. Active branch: `feature/admin-analytics-design-pass`. Latest commit: `dc7ba414` (audience tints amber-50/70 warm, sky-50/70 cool).

**Layout that landed in #634 (Wave 1 design pass):**

```
[ Insight strip ]   ✦ "Page views up 100% last 7 days (2,181 vs 1,066 prior)."
[ Last 7 days ]
  Care seekers   (warm amber tint)
    Discovery        Page views · Unique sessions · Card clicks
    Engagement       Questions · Leads · Reviews
    Family funnel    Benefits started · Benefits finished · Profiles published
  Providers      (cool sky tint)
    Sign-ins from Q&A · Page-flow claims · Answered questions · Engaged with leads · Clicked dashboard CTA
[ Top providers ]   sortable, display name primary, slug as muted mono
[ Latest 50 events ]
[ Footer ]   "Bot rejects today: N" — relocated out of the windowed card
```

Per-tile delta lines (↑12% emerald / ↓4% rose / "flat" gray / "new" emerald), tooltips, click-throughs to filtered admin views, animated counters (cubic ease-out 600ms), `?preset=7d` URL param.

**Files modified across all 3 PRs:**
- `supabase/migrations/049_benefits_started_event.sql` (new) — applied
- `supabase/migrations/050_claim_completed_event.sql` (new) — applied
- `app/api/admin/analytics/summary/route.ts` — major rewrite, range-aware + prior-window deltas + insight generator + olera-providers name lookup
- `app/admin/analytics/page.tsx` — major rewrite, audience grouping, all polish touches
- `app/api/activity/track/route.ts` — `benefits_started` added to ANONYMOUS_EVENT_TYPES
- `app/api/benefits/track-start/route.ts` — DB persist on top of existing Slack alert + sessionId
- `app/api/claim/finalize/route.ts` — fires `claim_completed` with `metadata.source='email'`
- `app/api/provider/claim-listing/route.ts` — fires `claim_completed` with `metadata.source='page'`, keyed on slug
- `components/providers/BenefitsDiscoveryModule.tsx` — passes sessionId to track-start
- `hooks/use-animated-count.ts` (new) — value-tweening hook (re-runs on value change, unlike useAnimatedCounters which only fires on mount)

**Wave 2 (deferred — not in #634):**
- Per-tile sparklines (60×16 mini-charts inside each tile) — needs new time-series-per-metric endpoint
- Multi-series chart upgrade with annotations + benchmarks — needs annotations data model + design conversation

**Resume next session:** TJ tested #634's preview. Once happy, `/pr-merge 634` to staging, then close #633. Wave 2 sparklines + chart upgrade is the natural follow-up.

**Key decisions locked in this session:**
- "Search clicks" was misleading (counted card click-throughs from results pages, not home-page search) → renamed "Card clicks" in the UI; underlying event_type stays `search_click`. Home-page search button remains uninstrumented (deferred).
- "CTA clicks" tile dropped — only ever counted Save (heart) clicks; Connect/Contact instrumentation was a never-shipped TODO. Underlying `cta_click_public` event still used by provider-side dashboards.
- Two claim endpoints map naturally to source attribution: `/api/provider/claim-listing` → `source='page'`, `/api/claim/finalize` → `source='email'`. No request-body `source` param needed.
- Distinct-provider counts (not raw events) for Providers section — different shape than the rest of the strip but matches "how many people did X" framing.
- `lead_opened` event is whitelisted in CHECK but never written by any code path. Switched "Engaged with leads" filter to `one_click_access AND metadata.action='lead'` (production has 2 such events confirming the path fires). If we later instrument a real lead_opened in the portal, can swap back.
- Audience grouping (Care seekers / Providers) replaces the inconsistent flat 4-section labels (Discovery/Engagement/Families/Providers — three actions + one audience).
- Audience tints: started at /30 opacity → looked like off-white smudges → bumped to /70 (amber warm, sky cool) so they read as intentional design, not render artifacts.
- claim_completed (page-flow) keyed on `providerSlug` not `providerId` — matches the slug format every other anonymous event uses, enables future cross-event joins. Email-flow path still uses providerId since slug isn't in that body — known caveat.

**Pre-test bugs caught + fixed before push:**
- PR #632: "All time" preset returned last-24h (endpoint defaulted to 24h fallback when no params)
- PR #633: "Engaged with leads" filtered on `lead_opened` which has zero rows ever in production
- PR #634: skeleton flickered on range change (re-mounted tiles, broke counter tween); 3-tile rows in 5-col grid created awkward empty columns; claim_completed keyed on wrong ID format

---

### 2026-04-23 — Provider Analytics — Phase 2 (Dashboard Redesign) — ALL PILLARS BUILT, ready for PR polish + merge

**Phase 2 Brief (live doc):** https://www.notion.so/34b5903a0ffe81098302ce55d5df2a4d — source of truth for this workstream. Decisions + open questions live there.

**Branch:** `feature/dashboard-redesign-phase-2a-score-extension` — 8 commits ahead of staging, DRAFT PR #625.

**Resume next session:** Load this file, you'll have full context. Top priorities:
1. Run `/pre-test` — clean review of the 8 commits on the branch
2. Verify mobile responsive layout (right-sidebar stack on narrow viewports)
3. Mark PR #625 ready for review, then `/pr-merge 625`
4. Post-merge: pick the next ⏳ item from Phase 2 backlog below

**Where Phase 2 stands (2026-04-23 EOD):**
- ✅ 2A Score extension — 7 → 9 weighted sections (Reviews + Response Rate) in `lib/profile-completeness.ts`. Backward-compat preserved.
- ✅ Unified `/api/provider/dashboard` endpoint — greeting + activity + reviews + response-rate + cohort in one payload. Commit `9e0cb303`.
- ✅ Pillar A (DashboardHero) — priority-ranked greeting with one primary action CTA. `components/provider-dashboard/v2/DashboardHero.tsx`
- ✅ Pillar C (CohortContextCard) — reframed cohort demand narrative. `components/provider-dashboard/v2/CohortContextCard.tsx`
- ✅ Pillar D (ReviewInvitationsCard) — contextual review invitations, non-sales-y. `components/provider-dashboard/v2/ReviewInvitationsCard.tsx`
- ✅ Pillar E (RecentActivityCard) — merged timeline of questions/leads/reviews/views. `components/provider-dashboard/v2/RecentActivityCard.tsx`
- ✅ Pillar F (TrafficSummaryCard) — compact KPI snapshot + deep link to `/portal/analytics`. `components/provider-dashboard/v2/TrafficSummaryCard.tsx`
- ✅ All pillars wired into `/provider` behind `NEXT_PUBLIC_FF_PROVIDER_ANALYTICS_ONBOARD` flag (`components/provider-dashboard/DashboardPage.tsx` lines 310-325).
- ✅ Completeness sidebar shows 9 sections when v2 data available.
- ✅ Onboard teaser CTA repointed `/portal/analytics` → `/provider` ("See your dashboard").
- ✅ Weekly digest email CTA repointed `/portal/analytics` → `/provider` (`lib/email-templates.tsx` line 995).
- ✅ `/portal/analytics` header rebranded "Analytics" → "Traffic report" with back-to-dashboard link. Deliberately KEPT the route (it's a sub-report now, not a parallel home).
- ⏳ Final `/pre-test` + PR merge to staging.
- ⏳ Mobile responsive check — right sidebar should stack below on narrow viewports; confirmed by DOM but TJ should eyeball on mobile.
- ⏳ Phase 2 polish items (below) — defer to post-merge PRs.

**Phase 2 deferred / polish backlog (post-merge):**
- 🚫 Cohort card zero-demand variant — on staging the cohort shows demand=0 because no real organic traffic hits other TX Assisted Living pages. Card hides correctly by design. Real prod traffic will light it up. **Decided Option A: ship as-is, revisit after prod data accumulates.**
- Geocode business_profiles.city+state → lat/lon so radius-tier cohort works for providers without `source_provider_id` (Aggie + any future claim-flow-skipping providers).
- Pull shared cohort helpers out of `/api/provider/dashboard/route.ts` + `/api/provider/analytics/route.ts` (currently duplicated — Phase 2 TODO noted inline).
- Resend email BASE_URL handling — templates hardcode staging URL so notification emails always point at staging-olera2-web regardless of where we're testing. Proper fix: fallback to `VERCEL_URL` env var with staging as last resort. Not a blocker; workaround is to manually swap hostname in email URL when testing on preview.

**Key decisions locked in:**
- One unified dashboard at `/provider` is the home base. `/portal/analytics` survives as the detailed Traffic Report sub-page (cleaner than folding 606 lines into `/provider`).
- Quality score weights signed off (9 sections; heaviest on Gallery 15%, Reviews 15%, Response Rate 12%).
- Single scrolling page, no tabs.
- Same feature flag as onboard teaser — launches together.
- Review invitations framing is contextual + honest, NEVER sales-y — 60-70yo facility operators have been burned by Caring.com/APFM-style "get more business" hooks, that framing violates trust.
- First-principles over iteration per TJ's "what if current design sucks" instinct.

**Branch commit history (8 commits on feature/dashboard-redesign-phase-2a-score-extension):**
1. `446a4d85` — Extend completion score to 9 weighted sections
2. `9e0cb303` — Add /api/provider/dashboard unified endpoint
3. `76a248a7` — Wire Phase 2 dashboard pillars into /provider behind FF
4. `eea974ba` — Fix four Phase 2 bugs caught in pre-test (dead routes, dead anchors, fabricated stats, wasted fetch)
5. `5bdcd479` — Log end-of-session state for Phase 2 dashboard redesign
6. `8eabdd30` — Add cohort trace to /api/provider/dashboard for diagnostics (_debug field)
7. `d5b878cd` — Add Pillars D + F and repoint analytics CTAs to /provider
8. `[latest]` — Remove _debug diagnostic from dashboard endpoint (cohort behavior is working as designed)

**CohortContextCard diagnostic result (2026-04-23 evening):**
TJ loaded his dashboard on preview, pasted the `_debug` payload. Trace showed:
- Aggie has `source_provider_id: null` → no lat/lon → radius tiers correctly skipped (no-geo)
- State tier ran: 1000 TX Assisted Living slugs from `olera-providers` → passed 5-provider threshold
- Demand query returned 0 unique sessions → card hides correctly (by design — zero-demand would contradict pipeline-opportunity framing)
- **Conclusion: working as designed. Will light up in production with real traffic. Diagnostic code removed in commit 8.**

**Testing state:**
- ✅ Pillar A, E verified rendering by TJ on preview build `d5b878cd`
- ⏳ Pillars D, F — built but not visually verified by TJ yet (right sidebar stacks below on narrow viewports; TJ needs to scroll or widen window to see)
- ⏳ Full `/pre-test` pass on the 8-commit branch before merge

**Current preview URL** (check via `gh pr checks 625` to confirm latest):
`olera-web-git-feature-dashboard-redesign-phase-2a-06a582-olera.vercel.app`

**Strategy doc (parent thread):** https://www.notion.so/34a5903a0ffe81f7ad56d6d85514d52f
**Phase 0 plan:** `plans/provider-analytics-phase-0-instrumentation-plan.md` (shipped)
**Phase 1 plan:** `plans/provider-analytics-phase-1-surfaces-plan.md` (shipped to staging)

**Where everything stands overall:**
- Phase 0 (instrumentation) → SHIPPED (PR #620)
- Phase 1 (surfaces v1) → SHIPPED (PRs #623, #624, chore/dejank-onboard-teaser)
- Phase 2 (dashboard redesign) → mid-build on current branch
- Phase 3 (L3 monetization) → still deferred

**Phase 0 — DONE.** PR #620 merged to staging at commit `b18b08d6`. Instrumentation live. Admin sanity view at `/admin/analytics`. Nightly aggregation cron at 8 AM UTC. [Merge report](https://www.notion.so/34a5903a0ffe8163a88fd2569f8009c3).

**Phase 1 sub-phases shipped on the branch:**
- ✅ 1A Data layer — `/api/provider/analytics` endpoint, `lib/analytics/triage.ts`, migration 046 (provider-owner RLS, applied)
- ✅ 1B Onboard teaser card — `<AnalyticsTeaserCard />` in `ProfilePreviewCard`. Three tier variants (low=pipeline-opportunity framing, medium/high=personal count + delta + source). Behind feature flag `NEXT_PUBLIC_FF_PROVIDER_ANALYTICS_ONBOARD=true` (set on Vercel Preview env, NOT Production).
- ✅ 1C Dashboard — `/portal/analytics`. Owner-gated. Pipeline banner, KPI grid, trend chart, sources, funnel/summary, peer cohort. Not flag-gated.
- ✅ 1D Weekly digest — `/api/cron/weekly-provider-digest` (Mondays 13:00 UTC), tier-aware email template, new opt-out channel via extended `/api/providers/unsubscribe?type=analytics_digest`.
- ⏸ 1B task 8 — sequence reviews copy by analytics state. Deferred (needs shared state refactor).
- ⏸ 1E — distribution-derived thresholds, A/B rollout. Needs ~2 weeks real data.

**Bugs caught + fixed during this session (5 in total):**
1. Teaser card misleading copy when cohort data null + some personal views exist
2. Dashboard PipelineBanner deflating "0 families searched" empty state — hide when 0
3. Weekly digest cron missed legacy providers whose `provider_activity.provider_id` is a `source_provider_id` — added fallback lookup
4. `accounts.select().single()` returning 500 instead of friendly 400 — switched to `.maybeSingle()`
5. `reached_your_page_count` (cohort-stale-unique) contradicting `views.this_period` (real-time-raw) in adjacent dashboard UI — aligned both to `viewsThisPeriod`

**Test results from preview (TJ verified 2026-04-22 evening):**
- ✅ Dashboard at `/portal/analytics` renders perfectly. KPI grid, trend chart, sources, funnel all working.
- ✅ Teaser card appears on reload — confirmed tier-low fallback copy "Your traffic is just getting started" / "1 family viewed your page this month" working as designed.
- 🔴 → ✅ Teaser card invisible on FIRST load (auth race — auto-sign-in not done before fetch). Latest fix `36f172b9` added `useAuth` gate so card waits for auth resolution before fetching. Re-test pending.
- 🟡 → ✅ Funnel bar overflowed at 900% width because question_received historic count exceeded brand-new page_view count. Fixed to use max(stages) as denominator + visual cap at 100%. Renamed "Engagement funnel" → "Engagement summary" since the funnel metaphor breaks when step N exceeds step N-1.

**Notion email-link host issue (not a bug, an environmental constraint):**
Real notification emails sent via Resend point at `staging-olera2-web.vercel.app`, not the preview URL. To test the onboard flow on preview, take a real email's URL and **swap the hostname** for the preview branch URL. The `otk` token signature still verifies because preview + staging share `CLAIM_TOKEN_SECRET`.

**Latest commit:** `36f172b9` (auth race fix + funnel cap). Pre-test passed clean — no new bugs.

**Pre-PR refinement decided 2026-04-22 evening:** Add real-time adaptive cohort fallback to `/api/provider/analytics` BEFORE shipping. Rationale: tonight's preview test showed Aggie's teaser falling back to "1 family viewed your page" (raw count) instead of the pipeline-opportunity framing ("X families searched your area"). Cause: cohort data only comes from the nightly cron which hasn't run yet. Decision: real-time fallback + adaptive widening, ship the polished version.

### Adaptive cohort widening spec (next code change)

**Where:** `/api/provider/analytics/route.ts` — extend the cohort/pipeline_opportunity query branch.

**Logic (try in order, first one with cohort_size >= 5 wins):**
1. `(city, state, category)` — city-level
2. `(state, category)` — state-level fallback
3. `(state, *)` — state, all-categories last-resort fallback

**Real-time vs aggregation table:**
- For Phase 1B', query `provider_activity` directly (real-time COUNT(DISTINCT session_id))
- The nightly cron's `provider_page_view_stats` continues to power historical trend lines (separate use case)
- Acceptable because Phase 1 volume is low; Phase 2 might need caching

**Response shape addition:**
- `pipeline_opportunity.scope: "city" | "state" | "state-all"` — so card/dashboard can pick correct copy

**Copy per scope:**
- city → "X families searched for [category] in [city] this month"
- state → "X families searched for [category] in [state] this month"
- state-all → "X families searched for senior care in [state] this month"

**Cohort lookup approach:**
1. Get cohort provider slugs: `SELECT slug FROM "olera-providers" WHERE state=$1 AND provider_category=$2 [AND city=$3]` (city filter conditional)
2. Threshold check: if rows < 5, fall to next widening tier
3. Once cohort settled, COUNT(DISTINCT metadata->>'session_id') from `provider_activity` for those provider_ids in window

**Provider's own traffic IS included in `local_demand_count`.** Framing is "demand in your area" + "your slice of it" — both include same provider, X ⊃ Y semantically.

**UI changes needed after endpoint update:**
- AnalyticsTeaserCard `buildHeadline` / `buildSubline`: use `pipeline_opportunity.scope` to pick the right "[city]" vs "[state]" wording
- Dashboard PipelineBanner: same scope-aware copy

### Deferred to Phase 2 (decisions made tonight)

- **Geographic-radius cohorts** (lat/lon proximity instead of city name match) — better matches "near me" search behavior. Requires PostGIS or distance math + lat/lon completeness.
- **Population-density-weighted radius** — rural vs urban "near me" semantic difference.
- **Cron computing multi-granularity benchmarks** (city + state + state-all) so dashboard trend lines also adapt.
- **Cohort excluding own traffic** if framing pivots from "your area's demand including you" to "competitive landscape excluding you."

### Next action sequence (post-compact resume)

1. ⏭ Implement adaptive cohort widening in `/api/provider/analytics/route.ts` (~30 min)
2. ⏭ Update AnalyticsTeaserCard + dashboard PipelineBanner copy to consume `scope` field
3. ⏭ `/pre-test` one more sweep
4. ⏭ Commit + push
5. ⏭ Open PR to staging (admin bypass merge per CLAUDE.md)
6. ⏭ Apply migration 046 via Supabase dashboard if not already
7. ⏭ Set `NEXT_PUBLIC_FF_PROVIDER_ANALYTICS_ONBOARD=true` on staging env (Production stays off until full launch)
8. ⏭ Phase 1B task 8 (sequenced reviews copy) and Phase 1E (distribution-derived thresholds + A/B) are the natural follow-ups

**Most important deferred strategic question (Phase 3+):** What is Olera's L3 / monetizable layer? — captured in strategy doc as the highest-priority open question.

---

### 2026-04-21 → 2026-04-22 — 176-city expansion batch complete

176-city senior-care provider expansion. Ran end-to-end via `/city-pipeline`. No code changes — DB + Notion writes only.

**Final stats:**
- 170/176 cities loaded with providers; 6 empty (Holtsville NY, Hampton PA, Penn PA, Burke Centre VA, Bethpage NY, Weston WI — all survived 0 providers after keyword + AI classify + Perplexity entity verification + dedup)
- 3,655 active providers inserted (from 30,304 discovered → 5,754 post-classify → 2,099 soft-deleted by trust-signal entity verification)
- Enrichment: 5,751 descriptions, 1,824 trust signals confirmed, 4,836 review snippets, 4,044 images
- Cost: $386.57 (11,807 Google + 1,750 Perplexity calls)
- Wall time: ~9h15m (discovery 1h25m → clean 3h50m → load 45m → enrich 2h40m → finalize 5m)
- Pipeline logs: `/tmp/pipeline-all.log`, `/tmp/discovery-2026-04-21.log` (both will rotate)

**Data quality (verified via subagent spot-check during enrich):**
- 0 null place_ids, 0 bad categories, 0 out-of-state coordinates, 0 LLC/Inc/Corp suffixes
- Fixed 1 edge case: `vail-az-0005` had " LLP" suffix — stripped post-enrichment
- Name Check regex in pipeline doesn't catch LLP — consider adding for future batches

**Why clean took 3h50m (not "~5 min" per skill):** pooled AI classify ran on 30,304 providers (batch of 80 at a time × ~380 API calls × seconds each + retries). Skill's estimate was based on smaller batches. Expect proportional scaling on future big batches.

**Notion:** all 176 pages flipped "Upload to Backend" → "Complete" via subagent (14 Done boxes checked except "Fetch Email & Contact Info" per skill convention).

**Followups (low priority, carry forward):**
1. **ND/SD not in Notion State select** — Jamestown ND, Mitchell SD, Yankton SD got pages without State value. Add ND/SD options when convenient.
2. ~~**Stale Notion pages in "Discovery" status**~~ — CLEANED UP 2026-04-22. 128 stuck pages audited against Supabase: 127 flipped to Complete (100 from 2026-04-02 bulk seed + 16 more from same batch + 12 from 2026-04-15 184-city batch subagent misses). Port St. John, FL (0 providers after filters) soft-archived.
3. **6 empty cities** — safe to remove from expansion map as "verified empty" (no senior-care providers after all filters).
4. **Live-site check at end showed 5 FAILs** — cosmetic ISR cache warming noise per skill docs, not real failures. Pages will work after ISR warms (~1hr).

---

### 2026-04-21 — Admin Pulse Header (Questions + Leads)

**Branch:** `glad-pare` (tracks `origin/glad-pare`, no PR to `staging` yet — TJ has more feedback to land first)
**Head:** `540825b3`

Built a "pulse header" for `/admin/questions` and `/admin/leads`:
- Title + KPI ("X needing email") + delta line + full-width interactive chart
- Single date-range popover button (7 presets + custom from/to) replacing the old 3-row filter chrome
- Tabs, search, list, inline email form, archive/delete flows untouched

**Files created:**
- `lib/admin-stats.ts` — bucket helpers (hour/day/week/month auto-pick)
- `app/api/admin/questions/stats/route.ts` — returns `{ total, delta, series, bucket }`
- `app/api/admin/leads/stats/route.ts` — same shape
- `components/admin/DateRangePopover.tsx` — single-button popover with presets + stacked From/To custom range
- `components/admin/PulseHeader.tsx` — title/KPI/delta/sparkline + Y-axis max label + gridline + hover tooltip

**Files modified:**
- `app/admin/questions/page.tsx` — integrated PulseHeader, removed old header + filter chrome
- `app/admin/leads/page.tsx` — same

**Iteration log (why this took 8 commits):**
1. `6c9e9a34` — initial 48px sparkline — "looked bad"
2. `d4eded07` — width bug (ResizeObserver never attached) + empty-state bug (`Math.max(1, …)` masked all-zero case)
3. `382a49da` — height 140→180, padding 22px, UTC label formatting to fix Apr 13/14 off-by-one
4. `1811ac49` — added max-value label + dashed gridline at ceiling so peaks read as "at max" not "clipped"
5. `bb2bbddc` — tried hardcoded Y-max at 120 (TJ asked)
6. `10b95517` — TJ pushed back: hardcoded ages badly. Replaced with `niceCeiling()` auto-scale (1.5x → round up to 1/1.5/2/2.5/3/4/5/6/8/10 × 10^n). Added 90ms ease-out CSS transitions on SVG hover elements + row action slide-in translate.
7. `d1cee83a` — **semantic split**: KPI shows needs-email count (time-bounded), chart shows ALL question volume. Single DB query, two metrics computed in memory.
8. `540825b3` — **linear interpolation** (dropped Fritsch-Carlson monotone cubic). Smooth curves created "upward inflection" illusion — user read intermediate Bezier y-values as data that didn't exist. Also bumped niceCeiling 1.5x → 1.75x for peaks in 40-55% zone. Default range "all" → "30d". Stroke 1.75→2.

**Design decisions locked in:**
- **Chart ≠ KPI** intentionally. KPI is action queue (needs-email). Chart is platform pulse (all activity). Two metrics on one card — contextualizes the number with volume context.
- **Linear over smooth.** Monotone cubic's S-shape between discrete daily buckets visually implies intermediate values that don't exist. Linear = most honest read of time-series. Matches Linear / Stripe / Datadog.
- **Nice-number Y-axis**, not fixed. Hardcoded ceilings don't age with growth. `niceCeiling(realMax)` rounds up to clean steps with 1.75x headroom → peaks always at 40-55% of chart.
- **Server buckets UTC days**, labels formatted in UTC to match. Admin chart represents UTC-day windows; admin user understands this.
- **Date range popover > multi-row chips.** One button, one popover. Presets list (all/today/yesterday/7d/30d/90d/1y) + stacked custom From/To at bottom of dropdown. Widened from w-72 to w-80 so From/To inputs don't overflow.

**Hover feel:**
- Chart hover dot + crosshair + tooltip all smooth-follow (90ms ease-out on SVG cx/cy/x1/x2 and HTML left/top)
- Row action buttons (Archive/Remove/Delete) slide in 4px from right on row hover (translate-x-1 → translate-x-0 + opacity, 200ms)
- Popover still hard appears — low priority

**Known cross-page inconsistency (not fixed):**
- Admin overview card "Needs Email: X" is all-time count
- `/admin/leads?tab=needs_email` now opens at last-30-days default
- Numbers will differ between the two views
- Fixes: either scope the overview card to 30d, or pass `?range=all` when navigating from overview. Awaiting TJ's call.

**Other known limits (not bugs today):**
- `.limit(50000)` with `ascending: true` means if platform ever has >50k questions/leads, we'd fetch the oldest 50k and miss recent. Olera is at ~1300 questions. Non-issue.
- Chart first-hover pops in instantly (no fade-in). Subsequent moves smooth. Acceptable.

**TJ said "I have a few things to add"** — next feedback loop incoming. Pausing here.

---

## Blocked / Needs Input

- ~~**Migration Playbook → Notion:**~~ ✅ Done (2026-03-01) — updated via Notion MCP
- ~~**Top 100 pages from Search Console:**~~ ✅ Done — GSC export analyzed, 0 404 risks found
- ~~**Editorial content redirect decision:**~~ ✅ Done — all v1.0 content routes now have redirects in `next.config.ts`: `/research-and-press/*` → homepage, `/caregiver-forum/*` → `/`, `/caregiver-relief-network/*` → homepage, `/company/*` → dedicated pages

---

## Next Up

**After PR `feat/data-sweep-skill` merges:**
- Backfill `google_reviews_data.{places_types, business_status, country_code}` for existing 70,722 active providers (Stream B only populates this on next sync — separate one-shot script if we want it sooner).
- Run sweep #2 in ~3 months (default quarterly cadence) on full DB — see runbook for procedure. Validate the v2.2 regex isn't catching new patterns before scrapping it for sweep #3.
- Wrong-category cleanup of `INSUFFICIENT_EVIDENCE` providers (~50K) — would need different prompt + signal (website fetch, Google Places `types`).
- Migrate the 13-type backend `ProfileCategory` enum down to the 6 — separate workstream for claim UI restriction + dead enum cleanup.

0. **Re-open the email audit task** ([Notion](https://www.notion.so/Audit-provider-question-lead-notification-email-Resend-find-the-open-rate-lift)) after ~7 days of real webhook data accumulates. Reframe primary metric from "open-rate lift" to "engagement lift, primarily clicks" given Apple Mail noise.
0a. **Wave 2 admin analytics polish** — per-tile sparklines + multi-series chart upgrade with annotations. Deferred from PR #634 (which merged 2026-04-25). Needs a new time-series-per-metric endpoint.
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
| 2026-04-27 | Scrap regex amnesia detector for LLM self-correction pass | After 5 regex iterations (v1 → v2.2) chasing TJ-flagged FPs, recognized regex-on-LLM-free-text is fundamentally fragile. Forced-choice anti-amnesia prompt on the 2,936 OUT_OF_SCOPE verdicts gave structured output for ~$5 in 4 min. Replaced regex output entirely. |
| 2026-04-27 | Generate disagreements file as third review artifact | When two noisy signals disagree (regex v2.2 vs LLM re-pass), the cases worth highest scrutiny are the 233 disagreements (8% of OUT_OF_SCOPE). Cheap to produce, valuable for spot-check, surfaces blindspots in either signal. |
| 2026-04-27 | Backup CSVs written BEFORE DB writes, not after | If execution fails partway, we still have the full intended-state record. Recovery is a single SQL UPDATE per CSV. Previous data sweeps generated backups after which is recoverable but more painful. |
| 2026-04-27 | Tighten discovery search terms over relying on entity verification to clean up | Sweep #1's $160 entity verification cost reflects too-loose discovery: '55+', 'senior apartments', 'rehab center', 'cognitive care' pulled massive false positives. Tightening discovery prevents pollution; cheaper than per-batch LLM cleanup. |
| 2026-04-27 | Forced-choice prompts > free-text reasoning for verification | Free-text LLM reasoning often contradicts its own verdict (amnesia: "Non-medical home care provider" → marked OUT_OF_SCOPE). Forced-choice with anti-amnesia guidance forces the LLM to commit to one of {6 cats, NONE} without contradicting itself. |
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

### 2026-04-27 — Sweep #1 wrap (resume → execution → pipeline updates)

**Resumed** the data-sweep work paused at end of 2026-04-26. TJ had paused review on the deletions + reclass-from-deletions MDs after flagging Lexie Rae's Care Home as another regex amnesia gap.

**Iterated regex 4x (v1 → v2.2):**
- v2: widened AL pattern (drop "for the elderly"), added META_REFS for category-by-name signals ("falls under", "matches", "should be reclassified as"), service vocab broadened
- v2.1: added clause-level negation after TJ flagged ThedaCare Physicians (long-list-of-negation FP that fixed-window check missed)
- v2.2: added definitional-context exclusion + "indicate" META_REF after TJ flagged Joyful Home Health Care (LLM described HHC business model but my regex matched the definitional sentence about HC Non-medical)

**Strategic pivot:** TJ called out that the fix-cycle pattern was a smell — 5+ patches without converging. Stepped back, articulated that regex-on-LLM-free-text is fundamentally fragile, and proposed an LLM self-correction pass with forced-choice anti-amnesia prompt. TJ agreed.

**Executed the pivot:** Wrote `repass-out-of-scope.js` + `regen-from-repass.js`. Re-pass on 2,936 OUT_OF_SCOPE verdicts: 4.1 min, ~$5. Produced 2,582 confirmed deletions / 271 reclass / 83 silent / 0 missing. Generated `disagreements-2026-04-27.md` (233 cases where regex v2.2 vs re-pass diverged) as a third review artifact.

**TJ reviewed all 3 files:** approved. Found one stale-website edge case (`8M1Gdy4` Oakview Park — actually AL/MC, but website field points at a Comfort Keepers office that misled the LLM). Unchecked that row with a TJ override note.

**Executed cleanup:** `execute-cleanup.js` ran in 4.6s. Soft-deleted 2,582 providers, reclassified 270 (Oakview Park stayed AL|MC). Active providers: 73,304 → 70,722. Backup CSVs written before any DB writes.

**Pipeline updates** (this session, ready for PR):
- `scripts/pipeline-batch.js`: 3 prompts unified via `SIX_CATEGORY_DEFINITIONS` + `OUT_OF_SCOPE_TYPES` constants. Tight YES list (the 6) + comprehensive NO list. Each prompt now also returns `category` (one of the 6) for richer signal. Stream B Places call expanded with `types`/`businessStatus`/`addressComponents`, stored in `google_reviews_data.{places_types, business_status, country_code}` for future filter logic.
- `scripts/discovery-batch.py`: search terms tightened, removed contamination sources from sweep #1 (55+, senior apartments, rehab center, cognitive care, memory support, visiting nurse alone, personal care, caregiver). Comment block at top documents the rationale.
- `docs/data-sweep-runbook.md`: updated change log with v2/v2.1/v2.2 + the "scrapped regex for LLM re-pass" learning.
- `SCRATCHPAD.md`: this file.

**Branch state:** `feat/data-sweep-skill` off `origin/staging`. 3 modified files (SCRATCHPAD, pipeline-batch.js, discovery-batch.py), 3 untracked (definitions doc, runbook, skill). Ready to commit + PR.

**Cost summary for sweep #1:** ~$170 total ($0 Tier 1 + $3 calibration + $160 LLM verify on 73K + $5 LLM re-pass + $2 retries). Active providers post-sweep: 70,722.

**Skill + runbook artifacts:**
- `.claude/commands/data-sweep.md` — slash command for sweep #2+
- `docs/data-sweep-runbook.md` — operational details (regex, prompts, cost, change log)
- `docs/provider-category-definitions.md` — source of truth for the 6 categories


