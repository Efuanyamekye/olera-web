# P2 · Launch & Work the Cadence

> **Owner:** Grazy
> **Starts when:** a row clears the P1 launch gate. **Ends when:** a reply, a meeting, or the cadence runs out.
> **Derived from:** Grazy's protocol Step 3, plus the deliverability rails in `../../EMAIL_LAUNCH_PLAN.md`.

---

## 1. Before you launch anything — the standing preconditions

| Check | Why | Where |
|---|---|---|
| Smartlead webhook secret is set | Without it **no opens, clicks, replies or bounces reach the app.** You would be flying blind and P7 could not function at all | `/admin/medjobs/integrations` (**O-3**) |
| Sender mailboxes are warmed | Cold-sending an unwarmed mailbox burns the domain, and reputation damage is not recoverable this quarter | `../../EMAIL_LAUNCH_PLAN.md §3` |
| Volume cap agreed for the week | See §4 | Esther |
| You can answer "how much does it cost?" | A cadence whose replies you cannot answer wastes the reply | **C1** |

**If the webhook secret is not set, do not launch.** You will not know who opened, clicked, bounced or
replied — and P7's entire triage depends on that signal.

---

## 2. Launch

1. Open the row → **Launch outreach**.
2. Confirm the recipient — a named human beats `info@` every time.
3. Launch. The Day-0 email sends immediately; later days queue as tasks.

**What the cadence does:** emails on the email days, **call tasks on the call days** appearing in your Calls
tab. Email is Smartlead's job; the calls are yours.

**Cadence supersession is automatic.** When a provider replies, wants a meeting, or converts, pending emails
and calls are cancelled by the system. You never have to remember to stop a campaign — and you should never
try to work around it manually.

---

## 3. Work the Calls tab — daily, to zero

The Calls tab is the highest-value half-hour of the day. An email is a lottery ticket; a call is a
conversation.

1. Open **Calls**, sorted by due time.
2. Call. Use the script.
3. **Log the outcome. Every time, no exceptions.**

| Outcome | Use when | Then |
|---|---|---|
| No answer | Nobody picked up | Cadence continues |
| Voicemail / message left | You left a message | Callback tracked |
| **Interested** | They want to hear more | Row moves to engaged. **Hand to Chantel same day** |
| Promised to call back | They asked you to call later | Callback tracked |
| They want to meet | They will take a meeting | Row moves to Meetings. **This is the win** |
| Not interested | Explicit decline | Terminal. Never Archive |
| Wrong number | Bad data | Fix or mark wrong contact |
| Stop communications | They asked us to stop | **DNC. No exceptions, ever** |

**Rows with a click get called first.** A provider who clicked the link and has not activated is the hottest
row in the queue — the system already flags this state (`clicked_not_activated`). Work those before anything
else in the tab.

### What to say

The call has one job: **get a meeting.** Not to explain the program, not to send a PDF.

> *"Hi — this is \[name\] calling from Olera. We run a student caregiver program with \[University\]. We
> recruit and vet pre-health students who want clinical hours, and connect them with agencies like yours for
> caregiver roles. Are you hiring caregivers right now?"*

If yes, or maybe: **"Would you have 15 minutes with Dr. DuBose this week? I can send you his calendar right
now."** Book it on the call if you can.

If they want details first: send the one-pager **and** propose two specific times in the same message. Never
send collateral without a time attached — that is how a warm lead cools.

---

## 4. Volume caps — non-negotiable

| Phase | Cap | Note |
|---|---|---|
| Weeks 1–3 (two warm mailboxes) | **~25–30 sends/day total** | Start here regardless of ambition |
| After new mailboxes finish warmup | +10–20/day/week, ceiling ~40–50/day/mailbox | Per `../../EMAIL_LAUNCH_PLAN.md §3` |
| Calls | No cap | Calls do not damage a domain |

**Kill-switch — Esther watches, Grazy obeys:**

| Signal | Threshold | Action |
|---|---|---|
| Bounce rate | >3–4% | **Pause the mailbox.** Clean the list before resuming |
| Spam complaints | >0.1% | **Pause.** Review copy and targeting |
| Mailbox health score | below "good" | Pull it from the pool; let warmup recover |
| Reply rate → zero | trend | Not deliverability — a message problem. Register an experiment |

**Never push through a threshold to hit a weekly number.** A burned domain costs the quarter; a slow week
costs a week.

---

## 5. While a cadence runs

| Do | Don't |
|---|---|
| Work the Calls tab daily | Manually email a prospect mid-cadence — you will collide with the sequence |
| Watch the Emails tab for replies | Launch a second campaign on a running row |
| Hand interested rows to Chantel the same day | Let a cadence finish without triaging it (see P7) |
| Add a specific contact when you learn a name | Assume the system forgot to stop — supersession is automatic |

---

## 6. Weekly rhythm

| Day | What |
|---|---|
| Mon | Materialize 40 prospects (P1); launch cleared rows up to the cap |
| Tue–Fri | Calls to zero daily; launch newly cleared rows |
| Wed | Follow-up tab triage (P7) |
| Fri | Report volume + findings; flag data defects to Sess |

**Weekly targets (one site):** 100–125 emails sent · 40 calls attempted · **3 meetings booked**.

---

## 7. Escalate

| Situation | To |
|---|---|
| Bounce or complaint rate near threshold | Esther, immediately |
| Cadence did not stop after a reply | Esther → TJ (supersession bug) |
| Calls tab empty when it should not be | Esther (queue or task-generation bug) |
| Provider says they already heard from Olera on another product | Esther — **C5** collision |
| Repeated replies misunderstanding the offer | Chantel — a message problem, not a volume one |
