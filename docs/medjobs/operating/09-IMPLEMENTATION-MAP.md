# MedJobs 2.0 — Implementation Map

> **What this is.** A complete map of everything required for the MedJobs operating system to function.
> Take the diagram in [`00-OPERATING-SYSTEM.md`](00-OPERATING-SYSTEM.md), zoom into any box or handoff, and
> see the technology, the human SOP, the communications, the data, and the handoff that box depends on.
>
> **Owner:** Esther · **Draft, 2026-09-04.**

| Artifact | What it holds |
|---|---|
| [`implementation-map/MATRIX.md`](implementation-map/MATRIX.md) | **The master matrix.** One block per stage — PR1–PR3, ST1–ST7, ST8, Portal qualification, MA1–MA5 |
| [`implementation-map/USER-JOURNEYS.md`](implementation-map/USER-JOURNEYS.md) | Five complete end-to-end journeys — provider, student, Admin Team, Sales Lead, User Success Manager |
| [`implementation-map/INVENTORY.md`](implementation-map/INVENTORY.md) | Every component required, mapped to stages · stale candidates · the event model · the communications inventory |

---

## 1. The idea

**MedJobs is not a software product and it is not a set of human SOPs. It is both, plus the joins.**

```
TECHNOLOGY  +  HUMAN SOPs  +  THE HANDOFFS BETWEEN THEM  +  INSTRUMENTATION
```

Most operating models are documented one layer at a time — a product spec here, a playbook there, a
metrics doc somewhere else — and then fail at the seams between them. This map is deliberately built the
other way: **every stage carries all three layers together**, because that is the only way to see whether
a stage actually works.

Each stage in the matrix answers three questions:

| Layer | The question |
|---|---|
| **① User journey / technology** | What does each user see and do, on what surface? |
| **② Human SOP** | What does the responsible person do when a human has to act? |
| **③ System / handoff** | What is recorded, what fires next, who picks it up, and what is logged? |

The third layer is the one usually missing, and it is where operating models die. A step can be perfectly
built and perfectly documented and still fail because nothing tells the next owner it is their turn.

**Two shapes recur.** Where a human acts:

```
human completes the action → records the outcome → history updates → status changes
→ the next task is created → a communication fires if appropriate → the next owner picks it up
```

Where the product acts:

```
user completes the action in the Portal → the system records the event → status logic runs
→ the next workflow unlocks → a human is notified if intervention is needed
```

Both end the same way: **something changed, it was recorded, and somebody knows.**

---

## 2. Two rules for what goes in the map

**The architecture decides what we audit.** Every item in the map traces to a stage that needs it.
Technology that exists but serves no stage is not a component — it is a **stale candidate**, listed in
`INVENTORY.md` §3 and considered for removal. We are not auditing the codebase; we are auditing the
operating system.

**Automation is not the goal.** A step is technology-supported where that makes it faster, more reliable,
easier to run, better for the user, or measurable. Judgment and relationship work stay human — the
conversion meeting, the advisor relationship, the calls inside client success. The map marks those as
human on purpose, so the audit does not generate a backlog of things we should never build.

---

## 3. One User Success Manager

There is **one User Success Manager function** covering both sides of MedJobs. It takes operational
ownership after the Sales Lead completes a meeting — with a provider or with a university advisor — and
runs the downstream human operations for both.

Client success, university success and student success are **functions of that one role, not three
roles.** The map uses that terminology throughout. Today Chantel holds it; the map names the role rather
than the person, so it survives the role being split or handed on.

---

## 4. How Esther runs it

Go stage by stage through `MATRIX.md`. For each one, in order:

1. **Confirm the intended workflow** — does the block describe what should happen?
2. **Identify the existing technology** — what is actually there?
3. **Open and test the UI** — as the real user, at their real permission level.
4. **Walk the user journey** — the relevant rows in `USER-JOURNEYS.md`, end to end.
5. **Review the human SOP** — does it exist, is it written down, does the owner follow it?
6. **Test the human/technology join** — a human does the thing; does the system record it?
7. **Confirm the communications** — does each required message exist, fire, and reach someone?
8. **Confirm the event logging** — does the history show what happened, when, and by whom?
9. **Confirm the handoff** — can the next owner see it is their turn without being told?
10. **Mark the stage** — validated · incomplete · stale · missing · needs redesign.

**Record findings in the stage's own block**, not in a separate log. Everything about a stage stays in one
place — that is the whole point of the map.

**Where the map and reality disagree, the disagreement is the finding.** Do not quietly correct either
one. Note it in the block and raise it.

**Write the qualification criteria first.** The Portal vetting stage cannot be audited until somebody
writes down what makes a student qualified. It is currently the only stage in the map whose *intent* is
undefined, and it blocks the audit of everything downstream of it.

---

## 5. Marking a stage

| Mark | Meaning |
|---|---|
| ✅ **Validated** | Walked end to end. Technology, SOP, comms, events and handoff all work |
| ⚠️ **Incomplete** | Works partly. Something in one of the three layers is missing or unreliable |
| 🗑 **Stale** | Exists, but serves a model we no longer run. Candidate for removal |
| ✖ **Missing** | Nothing exists |
| ↻ **Needs redesign** | Exists and works, but the wrong shape for the operating system |

A stage is only ✅ when **all three layers** pass. Working technology with no SOP is not validated, and
neither is a good SOP with no way to record that it happened.

---

## 6. What comes out of this

Once the map is filled in, we have the thing we do not have today: **a single source of truth that says,
for any part of MedJobs, what must exist and whether it does.** From it, three things follow directly —
the true technology and SOP gaps, a defensible priority order for fixing them, and a clear answer to
whether the operating system can carry more volume than it carries today.

That prioritisation comes after the map is complete. This iteration is the map.
