# Source — MedJobs Strategy Meeting, 2026-09-04

> **Present:** Logan DuBose, TJ Falohun, Chantel Wright, Esther Nyamekye
> **Original:** Zoom transcript (`TJ_Falohuns_Personal_Meeting_Room_20260904_0733GMT400.txt`), ~1,450 lines.
> Not committed — it contains unrelated business discussion. This file is the **decision-bearing distillation**.
>
> Quotes are lightly cleaned of transcription artifacts. Speaker attribution is preserved because
> several items below are one person's position, not a group decision. Automatic transcription
> mangled two names: **"Gracie" / "Graize" = Grazy**, **"Seth" / "CES" = Sess**. Quotes below use the
> canonical spellings.

---

## 1. The business context that frames everything

- **January 5 is the hard date.** TJ: *"working towards January 5th, which is the submission of our CRP,
  and showing customer activity and revenue."* The two paths carrying that submission are **MedJobs and
  Managed Ads.** Everything in this workspace is scoped to make MedJobs one of those two.
- **April 15** is the separate annual grant report (benefits-navigator study, N=200, IRB approved). It is
  not MedJobs work, but it competes for the same four people's hours.
- **Human resources, not ideas, are the bottleneck.** Logan: *"None of this is hard. It's all just
  sophisticated and requires persistence and organization of human resources."*

## 2. What MedJobs already is

- **It has been run end to end, manually, and it made ~$6,000.** Logan: *"It's been done end-to-end manually,
  and it's made about six grand… Me and Diana and the rest of the team have done this whole process. End to
  end. And it works. But it is intense."*
- **The manual version broke on throughput, not on demand.** *"I was literally taking students' resumes and
  attaching them to emails and sending them to providers and then calling the provider… things were getting
  lost."*
- **The software is first-generation, not MVP-polished.** Logan: *"All this stuff is legit, and it works.
  But we need to get to second gen through throughput."* He estimates **~100 hires to reach "4th gen"**, and
  4th gen as the level where it *"will actually be turning out people and turning out money."*
- **Live surfaces demoed:** landing page, terms, flyer (provider + student), Calendly booking, pilot
  agreement, provider portal (view candidates), student portal (application, job board, interview board).
  Several were visibly janky during the demo — role confusion on sign-in, a broken magic-link path.

## 3. The funnel as Logan described it

> *"Provider outreach → conversion, right on terms. Then MedJobs starts. We kind of do two things at once.
> We manage the actual provider client, and we also manage the stakeholders at that university to try and
> get the students in. And then we watch the system and look for interviews to happen. And then we follow
> those interviews to see if hires occur."*

Sequencing, in his words: **the first signed provider is the "egg."**
> *"The moment we get one of these… here's your egg. Like, okay, now go start getting the chickens. This is
> when we go get the students. We have one provider at this point. We know we have an endpoint to send the
> students to. So we just go hard on the students."*

Then: *"We have kind of one goal. Circulate flyer as much as possible in the university near \[the client\],
as fast as possible."*

## 4. The conversion mechanic (the highest-signal operational detail in the meeting)

- **The whole cold funnel exists to book one meeting.** *"If you looked at the in-basket, and you look at the
  scripts for the emails… all of them are focused on getting a meeting."*
- **Do not send collateral instead of booking the meeting.** Direct instruction to Chantel: *"If you get
  somebody that's semi-interested, don't just throw on the contract. Don't throw them to the landing page.
  Just be like, why don't you meet with Dr. DuBose and talk about it? Set up a meeting. Is there a good time
  for you? I've got his Calendly right here."*
- **The meeting converts at ~100%.** *"If I get them on a call, it's a done deal. I've probably done this like
  10 times. Not once are they not down — if they agree to a meeting."* (The filter is agreeing to the
  meeting, not the meeting itself.)
- **Post-meeting is a details email + the pilot agreement**, with a deliberately soft signature ask:
  *"No rush to sign it, we just need to complete it before you interview your first student."*
- **The post-meeting questions to the provider are standardized** — characteristics of a good caregiver,
  how many they want, shift types, anything useful for vetting.

## 5. Pricing, as stated in the meeting

Logan, answering Esther directly: *"I would like $250 or higher, post-hire. Billed per month."* Worked
example: *"They hire 3 students in October. On October 31st they'll get a bill for three students, or $750."*

He also said paywalls are currently **off**: *"I took out all paywalls, because right now we're pre-pilot."*

> ⚠️ This conflicts with what is shipped in code (`INTERNSHIP_FEE_USD = 100`, per party, one-time).
> See **C1** in `../07-OPEN-DECISIONS-AND-CONFLICTS.md`. Do not quote a price to a provider until C1 is resolved.

## 6. Platform attrition (hiring around Olera)

- Logan: terms-and-conditions based — *"our terms say don't do that, and if we catch you doing it, we'll kick
  you off the platform."* He also frames it as a good problem: *"I hope we have that problem."*
- TJ: incentive-based instead — *"another way we solve for that… you just make the experience way better…
  You don't want that adversarial policing. You want 'hey, I love this platform, I prefer to use it.'"*
- Already partially resolved in the build plan (sign-in-wrap non-circumvention terms + the student's
  on-platform credential as the primary moat).

## 7. The CRM debate (unresolved in the meeting)

- Chantel raised the real operational pain first: *"not having calls in the same spot, and our support emails
  — I should be able to log in and see all of that. It takes way more time for me to go to Zoom, click Zoom,
  go see if someone emailed us… That's where I think things get missed."*
- Logan's initial position, stated forcefully: *"The CRM is 100 times more important than anything else for
  our success"* (`100A + 1B = C`), and *"You will not go wrong working on the CRM."*
- **Then he revised it.** After Esther's proposal: *"I think I was way too anchored on one utopian CRM.
  Scratch that. It can totally be unique CRMs for these purposes."*
- **Esther's proposal (the one Logan endorsed):** *"Strip down MedJobs to handle bringing in the students,
  and cold outreach would just focus on bringing in providers… then the third system is all providers who
  have come in — we strategize on converting them. This person is eligible for ads, so when we call we pitch
  ads; this person falls within the city where we are rolling out MedJobs, so when we call we pitch MedJobs.
  That way we close the loop."*
- TJ's caution: *"There's so many stages… it might be much to combine."*

**Net: the target architecture is contested and undecided.** Tracked as **C6**.

## 8. Team and ownership signals

- **Grazy is already producing meetings.** Logan: *"Grazy has those… She's good, because I'm getting
  meetings. I'm not doing anything. She's doing it all."*
- **Chantel has not been pitching MedJobs.** Chantel: *"I haven't specifically talked about MedJobs on really
  any new calls. Sometimes I do add it in an email if they mention hiring is a problem… but I haven't led
  with MedJobs."* She asked for concrete collateral first: *"we need something tangible to send… the pricing
  and things a little bit straightforward, rather than just the idea."*
- **Esther takes the system.** She proposed the split above and was asked to *"take a first crack"* at it.
- **Esther's staffing sketch, which Logan endorsed:** *"Maybe Grazy, since she already handles that, takes
  over getting the providers in, and then maybe Chantel and yourself, Logan, close the loop on getting them
  to either onboard in MedJobs or ads. And then once we test that out, we can find interns that would scale
  the different routes."*
- **Chantel's ask, unanswered in the meeting:** *"What is everyone's top three things that we're working
  towards? I feel like everyone has side projects… I'm just not sure where everything sits."* — This
  workspace is the answer to that question for MedJobs.
- **The pod may not need a designated leader.** Logan: *"I'm observing how you guys operate in your pod right
  now with Sess and Grazy, and some groups of 3 to 4 don't need a leader… I want to see where y'all's
  talents and passions would take this."*

## 9. The founder-dependency tension (stated by Logan, both directions, in the same meeting)

- **Use me:** *"Put me in front of advisors, student orgs, students and providers. My schedule should be
  meetings with providers, student orgs, students, student advisors. That's how we'll know that we are using
  our human capital most efficiently."*
- **Step back:** *"A part of me thinks that one of the most useful things I could do would be to completely
  step back and see what the hell happens… I have to refrain from getting in and doing it myself, because
  then it will never scale."* And: *"We keep getting dinged because we're not expanding out of founders'
  brains. We're not building enterprise-level businesses, we're building founder one-offs."*
- **The named gap:** *"We need a leader. We need a Diana."* Diana is the prior operator, repeatedly cited as
  the standard for responsiveness: *"Jennifer would have been responded to not in a month — she would have
  been responding to the next hour."*

Tracked as **C8**.

## 10. Known operational failures named in the meeting

| Failure | Evidence |
|---|---|
| Interested providers going unanswered for weeks | An August 5 provider email still unanswered on September 4 — *"this is gold right here"* |
| Portal jank blocking the demo | Sign-in returned a family view for a caregiver role; magic-link path broken mid-demo |
| The student flyer is weak | *"It's a terrible flyer, but it's a functional flyer."* Diana's 3-iteration version is better and needs recovering |
| Nothing survives past ~5 concurrent relationships without a system | *"As soon as it's above 5 people, you get fucked"* |

## 11. Ambition, for calibration (not a 2.0 target)

Logan's run-rate arithmetic: ~3 hires/county/month × several hundred university catchments at $250+
≈ **$3M/year**, against ~3,000 US universities. Nearer-term: *"I think we're going to need to get to 4th gen
before this can make a quarter mil a year."* Separately, **500 placed students with satisfaction data** is
the preliminary evidence base for a ~$2M NIH CareFleet proposal — which is why instrumentation matters
from day one, not later.

TJ's framing of the window: *"This space is emergent, and it's a good time for us to take a piece of that
pie… You want to compete as the space emerges."*

## 12. What the meeting explicitly deferred

- Top-3 priorities per person — TJ/Logan huddle Monday Sept 7, pod meeting Tuesday Sept 8.
- Whether provider outreach continues at current intensity or yields to MedJobs — Chantel asked; unanswered.
- Who the customer-success/account-manager ("Diana") hire is.
- Meeting cadence: TJ proposed **3×/week to start**.
