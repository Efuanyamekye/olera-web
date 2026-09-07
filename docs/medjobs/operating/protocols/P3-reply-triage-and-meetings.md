# P3 · Reply Triage → Booked Meeting

> **Owners:** Grazy (triage) → Chantel (commercial replies and bookings)
> **Starts when:** any inbound signal. **Ends when:** a meeting is booked, or the row is dispositioned.
> **Derived from:** Grazy's protocol Step 4, plus **D-004** (disposition), **D-005** (SLA), **D-006** (book, don't send).

**This is the highest-leverage protocol in the workspace.** Everything upstream exists to produce a reply;
everything downstream depends on what we do with it in the first 24 hours.

---

## 1. The SLA

| Signal | Response time |
|---|---|
| Any inbound reply | **1 business day** |
| A reply asking for a meeting or a time | **Same day** |
| A voicemail or callback request | **Same day** |

**Why this is written in bold everywhere:** an interested provider emailed on August 5 and had not been
answered by September 4. Logan on the standard we are replacing: *"Diana would have been responding the next
hour."* One business day is the enforceable version of that.

**A missed SLA is a health-signal breach (H2)** and gets root-caused on Tuesday. It is not a personal
failing — usually it means the queue was not zeroed out, or nobody knew whose reply it was.

---

## 2. Triage — every reply, every day

1. Open the **Emails** tab.
2. Read the reply.
3. **Log a classification.** Every reply gets one — no exceptions.
4. Take the action that classification implies. Same day where the SLA says so.

| They said | Classification | Action | Who |
|---|---|---|---|
| "Tell me more" / "Sounds interesting" | **Interested** | **Propose two specific times today** | Chantel |
| "How much?" / "How does it work?" | **Interested** | Answer briefly, **then propose times** | Chantel |
| "Send me information" | **Interested** | Send the one-pager **with two times in the same message** | Chantel |
| "Yes, let's meet" / "Tuesday works" | **They want to meet** | Book it. Confirm in writing | Chantel |
| "Talk to \[someone else\]" | **Redirected to another contact** | Add the new contact; restart appropriately | Grazy |
| "Not right now" / "We're fully staffed" | **Not interested** | Terminal. **Never Archive** | Grazy |
| "Remove me" / "Stop emailing" | **DNC** | Terminal, permanent, no exceptions | Grazy |
| Auto-reply / out of office | No classification | Leave the cadence running | — |
| Bounce | System-handled | Fix the address or mark wrong contact | Grazy |

---

## 3. Booking the meeting — the conversion event

> **The rule: book the meeting; do not send collateral instead.** Direct from Logan: *"Don't just throw on
> the contract. Don't throw them to the landing page. Just be like, why don't you meet with Dr. DuBose and
> talk about it? Set up a meeting. Is there a good time for you? I've got his Calendly right here."*
>
> Historically ~100% of providers who **agree to the meeting** convert. The filter is the agreement, not the
> meeting. So every reply funnels to one ask.

### How to ask

Always propose **two specific times** plus the calendar link. "Let me know when works" transfers the work to
a busy person and it dies there.

> *"Happy to walk you through it — Dr. DuBose runs these conversations. He has **Wednesday 2pm** or
> **Thursday 10am** open. Either work? Here's his calendar if another time is easier: \[link\]"*

### If they want information first

Send the one-pager **and** two times, in the same message. Never one without the other.

### If they ask the price

Answer it plainly — but the answer is **blocked on C1**. Until it is decided, say:

> *"Pricing is straightforward and tied to hires — Dr. DuBose will walk you through the exact terms on the
> call, and there's no cost to look at candidates first."*

**Do not invent a number.** A number quoted once is a number we owe them.

### Once booked

1. Log **They want to meet** → then **Meeting is booked** with the date and time.
2. Confirm in writing with the calendar invite.
3. Send a one-line prep note to whoever is running it: who they are, what they said, what they asked.

---

## 4. Disposition — get this right

> ⚠️ **Never mark a decline as Archive.** Archive means `no_response_closed`, which **auto-revives on any
> inbound email**. A provider who declined will send an out-of-office at some point, get resurrected into an
> active queue, and be worked again. That is a complaint-rate risk we would be creating ourselves. See **C4**
> and **D-004**.

| Situation | Use | Behavior |
|---|---|---|
| They explicitly declined | **Not interested** | Terminal. Manual reopen only |
| They asked us to stop | **DNC** | Terminal. Permanent |
| Wrong business or dead number | **Wrong contact** | Terminal |
| They pointed us elsewhere | **Redirected** | New contact created |
| **Silence after a full cadence** | **Archive** (via P7) | Auto-revives if they ever reply |

**One line to remember: Archive is for silence. Everything else has its own word.**

---

## 5. The meeting itself

| Stage | Who | Weeks |
|---|---|---|
| Runs the meeting | Logan | 1–2 |
| Runs it, Logan on the call | Chantel | 3–4 |
| Runs it alone | Chantel | 5+ |

Content and follow-up: **P4**.

### Meeting outcomes — log every one

| Outcome | Meaning | Next |
|---|---|---|
| Done — needs more email | Held, follow-up needed | Row returns to Emails with a follow-up flag |
| Became a Client | They committed | Conversion — P4 |
| Not a fit | Held, they declined | Terminal decline |
| No-show / rescheduling | Did not happen | Rebook. **Always rebook once** before giving up |
| Still finding a time | Coordinating | Stays in Meetings |

**A no-show is not a decline.** Rebook once, warmly. People miss meetings.

---

## 6. Daily rhythm

| | |
|---|---|
| **AM (Chantel)** | Emails tab → every provider reply answered or booked. Meetings tab → today confirmed, tomorrow prepped |
| **AM (Sess)** | Partner and student replies (P5, P6) |
| **Continuous** | Meeting requests answered same day |
| **Zero-out** | Every inbound answered or dispositioned. **Nothing carries overnight unexplained** |

---

## 7. Escalate

| Situation | To |
|---|---|
| A reply you cannot answer without a price | Logan — **C1** |
| A provider asking for contract changes | Logan, always |
| A reply mentioning a university relationship | Logan |
| More than 2 SLA breaches in a week | Esther — a capacity or ownership problem |
| Replies consistently misunderstanding the offer | Chantel → register an experiment |
