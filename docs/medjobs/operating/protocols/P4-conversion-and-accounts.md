# P4 · Meeting → Client → Placement → Billing

> **Owner:** Chantel (Logan runs the conversion meeting in Weeks 1–4)
> **Starts when:** a meeting is held. **Ends when:** a placement is billed and checked in on.
> **This is where MedJobs makes money.** Everything upstream is preparation for this protocol.

---

## 1. The conversion meeting

**~15 minutes. One job: get a yes in principle.** Not to close paperwork.

### Structure

| # | Beat | Content |
|---|---|---|
| 1 | Their situation | *"Tell me about your hiring right now — how many caregivers are you short?"* **Listen more than you talk here** |
| 2 | The program | Pre-health students at \[University\] who want clinical hours. We recruit, they apply, we vet, you interview, you decide |
| 3 | Why students work | Motivated, reliable, building a record they need. They want the hours as much as the money |
| 4 | How it works for them | Log in, browse candidates, invite to interview, hire who you want |
| 5 | The terms | **Blocked on C1.** Recommended framing: *"You pay when you hire — $X per placement, invoiced monthly. Nothing to look."* |
| 6 | The ask | *"Want to give it a try? I'll send the details and the pilot agreement — no rush on signing, we just need it before you interview your first student."* |

**The soft-signature ask is deliberate and it works.** Logan: *"No rush to sign it, we just need to complete
it before you interview your first student."* Do not harden it.

### End with a commitment, not an agreement

> *"I can't promise timing until my university connection is set, but now that I have a commitment from you,
> I'm going to start working on students in your area."*

That single sentence gives them a reason to expect something and gives us permission to go recruit.

---

## 2. The post-meeting email — send it the same day

Standardized. Four parts, in this order:

1. **Thank you + recap** of what they need — roles, shifts, how many.
2. **The details:** how it works, the terms, timing.
3. **The pilot agreement**, attached, with the soft ask.
4. **The standard questions** — these are what make the vetting good, and they are the same every time:
   - What are the characteristics of a good caregiver for your organization?
   - How many are you looking to hire?
   - What shifts do you need covered? Regular recurring, or PRN?
   - Anything else useful as we vet students for you specifically?

**Log the send.** Then follow up in 3 days if there is no reply — and again at 7. Interested providers go
quiet for ordinary reasons; two follow-ups is not pestering, it is professionalism.

> **The failure this prevents:** a provider replied on August 5 with exactly these answers and got nothing
> back for a month. *"This is gold right here."* Treat every one of these replies as gold.

---

## 3. Activating the Client

> ⚠️ **Blocked on C2.** "Client" currently means three different things — a signed agreement, the pilot-terms
> flag, or the eligibility screener. Until C2 is decided, **do all three and note it on the row**, and count
> conversions by the signed agreement.

| # | Step | Done when |
|---|---|---|
| 3.1 | They accept the terms | Recorded on the row and in the product |
| 3.2 | They complete the eligibility screener | Demand profile captured — shift shape, PRN, coverage needs |
| 3.3 | The pilot agreement is signed | On file (before their first interview, per the soft ask) |
| 3.4 | They can log in and see the board | Verified by you, not assumed — magic-link and role bugs are known jank |
| 3.5 | Their demand profile reaches Sess | Roles, count, shift types — **within 1 day.** This is the demand signal supply needs |

**Check the board before you celebrate.** If they log in to an empty candidate list, this conversion is
already at risk. Coordinate with Sess before sending the welcome — a Client whose first impression is an
empty board is the hardest kind to win back.

---

## 4. The marketplace — interview → offer → placement

| Stage | What happens | Your job |
|---|---|---|
| **Browse** | Client views candidates | Confirm they can actually see them. Follow up if they have not logged in within 3 days |
| **Invite** | Client invites a student to interview | Confirm the student was notified |
| **Interview** | The interview happens | Confirm it held. **Follow up within 1 day after** — this is a known stall point |
| **Offer** | Client offers, signs the internship agreement | Walk them through it if it is their first |
| **Accept** | Student accepts | **Placement confirmed** — the north star event |
| **Confirm** | Contact details unlocked, work begins | Log the placement |

### The stall points, and what to do about them

| Stall | Why it happens | Fix |
|---|---|---|
| Client never logs in | Life. Email is easy to ignore | Call them. Do not send a third email |
| Client browses, never invites | Nobody fits, or they are unsure how | Ask which. If nobody fits, that is a supply brief for Sess |
| Interview scheduled, never held | Two-sided handshake | Confirm with both sides 24h before |
| Interview held, nothing happens | The single biggest post-meeting leak | **Call within 1 day.** *"How did it go?"* |
| Offer made, student silent | Student is deciding, or cash-anxious | Call the student. Understand the hesitation — it is data |

**The one rule for this whole section: never let an interview sit un-followed-up.** More placements are lost
here than anywhere else in the funnel.

---

## 5. Billing

> ⚠️ **Blocked on C1** (amount, payer, timing) and **O-5** (Stripe is stubbed — there is no capture path).

**Interim process — use it from hire #1:**

1. Confirmed placement → log it on the account.
2. Month end → count confirmed placements per Client.
3. **Invoice manually.** Reference the signed agreement.
4. Track invoiced vs. collected in the weekly pack.
5. Chase unpaid at 14 days.

**Do not let billing infrastructure gate hires.** A manual invoice is a perfectly good billing system for
the first ten placements, and collected revenue is what the January submission needs — not automation.

---

## 6. After the placement — retention and evidence

| When | What | Why |
|---|---|---|
| **Day 1** | Confirm the student started | Catch no-starts immediately |
| **Day 7** | Check in with both sides | Early problems are cheap to fix |
| **Day 30** | **Satisfaction check-in, both sides** | Retention **and** the research capture — see below |
| **Day 90** | Still employed? Hours worked? | Retention evidence |
| **Ongoing** | Weekly touch with every active Client | *"As soon as it's above 5 people, you get fucked"* — the CRM holds this, not your memory |

### Capture the research fields from placement #1

**O-10.** Three questions at the 30-day check-in, both sides:

- Satisfaction 1–5, plus free text
- Hours worked to date
- Still employed, yes or no

500 placed students with satisfaction data is the evidence base for a ~$2M NIH proposal. **This cannot be
collected retroactively.** It costs one extra question in a call you are already making.

---

## 7. Weekly rhythm — Chantel

| Day | What |
|---|---|
| Mon | Review replies; plan the week's meetings |
| Tue | Metrics review; report R2, R3, R5 |
| Wed | **Client check-ins.** Every active Client hears from a human. Confirm each has candidates to look at |
| Thu | Pipeline review with Grazy |
| Fri | Placement + billing sweep; post-placement check-ins logged |

**Weekly targets (one site):** 3 meetings held · 1–2 Clients activated · every Client contacted ·
**1 confirmed placement.**

---

## 8. Escalate

| Situation | To |
|---|---|
| Anything about price or contract terms | Logan, always |
| A Client asking to hire outside the platform | Logan — non-circumvention, and the terms cover it |
| A Client with no candidates to look at | Sess, urgently — this is a churn event in progress |
| A student or Client with a safety or conduct concern | Logan, immediately |
| Portal or magic-link failure | Esther → TJ, with screen/click/expected/actual |
