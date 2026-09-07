# MedJobs 2.0 — Execution Playbook

> **The sequencing companion to `00-OPERATING-SYSTEM.md`.** Day by day and stage by stage, with a named
> owner on every line.
> Read `00-OPERATING-SYSTEM.md` first for the architecture. Run from `protocols/` for the how.
>
> **Rule of the road:** if a step here and a protocol disagree, the protocol wins and this file gets fixed.
> If a protocol and the shipped system disagree, stop and log it in `07-OPEN-DECISIONS-AND-CONFLICTS.md`.
>
> **Note — this file is one revision behind.** Its S0–S7 stage model predates the master architecture in
> `00-OPERATING-SYSTEM.md` §2, which re-cuts the funnel as **PR · ST · MA** with different ownership
> at the meeting and conversion stages. The sequencing, sprint, triage and handoff contracts below still
> hold. The stage map gets re-cut against PR/ST/MA once that architecture is agreed.

---

## 1. The seven operating stages

Every piece of MedJobs work belongs to exactly one stage. If you cannot name the stage, you are doing
something the pod has not agreed to do.

| # | Stage | Owner | Starts when | Done when | Protocol |
|---|---|---|---|---|---|
| **S0** | Site setup & data | **Sess** | A university is named | Catchment audited, provider data clean, partner list built | `P1 §1` |
| **S1** | Prospect → Pre-Flight | **Grazy** | Providers materialized | Required contact fields present | `P1` |
| **S2** | Cadence & call queue | **Grazy** | Pre-flight clears | Reply, meeting, or cadence exhausted | `P2` |
| **S3** | Reply triage → booked meeting | **Grazy** → **Chantel** | Any inbound signal | Meeting on the calendar | `P3` |
| **S4** | Meeting → Client | **Chantel** (Logan runs the meeting in Wks 1–4) | Meeting held | Terms accepted, provider onboarded | `P4` |
| **S5** | Supply: partners → candidates | **Sess** | Site setup done — **runs in parallel with S1–S4, never after** | Live candidates on the board | `P5`, `P6` |
| **S6** | Marketplace: interview → placement | **Chantel** | A Client and a candidate exist on the same site | Placement confirmed | `P4 §4` |
| **S7** | Bill, check in, capture | **Chantel** + **Esther** | Placement confirmed | Invoice paid, check-in logged, evidence captured | `P4 §5` |

**Cross-cutting, all stages: Esther** owns queue integrity, deliverability, instrumentation and the weekly
metrics pack (`P7`, `03-METRICS.md`).

### The two hard sequencing rules

1. **Supply runs one site ahead.** S5 starts the same week as S1 — not after the first Client. A Client
   who logs in to an empty candidate board is our own worst churn event, and the build plan already flags
   it as a HIGH structural fall-off. See C6.
2. **Do not book a conversion meeting into an empty site.** The site needs a **minimum viable board — 8 live
   candidates** — before S4 meetings are scheduled. If demand is running ahead of supply, Grazy keeps
   filling the pipeline and holds the bookings; she does not slow down prospecting.

---

## 2. Operational readiness sprint — the first ten working days

The system is built. This sprint makes it *run*. Every item has an owner and a done-condition. Anything
not done by its day gets raised at the next stand-up — not silently rolled forward.

### Day 0 — unblock (TJ + Logan, half a day)

Nothing below this line is honest until these five are closed.

| # | Item | Owner | Done when |
|---|---|---|---|
| 0.1 | **Verify `SMARTLEAD_WEBHOOK_SECRET` is set** at `/admin/medjobs/integrations`. Without it the webhook is inert: no opens, clicks, replies or bounces reach the app, the Emails and Follow-up tabs are blind, and protocol Step 5's activity-gated re-engagement cannot function at all. | TJ | A test send produces an `email_sent` touchpoint with open/click payload |
| 0.2 | **Confirm `103_medjobs_placements.sql` is applied in production** | TJ | `POST /api/medjobs/placements` succeeds against prod |
| 0.3 | **Start mailbox warmup.** 2–4 week lead time — the longest pole in the entire plan. Pick the cold domain, stand up 2–4 mailboxes, turn on Smartlead warmup. See `../EMAIL_LAUNCH_PLAN.md §2–3` | TJ | Warmup running on ≥2 mailboxes; sender pool env set |
| 0.4 | **Name Site #1.** Pick where Logan already has an advisor relationship, not the biggest school | Logan | Site created in `/admin/medjobs/sites` |
| 0.5 | **Decide C1 (price) and C2 (Client definition)** | Logan + TJ | Both logged in `06-DECISIONS.md` |

> If 0.5 slips, the pod still runs Days 1–3 — data, prospecting and partner lists do not depend on price.
> **It stops at Day 4.** Do not launch a cadence whose replies you cannot answer with a number.

### Days 1–3 — load the site

| Day | Owner | Task | Done when |
|---|---|---|---|
| 1 | **Sess** | Catchment audit — pull the provider list for Site #1, verify these are real non-medical home care agencies in the right cities, flag junk | An audited list with a defensible count |
| 1 | **Sess** | Fix provider data on the top 40: name, phone, email, address, website | 40 rows with required fields |
| 1 | **Esther** | Stand up the metrics sheet from `03-METRICS.md`; confirm `/admin/medjobs/stats` matches it | Week-0 baseline recorded, even if all zeros |
| 1 | **Chantel** | Draft the one-page provider explainer she asked for in the meeting — what it is, what the student brings, **the price**, what happens next. *Gated on C1.* | Draft in review with Logan |
| 2 | **Grazy** | Materialize the first 40 provider prospects; run `P1` pre-flight on all 40 | 40 rows past the launch gate or explicitly parked |
| 2 | **Sess** | Build the partner list for Site #1: pre-health advisors, pre-med/nursing/public-health org leaders, relevant department heads. Target 15–25 named humans with email + phone | Partner prospects created in the Partners tab |
| 2 | **Esther** | Daily zero-out ritual live: who checks which queue, by when, and what "empty" means | Written in `02-ROLES-AND-CADENCE.md`, agreed by all four |
| 3 | **Logan** | Recover Diana's flyer (**O-6**) or approve the current one as the Week-1 baseline | A flyer asset exists that Sess can send |
| 3 | **Chantel + Logan** | Confirm the conversion-meeting script and the post-meeting details email — both already exist in Logan's sent mail; make them templates, not tribal knowledge | Both in `protocols/P4` |
| 3 | **Pod** | 30-minute dry run: walk one fake provider from prospect to Client and one fake student from flyer to application. Log every break | Break list in `08-ITERATION-LOG.md` |

### Days 4–7 — first fire

| Day | Owner | Task | Done when |
|---|---|---|---|
| 4 | **Grazy** | Launch the provider cadence — **~25 sends/day maximum**, per `../EMAIL_LAUNCH_PLAN.md §4`. Resist the urge to go bigger; reputation damage is not recoverable inside this quarter | Campaign live; Day-0 emails delivered |
| 4 | **Sess** | Launch partner outreach in parallel. **Do not wait for the first Client** | Partner cadence live |
| 4–7 | **Grazy** | Work the Calls tab to zero every day; log every outcome | Calls tab empty daily |
| 4–7 | **Chantel** | Reply triage within 1 business day; book meetings — **book, don't explain** (`P3`) | First meeting on the calendar |
| 5 | **Sess** | First partner meetings; ask for distribution, get the flyer moving | ≥1 partner agrees to distribute |
| 6–7 | **Logan + Chantel** | First conversion meetings. **Chantel co-attends every one** | ≥1 meeting held |
| 7 | **Esther** | Week-1 metrics pack; first Tuesday review | Pack posted, one leak named |

### Days 8–10 — close the loop

| Day | Owner | Task | Done when |
|---|---|---|---|
| 8 | **Chantel** | First Client activated end to end — terms, onboarding, demand profile captured | 1 Client, verified in both the CRM and the product |
| 8 | **Sess** | Flyer physically circulating: org GroupMe/Slack/IG, advisor list, one physical posting | Distribution evidence logged on the partner row |
| 9 | **Sess** | First student applications land; shepherd them to complete (`P6`) | ≥3 applications started, ≥1 complete |
| 9 | **Esther** | Deliverability check: bounce and complaint rates against the `../EMAIL_LAUNCH_PLAN.md §5` thresholds | Rates recorded; caps adjusted if needed |
| 10 | **Pod** | Sprint retro. What broke, what to standardize, what stays experimental | `08-ITERATION-LOG.md` updated; protocols v1.1 |

### Definition of done for the sprint

All five, or the sprint is not finished:

- [ ] A provider cadence running daily without a founder touching it
- [ ] A conversion meeting booked (ideally held)
- [ ] A partner who has agreed to distribute the flyer
- [ ] At least one completed student application
- [ ] A metrics sheet with real numbers and a named owner per number

---

## 3. Steady state — the operating week

Once the sprint lands, the pod runs this every week. Detail and time-of-day in `02-ROLES-AND-CADENCE.md`.

| When | What | Who | Time |
|---|---|---|---|
| **Daily AM** | Zero-out your queues — Calls, Emails, Meetings, Follow-up | Each owner | ≤30 min |
| **Daily** | Reply SLA: every inbound answered within 1 business day; meeting requests same day | Chantel (provider), Sess (partner/student) | continuous |
| **Mon** | Week plan: prospect volume, partner targets, meetings to book | Pod, async | 15 min |
| **Tue** | **Metrics review** — the pack, the biggest leak, one experiment started and one stopped | Pod | 45 min |
| **Wed** | Supply/demand balance check: live candidates per active client | Sess + Chantel | 15 min |
| **Thu** | Pipeline review: every row with a meeting or an open reply | Grazy + Chantel | 20 min |
| **Fri** | Log the week in `08-ITERATION-LOG.md`; close or escalate open decisions | Esther | 20 min |
| **Monthly** | **Gate review** against `04-SCALE-GATES.md` | Pod + Logan | 60 min |

**Weekly volume targets for one site** (calibrate after two weeks of real data — these are starting
assumptions, not commitments): 40 new prospects pre-flighted · 100–125 cold emails · 40 calls attempted ·
8 partner contacts · 3 meetings booked · 1 Client · 5 student applications.

---

## 4. Failure triage — what to do when something does not work

Every loss gets classified before it gets fixed. The class determines the owner and the response. This is
the difference between "outreach isn't working" (unactionable) and "our emails aren't landing" (fixable
today).

| Class | Looks like | Owner | First move |
|---|---|---|---|
| **Data** | Wrong number, closed business, not actually home care, out of catchment | **Sess** | Fix the row, then check whether the whole batch shares the defect |
| **Deliverability** | Bounces, no opens at all, spam complaints | **Esther** | Check rates against `../EMAIL_LAUNCH_PLAN.md §5`. Over threshold → pause the mailbox, do not push through |
| **Message** | Opens but no replies; replies that misunderstand the offer | **Chantel** | Register an experiment in `05-EXPERIMENTS.md`. Change **one** variable |
| **Product** | The portal breaks, the magic link fails, the board is empty, a role renders wrong | **Esther** → TJ | Log with screen/click/expected/actual. **Never work around it silently** |
| **Operator** | Missed SLA, unlogged outcome, skipped step | **The pod** | Not a blame event. Ask whether the protocol is wrong before assuming the human was |

**The escalation rule:** the same failure class three times in one week stops being a fix and becomes an
agenda item. Bring it to Tuesday with the three instances attached.

---

## 5. Handoff contracts between owners

Most operating models fail at the seams, not in the lanes. Each handoff has a trigger, a required payload,
and an SLA. If the payload is incomplete, the receiving owner **hands it back** rather than working around
it — that is the only way the seam stays honest.

| Handoff | Trigger | Payload | SLA |
|---|---|---|---|
| **Sess → Grazy** | Site data audited | Clean provider rows with required fields, catchment confirmed | Before prospecting starts |
| **Grazy → Chantel** | Meeting booked, or a reply that needs a commercial answer | Row link, contact name, what they said, what they asked for | Same day |
| **Chantel → Sess** | New Client activated | Site, agency name, roles wanted, shift types, how many | Within 1 day — this is the demand signal supply needs |
| **Sess → Chantel** | Candidate goes live | Candidate profile, availability, site | Weekly batch is fine |
| **Chantel → Esther** | Placement confirmed | Placement record, fee, invoice status | Same week |
| **Anyone → Esther** | Anything broken | Screen, click, expected, actual | Immediately |

---

## 6. What we deliberately are not doing in 2.0

Written down so it stops being re-litigated every week. Each is a real future; none is this quarter.

| Not doing | Why | Revisit |
|---|---|---|
| Direct-to-family caregiver hiring | Separate primitive (D23); Logan: *"it's a few lines of code"* but a different market | After Stage 2 |
| Agency-uploaded caregiver pools | D24 | After Stage 3 |
| Multi-city / multi-state expansion | Nothing is proven repeatable yet | After Gate review |
| Inbound reply auto-classification | D2. Manual classification is also how we learn the reply taxonomy | Stage 3 |
| Self-serve everything | The operator *is* the product in 2.0 | Never fully — this is a service |
| Migrating the provider queue between systems | C5. Decide the target; don't move mid-sprint | Post-sprint |
| Building a unified CRM across all value props | Logan retracted this in the same meeting he proposed it | Post-Gate |

---

## 7. Escalation

| Situation | Action |
|---|---|
| A protocol step is wrong or impossible | Log it, do the sensible thing, raise it Tuesday. **Do not silently improvise a parallel process** |
| Two owners disagree on a handoff | The receiving owner decides; log it if it recurs |
| An open decision blocks work | Post it in the channel with a **proposed default and a deadline**: "if we don't hear by Friday, we're doing X" |
| Anything touching price, contracts, or a university relationship | Logan, always |
| Anything requiring a code change | TJ, with the jank-log entry attached |
| The same failure class three times in a week | Tuesday agenda item with the three instances |
