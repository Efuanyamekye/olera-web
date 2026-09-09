# Nextdoor city campaign geography

## Recommended decision

Run two Olera-owned home-care quiz campaigns at the approved $10 per day per city for fourteen days. Use the following **proposed inclusion lists**, subject to checking the exact location labels accepted by Nextdoor:

| Campaign | Initial city targets | Planned spend |
|---|---|---:|
| Charlotte | Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson — North Carolina | $140 |
| Dallas | Richardson, Plano, Garland, Frisco — Texas; omit whole-city Dallas in the first flight | $140 |

This is a recommendation based on overlapping publicly advertised service coverage and Olera's existing relationships. It is **not a certification of present staffing, contracted referral acceptance, or a ZIP-level franchise map**. Keep concierge routing for this flight. Do not enable automatic provider offers based on public websites alone.

Use one ad group and one initial creative in each campaign. Keep the existing city quiz and city-specific headline. Do not split the $10 daily allocation into suburb campaigns. Leave age, income, homeowner, and interest filters broad within the selected geography; the pilot has no evidence that additional segmentation will improve qualified outcomes. This is an experimental design judgment, not a platform performance guarantee.

The proposed cities are a practical middle ground between one small suburb and an entire designated market area. They preserve the established Charlotte/Dallas proposition and include several overlapping home-care options. The initial lists deliberately omit more distant advertised coverage. Omission means “not in this first test,” not “no care exists there.”

## What the Ad Boost evidence establishes

Olera's September 6 record reports $535 in provider-campaign spend, 255 clicks, seven attributed inquiries, and one confirmed client. Those are historical internal figures, not a newly reconciled account-wide measurement. The same record describes the Nextdoor provider pilot as inexpensive traffic with no contactable leads. Other logs use different observation windows and landing counts; those should not be combined as if they were one cohort.[^1]

The defensible lesson is that buying visits and completing a family-to-provider connection are different outcomes. A city quiz is a reasonable new test because it captures a care request and an Olera callback proposition. It is not justified to predict its conversion rate from the old provider page. Equally, absent Nextdoor pixel events do not prove that the missing pixel caused the earlier lack of contactable leads.

The September 7 Google expansion had a specific justification: the recorded Keyword Planner estimates were approximately 330 core-term monthly searches for Concord and 450 for Garland. Olera expanded to Charlotte and Dallas–Fort Worth DMAs to obtain enough search opportunities for the $300 Google flights. This was a search-volume constraint; it does not establish a minimum Nextdoor audience. Nextdoor is offering a different placement and audience-selection mechanism, so its delivery should be measured directly.[^1][^2]

There is also a conflict in the internal rationale. The older source comments say concierge makes a wider net safe because a human handles requests. The later channel handoff records a territory problem and warns against copying the metro. The appropriate synthesis is that concierge can handle exceptions, but exceptions still consume time and can disappoint families. A human callback is not evidence that every lead has a suitable destination.[^2][^3]

This flight should therefore answer: can Nextdoor produce contactable home-care requests within a plausible fulfillment footprint, at a cost and workload worth repeating? It cannot cleanly establish whether Nextdoor is intrinsically superior to Google: the dates, geography, intent, and channel delivery differ.

## Internal decision trail — subsequent reconciliation

The Notion production note for PR #1813 explicitly records TJ's decision to launch **concierge first and recruit against real requests**. Pre-commit texts were deliberately unsent, and an admin could make a named-provider offer without switching on the general pool. Consequently, provider commitments are not a prerequisite for drafting or running the authorized concierge experiment. They are required before representing agencies as on-call or enabling automatic routing. The earlier report's readiness cautions must be read in that narrower sense.[^22]

The September 8 Claude territory note records a concrete south-Dallas routing investigation: the existing home-care pool is concentrated around northern Dallas/Frisco, and the investigation identified separate south-side agencies that were not registered in the offer system. It also records directory city/coordinate errors. That is stronger evidence of an operational gap than a general DFW service-area statement is evidence of readiness. However, its statement that all four providers are franchises conflicts with Palm2Palm's public description as non-franchised. Treat the note's geographic and registration findings seriously without converting its universal franchise claim into an established fact.[^23]

**Revised Dallas recommendation:** use Richardson, Plano, Garland, and Frisco for this first Nextdoor flight. Remove whole-city Dallas from the initial inclusion list: it reintroduces southern areas that the internal investigation specifically found difficult to fulfill. Keep the Dallas campaign identity and existing quiz; the creative should say “Dallas area” if needed for message match. Add north-Dallas ZIPs only after checking actual boundaries and coverage; office ZIPs 75240/75251/75252 alone are not a complete territory definition. Charlotte's six-city recommendation remains unchanged. This is an analyst recommendation, not a previously recorded TJ geographic decision.

The Notion PR #1832 note records day-one realized Google CPC of approximately $4.46 Charlotte and $4.60 Dallas versus the roughly $2.25 planning forecast. The earlier expansion rationale was historical, not current economics. This strengthens the case for a controlled Nextdoor test but supplies no reliable Nextdoor CPC forecast. The same note flags potential Google overlap with Assisting Hands. A later Claude campaign note records TJ's decision to let the campaigns run; do not change Google campaigns based on a superseded recommendation.[^24]

The September 8 callback note records that a real Google city lead supplied contact details and consent, followed by an approximately 14.5-hour wait for human contact. It establishes that the form can capture a real request and that callback delay occurred. One request cannot establish a stable conversion rate or prove that the page has no other conversion problems. Preserve the deliberate 8am–noon local window; don't reinterpret it as a typo.[^25]

A separate Claude note flags a possible concierge/cron inconsistency and the narrower concierge consent wording. The current checkout still lacks a concierge check in the inspected automatic advancement path. This is a code finding requiring deployment verification, not proof that current production has the same behavior. Do not infer provider refusal merely from an `unfilled` status, and obtain/document the family's permission before a named-provider handoff. No provider messages, code deployment, pool enabling, or campaign publication were performed in this reconciliation.[^26]

## Charlotte provider assessment

The seeded Charlotte pool contains three home-care organizations and one assisted-living organization. The pre-commit document identifies Graceful as an existing Ad Boost partner and the warmest contact. A directory entry, a pre-commit draft, and an enabled provider are distinct readiness states.[^4][^5]

| Organization | Relevant public evidence | Role in this flight |
|---|---|---|
| Graceful Homecare | Its own site names Charlotte and Concord and lists Cabarrus and Mecklenburg among its counties. It also advertises a broader footprint. | Relationship anchor for Charlotte/Concord; verify actual case acceptance with its operator. |
| Cornerstone Caregiving, North Charlotte | The local office explicitly lists Charlotte, Concord, Harrisburg, Huntersville, Cornelius, and Davidson among its cities. | Best explicit geographic evidence spanning the proposed six-city footprint. |
| HomeWell, Huntersville/Charlotte | Its local page lists Charlotte, Huntersville, Cornelius, Davidson and other communities. | Additional publicly supported option for Charlotte and the northern Mecklenburg cities. |
| Legacy Haven Senior Care | Its own site describes a residential senior-care home. The internal pool classifies it as assisted living. | Relevant when a family selects residential care; do not count it as a home-care backup. |

Sources: Graceful, Cornerstone, HomeWell, and Legacy Haven official pages; Olera pool seed.[^4][^6][^7][^8][^9]

Charlotte and the northern suburbs have the clearest overlap. Concord and Harrisburg extend the test toward the warm Graceful relationship and Cornerstone's explicit service list. Cornelius and Davidson add northern coverage supported by both Cornerstone and HomeWell. This is stronger evidence than simply drawing a circle around an office address.

Do not initially add Rock Hill, the South Carolina side of the metro, Gastonia, Salisbury, or the entire Lake Norman region. Some providers publicly advertise those places, so they are reasonable expansion candidates. However, adding all of them now broadens the operational test without first establishing that the core footprint delivers well. Graceful's website statement about both states is a provider claim, not an independently completed license or staffing verification.[^6]

The recommendation is not based on selecting wealthy neighborhoods. No evidence reviewed connects these city campaigns' qualified outcomes to household income or homeownership. Geographic inclusion here follows service coverage and existing relationships.

## Dallas provider assessment

The seeded Dallas pool contains four entries categorized as home care and three categorized as residential care. Public evidence supports a wider home-care footprint than a strict “Garland only” interpretation would suggest.[^4]

| Organization | Relevant public evidence | Role in this flight |
|---|---|---|
| Assisting Hands, Dallas/Richardson | Local service page names Dallas and Richardson, along with Coppell and the Park Cities. | Logical first option for Dallas/Richardson; do not infer Plano or Garland coverage from this franchise's brand alone. |
| Cambridge Caregivers | Dallas location navigation explicitly includes Dallas, Richardson, Plano, Garland, and Frisco. | Public coverage anchor across the full proposed Dallas list. |
| Granny NANNIES of Dallas | Official contact page explicitly includes all five proposed cities within a much broader service area. | Second public coverage option across the proposed footprint. |
| Palm2Palm Senior Care | Official site advertises Frisco and the DFW Metroplex and describes the agency as non-franchised. | Frisco relationship and potential wider backup; obtain case-specific confirmation rather than translating “DFW” into every ZIP. |
| Bansfield Residential Assisted Living | Official site identifies a residential operation at a Garland address. | Residential-care option; not evidence of mobile home-care coverage. |
| Golden Horizon | A Plano senior-living site was found, but exact correspondence to the pooled business was not independently resolved. | Keep as an internal residential-care candidate; do not use an unresolved identity to justify paid home-care geography. |
| Care Mountain Plano | Pool seed categorizes this entry as assisted living/memory care; the brand's current website prominently advertises in-home care. | Resolve the exact business/profile identity and service classification before changing the pool or counting it as another home-care anchor. |

Sources: official provider pages and Olera pool seed.[^4][^10][^11][^12][^13][^14][^15][^16]

The originally considered Dallas, Richardson, Plano, Garland, and Frisco footprint has a clear connection to the existing relationships, and at least two agencies explicitly advertise the five-city set. Public coverage supports concierge discovery, but the subsequent internal reconciliation above narrows the initial paid footprint to the four suburbs and omits whole-city Dallas.

Do not initially add Fort Worth, Arlington, Denton, DeSoto, or all of the DFW DMA. Public coverage statements do include some of these places. The recommendation to omit them is about keeping the first flight concentrated, not claiming they are universally unservable. In particular, the handoff's DeSoto example is evidence of one routing difficulty. It does not establish that every pooled agency would reject every DeSoto case; the reviewed providers' broader statements make that blanket conclusion unsupported.[^3][^12][^13]

The research also found a practical contact discrepancy: the Assisting Hands phone in the historical pre-commit sheet is labeled as a jobs number on its current contact page, while a separate client line is listed. Before any outreach, verify the existing relationship contact and channel rather than blindly reusing the sheet. No provider was contacted as part of this assessment.[^5][^17]

## What remains unknown about fulfillment

Public coverage is sufficient for a reasoned draft recommendation. It cannot answer whether an agency can staff this week's hours, accepts a particular payer, will take an Olera referral, or will respond in the promised window. Those questions vary by case and date. No open beds or staffing availability were verified.

The latest earlier session observation showed concierge mode and no providers on call. The September 7 log also recorded zero enabled providers. A fresh attempt to open the city admin during this assessment returned the public home page, so no refreshed live count is claimed here. The code still identifies both cities as concierge in this checkout. Do not turn historical counts into a current database assertion.[^1][^18]

The current automatic selection path filters by city slug, enabled/non-test status, prior offers, and care type. The inspected selection code does not filter candidates by service ZIP. Thus a successful automatic relay test proves the messaging/claim sequence, not territorial matching. Concierge should confirm the care location and select a suitable organization before sharing a case.[^19]

Another important distinction is between the person seeing the ad and the person receiving care. An adult child may live in an included city while seeking care elsewhere. Ad geography alone cannot establish serviceability. The current form initializes ZIP from a city default and labels the field simply “ZIP.” A completed field therefore may not prove that a family actively supplied the care recipient's location.[^20]

For this pilot, explicitly confirm the care ZIP during the callback. A focused future improvement is to label it “ZIP where care is needed” and require an active entry or confirmation rather than silently relying on the default. This is a proposed product change; it has not been implemented here and should be coordinated with the concurrent Meta edits.

## Campaign implementation and measurement

Use city inclusions first. They are directly supported by the provider evidence and avoid inventing precise postal coverage from broad marketing statements. If a franchise supplies an authoritative partial-city territory list, switch the affected area to verified ZIP inclusions. A postal code must not be guessed from the city name or office address. Nextdoor's documentation describes geographic targeting, and the live builder in this session exposes city/region and postal-code controls; final accepted labels and counts still need inspection.[^21]

Maintain the following settings for the proposed test:

| Setting | Decision |
|---|---|
| Subject | Olera city home-care quiz |
| Objective | Website visits, optimize for clicks |
| Structure | One campaign, one ad group, one initial creative per city |
| Budget | $10 daily per city, 14 days; $280 combined planned spend |
| Charlotte draft schedule | September 10 noon to September 24 noon, Central Time |
| Dallas schedule | Match the same elapsed window when building |
| Geography | Explicit city inclusions from the recommendation |
| Audience | Broad within selected geography; no unsupported medical-interest or income refinements |
| Attribution | `utm_source=olera_city`, Nextdoor `utm_medium=paid_social`, existing exact city campaign tag |
| Fulfillment | Concierge, 8am–noon in each city's local time |

The advertiser's Central Time schedule differs from the Charlotte callback clock. Noon Central is 1pm Eastern during this September flight, so Charlotte's proposed launch begins after its staffed callback window. The existing copy does not promise an immediate call. If morning launch is preferred, shift both start and end together without changing duration. Show exact times at final review.[^18]

Daily amount multiplied by duration is planned spend, not proof of a hard lifetime cap. Verify the saved control, end date, and delivery state. Charlotte has a saved platform draft, ID `1023274174694557629`; its final targeting and creative remain incomplete. Dallas is not yet a completed platform draft. Nothing in this report constitutes a published campaign.

Evaluate distinct stages: spend → clicks → tagged quiz visits → submissions → contactable families → in-scope cases → families actually reached → provider acceptance/outcomes. Use identical definitions across channels. Exclude test and duplicate leads. A cheap click that cannot be fulfilled is not a successful acquisition.

Suggested operational rules for this small experiment are to inspect delivery and destination attribution early, review actual geography and response workload after the first few days, and assess the full fourteen-day cohort after allowing callbacks to complete. These are proposed review points, not scheduled automations. Do not increase spend or broaden geography to manufacture volume before checking delivery, copy, and destination behavior.

If the selected footprint underspends, expand one evidenced area at a time. For Charlotte, the reviewed HomeWell/Cornerstone lists provide nearby candidates; for Dallas, Cambridge and Granny NANNIES provide alternatives beyond the initial five cities. Record the time of each change. If the campaign generates unservable or unreached families, improve coverage verification and follow-through before expanding reach.

## Reusable setup requirements

The city branch of `/ad-boost-setup` should retain separate subject and channel decisions. It should collect the authorized total and duration once, reconcile existing platform drafts, verify actual geography, and preserve the channel-specific UTM values. Nextdoor remains `paid_social`; Meta remains `paid_meta`. Migration 220 is reserved by the Meta work.

Add a coverage record per proposed area containing the named provider, care type, source/date, advertised territory, current acceptance status, and fallback. Keep “publicly advertised,” “directly confirmed,” and “enabled for automatic routing” as separate states. A reusable command should be able to recommend a pilot from evidence without pretending a public website is an acceptance commitment.

The final review should show what is actually saved, including absent or unresolved fields. Provider outreach, production changes, and publication were not performed during this research. The campaign build remains the next implementation step using the proposed geography and the already approved budget.

## Sources and evidence notes

Public pages were inspected September 9, 2026. Unless otherwise stated, publication dates were not displayed. Public provider statements establish advertised scope only.

[^1]: Olera, `SCRATCHPAD.md`, September 6–7 city-ad entries and current-focus follow-up. Local historical operational record; not a refreshed ad-account reconciliation.
[^2]: Olera, `supabase/migrations/209_city_campaigns_metro.sql`, September 7 metro-expansion rationale, and `lib/city-ads/config.ts` in this checkout.
[^3]: Olera, [CHANNEL-INFRASTRUCTURE.md on lively-carson](https://github.com/olera-care/olera-web/blob/lively-carson/docs/city-ads/CHANNEL-INFRASTRUCTURE.md), September 9 handoff, read in the preceding session. Deployment status is not inferred from the document.
[^4]: Olera, `supabase/migrations/207_city_campaigns.sql`, pool seeds. Seeds are historical identity/category evidence, not live readiness.
[^5]: Olera, `/Users/tfalohun/Desktop/city-ads-provider-precommit.md`, September 7 draft. Not a record of sent messages or YES replies.
[^6]: Graceful Homecare, [About Us](https://www.ghc4nc.com/about-us).
[^7]: Cornerstone Caregiving, [North Charlotte local office](https://cornerstonecaregiving.com/locations/north-charlotte-nc/), Additional Service Areas.
[^8]: HomeWell Care Services, [Huntersville/Charlotte local office](https://homewellcares.com/in-home-care-nc-huntersville-nc157/), Our service areas.
[^9]: Legacy Haven Senior Care, [About](https://www.legacyhavensenior.com/about).
[^10]: Assisting Hands, [Dallas local service page](https://assistinghandsnorthtx.com/dallas-tx/).
[^11]: Cambridge Caregivers, [Locations](https://cambridgecaregivers.com/locations/), Dallas service-location links.
[^12]: Granny NANNIES of Dallas, [Contact and service area](https://grannynannies.com/dallas/contact-us).
[^13]: Palm2Palm Senior Care, [Official site](https://palm2palmseniorcare.com/).
[^14]: Bansfield Residential Assisted Living, [Official site](https://www.bansfieldral.com/).
[^15]: Golden Horizon Senior Living, [Plano site](https://goldenhorizonseniorliving.com/). Exact match to the internal business profile remains unresolved; not used as a home-care coverage anchor.
[^16]: Care Mountain, [Official site](https://www.caremountain.com/). Brand-level service evidence does not resolve the specific pooled profile's classification.
[^17]: Assisting Hands, [Dallas/Preston Hollow contact page](https://assistinghands.com/38/texas/prestonhollow/contact-us/).
[^18]: Olera, `lib/city-ads/config.ts`, concierge settings and `STAFFED_HOURS`; prior session admin observation and September 9 Nextdoor draft inspection.
[^19]: Olera, `lib/city-ads/offers.server.ts`, provider candidate selection.
[^20]: Olera, `app/care/[city]/CityLandingClient.tsx`, ZIP initialization and contact-step field.
[^21]: Nextdoor, [Targeting on Nextdoor](https://business.nextdoor.com/en-us/neighborhood-ad-center/blog/targeting-on-nextdoor-whats-right-for-your-business), February 19, 2022; [ZIP code targeting](https://business.nextdoor.com/en-us/small-business/resources/blog/zip-code-targeting-on-nextdoor), August 15, 2022. Older conceptual documentation; current controls are verified against the September 9 US advertiser UI rather than assuming the old workflow persists.

[^22]: Olera Notion, [Promote staging → main — city ads concierge mode (2026-09-07)](https://www.notion.so/3d45903a0ffe810295e8c9f2d6c9fb29), PR #1813 production notes, read September 9.
[^23]: Claude project memory, `project_city_pool_franchise_territory.md`, September 8 investigation, local project memory directory. Personal lead details omitted.
[^24]: Olera Notion, [City ad funnel instrumentation — Ad Boost audit fallout](https://www.notion.so/3d55903a0ffe815d8183e9e914ccc6f4), PR #1832; Claude `project_city_ads_google_campaigns.md` and `project_city_ads_metro_targeting.md`, corrections to forecast and campaign-overlap decisions.
[^25]: Claude `project_city_ads_callback_constraint.md`, September 8 first-lead follow-up. Case observation, not a controlled conversion study.
[^26]: Claude `project_concierge_chain_gap.md`, September 8; local `lib/city-ads/offers.server.ts` inspected September 9. Current production fix status not verified.
