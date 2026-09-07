# Protocols

> The SOPs the pod runs from daily. **These are what an intern is handed on day one.**
>
> A protocol is standardized on purpose: same steps, same order, same vocabulary, every time. If a protocol
> is wrong, **log it and change it** (`../08-ITERATION-LOG.md`) — do not silently invent a parallel process.
> A silent workaround is how a CRM dies: the system looks fine while everyone keeps a private spreadsheet.

| # | Protocol | Owner | Covers |
|---|---|---|---|
| [P1](P1-prospect-to-preflight.md) | Prospect → Pre-Flight | Sess (data) → Grazy | Site setup, provider data quality, materialization, the launch gate |
| [P2](P2-launch-and-work-the-cadence.md) | Launch & work the cadence | Grazy | Campaign launch, the call queue, volume caps, deliverability rails |
| [P3](P3-reply-triage-and-meetings.md) | Reply triage → booked meeting | Grazy → Chantel | Reply SLA, classification, booking, disposition |
| [P4](P4-conversion-and-accounts.md) | Meeting → Client → placement → billing | Chantel | The conversion meeting, onboarding, interviews, offers, invoicing |
| [P5](P5-partner-recruitment.md) | Partner recruitment | Sess | Advisors, student orgs, department heads, flyer distribution |
| [P6](P6-student-supply.md) | Student supply | Sess | Applications, completion, vetting, going live |
| [P7](P7-followup-reengage-archive.md) | Follow-up, re-engage, archive | Grazy | The end-of-cadence triage — Grazy's Steps 5–6, corrected |

---

## The nine rules that apply to every protocol

1. **One clear next action per row, always.** Grazy's golden rule, and the one that governs everything else.
2. **Log every outcome.** If it is not logged, it did not happen. Above ~5 live relationships human memory
   fails — *"as soon as it's above 5 people, you get fucked."*
3. **Inbound within 1 business day.** Meeting requests same day. This is the failure that cost us a live
   provider for 30 days.
4. **Book the meeting; don't send collateral instead.** The meeting is the conversion event.
5. **Archive is only for silence.** Never for a decline — Archive auto-revives on inbound reply.
6. **Never work around a break silently.** Log it: screen, click, expected, actual.
7. **Respect the volume caps.** Deliverability damage is not recoverable inside this quarter.
8. **Supply runs one site ahead of demand.** Never behind.
9. **Protocol governs mechanics; experiments govern messages.** If you are changing *what we say*, that is
   `../05-EXPERIMENTS.md`, not an ad-hoc edit here.

---

## Where things actually live in the admin UI

Grazy's protocol uses names that predate the current UI. This table is the translation — it saves every new
operator an hour (see conflict **C7**).

| You are looking for | It is here |
|---|---|
| Provider prospects, pre-flight | **Providers** tab → open the row → Pre-Flight Checklist in the drawer |
| Partner prospects (advisors, orgs, dept heads) | **Partners** tab |
| Calls due today | **Calls** tab |
| Replies, opens, clicks, bounces | **Emails** tab *(internally still `replies`)* |
| Meetings in flight or booked | **Meetings** tab |
| Finished cadences awaiting triage | **Follow-up** tab |
| Archived / no-response rows | **⋯** overflow menu → **Archive** |
| Clients, Partners, Candidates, All | **⋯** overflow menu |
| Sites and catchments | Sidebar → **Sites** |
| Everything logged, ever | Sidebar → **Logs** |
| Smartlead / webhook status | `/admin/medjobs/integrations` |

**There is no "Pre-Flight" tab.** Pre-flight is a checklist inside the row drawer, reached from Providers.

**Smartlead is the send engine, not a work surface.** Replies, opens, clicks and bounces land in the
**Emails** tab via the webhook. If they are not appearing, the webhook secret is not set — see **O-3**;
that single missing value blinds half of this workspace.

---

## Vocabulary — use these words exactly

Shared with the engineering docs so ops and engineering describe the same event the same way.

| Word | Means |
|---|---|
| **Site** | A university plus its provider catchment. The unit of expansion |
| **Prospect** | A provider or stakeholder we have not converted |
| **Pre-flight** | Getting a row contactable: verified phone, email, address |
| **Cadence** | The scheduled multi-day email + call sequence |
| **Client** | A converted provider *(exact definition blocked on **C2**)* |
| **Partner** | A university stakeholder who has agreed to distribute the program |
| **Candidate** | A student with a live, complete profile |
| **Placement** | A confirmed hire — the billing event and the north star |
| **Distribution evidence** | Recorded proof a Partner actually shared the program |
| **Archive** | No response after a full cadence. **Not** a decline |
| **Not interested** | An explicit decline. Terminal; manual reopen only |
| **DNC** | They asked us to stop. Terminal. No exceptions, ever |

---

## Onboarding a new operator (Stage 2 prerequisite)

The test of these protocols is whether a new person can run a lane from them alone. Two weeks:

| Day | What |
|---|---|
| 1 | Read `../00-OPERATING-SYSTEM.md` and this README. Get admin access. Shadow the daily zero-out |
| 2 | Read the protocol for your lane. Walk 3 rows end to end **with** your supervisor |
| 3–5 | Run your lane **supervised**. Every outcome reviewed same day |
| 6–10 | Run your lane solo. Supervisor spot-checks 20% of rows |
| 10 | Scorecard: volume, logging discipline, SLA adherence, findings surfaced |

**If a new operator cannot run a lane from the protocols in two weeks, the protocols are wrong — not the
operator.** Fix the ambiguous step and log the change.
