# Build Olera into the agent-callable layer for senior care

> Mirror of the canonical Notion doc: https://www.notion.so/Build-Olera-into-the-agent-callable-layer-for-senior-care-3555903a0ffe81e18e63f566794560a6
> Owner: TJ. Status: To Do. P1.

## Frame

We're moving into a future where most people use AI to find information and do things for them. Senior care is no exception. Families already arrive at Olera through ChatGPT — 4/day organic, zero effort on our part. The question is what happens next. Does their AI bring them to olera.care as a destination, or does it use Olera as a tool to do the work without the family ever landing on our pages?

The bet is both can be true. Olera becomes the data and the functions AI calls when a family is making senior care decisions. Whether the AI is one we ship or one the family already has, the source of truth is ours.

## Two routes, same underlying primitives

**H1. Olera-hosted agent.** Family lands on olera.care. We ship an AI that does outreach, finds matches, runs the application paperwork. They never leave our surface.

**H2. Bring-your-own-AI.** Family uses ChatGPT, Claude, or Gemini. Their AI calls Olera (MCP, ChatGPT App, REST). Olera is the data and the functions. The family's AI does the work.

Both routes hit the same primitives. Search providers, save lists, send connection requests, ask questions, find benefits, get the family profile. The difference is who's driving.

## Why both

H1 is fast feedback, capped audience. Conversion is visible in the existing funnel. We learn whether the Olera-hosted agent does work that families pay attention to.

H2 is slow feedback, uncapped surface. The capability compounds. Long-tail content compounds.

Zapier ranks for thousands of "how to connect X to Y" searches because they wrote articles for them. We can do that for senior care. "How to apply for Medicaid for a parent in Texas using ChatGPT and Olera." "How to use Claude to compare home care providers in your zip code." Each article is a single thoughtful resource on a specific intent. We don't try to volume-out high-DA competitors. We be one of one. Quality wins where DA can't.

Take the Medicaid example. State portals are not AI-friendly. ChatGPT alone cannot fill them out. ChatGPT plus Olera can. Walk eligibility, pre-fill what's structured, generate the family's responses, hand off the package for the family to submit. The family is still the applicant. Liability is clean.

## Long-term thesis

Olera is the structured family memory layer for senior care. Agents read AND write to it. Bring-your-own-AI works because the source of truth lives with us. A stand-alone AI cannot do cross-session continuity. We can.

This is a 6-to-12 month bet on positioning. The build itself is fast. What we ship below serves the longer arc.

## What we ship now

Three categories, running in parallel on different clocks. All TJ-owned. Cess and Graz available for CS escalation if a family follows up.

### Capture work for H2 — a few hours

ChatGPT, Claude, and Gemini already cite Olera. ChatGPT is sending us about 4 visits a day organically. We did nothing to make that happen, and we've done nothing to optimize for it. This closes the gap.

- **llms.txt at the root.** A curated map of our site (browse, SBF, top cities, top benefits) that AI agents read to understand what we offer. The AI-equivalent of a sitemap.
- **JSON-LD on key pages.** Structured metadata on SBF results pages and provider pages. Tells agents what each page is in machine-readable form. Benefit, provider, price, rating. So they can quote it accurately when a family asks.
- **AI-referral instrumentation.** Tag visits from chatgpt.com, claude.ai, and gemini.google.com as a distinct source in analytics. Without this, AI traffic blends into "direct" and we can't measure it.

### Olera-hosted outreach module for H1 — a day

Tests whether families want an Olera AI doing provider outreach for them. Ships as the 4th arm of the SBF intake A/B test on provider pages. Random djb2 4-way split. 25% of visitors. Head-to-head with the 3 existing benefits arms. De-anchored from benefits. Different module, different surface, no SBF reuse.

**What families see.**
Every visitor to a provider page lands in one of 4 versions of the page (random assignment, sticky for 30 days). 25% land in each version.

- 75% see one of three versions of the benefits intake module (the SBF A/B test that's already running — availability / loss / empathic copy variants)
- 25% see a new module on the Q&A surface instead — the "Have an AI agent contact the top providers in [city] for you" pitch

For the 25% in the outreach arm, the SBF intake doesn't show. Instead, on the section of the provider page where families ask questions, they see this module. The most engaged moment is right after they submit a question, when they're already looking at that part of the page.

What the module looks like:

> **Have an AI agent contact the top providers in [city] for you**
> *We'll get pricing, intake, and availability from these 3 providers. No phone calls.*
>
> *[Card 1] [Card 2] [Card 3] — horizontal scroll. Each card shows a real provider's photo, name, rating + review count, one trust signal (e.g. "State Licensed"), and city.*
>
> *[email input]  [submit button]*
>
> *After submit: "Got it. We'll reach out within 24 hours."*

The 3 providers shown are the top 3 in the same city and same care category as the page the family is on, excluding the current provider. If fewer than 3 exist in that city, we pull from nearest cities and label each card with its city. If 0, the module hides entirely. We never pad with fake or off-category providers.

Clicking a mini card deep-links to that provider's page, so the family can browse without committing to outreach.

**What we capture and how TJ acts on it.**
When a family submits an outreach request, we log it to a database table (audit + measurement) and fire a Slack alert with everything TJ needs to do the outreach manually:

- The family's email (the To: address)
- The full question text they typed
- A link to the provider page they were on
- The names and Olera detail page links for each of the 3 target providers
- City and care category

TJ acts on the Slack alert directly in Claude Code. No admin UI. No status tracking enforced — if TJ marks something handled, he replies in the Slack thread informally. 24h SLA is the commitment we make to the family.

The database row exists for measurement (count of submissions per arm) and audit (which 3 providers we showed). Status tracking is deferred. For now, low volume means TJ has the bandwidth.

**Admin analytics.**
The existing SBF intake funnel table on /admin/analytics gets a 4th row labeled "outreach." Funnel for the outreach arm is just two steps: visitors who saw the module → visitors who submitted email. That single conversion number is comparable to the email-capture step in the 3 benefits arms, which lets us read demand head-to-head.

**Implementation notes for the engineer.**

- **Variant infrastructure.** Extend `lib/analytics/variant.ts`. `IntakeVariant` becomes `"availability" | "loss" | "empathic" | "outreach"`. New `assignIntakeVariant(sessionId)` does djb2 mod 4. Existing benefits-variant consumers migrate.
- **Surface allocation.** When `assignIntakeVariant` returns `"outreach"`, hide `BenefitsDiscoveryModule` on the provider page and render the new `AgentOutreachModule` on the Q&A surface (`QASectionV2`).
- **Provider lookup.** New lib function `getTopProvidersByCityAndCategory({ city, state, category, excludeProviderId, limit })`. Composite ranking: `claimed_status_weight × rating × log(review_count + 1) × highlights_completeness`. Cache by `(city, state, category)` for 10 minutes.
- **Backend.** New table `agent_outreach_requests` (id, seeker_user_id, seeker_email, source_provider_id, city/state/category, question_id, question_text, target_provider_ids, status, created_at). Migration `064_agent_outreach_requests.sql` ALSO extends the `seeker_activity` event_type CHECK constraint with new event types (`outreach_module_impression`, `outreach_card_clicked`, `outreach_request_submitted`). App allowlist + DB CHECK must match or every insert fails silently. Burned 7h on this on 2026-04-29.
- **API.** `POST /api/outreach/request`. Validates email + rate limit (3/email/hour) + honeypot. Inserts row. Logs event. Fires Slack via `slackOutreachRequestSubmitted` helper.
- **Reuse.** Image fallback infra (PR #670), highlights system (`lib/provider-highlights.ts`), provider-card data shape (`businessProfileToCardFormat`).

### Medicaid guide (article + video) for H2 content — a few days, TJ writes and records

One topic, two formats. Article + YouTube video. Founder voice. Title direction: "How to apply for Medicaid for a parent in Texas using ChatGPT and Olera."

The angle is TJ as the AI-use expert and Olera as the real-world tool layer. The guide walks a family through actually doing the thing — applying for Medicaid for an aging parent — by combining ChatGPT for the AI orchestration and Olera for the structured benefits and provider data. The article goes deep on the written walkthrough. The video shows it happening on screen. Texas because that's where our coverage is deepest.

The competitive bet is being one of one. No other article OR video on the internet walks through Medicaid application for senior care using ChatGPT and a structured tool. Article ranks on Google. Video ranks on YouTube and gets cited by AI agents that browse video sources. Different algorithms, different distribution, same one-of-one bet. If either ranks and converts, we know how to do another. If neither ranks, we cap the bet at one article + one video and don't pour into the vertical.

Each format ships on its own clock. ~30-day rank lag starts when the content goes live, not when the engineering ships. Article and video can ship at different times.

## Read the signals — 30 to 90 days

Two signals determine whether to invest in scaling. Each maps directly to a route. They measure usage, not revenue.

1. **Outreach arm email capture (H1).** When a family submits a question on a provider page, the new outreach arm shows them a module offering "let an AI agent contact the top 3 providers in your city for you." Today's soft enrichment modal in that same spot ("get notified when they reply") captures email from 3% of question-askers. The new outreach arm needs to roughly double that, 6% or higher. Says families want an Olera-hosted agent doing the work.

2. **AI referrals + Medicaid content ranks (H2).** ChatGPT sends about 4 visits a day organically right now. We need 10 a day or more after the capture work ships. Plus the Medicaid article OR video (or both) needs to rank in its 30-day window and convert visitors into provider-page sessions or SBF starts. Says agents are reading Olera and content can amplify that.

Scale whichever route signaled. 2 of 2 = build both. 1 of 2 = build the one that did. 0 of 2 = defer.

## Scale what works — conditional

If the gate opens, here's the shape. Architectural choices serve the long-term thesis.

- **If H1 only:** build the real Olera-hosted agent. Reply routing. Provider ranking model. About a focused week.
- **If H2 only:** MCP server + ChatGPT App + REST/OpenAPI. Per-user OAuth. Tool surface. Editorial content scales from 1 article to dozens. About a focused week of engineering plus ongoing content production.
- **If both:** 2+ weeks of engineering plus an editorial production owner who doesn't exist today. The shared backend (search, save, connect, ask, find_benefits, family profile) gets built once and serves both modes.

## Risks

- **R1. Provider page latency.** Adding a 3-provider query on every page load is a high-traffic surface. Cache by (city, state, category) for 10 minutes.
- **R2. Image bandwidth.** 3 extra images per outreach-arm impression. Lazy load + LQIP placeholder. Reuse PR #670 fallback.
- **R3. Wizard-of-Oz capacity overflow.** ~46 questions/week today. Even 20% pickup is ~10 outreach/week. Within TJ + Claude Code throughput. Monitor.
- **R4. PHI in Slack.** Channel team-restricted. Full question text in body is acceptable. Never in subject lines or push.
- **R5. The 3 providers shown might not be the right 3 to actually contact.** TJ curates manually anyway. target_provider_ids stored as audit trail. TJ can substitute at fulfillment.
- **R6. Rate-limit edge case.** Monitor first week. Raise to 10/hour if legitimate users hit it.
- **R7. Migration silent failure if app allowlist and DB CHECK don't match.** Task 1 couples them. Pre-test review re-checks.
- **R8. Email collection without delivery harms trust.** TJ owns the SLA. If we can't fulfill in 24h, fallback email gives the seeker the 3 phone numbers directly.
- **R9. Provider reply rate uncertain.** OpenClaw 0.5% is the floor. Per-email curated by TJ + Claude Code beats automation here.
- **R10. Variant volume dilution.** At ~1000 visitors/day, 250/arm/day is plenty for signal at 30 days.
- **R11. Neither article nor video ranks.** Olera's domain authority is ~5 and Google has been actively pruning thin programmatic content from low-DA sites. YouTube's algorithm is its own thing but TJ has prior experience ranking videos there. The mitigation is being one of one in both mediums — we don't volume-out competitors, we make a single article and video that are genuinely the best on a specific intent. If either ranks, we know the playbook works. If neither does, we cap the bet at one article + one video and don't pour into the vertical.
- **R12. H2 content gets indexed but doesn't drive install or use.** We need install + use telemetry from day one of any scaled-up agent-callable build. Without it we can't read the long-tail experiment.

## Where the gate eventually goes

Don't decide today. Watch how usage forms. Put the gate where it's logical. Candidate gates per route, for the record.

For H1, family subscription for unlimited Olera-agent runs. Pro provider placement in Olera-agent rankings.

For H2, API tier (free X calls/day, paid more). Paid-Pro placement in agent-callable rankings. Family subscription for cross-AI sync of Olera memory layer.

The right gate becomes obvious when usage signal is loud. We don't gate before then. Resend / Airtable / Fathom Loops playbook.
