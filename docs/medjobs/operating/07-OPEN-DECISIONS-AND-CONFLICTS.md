# Open Decisions & Conflicts

> **Purpose:** every place the meeting, the admin protocol, and the shipped code disagree — stated as a
> conflict, not silently reconciled — plus the founder decisions and missing facts that block execution.
>
> **Rule:** a `C-` item is a *contradiction* between two sources that both look authoritative. An `O-` item
> is a *hole* — nobody has decided, or nobody knows. Both are resolved the same way: a named owner, a date,
> and an entry in `06-DECISIONS.md`. Nothing here gets resolved in Slack without landing in that log.
>
> **Sources:** `sources/2026-09-04-strategy-meeting-distillation.md` (meeting),
> `sources/graize-outreach-protocol-v0.1.md` (protocol), `../OPERATIONAL_BRIEF.md` +
> `../PROVIDER_FUNNEL_BUILD_PLAN.md` + repo code (system).

---

## Blocking conflicts — resolve before the pod runs a full week

### C1 — Price, payer, and billing timing are three different things in three places 🔴

| Source | Amount | Who pays | When |
|---|---|---|---|
| Meeting (Logan, verbatim) | **$250+ per hire** | Provider only | **Monthly in arrears** — "hire 3 in October → billed $750 on Oct 31" |
| Shipped code — `lib/medjobs/placements.ts:20` | **$100** | **Both parties** (provider *and* student) | Authorize at offer, capture at confirm |
| `../PROVIDER_FUNNEL_BUILD_PLAN.md` build log | $100 — *with its own open note: "confirm if $100 total was intended"* | Both | Same |
| Meeting (Logan, same session) | **$0** | — | "I took out all paywalls, because right now we're pre-pilot" |
| Master funnel (Section 2, MA5 → MA6) | — | Provider | **After 6+ shifts worked** — the bill is not issued until the placement has stuck |

**A fourth variable appeared with the master funnel: the billing *trigger*.** Gating the invoice on
**6+ shifts worked** is a commercially strong promise — *you pay once it has actually worked* — but nothing
in the product tracks shifts. The only work-volume concept that exists is `hours_threshold = 120` on the
placement record, which backs the guarantee, not the bill. Shipped code bills at hire confirmation; the
meeting described monthly billing in arrears. Three different triggers, none of them shift-based.
**Decide the trigger and the amount together** — and if shifts are the trigger, someone has to build shift
capture, which is net-new work nobody has scoped.

**Why it blocks:** Chantel cannot answer "how much does this cost?" on a call, which is the exact thing she
asked for in the meeting. The Jan 5 CRP submission needs *revenue*, and revenue needs a number that a
provider has agreed to. A 2.5× spread and a disagreement about whether the cash-poor side pays at all is
not a detail.

**Sub-question that must be answered with it:** the student fee. `PROVIDER_FUNNEL_BUILD_PLAN.md §7` already
parks "student-fee amount/affordability — **the one seam where the student could balk**." Charging the
student is not implied by anything Logan said in the meeting; it appears only in code.

**Owner:** Logan (with TJ). **Needed by:** before the first conversion meeting of the operational sprint.
**Recommendation:** ship the provider-paid, post-hire model Logan described ($250/hire, invoiced monthly),
set the student fee to $0 for 2.0, and treat "does a student ever pay" as an experiment (`E-7`), not a default.
Post-hire provider-only billing is also the easiest thing to say out loud on a cold call: *you pay when you hire.*

---

### C2 — "Client" means three different things 🔴

| Definition | Where | Set by |
|---|---|---|
| Provider met with Logan and signed the pilot agreement | Meeting — the human process | A human, in a Google Doc / email |
| `business_profiles.metadata.interview_terms_accepted_at` | `../OPERATIONAL_BRIEF.md §2.5` — the CRM's `converted` stage and the Partner-Prospect unlock gate | Self-serve `POST /api/medjobs/pilot/activate` |
| `medjobs_eligibility_completed_at` | `../PROVIDER_FUNNEL_BUILD_PLAN.md` Phase A — **the product's actual access gate** for the candidate board, invites, and banner | The eligibility screener |

The build plan deliberately **re-keyed product access away from pilot-terms to eligibility**, and replaced
the `PilotTermsModal` on the welcome banner. The CRM's conversion gate was not re-keyed with it.

**Consequence, concretely:** a provider can complete the screener, browse candidates and send interview
invites while the CRM still shows them as an unconverted prospect in an active cadence — so they keep
getting cold emails after they have started using the product. Conversely a row can read `converted` in the
CRM while the provider has never completed the screener and cannot actually use the board.

**Why it blocks:** it is the denominator of the conversion metric the pod reports on Jan 5, and it decides
whether the cadence stops. **Owner:** TJ (system) with Logan (business meaning). **Needed by:** Day 3 of the
sprint. **Recommendation:** make **pilot-terms acceptance** the single Client definition, have the screener
write it alongside eligibility, and keep eligibility as the product's feature gate underneath it. One flag
means "they said yes to the deal"; the other means "they told us what shifts they need."

---

### C3 — "Archive after 3 unanswered pre-flight calls" contradicts the aggression doctrine 🟠

- **Protocol, Step 2.4–2.5:** three pre-flight call attempts, then **Archive** — and Step 2's hard rule,
  *"Do not launch the D0–30 campaign until the pre-flight process is completed."*
- **System, `../OPERATIONAL_BRIEF.md §2.4`:** *"If $20M were paid to reach a single provider, a human would
  use every channel."* The Pre-Flight Checklist blocks launch on **missing contact information** — not on a
  completed phone call.

Read together, the protocol archives providers who have a valid, verified email address and were **never
emailed once**, because nobody picked up the phone three times. That is the single highest-volume leak in
the current operating model, and it happens before the cheapest channel is ever used.

**Also:** the system has **no attempt counter**. "3 attempts" is untracked and unenforceable today — it lives
in the operator's head.

**Owner:** Grazy + Esther. **Recommendation (adopted in `protocols/P1`, reversible):** pre-flight calls
*enrich* the record; they do not *gate* the campaign. If required contact fields are present, launch. Calls
continue in parallel as cadence call-days. Archive only via the Follow-up rules in `protocols/P7`. If this
is wrong, the counter-evidence will show up as a bad reply/complaint rate within two weeks — which is
exactly why it is written as reversible.

---

### C4 — "Not interested → Archive" would resurrect declined providers 🟠

The protocol cheat sheet collapses disposition into Archive: *"Provider is not interested → Disposition →
Archive if appropriate."*

In the system these are different terminal states with different behavior:

| State | Behavior |
|---|---|
| `not_interested` / `do_not_contact` / `wrong_contact` | Terminal. Manual `reopen` only. **Excluded from the Archive tab by design.** |
| `no_response_closed` (what the Archive tab holds) | **Auto-revives to `engaged` on any inbound reply** (`handleLogReply`) |

Marking a provider who explicitly declined as Archive means their next inbound email — an out-of-office, a
"please remove me" — flips them back into an active queue and they get worked again. That is the
complaint-rate risk in `../EMAIL_LAUNCH_PLAN.md §5` arriving by our own hand.

**Resolution (no founder input needed — this is a correctness fix):** "Not interested" always logs
`Not interested`; "Stop communications" logs DNC; **Archive is only ever for silence.** Written into
`protocols/P3` and `protocols/P7`. Tracked here because it changes what the protocol's cheat sheet says.

---

### C5 — Does MedJobs still own provider outreach? 🟠

- **Protocol:** assumes MedJobs owns provider outreach end to end (Steps 1–6 are entirely provider outreach).
- **Meeting — Esther's proposal, which Logan endorsed:** *"Strip down MedJobs to handle bringing in the
  students, and cold outreach would just focus on bringing in providers,"* plus a third conversion layer
  that pitches Ads or MedJobs depending on the provider.
- **Meeting — Logan, minutes earlier:** *"the CRM is 100 times more important than anything else,"* one
  unified system.
- **Meeting — Logan, minutes later:** *"Scratch that. It can totally be unique CRMs for these purposes."*
- **Code:** both systems exist and are separately maintained — `app/admin/medjobs/*` and
  `lib/provider-outreach/*` + `app/api/admin/provider-outreach/*`, each with its own Smartlead bridge and
  webhook.

**Why it matters now:** it decides which surface the pod opens every morning, who owns the provider queue,
and whether Grazy's protocol keeps running where it runs today.

**Owner:** Esther (proposal) → Logan + TJ (decision). **Needed by:** the Tuesday Sept 8 session.
**Recommendation:** **decide the target, but do not migrate during the sprint.** MedJobs 2.0 runs where it
runs today. Re-platforming the provider queue mid-sprint would cost the pod its only working pipeline for
the sake of an architecture that has no proven operating model behind it yet. Ship the operating model
first; move it second.

---

### C6 — Provider-first sequencing produces a client with an empty candidate board 🟠

- **Meeting (Logan):** get one signed provider — *"here's your egg"* — **then** go get students.
- **Build plan `§9`:** *"Throughput is ultimately gated by student supply — the provider funnel converts only
  as fast as recruiting feeds matching students,"* and lists "seeding-market fallback / no students" as a
  **HIGH structural** fall-off. Loop 2b ("a student joined" re-activation) exists specifically because this
  is expected to happen.

A provider who converts, logs in, and sees an empty board is the worst moment in the funnel — it is the one
place where our own success creates the churn.

**Resolution (adopted in `01-EXECUTION-PLAYBOOK.md`, needs founder sign-off on the ratio):** supply runs
**one site ahead, in parallel**, not after. The provider-side conversion meeting is not booked until the
site has a **minimum viable board** (see `04-SCALE-GATES.md`, Gate S). **Owner:** Logan to confirm the
minimum board size; recommendation is **8 live candidates**.

---

## Non-blocking conflicts — fix the wording, keep moving

### C7 — Tab vocabulary in the protocol doesn't match the UI 🟡

| Protocol says | Actually is |
|---|---|
| "Pre-Flight Queue" | Not a tab. Pre-flight is a **checklist inside the row drawer**, reached from the **Providers** tab |
| "Call Queue" | **Calls** tab |
| "Smartlead (for replies)" | **Emails** tab — replies, opens, clicks and bounces land in-app via the webhook; Smartlead is the send engine, not the daily work surface |
| "Follow-Up Tab" | **Follow-up** tab ✅ (matches) |
| "Archive" | Archive — in the **⋯ overflow menu**, not the primary tab row |

Current primary tabs: **Providers · Partners · Calls · Emails · Meetings · Follow-up**
(`lib/student-outreach/tab-config.ts`). Costs every new intern an hour. Fixed in `protocols/README.md`.

### C8 — Founder-in-the-loop: is Logan the closer permanently, or temporarily? 🟠

*"Put me in front of advisors, student orgs, students and providers"* and *"one of the most useful things I
could do would be to completely step back"* — same meeting, both sincere. The conversion meeting converts at
~100% **because it is him**, and his calendar is therefore the throughput ceiling of the entire model.

**The master funnel raised the stakes on this.** Section 2 of the operating plan puts Logan at **PR2**
(the provider meeting) and **ST2** (the advisor meeting) as standing roles, not transitional ones. That is a
coherent design — the meeting converts because of who he is — but it makes his calendar the ceiling on how
many sites we can run, and it is a different business at scale than one where the meeting is transferable.
The two readings need reconciling before we build stage protocols on top of either.

**Owner:** Logan. **Recommendation:** don't pick a side, sequence it. **Logan runs every conversion meeting
in Weeks 1–2. Chantel co-attends every one. From Week 3, Chantel runs the meeting with Logan on the call.
From Week 5, Chantel runs them alone and Logan attends by exception.** The handoff rate is a scale gate
(Gate F, `04-SCALE-GATES.md`), so it gets measured instead of hoped for. If the conversion rate falls when
Chantel leads, that is a finding worth having in October rather than in January.

### C9 — Platform attrition: enforcement vs. experience 🟡

Logan: terms + removal. TJ: *"you don't want that adversarial policing… make the experience way better."*
Largely settled by the build plan (sign-in-wrap non-circumvention terms + the student's on-platform
credential as the primary moat). Logged so nobody re-opens it; revisit only if a real circumvention appears.

---

## Open questions — nobody has decided, or nobody knows

| # | Question | Owner | Blocks | Recommendation |
|---|---|---|---|---|
| **O-1** | **Which university is Site #1?** The whole sprint is scoped to one site and no site has been named. Logan's existing university relationships are the deciding input. | Logan | Everything. Day 1. | Pick where Logan already has an advisor relationship, not the biggest school |
| **O-2** | Is migration `103_medjobs_placements.sql` applied in production? The file is in the repo; the build log says *"must be applied before the API works."* | TJ | Any confirmed placement, therefore any revenue | Verify Day 1; it is a two-minute check |
| **O-3** | Is `SMARTLEAD_WEBHOOK_SECRET` set? The webhook is **inert without it** (`../EMAIL_LAUNCH_PLAN.md §7`) — no opens, clicks, replies or bounces reach the app. | TJ | The entire Emails tab, the Follow-up tab, and protocol Step 5's activity-gated re-engagement | Verify Day 1 at `/admin/medjobs/integrations` |
| **O-4** | Which cold-sending domain and mailbox pool, and has warmup started? `../EMAIL_LAUNCH_PLAN.md §2–3` needs a 2–4 week runway that has not visibly begun. | TJ | Volume above ~30 sends/day | Start warmup Day 1 regardless of other decisions — it is the longest-lead item in the plan |
| **O-5** | Stripe is **stubbed** in `app/api/medjobs/placements/route.ts` — there is no capture path. How does the first provider actually get billed? | TJ + Logan | Revenue on the Jan 5 submission | Manual invoice for the first 10 hires; wire Stripe after C1 is settled. Do not block hires on billing infrastructure |
| **O-6** | Where is Diana's flyer? The meeting says the current one is *"terrible but functional"* and hers went through 3 iterations and *worked*. | Logan | Supply-side throughput, from the first partner meeting | Recover it Day 1; if unrecoverable, it becomes experiment E-4 |
| **O-7** | Reply SLA — an interested provider went **30 days** unanswered. What is the commitment? | Pod | Nothing; adopt and move | Adopt now: **inbound reply answered within 1 business day; meeting-request replies same day.** Written into `protocols/P3` |
| **O-8** | Who owns the shared support inbox, and does it surface in the CRM? Chantel: *"I should be able to log in and see all of that."* | Esther | Chantel's daily throughput | Assign a human owner this week; system unification is a separate build |
| **O-9** | Does the pod hire interns for 2.0, how many, and paid or credit? Logan wants student interns doing the grunt work in exchange for research authorship. | Logan | Scale phase, not the sprint | Decide at the Gate review, not before — hiring into a broken process multiplies the breakage |
| **O-10** | What research data must be captured **from the first placement**? 500 placed students with satisfaction data is the CareFleet/NIH evidence base — retroactive collection is impossible. | Logan | Nothing today; everything in 12 months | Add three fields to the post-placement check-in in Week 1. Cheap now, unrecoverable later |
| **O-11** | Does provider cold outreach continue at current intensity while MedJobs runs? **Chantel asked this in the meeting and it was not answered.** | Logan + TJ | Chantel's and Grazy's weekly hours | Answer it at the Tuesday session; an unanswered capacity question defaults to both, badly |
| **O-12** | Canonical name spellings. The transcript renders **Grazy** as "Gracie"/"Grazy" and **Sess** as "Seth"/"Sess"/"CES". | Pod | Nothing, but it will confuse every future reader of the source docs | Confirm spellings; this workspace uses **Chantel · Esther · Grazy · Sess** |

---

## Standing risks

| Risk | Why it is real | What we do about it |
|---|---|---|
| **Supply starves demand** | Structural, and already flagged in the build plan as HIGH | Supply runs one site ahead; Gate C blocks scaling without it |
| **Email reputation collapse** | Named as the top risk in the engineering brief; warmup has a 2–4 week lead time we have not started | Start warmup Day 0; hard volume caps; bounce/complaint kill-switch in `protocols/P2` |
| **Founder remains the bottleneck** | The conversion meeting converts *because it is him* | Scheduled handoff, measured as Gate F |
| **The pod is not full-time on this** | April 15 grant work and provider outreach compete for the same four people | O-11 must be answered; the plan assumes ~60% of four people, not 100% |
| **We standardize the wrong things** | Freezing a message that does not work yet is worse than having no protocol | The protocol/experiment split in `05-EXPERIMENTS.md`, reviewed every Tuesday |
| **Jan 5 arrives with activity but no revenue** | Stripe is stubbed; there is no capture path today | Manual invoicing from hire #1. Do not let billing infrastructure gate hires |

---

## How to close an item

1. Owner brings a recommendation to the Tuesday session (or decides solo if it is theirs alone).
2. Decision lands in `06-DECISIONS.md` with date, owner, and the reasoning — including what would reverse it.
3. This file gets the item struck through with a pointer to the decision ID.
4. Any protocol the decision changes gets a version bump in `protocols/`.

An item that sits open for **two consecutive Tuesdays** gets escalated to Logan directly with a
default action attached — "if we don't hear back by Friday, we're doing X." Silence then becomes a decision
rather than a stall.
