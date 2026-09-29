# Ad Boost Campaign Audit (Deep Dive, Browser-Driven)

Input: $ARGUMENTS — provider name(s), Google campaign ID(s), campaign tag(s), or nothing.

## What this is, and what it is not

`/ad-boost-setup` builds campaigns. `/ad-boost-optimize` maintains them on a 3–4 day cadence and stops at a diagnosis table. **This command answers "why did this campaign do what it did,"** across every flight the provider has run, using internal data and Google Ads together, and it leaves the answer in the case log so nobody has to derive it twice.

It was written the day after a two-month program failure was reconstructed by hand. That reconstruction took roughly forty browser and database reads, produced three wrong diagnoses before the right one, and found that two of the facts that explained everything were already written in per-campaign notes nobody had connected. The command exists so that never costs forty reads again.

| | **Full book** (no arguments) | **Targeted** (`/ad-boost-audit Franchil`, `/ad-boost-audit 24166094865`) |
|---|---|---|
| Scope | Every campaign that has ever run — provider campaigns grouped by provider, **plus the Olera-owned city campaigns on every channel: Google, Meta and Nextdoor** | One provider, **every flight they have run** — never just the current one. A city slug (`/ad-boost-audit charlotte`) audits that city arm across all three channels |
| Depth | Case file per campaign, cross-case patterns table | Everything below, plus whatever the specific question needs |
| Output | Published artifact (Phase 5) + state-of-play document + one `observation` per campaign in `ad_campaign_log` | One case file, written to the log, and the answer stated plainly. Artifact only if TJ asks or the finding has a shape |
| Use when | Monthly, or whenever the program's premise is in question | A sweep flagged a campaign it could not explain; a provider asks why; two flights disagree |

A bare invocation runs the full book. A provider name runs targeted. **A targeted audit on a provider with more than one flight reads all of them** — the explanation for flight 2 is almost always in flight 1.

**TJ never has to name the cities or the channels.** Both are in scope on every bare invocation. He asked for "the new city ads, not just Google but Meta and Nextdoor" on 9 Sep 2026 because this command was Google-only and would have skipped two live channels; that gap is closed here and must not reopen. If a channel exists in `city_campaigns` and this file has no read procedure for it, that is a defect in this file — write the procedure from the hand-read, the way Phase 2M and 2N were written. The same applies to ad **formats**: a provider's Meta arm is an instant form, read in Phase 2F. 2M on its own covers only ads that send people to a page.

Canonical references: `/ad-boost-setup` (locked invariants, URL table, campaign ID registry) · `/ad-boost-optimize` (browser mechanics, material-component quirks) · `~/Desktop/adboost-state-of-play.md` (the output format this command reproduces) · `docs/city-ads/CHANNEL-INFRASTRUCTURE.md` (the four collision files, locked attribution decisions) · memory `project_adboost_outcome_blindness`, `reference_ad_metrics_are_hand_typed`, `reference_chrome_devtools_attach_mode`, `project_city_ads_channel_infra`, `project_city_ads_meta_arm`, `reference_meta_business_account`.

## Turning audit findings into a rescue pilot

Added based on the September 16, 2026 Nextdoor post-mortem. Audit scope is not rollout scope. When TJ asks to rescue providers with no/broken traction, select on evidence and carry the eligibility constraint through every subsequent budget discussion.

- Separate never launched, ended/stalled traffic, active delivery failure, and traffic without questions/inquiries. Zero recent visits after a flight ended does not prove the paid channel malfunctioned. Do not describe an untested Meta arm as failed.
- Show the proposed eligible names, reason, observation window, per-provider cap and total before scaling. “$50 each, even all” does not remove an existing eligibility condition. Prefer a small bounded learning batch when asked for a pilot; do not quietly convert a zero-traffic rescue into an all-book spend plan.
- Read question submissions, distinct askers and contactable leads separately. Missing question UTMs limit attribution; they do not prove ads generated no questions. Label evidence-based inference and uncertainty explicitly.
- A request to proceed can transition into setup: apply `/ad-boost-setup` and retain the current authorization. Do not ask the same scope/budget questions again. Read its **Codex native browser recovery and write verification** section for browser faults; record partial progress without calling the audit or rollout complete.

## Ten ways this analysis has gone wrong

Read these before forming any view. Each was a confident single-cause story that skipped a counter-example already in the data.

1. **"The landing page is the cause."** Overturned by a campaign serving fine on the same page template.
2. **"The budget is too low."** Overturned by a campaign serving fine on the identical $1.67/day. Also: *Top of page bid (low range)* in Keyword Planner is the price of a **top placement**, not of a click. Our realized CPC has run $1.85–$2.42 against "low range" bids of $3–$8. Do not read that column as a floor.
3. **"There is no market here."** Overturned by the previous flight serving 124 impressions in the same city. A Keyword Planner figure describes the keywords you fed it, in the geography you scoped it to — nothing else.
4. **"The rebuild dropped the winning keywords."** Half true. Per-keyword data showed the best keyword had survived, Eligible, at zero impressions. The mechanism was the negative list removing its query pool, not the rewrite.

**The pattern:** one cause that explains everything, when the truth was different causes in different cases. Franchil August (negatives removed the query pool) and Miracle August (unexplained; keywords carried over correctly and it still serves zero) are different failures that were treated as one for two days. **Write a separate diagnosis per campaign and let them disagree.**

**Three more, added 9 Sep 2026 — all of them fixes an audit proposed and the next audit had to withdraw:**

5. **"Google's build-time estimate exceeded the cap, so raise the cap."** Proposed 7 Sep as this command's highest-leverage structural fix. Falsified 9 Sep: Google estimated $3.61 and $2.94 for two campaigns that then cleared at **$2.08** and **$2.21** — under the $2.50 cap they had. Raising either would have overpaid. Google's estimates have now missed low by 2.6× and high by 1.8× in the same account in the same week; **they carry no reliable sign in either direction, and no rule should be built on them.** Set caps from our own realised CPC in that market, and where we have none, accept a slow ramp rather than pay for certainty.
6. **"A campaign at zero is broken."** Three campaigns sat at zero impressions for two days and were serving on day three with nothing changed. Miracle took 16 days, Franchil ~12. **Day-1 and day-2 silence is the base rate, not a signal.** The correct move is to leave it alone and read again — which costs nothing and is the only way to tell ramp from price apart, because a cap raise makes both hypotheses predict the same outcome.
7. **"Nobody followed up on this lead."** The database only records what the app did. A call TJ places by hand leaves `reached_at`, `family_check_sent_at` and `outcome` all null. **Ask him before writing that anything went unworked.**

**What all three share:** an audit reaching for a fix on one campaign's evidence. This command's output is an explanation. A rule needs a counter-example search first, and the counter-example is usually already in the same account.

8. **"No paid visitor started the quiz."** On 10 Sep the audit reported 0 of 25 by grouping each event on its own `utm_medium`. The production tracker attaches attribution metadata only to `page_landed`; later quiz events legitimately have no tags. Joining on `anonymous_id` + `visit_id` + `page_path` recovered three paid starts already present at that audit's cutoff, and four of 28 visitors at the later 08:32 UTC read. **A working event does not prove a working attribution query.** Use the landing cohort below before drawing a conversion conclusion or applying an early-stop rule.

9. **"The gate is met, so the test concluded."** On 15 Sep the audit reported the city A/B as answered and told TJ to pick a landing page that day. Both halves were wrong. The pre-committed ~130-landing threshold was set for the **gate** question — does the offer hold a stranger at all — and the 11 Sep note said in terms that the arm comparison was *"a separate and much weaker question."* The audit applied one question's threshold to the other question's data. Run the power calculation before calling any comparison concluded: separating the observed 8.3% / 10.4% / 11.1% spread needs **~1,751 visits per arm**, and detecting a *doubling* needs **282**, against the 36–48 actually collected. **A high p-value at n=40 means you learned nothing; it is not evidence the arms are the same.** Worse, the recommended arm was the one whose `cta_engaged` fires on first field touch while the stepped arms fire on leaving intro — a bias the code comments and the 11 Sep note both name as unquantified. The audit picked the arm its own metric flatters, on the smallest sample of the three. TJ caught it. **Before recommending a choice between variants, state the sample each arm needs and whether the metric means the same thing on all of them.**

10. **"The retired ad type produced the best inquiry, so the rule is in question."** On 29 Sep the audit set one Caring Senior inquiry from a Meta traffic ad against seven instant-form leads and called the 25 Sep form-only rule "challenged". It had opened none of the forms. It had no completion rate, no raw answers, no creative, and no read of what happened after the form. The comparison was also between different kinds of lead: our forms don't ask care type or urgency, so "more detailed" was partly a property of the format. **Before comparing a form with anything, run Phase 2F on it.**

Two more, statistical: at ~2.7% click-to-inquiry and ~20 clicks a flight, P(zero inquiries | healthy campaign) ≈ 58%. That is a likelihood, not a posterior; it does not mean ignoring a silent campaign is right 58% of the time. The likelihood ratio against "broken" is only 1.7, so **zero inquiries is almost no evidence either way. Zero impressions is.** And the 2.7% itself has a 95% interval of 1.2%–5.8% on 6 of 222 clicks, so any threshold derived from it is soft.

## Phase 0 — Internal pull (no browser; run first, and while any auth is pending)

Service-role key is in `.env.local`; never ask TJ for it. **Every metric column on `ad_campaign_requests` is hand-typed and wrong** — on 4 Sep Edmonds read $0.00 / 4 impressions against Google's $43.52 / 394. Read them for what the operator *believed*, never for what happened. Google is the only source for spend, clicks, impressions.

1. **Campaign rows** — all of them, not just live. Group by `provider_id`. Note `campaign_tag`, `status`, `flight_start_date`/`flight_end_date` (routinely null on live rows — a finding in itself), `provider_comms_paused_at`, `admin_note`.

   Also pull the **city campaigns**: `city_campaigns` and `city_leads`. These are Olera-owned, provider-agnostic campaigns and they are in scope for every audit, on every channel. They are easy to miss twice over: they have no `provider_id`, and **the Google ones do not appear in the `/aw/campaigns` list under the saved view's filters** — a sweep run from the campaign table alone will skip them. Reach them by `platform_campaign_id`. Filter `city_leads` on `is_test=false`; TJ's own test rows are in there.

   **One row per city per channel.** `channel` is `google | nextdoor | meta` (a 4th needs a CHECK migration first). Read every row, not just the Google ones — and **do not trust `status` on these rows.** On 9 Sep both Meta rows read `status='draft'` with `platform_campaign_id` null while both campaigns were live and spending in Ads Manager, because publishing happens in the ad platform and nothing writes back. `channel-rollup.ts` keys cost-per-lead off these rows, so a stale row makes a running channel invisible on `/admin/city-ads`. **The platform is the truth; the row is a claim.** Any row whose status disagrees with the platform is a finding and a one-line fix, both.

2. **Read every note in full and score its predictions. Do this before the browser and before forming any hypothesis.**

   `admin_note` is not background colour. It is the only durable record of what was decided at build time and why, and **it routinely contains the answer to the question the audit is asking.** The failure this step exists to prevent, observed 7 Sep 2026: three campaigns had served zero all day, and the cause was sitting in their own build notes — Google's own estimated CPC, recorded at build as **$3.68 / $3.61 / $2.94, every one of them above the $2.50 cap the campaign was then given**. Rosemonte's note had said it outright a month earlier: *"Google est. avg CPC $3.10 vs $2.50 cap — expect underspend."* The flag had been raised four times and scored zero times. The audit went to the browser and re-derived it as a "new discovery."

   So produce this table before anything else, and put it in the readout:

   | Campaign | Prediction or flag recorded in the note | Where | What actually happened | Scored |
   |---|---|---|---|---|

   Sweep every note for: Google's estimated CPC or clicks/week against the cap and budget actually set; any sentence beginning "expect", "watch", "flag for TJ", "PENDING", "decide at"; any deviation from SOP that was recorded and justified; any hypothesis stated at build. **Every one of those is a prediction nobody has scored.** Scoring them is usually cheaper and more conclusive than anything the browser will tell you.

   **`admin_note` is not the only prior record. `SCRATCHPAD.md` is the other one, and it is the one that gets missed.** Sessions that touched Ad Boost without changing code write their findings there and nowhere else, so a campaign's `admin_note` can be complete and still not contain what we already know about that campaign. Before forming any view, run these three greps from the repo root and read every hit:

   ```bash
   grep -n -i -f <(printf '%s\n' <every campaign_tag and provider display_name from step 1>) SCRATCHPAD.md
   grep -n -iE 'ad.?boost|city ads|nextdoor|meta arm|CAPI|pixel|city_leads' SCRATCHPAD.md | tail -80
   grep -n -iE "^#{2,3} 20[0-9]{2}-" SCRATCHPAD.md | tail -12   # the last dozen session headers
   ```

   Then check the **Next Up** section for open items naming any campaign in scope. An item parked there as "off the critical path" is a scored prediction like any other, and the audit's job is to say whether it still is.

   The failure this exists to prevent, observed 15 Sep 2026, twice in one audit. (1) The audit reported Franchil's 12 Sep inquiry as a delivered lead, with the flattering detail "254 = Killeen, read same day." The 14 Sep scratchpad entry already said: *"Franchil's 12 Sep 'lead' is Emilia Barrows, a caregiver asking for a job, counted as a delivered inquiry."* `care_recipient`, `care_type` and `urgency` were all null in the row the audit had already read. (2) The audit wrote *"[UNKNOWN] Cause. Leading hypothesis: `META_CAPI_ACCESS_TOKEN` unset in Vercel prod"* and told TJ to go check Vercel. The scratchpad had carried the answer since 9 Sep: *"CAPI token still blocked on creating a Meta App in the portfolio. Off the critical path."* The token is not set because the app does not exist, so the recommended action was impossible to perform, and the genuinely unexplained part — that the **browser** half never fired either — went unnamed. Both corrections had to be written into `ad_campaign_log` after publishing.

   Two rules that follow from it:
   - **Nothing is a "new finding" until you have checked whether a prior note already recorded it** — in `admin_note`, in `ad_campaign_log`, **and in `SCRATCHPAD.md`**. If one did, say so and credit it — the finding is *"this was flagged on <date> and not acted on"*, which is a different and more actionable claim than *"I discovered this."*
   - **A pattern across three or more notes outranks anything in one campaign's browser data.** Repeated build-time flags point at a defect in `/ad-boost-setup`, not at three separate campaign mysteries. Say which it is.

3. **The case log** — one request per provider, markdown so it reads as a story:
   ```
   GET /api/admin/ad-boost/case?provider=<provider_id>&format=md
   ```
   Also `?overdue=1` for tweaks past review across the book. If the case log is empty for a campaign that has run, that absence is the first finding.

4. **Attributed landings** — `provider_activity` where `event_type='page_view'` and `metadata->>utm_source='olera_managed'`, grouped by `metadata->>utm_campaign`, excluding `metadata->>referrer_class='olera_internal'`. Compare to Google clicks; a gap over ~20% on a Google campaign is a tracking question (Nextdoor reconciles ~100%, Google ~84%).

5. **Attributed inquiries** — `provider_activity` where `event_type='lead_received'` and `utm_source='olera_managed'`, plus `seeker_activity` where `event_type='benefits_completed'`. Note `attribution_backfill` in metadata: those were reconstructed, not captured live.

6. **What happened to each inquiry** — `connections` by `id` from the `connection_id` in step 4. Read `message` (the seeker's qualification data: urgency, care type, phone present?), `metadata.read_by` (did the provider open it, when), `metadata.thread` (did anyone reply, what did they say), `metadata.provider_outcome`, `status`. On 4 Sep this single read falsified the hypothesis that the funnel was broken: providers read every inquiry within a day and replied to three of four.

7. **What the provider was told** — `email_log` filtered on `metadata->>request_id`, all Ad Boost types. Cross-check the launch email's date against Google's first impression. On 4 Sep two providers had been told campaigns launched that had never served.

8. **The negative-keyword regime** — you cannot get this from the DB, but note here which campaigns *should* be checked: any home-care campaign built after 2 Aug 2026 probably carries the shared list.

9. **The city landing funnel — run this before you open any ad platform.** It is the highest-value read in Phase 0 and it did not exist before 8 Sep 2026:

   ```
   growth_attribution_events where page_category='city_landing'
   ```

   Read `occurred_at, event_type, page_path, traffic_channel, metadata, anonymous_id, visit_id` — **`occurred_at`, not `created_at`**. Fetch all three event types for the selected page/time window, with pagination; do not prefilter the entire fetch on paid tags. Events mean `page_landed` → `cta_engaged` (advanced past the intro screen) → `lead_started` (reached the contact step). They do not identify abandonment at each intermediate question.

   **Build a cohort from landings, then join quiz activity to it.** As verified in production on 10 Sep, `lib/analytics/growth-attribution.ts` sends referrer, UTM and gclid metadata only for `page_landed`. `CityLandingClient` supplies no attribution metadata for the later events. Their null medium or `direct` classification does not mean the visitor was direct, lost the URL tags, or returned later. Never group every event independently by `metadata->>utm_medium`.

   Read it this way, in this order:
   - **Set the measurement window first.** Read the approved clean-window timestamp and thresholds from campaign notes. Select entry landings in that window and follow their events through an explicit audit cutoff. Report pre-fix and post-fix cohorts separately; zero post-fix landings means the fix is unmeasured. Do not change thresholds during the audit.
   - **Strip noise from entry landings only.** Exclude internal reloads and known tests/previews. Separate externally referred paid landings from tagged direct/ambiguous landings; direct desktop entries are usually operator tests, not proven paid strangers. Preserve ambiguous counts and state what excluding them changes. Do not discard downstream events because their own metadata says `direct`.
   - **Attribute the entry.** Use the landing's recorded channel evidence: Google `paid_search`/gclid, Meta `paid_meta` (or fbclid if captured), Nextdoor `paid_social`. Do not assume the generic tracker captures fbclid merely because `city_leads` does. Group cohorts by page/city and entry channel, never by downstream tags.
   - **Join within the same visit and page.** For each qualifying landing, match later events on all three non-null keys: `anonymous_id`, `visit_id`, `page_path`, with `landing.occurred_at <= event.occurred_at <= audit_cutoff`. Missing keys are unmatched, not permission to join all nulls or unrelated visits from the same browser. Collapse repeated entry rows within a visit/page; flag conflicting channel evidence rather than crediting one quiz start to two channels.
   - **Deduplicate and label the denominator.** Count each matched stage once per visit/page. Report raw landing events, distinct paid visits and distinct `anonymous_id` visitors separately. For a visitor engagement rate, count each visitor once per city/channel in both numerator and denominator, crediting only events matched within an eligible visit. State the unit used for any approved stopping threshold; do not silently swap visitors, visits, landing events or platform clicks.
   - **Validate the join before trusting zero.** Inspect matched examples and unmatched quiz events. Direct desktop controls prove the event fires, not that paid attribution works. An untagged quiz start in the same paid visit must count; the same browser's different visit, an internal-only test, another city's page or an event preceding the landing must not. Before applying a zero-engagement stop rule, verify these cases and the clean-window cohort.
   - **Reconcile landings against platform clicks over aligned windows.** Platform clicks, raw landings and unique visitors are different units. Report repeat landings, exclusions, instrumentation start and platform reporting lag; do not compare all-time clicks with a shorter tracked window as if they were identical. A large residual gap is a tracking question, not proof of abandonment.
   - **Quote joined engagement first, leads second.** Low lead counts alone carry little evidence at these volumes. A joined zero at meaningful volume warrants investigation, but label any assumed engagement baseline before calculating its probability. Never reuse the overturned 0/25 result or infer that every channel failed at the first click.
   - **Keep the submitted-lead count separate.** Read real leads from `city_leads` with `is_test=false`; note leads predating instrumentation. A quiz start is not a submitted lead. The current `/admin/city-ads` API and `channel-rollup.ts` count submitted leads and display spend/clicks/lead rates; they do not read the quiz-event table. Verify the current code before proposing a dashboard fix: a missing quiz display is a feature gap, while a bad audit join belongs in this workflow.
   - Migration 216 added `city_landing` to the category CHECK and `CityLandingClient` fires all three events. **That defect is fixed.** Do not confuse event collection, audit attribution and dashboard display.

   **Historical validation case (10 Sep 2026, 08:32 UTC; not a current campaign metric):** 28 identifiable paid visitors → 4 same-visit quiz starts → 0 contact-step events. Charlotte Google 0/9; Dallas Google 3/10; Charlotte Meta 0/1 (possible preview); Dallas Meta 1/8. Excluding that possible preview gives 4/27. Three starts predated the earlier 04:00 UTC audit, disproving its 0/25 claim. The one submitted lead arrived before instrumentation. Reproduce these joins from the case log when checking the method, not by filtering quiz-event UTMs.

Present Phase 0 findings before opening the browser if TJ is mid-auth. Half the audit is here, and step 9 is most of that half.

## Phase 1 — Browser up (`/open-dia`)

**Invoke `/open-dia`** so its rules load. Then the mechanics from `/ad-boost-optimize` Phase 0 apply, with one difference verified 4 Sep: **for Google Ads, launch vanilla Chrome on the `chrome-profile-google` profile**, not Dia — Dia's built-in content blocker breaks `ads.*` consoles and its "Turn off ad blockers" dialog is permanent:

```bash
PROFILE="$HOME/.cache/chrome-devtools-mcp/chrome-profile-google"
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PROFILE" --remote-debugging-port=9222 "--remote-allow-origins=*" \
  --no-first-run --no-default-browser-check --restore-last-session=false \
  --window-size=1440,900 --window-position=40,40 \
  "https://ads.google.com/aw/campaigns?ocid=984737409" >/tmp/chrome-9222.log 2>&1 &
sleep 9; curl -s --max-time 5 http://127.0.0.1:9222/json/version
```

Then `list_pages` twice (the first reports the reconnect), confirm `outerWidth > 0`, and confirm the account header reads `tj@olera.care`.

**Three platforms, three Chrome profiles, one port.** Sessions do not cross between them, and only one browser can hold 9222:

| Platform | Profile dir under `~/.cache/chrome-devtools-mcp/` | Signed in as |
|---|---|---|
| Google Ads | `chrome-profile-google` | tj@olera.care · account header `419-933-1442 Olera Google Ads Account` |
| Meta Ads Manager | `chrome-profile-meta` | act `739297033485646`, business `286830885921873` |
| Nextdoor Ads | `chrome-profile-nextdoor` | Olera ad account `1003810864513418699` |

**Check what is already on the port before launching anything** — `lsof -nP -iTCP:9222 -sTCP:LISTEN` names the process, and `ps -p <pid> -o command=` shows which `--user-data-dir` it holds. On 9 Sep the meta profile was already up and carried a live Google Ads tab too, so Google and Meta were both read without a single relaunch. Only swap profiles when the session you need genuinely is not there.

**Swapping costs you the other platform**, so sequence deliberately: read everything you need on the current profile, then `pkill -f "chrome-profile-<old>"`, sleep 3, and relaunch on the new dir with the same flags. Do Nextdoor last — its Ads Manager is the slowest to boot and the one most likely to hang on a blank `/v2/campaigns` route.

**Any Google re-auth mid-session is a checkpoint.** On 10 Aug a re-auth on this account wiped 13 headlines, 4 descriptions and 13 keywords from a campaign. After TJ completes one, **re-read keywords, the ad, and the final URL** on every campaign you touched before it, before doing anything else. On 4 Sep this check was run deliberately and passed; run it every time.

## Phase 2G — Google Ads read, per campaign, all flights

Set the date range to **All time** once (date picker → "All time"); it carries across pages. The default 30-day window renders ended campaigns as zeros and looks like "no data."

For every campaign object the provider has ever had — **and for both Olera City campaigns, every time, in full-book mode**:

> **The city campaigns do not appear in the `/aw/campaigns` list under the saved view's filters.** A sweep driven off that table will silently skip them, which is how they went unaudited until 7 Sep 2026. Reach them by `campaignId`: Charlotte `24223751948`, Dallas `24223844624`. Everything below applies to them unchanged — keywords, search terms, negatives, change history, settings.
>
> **City campaign registry (verify against `city_campaigns.platform_campaign_id`; treat this table as a convenience, not the source):**
>
> | | Google | Meta | Nextdoor |
> |---|---|---|---|
> | Charlotte | `24223751948` | `120251360116130487` | `1023274174694557629` (group `…75558584258`) |
> | Dallas | `24223844624` | **not yet verified** — click the campaign name and read `selected_campaign_ids`, see 2M step 4 | `1023340399281833119` (group `…400171025573`, ad `…401144104113`) |
>
> **The campaign-scoped Google URLs that work** (the `/aw/settings` family all 404): `/aw/overview?campaignId=…` gives status, budget, flight dates and all-time clicks/impressions/CPC/cost in one read — start there. Then `/aw/keywords/searchterms?campaignId=…`, `/aw/keywords?campaignId=…`, `/aw/ads?campaignId=…`, `/aw/changehistory?campaignId=…`. Each takes `&ocid=984737409`.
>
> **They are also the only campaigns in the account where Olera pays the bill**, so an unread number there costs us directly rather than a provider. They are the first campaigns to read, not the last.

1. **Campaign row** — `/aw/campaigns?ocid=984737409`, all 14 on one page at Show rows 50. Read impressions, interactions, cost, avg CPC, **Search lost IS (rank)**, **Search lost IS (budget)**, conversions. The last two are diagnostic: every home-care campaign that has ever served loses 72–89% to rank and 3–35% to budget. A campaign at >90% rank / 0.00% budget with zero impressions is not budget-limited — lost-IS-budget is degenerate at zero impressions and proves nothing.

2. **Keywords with per-keyword impressions and clicks** — `/aw/keywords?campaignId={id}`. Show rows 50; the grid is virtualized, so **scroll and collect, then confirm the count matches `1 - N of N`**. On 4 Sep a campaign recorded as having 10 keywords had 16; the truncation hid the one that mattered. Read the QS columns (Quality Score · Landing page exp. · Exp. CTR · Ad relevance) — **only 5 keywords in the account's history have ever had a score**, so "—" everywhere is normal and not a finding.

3. **Search terms at All time** — `/aw/keywords/searchterms?campaignId={id}`. Read every named term with its clicks. Then read the two totals: `Total: Search terms` vs `Total: Other search terms`. **The second is Google's privacy bucket and it routinely holds most of the clicks** — Franchil June showed 4 of 16 clicks in named terms and all 3 conversions came from the 12 you cannot see. State the visibility ratio in every readout. Never claim to know which query converted unless the named terms account for the clicks.

4. **Negatives** — `/aw/keywords/negative?campaignId={id}`. `Level` column: `List` = the shared list, `Campaign` = campaign-level. Then the list itself: `/aw/negativekeywordlistdetails?ocid=984737409&sharedSetId=12134249254` — 98 terms, Show rows 100, scroll to collect both halves. **Cross-reference against the previous flight's search terms**: which of the queries that got clicks last time would this list block now? That single cross-reference is what explained Franchil.

5. **Change history** — `/aw/changehistory?campaignId={id}`. When was it built, what was applied within minutes of build, what changed since. Google keeps ~30 days; older history is gone, so **the case log is the only durable record** of anything before that.

6. **Settings** — the Settings button on any campaign page opens a side panel; scroll it to `Start and end dates`, `Locations`, `Bidding`. The URL forms `/aw/settings`, `/aw/campaigns/settings` and `/aw/settings/campaign` all 404.

7. **Keyword Planner, if market size is in question** — `/aw/keywordplanner/home`, Discover new keywords, seed with the campaign's head term, **scope to the campaign's actual targeting** (a 20-mile radius is not the city). Rows with identical values in every column are one cluster reported under several labels; do not sum them.

**zsh eats `:a`, `:r` and other modifiers in `$VAR:path`.** Write `"${MB}:path/to/file"` with braces or the path is silently mangled.

## Phase 2M — Meta Ads Manager read (ads that send people to a page)

For instant forms, which include every provider Meta arm, use **Phase 2F**. Steps 3, 5 and 6 below mean nothing for a form.

Written from the 9 Sep hand-read, one day after the arm was built. Every line below is something that actually bit.

Land on the campaigns table with the date range and columns already in the URL rather than clicking them in:

```
https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=739297033485646&business_id=286830885921873&date=2023-08-09_<today>%2Cmaximum&insights_date=2023-08-09_<today>%2Cmaximum&columns=name%2Cresults%2Cspend%2Cimpressions%2Cclicks%2Ccpc%2Cactions%3Alink_click
```

1. **Read the grid with `take_screenshot`, not `evaluate_script`.** The table is virtualised and `[role="row"]` returns the header alone; `take_snapshot` works and is verbose. The account holds 225 campaigns and the Olera City rows sort to the top on maximum range — everything below `Traffic Campaign (April 2023)` is 2023 legacy and irrelevant.

2. **Read `Link clicks`, not `Clicks (all)`.** `Clicks (all)` counts reactions, profile taps and expands. Only link clicks are comparable to a Google click, and the gap is large at these volumes: on 9 Sep the two arms showed 9 clicks (all) and 6 link clicks. **Cost per site visit is spend ÷ link clicks.** Quoting the clicks-all number flatters Meta by about a third.

3. **`Results` reads `—` until the optimisation event has ever fired.** That is not "zero results", it is "no data for the event this is optimising toward", and it will read `—` for the whole flight if the pixel has never seen a `Lead`.

4. **Campaign ids are not in the DOM as links** (`href="#"`). Click the campaign name; the ad-sets URL then carries `selected_campaign_ids=<18-digit id>`. Write it back to `city_campaigns.platform_campaign_id`.

5. **Then check the pixel, every time** — Events Manager for dataset `803096730985728`:
   ```
   https://adsmanager.facebook.com/events_manager2/list/dataset/803096730985728/overview?business_id=286830885921873&act=739297033485646
   ```
   Read the **event list**, not the chart: which event types exist, total events, "last received". On 9 Sep it held `PageView` and nothing else — **no `Lead` event has ever reached this pixel**, so both arms are optimising toward a conversion Meta has never observed. Say that plainly in the readout; it is the reason a Meta zero is a probable false negative rather than a verdict. The date control is a listbox with `Today / Yesterday / Last 7 days / … / Custom` and an `Update` button; dates render in **Asia/Ho_Chi_Minh**, which does not align with the ad account's day boundary — never reconcile a pixel count against a spend count without saying so.
   Two datasets are both named "Olera Pixel". `803096730985728` is the live one; `1569498573520920` is dormant. **Always read the ID, never the name.**

6. **Reconcile link clicks against `growth_attribution_events` `utm_medium='paid_meta'`.** This is the check that earns the phase. On 9 Sep Dallas went 3 link clicks → 3 landings and **Charlotte went 3 → 0**. A per-arm reconciliation gap points at that ad's destination URL first, and a mistyped `utm_medium` on one ad corrupts the whole three-channel comparison Charlotte exists to make.

7. **Names in this account lie.** An ad set named `Charlotte metro - home care - 40+` was built at min age 25; an ad named "3 creatives" holds one image. **Read settings, never labels.** And per `reference_meta_ads_manager_scripted_writes_revert`, never write through a script here — this phase is read-only anyway.

## Phase 2F — Meta instant forms (every provider Meta arm, plus any city form)

Written after the 29 Sep audit read every form's spend and lead count, reconciled them to `city_leads`, and never opened a form. It then compared one traffic-ad inquiry against seven form leads without the forms' own completion rates or answers, and TJ caught it. Since 25 Sep every new provider Meta arm is an instant form linked to the provider (memory `feedback_provider_meta_is_instant_form`). Arms built before that can still be traffic ads (Caring Senior's ran to 5 Oct); read those in 2M. A lead never touches the site, so Phase 0 step 9, the pixel and the landing reconciliation in 2M **say nothing about a form**. This phase is the form's equivalent of all three.

**Scope: every form, not only the city ones.** Start from the forms configured in `META_LEADS_FORMS_JSON`, read through `GET /api/admin/city-ads/meta` in a signed-in admin browser tab (the env var itself is write-only in Vercel). Each entry carries `formId`, `slug`, `campaignTag`, `campaignId`, `consentText` and `testOnly`. Match each one to its `city_campaigns` row. A row with `request_id` set is a provider's form, paid from their Ad Boost budget and handed to their campaign page. A row without it is Olera's own city form. `channel='meta'` alone does not mean a form: the Charlotte and Dallas web arms carry it too. Then list the account's campaigns whose ad sets optimise for `LEAD_GENERATION` and flag any with no configured form or no row. On 29 Sep the Dallas pilot `120251489434010487` had spent $397.73 with no `city_campaigns` row, so `/admin/city-ads` could not see it.

**How to read it: Graph, through Ads Manager's own session, read-only.** The grid lazy-loads the Budget, Ends and Link clicks columns, and on 29 Sep they stayed blank. From the Ads Manager tab, `evaluate_script` can take the page's own `EAA…` token out of `document.documentElement.innerHTML` and call `https://adsmanager-graph.facebook.com/v21.0/…` with `credentials:'include'`. The same call to the plain `graph.facebook.com` host returned an OAuth error on 29 Sep. Keep the token inside the browser. Never print it, write it to disk or put it in a log. GET only: scripted writes in this account silently revert (`reference_meta_ads_manager_scripted_writes_revert`), and this phase changes nothing.

Per form, in this order:

0. **Import health, before anything else. No browser needed.** Query `meta_lead_receipts` for the flight: `imported` means it landed in `city_leads`; `blocked` means it landed and was archived on arrival (the screener marked a job seeker; see migration 231); `duplicate` is harmless; `failed` with `attempts` at the maximum is a **lead that never arrived** and needs a person. On 29 Sep a Pascagoula receipt from 20 Sep sat `failed` at 12 attempts. The Scottsdale failure the same week was Meta's test-tool lead, not a family. Say which is which.

1. **Schedule and cap before any "still spending" claim.** Read `{campaign}?fields=name,effective_status,stop_time,daily_budget,lifetime_budget,adsets{effective_status,start_time,end_time,daily_budget,lifetime_budget,optimization_goal}`. Budgets are in cents and often sit on the ad set, not the campaign. On 29 Sep this audit first read the Dallas pilot as running past the city flight because the campaign said `ACTIVE`; its ad set ended that day with a $400 cap. **ACTIVE plus a past-due end date is a finding. ACTIVE with an end date still ahead is just a schedule.**

2. **Delivery.** `{campaign}/insights?fields=spend,impressions,clicks,inline_link_clicks,actions&date_preset=maximum`. From `actions`, read `lead` (= `onsite_conversion.lead_grouped`) and `leadgen_preferred_lead`. **There is no form-open metric in the API.** Link clicks are the closest figure and an **upper bound** on opens (`/ad-boost-setup`), so completion = leads ÷ link clicks is a **lower bound** and must be labelled that way. `lib/city-ads/meta-insights.server.ts` gives the same caution in code. The in-account benchmark is 68.7%. Every form so far has run far below it: Dallas was 9.5% on 21 link clicks on 18 Sep, and Boulder was 2/8 on 29 Sep.

3. **The form itself.** `{form_id}?fields=name,status,questions,privacy_policy_url,legal_content,thank_you_page,is_optimized_for_quality,allow_organic_lead,block_display_for_non_targeted_viewer`. Check against the Boulder spec (`1555807859192198`, the one `/ad-boost-setup` says to copy):
   - **Screener present:** a `CUSTOM` question such as "Who is the care for?" (Hoop's v2 asked "Are you looking for care, or looking for a caregiver job?"; wording and the `field_data` key vary by form) whose options include "I'm looking for a caregiving job". A form without it cannot tell families from job seekers. Hoop's v2 form returned 6 job seekers in its first 7 leads, and the answer is the only thing that catches them.
   - **Privacy link** is `https://olera.care/privacy`. UI duplication dropped it twice on 25 Sep.
   - **Consent** (`legal_content.custom_disclaimer`) names **Olera and the provider**, has a required, unticked checkbox, and matches that form's `consentText` from the step-0 config character for character. That text is what `city_leads.consent_text` records as the family's agreement. Consent that names Olera only does **not** stop the hand-over code, which keys on `request_id` alone, so a provider form with Olera-only consent passes the family's details on without the family agreeing to it (same class as `project_concierge_chain_gap`).
   - **Housing category** (assisted living): no ZIP question. Meta rejects it at publish (#2909057).
   - **Thank-you page** links to that provider's page with the campaign's own `utm_campaign` and `utm_medium=paid_social`. This is the usual way a form lead also shows up as a site landing. Don't count that landing as a second visitor.
   - **`is_optimized_for_quality`** is "Prioritise higher-quality leads". Boulder reads `false`. Hoop's v3 has the job answer marked non-preferred and the setting on. Report the value; don't judge it. Whether it helps is untested.
   - **Flexible form delivery** was not among the fields read on 29 Sep, and no field for it has been found. Read it in the UI: Ads Manager → the ad → Edit → the instant form's settings. It should be **OFF**, because it lets Meta drop questions, including the screener and the consent. Hoop's v3 was still ON at last read. If you can't open the UI, write `[UNKNOWN]`, never "off".

4. **The raw answers, lead by lead.** `{form_id}/leads?fields=created_time,field_data,ad_id,is_organic&limit=100`. `field_data` holds each answer, including the screener answer (key named after the question, e.g. `who_is_the_care_for?`) and Meta's own `is_qualified`, whose meaning is undocumented here; report it, don't interpret it. Compare to `city_leads` on `meta_lead_id`:
   - **Count paid leads from this list, not from `leads_count`.** `leads_count` includes organic and test leads. On 29 Sep Boulder read `leads_count: 3` with one `is_organic: true`.
   - **Job-seeker share from Meta's answer**, set against our `qualification_verdict_category='looking_for_work'`. They should agree one for one. Our importer dropped this answer until #2163 on 24 Sep, and a mismatch means it has regressed.
   - **Who the care is for** (parent, spouse, self) is the only care detail a form carries. Report it. Don't describe a form lead as "qualified" on the strength of it.

5. **Creative and targeting, read from settings.** `{ad}?fields=creative{title,body,image_url,degrees_of_freedom_spec}` and the ad set's `targeting` (age, radius, and whether Advantage+ audience expansion is on). Look at the actual image. A caregiver in uniform drew job seekers on Hoop's v2, and the fix was an image of a family. Where a form's job-seeker share is high, the image is the first thing to check. `degrees_of_freedom_spec` should read `OPT_OUT` across Advantage+ creative. Names lie here too (2M rule 7).

6. **After the form.** For each lead in `city_leads`: `handed_at` (did it reach the provider's campaign page), whether the Olera confirmation text went out and was answered (`city_lead_messages`, `qualification_reply`), whether the provider acted, and `outcome`. Job seekers should be archived and **not handed**. A job seeker with `handed_at` set went to a provider as a family. Hand-placed calls leave no trace, so ask before writing that a family was never worked (Phase 3).

**Comparing a form with a traffic ad or with Google.** Neither the form's funnel nor its leads mean the same thing as the page's. Our forms collect a name, a phone number, a ZIP (except Housing forms) and who the care is for. A page inquiry can carry care type, urgency and payment. So compare arms on the **family's first reply and the provider's outcome**, not on leads or cost per lead. At n < 10 per arm, say the sample is too small (lesson 9) rather than ranking the arms.

## Phase 2N — Nextdoor Ads read

```
https://ads.nextdoor.com/v2?dates=last+7+days&activetab=campaign
```

1. **`/v2/campaigns` hangs on a blank body.** It returns 200 with `document.body.innerText.length === 0` and never resolves. The working route is `/v2` with `activetab=campaign` or `activetab=adgroup`. Do not debug the blank page; change the route.

2. **You will land in the wrong ad account.** There are six, one per provider plus Olera, and the URL param `advertiser_id` does **not** switch them. Click the account button in the header (`Avatar for <name> … Account ID: …`), then the `Olera` row — `1003810864513418699`. Confirm the header reads `Olera` before reading a single number, and clear any campaign selection carried over from the previous account.

3. **Read campaign status and ad-group status separately; they disagree and the ad group is the one that matters.** On 9 Sep both city campaigns were toggled **On** while reporting `No active ad groups`, because both ad groups sat in `Pending review`. A campaign that says On is not a campaign that is running.

4. **Distinguish "paused" from "review-locked" programmatically.** Read the switch: `aria-checked="false"` **and** `disabled=true` is Nextdoor's review lock; `aria-checked="false"` alone is something we turned off. Eyeballing a grey toggle cannot tell these apart and they need opposite responses.

5. **A pending flight starts empty and silently.** No error, no email — just zeros indistinguishable from a channel that does not work. **If a Nextdoor flight starts within 48h, say so as a dated action item with the deadline in it.** Still pending 24h after the start date is a support ticket, not a wait.

6. **Check `Conversion type` on the ad group.** It has been `None` with optimisation `Clicks` on every city flight so far, which means Nextdoor is buying the cheapest clicks with no conversion signal at all. **It therefore cannot be scored against Meta on cost per lead** — say so rather than putting the two in one column.

7. **Nextdoor is the only channel with no click-id fallback.** `classifyCityTraffic` resolves Google by `gclid` and Meta by `fbclid`; Nextdoor rests on a hand-typed `utm_medium=paid_social`, and `city_leads` has no `ndclid` column. A Nextdoor lead that loses its UTM string attributes to nothing. Restate this in any readout that compares channels.

8. **Also sweep the provider Nextdoor accounts.** On 9 Sep a flight called "Graceful Homecare – Concord – Sep 2026 – Nextdoor" had run 1–7 Sep, delivered 0 impressions and been paused, with **no row in `ad_campaign_requests` at all**. The account switcher is the only place that flight is visible. Date columns respect the range picker, so an ended flight reads 0 under "Last 7 days" — set the range wide before calling anything a zero.

## Phase 3 — Cross-reference (this is the audit)

For each provider with more than one flight, and for the program as a whole:

- **Keyword carryover.** For every keyword in the current flight: was it in the previous flight, and what did it earn there? For every keyword that earned a click in the previous flight: is it in the current one, verbatim? Reworded counts as absent — `"senior care killeen"` (53 impressions) became `"senior home care killeen"` (Low search volume). Table it.
- **Negatives against the prior flight's traffic.** Which of last flight's clicked queries does the current negative set block? Count impressions and clicks that would be blocked. If the prior flight converted and the current list blocks its traffic, that is a finding regardless of what the list was meant to do.
- **Negatives-during-flight, across the book.** Group every campaign by how many negatives were live *during its flight* (from change history dates, not the current state) and tabulate clicks and inquiries per group. On 4 Sep: 0–6 negatives → 140 clicks, 6 inquiries; 48+ → 105 clicks, 0.
- **DB vs Google.** Every hand-typed metric against Google's all-time figure. Report the worst deltas by name.
- **Told vs true.** Launch email date vs first impression date. Wrap-up sent vs `email_log` status (suppressed addresses fail silently). Outcome asked vs outcome answered.
- **Inquiry follow-through.** For every inquiry: qualification data present? Provider read it? Replied? Family replied? Outcome recorded? Five of six outcomes in program history were never established, and "one confirmed client" was a verbal claim not in the system.
- **One funnel, all channels, one table.** Spend → impressions → clicks to site → landings → `cta_engaged` → leads, one row per channel, from Phase 0 step 9 and Phase 2G/2M/2N. **Use the joined landing cohorts from Phase 0 step 9.** The 9 Sep table incorrectly showed every paid channel reaching zero at engagement; the 10 Sep same-visit reconciliation overturned that finding. Let the city/channel rows disagree, label each measurement window, and keep submitted leads separate from quiz starts.
- **Forms get their own funnel row.** Spend → link clicks (upper bound on opens) → paid leads → families (screener answer) → first reply → handed → outcome, from Phase 2F. A form never lands on the site, so leave its landing and `cta_engaged` cells **blank, not zero**. A zero there reads as a failed funnel.
- **Cost per site visit, per channel, same city same week.** Not cost per lead — lead counts are too small to divide by, and Nextdoor has no conversion signal at all. Cost per visit is measurable on day 1 and is the number that did not exist before these flights ran. A form has no site visit, so its row uses cost per form lead, labelled with its n.
- **A hand-placed action leaves no trace.** Before writing that a lead was never worked, remember that `reached_at`, `family_check_sent_at` and `outcome` are only ever set by the app. A phone call TJ makes himself writes nothing. **Ask him before concluding anything about follow-up** — on 9 Sep this audit's own headline claimed a lead had sat two days untouched; it had been called inside the intended window and the family did not pick up. The real finding underneath was that the system cannot see its own best work, which is the same shape as `reference_ad_metrics_are_hand_typed`.

## Phase 4 — Write it down (this is why the command exists)

**One case file per campaign**, in the format of `~/Desktop/adboost-state-of-play.md`: what we did, the hypothesis, what happened, what is unresolved. **Every claim labelled** `[FACT]` / `[GOOGLE ESTIMATE]` / `[INFERENCE]` / `[GUESS]` / `[UNKNOWN]`. A section listing what you did not check. A section listing where you were wrong during this audit, if you were.

Then **write the findings into the case log** so the audit is the record rather than a document that drifts:

```
POST /api/admin/ad-boost/case
{ request_id, google_campaign_id, campaign_tag,
  entry_type: "observation",
  summary: "Audit <date>: <one-line verdict>",
  detail: "<the diagnosis, what ruled out the alternatives, what is still unknown>",
  metrics_snapshot: { impressions, clicks, cost, avg_cpc, lost_is_rank, lost_is_budget, inquiries },
  occurred_at: <now> }
```

**City campaigns log to the same table, keyed differently.** `ad_campaign_log` has a nullable `city_campaign_id`; a city entry sets that and `google_campaign_id` and leaves `request_id` null. The `/api/admin/ad-boost/case` route is provider-keyed, so write city entries straight to `ad_campaign_log` with the service-role key rather than through it.

**Their running narrative lives in `city_campaigns.admin_note`, not `ad_campaign_requests`.** Update it with `POST /api/admin/ad-boost` → no; use `POST /api/admin/city-ads` `{ action: "update_campaign", id: "<city_campaigns.id>", fields: { admin_note: "..." } }`, or PATCH the row directly. That field is rendered on `/admin/city-ads` per campaign row, so it is read, not just stored.

**Append to a note, never overwrite it.** The note is the only durable record of what was decided at build time and why, and Phase 0 step 2 depends on it surviving.

One `observation` per campaign. If the audit proposes a change, that is a **separate `tweak`** with `before_state`, `after_state`, `expected_signal`, `review_after` — and it is **TJ-gated**: present it, get his go, then make the change in Google, then log it. Never make a live change from inside an audit without that gate; the audit's job is to explain, and a change made mid-explanation muddies the next read.

Full-book mode also writes the state-of-play document to `~/Desktop/adboost-state-of-play.md` (overwrite; the case log is the durable store, the document is the rendering).

## Phase 5 — Publish the read (full book: always)

**The markdown file is the archive; the artifact is what TJ actually reads.** Publish one on every full-book audit without being asked. On a targeted audit, publish only if TJ asks or the finding has a shape a table cannot carry.

Load `artifact-design` before writing the page, and `dataviz` before any chart code — both are required and both catch real defects.

**The page's job is interpretation, not completeness.** The case log holds everything. The artifact holds the handful of things that were invisible in prose, and it earns its existence by showing structure the numbers hide. Do not port the whole state-of-play document into HTML.

**The seven-section spine, which held on 9 Sep and should be reused:**

1. **Masthead** — eyebrow (`Olera paid acquisition · Audit <date> · Day n of N · channels`), a short noun-phrase headline, and a standfirst that states the finding in one sentence.
2. **The funnel matrix** — channels as rows, funnel stages as columns, a proportional bar in each cell normalised *within its column*, the number in tabular mono above it. **Where every channel converges on one value, strike that whole column** with the stop colour and a dashed rule. That column is the finding; everything else is context for it.
3. **Cost per site visit** — three tiles, one bar each, honest denominators (link clicks for Meta).
4. **Beliefs, scored** — every prediction from a campaign note, its outcome, and a verdict chip. **Strike through the dead ones.** This is Phase 0 step 2 rendered, and seeing four of six struck lands differently than reading them.
5. **The campaign table** — all live flights, mono and tabular, a flag mark on rows carrying an open question.
6. **Do next** — numbered, ordered by *when they stop being possible*, each with a deadline chip. Deadlines in the stop colour, everything else muted.
7. **Not settled** — the things the audit could not close, written so nobody re-derives them as discoveries next week.

**Design that is now settled — reuse it rather than re-deriving:**
- Palette: light `#00719B` flow / `#C03A22` stop; dark `#189FC4` / `#E4614A`. Both pass `dataviz`'s validator in their own mode (light band L 0.43–0.77, dark band **0.48–0.67** — the dark band is narrower and most first guesses fail it). Ground `#E7EAE9` light / `#121312` dark; a cool grey with a faint green bias, never warm cream.
- Type: Newsreader (display) · Public Sans (body) · IBM Plex Mono (all numbers, `font-variant-numeric: tabular-nums`).
- **Bars in CSS, not SVG.** Divs with percentage widths cannot collide or overflow a viewBox, which removes the entire class of geometry defect the design skill warns about, and needs no bounding-box check.

**Two rules of substance, both learned the hard way:**
- **Put your own overturned claims in the ledger.** The 9 Sep page struck a belief this same audit had published four hours earlier. That is the most useful row on the page, not an embarrassment.
- **Give the caveat its own paragraph, in the body, not a footnote.** If two rows might be misclassified, say which two and what changes if they are. A page that hides its uncertainty is worse than the prose it replaced.

Hand TJ the link and **end the message by pointing at the one thing the page shows that the prose could not**, and where on it to look.

## Output

**Targeted:** the answer, stated plainly in the first line. Then the case file. Then what you did not check. If the answer is "I cannot explain this," say that — Miracle August is currently in that state and pretending otherwise cost two days.

**Full book:** the published artifact link first, then the cross-case tables from Phase 3, then the case files, then the list of things blocked on TJ (providers holding false claims, outcomes never asked, decisions pending a review). End with the single next action.

Either mode: **do not present a conclusion that is not falsified by any counter-example in your own tables.** Before writing the verdict, reread every table for the row that contradicts it. That is the whole discipline this command encodes.
