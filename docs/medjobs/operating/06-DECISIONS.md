# Decision Log

> Every operating decision for MedJobs, with the reasoning and — most importantly — **what would reverse it.**
>
> **Why this file exists:** a decision nobody wrote down gets re-litigated every three weeks, and a decision
> without a stated reversal condition can never be revisited honestly. Chantel's question in the meeting —
> *"I'm just not sure where everything sits at the moment"* — is what this file prevents.

**Format:** `D-NNN · date · owner · decision · reasoning · reverses if`

**Status:** `PROPOSED` (recommendation from this workspace, awaiting an owner) · `DECIDED` (an owner said yes) ·
`REVERSED` (superseded — kept, never deleted).

---

## Decided

### D-001 · 2026-09-04 · Pod · MedJobs 2.0 scope is one site, provider + supply + marketplace, ending at a billed placement

**Status:** PROPOSED — needs Logan's confirmation.

**Reasoning:** the model has already been proven manually end to end (~$6,000). What is unproven is running
it without the founder in every step. Scoping to one site keeps the variable count low enough to learn from.
Out of scope for 2.0: direct-to-family (D23), agency pools (D24), multi-city, ads.

**Reverses if:** the Jan 5 requirement forces breadth over depth — in which case say so explicitly and accept
that no site gets proven.

---

### D-002 · 2026-09-04 · Pod · Supply runs one site ahead of demand, not after it

**Status:** PROPOSED — needs Logan's sign-off on the minimum board size.

**Reasoning:** Logan's meeting sequence was provider-first (*"here's your egg… now go get the chickens"*).
The build plan states the opposite constraint: *"throughput is ultimately gated by student supply,"* with
"no students" listed as a HIGH structural fall-off, and Loop 2b built specifically to recover from it. Both
can be satisfied by running supply in parallel and gating conversion meetings on a minimum viable board
(recommended: **8 live candidates**). See **C6**.

**Reverses if:** supply proves far easier than expected — if a single advisor email produces 30 applications,
the constraint has moved and demand becomes the gate.

---

### D-003 · 2026-09-04 · Pod · Pre-flight calls enrich the record; they do not gate the campaign

**Status:** PROPOSED — Grazy + Esther to confirm.

**Reasoning:** the protocol archives a prospect after 3 unanswered pre-flight calls, before any email is
sent. That deletes providers who have a valid email and were never contacted through the cheapest channel,
and it contradicts the aggression doctrine in `../OPERATIONAL_BRIEF.md §2.4`. The system also has no attempt
counter, so the rule is untracked today. New rule: **if required contact fields are present, launch.** Calls
continue as cadence call-days. Archive only via the Follow-up rules in `protocols/P7`. See **C3**.

**Reverses if:** bounce or complaint rates rise above the `../EMAIL_LAUNCH_PLAN.md §5` thresholds on
un-called prospects — that would mean the pre-flight call was doing list hygiene we did not credit it for.

---

### D-004 · 2026-09-04 · Pod · "Not interested" is never Archive

**Status:** PROPOSED — correctness fix; adopt on sight.

**Reasoning:** in the system, Archive means `no_response_closed`, which **auto-revives to `engaged` on any
inbound email**. Marking a decline as Archive means their next out-of-office resurrects them into an active
queue and they get worked again — a complaint-rate risk of our own making. Declines log `Not interested`;
opt-outs log DNC; **Archive is only ever for silence.** See **C4**.

**Reverses if:** never. This is how the code behaves.

---

### D-005 · 2026-09-04 · Pod · Reply SLA is 1 business day; meeting requests same day

**Status:** PROPOSED — adopt immediately, costs nothing.

**Reasoning:** an interested provider went unanswered from August 5 to September 4. Logan's standard is
Diana's: *"she would have been responding the next hour."* One business day is the enforceable version.
See **O-7**.

**Reverses if:** volume makes it impossible — at which point the answer is more operators, not a looser SLA.

---

### D-006 · 2026-09-04 · Pod · Book the meeting; do not send collateral instead

**Status:** PROPOSED — this is Logan's existing instruction, written down.

**Reasoning:** direct from the meeting — *"Don't just throw on the contract. Don't throw them to the landing
page. Just be like, why don't you meet with Dr. DuBose?"* The meeting converts at ~100% of those who agree
to it; collateral sent in its place converts at an unknown and probably much lower rate. Collateral supports
the booking; it does not replace it.

**Reverses if:** E-3 shows that sending the price up front increases *meetings booked* (not merely replies).

---

### D-007 · 2026-09-04 · Pod · No designated pod lead for now

**Status:** PROPOSED — Logan's stated preference.

**Reasoning:** *"some groups of 3 to 4 don't need a leader… I want to see where y'all's talents and passions
would take this."* Coordination comes from the sequence in `01-EXECUTION-PLAYBOOK.md` rather than a person.

**Reverses if:** the pod stalls twice on the same handoff, or a gate review fails on Gate A (reliability) —
both are symptoms of missing coordination, not missing effort.

---

### D-008 · 2026-09-04 · Pod · Decide the CRM architecture; do not migrate during the sprint

**Status:** PROPOSED — Logan + TJ to decide the target at the Tuesday session.

**Reasoning:** Esther's split (MedJobs = students, cold outreach = providers, a third layer converts) is
sound and Logan endorsed it. But re-platforming the provider queue mid-sprint would cost the pod its only
working pipeline in exchange for an architecture with no proven operating model behind it. Ship the
operating model on the surfaces that exist; move it afterwards. See **C5**.

**Reverses if:** the current surface actively blocks the sprint — for example, if provider and MedJobs
outreach collide on the same rows and double-email a provider.

---

## Open — awaiting a founder decision

These are the blockers. Each is detailed in `07-OPEN-DECISIONS-AND-CONFLICTS.md`.

| ID | Decision | Owner | Needed by | Recommendation |
|---|---|---|---|---|
| **C1** | Price, payer, billing timing | Logan + TJ | Before the first conversion meeting | $250/hire, provider-only, invoiced monthly in arrears; student fee $0 for 2.0 |
| **C2** | What defines a Client | TJ + Logan | Day 3 | Pilot-terms acceptance is the single definition; the screener writes it; eligibility stays the product's feature gate underneath |
| **O-1** | Site #1 | Logan | Day 1 | Where Logan already has an advisor relationship, not the biggest school |
| **C5** | Does the provider pipeline stay in MedJobs? | Logan + TJ | Tuesday session | Decide the target; don't migrate now (D-008) |
| **C8** | Founder handoff schedule for conversion meetings | Logan | Week 2 | Logan Wks 1–2 → Chantel co-runs Wks 3–4 → Chantel alone Wk 5+; measured as Gate F |
| **O-11** | Does provider cold outreach continue at current intensity? | Logan + TJ | Tuesday session | Answer it explicitly. An unanswered capacity question defaults to doing both, badly |

---

## Reversed

*(None yet. When one is reversed, move it here with the reason and the date — the history is the point.)*
