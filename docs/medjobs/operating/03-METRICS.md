# Metrics

> What the pod tracks from day one, where each number comes from, who owns it, and what good looks like.
>
> **Two rules.** (1) **Every metric has a named owner, a source of truth, and a target — or it is not
> tracked.** A number nobody owns is decoration. (2) **We track a small number of things well** rather than
> a dashboard nobody reads. One north star, five rates, four health signals.

---

## 1. North star — confirmed placements

**A student hired by a Client, agreement signed, fee billable.**

| | |
|---|---|
| **Source** | `placements` table, `status = 'confirmed'` (`app/api/medjobs/placements/route.ts`) |
| **Owner** | Chantel |
| **Cadence** | Weekly; cumulative for the Jan 5 submission |
| **Why this one** | It is simultaneously revenue, product proof, and grant evidence. Everything upstream is a leading indicator of it |
| **Jan 5 target** | **25 cumulative** across 3 sites |

Nothing else competes for the top slot. When two numbers disagree about what to do next, the one that moves
confirmed placements wins.

---

## 2. The five funnel rates

Measured weekly per site. Denominators matter — write them down, because a rate with a sloppy denominator
is worse than no rate.

| # | Rate | Definition | Source | Owner | Wk-4 target |
|---|---|---|---|---|---|
| **R1** | **Prospect → meeting booked** | Meetings booked ÷ prospects with a launched cadence | CRM: Meetings tab vs. cadence launches | Grazy | **≥ 8%** |
| **R2** | **Booked → held** | Meetings held ÷ meetings booked | `meeting_held` vs `meeting_scheduled` touchpoints | Grazy/Chantel | **≥ 70%** |
| **R3** | **Held → Client** | Clients ÷ meetings held | Client flag (**pending C2**) vs `meeting_held` | Chantel | **≥ 60%** |
| **R4** | **Partner contacted → distributing** | Partners with distribution evidence ÷ partners contacted | `distribution_confirmed` touchpoints | Sess | **≥ 20%** |
| **R5** | **Live candidate → interview invited** | Candidates with ≥1 invite ÷ live candidates | `interviews` table vs live candidate count | Chantel | **≥ 30%** |

**Calibration warning.** These targets are estimates, not history. Logan's ~100% meeting-held-to-Client
figure is from a founder-run sample of about ten; R3's 60% target is a deliberately conservative reading of
it. **Reset all five against real data after two weeks** and record the reset in `08-ITERATION-LOG.md` — a
target quietly moved is worse than a target missed.

> **R3 is blocked on C2.** Until "Client" has one definition, this rate is uncomputable. Do not paper over
> it with whichever flag is convenient this week.

---

## 3. The four health signals

Leading indicators of the model breaking. Esther publishes all four every Tuesday.

| # | Signal | Definition | Threshold | Action if breached |
|---|---|---|---|---|
| **H1** | **Queue debt** | Rows with an action overdue >48h, any queue | **0** | Name it to the owner same day. Three weeks running = capacity problem, not a discipline problem |
| **H2** | **Reply SLA breaches** | Inbound replies unanswered >1 business day | **0** | Root-cause immediately. This is the failure that cost us a live provider for 30 days |
| **H3** | **Bounce + complaint rate** | Per `../EMAIL_LAUNCH_PLAN.md §5` | Bounce **<3%**, complaints **<0.1%** | **Pause the mailbox.** Do not push through — reputation damage is not recoverable this quarter |
| **H4** | **Supply/demand balance** | Live candidates ÷ active Clients, per site | **≥ 5:1** | Below 3:1, stop booking conversion meetings and put the pod on supply |

**H4 is the one to watch.** It predicts churn before churn happens. A Client with no candidates to look at
is a Client who stops opening our email, and no amount of account management fixes an empty board.

---

## 4. Volume counters

Not rates — raw activity, to tell "the model is weak" apart from "nobody did anything this week." Both are
real problems; they have opposite fixes.

| Counter | Owner | Weekly target (1 site) | Source |
|---|---|---|---|
| Prospects materialized | Grazy | 40 | Providers tab |
| Prospects pre-flight cleared | Grazy | 40 | Pre-Flight Checklist |
| Cold emails sent | Grazy | 100–125 | Smartlead / `email_sent` touchpoints |
| Calls attempted | Grazy | 40 | `call_*` touchpoints |
| Partner contacts | Sess | 8 | Partners tab |
| Student applications started | Sess | 5 | Signups |
| Candidates activated | Sess | 3 | Candidates tab |
| Meetings held | Chantel | 3 | `meeting_held` |
| Clients activated | Chantel | 1–2 | Client flag |
| Interviews scheduled | Chantel | 3 | `interviews` |
| **Confirmed placements** | Chantel | **1** | `placements` |

---

## 5. Money

| Metric | Definition | Owner | Notes |
|---|---|---|---|
| **Billable hires** | Confirmed placements in the period | Chantel | The invoice trigger |
| **Revenue invoiced** | Fee × billable hires | Chantel | **Blocked on C1** — no agreed price, no honest number |
| **Revenue collected** | Actually received | Chantel | **Stripe is stubbed (O-5).** Manual invoicing until wired — do not let billing infrastructure gate hires |
| **Revenue per Client** | Collected ÷ active Clients | Esther | The expansion signal: are Clients hiring repeatedly? |

**For Jan 5, collected revenue is the number that counts.** Invoiced-but-unpaid is not traction.

---

## 6. Research capture (start now, not later)

500 placed students with satisfaction data is the preliminary evidence base for a ~$2M NIH CareFleet
proposal. **This data cannot be collected retroactively.** Three questions in the post-placement check-in,
starting with placement #1 (**O-10**):

| Field | Asked of | When |
|---|---|---|
| Provider satisfaction (1–5) + free text | Client | 30 days post-hire |
| Student satisfaction (1–5) + free text | Student | 30 days post-hire |
| Hours worked to date; still employed Y/N | Both | 30 and 90 days |

Cheap now. Impossible in twelve months. It is the single highest-leverage thing in this document relative
to its cost.

---

## 7. Where the numbers live

| Source | What it gives | Notes |
|---|---|---|
| `/admin/medjobs/stats` | Per-tab time series (prospects, calls, replies, meetings, clients, partners, candidates) | Configured in `lib/student-outreach/tab-config.ts:TAB_STATS` |
| In Basket tab counts | Live queue state, unread/undone fractions | The daily zero-out surface |
| Smartlead | Send volume, bounce, complaint, open/click | **Only reaches the app if the webhook secret is set — O-3** |
| `placements` table | Offers, accepts, confirmations | **Requires migration 103 applied — O-2** |
| `interviews` table | Invites, confirmations, holds | — |
| The weekly sheet | The pack the pod actually reads | Esther owns it |

**Instrumentation gaps to fix in the sprint** (Esther, Day 4 of `01-EXECUTION-PLAYBOOK.md`):

1. There is no single "time from prospect to Client" measure — assemble it from touchpoint timestamps.
2. Flyer distribution reach is not measurable at all; distribution evidence records *that* a partner
   distributed, not to how many students. Add a rough count to the evidence note as a manual field.
3. Attribution from student application → which partner distributed the flyer is **not tracked**. Without it
   we cannot tell a good partner from a bad one. Interim: a "how did you hear about us" field on the
   application. This is the highest-value instrumentation gap in the list.

---

## 8. The weekly pack

One page, published Tuesday morning before the review. Same shape every week — the format's job is to make
change visible at a glance.

```
MEDJOBS — WEEK N (site: ____)

NORTH STAR
  Confirmed placements:  N this week  ·  N cumulative

RATES                        this wk   last wk   target
  R1 prospect → booked          _%        _%       8%
  R2 booked → held              _%        _%      70%
  R3 held → Client              _%        _%      60%
  R4 partner → distributing     _%        _%      20%
  R5 candidate → invited        _%        _%      30%

HEALTH
  H1 queue debt >48h            _         (target 0)
  H2 SLA breaches               _         (target 0)
  H3 bounce / complaint       _% / _%     (<3% / <0.1%)
  H4 candidates per client      _:1       (≥5:1)

VOLUME
  prospects _  emails _  calls _  partners _  apps _  meetings _  clients _

MONEY
  billable hires _   invoiced $_   collected $_

BIGGEST LEAK THIS WEEK: ______  (failure class: ______)
EXPERIMENT STARTED: ______   ·   STOPPED: ______
```
