# Experiment Register

> **What stays liquid while the mechanics stay frozen.**
>
> The mechanics of MedJobs (who gets touched, when, by whom, logged how) are protocol — see `protocols/`.
> The *content* — what we say, to whom, with what framing — is not yet known and must not be frozen. This
> file is where that uncertainty is managed on purpose instead of drifting.

---

## 1. The rules

1. **One variable at a time.** Two changes at once produces a result you cannot attribute, which is the same
   as no result.
2. **A sample size before you start.** "It felt better" is not a finding. Write the N down in advance.
3. **A stop date.** An experiment with no end date is just a preference.
4. **A named owner** who reports it on Tuesday.
5. **Write down the loser.** Negative results are the cheapest thing we own and the first thing teams
   throw away.
6. **Maximum three running at once.** More than that and the pod is running experiments instead of a business.

**The protocol/experiment boundary, in one line:** *if it decides who gets touched and when, it is protocol.
If it decides what we say, it is an experiment.*

---

## 2. Active experiments

*(Nothing running until the sprint launches. The queue below is the intended order.)*

| ID | Question | Owner | Variable | Sample | Start | Stop | Result |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

---

## 3. The queue — in priority order

### E-1 · Does leading with MedJobs on a provider call beat leading with the listing? 🔴 first

**Why it matters:** Chantel has *not* been leading with MedJobs — *"sometimes I do add it in an email if
they mention hiring is a problem… but I haven't led with MedJobs."* TJ's read is that it should be the
easier sell *"because it's concrete."* Nobody has tested it, and it changes every call script we write.

| | |
|---|---|
| **Owner** | Chantel |
| **Variable** | Opening line only. A: current listing/claim opener. B: staffing-first — *"we run a student caregiver program with \[University\]"* |
| **Measure** | Conversation-to-meeting rate |
| **Sample** | 30 connected calls per arm |
| **Confound to control** | Grazy's delivery is producing meetings today; hold the *caller* constant within each arm |

### E-2 · Cold email subject line and opener

| | |
|---|---|
| **Owner** | Grazy |
| **Variable** | Subject line, one at a time |
| **Measure** | Open rate, then reply rate |
| **Sample** | 100 sends per arm |
| **Note** | Requires the Smartlead webhook (**O-3**). Without it there is no open data and this experiment cannot run |

### E-3 · Does the price belong in the first email? 🔴 high value

**Why it matters:** Chantel asked for concrete pricing to send. Logan's protocol is the opposite — book the
meeting, don't send the terms. Both are defensible; only one is true for our funnel. Gated on **C1**.

| | |
|---|---|
| **Owner** | Chantel |
| **Variable** | A: no price, book the meeting. B: *"you pay when you hire — $X per placement"* in the first email |
| **Measure** | Reply rate **and** meeting-booked rate (B may raise replies while lowering bookings — that is exactly the thing worth knowing) |
| **Sample** | 100 sends per arm |

### E-4 · Flyer creative

**Why it matters:** the current flyer is *"terrible but functional."* Diana's version went through three
iterations and worked — Logan: *"it activated the students' brain stems."* If **O-6** recovers it, this
becomes a straight A/B; if not, it becomes a design task first.

| | |
|---|---|
| **Owner** | Sess |
| **Variable** | Creative, one version at a time |
| **Measure** | Applications per distribution event (needs the attribution field from `03-METRICS.md §7`) |
| **Sample** | 3 distribution events per version |

### E-5 · Which partner subtype activates fastest?

| | |
|---|---|
| **Owner** | Sess |
| **Variable** | Subtype: pre-health advisor vs. student org leader vs. department head |
| **Measure** | Contacted → distributing rate, and time to first application |
| **Sample** | 10 contacts per subtype |
| **Value** | Directly reallocates supply-side effort. Probably the highest-ROI experiment in the list after E-1 |

### E-6 · Student incentive framing

| | |
|---|---|
| **Owner** | Sess |
| **Variable** | Lead benefit — paid work vs. clinical hours vs. the recommendation letter |
| **Measure** | Application start rate, then completion rate |
| **Sample** | 50 flyer impressions per arm (approximate; measurement here is genuinely weak) |

### E-7 · Does the student pay anything?

**Why it matters:** the shipped code charges the student $100. The meeting never mentioned charging students
at all. The build plan flags it as *"the one seam where the student could balk."* Gated on **C1**.

| | |
|---|---|
| **Owner** | Logan |
| **Variable** | Student fee: $0 vs. a nominal amount |
| **Measure** | Offer → accept rate |
| **Recommendation** | **$0 for 2.0.** Do not run this experiment until supply is comfortably above Gate C — testing a fee against the cash-poor side while starved for supply risks the one input we cannot replace |

### E-8 · The "3 attempts then archive" threshold

**Why it matters:** this is C3. The protocol says three calls then archive; the recommendation is that calls
enrich rather than gate. Once the mechanics are settled, the *number* is a legitimate experiment.

| | |
|---|---|
| **Owner** | Grazy |
| **Variable** | Call attempts before deprioritizing: 2 / 3 / 5 |
| **Measure** | Meetings booked per operator hour |
| **Note** | The system has **no attempt counter** — this needs either a manual tally or a small build first |

### E-9 · Channel expansion beyond email and phone

| | |
|---|---|
| **Owner** | Grazy |
| **Variable** | Add one channel: contact form / LinkedIn / fax |
| **Measure** | Response rate per hour invested |
| **Note** | Fax (D18), snail mail (D19) and LinkedIn/DM (D20) have **no send UI**. Manual-only until then, which is fine for an experiment and not fine for a protocol |

---

## 4. Completed experiments

*(None yet. Keep the losers — they are the cheapest knowledge we will ever have.)*

| ID | Question | Result | Decision | Date |
|---|---|---|---|---|
| — | — | — | — | — |

---

## 5. Things that look like experiments but are not

| Looks like | Actually is |
|---|---|
| "Should we use a CRM?" | An architecture decision — **C5** |
| "What is the price?" | A founder decision — **C1** |
| "Should Logan run the meetings?" | A sequencing decision — **C8** |
| "Should we archive after 3 calls?" | A protocol decision (**C3**) whose *threshold* is then E-8 |
| "Is the portal broken?" | A bug. Log it in `08-ITERATION-LOG.md` |

Running a decision as an experiment is how a team avoids deciding. If it needs authority rather than
evidence, it goes in `06-DECISIONS.md`.
