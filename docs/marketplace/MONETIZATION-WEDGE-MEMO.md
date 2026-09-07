# The Wedge — a brainstorming memo

What is Olera's equivalent of the $24.99 tenant screening? Thinking from first principles, grounded
in what the codebase says we can actually observe and deliver. Not a plan; a set of arguments and
candidates, ranked hard.

---

## 1. Why tenant screening worked — the actual mechanism

It is worth decomposing before we look for an analogue, because most of the obvious ideas fail one
of these tests.

1. **It sits at a decision gate the customer cannot skip.** You cannot rent a unit without deciding
   who to rent it to.
2. **It is load-bearing.** Getting it wrong costs months of lost rent and legal expense.
3. **It absorbs work the customer already had to do.** It creates no new task.
4. **It is transactional per unit and recurs with business volume.** More units, more screens.
5. **The output resolves a decision.** It is not advice about how to decide better.
6. **Zero learning curve.** Nobody needs the concept explained.

**The test:** *is there a decision gate a home-care agency cannot skip, that recurs with their
volume, that is expensive to get wrong, and that Olera can complete rather than analyse?*

Most "audit" products fail tests 1, 2 and 5 simultaneously.

---

## 2. Two findings from the code that should shape this

**We already built the audit product and gave it away.** `/provider/growth` — "Your Market" — is a
per-city × care-type market diagnostic: competitor landscape with the provider's own rank, demand,
referral map, and a where-to-focus playbook, computed on demand and cached
(`app/api/provider/market-diagnostic/route.ts`). It is free. If a competitive market audit created a
purchase moment, we would already know.

**We already have the literal tenant-screening analogue wired.** `app/caregiver/apply/Step4Background.tsx`
runs **Checkr** — *"the same service that screens drivers for Lyft and Uber"* — with
`authorizeCheck` and `authorizeShare` consents already collected from the candidate. Caregiver
background screening is a decision gate, is legally load-bearing, recurs with turnover, and the
vendor integration exists.

---

## 3. Challenging the premise before generating candidates

**Client acquisition is probably not the home-care agency's most acute pain. Staffing is.** Home-care
turnover runs extremely high, and the common failure mode is an agency *turning away* business it
cannot staff. If that holds for our providers, a Lead Conversion Checkup addresses the second-order
problem while MedJobs already points at the first.

Our own architecture says the same thing from the other direction: **a provider who receives families
and does not respond is often at capacity.** We treat that as a staffing signal in the integration
map. If that is true, the wedge lives closer to staffing than to lead conversion.

This is the single biggest challenge to the originating idea, and it is testable in a week — see
§8.

---

## 4. Recurring acute pains, ranked by severity for a home-care agency

| Pain | Frequency | Cost of failure | Can Olera see it? |
|---|---|---|---|
| Cannot staff the case in hand | Weekly | Turns away revenue | Partly — via MedJobs |
| Caregiver turnover and re-hiring | Continuous | Direct and severe | Yes — MedJobs |
| Callouts and shift gaps | Daily | Client loss | No |
| Inbound inquiry goes unanswered | Per lead | Lost client | **Yes, precisely** |
| Slow response loses the family to a competitor | Per lead | Lost client | **Yes, precisely** |
| Screening and compliance on every hire | Per hire | Legal and payer risk | Partly |
| Thin or stale online presence | Continuous | Slow bleed | Yes |
| Few or old reviews | Continuous | Slow bleed | Yes |

The two rows Olera sees *better than the agency sees itself* are the response rows. That is the
uniqueness to exploit, whatever product shape we pick.

---

## 5. Candidates

### Diagnostics

**D1 · Lead Conversion Checkup** — pain: not converting inquiries. Trigger: end of month. Output:
funnel numbers plus fixes. Value: minutes. Price: $29–49. Olera advantage: high. Upsell: Pro. Build:
low. *See §7 — I think this should be free.*

**D2 · Local Client Acquisition Audit** — **already built and free.** Do not sell it.

**D3 · Caregiver Hiring Funnel Checkup** — where candidates drop out of their hiring process.
Problem: we only see the part that runs through MedJobs, so the analysis is partial and the provider
knows it.

**D4 · Reputation Scorecard** — reviews versus local competitors. Commodity; every marketing agency
offers it free as a lead magnet. Weak.

**D5 · Referral Source Map** — who refers in this market. Genuinely interesting data, but it is
strategy, not a job. No urgency.

### Done-for-you micro-services

**M1 · First Response** — we answer your inbound family inquiries within ten minutes, on your
behalf, and hand you a warm, qualified family. Trigger: the provider sees they missed four. Output: a
returned call and a briefed family. Price: flat monthly, or per-market. Olera advantage: **highest in
the set — we own the moment the inquiry lands.** Upsell: Pro. Build: human process first, low tech.

**M2 · Screened Caregiver Pack** — three to five local, background-screened, hire-ready candidates.
Trigger: a caregiver quits. Price: per pack. Olera advantage: MedJobs pipeline plus Checkr already
integrated. Upsell: MedJobs proper. Build: medium, mostly operational.

**M3 · Background Screening Passthrough** — run Checkr on a candidate the agency found themselves.
Structurally the closest analogue. Weakness: thin margin, crowded, and **FCRA obligations are real** —
permissible purpose, adverse action notices, dispute handling. Not a casual product.

**M4 · Monthly Exclusion Sweep (OIG/SAM)** — required monthly for Medicaid-funded care, done badly by
most agencies, trivially automatable, recurs by regulation. Weakness: commodity vendors exist, and no
Olera data advantage.

**M5 · Fill This Shift** — emergency staffing for a named shift. Highest acuity in the entire list.
Weakness: this is a staffing agency, not a product; margin and liability change the business.

**M6 · Profile Build** — we construct your Olera profile from your website and Google listing.
Weakness: we should do this free; it improves the network.

**M7 · Review Request Campaign, done for you** — we ask your last twenty clients for reviews.
Partially exists and is already capped by a paywall. Reasonable small product; low differentiation.

**M8 · Google Business Profile Fix-up** — one-time cleanup. Commodity, and we would be competing with
every local SEO shop.

**M9 · Reference Check Completion** — we call and document three references on a candidate.
Genuinely painful, genuinely skipped, per-hire recurring. Underrated.

**M10 · Job Post Syndication** — post the open role to the boards that work in this city. Low value;
Indeed does it.

---

## 6. Ruthless ranking

**Top tier**

**M1 First Response.** Only product where Olera's information advantage is absolute — we know a
family reached out before the provider does. It is an action, not advice. It recurs with lead volume.
It makes the family experience *better*, so it strengthens Track B rather than taxing it. It ladders
into Pro without a seam.

**M2 Screened Caregiver Pack.** Closest thing to a true tenant-screening analogue that we can
actually differentiate: not "run a check" but "here are people you can hire." Attacks the pain I
believe is genuinely #1. Bridges to MedJobs by construction.

**M9 Reference Checks.** Small, unglamorous, universally skipped, per-hire recurring, and completable
by one person with a phone. Cheap experiment.

**Middle**

M4 exclusion sweeps (real recurring need, no advantage), M7 review campaigns (fine, small), M3
screening passthrough (right shape, wrong economics and real compliance burden).

**Weak — and why**

**D2** is already free, which is the strongest possible evidence the audit archetype does not convert
here. **D4, M8, M10** are commodities where we have no advantage and would be judged against
specialists. **D5** has no urgency. **M6** should be free because it improves the network we are
trying to grow. **M5** is a different company.

---

## 7. Pressure-testing the Lead Conversion Checkup

**Can we observe enough?** Partly, and the honest answer matters. We can see with certainty: leads
delivered, whether the email was opened, whether the provider responded on-platform, and how long it
took. We cannot see: whether they called the family, whether an assessment happened, or whether the
family became a client — except through two one-tap self-report sensors that most people never
answer. So the funnel we can show is **received → opened → responded**, and everything after that is
a guess presented to someone who knows the truth.

**That is the fatal flaw.** The provider knows their own conversion rate. Showing them a partial
funnel with estimated revenue invites them to find the error, and they will.

**Would they pay $29–49?** Probably not, for a reason worth internalising: **they already know they
are bad at follow-up.** Nobody in home care is unaware that they miss inquiries. Selling a diagnosis
of a known problem is the weakest possible offer. The tenant-screening analogy points the other way —
it *does the job*.

**Is it recurring?** Weakly. The second checkup tells them what the first one did.

**So: is audit the wrong archetype?** For this pain, yes. But the checkup is not worthless — it is
the wrong *product* and the right *sales instrument*.

**The reframe I would make.** Give the number away, unsolicited, exactly as the market diagnostic is
given away:

> *"Four families in Bryan asked for you last month. You answered one. Want us to answer the next
> one for you?"*

That is the free artifact that sells **M1**. The checkup becomes the proof, not the product. It also
means the build is trivial — we already have every number in that sentence.

---

## 8. Top three hypotheses and the cheapest test of each

**H1 · First Response.** *Providers will pay a flat monthly fee for Olera to answer their inbound
family inquiries fast.*
**Test:** pull the providers who received two or more leads in the last 30 days and responded to
none. Call ten. Open with their own number. Offer: for the next month we answer within ten minutes
and hand you a briefed family, $X. Measure how many say yes at what price, and whether B2 response
rate moves. **No code required.**

**H2 · Screened Caregiver Pack.** *Agencies will pay per pack for hire-ready local candidates.*
**Test:** offer five MedJobs pilot agencies three screened candidates for $X. Sell before building.
Measure willingness to pay, and what they say the pack is worth versus a placement fee.

**H3 · The number sells better than the audit.** *An unsolicited value statement outperforms an audit
offer.*
**Test:** twenty providers, two arms. Arm A gets the sentence in §7. Arm B gets "we'll audit your
lead conversion for $39." Measure reply rate and how many ask for help. Costs an afternoon and
settles the diagnostic-versus-action question with evidence rather than argument.

---

## 9. What this does to the flywheel

M1 is the only candidate that feeds the loop at every turn: more answered inquiries → more care
established → a provider outcome number worth showing → an easier Pro conversation → capacity
constraints surface → MedJobs → more capacity → more families placed. A diagnostic sits outside that
loop and merely describes it.

And M1 has a property no paid product usually has: **it makes the free network work better for
families.** A provider who answers is a better outcome for the family regardless of who paid for it.
That is the test any wedge should have to pass.
