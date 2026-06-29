# Family Comms Intelligence System — Build Plan

**Branch:** `mighty-carson` · **Date:** 2026-06-22 · status: building
Companion to `plans/provider-comms-gate.md` (the provider-side precedent this mirrors).

## Strategy v2 — compare-led flywheel (locked 2026-06-22 with TJ)

Supersedes the v1 ladder's **priority and framing** (the machinery in Parts 1–2 below is
unchanged; what changes is rung order + copy). v1 optimized *our* funnel
(connect / complete / publish). v2 optimizes the *family's* job-to-be-done.

**The flywheel — three reinforcing forces, not competing priorities:**

> **Complete → Compare → Benefits → (loop back to Complete)**

- **Completion = the FUEL.** Budget, timeline, care needs, location. The more we have, the
  better the options we show *and* the more relevant the benefits. It earns its keep — but it
  is **never a naked ask**. Always "give us one more detail so we can show you better matches."
  Same action, opposite framing. (This is why the v1 dry-run's 208 completion nudges weren't
  wrong in *volume* — they were wrong in *framing* and *sequence*.)
- **Compare options = the HERO (priority #1).** What families actually want: real choices and
  a feeling of control. Delivered **unilaterally** — we have 21k providers, so we can always
  show options whether or not any single provider responds. This is the spine.
- **Benefits = the CLOSER (priority #2).** "You like that one? Here's how to afford it." Our
  strongest organic asset (Logan's VA/BCBS articles top the site), untested as outbound,
  highest-upside lever. Strong — but **do not over-index**; it rides alongside compare, never
  leads.
- **Priority order: Compare (1) > Benefits (2) > Complete (3, woven into the other two).**

**Allocation by moment (lead with compare, completion as value-exchange, benefits alongside):**

| Moment | Lead with | Completion woven in as | Benefits |
|---|---|---|---|
| Inquiry sent (0–2d) | "While you wait, compare 2–3 similar options" | "add your budget for sharper matches" | soft intro |
| Quiet (2–3d) | Self-report + alternates to compare | — | "how to pay for these" |
| Provider responded | "Compare them vs 2 others + how to choose" | "care needs sharpen the comparison" | how to afford |
| Provider silent | Alternates to compare | profile refines who we show | benefits |
| Stuck | "Unlock better matches" (completion as the lever) | explicit value exchange | benefits deep-dive |
| Dormant | low-freq: new options near you | — | benefits drip |

**Responsiveness = INTERNAL RANKING SIGNAL ONLY — never a customer-facing claim.** We rank
responsive-first silently (better odds). We do **NOT** promise response times: first-hand
evidence is that times are long, and implying "they'll call you back" sets a trap and burns
trust. Compare cards lead with attributes we can stand behind — care types, price signal,
distance, reviews/capacity. Honest pitch = "more options to consider," not "these will respond."

**Compare destination = existing browse, pre-filtered** (care type + city + responsive-first
ranking). No dedicated side-by-side build on spec. **WATCH-ITEM:** the pre-filled browse must
genuinely satisfy the click intent — validate on ship ("feel it"), upgrade to a real compare
view only if the click data demands it.

**Concierge = flag, don't build.** No automated "concierge" emails — we can't promise human
follow-through at our size. The system MAY emit an internal signal for high-intent-stuck
families (provider silent + alternates tried + still no connection) so a human can jump in
when capacity allows. An ops decision, not an email tier.

**Cadence = ship now, iterate in days.** No multi-week measurement gate (explicitly rejected).
Design from first principles, ship the principled v1, instrument concurrently, react fast as
the self-report + click data lands.

**CODE STATUS:** the built coordinator (Part 2) still uses the v1 ladder (connection-logistics
priority/copy). **Re-shaping pass pending** — re-order rungs to compare-led, re-frame all copy
(completion as value-exchange, drop every response-time claim), point compare CTAs at
pre-filtered browse. Deferred by TJ: strategy captured first, code re-shape is a separate pass.
→ Now specced below: **"Strategy v2 — Re-shaping Spec."**

## Strategy v2 — Re-shaping Spec (build-ready, locked 2026-06-23 with TJ)

Concrete build plan to bring the coordinator code (`app/api/cron/family-comms-coordinator/route.ts`)
+ templates (`lib/email-templates.tsx`) in line with the compare-led flywheel. The *machinery*
(triggers, helpers, cap, run-recorder, dedup flags) is unchanged; this changes **rung copy/CTAs,
two rung behaviors (R3/R4 become compare-led), the benefits module, and one bug fix.**

### Decisions locked this session
1. **Compare = woven, NO net-new early email.** Compare leads the *copy* of the existing
   moment-rungs (48–72h+); we do not add a 0–2d "compare competitors" email (undermines the
   just-contacted provider + adds top-of-funnel volume).
2. **Benefits = the personalized quiz** (`/benefits/finder`), as a **light secondary module**,
   not the static `/benefits/[state]` list. The quiz collects zip/age/care-preference/needs/
   income/Medicaid/veteran and persists to `metadata.benefits_results` — it is *Complete +
   Benefits fused into one value-exchange action* (the cleanest expression of the flywheel:
   filling it both personalizes benefits AND captures the "fuel" that sharpens Compare).
   Auth deep-link (`generateFamilyInboxUrl`) lands the family logged-in, so the quiz
   **auto-prefills location/age/needs from their profile** — no URL params, no cold 6-step wall.

### The re-shaped ladder (triggers unchanged unless noted; copy/CTA changes)

| Rung | Trigger (unchanged) | v2 reshape |
|---|---|---|
| **R0 stops** | unsub / self-yes / active thread | unchanged |
| **R1 outcome_check** (sensor) | inquiry 48–72h, provider silent | **Keep ~as-is** — it's already the sensor + carries the compare promise in its closer ("if a provider's gone quiet, we'll show you others nearby"). Confirm zero response-time claim (the yes/not-yet/no *question* is fine). |
| **R2 provider_silent** | inquiry 96–120h, family engaged, silent, ≥3 alts | **THE compare hero.** Already renders responsive-ranked cards (`alternatives.ts`) + browse link. Fixes: (a) **browse-URL bug** (below); (b) reframe "ready to help" → attribute framing ("more options to consider" — never imply they'll respond); (c) add the **benefits-quiz module** as light secondary. |
| **R3 never_engaged** | inquiry 120–144h, never engaged, silent | **Becomes compare-led** (was a static PDF guide). Compute alts; if ≥3, lead with the same compare cards (gentler tone for a not-yet-engaged family) + quiz module. **Fallback:** if <3 alts, keep the resource/guide. |
| **R4 awaiting_match / day_10** | provider replied 9–11d, family silent | **Becomes compare-led** ("you heard from [provider] — here's how they compare to a couple others + how to choose") + cards + quiz module. Keep the passive `mailto:support` link (that's flag-don't-build concierge, fine). Fix its alternatives link to pre-filtered browse. |
| **R5 pending_reach_out** | request pending ≥3d | **Keep** — warm inbound (provider reached out, family hasn't replied); not the silent-provider problem. Audit copy for response claims only. |
| **R6 stuck → quiz** | inquiry ≥2d, no other rung, incomplete | **Reframe to value-exchange floor.** Was `family_nudge` ("Complete your profile to help [provider] respond" — naked ask **and** response claim, our worst offender). Replace with the **quiz as the primary CTA**: "tell us a bit more → better matches + what you may qualify to help pay." **Remove the publish branch** (`go_live_reminder`) from the coordinator → publish stays demoted in the subordinated `family-nudges` machine. |

### The compare surface
- **Hero = in-email responsive-ranked cards** (`findAlternativeProviders`, already silently ranks
  responsive-first over 60d). This is where "responsive-first ranking" lives — **never** a
  customer-facing response-time claim.
- **Browse overflow link = pre-filtered, BUG FIX.** R2 currently builds
  `/browse?care_type=…&city=…&state=…`, but `app/browse/page.tsx` only reads **`type`,
  `location`/`q`, `state`** → `care_type`/`city` are silently dropped, so the page loads
  unfiltered. Fix to `?type={browseSlug}&location={City}&state={ST}`. **Needs a
  care_type→browse-slug map** (stored `care_types` value → browse `type` slug e.g. `home-care`);
  add a small helper, verify against `careTypeSEO` keys in `app/browse/page.tsx`.
- **Deferred (watch-item):** browse's own responsive-first ranking. Cards already carry it;
  upgrade browse only if click data demands. Real side-by-side compare view: same — only if data demands.

### The benefits-quiz module (shared)
- One reusable email block (new helper, e.g. `benefitsQuizModule(url)`): light, secondary,
  one line + button — "See what you may qualify for to help pay for care (2 min)." Rides
  **alongside** compare in R2/R3/R4; is the **primary** CTA in R6. Never leads in R2–R4.
- URL = `generateFamilyInboxUrl(authEmail, appendTrackingParams("/benefits/finder", eid), siteUrl)`.
- **Build note (flag, may be a fast follow not this pass):** the quiz's step-5 "let providers
  find me" publish prompt is the funnel we're demoting — keep it opt-in / de-emphasized so we
  don't smuggle the publish ask back in through the side door.

### Response-time claim audit (strip across templates)
Scan `providerSilentEmail`, `familyNeverEngagedEmail`, `day10AwaitingEmail`,
`familyPendingReachOutNudgeEmail`, `familyNudgeEmail`, `goLiveReminderEmail`. Replace any
"ready to help / they'll respond / hear back soon" with attribute framing (care type, price,
distance, reviews) + "more options." Evidence: response times are long; promising burns trust.
(`connectionOutcomeCheckEmail` is clean — it asks, doesn't promise.)

### Template signature changes
- `providerSilentEmail`: add optional `benefitsQuizUrl`; reframe "ready to help."
- `familyNeverEngagedEmail`: add `recommendedProviders[]` + `browseUrl` + `benefitsQuizUrl` (now compare-led).
- `day10AwaitingEmail`: add `recommendedProviders[]` + `benefitsQuizUrl`; reframe to compare.
- `familyNudgeEmail` (R6): reframe to quiz value-exchange; add `benefitsQuizUrl`; drop "help provider respond."
- New shared `benefitsQuizModule(url)` block for consistency.

### Coordinator code changes (route.ts)
- R2: fix browse URL (slug map); pass `benefitsQuizUrl`.
- R3: call `findAlternativeProviders`; if ≥3 → compare cards + quiz, else guide fallback.
- R4: call `findAlternativeProviders`; pass cards + quiz; fix alternatives link.
- R6: drop the `isPublished`/`go_live_reminder` branch; incomplete → quiz-led value-exchange.
- Add a `benefitsQuizUrl` builder + the care_type→browse-slug helper.
- Cap coverage: all reused email types are already in `FAMILY_NUDGE_EMAIL_TYPES`; no new type, no cap edit.

### Ops / cutover (after the code reshape, behind dry-run)
0. **Email Gallery FIRST (before cutover).** Build the consolidated variant visualizer (`plans/email-gallery.md`) so every family variant is reviewable in-product before the coordinator sends real email. The cutover sends live mail — eyeball the full set in the gallery first.
1. **Apply migration 115** (self-report event type) — ✅ DONE 2026-06-23.
2. Run coordinator `?dry_run=true`, validate the new selection mix vs live data (expect compare
   rungs up, the old naked-completion volume down).
3. **Pause the 6 originals** in `cron_config` (outcome-check, provider-silent, never-engaged,
   day-10-awaiting, matches-family-nudge, lead-family-nudge) — pause, **not** delete (revertible).
4. `family-nudges` stays ON, subordinated (cap + coordinator-awareness guard already in code); it
   now solely owns the demoted publish/completion machine.
5. Enable the coordinator. **Rollback** = unpause the 6 + pause coordinator in `cron_config`, no deploy.

### Out of scope this pass (flag-don't-build / watch)
- Browse responsive-first ranking; real side-by-side compare view (cards suffice; revisit on click data).
- Quiz publish-step de-emphasis (fast follow).
- Internal "high-intent-stuck" concierge signal (ops decision, not an email tier).

## Channel strategy — multi-channel, locked 2026-06-23 (research-backed)

The coordinator is **channel-aware**, not email-only. Locked order: **email-initiated → SMS as the
primary text channel → WhatsApp as a deferred opt-in lane.** Deep research (4 adversarial agents,
2026-06-23) confirmed TJ's "text is more needle-moving" instinct but corrected the channel — for our
40–65 (often Hispanic) audience the high-performance text rail is **SMS, not WhatsApp.**

**Channel-by-moment:**
- **Sensor + hot status** ("did they respond?", "a provider replied") → **SMS** (one-tap, ~universal
  reach). WhatsApp variant only for opted-in Hispanic/urban users.
- **Compare digest + benefits/quiz nudges** → **email** (rich, ~free, no opt-in wall; also the
  category WhatsApp has frozen in the US).
- **WhatsApp** → deferred: opt-in only, Spanish/immigrant-targeted, **utility-only**, SMS fallback.

**Why not WhatsApp-first:** 32% of US adults (Pew 2025); our cohort ~30–40% vs near-universal SMS
(~30% effective reach). Hispanic 56% / urban 44% = the upside, captured as an opt-in lane. **Meta
paused all Marketing-category WhatsApp templates to US numbers since Apr 1 2025 (no resumption)** —
our compare/benefits content is marketing-category → blocked; only utility/auth/inbound work (the
sensor is a utility 3-button template → allowed). Cost ~parity (~$0.011/msg); email ~free for the drip.

**Sequencing asymmetry (sets the order):** email reaches the whole inquired base day one (no opt-in
wall); the SMS base starts at **zero** and fills only as families consent (TCPA). So: (1) ship the
email reshape now — content is channel-agnostic, reused verbatim on SMS; (2) stand up **SMS consent
capture** ("how do you want to hear back?") in parallel to fill the base; (3) light up SMS for the
sensor as the first text moment (after 10DLC registration); (4) WhatsApp later, opt-in, utility-only.

**New build dependency (messaging layer):** TCPA consent capture + STOP/HELP + 10DLC brand/campaign
registration (SMS); Meta business verification + template approval + separate opt-in (WhatsApp, later).
Full research + citations: Notion handoff "Family Comms System — Handoff (2026-06-22)" §7.

## Why

Family (care-seeker) email is sent by **7 independent crons** with no global coordination.
They avoid collisions today only by accident — staggered timing windows + per-flag
suppression — and there are **3 known unguarded overlaps** where one family can get two
emails in a day. Same firehose problem we already fixed for providers, minus the two
layers that fixed it:

1. **Governance cap** — `lib/email.ts` gates only `recipientType === "provider"`. Families
   have no frequency ceiling.
2. **Arbitration** — no single brain picks the *one best* message per family per cycle.

This plan adds both. The arbitration ladder also encodes the locked strategy
(`project_family_help_cascade`): **help cascade, not publish funnel** — connection-triggered
help is top priority; publish/completion nudges are demoted to the bottom.

## Part 1 — Family governance cap (independent, ships first)

Mirror the provider gate at `lib/email.ts:489`.

- `lib/email-governance.ts`:
  - `FAMILY_NUDGE_WEEKLY_CAP = 3`, reuse `NUDGE_WINDOW_DAYS = 7`.
  - `FAMILY_NUDGE_EMAIL_TYPES` (proactive nudges only — transactional/real-time EXEMPT):
    `family_outcome_check, family_provider_silent, family_never_engaged, day_10_awaiting,
    post_connection_followup, family_reach_out_nudge, family_nudge, go_live_reminder,
    stale_conversation, matches_nudge, provider_still_silent, dormant_reengagement,
    completion_nudge_1..4, completion_maintenance, publish_nudge_1..4, publish_maintenance,
    monthly_recommendations, inactivity_reengagement`.
  - EXEMPT (never cap): `new_message, question_answered, question_confirmation,
    question_received, matches_live, compare_save_welcome, guide_download, guide_save,
    inline_answer_welcome, welcome, returning_signin, care_report, checklist, daily_digest,
    provider_reach_out, reach_out_confirmation, reach_out_auto_declined, review_request,
    connection_sent, connection_request, completion_celebration, verification_*`.
  - `isGovernedFamilyNudge(emailType)` helper.
- `lib/email.ts`: sibling branch to the provider gate. Family has no stable `provider_id`,
  so key on **`recipient` (email) + `recipient_type = 'family'`**, `status = 'sent'`,
  `email_type IN FAMILY_NUDGE_EMAIL_TYPES`, `created_at >= windowStart`. Same fail-open
  behavior (a missed cap beats a wrongly-dropped real notification). No schema change.
- Surfaces automatically in `/admin/automations` (already family-aware).

## Part 2 — Family Comms Coordinator (`family-comms-coordinator`)

One daily cron. For each candidate family: build context once, evaluate rungs top-down,
send the FIRST eligible rung's email (cap-checked), stamp that rung's existing dedup flag
(so it stays compatible with the paused originals) PLUS a unified
`metadata.last_coordinator_email_at` / `last_coordinator_rung`. `?dry_run=true` returns the
selection per family without sending. Recorded via `withCronRun("family-comms-coordinator")`.

### The ladder (priority order — first match wins)

**Rung 0 — GLOBAL STOPS** (skip family entirely, no email):
- `from_profile.metadata.nudges_unsubscribed === true`
- Family self-reported outcome `=== "yes"` on any connection
- Family is in an *active live conversation* (provider responded AND family replied, thread
  activity < 7d) — never interrupt a working thread.

**Rung 1 — Outcome check (the self-report sensor)** → `family_outcome_check`
Inquiry 48–72h old; no `metadata.outcome`; no `outcome_check_sent_at`; no provider message
in thread. *This is the help-cascade's sensing layer.*

**Rung 2 — Provider silent → alternatives** → `family_provider_silent`
Inquiry 96–120h; family engaged (sent ≥1 msg); no provider responded anywhere; outcome ≠ yes;
no `family_alternatives_sent_at`; ≥3 responsive alternative providers exist (same city/state,
matching care_types, responded in last 60d).

**Rung 3 — Never engaged → resource** → `family_never_engaged`
Inquiry 120–144h; family NEVER sent a message in any connection; no provider responded;
outcome ≠ yes; no `family_never_engaged_sent_at`.

**Rung 4 — Awaiting match (warm hand)** → `day_10_awaiting`
Provider responded 9–11d ago; family hasn't replied since; no `day_10_awaiting_sent_at`.

**Rung 5 — Pending reach-out** → `family_reach_out_nudge`
`request` connection, status pending, ≥3d old; `family_reach_out_nudged_at` unset or >7d.

**Rung 6 — Lead follow-up** → `family_nudge` (incomplete) / `go_live_reminder` (≥60% unpublished)
Inquiry ≥2d; NOT (complete AND published); relevant nudge flag unset or >7d.

**Rung 7 — DEMOTED publish/completion sequences** (lowest)
The `family-nudges` profile-state sequences (completion, publish, monthly-recs,
reengagement). This is the funnel we are *demoting*, so it is the bottom rung by design.

### Decision: how to treat Rung 7 (the family-nudges state machine)

`family-nudges` is a ~10-variant state machine (completion_sequence, publish_sequence,
monthly_recommendations, post_connection_followup, inactivity_reengagement). Faithfully
rewriting it into the coordinator is high-risk churn **on the exact funnel we're demoting**.

**Chosen approach:** coordinator fully owns Rungs 0–6 (the help cascade — the valuable,
strategic part). `family-nudges` stays as its own cron but is **subordinated**: (a) it's now
governed by the family cap, and (b) it gains a coordinator-awareness guard — skip any family
with `last_coordinator_email_at` within the current cycle. Net effect: the coordinator wins
every collision; publish/completion only fire when the cascade had nothing to say. We get the
full arbitration benefit without rewriting the demoted machine. Rung 7 can be absorbed later
if it ever earns the investment (it's being demoted, so probably not).

### Rollout / safety

1. Land cap (Part 1), verify in `/admin/automations`.
2. Land coordinator with all rungs behind `?dry_run=true`. Validate selections against live
   data before any real send.
3. Add to `lib/crons/registry.ts` + `vercel.json` (drift guard requires both).
4. Flip the 6 connection-triggered crons OFF via `cron_config` pause (NOT code deletion —
   keep them pausable/revertible). Coordinator becomes the single sender for those rungs.
5. `family-nudges` stays ON but subordinated (cap + coordinator-awareness guard).
6. Rollback = unpause the 6 crons + pause the coordinator in `cron_config`. No deploy needed.

### Migration / schema

No new schema for the cap. Coordinator reuses existing metadata flags + adds
`last_coordinator_email_at` / `last_coordinator_rung` (free-form `connections.metadata` /
`business_profiles.metadata`, no migration). Migration 115 (self-report event type) still
must be applied before the outcome-check rung sends in prod.

## Track 2 — Option B build spec (locked 2026-06-29 with TJ)

**Decision:** Option B — *absorb the completion ask into the coordinator only*. Not the full
family-nudges rewrite (the original "don't consolidate" call at lines 270–282 still holds for
publish/recs/reengagement; it went stale only for completion, which became split-brained and
dominant). Full findings + the A/B/C analysis: Notion "Family Comms Track 2 — Consolidation
Design Report" (Branch Handoff Reports, 2026-06-29). Memory `project_family_comms_track2_consolidation`.

**Why B / the problem it fixes:** the "fill your profile" ask is sent by BOTH engines — coordinator
R6 `family_nudge` (~28.7/day, families *with* an inquiry) AND family-nudges `completion_nudge_1-4`
(~32.8/day, families by signup cadence) = ~61/day duplicated. The cap holds (≤3/7d), so this is a
**coherence problem, not volume**: ~2 families/day get two different asks the same day. B makes the
brain the single owner of completion.

### The four UX guardrails (non-negotiable success criteria — B's win is coherence, NOT fewer emails)
1. **One ask per family per moment** — never two emails same day (structurally guaranteed: one cron, one pick).
2. **Respect what they've already given** — never ask for a field we already have (use `humanizeFields` + completeness `missingFields`).
3. **Always value-exchange, never a naked ask** — "add your timeline so we can show better matches," never "your profile is incomplete" (already the locked v2 framing).
4. **Sensible decay, not a hard cut** — after the active sequence, drop to the existing low-frequency maintenance lane; don't keep hammering non-responders.

(We are NOT trimming completion volume on spec — 28% open at the 3rd touch is healthy, opens are noisy post-Apple-MPP. Trimming becomes a dial inside the unified track, turned later only if action-data — does the nudge drive completion — ever justifies it.)

### The unified completion rung (replaces R6)

A new lowest coordinator rung that fires for **all incomplete families, with OR without a connection**,
on **signup-relative cadence** (the answer to "how to reconcile state-based rungs vs day-offset
sequences": signup is the only universal anchor; a family with no inquiry has no connection clock).

- **Cadence + step-state: reuse the family-nudges helpers verbatim** — `getSequenceWithMigration(meta.completion_sequence, meta.profile_incomplete_reminder_sent)`, `shouldSendCompletionNudge(seq, created_at)` (cooldowns `[0,2,4,7]` = days 0/2/6/13, then 30d maintenance, cap +6), `completionNudgeSubject(n, …)`. Step-state stays in `business_profiles.metadata.completion_sequence` — **the SAME field family-nudges writes today, so in-flight sequences continue seamlessly across the cutover.**
- **Email types emitted: `completion_nudge_${n}` / `completion_maintenance`** (the redesigned creative), NOT `family_nudge`. **`family_nudge` (R6's type) is retired.** When the family also has a relevant inquiry, pass `providerName` / alternatives for richer copy, but the base ask is the completion template. Both types already in `FAMILY_NUDGE_EMAIL_TYPES` → no cap change.
- **Ported guards:** 4h post-signup grace; skip if active conversation (<7d connection activity) — guardrail-aligned.
- **Completion celebration (100%) moves too** — the whole completion lifecycle (active 1-4 + maintenance + celebration) lands in the coordinator so completion is single-brained. (Celebration is cap-exempt, ~1/30d.)

### Second candidate source (the real architectural lift)

The coordinator builds `fams` ONLY from `connections` rows today (route.ts:213–232) — a family with
no connection never enters the loop. B adds a second source:
- After the connection pass, fetch incomplete family profiles: `business_profiles` where `type='family'`, paginated (port `lib/providers/nudges.server.ts` query), `created_at <= now-4h`.
- `ensure(family.id)` so a family already bucketed via a connection is **merged, not duplicated**; no-connection families get a bucket with empty `inquiries/requests` + a profile.
- **GOTCHA: add `created_at` to `familySel`** (route.ts:184 — currently absent; cadence can't compute without it).
- Cost: completeness is a JS calc over ~738 families (cheap); the expensive calls (provider counts, alternatives) still run only after a rung is picked.

### family-nudges changes (subtractive)
- **Remove** the completion branch (route.ts ~806+) + the celebration branch (~745–798). 
- **Keep** monthly recommendations (published families), the publish sequence, re-engagement, post-connection follow-up.
- Keep the 20h coordinator-awareness guard (now mainly protects the publish track; with completion gone, coordinator↔family-nudges collisions drop near zero — publish=complete-unpublished and recs=published, neither of which the coordinator touches).

### Behavior change to flag
B means the coordinator will **start emailing families with NO inquiry** (pure profile-completion lifecycle) — a population it never touched before (that was family-nudges' job). Net volume should NOT rise (we move ~61/day → one decision, deduped), but the coordinator's footprint expands and family-nudges shrinks. Validate the selection mix in dry-run before promoting.

### Cutover / rollback
- One PR off `staging`. The coordinator runs daily, so the rung fires on deploy — validate FIRST via `?dry_run=true` against live data on the Vercel preview: confirm completion-rung volume ≈ old (R6 `family_nudge` + `completion_nudge`) deduped, and that no family is selected by the coordinator AND still eligible in family-nudges the same day.
- No env kill-switch (per `feedback_no_killswitch_for_slow_leaks`) — **rollback = revert the PR**. Both engine edits ship together so there's no completion-gap window.
- Spot-check a delivered completion email in a real inbox after first prod run (the still-open inbox-validation item).

### Open question still to settle before coding
- **Subject/template source when a no-connection family hits the rung:** `completionNudgeSubject` takes `providerCount/city/state` (no providerName needed) → works for no-connection families as-is. Confirm the completion template degrades gracefully with no `providerName`/alternatives (it should — those are the family-nudges path today, which has no connection context).
