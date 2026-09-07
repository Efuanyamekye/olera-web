# Scale Gates & the Next-Stage Plan

> **When is MedJobs 2.0 working well enough to scale, and what does scaling actually mean?**
>
> The premise: **scaling a broken process multiplies the breakage.** Every gate below is measured on **one
> site** and must hold for **two consecutive weeks**. The two-week hold is the whole point — one good week is
> a person having a good week; two is a system.

---

## 0. What we are aiming at — January 5

Not a forecast — the target the operating model is designed to hit:

- **3 sites live**, each with clients, partners and candidates
- **15+ Clients**, **25+ confirmed placements**, **revenue collected and reconcilable**
- **A pod running the whole thing** with the founder in conversion meetings only — and Chantel running
  most of those
- **Protocols good enough that an intern onboarded in a day** — the actual proof that this is a business
  and not a founder one-off

> Logan, in the meeting: *"We keep getting dinged because we're not expanding out of founders' brains.
> We're not building enterprise-level businesses, we're building founder one-offs."*
>
> The gates below are how we tell whether we are on the way there.

---

## 0.5 Before these gates

The six gates below govern **opening a second site.** They assume the technology and the human workflows
can reliably carry the providers and students we already acquire.

That assumption is being checked separately, in
[`09-IMPLEMENTATION-MAP.md`](09-IMPLEMENTATION-MAP.md) — the map of everything each part of the operating
system requires, and whether it exists. **Complete that map before treating these gates as meaningful.**
Passing a scale gate on a site whose downstream steps silently drop people would tell us nothing worth
knowing.

---

## 1. The gates

All six. Not five. A gate that is "basically passed" is not passed.

### Gate A · Reliability — *the process runs*

| Criterion | Threshold |
|---|---|
| Queue debt (anything overdue >48h) | **0**, both weeks |
| Outcomes logged for every touch | **100%** — no ghost calls, no unlogged replies |
| Reply SLA breaches | **0** |
| Daily zero-out completed | ≥ 9 of 10 working days |

*Why first:* an unreliable process produces unreliable numbers, and every other gate is a number.

### Gate B · Demand — *providers convert*

| Criterion | Threshold |
|---|---|
| Clients on one site | **≥ 5** |
| Meeting held → Client (R3) | **≥ 60%** |
| Meetings booked per week | **≥ 3**, sustained |

### Gate C · Supply — *students arrive*

| Criterion | Threshold |
|---|---|
| Live candidates on the site | **≥ 15** |
| Distributing partners | **≥ 3** |
| Candidates per active Client (H4) | **≥ 5:1** |

*Why 15:* five Clients each need a real choice, not a single résumé. Below this the marketplace does not
clear and the Clients we worked hardest to win are the ones who churn.

### Gate D · Marketplace — *the two sides actually meet*

| Criterion | Threshold |
|---|---|
| Confirmed placements in a 30-day window | **≥ 5** |
| Interview → offer rate | **≥ 40%** |
| Offer → accept rate | **≥ 70%** |

### Gate E · Money — *we get paid*

| Criterion | Threshold |
|---|---|
| Hires billed end to end | **≥ 3** |
| Payments collected | **≥ 3** |
| Billing requiring founder intervention | **0** |

*Manual invoicing counts.* Stripe automation is not required to pass — a repeatable manual process is.

### Gate F · Independence — *it is a business, not a founder*

| Criterion | Threshold |
|---|---|
| Consecutive weeks with no founder action except conversion meetings | **2** |
| Conversion meetings run by Chantel | **≥ 2**, with conversion rate held |
| Open decisions blocking the pod | **0** |

**Gate F is the real gate.** A, B, C, D and E can all be passed by a founder working nights. F is the only
one that proves the operating model rather than the people. Logan named the failure mode himself: *"We're
not building enterprise-level businesses, we're building founder one-offs."* Gate F is the test for that
sentence.

---

## 2. Gate review

Monthly, 60 minutes, pod + Logan + TJ. Evidence-based — each gate gets a number and a source, not an
opinion.

| Outcome | Meaning | Next |
|---|---|---|
| **All six pass** | 2.0 works | Begin Stage 1 |
| **Five of six** | Close, one weak spot | Four weeks focused on the failing gate. **Do not start Stage 1** |
| **Fewer than five** | The model is not proven | Diagnose whether it is protocol, people, product, or market. Fix the class, not the symptom |
| **A regresses** | Discipline decayed | Stop scaling. Reliability first, always |

**The one rule that makes the gates worth having:** *no scaling decision is made outside a gate review.*
Not in Slack, not because a second university got excited, not because January is close. Enthusiasm is how
young operating models get scaled before they work.

---

## 3. The scaling plan

### Stage 1 · Prove it repeats — Sites 2–3 (~4 weeks)

**Question:** does site #2 reach its first placement **faster** than site #1?

| | |
|---|---|
| **Team** | The same four. No hiring |
| **Sites** | Two more universities, same state, similar size to Site #1 |
| **Changes** | None to the protocols. That is the experiment |
| **Success** | Site #2's first placement in **≤60% of the time** site #1 took, with no new protocol invented |
| **Failure means** | The protocols encode a person, not a process. Fix the protocols before touching anything else |

**Watch for:** the founder relationship advantage not transferring — if site #1 worked because Logan knew an
advisor there, site #2 will expose that immediately. Good. That is exactly what Stage 1 is for.

### Stage 2 · Prove it delegates — Sites 4–8 (~6 weeks)

**Question:** can someone who is not in this pod run a lane from the protocols alone?

| | |
|---|---|
| **Team** | +2–3 student interns. Logan's model: grunt work traded for research authorship and sales experience |
| **Structure** | Each pod member becomes an **owner of a lane** rather than an operator in it. Interns operate; the pod supervises, unblocks, and improves the protocols |
| **Success** | An intern runs pre-flight and the call queue at pod-level quality within **two weeks of onboarding**, from `protocols/` alone |
| **Failure means** | The protocols are not yet transferable. Rewrite the ambiguous steps; do not hire more people into ambiguity |

**Prerequisites before an intern starts:** a written onboarding path (`protocols/README.md` §onboarding) ·
admin access provisioned · a named supervisor per intern · a first-week scorecard. **Do not hire into a
process that is still being invented** — that is how the manual version broke the first time.

**Watch for:** the pod quietly doing the interns' work because supervising is slower than doing. That is the
single most common failure of this stage, and it silently un-passes Gate F.

### Stage 3 · Prove it compounds — Sites 9–25

**Question:** what has been done manually enough times to be boring, and therefore safe to automate?

Automation queue, in the order operating reality is likely to demand it:

| Priority | Item | Registry | Unlocks |
|---|---|---|---|
| 1 | **Multi-domain email rotation + warmup automation** | D25 | Volume beyond ~8 sites without reputation collapse. Already flagged as the top future build |
| 2 | **Inbound reply auto-classification** | D2 | The largest recurring manual cost in the daily zero-out |
| 3 | **Calendly webhook ingestion** | D1 | Removes the manual meeting-logging step |
| 4 | **Quarterly client check-in automation** | D21 | Retention at a scale humans cannot hold |
| 5 | **Partner Portal** | `../PARTNER_RECRUITMENT_SYSTEM.md` Phase 3 | Partners self-serve distribution and recruit colleagues |

**The rule: automate only what has been done manually enough times to be boring.** Anything still being
figured out stays human. Premature automation of an unsettled process cements the wrong process.

**Also at this stage:** revisit the adjacent products that 2.0 deliberately deferred — direct-to-family
hiring (D23) and agency caregiver pools (D24). Logan: *"it's a few lines of code difference."* The code may
be; the operating model is a separate build, and it gets its own gates.

---

## 4. What scaling explicitly does not mean

| Not this | Why |
|---|---|
| More prospects per site | Site depth is capped by supply, not by prospect count. More cold email into a supply-starved site just burns domain reputation |
| More cold email volume | Governed by warmup and the H3 thresholds, not by ambition |
| More products | MedJobs 2.0 is not proven. Ads and Benefits are separate efforts with separate gates |
| More founders in the loop | The opposite direction from Gate F |
| More sites before Gate C | A site with clients and no candidates is a churn machine, and it churns the hardest-won relationships we have |

---

## 5. Capacity model — what one pod can hold

Rough, to be recalibrated against real data after Stage 1. Useful for one thing: knowing when the next hire
is actually needed rather than merely wanted.

| Unit | Sustainable load | Constraint |
|---|---|---|
| One operator, demand side | ~2 sites | Call queue + pre-flight volume |
| One operator, supply side | ~3 sites | Partner relationships are the ceiling, not student volume |
| One closer | ~15 active Clients | Weekly touch commitment |
| One conversion-meeting runner | ~5 meetings/week | Calendar |
| **The pod, unaided** | **~3 sites** | — |
| **The pod + 3 interns** | **~8 sites** | Supervision, not operator hours |

**The implication worth stating plainly:** 25 sites is not the same pod working harder. It is a different
organization — roughly 3 pods and a supervising layer — and Stage 2 is where you find out whether this
group can build that.
