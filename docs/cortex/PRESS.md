# Press, led by Cortex

TJ, 7 Oct 2026: "not just help, but lead PR. There are a bunch of these platforms to reach out to journalists, and we have some really cool stuff to say. This stuff is needle-moving." The proof is one article. Senior Housing News ran "NIH-Funded Tech Startup Takes Aim at Senior Living Referral, Lead Aggregation" on 23 January 2026 (Austin Montgomery). Within two weeks Jenny Poth of Ziegler reached out; by 18 February she had offered warm introductions to Magnify Ventures and Equitage Ventures, and in April she forwarded the John Hopper Impact Award nomination. One placement, one investor relationship, two fund introductions.

This file is what Cortex reads before it drafts a pitch. Facts here are dated and sourced; a number without a date is not in this file. The fence is POLICY.md's: a message to anyone outside the company is a draft, a person sends it.

## The loop

1. **Queries arrive.** Journalist requests from the free platforms land in an inbox Cortex already reads (support@olera.care, or a press@ alias that forwards there). Trade outlets are watched by name.
2. **Cortex sorts.** The inbox pass tags a thread `press`, scores fit against the angles below, and drops anything outside senior care, caregiving, aging, benefits, workforce, or AI in those.
3. **Cortex drafts.** A pitch in TJ's voice, two paragraphs, the one fact that answers the query, a founder line, and the link that backs it. Subject line carries no family names.
4. **A person sends.** TJ approves by number in the inbox pass ("send 3") and it goes from support@, or he sends it himself from his own address when the reporter knows him.
5. **Cortex tracks.** Every pitch, outlet, reporter, deadline and outcome in a ledger; placements named in the Monday post; a reporter who answered is a relationship, kept warm with the next real thing.
6. **Cortex proposes.** Once a month, one story Olera could offer unprompted, in the `press` thread in `#cortex`, built from data only Olera has.

## Where queries come from

| Source | Cost | How it arrives | Notes |
|---|---|---|---|
| Source of Sources (Peter Shankman, HARO's founder) | free | 2–3 email digests a day | sign up with an email; reply straight to the reporter |
| Qwoted | free tier (Pro ~$149/mo) | platform + email alerts | higher-authority outlets; read receipts on Pro |
| Featured.com | free tier | keyword alerts | one 2026 test reported about one in five answers accepted |
| #journorequest on X and Bluesky | free | public posts | fastest; needs a daily look |
| Help a B2B Writer / MentionMatch | free | email | B2B only; MedJobs and Olera Pro angles |

Trade press to watch by name, not by platform: Senior Housing News (Austin Montgomery wrote the January piece; Jack Silverstein covers operator AI), McKnight's Senior Living, Home Health Care News, Home Care News, Aging in America News, and GeekWire's startup spotlights. Aging and Health Technology Watch (Laurie Orlov) for the analyst angle.

## Facts Cortex may use

Each line carries its date and where it is checked. Anything not here is not quoted.

- Olera is a senior-care marketplace and benefits guide, NIH-funded (SBIR). The $3M NIH grant is on olera.care/research-and-press (announcement page). Founders: TJ Falohun (CEO, biomedical engineer) and Logan DuBose, MD.
- The directory: 76,555 active providers, 57,985 with a website, on 6 Oct 2026 (`scripts/sweep-provider-websites.ts` header, counted that day).
- Of the websites checked in the 6 Oct sweep, 1,782 were unreachable at the domain level (`provider_health_actions`, kind `website_dead`, open on 7 Oct). Google's own status is checked on about 10,000 providers a month at no cost (`docs/cortex/POLICY.md`).
- Organic search: 13,785 clicks in the 28 days to 1 Aug 2026, the highest measured (Strategic Narrative, 4 Aug entry). The Senior Benefits Finder carried about one in nine organic clicks that month.
- AI agents: between 30 Sep and 7 Oct 2026 the site's firewall refused about 39,000 requests from AI assistants and indexers; it was opened to them on 7 Oct (Vercel Firewall, Traffic, Denied; `project_agent_readiness` memory).
- MedJobs: a Texas A&M pilot placed 40 students with 7 operators from about 800 applicants (as quoted in Senior Housing News, 23 Jan 2026).
- The January article's angle, in TJ's words there: "gate keeping the connections based on paid networks is in direct contradiction to open platform connection" and "pre-screening that lead aggregators do is just simply not robust enough".

Not to be quoted: any dollar figure of benefits "identified" for families (the eligibility database is not verified for that), any provider's name as a customer without their written yes, family stories without consent.

## Angles Cortex can pitch

- **The directory tells the truth about closures.** How many senior-care businesses quietly close, by state and category, from Google status and dead websites. A data story nobody else has, refreshed monthly at $0.
- **AI agents are now shopping for senior care.** Muse, dots and Grok Bot drive browsers; most directories block them; Olera opened the door on 7 Oct and measures the traffic. Timely while the Personal Agent Protocol spec lands this month.
- **Open connections vs paid gatekeeping.** The January angle, still live as A Place for Mom pivots to AI and Caring.com changes hands.
- **Benefits are findable.** A free finder that became one in nine organic clicks in four months; what families ask, by state.
- **Workforce.** University-to-operator placement without a staffing agency: the MedJobs pilot numbers.
- **Aging in America.** The video series, real families, the founder's own story (QUESTPress profile, 2023).

## What exists already

- Notion "PR Strategy 2026" (task 135, lead Simon, P2): outreach plan, playbook, media deck, one-pager, press kit, "monitor and create HARO". Status: not started since 12 Dec 2025. This file replaces the plan; the Canva one-pagers (PR, January 2026; Provider) are the collateral.
- December 2025: a press release and outreach templates drafted in `#provider-outreach`.
- May 2025 marketing kickoff: "about 20 PR contacts made". Those names are not in the repository.

## What is missing, in order

1. **An inbox.** Which address the platforms write to. Recommendation: press@olera.care forwarding to support@, so the support inbox sorts it and the reporter sees a press address. TJ creates the alias.
2. **The `press` category in the inbox pass** (`lib/war-room/inbox-operator.server.ts`): tag, fit score against the angles above, a pitch draft, send on approval. Same path support replies already use.
3. **A ledger**, `cortex_press`: query, outlet, reporter, deadline, draft, sent at, outcome.
4. **The media list**: the trade names above plus the twenty contacts from May 2025 once someone finds them.
5. **The monthly data story**: Cortex proposes one in the `press` thread; TJ picks; Cortex writes the first draft and the numbers come from queries, not memory.
