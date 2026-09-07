# Roles, Ownership & Operating Cadence

> Who owns what, what each person does on a given day, and where the seams are.
> **The test this document has to pass:** any pod member can be out for a week and someone else can pick up
> their lane from this file plus `protocols/`.

---

## 1. The pod

| | Chantel | Esther | Grazy | Sess |
|---|---|---|---|---|
| **Lane** | Conversion & Accounts | The System | Demand Pipeline | Supply & Data |
| **Owns** | Meeting → Client → placement → billing | CRM integrity, deliverability, metrics | Prospect → pre-flight → cadence → booked meeting | Data quality, partners, students |
| **Judged on** | Confirmed placements | Zero queue debt + a weekly number that is true | Meetings booked | Live candidates per site |
| **Daily surface** | Emails, Meetings, Clients | All queues + `/admin/medjobs/stats` | Providers, Calls | Partners, Candidates |
| **Decides alone** | What to say to a provider post-meeting | How the queue and metrics work | Prospect volume and call ordering | Which partners to chase, flyer distribution |
| **Escalates to Logan** | Price, contract terms, anything a university touches | — | — | University relationships |

**Why these assignments** — from the meeting, not from titles:

- **Grazy** is already producing meetings with no founder involvement: *"She's good, because I'm getting
  meetings. I'm not doing anything. She's doing it all."* She also wrote the existing operating protocol.
  She owns the top of the funnel because she is already the person who makes it move.
- **Chantel** asked for the concrete commercial terms — *"the pricing and things a little bit straightforward,
  rather than just the idea"* — which is the closer's instinct. She also named the centralization pain that
  Esther is fixing. She has explicitly **not** been pitching MedJobs on calls yet; that changes here.
- **Esther** proposed the system architecture split and was asked to take first crack at it. She has worked
  on both the MedJobs and cold-outreach systems, which makes her the only person who can keep them honest.
- **Sess** carries the verification discipline the benefits pipeline runs on (*"verified by Sess"*). Supply
  quality is a verification problem before it is a marketing one, and bad catchment data is the top upstream
  failure class in the whole funnel.

**No designated pod lead.** Logan left this open deliberately: *"some groups of 3 to 4 don't need a leader…
I want to see where y'all's talents and passions would take this."* The pod coordinates through the sequence
in `01-EXECUTION-PLAYBOOK.md`. **Appoint a lead only if the pod stalls twice on the same handoff** — that is
the signal, and nothing before it is.

---

## 2. Founder roles — bounded on purpose

### Logan

**Does:** conversion meetings (Weeks 1–4, tapering) · opens university doors — advisors, department heads,
student orgs · price, contracts and anything a university sees · final call on `07-OPEN-DECISIONS-AND-CONFLICTS.md`.

**Does not:** work the CRM queue · write cold emails · chase student applications · debug the portal.

**The handoff schedule** (this is C8, made concrete and measurable):

| Weeks | Conversion meeting run by | Chantel's role |
|---|---|---|
| 1–2 | Logan | Co-attends every meeting, takes notes, drafts the follow-up |
| 3–4 | **Chantel**, Logan on the call | Runs it; Logan closes if it wobbles |
| 5+ | **Chantel alone** | Logan attends by exception only |

Tracked as **Gate F**. If conversion drops when Chantel leads, that is a finding worth having in October
rather than discovering in January.

### TJ

**Does:** the technical unblocks (webhook secret, migrations, Stripe, sending domains) · system architecture
decisions with Esther · deliverability infrastructure.

**Does not:** run the operating cadence.

---

## 3. A week in the life

### Chantel — Conversion & Accounts

| | |
|---|---|
| **Daily AM (30 min)** | Emails tab → every provider reply answered or booked. Meetings tab → confirm today's, prep tomorrow's |
| **Daily** | Reply SLA: **1 business day, always. Meeting requests same day.** This is the one number that killed us this summer |
| **Mon** | Review the weekend's replies; plan the week's meetings |
| **Tue** | Metrics review; report conversion rates and name the biggest leak in her lane |
| **Wed** | Client check-ins — every active Client hears from a human weekly. Confirm each has candidates to look at |
| **Thu** | Pipeline review with Grazy: every open reply and booked meeting, out loud |
| **Fri** | Placement + billing sweep: any hires this week? Invoiced? Post-placement check-ins logged? |

**Weekly targets (one site):** 3 meetings held · 1–2 Clients activated · every Client contacted · 100% of
replies inside SLA.

### Grazy — Demand Pipeline

| | |
|---|---|
| **Daily AM (30 min)** | Calls tab to zero. Every outcome logged, no exceptions |
| **Daily** | Providers tab: pre-flight new rows, launch cleared ones |
| **Mon** | Materialize the week's prospects (target 40) |
| **Tue** | Metrics review; report top-of-funnel rates |
| **Wed** | Follow-up tab triage per `P7` — re-engage on activity, archive on silence |
| **Thu** | Pipeline review with Chantel |
| **Fri** | Data-quality findings → Sess; protocol findings → the iteration log |

**Weekly targets (one site):** 40 prospects pre-flighted · 100–125 cold emails sent · 40 calls attempted ·
3 meetings booked.

### Sess — Supply & Data

| | |
|---|---|
| **Daily AM (20 min)** | New student applications: complete, verify, activate. Partner replies answered |
| **Mon** | Data-quality pass on the week's prospect batch **before** Grazy works it |
| **Tue** | Metrics review; report candidate and partner counts |
| **Wed** | Supply/demand balance with Chantel: live candidates per active client. **This number predicts churn** |
| **Thu** | Partner outreach block — calls, emails, meetings with advisors and org leaders |
| **Fri** | Flyer distribution push; log distribution evidence on every partner row |

**Weekly targets (one site):** 8 partner contacts · 1 new distributing partner · 5 student applications
started · 3 candidates live.

### Esther — The System

| | |
|---|---|
| **Daily (15 min)** | Queue-health scan across all tabs. Anything overdue >48h gets named to its owner |
| **Mon** | Deliverability check: bounce, complaint, open rates vs. the `../EMAIL_LAUNCH_PLAN.md §5` thresholds |
| **Tue** | **Publish the metrics pack** and run the review |
| **Wed** | Jank triage: this week's findings sorted into fix-now, fix-later, won't-fix; hand TJ the fix-nows |
| **Thu** | Instrumentation: is every metric we claim to track actually derivable? |
| **Fri** | Update `08-ITERATION-LOG.md`; close or escalate items in `07-OPEN-DECISIONS-AND-CONFLICTS.md` |

**Weekly targets:** metrics pack published Tuesday · zero queue debt >48h · every jank finding triaged
inside a week.

---

## 4. The daily zero-out

The single ritual that keeps the model alive. **Every queue, every day, empty or explained.**

| Queue | Owner | "Empty" means |
|---|---|---|
| **Calls** | Grazy | Every call due today attempted and logged |
| **Emails** | Chantel (provider) · Sess (partner/student) | Every inbound answered or dispositioned |
| **Meetings** | Chantel | Today's confirmed, tomorrow's prepped, held ones logged |
| **Follow-up** | Grazy | Every finished cadence triaged: re-engage or archive |
| **Providers** | Grazy | Every new prospect pre-flighted or parked with a reason |
| **Partners** | Sess | Every partner reply answered |
| **Candidates** | Sess | Every new application shepherded or activated |

**"Explained" is a legitimate outcome.** *"Six calls left, I ran out of day, they're first tomorrow"* is fine.
*Silence* is not. The failure mode is not a full queue — it is a queue nobody looked at.

---

## 5. Meeting cadence

TJ proposed 3×/week to start. Concretely:

| Meeting | When | Who | Length | Purpose |
|---|---|---|---|---|
| **Week plan** | Mon, async in-channel | Pod | 15 min | Targets for the week; blockers named |
| **Metrics review** | **Tue** | Pod (+ TJ) | 45 min | The pack, the biggest leak, one experiment on and one off |
| **Pipeline review** | Thu | Grazy + Chantel | 20 min | Every open reply and booked meeting |
| **Founder sync** | Thu or Fri | Pod + Logan + TJ | 30 min | Open decisions, university relationships, escalations |
| **Gate review** | Monthly | Pod + Logan + TJ | 60 min | `04-SCALE-GATES.md`, against evidence |

Tuesday is deliberately the same day as the `/metrics` growth cadence so the whole company reads numbers on
one day.

### Tuesday agenda (fixed — do not improvise it)

1. **The pack** (Esther, 10 min) — north star, five rates, four health signals, vs. last week.
2. **The biggest leak** (5 min) — where the most volume died, and its failure class.
3. **Experiments** (10 min) — what finished, what it told us, what starts next. **One variable at a time.**
4. **Open decisions** (10 min) — anything from `07-`. Two Tuesdays open → escalate with a default action.
5. **Protocol changes** (10 min) — what got standardized, what got unfrozen.

---

## 6. Coverage and absence

| Away | Covered by | What actually has to happen |
|---|---|---|
| Chantel | Grazy | Replies answered inside SLA; meetings not left unconfirmed. Bookings may pause; **replies may not** |
| Grazy | Sess | Calls tab worked; cadence launches may pause |
| Sess | Chantel | Student applications shepherded; partner outreach may pause |
| Esther | Chantel | Metrics pack may slip a week; queue-debt scan may not |

**The rule:** *inbound never waits for the person who owns it.* A reply, a student application, or a
confirmed interview is answered by whoever is present. Outbound volume is what pauses when someone is out.
