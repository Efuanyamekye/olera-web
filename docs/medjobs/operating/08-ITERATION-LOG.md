# Iteration Log

> The running history of what we tried, what broke, and what changed as a result.
>
> **This is the memory of the operating model.** Protocols say what we do now; this file says *why* they say
> that. When someone asks in November "why do we archive on silence but not on decline?", the answer lives
> here.
>
> Newest entries first. Append weekly; never rewrite history.

---

## How to use this file

Three things get logged, and only three:

1. **Jank findings** — something in the product or process broke. Screen, click, expected, actual. Log it
   even if you worked around it; **especially** if you worked around it.
2. **Weekly entries** — the numbers, the biggest leak, what changed. One per week, written Friday by Esther.
3. **Protocol changes** — what got standardized, what got unfrozen, and what evidence drove it.

**The cultural rule, inherited from the engineering brief:** *a refinement finding is worth as much as a
conversion.* An operator who surfaces five real breaks in a week has had a good week even with zero
conversions. The corollary matters more: **never silently work around a break.** Silent workarounds are how
a CRM dies — the system looks fine while everybody quietly keeps a private spreadsheet.

---

## Jank log

Anything broken, unclear, or slower than it should be. Anyone can add a row. Esther triages weekly into
fix-now / fix-later / won't-fix and hands the fix-nows to TJ.

| Date | Who | Where (screen + click) | Expected | Actual | Status |
|---|---|---|---|---|---|
| 2026-09-04 | Logan | Caregiver sign-in via magic link | Student portal with profile / job board / interview board | Rendered a family-role view; roles confused. Surfaced live in the strategy meeting | Open |
| 2026-09-04 | Logan | MedJobs student flyer | Usable recruiting asset | *"It's a terrible flyer, but it's a functional flyer."* Diana's better version is unrecovered — **O-6** | Open |
| 2026-09-04 | Logan | Provider portal demo path | Clean end-to-end walkthrough | Multiple placeholder screens and dead ends. *"This is first gen. It's not an MVP"* | Open |

---

## Weekly entries

### Week 0 — 2026-09-04 · Workspace established

**What happened**

- MedJobs strategy meeting: Logan, TJ, Chantel, Esther. Full walkthrough of the funnel and the live system.
- Grazy's provider outreach protocol received — the first written description of how the MVP is actually run.
- This operating workspace created as the single source of truth for commercializing MedJobs.

**State of play**

- The system is built and has produced ~$6,000 through manual operation. It is not currently *running* as an
  operating model — no live cadence, no owned queues, no metrics.
- Four people named as the execution pod: Chantel, Esther, Grazy, Sess.
- Jan 5 CRP submission needs demonstrated customer traction and revenue. ~17 weeks.

**Decisions**

- Eight operating decisions drafted as PROPOSED in `06-DECISIONS.md` (D-001 … D-008).
- Nine conflicts and twelve open questions catalogued in `07-OPEN-DECISIONS-AND-CONFLICTS.md`.

**Biggest risk this week:** six blocking decisions sit with the founders. The pod can start Days 1–3 of the
readiness sprint without them; it stops at Day 4 without C1 (price) and C2 (Client definition).

**Next week:** run Day 0 unblocks and Days 1–3 of the readiness sprint (`01-EXECUTION-PLAYBOOK.md §2`).

---

## Protocol change history

| Date | Protocol | Change | Driven by |
|---|---|---|---|
| 2026-09-04 | P1–P7 | Initial version, derived from Grazy's protocol + the strategy meeting + the shipped system | Workspace creation |
| 2026-09-04 | P1 | Pre-flight calls **enrich** rather than **gate** the campaign launch (was: 3 attempts then archive) | C3 / D-003 |
| 2026-09-04 | P3, P7 | "Not interested" logs a decline, never Archive — Archive auto-revives on inbound reply | C4 / D-004 |
| 2026-09-04 | P3 | Reply SLA: 1 business day; meeting requests same day | O-7 / D-005 |
| 2026-09-04 | P4 | Book the meeting rather than sending collateral; post-meeting details email + agreement standardized | D-006 |

---

## Weekly entry template

```markdown
### Week N — YYYY-MM-DD · <one-line summary>

**Numbers**
  North star: _ placements this week, _ cumulative
  R1 _% · R2 _% · R3 _% · R4 _% · R5 _%
  H1 _ · H2 _ · H3 _%/_% · H4 _:1

**Biggest leak:** ______ (failure class: data / deliverability / message / product / operator)

**What we changed:** ______

**Experiments:** started ______ · stopped ______ · result ______

**Jank found:** _ items (see log above)

**Blocked on:** ______

**Next week:** ______
```
