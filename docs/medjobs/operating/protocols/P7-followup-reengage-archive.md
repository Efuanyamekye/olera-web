# P7 · Follow-up, Re-engage, Archive

> **Owner:** Grazy
> **Starts when:** a cadence finishes with no meeting. **Ends when:** the row is re-engaged or archived.
> **Derived from:** Grazy's protocol Steps 5–6 — the strongest part of the original — corrected per **C4**.

---

## 1. The rule this protocol enforces

> **If a prospect is in the Follow-up tab, there is no active campaign running.**

Grazy's system rule, and it is correct. The system enforces it automatically through cadence supersession.
Your job is to make sure nothing **sits** in Follow-up untriaged. A row in Follow-up has no next action until
you give it one — that is the whole reason the tab exists.

---

## 2. What lands in Follow-up

Rows whose latest cadence **finished with no meeting and no current campaign**. Not declines, not DNCs, not
wrong contacts — those are terminal and live elsewhere. Follow-up is the middle ground: *we tried, they did
not say no, they did not say yes.*

---

## 3. The triage — weekly, Wednesday

Open the **Follow-up** tab. For every row, answer one question: **was there any activity?**

### Where "activity" comes from

Opens, clicks, replies and bounces arrive from Smartlead and land on the row. The system derives an
engagement state from them:

| State | Means |
|---|---|
| `no_engagement` | Email landed, never opened |
| `opened_not_clicked` | They read it |
| `clicked_not_activated` | **They clicked and did not act — the hottest row in the tab** |

> ⚠️ **If no row ever shows opens or clicks, the webhook secret is not set** (**O-3**). The entire branch
> below is inoperable without it and every row will look identically dead. Check
> `/admin/medjobs/integrations` before concluding that nobody is engaging.

### The decision

| Activity | Action |
|---|---|
| **Clicked** | **Re-engage — highest priority.** They were interested enough to click and something stopped them. Call first, then launch the re-engagement cadence |
| **Opened, multiple times** | Re-engage. Repeated opens mean the message is landing but the ask is not |
| **Opened once** | Judgment. Re-engage if the provider is a good fit (right size, hiring); otherwise archive |
| **Replied earlier, then went quiet** | Re-engage with a personal note, not a cadence. They know us now |
| **No activity at all** | **Archive** |

---

## 4. Re-engaging

The re-engagement cadence exists in the system (`reengagement_intro` → call → `reengagement_final`). Launch
it from the row.

**Customize the opener when you have a reason to.** A row that clicked the candidates link is a different
conversation than a row that opened once:

> *"Hi \[name\] — I know staffing is relentless. We now have \[N\] students at \[University\] looking for
> caregiver roles near you. Worth 15 minutes?"*

**Say something new.** A re-engagement that repeats the first cadence teaches them they were right to ignore
it. Something has genuinely changed since the first sequence — you have more students, or a nearby agency
has hired one. Lead with that.

**When to stop:** after a re-engagement cadence finishes with no activity, **archive**. Endless re-engagement
of a dead row is how a queue silts up and a domain gets burned. Grazy's original is right: *"continue only
when there are meaningful activity signals."*

---

## 5. Archiving — and what it does not mean

> ⚠️ **Archive is only ever for silence.**

Archive sets `no_response_closed`, which **auto-revives the row to engaged if they ever reply.** That is a
feature — a provider who surfaces in six months lands back in the queue automatically. It is also exactly why
Archive is wrong for a decline: mark a decline as Archive and their next out-of-office resurrects them into
an active queue, and they get worked again. See **C4**.

| Situation | Use |
|---|---|
| Full cadence, no engagement, no reply | **Archive** ✅ |
| They said no | **Not interested** |
| They asked us to stop | **DNC** |
| Wrong business or dead number | **Wrong contact** |
| They pointed us elsewhere | **Redirected** |

**Archiving is not failure.** A clean archive is a correct decision that protects the domain and the queue.
Most cold prospects archive; that is what cold outreach is.

---

## 6. Weekly rhythm — Grazy

| | |
|---|---|
| **Wednesday** | Full Follow-up triage. Every row re-engaged or archived. **The tab ends the day empty** |
| Ongoing | Do not let rows accumulate — a full Follow-up tab means the cadence is producing more than the triage can absorb |

**Target:** Follow-up tab at zero every Wednesday. If it is consistently full, either volume is too high for
one operator or the triage is not happening — both are Tuesday agenda items.

---

## 7. What this tells us

The Follow-up tab is the best diagnostic surface in the system. Read it every week:

| Pattern | Means | Do |
|---|---|---|
| Everything at `no_engagement` | Emails are not landing, or the subject line is dead | Check deliverability first (Esther), then run **E-2** |
| Lots of opens, no clicks | The message lands, the ask does not | Message experiment — **E-3** |
| Lots of clicks, no conversions | The landing experience is losing them | Product problem → Esther → TJ |
| High re-engagement success | The first cadence is too short | Consider lengthening it |

**Report the pattern on Tuesday, not just the count.** "Forty rows archived" is bookkeeping; "forty rows
archived and none of them opened anything" is a deliverability emergency.
