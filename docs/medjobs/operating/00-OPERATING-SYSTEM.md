# MedJobs 2.0 — Operating System

> The master architecture for MedJobs: how providers enter, how students enter, where the two sides meet,
> who owns each stage, and where responsibility changes hands. Draft, 2026-09-04.
>
> Companions: `01-EXECUTION-PLAYBOOK.md` · `03-METRICS.md` · `04-SCALE-GATES.md` ·
> `07-OPEN-DECISIONS-AND-CONFLICTS.md` · `protocols/`.

---

## 1. Orientation

MedJobs places pre-medical and pre-nursing students into paid, part-time caregiving work at eldercare
providers — **one university and one surrounding service area at a time.**

**The provider problem.** Providers cannot reliably hire or keep caregivers. Job boards send a highly
variable caliber of applicant and push providers to compete mainly on wage and hours. Staffing agencies
solve part of the problem, but cost enough to take a real bite out of the margin on every shift they fill.

**The student problem.** Pre-medical and pre-nursing students need paid, part-time work, genuine
caregiving experience, and strong letters of recommendation before they apply. The work exists close by,
but no provider markets to a sophomore.

**What MedJobs does.** We recruit and screen the students, introduce them to providers, run the hiring
process, and **charge only once a placement has produced real work.**

**Why the two sides must stay in balance.** They are separate pipelines that have to arrive at the same
university and service area at the same time. A provider with no candidates to interview stops engaging;
a student with no employer to interview with moves on. Keeping them in step and balanced is the discipline
the system below exists to enforce.

---

## 2. The MedJobs operating system

### 2.1 The architecture

```
┌──────────────────────────────────────────────────────────────┐
│  SITE 1                                                      │
│  ONE UNIVERSITY + ONE SURROUNDING SERVICE AREA OF PROVIDERS  │
└─────────────────────────┬────────────────────────────────────┘
  ┌───────────────────────┴───────────────────────┐
  ▼                                               ▼
PROVIDER SIDE                                   STUDENT / UNIVERSITY SIDE
────────────────────────────────────────────    ────────────────────────────────────────────
PR1  TARGET LIST BUILT                          ST1  TARGET ADVISORS
     Admin Team                                      Admin Team
  │                                               │
  ▼                                               ▼
     OUTBOUND WORK                                   OUTBOUND WORK
     Admin Team                                      Admin Team
  │                                               │
  ╞═══ HANDOFF   Admin Team → Logan               ╞═══ HANDOFF   Admin Team → Logan
  ▼                                               ▼
PR2  MEETING HELD                               ST2  ADVISOR MEETING HELD
     Logan                                           Logan
  │                                               │
  ╞═══ HANDOFF   Logan → Chantel                  ╞═══ HANDOFF   Logan → Chantel
  ▼                                               ▼
PR3  CLIENT SUCCESS                                  UNIVERSITY SUCCESS MANAGEMENT
     Chantel                                      │
  │  Follow-up questions                          ├── ST3  UNIVERSITY JOB BOARD
  │  Follow-up profile completion                 ├── ST4  STUDENT ORG RELATIONSHIPS
  │  Follow-up to first hire                      ├── ST5  CAMPUS EVENTS
  │                                               ├── ST6  ADVISOR LISTSERVS
  │                                               ├── ST7  PROFESSOR OUTREACH + CLASS VISITS
  │                                               │
  │                                               │   Chantel owns all five; Logan joins on
  │                                               │   ST4, ST5 and ST7. All five circulate
  │                                               │   the MedJobs opportunity to students
  │                                               │
  └───────────────────────┬───────────────────────┘
                          ▼
┌─────────────────────────┬────────────────────────────────────────────────────────────────┐
│  PORTAL    manages the flow from student application through fulfillment                 │
│   from PROVIDER SIDE                    from STUDENT / UNIVERSITY SIDE                   │
│   active client with a staffing need    ST8  STUDENT APPLICATION SUBMITTED               │
│            │                                  │                                          │
│            │                                  ▼                                          │
│            │                            PORTAL VETS APPLICATION                          │
│            │                            against the qualification criteria               │
│            │                                  │                                          │
│            │                                  ▼                                          │
│            │                            QUALIFIED CANDIDATE                              │
│            └───────────────┬──────────────────┘                                          │
│                            ▼                                                             │
│              ┌─────────────────────────────────────┐                                     │
│              │  MATCH / FULFILLMENT                │                                     │
│              │   MA1  CANDIDATE INTRO              │                                     │
│              │    ▼                                │                                     │
│              │   MA2  INTERVIEW HELD               │                                     │
│              │    ▼                                │                                     │
│              │   MA3  HIRE CONFIRMED               │                                     │
│              │    ▼                                │                                     │
│              │   MA4  6+ SHIFTS WORKED CONFIRMED   │ ◄── the provider has now            │
│              │    ▼                                │     had real value, so              │
│              │   MA5  BILL ISSUED AND COLLECTED    │     Olera charges                   │
│              └──────────────────┬──────────────────┘                                     │
└─────────────────────────┬────────────────────────────────────────────────────────────────┘
  ┌───────────────────────┴───────────────────────┐
  ▼                                               ▼
PROVIDER RECEIVES                               STUDENT RECEIVES
────────────────────────────────────────────    ────────────────────────────────────────────
  A successfully placed worker                    Pay
  Meaningful work before any fee is charged       Caregiving experience
  Ongoing value from that worker afterwards       A path to a strong recommendation
```

### 2.2 Ownership and handoffs

Ownership is by role, not by individual. The **Admin Team** builds and works both pipelines. **Logan**
takes the two meetings where a physician founder in the room changes the outcome. **Chantel** owns the
relationship from that point forward. The **Portal** carries the flow from application through
fulfillment.

| Owner | Owns | Picks up at | Hands to |
|---|---|---|---|
| **Admin Team** | Target lists and outbound work on both sides | PR1 · ST1 | Logan, at the booked meeting |
| **Logan** | The provider meeting and the advisor meeting | PR2 · ST2 | Chantel |
| **Chantel** | Client success on the provider side; university success management and its three channels | PR3 · after ST2 | The Portal |
| **Portal** | Application intake, vetting against the qualification criteria, and the match and fulfillment sequence | ST8 | — |

The two handoff chains, stated plainly:

- **Provider side:** Admin Team → Logan → Chantel → Portal
- **University and student side:** Admin Team → Logan → Chantel (with Logan where he adds value) → Portal

**PR3 is a function, not a moment.** Client success is what carries a provider from the founder meeting to
an actual first hire: the follow-up questions, the profile completion, and the follow-through until a
student is working. A provider who signs and is then left alone does not become a customer.

**ST3 through ST7 run in parallel, not in sequence.** University activation is five channels working at
once — the university job board, student organization relationships, campus events, advisor listservs, and
professor outreach with class visits. Chantel owns all five; Logan joins on student organizations, campus
events, and professor outreach, where a physician founder in the room changes the answer. **The flyer is
the shared asset every channel pushes out, not a stage of its own** — all five circulate the same MedJobs
opportunity, and a student who applies may have seen it through any of them.

One dependency worth naming: **professor outreach is usually gated on department-head permission.** ST7
tends to follow a department relationship rather than starting one, which is why it sits alongside the
other channels rather than ahead of them.

### 2.3 When Olera earns the right to charge

Olera does not charge because a candidate was introduced, and not because a hire happened. The commercial
threshold is **MA4 → MA5: six or more confirmed shifts worked, then the bill.**

The logic is straightforward. The provider pays only after the placement has produced meaningful work and
demonstrated real value. The fee itself should be informed by the value we estimate those first six shifts
create. Once a placement continues past that threshold, the provider keeps the ongoing benefit of that
worker with no further MedJobs charges tied to later shifts.

### 2.4 What this architecture still needs

Three gaps sit underneath the diagram. None of them blocks agreeing the architecture; all three block
building the stage protocols on top of it.

1. **Nothing tracks shifts today.** MA4 is the commercial threshold of the whole model, and shift capture
   does not exist in the product. The only work-volume concept that exists is an hours threshold on the
   placement record, which backs the service guarantee rather than the bill.
2. **The fee is unresolved** — amount, payer, and now the trigger. See **C1** in
   `07-OPEN-DECISIONS-AND-CONFLICTS.md`.
3. **The qualification criteria are not written down.** The Portal vets applications against them, so they
   have to exist before vetting can be automated or delegated. This is the first thing to define after the
   architecture is agreed.

### 2.5 What comes next

Once this architecture is settled, we work through **PR1–PR3, ST1–ST8 and MA1–MA5** one stage at a time
and define, for each: objective, owner, inputs, actions, outputs, completion criteria, Portal and CRM
requirements, handoff, response-time expectation, metric, and escalation. That work deliberately is not in
this draft.
