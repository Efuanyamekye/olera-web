# Cortex activities

The register of what Cortex does for Olera, one row per activity. TJ listed these on 7 Oct 2026, the morning after the directory work went live, with the warning that "there will be tons of imperfections at first" and that what gets tuned is not only what Cortex does but how it talks, how it asks, what is autonomous, and how often. This file is where those settings live. Change a row here, then the code, then say so in `#cortex`.

`docs/cortex/POLICY.md` holds the fence (alone / asks / never) and the $0 ceiling. This file holds the activities the fence applies to.

## How a row works

Every activity has the same five parts, and an activity is not "built" until it has all five:

| Part | Meaning |
|---|---|
| **Signal** | Where the fact comes from. Our own tables first, then free APIs, then paid. |
| **Ledger** | The table or column each action lands in, with an undo where one is possible. |
| **Fence** | `alone` (does it, reports after), `ask` (proposes in `#cortex`, waits), `draft` (writes the words, a person sends), `off`. |
| **Cadence** | How often it runs and how often it speaks. Speaking less often than running is normal. |
| **Cost** | Per run and per month. Default $0. Model calls for words only. |

Tuning is a conversation, not a config. A reply in an activity's `#cortex` thread ("ask me first on renames", "weekly, not daily", "too chatty") is captured as a correction scoped to that activity and read on the next run. A thumbs-down on a Cortex post is a grade on that action; grades feed the "what would change this" rule in POLICY.md, in both directions.

## Status key

- **built** — all five parts exist and run in production.
- **partial** — the signal or the automation exists, Cortex's loop around it does not.
- **not built** — nothing yet.
- **blocked** — needs something only TJ can give (an account, an answer, a permission).

## The register

### Directory

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| Provider database auditing and quality check | built | Google status + name (free Pro tier, 5,000/mo + review refresh), website reachability sweep (Mac), `/data-sweep`, `/dedupe` | alone for archive / cosmetic rename / tier-1 out-of-scope / confident dupes; ask for the rest | status pass 15th, reviews 1st, sweep monthly from the Mac; digest daily if anything moved, state on Mondays | $0 directory, ~$125/mo review refresh (pre-existing) | CMS list diff, email bounces as a closure signal, a report-a-problem link on listings |
| New provider listings curation | partial | City pipeline (`scripts/enrich-city.js`, Mac-run) exists; no demand signal picks the city | ask (which cities), alone to run the pipeline once approved | monthly proposal | Places + Perplexity per city (state the number before each run) | A probe that ranks cities by searches with thin results, and the Mac runner to execute |
| Information gaps on provider pages, as an engagement hook | not built | Highlights waterfall already knows what a page lacks (`lib/provider-highlights.ts`); claimed profiles have the fields | draft (the "your page is missing X" note); sends go through the provider comms governance gate (cap 3/wk) | weekly list, drafts on request | $0 to find, Haiku for words | A SQL probe: claimed + high-traffic pages missing photos, hours, services, pricing; a ledger row per nudge |
| Social link addition | partial | `olera-providers.facebook_url` filled by the website sweep (migration 273) | alone (page render), PR for the code | once | $0 | Nothing renders the column yet. One small PR on the provider page. |

### Providers (relationships and growth)

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| Provider relationships management | partial | support@ threads (provider moments), touch log, Stripe renewals, Slack owed | draft; a person sends | moments in the brief daily; a relationship line weekly | $0 | A relationship ledger: per key provider, last touch, next touch due, open promise. Today it exists as scattered memory files. |
| Providers getting traction but not engaged | built 7 Oct | questions (slug), inquiries (profile → canonical id), views (slug), claim + claim event, actor events | report (the Monday list); draft on "draft <name>" | Mondays in the `providers` thread; cadence tunable | $0 (SQL) | The draft reply (slice 3 shares it). On 7 Oct: 111 claimed-and-silent, 920 unclaimed with demand, 40 claimed and active in 28 days. |
| Hyper-personal provider growth comms ("set up your owner profile") | partial | welcome / preview-nudge / dormant crons send templated email; the governance gate caps at 3/wk | draft for the first 20, then alone under the gate if TJ approves the sample | daily small batches | Haiku per note (under $0.01 each) | Model-written notes that cite the provider's own page and traffic; a sampled review step before autonomy |
| Managed Ads set up | partial | `ad_campaign_requests`, launch scheduler, the Google Ads SOP (Notion) | ask (spend is the provider's money; campaign creation is a browser task) | per request | ad spend, provider-funded | The Mac runner driving Google Ads through the browser; Cortex scopes the campaign from the SOP and asks |
| Managed Ads optimization | blocked | needs Google Ads API read access for live campaigns | ask (every change) | weekly read | $0 for reads | Ads API credentials. Until then, optimization is a human reading the dashboard. |
| Calibration expectations for conversion | blocked | — | — | — | — | Needs one sentence from TJ on what this is (expectations set with providers? internal targets?) |
| "Not a staffing agency" | blocked | jobseekers writing to support@ and arriving via ads (two of three Aug flight leads were jobseekers) | — | — | — | Needs one sentence from TJ: messaging on pages, a support@ auto-route, or both |
| Provider comms phase 2 (Chantel) | backlog | brief `3f0fa046` | ask | — | — | Parked on purpose; built when TJ changes the note |

### Families

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| Care seeker follow-up (connections) | built, Ces owns | family-comms coordinator, nudges, lead follow-up sequence, inbox operator (SMS replies proposed by number) | draft for replies; automations run alone under quiet hours + do-not-contact | twice daily pass | ~$0.20/day (inbox pass) | A gap probe: families whose provider never answered and who got no Olera reply in N days, posted to the right channel, not only Telegram |
| Care seeker follow-up (benefits) | built | navigator compose (hourly), companion follow-ups, texts digest, weekly Benefits probe | same as above | weekly probe line in the brief | pre-existing | Same gap probe, benefits side: finished the finder, no letter, no text |

### Growth and SEO

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| SEO auditing | built (performance), not built (technical) | daily organic read (GA4 + Search Console, Sonnet 5), deindexing diagnostic | report | daily | ~$0.05/day (organic read) | A technical audit: sitemap vs index coverage, 404s on linked pages, canonical drift, Firewall blocks on Googlebot/AdsBot. All free from GSC + our own crawl. |
| Press and media, led by Cortex | partial | journalist queries by email (Source of Sources, Qwoted, Featured, free tiers), trade reporters by name, Olera's own data | draft; a person sends; Cortex proposes, drafts, tracks, reminds | queries daily inside the inbox pass; one proposed story a month in a `press` thread | $0 platforms, model for words | `docs/cortex/PRESS.md` has the loop, facts and angles. Missing: the inbox (press@ alias), the `press` category in the inbox pass, a `cortex_press` ledger, the media list. Proof it moves the needle: Senior Housing News 23 Jan 2026 → Ziegler (Jenny Poth) → Magnify and Equitage intros. |
| Agent readiness (Muse, dots, Grok Bot) | partial | Vercel Observability bot names (chatgpt-user, claude-user, meta-webindexer), Firewall Traffic | report; firewall changes are TJ's | weekly line, Monday | $0 | 7 Oct: AI Bots rule Deny → Log, training crawlers denied by a custom rule. Next: weekly agent-traffic read, label on the inquiry email field, llms.txt aimed at tasks, Personal Agent Protocol when v0.1 ships, a Muse connector once there is a task. |
| SEO growth activities, identified and executed | partial | the organic read proposes one action a day → handoff brief | ask (the brief), alone to open the PR | daily proposal, build on approval | Sonnet for the read; $0 to build | The Mac runner. Proposals exist; nothing builds them without a person starting a session. |
| Drafted editorial articles for human review | partial | editorial system, article topics, organic read's page-family findings | draft; a person publishes | one a week | ~$0.30 per draft (Sonnet) | A topic picker fed by Search Console queries with no page, and the draft saved to admin content as unpublished |

### Founder

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| Founder priority reminders (grants, managed ads, benefits build-out, Aging in America) | partial | priorities in the brief, assigned-work clock, `docs/crp/living/` for grant dates | report | Monday, and the day before any dated milestone | $0 | A short priorities list with next milestone dates, read by the Monday post. Dates live in the file, not in the model's head. |
| Meeting preparation | partial | calendar (read-only, tj@olera.care), Wispr Flow meetings, support@ threads, touch log | report | the morning of, for external meetings | Haiku for words | A prep note per external meeting: who, last touches, open promises, the one question to ask. Posted in `#cortex` 2 hours before. |
| Meeting summaries | built, first run pending | Notion Meeting Notes → `war_room_source_items` → Haiku → channel | alone (words) | on each new note | Haiku per note | First Notion sync to land in prod; `CORTEX_MEETING_CHANNELS` mapping per meeting type |
| Investor prospecting and outreach | blocked | Affinity (MCP configured; connection failed on 7 Oct) | ask (prospects), draft (outreach), never sends | weekly | $0 reads | Confirm Affinity is the CRM of record; reconnect it; decide what "a prospect worth a line" means |
| Physical mailbox check-in | blocked | — | report | on each scan | $0 | Which service holds the mailbox, and whether scans arrive by email (then this is an inbox-pass category, not a new system) |
| Thinking outside the box | partial | the organic read's "out-of-the-box" line, War Room strategy | report, one idea | Monday, one idea, no repeats | included in existing reads | A rule: one idea per week, each one graded by whether TJ reacts, ideas that got no reaction are not re-proposed |

### Product development

| Activity | Status | Signal | Fence | Cadence | Cost | What is missing |
|---|---|---|---|---|---|---|
| Provider page design by category type | approved | brief `858c51f4` (home care first) | ask (PR), never merges | — | $0 | A /handoff session or the Mac runner |
| AI agent function optimization (Muse, Dot, Grok bot) | blocked | — | — | — | — | These names are not in the repository. Needs one line each from TJ on what they are and where they run. |
| Scope and open PRs for product changes in general | partial | approved briefs in `cortex_handoffs` | ask (PR) | on approval | $0 | The Mac runner (`scripts/cortex-runner.ts`), blocked by the auto-mode classifier on 6 Oct; TJ to allow via a permission rule or build by hand |

## Order of work

Free and already-measured first. Each row is one slice, one PR, one thread.

1. **The tuning loop.** Built 7 Oct: a founder reply in an initiative thread sets cadence, a fence, or a lesson (`cortex_tuning`); the directory reads its fences on every observation and its cadence every morning; reactions become grades once the Slack app has `reactions:read` and the `reaction_added` event. This register is in Cortex's written-record allowlist.
2. **Traction but not engaged.** Built 7 Oct: Monday post in the `providers` thread, two lists (claimed and silent, unclaimed with demand), counts beyond the names. Feeds relationships, hyper-personal comms, and the information-gap row.
3. **Information gaps on claimed, high-traffic pages.** SQL plus the highlights waterfall.
4. **Press, led by Cortex.** Queries into an inbox Cortex reads, a `press` category with pitch drafts and send-on-approval, a ledger, the first proposed data story. TJ's ask of 7 Oct; the January article is the proof.
5. **Meeting preparation.** Calendar and touches already exist; only the morning note is new.
6. **Founder priorities with dates.** Monday post.
7. **Social links on the page.** One small PR.
8. **Technical SEO audit.** GSC plus our own crawl.
9. **Gap probes for families** (connections and benefits), posted to the channels Ces reads.

Then the rows that need something from TJ: the Mac runner, Ads API access, Affinity, the mailbox service, and a sentence each on calibration, "not a staffing agency", and the three agent names.

## What would change this

Any activity that posts three times and gets no reaction is moved to weekly. Any `ask` whose answer is "yes" ten times in a row without an edit is a candidate for `alone`, proposed in its thread. Any `alone` action undone twice goes back to `ask`. Say so in `#cortex` when a row changes.
