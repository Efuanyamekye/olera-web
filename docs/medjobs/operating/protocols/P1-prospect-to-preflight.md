# P1 · Prospect → Pre-Flight

> **Owners:** Sess (site data) → Grazy (prospecting and pre-flight)
> **Ends when:** the row has the contact information needed to launch a cadence.
> **Derived from:** Grazy's protocol Steps 1–2, corrected per **C3** and **D-003**.

---

## 1. Site setup — Sess, once per site

Do this before anyone prospects. Bad data at this stage poisons every metric downstream, and it is the
cheapest thing in the whole funnel to fix here.

| # | Step | Done when |
|---|---|---|
| 1.1 | Create the Site in `/admin/medjobs/sites` — the catchment cities cascade automatically | Site exists with a city list |
| 1.2 | **Audit the catchment.** Are these cities genuinely commutable for a student from campus? Drop any that are not | City list defensible |
| 1.3 | **Audit the provider list.** Every row must be a real, operating, **non-medical home care agency** in a catchment city. Flag facilities, medical home health, closed businesses, duplicates | A clean count you would defend out loud |
| 1.4 | **Enrich the top 40** — legal name, phone, email, full address, website | 40 rows with required fields |
| 1.5 | Record the audit: how many surfaced, how many survived, why the rest were dropped | Note in `../08-ITERATION-LOG.md` |

**Why 40.** One week of prospecting at the volume in `../03-METRICS.md`. Enriching 400 rows before anyone
calls one is how a team spends three weeks in a spreadsheet and learns nothing.

**Escalate to Esther if:** more than 30% of surfaced providers fail the audit. That is a catchment or
directory defect, not a data-entry chore, and it will recur on every future site.

---

## 2. Materialize — Grazy, weekly

Provider prospects surface **virtually** until you start work on them; materializing creates the actual
outreach row.

1. Open the **Providers** tab, filtered to your Site.
2. Pick the week's batch (target **40**), preferring rows Sess has already enriched.
3. Materialize them. Each becomes a row at `prospect` status.
4. Sanity-check the batch: right city, right business type, no duplicates.

**Do not materialize hundreds "to have them ready."** A materialized row is a promise to work it; unworked
rows make every queue count lie.

---

## 3. Pre-flight the row — Grazy

**Goal: make the row contactable.** Nothing more.

Open the row → the Pre-Flight Checklist in the drawer.

| Tier | Fields | Effect |
|---|---|---|
| **Required** | General contact email · phone · full address · contact form resolved (if the site has one) | **Blocks launch** |
| **Recommended** | Website · contact form URL · fax | Encouraged; does not block |
| **Optional** | Research notes | For the next human who opens this row |

### 3.1 Research

Website, Google Business Profile, state licensing directory, the Olera listing. Find:

- A **general contact** — `info@`, the front desk line.
- Ideally a **specific contact** — the owner, administrator, or hiring manager by name. Named humans convert
  far better than `info@`; this is the highest-value minute you will spend on the row.
- Whether they are actually hiring, if it is visible.

### 3.2 Pre-flight call — optional, valuable, **not a gate**

> ⚠️ **This is where this protocol departs from Grazy's original.** The original required a completed
> pre-flight call before launch and archived after three unanswered attempts. That deletes providers who have
> a valid email and were never emailed once. See **C3** and **D-003**.
>
> **New rule: if the required fields are present, launch.** Pre-flight calls enrich; they do not gate.

Call when you have a phone number and time. Use the MedJobs call script. Ask for the person who handles
hiring; confirm the best email.

Log every attempt via **Call to obtain information**:

| Outcome | What it means | What happens |
|---|---|---|
| No answer | Nobody picked up | Logged. Row stays in pre-flight; **launch is not blocked** |
| Voicemail / message left | You left a message | Logged |
| Wrong number | Number is dead or wrong business | Fix the record, or mark **Wrong contact** |
| **Reached someone** | A human answered | Opens the engagement panel — see below |

**When you reach someone**, the engagement panel converts the call into real progress:

| Option | Use when | Effect |
|---|---|---|
| Just got info | Front desk gave you a name or an email | Record updated |
| Promised to call back | They asked you to call later | Callback tracked |
| **Interested** | They want to hear more | Row jumps to engaged — **campaign launch becomes unnecessary** |
| Became a Client | They committed on the call | Conversion fires |
| Not interested | Explicit decline | Terminal. **Not Archive** — see P3 §4 |

**The pre-flight engagement bypass is a feature, not a shortcut.** A live human beats a cadence every time.
If the call converts, do not launch the campaign afterwards.

---

## 4. The launch gate

Launch when **all required fields are present**. That is the entire gate.

| Situation | Do this |
|---|---|
| Required fields complete | **Launch** (P2) |
| Missing email, findable | Keep researching — this is the one field genuinely worth chasing |
| Missing email, not findable after ~10 minutes | Park with a reason. Revisit only if a contact form or phone route opens |
| Wrong business type / closed | **Wrong contact**. Tell Sess — it is a data defect, and it usually has siblings |
| They already said no | **Not interested**. Never Archive |

**Time-box the row.** Roughly 10 minutes of research; if the email is still not findable, park it and move
on. Forty contactable providers beat twelve perfect ones.

---

## 5. Daily rhythm — Grazy

| | |
|---|---|
| **AM** | Pre-flight new rows from Monday's batch |
| **Ongoing** | Pre-flight calls between queued-call blocks |
| **Zero-out** | Every new prospect is pre-flighted, launched, or parked with a reason |

---

## 6. Escalate

| Situation | To | Why |
|---|---|---|
| >30% of a batch fails the audit | Sess → Esther | Catchment or directory defect |
| The checklist blocks launch on a field you cannot find | Esther | Possibly the wrong gate |
| Providers appearing in more than one system's outreach | Esther → TJ | Double-emailing risk — see **C5** |
| A row is clearly a facility, not home care | Sess | Data class error; check the batch |
