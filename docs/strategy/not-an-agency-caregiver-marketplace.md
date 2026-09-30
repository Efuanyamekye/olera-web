# "Not an agency": families finding non-medical caregivers through Olera

A thinking memo, not a plan. Written 2026-09-30 from TJ's Telegram question to Cortex, the Cortex handoff that followed, Chantel Wright's September competitive research, and the committed CRP documents. No code, schema or CRP document is changed by it.

**Evidence strength** follows `docs/crp/evidence-ledger.md`: **verified** (record in hand), **pullable** (instrumented, query needed), **records-exist** (scattered), **unsupported** (no source located), **overstated** (source contradicts the wording). "Unsourced" below means an assumption or general knowledge that nobody has checked for Olera.

---

## 1. The question

TJ, 2026-09-30:

> "We get tons of families come in looking for care. We try to match them to the right agency but there are a lot of issues with this: sometimes agencies don't respond, sometimes they can't afford what the agency has to offer, sometimes the agency might not be where they're located, sometimes the agency might not be the right fit ... What if we directly help them find the right home caregivers for them, non-medical home caregivers? ... if we help people with their care not by being an agency but by being a marketplace for caregivers, we can get around this potentially."

He named it an initiative, "not an agency", limited it to non-medical home care, and called liability the central problem. He wrote that it could change the landscape for "Asian Americans". That is almost certainly dictation for "aging Americans" (the same dictation error, "Asian in America" for "Aging in America", is recorded in `lib/war-room/conversation.server.ts`). This memo reads it that way. **Assumption, confirm.**

### His follow-up, the same day

After the first version of this memo, TJ added three points (2026-09-30):

1. **Recruiting students has been extremely difficult.** Universities guard student contacts, and the model has a chicken-and-egg problem: "students and universities are less likely to sign up unless you have a provider, and providers are less likely to join unless you have students."
2. **Competing with customers is not a concern.** "Think about Amazon ... Amazon has its own goods, and it has a vendor market." Olera can also start where it has no active customer relationships.
3. **Be nimble, not doctrinaire, but not doomed either.** "As a startup, you have to be nimble and react to the situation at hand, as opposed to sticking to a broken doctrine. If students don't work, this is an obvious need to fill. However, I do want to be smart and not just do something that is doomed from the start."

This version takes all three as given. Point 2 removes the "customers become competitors" objection, and points 1 and 3 change the recommendation (sections 6 to 8).

## 2. What already exists

This is not new ground. Three things were already in place before the question:

1. **Olera 3.0's two phases (decided 2026-05-14, Product Development Meeting).** Phase 1 is students to providers, with the provider as customer. **Phase 2 is families to caregivers direct, with the family as customer and no provider in between.** TJ's idea is Phase 2. Chantel's Care Shift build (family landing pages, student profiles, booking, payments, visit tracking; the `/care-shifts` mockup in this repo) was Phase 2 infrastructure. **verified** (meeting record in Notion, summarized in team memory).
2. **Chantel's competitive research, "Research Competitors: Care Shifts"** ([Google Doc](https://docs.google.com/document/d/1-bNwS5Kwy24-0J9hxYbbBEebPkeB_kaCKjFHWBXm1I0/edit)), shared in #product-development on 2026-09-03 after TJ asked for "your summary on the service we were exploring, where we were connecting families directly to caregivers like care.com" ([Slack](https://oleraworkspace.slack.com/archives/C0A91BA205T/p1788437698548149)). Her conclusion was that Care Shift should be **a licensed agency that employs, trains and supervises every caregiver**, specifically *because* the marketplace competitors avoid that. She offered a folder of further research on marketplace vs. agency, licensing and requirements. It hasn't been collected. **verified** (document read 2026-09-30).
3. **The January CRP application commits to a different model: Caregiver Staffing, where a licensed provider employs.** Quoted in section 4. **verified**.

### The binding constraint: three gates Olera controls none of

The committed model has three gates. A university lets Olera reach students, a student signs up, and a provider agrees to hire. Each waits on the others. The meeting notes record it:

- **2026-09-28, MedJobs run-the-list meeting:** University of Florida, the highest-priority campus, "cannot post on the job board until provider names are confirmed; no providers cleared yet, this is a current blocker for student recruitment." **verified** (Notion meeting notes).
- **2026-09-25, MedJobs and Managed Ads KPIs meeting:** a campus ambassador program, one student representing Olera on campus, was floated as a way around university gatekeeping, and the focus narrowed to Indiana University. **verified** (Notion).
- **2026-06-18, Product Development meeting:** Logan called MedJobs versus Care Shifts a "false dichotomy", because both share the same student acquisition funnel. **verified** (Notion).

Family-direct removes two of the three gates. **Demand is already Olera's**: families arrive through search, the Benefits Finder and Care Navigator (225 active published family care posts, 37 in the last 30 days; **pullable**). **Supply does not need a university**: working caregivers already look for jobs in the open. The Commercialization Plan itself says Indeed generated 68% of applications to participating home-care agencies in Q1 2026 (`docs/crp/living/Commercialization_Plan_2026-08-31.txt:375-376`; **verified** as cited there, not re-checked). Students become one optional source of caregivers, not a precondition.

## 3. The three models, and who carries the risk

The whole analysis turns on one question: **who is the employer of record?** That decides who carries negligent hiring, workers' compensation, payroll taxes and worker misclassification, and whether a home-care license is needed.

**A. Registry / marketplace. The family is the employer.** Olera vets caregivers and introduces them. The family hires, schedules, pays and supervises. This is Care.com, CareLinx and CareYaya. It stays outside home-care licensure by fitting a statutory exemption. In Chantel's Texas reading, that's the registry/clearinghouse exemption (Tex. Health & Safety Code § 142.003(a)(3)), which is lost if the platform keeps client records, directs services or pays the caregiver, or the direct-hire exemption (§ 142.003(a)(13)). The family carries employer liability, taxes and supervision. **Olera carries negligent-referral and reputational risk**: its name is on the introduction even when its terms of service say otherwise. **Chantel's research; statute readings not independently checked. Unsourced for any state other than Texas.**

**B. Olera as the licensed agency. Olera is the employer.** Olera recruits, employs, trains, insures and supervises caregivers and bills families. This was Chantel's Care Shift recommendation. Olera carries all of it: licensure in every state it operates in, workers' comp, payroll, supervision, general and professional liability, and negligent hiring. In exchange, it controls the experience end to end. It is a home-care agency in every sense, whatever the initiative is called. **Chantel's research; licensing burden per state unsourced.**

**C. Broker into licensed agencies. The provider is the employer.** Olera recruits and vets new caregivers and hands them to a licensed agency, which interviews, hires, trains, insures and supervises them. This is the committed Caregiver Staffing model. The agency carries employer liability. Olera carries screening quality and its own reputation. TJ's version of C would be *family-initiated*: when a family's need can't be met, Olera supplies a vetted worker *for that family* to a partner agency that employs them. **Committed model: verified. Family-initiated variant: not yet written anywhere.**

Note that "not an agency" rules out B by name, but A is the only one that is literally not an agency. Under C, the family still receives care through an agency, just one Olera supplied.

## 4. Against what the January application commits to

Committed positions, quoted:

- `docs/crp/CANON.md:129`: "**The provider employs, trains, insures, and supervises.** Olera recruits and vets. This is what keeps the work inside licensed care, and it is the answer to every safety and liability objection."
- `docs/crp/CANON.md:116-118`: the innovation is "the infrastructure that turns a person who has never worked in eldercare into someone a licensed provider will hire, and that carries their verified record forward across employers."
- `docs/crp/CANON.md:142-147`: "One product is sold and priced during the award: Caregiver Staffing ... Families never pay, and no provider pays to be listed."
- `docs/crp/living/Commercialization_Plan_2026-08-31.txt:76-79`: Olera "connects them with licensed providers, which retain responsibility for interviewing, hiring, training, credentialing, supervision, and care delivery."
- `docs/crp/living/Commercialization_Plan_2026-08-31.txt:135-136`: "The commercial opportunity is not another directory, referral marketplace, or staffing channel in isolation."
- `docs/crp/living/Commercialization_Plan_2026-08-31.txt:330`: "Non-medical home care is Olera's initial provider beachhead."
- `docs/crp/living/Research_Strategy_2026-08-31.txt:360-361`: "Licensed providers retain responsibility for hiring, training, employment, supervision, and any provider-specific screening."

| Model | Against the January commitments |
|---|---|
| **A. Registry** | **Contradicts.** It takes the provider out as employer, which CANON calls "the answer to every safety and liability objection". Families pay (directly, for care). The CP explicitly says "not another ... referral marketplace". |
| **B. Olera as agency** | **Contradicts.** Olera becomes the employer, the reverse of "the provider employs", and families pay. It also turns every non-medical agency Olera serves into a direct competitor. |
| **C. Broker (family-initiated)** | **Extends.** Same employer model and same verified-record mechanism. The only new element is that a specific family's unmet need triggers a placement. It could be described inside the existing Aim 2 staffing pathway without rewriting either document. |

## 5. TJ's list

### Pros (of going direct, A or B)
- **It fixes the failure TJ sees.** When the family doesn't depend on an agency replying, the family gets care. The response problem is real at the top of the book: in 90 days, Willow Bend Villas answered 1 of 12 family inquiries, Meadows at Mitchell Field 1 of 6, and Franchil 0 of 5. Assisting Hands Dallas answered 3 of 3, and Pacesetter 2 of 2. **records-exist** (Cortex lookup 2026-09-30, ten providers; the share of all inquiries that ever get a reply is **unmeasured**).
- **It can be cheaper for the family.** Direct hire removes the agency margin. **Unsourced** for Olera's markets; the size of the agency markup needs a source before it's used.
- **Olera controls the experience**: matching, the verified record, follow-through. That's the strength CANON already bets on.
- **The supply side exists**: MedJobs recruits students, and the verified record (Senior Care Experience Passport) is the asset either model needs. **records-exist** (MedJobs pilot, 900 applications; ledger flags the placement count as conflicting).

### Cons
- ~~It turns customers into competitors.~~ **Set aside by TJ (2026-09-30):** the Amazon model (own goods alongside a vendor market) works, and a pilot can start where Olera has no customer relationships. Worth keeping in mind only where a paying provider operates, starting with Hoop Cares' area.
- **Liability moves toward Olera.** Under B, all of it. Under A, the reputational and negligent-referral share, which terms of service don't fully remove in practice.
- **Two-sided local liquidity.** A direct model needs caregivers available near each family, at the hours they need, continuously. Demand is thin and spread out: 225 active published family care posts, 37 in the last 30 days, with home care and home health at 93 of 249 care-type tags. **pullable** (Cortex lookup 2026-09-30).
- **Caregiver churn.** Median professional-caregiver turnover is about 75% (2024). **verified** (ledger). A direct model inherits that churn without an employer to absorb it.

### Risks, and how to reduce them
| Risk | Mitigation |
|---|---|
| An unsafe or criminal caregiver in a home | Background checks plus the verified record; start with companion-only, non-ADL work (no bathing, toileting or transfers). Chantel's research shows Papa's lightly vetted gig network logged 1,200+ complaints, including assault and theft, then faced a Senate Aging Committee inquiry, a CMS review and insurers not renewing. Vetting is the product, not overhead. **Chantel's research; public reporting, not re-checked.** |
| Caregiver no-shows | Backup coverage. This is structurally easier under C (the agency has a bench) or B (Olera has one) than under A (the family is alone). |
| Scope creep into personal care | Hard scope limits in the product. In Texas, the companion/chore exemption (§ 142.003(a)(15)) holds only while there is no hands-on personal care. **Chantel's research.** |
| Misclassification (independent contractor vs. employee) | Under A, the family is the employer, and many families won't run payroll correctly. Under B, Olera is the employer. Both need legal review before launch. **Unsourced.** |
| Losing the registry exemption by doing too much | Under A, don't keep official client records, direct the services or handle caregiver pay (per Chantel's Texas reading). This conflicts directly with "controlling the experience". **Chantel's research.** |

### Legal hurdles (to be confirmed by counsel, state by state)
- **State home-care licensure.** Texas licenses home and community support services agencies (HCSSA) under Chapter 142, with the exemptions above. Other states differ, and some license or regulate registries themselves. **Texas: Chantel's research. Other states: unsourced.**
- **Background-check requirements** for anyone providing in-home services, which vary by state. **Unsourced.**
- **Worker classification** (independent contractor vs. household employee vs. agency employee). **Unsourced.**
- **Negligent referral or negligent selection** exposure for a platform that vets and recommends. **Unsourced.** The exposure grows with how strongly Olera vouches, which is exactly the trust signal families want: the CARE-NAV pilot found verified credentials and licensing status read as meaningful trust signals (31 caregivers, reported 2026-09-17). **records-exist.**

### Competitors (from Chantel's research unless marked)
- **Care.com**: a consumer marketplace with direct hire; the family is the employer (Texas § 142.003(a)(13)). Its known weakness is safety and vetting: national reporting in 2019 found caregivers with records had been listed. **Public reporting, not re-checked.** CARE-NAV participants named Care.com, A Place for Mom, Caring.com and AARP as the set they compare against, and were skeptical that in-app reviews are independent. **records-exist.**
- **CareLinx**: a registry across the whole care pyramid, including personal care. The family is the employer. Its terms say it "does not employ or recommend any care provider" and is only a "venue".
- **CareYaya**: **the closest competitor to MedJobs.** Pre-med and pre-nursing students matched to seniors, with training built with UCLA, GWU and Johns Hopkins. It is a registry, and its terms disclaim employment, supervision and anything needing a license.
- **Papa**: paid by health plans (Medicare Advantage, Medicaid, employers), not by families. Strictly non-clinical companionship through gig contractors. Its safety record is described above.

### Why few have done it well
Every player that went direct either stayed shallow (companion only, like Papa), pushed the risk onto the family (Care.com, CareLinx, CareYaya), or became an agency and took on its costs. There's also no evidence yet that anyone has made family-paid, local, two-sided matching profitable at scale. **Inference from Chantel's research; unsourced as a market claim.**

### Olera's opportunity
- **The worker pipeline**: new caregivers from health-professions students, who arrive every season. CANON already treats this pipeline as the innovation.
- **The verified record**, which a registry never builds and an agency keeps to itself.
- **The family side**: organic reach, the Benefits Finder, and Care Navigator already bring families who need care and can't find it.
- **Payer interest.** Papa shows health plans will pay for non-clinical support, a customer that never appears in TJ's framing. **Chantel's research.**

### Olera's risks
- One paying provider, and a January application built on providers paying for staffing.
- A small team: TJ and Ces make provider calls, and Logan runs MedJobs.
- Safety is existential: one incident with an Olera-introduced caregiver would damage the benefits and provider sides too.

### Why Olera is not positioned (today)
- It doesn't employ anyone, has no licensure, no insurance program for caregivers, no backup bench, and no payroll.
- It has no measured family willingness to pay for a direct caregiver.
- Local caregiver density is unproven outside the pilot campuses.

### Why Olera is positioned
- It owns both ends already: families arrive through search and benefits, and caregivers through MedJobs.
- It has the verified-record mechanism, and the doctrine in CANON already explains why the pool grows rather than recirculates.
- Chantel's research and the Phase 2 plan mean the thinking has been done once already.

## 6. Recommendation (revised after his follow-up)

**Test family-direct now, narrowly, as a pilot outside the CRP, and name it in the January application as the fallback if the student pathway stays blocked.**

The first version recommended keeping everything inside the committed broker model. That rested on two things TJ has since addressed: competing with customers (not a concern) and the committed model working (the notes show it blocked at the university gate). What still holds from the first version is that the pilot must not quietly contradict what the application says, so it runs as a separate pilot and is named honestly in the application as the fallback.

The cheapest shape that avoids "doomed from the start" is **model A (registry) with companion and homemaker scope only**: the family is the employer, Olera vets and matches, and there is no hands-on personal care. That keeps it inside the lightest licensing exemption Chantel found for Texas (§ 142.003(a)(15) companion/chore, with (a)(3) registry and (a)(13) direct hire as the structure), needs no payroll or insurance program from Olera, and can be stopped in a day. Counsel confirms the state's exemption before the first family.

## 7. The pilot, and when to stop it

What kills it, in order, and what the pilot measures for each:

| Risk | What the pilot measures | Proposed stop line |
|---|---|---|
| A safety incident | Every visit's outcome; any complaint | **Any** safety incident stops the pilot pending review. Vetting is the product: background check, reference, video interview, verified record. |
| Local supply (the usual marketplace killer) | Vetted caregivers available in the metro, by hours covered | Fewer than 15 vetted caregivers after 4 weeks of open-market recruiting (Indeed, Facebook, community boards; no campuses) |
| Families booking | Share of family requests matched within 7 days; first-match time | Under half of requests matched within 14 days |
| Families paying and staying | Rebooking within 30 days | Under a third of matched families book again |
| Legal model | Counsel's written confirmation of the exemption, per state | No confirmation, no launch |

The stop lines are **proposed, not derived**: there is no Olera baseline for any of them yet. TJ sets them before the pilot starts, so the result can't be argued afterward.

**Where to run it:** one metro with the most active family demand and no paying provider in it. The live care-post counts pick the metro; Hoop Cares' area is excluded.

**What it leaves alone:** MedJobs keeps running (students are one caregiver source, not the only one), Managed Ads keeps selling, and neither CRP document changes unless the pilot works.

## 8. The one decision only TJ can make

**Does the January application name family-direct as the fallback revenue path if the student pathway stays blocked, or does it stay silent on it until the pilot has results?**

Naming it is more honest to reviewers and protects Aim 2 if students stall. Staying silent keeps the application simpler, but leaves the plan resting on the gate the notes show is stuck. Either way, the pilot can start before January.

## Open items
- Collect Chantel's research folder (marketplace vs. agency, licensing, requirements), which she offered on 2026-09-03. It likely covers the per-state licensing question the pilot needs first.
- Confirm "Asian Americans" means "aging Americans".
- Before any claim here enters the CRP, give it a row in `docs/crp/evidence-ledger.md`. The agency-markup and legal claims are **unsourced**.
