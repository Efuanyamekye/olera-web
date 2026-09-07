# Olera Marketplace — Implementation Audit and Business Model

Companion to `ARCHITECTURE-SKETCH.md`, which is treated as locked. This document answers two
separate questions: **how does the system actually work today**, and **how does the business make
money without damaging it**.

Every implementation claim below is grounded in the code. Findings are classified **EXISTS ·
PARTIAL · STALE · MISSING · UNCLEAR**, and current state is kept strictly separate from
recommendation.

---

# Part 1 — Implementation audit

## 1.1 Status by step

| Step | What is actually there | Status | Biggest gap |
|---|---|---|---|
| **FS1** referral | Nothing | MISSING | No partner object, no attribution |
| **FS2** organic | Provider, city, editorial, program pages; SEO pipeline | EXISTS | — |
| **FS3** paid ads | Ad Boost drives families to a provider's page | EXISTS | Provider-funded, so coverage follows spend not need |
| **F1** entry surface | `/[category]/[state]/[city]`, provider pages, `/caregiver-support/*`, `/benefits/*`, `/browse/*` | EXISTS | No per-surface conversion view |
| **FQ** question | `POST /api/questions`; guest **name and email optional**; `question_email_enriched` recovery | EXISTS | An anonymous asker is unreachable and never becomes a family |
| **F2a** benefits CTA | `BenefitsDiscoveryModule*` → `save-results` → `/m/{token}` living plan | EXISTS | Token-auth only; invisible to `/portal` |
| **F2b** connection card | `components/providers/connection-card/` — default → intent → email_capture → enrichment → connected | EXISTS | Fires the inquiry **before** the profile exists |
| **F2c** live profile | `POST /api/care-post/publish`; Find Families surfaces it | PARTIAL | Exists as a portal action, not as a CTA on entry surfaces |
| **F3** family profile | `business_profiles` type=`family`; `metadata.care_post`; two enrichment flows — 6 step from a provider page, 3 step from benefits (`EnrichmentSource`) | EXISTS | The **plan** it should produce is aid-only |
| **CR-F** | No role, no surface | MISSING | Human help exists only as TJ approving navigator letters |
| **P1** listed | Directory-seeded `business_profiles` type=`organization`, `claim_state: "unclaimed"`; **created on demand** by `/api/connections/request` when a lead needs a target | EXISTS | — |
| **PS1** organic | Self-serve create → onboarding wizard; `source: "user_created"`, claimed from birth | EXISTS | No measurement of this path |
| **PS2** referral | Nothing | MISSING | — |
| **P2** outreach | `OUTREACH_STAGES` (10), 4 emails / 7 days, follow-up calls, city broadcasts, re-engage, not-interested reasons | EXISTS | Strongest machine in the system |
| **P3** claim or create | Signed 72h token in every lead / question / review email; `claim/finalize` advances the stage to `claimed`; two-tier trust (full by token, **Trusted by phone call**) | EXISTS | — |
| **CR-P** | No role, no surface | MISSING | Provider follow-up calls happen inside P2 only |
| **A1** matched | `lib/benefits/eligibility.server.ts` — filters on state, age, income band, Medicaid, veteran; 4 categories | EXISTS | Two program universes joined by name, not key |
| **A2** application | `benefits_cascade.application_status`: called · no_answer · needs_docs · applied · waiting · not_eligible · stuck | EXISTS | Self-reported by SMS/email |
| **A3** aid established | — | **MISSING** | The ladder stops at *applied*. We can never say a family got it |
| **B1** matched | `connections` type `inquiry` \| `request`; `connectionRequestEmail` | EXISTS | — |
| **B2** qualified | `lib/connection-temperature` — provider responded = non-auto thread message; successful = responded **or** accepted | EXISTS | Off-platform response invisible without a sensor |
| **B3** care established | Two one-tap sensors: family *"did they get back to you?"*, provider `client \| talking \| no` | PARTIAL | Self-report only; no independent confirmation |
| **FO1/FO2** | `FamilyOutcome` = connected · active · guided · stalled (7-day window) | PARTIAL | Aid outcome not represented |
| **PO** | `ad_lead_outcome_reported` event | PARTIAL | No value quantification of any kind |

## 1.2 The dimensions, across the whole system

**Technology.** Next.js App Router; Supabase (Postgres + Auth + RLS); Resend for email; a full SMS
stack (`lib/sms/*` — consent, channel policy, quiet hours, `sms_queue`, flush cron, crisis
detection, inbound intent parsing); Stripe for Ad Boost; ~40 Vercel crons. **No scheduling
integration on the marketplace side** — Calendly exists only in MedJobs.

**Authentication.** Supabase Auth for accounts. The load-bearing mechanism is not passwords: it is
**signed claim tokens** (`lib/claim-tokens.ts`, HMAC-SHA256, 72h, `action: lead | question | review`)
that log a provider in from an email in one click. Families reach their aid plan through a different
mechanism again — `/m/{token}`, where *the token is the auth, no login wall*. **Three identity
models coexist**: account, provider claim token, family plan token.

**Instrumentation.** Two event spines — `provider_activity` and `seeker_activity` — with a wide
event vocabulary (`lead_received`, `lead_opened`, `claim_completed`, `connection_outcome_reported`,
`benefits_completed`, `profile_published`, `matches_activated`, and more). This is genuinely strong.
The gaps are at the ends: **no A3, no PO value, no per-surface F1 attribution, no referral source**.

**Human operations.** Provider follow-up calls (P2 `needs_call`), Trusted-tier verification by phone,
TJ approving every navigator letter before it sends, Ad Boost campaign setup. No family-side human
role exists at all.

**Communications.** Transactional and outbound email is mature. SMS is mature **but pointed at the
benefits journey, not at the marketplace connection flow** — no SMS reaches a family about a provider
connection, and none reaches a provider at all.

**First-time vs returning.** A returning **family** with an account gets `/portal/inbox` (messages),
`/portal/profile` (their profile and care post), `/portal/discover/providers`. They cannot see their
aid programs there. A returning family *without* an account has only their `/m/{token}` link. A
returning **provider** gets one-click back in from any notification email, indefinitely, without ever
setting a password.

**Privacy and consent.** PHI discipline is real and deliberate — the lead email subject never carries
the family's name (*"A family in {city}…"*), and `connectionRequestEmail` carries **no family email
and no phone**. SMS is consent-gated with quiet hours by recipient timezone.

**Error and fall-through states.** `needs_email` queue for undeliverable leads; email pre-verify and
deliverability-watch crons; `provider-still-silent` (7 days) and `conversation-stale` (5 days) crons
catch stalled connections. Family profile deletion soft-deletes connections rather than hard-deleting
(fixed 2026-05-30).

## 1.3 The five findings that matter most

**1. The inquiry precedes the profile.** F2b creates the connection and emails the provider on three
fields — recipient, care type, urgency — and only then offers enrichment. The first provider to
receive a family gets almost nothing. *(EXISTS, by design; it is a friction trade.)*

**2. A3 does not exist.** The aid ladder ends at *applied*. We can report that a family applied and
never that they were approved. Track A therefore has no measurable outcome. *(MISSING.)*

**3. Care established is entirely self-reported.** Two one-tap sensors and nothing else. There is no
independent confirmation and probably cannot be one — but it means PO is unmeasurable today.
*(PARTIAL.)*

**4. `/provider/pro` contradicts the stated principle.** The page pitches **Priority Search
Placement**, **Unlimited Lead Responses**, **Unlimited Match Reach-outs** and **Contact Info
Visible**. It is routed and linked from `Navbar` and `ConnectButton`. **I could not find any code
enforcing these limits** — no lead cap, no response throttle, no ranking boost. It appears to be
unshipped marketing copy for a pay-to-participate model. *(STALE — and the single most important
thing to resolve before the business model hardens.)*

**5. One live paywall exists, and it is on the right side of the line.** `POST /api/review-requests`
returns **402** past `FREE_REVIEW_CREDITS` unless `metadata.medjobs_subscription_active`. Review
requests are **not** on the Track B path, so a family's ability to reach a provider is unaffected.
The oddity is that a **MedJobs** subscription flag gates a **marketplace** feature. *(EXISTS;
cross-system coupling worth cleaning.)*

## 1.4 Alternate paths — verified behaviour

| Path | Actual behaviour | Status |
|---|---|---|
| Partial family payload | Track B starts anyway; F2b is the default entry | EXISTS |
| Direct Track A entry | Benefits CTA → `/m/{token}` plan without any provider | EXISTS |
| Direct Track B entry | F2b → connection created before enrichment | EXISTS |
| Question with no contact | Question posts, provider is notified with a claim link, **family is unreachable** | EXISTS |
| Referral-partner family | — | MISSING |
| Unclaimed provider receives family activity | Lead is delivered; the record is **created if absent**; the email carries the claim link | EXISTS |
| Provider self-creates | `source: "user_created"`, `claim_state: "claimed"` from birth, into the onboarding wizard | EXISTS |
| Returning family | Portal inbox/profile; aid plan only via token link | PARTIAL |
| Returning provider | One-click from any notification email, indefinitely | EXISTS |
| Provider in Track B before completing the provider funnel | Normal and common — nothing gates delivery on claim state | EXISTS |

---

# Part 2 — Monetization

## 2.1 The principle already has precedent in the code

Ad Boost is described in `lib/ad-boost/billing.server.ts` as *"flat and ALL-IN (ad spend + setup +
management bundled — **never an itemized service fee, never per-lead**)"*, and the apply flow
deliberately does not ask for a tier — *"every request starts as the free intro"*. MedJobs went
further: *"the credit / $49-subscription paywall was removed"*, replaced by a free 90-day pilot.

**Twice already, when forced to choose, this company removed the gate.** The principle being
wrestled with is not new — it is the pattern of the last two product decisions. What is missing is a
statement of it, and the removal of `/provider/pro`, which contradicts it.

## 2.2 Value creation, measurement, monetization — kept separate

**Value created by the free network**

*Families* — a route to providers who answer, and an aid plan they would not otherwise assemble.
*Providers* — qualified local demand at zero cost and zero effort, plus a claimed profile and
reviews. *Olera* — the demand data, the provider relationship, and the traffic position.

**What Olera can already observe**

Family traffic by surface · inquiries created · provider opened the lead · provider responded
(non-auto thread message or accepted) · time to respond · family self-report that the provider got
back to them · provider self-report `client | talking | no` · benefits application status · outreach
stage and claim.

**What Olera cannot yet observe** — whether care was actually established, its value, whether aid was
secured, and anything about provider capacity.

**Where money can attach without touching Track A or Track B**

| Product | What it is | Why it does not gate the network |
|---|---|---|
| **Ad Boost** *(exists)* | Flat monthly, all-in, provider-funded acquisition to their own page | Adds families to the market; withholds none |
| **Growth services** *(proposed)* | Lead follow-up, conversion coaching, profile and SEO work, reputation | Sold on the strength of leads the provider already received free |
| **Reviews and reputation** *(exists, capped)* | Review request volume above a free allowance | Not on the connection path |
| **Provider analytics** *(proposed)* | The value dashboard in 2.3 | Measuring what already happened |
| **MedJobs staffing** *(exists, free pilot)* | Caregiver recruitment | A different need entirely |

**The model that follows:** free network → measurable provider value → a relationship with evidence
→ optional products sold against a number the provider already believes. Not: free network →
paywall.

## 2.3 Provider Outcome should become a number, and that is the whole monetization engine

Today PO means *a lead arrived*. The sequence worth building:

**leads received → responded → families talked to → care established → estimated annual value →
compared to the market.**

Every step except the last two is already instrumented. The two missing pieces are the B3 sensor
answer made durable per provider, and a value estimate — care type × typical duration × typical
rate, stated as an estimate and never as a claim.

This matters commercially more than any feature: **a provider who can see "Olera sent you 14
families, you answered 9, 3 became clients, roughly $78,000 of annualised revenue, at no cost"
is a provider who will buy growth services.** The dashboard is the sales asset. It also makes the
anti-kickback question moot for the core product, because nothing is charged per referral.

## 2.4 What I would not do

**Do not ship `/provider/pro` as written.** Priority search placement distorts family matching for
money — the exact thing to avoid. Unlimited lead responses and unlimited match reach-outs imply a
throttle on free providers, which is pay-to-participate. Contact-info-visible means hiding a
provider's phone number from a family until the provider pays, which harms the family to create
leverage. Either delete the page or rewrite it around growth services.

**Do not price per placement or per referral** for the core connection, on both principle and
regulatory grounds — see the anti-kickback note in the architecture history. Flat, non-contingent,
optional.

---

# Part 3 — Family/Provider ↔ MedJobs

## 3.1 What is already shared, and what is not

| | Status |
|---|---|
| Provider identity — `business_profiles` | **SHARED.** MedJobs client routes read the same table |
| Access model | Both now free at the point of use |
| Outreach CRM | **NOT SHARED.** `provider_outreach_tracking` (marketplace) and `staffing_outreach` (MedJobs) are separate tables with separate stage vocabularies |
| Event history | `provider_activity` covers both, and already carries MedJobs event types |
| Email infrastructure | Shared |
| Human relationship | Two separate teams by default; no shared record |
| Billing | `medjobs_subscription_active` already gates a **marketplace** review feature — an accidental coupling |

**One provider, two pipelines, no shared relationship record.** That is the integration gap, and it
is one table away from being closed.

## 3.2 The signal each system holds for the other

**B2 failure is a staffing signal.** A provider who receives families and does not respond, or
responds and does not convert, is often at capacity — the single most valuable MedJobs lead in the
system, and today it is invisible to MedJobs. *(Not instrumented.)*

**MedJobs placement is a Track B capacity event.** A provider who just hired two student caregivers
can take families they refused last month. Nothing tells the marketplace side.

**CR-P should own both.** The provider experiences one Olera relationship. A quarterly conversation
that covers *families received, care established, and whether staffing is the constraint* is one
call, not two, and each half makes the other more credible.

## 3.3 The cross-system dashboard

One provider view: **families sent · answered · care established · estimated value** alongside
**roles open · candidates introduced · hires · shifts worked**. The first sells the second; the
second improves the first.

---

# Summary — three lists, kept apart

**What exists today.** Both CTAs and the question · continuous enrichment with two source-specific
flows · the aid matching engine and application ladder · the full provider outreach machine ·
one-click claim · the connection state machine and temperature model · two event spines · a mature
SMS stack pointed at benefits · Ad Boost as a flat non-per-lead subscription · a free-at-point-of-use
MedJobs pilot.

**What we should build.** A3 aid-secured · the provider half of the family plan · the PO value
dashboard · CR-F and CR-P as defined roles with a shared provider relationship record · referral
partners (FS1, PS2) · a canonical aid-program id · SMS on the marketplace connection flow · a single
family home that shows both tracks.

**What business model we should test.** Free core network, permanently and explicitly. Provider value
made visible as a number. Optional paid products sold against that number — growth services first,
because they attach to leads the provider already received free. MedJobs as the second product in the
same relationship. Delete or rewrite `/provider/pro`. Never price the connection itself.
