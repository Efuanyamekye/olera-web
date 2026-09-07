# MedJobs 2.0 — Master Implementation Inventory

> Everything required for the operating system to function, mapped to the stages that need it.
> **The architecture determines what is listed here.** Technology that exists but serves no stage is
> listed only in §3, as a stale candidate.
>
> **Exists?** ✅ appears built · ◐ partial · ✖ not found · 🗑 exists but likely stale

---

## 1. Interfaces

### Provider-facing

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Public MedJobs / providers page | PR-OUT | ✅ | Landing target for cold email |
| Magic-link landing | PR3 | ✅ | Provider link is multi-use, email-bound, expiring |
| Eligibility screener | PR3 | ✅ | Captures demand shape; today also gates board access |
| Welcome banner and first-run state | PR3 | ✅ | |
| Profile / hiring-needs form | PR3 | ◐ | Confirm it captures the staffing need as structured data |
| Candidate board and candidate detail | MA1 | ✅ | Includes a match line |
| Invite-to-interview flow | MA2 | ✅ | |
| Interview calendar | MA2 | ✅ | `.ics`, no in-product video |
| Offer + internship agreement | MA3 | ✅ | |
| **Six-shift confirmation** | MA4 | ✖ | Nothing exists |
| **Invoice / payment view** | MA5 | ✖ | Legacy billing portal serves a different model |
| Ongoing support / next-need surface | PR3 loop | ✖ | |

### Student-facing

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Public opportunity page | ST3–ST7 | ✅ | |
| Student eligibility screener | ST8 | ✅ | Two questions; front door, not qualification |
| Application, full and partial | ST8 | ✅ | Confirm resume-after-leaving works |
| Document, photo and video upload | ST8 | ✅ | |
| Student agreement | ST8 | ◐ | Sample PDF placeholder |
| Student portal — profile, jobs, interviews | S7–S13 | ✅ | |
| Qualification outcome view | QUAL | ◐ | Confirm the student is told the outcome |
| Interview accept flow | MA2 | ✅ | |
| Offer accept flow | MA3 | ✅ | |
| **Shift log** | MA4 | ✖ | Only if the shift mechanism chooses this option |
| Post-hire support surface | MA4+ | ✖ | Where pay, experience and recommendation are tracked |

### Partner-facing

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Partner portal, token-authenticated | ST3–ST7 | ✅ | Activate, colleague, event, message routes |
| Distribution evidence capture | ST3–ST7 | ✅ | Not attributed per channel |
| Ready-to-send copy per channel | ST3–ST7 | ✖ | The partner should only have to forward |

### Internal — Admin Team

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Sites and service-area computation | PR1 · ST1 | ✅ | |
| Provider prospect list and materialization | PR1 | ✅ | |
| Partner prospect list and sourcing | ST1 | ✅ | |
| Contact enrichment | PR1 · ST1 | ✅ | |
| Pre-flight checklist | PR1 | ✅ | |
| Calls queue and log modal | PR-OUT · ST-OUT | ✅ | |
| Emails queue and reply classifier | PR-OUT · ST-OUT | ✅ | Depends on the Smartlead webhook |
| Follow-up queue and bulk re-engage | PR-OUT · ST-OUT | ✅ | |
| Sequence launch | PR-OUT · ST-OUT | ✅ | |

### Internal — Sales Lead

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Meetings queue | PR2 · ST2 | ✅ | |
| Pre-meeting brief — who they are, what they said | PR2 · ST2 | ◐ | Drawer timeline exists; confirm it reads as a brief |
| Log meeting modal | PR2 · ST2 | ✅ | |
| Commitment capture | PR2 · ST2 | ◐ | Notes exist; not structured |
| Agreed-channel capture | ST2 | ✖ | ST3–ST7 begin without a defined scope |

### Internal — User Success Manager

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Clients queue | PR3 | ✅ | |
| Partners queue | ST2–ST7 | ✅ | |
| Candidates queue | ST8 · QUAL | ✅ | |
| Step boards — business profile and site | PR3 · ST3–ST7 | ✅ | |
| One view of everything she owns | all | ✖ | Currently spread across queues |
| Stalled-entity view — what is stuck and for how long | all | ✖ | |
| Placements approaching six shifts | MA4 | ✖ | |
| Channel attribution for a student | ST3–ST8 | ✖ | |
| Billing tracker | MA5 | ✖ | |

---

## 2. Platform capabilities

### Authentication and access — think through per role

| Role | Method today | Question for the audit |
|---|---|---|
| Provider | Magic link, email-bound, multi-use, expiring · Supabase auth | Does a returning provider get back in without friction weeks later? |
| Student | Supabase auth — Google OAuth and email OTP | Is the path from application to portal continuous, or does it break? |
| Admin Team | Admin auth via middleware | Do they have exactly the access the job needs? |
| Sales Lead | Admin auth | Does he need a lighter, meeting-shaped surface rather than full admin? |
| User Success Manager | Admin auth | Same question, plus: does she see both sides in one place? |
| Partner | Portal token | Does the token survive a term? Who reissues it? |

> **One internal role today, three internal jobs.** Confirm whether a single admin role is adequate or
> whether the Sales Lead and User Success Manager need distinct surfaces and permissions.

### Statuses, events and history

| Component | Exists? | Note |
|---|---|---|
| Outreach statuses and derived stages | ✅ | Stakeholder and provider side |
| Immutable touchpoint log | ✅ | The basis of the CRM's history |
| Polymorphic tasks — sites, business profiles | ✅ | |
| Unified completed-work feed | ✅ | Merges touchpoints and task completions |
| Placement states | ✅ | offered / accepted / confirmed / declined / cancelled / completed |
| **Single longitudinal history per provider** | ◐ | Exists across CRM surfaces; confirm it spans PR1 → MA5 |
| **Single longitudinal history per student** | ◐ | Confirm it spans ST8 → MA4 |
| **Manual-event capture** — a human records something done off-platform | ◐ | Log modals cover outreach; nothing covers MA4 or MA5 |

### Communications infrastructure

| Channel | Exists? | Stages | Note |
|---|---|---|---|
| Cold email — Smartlead | ✅ | PR-OUT · ST-OUT | Sequences, lead refresh, webhook, auto-pause on claim |
| Transactional email — Resend | ✅ | most stages | With a webhook |
| Scheduling — Calendly | ✅ | PR2 · ST2 | With a webhook |
| Interview scheduling — in product | ✅ | MA2 | `.ics` |
| SMS — Twilio | ◐ | — | Present in the codebase, used in one MedJobs route; not a systematic channel |
| Calling | ⚪ | PR-OUT · ST-OUT | Human, with queue and logging — manual by design |
| In-product notifications | ◐ | MA1–MA3 | Confirm coverage |
| Internal alerts — something needs a human | ✖ | all | Nothing tells an owner it is their turn except a queue they must check |

### Qualification, matching, billing, analytics

| Component | Stages | Exists? | Note |
|---|---|---|---|
| Student eligibility model | ST8 | ✅ | Front-door screen |
| **Qualification criteria** | QUAL | ✖ | Not written down anywhere |
| Go-live and provider notification | QUAL · MA1 | ✅ | |
| Match logic and match line | MA1 | ✅ | Confirm it uses the recorded staffing need |
| **Shift verification** | MA4 | ✖ | |
| **Billing on the six-shift trigger** | MA5 | ✖ | |
| Stats endpoints and per-tab series | all | ◐ | Confirm they answer the oversight questions |
| Funnel conversion and cycle time | all | ✖ | Not derivable stage to stage today |

### SOPs, scripts and templates

| Asset | Stages | Exists? |
|---|---|---|
| Outreach protocols P1–P7 | PR1–PR-OUT · ST1–ST-OUT | ✅ `../../protocols/` |
| Call scripts | PR-OUT · ST-OUT | ✅ In templates |
| Conversion meeting structure and post-meeting email | PR2 · PR3 | ✅ `../../protocols/P4-conversion-and-accounts.md` |
| Advisor meeting structure | ST2 | ◐ |
| Per-channel partner copy | ST3–ST7 | ✖ |
| Application nudge copy | ST8 | ◐ |
| Six-shift confirmation script | MA4 | ✖ |
| Invoice and chase templates | MA5 | ✖ |
| The flyer | ST3–ST7 | ◐ Current version is weak; a better one exists but is unrecovered |

---

## 3. Stale candidates — do not assume these belong in 2.0

| Component | Why it is suspect | Action |
|---|---|---|
| Subscription checkout and billing portal | Serves a subscription model, not bill-after-six-shifts | Confirm unused, then plan removal |
| Stubbed per-placement fee fields | Encode a per-party fee at confirmation, not the current model | Re-specify once the fee and trigger are decided |
| Pilot-terms flag as an access gate | Superseded by the eligibility screener; still drives the CRM's conversion state | Resolve into one Client definition |
| Legacy verification and redaction remnants | Removed from the board; check for leftovers | Confirm and delete |
| Families / direct-family surfaces | A different product line, not MedJobs 2.0 | Confirm out of scope |
| Partner-facing qualification functionality | Flagged as stale — **confirm which surface this refers to** before removing anything | Ask, then act |

> **Removing stale technology is a real output of this audit.** Every stale surface is a thing that
> confuses an operator, misleads a test, and has to be maintained.

---

## 4. The event model

**Every meaningful step generates an event.** Digital actions log themselves; human actions taken off the
platform need a one-click way to be recorded into the same history. The point is that a provider's or
student's history reads as one continuous story regardless of who or what performed each step.

**Provider spine**

```
target added → outbound sent → call attempted → reply received → meeting scheduled
→ meeting held → handoff to User Success → follow-up sent → terms accepted
→ profile completed → staffing need recorded → candidate introduced → interview invited
→ interview held → hire confirmed → six shifts confirmed → bill issued → payment collected
```

**Student spine**

```
opportunity seen (channel) → application started → application submitted → qualification decided
→ went live → interview invited → interview accepted → interview held → offer received
→ offer accepted → hire confirmed → six shifts confirmed → support check-in
```

**Every event carries:** what happened · when · who or what performed it · the entity it belongs to ·
the outcome · what it triggered.

**The test.** Open any provider or any student and answer, from the system alone: where are they now, how
did they get here, what has happened, when, who did it, what communications occurred, what needs to happen
next, and who owns it. **If any answer requires asking a person, that is a gap.**

This history is also the foundation for funnel conversion and cycle-time measurement. Build it once and
both problems are solved.

---

## 5. Communications inventory

To be completed per stage. The shape:

| Trigger | Audience | Channel | Template | Owner | Expected response | Next action | Event logged |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

**Fill it from the matrix**, not from the codebase — the matrix says where a communication is *required*;
this table records what exists, what is missing, and what is unowned. Start with the stages where a
missing message costs a placement: PR3 follow-up, MA2 interview handshakes, MA3 offer, and everything
after MA3, where almost nothing is currently defined.
