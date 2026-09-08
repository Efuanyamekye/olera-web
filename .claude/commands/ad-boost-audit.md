# Ad Boost Campaign Audit (Deep Dive, Browser-Driven)

Input: $ARGUMENTS — provider name(s), Google campaign ID(s), campaign tag(s), or nothing.

## What this is, and what it is not

`/ad-boost-setup` builds campaigns. `/ad-boost-optimize` maintains them on a 3–4 day cadence and stops at a diagnosis table. **This command answers "why did this campaign do what it did,"** across every flight the provider has run, using internal data and Google Ads together, and it leaves the answer in the case log so nobody has to derive it twice.

It was written the day after a two-month program failure was reconstructed by hand. That reconstruction took roughly forty browser and database reads, produced three wrong diagnoses before the right one, and found that two of the facts that explained everything were already written in per-campaign notes nobody had connected. The command exists so that never costs forty reads again.

| | **Full book** (no arguments) | **Targeted** (`/ad-boost-audit Franchil`, `/ad-boost-audit 24166094865`) |
|---|---|---|
| Scope | Every campaign that has ever run — provider campaigns grouped by provider, **plus the Olera-owned city campaigns** | One provider, **every flight they have run** — never just the current one. A city slug (`/ad-boost-audit charlotte`) audits that city arm across channels |
| Depth | Case file per campaign, cross-case patterns table | Everything below, plus whatever the specific question needs |
| Output | State-of-play document + one `observation` per campaign in `ad_campaign_log` | One case file, written to the log, and the answer stated plainly |
| Use when | Monthly, or whenever the program's premise is in question | A sweep flagged a campaign it could not explain; a provider asks why; two flights disagree |

A bare invocation runs the full book. A provider name runs targeted. **A targeted audit on a provider with more than one flight reads all of them** — the explanation for flight 2 is almost always in flight 1.

Canonical references: `/ad-boost-setup` (locked invariants, URL table, campaign ID registry) · `/ad-boost-optimize` (browser mechanics, material-component quirks) · `~/Desktop/adboost-state-of-play.md` (the output format this command reproduces) · memory `project_adboost_outcome_blindness`, `reference_ad_metrics_are_hand_typed`, `reference_chrome_devtools_attach_mode`.

## Four ways this analysis has gone wrong, in one day

Read these before forming any view. Each was a confident single-cause story that skipped a counter-example already in the data.

1. **"The landing page is the cause."** Overturned by a campaign serving fine on the same page template.
2. **"The budget is too low."** Overturned by a campaign serving fine on the identical $1.67/day. Also: *Top of page bid (low range)* in Keyword Planner is the price of a **top placement**, not of a click. Our realized CPC has run $1.85–$2.42 against "low range" bids of $3–$8. Do not read that column as a floor.
3. **"There is no market here."** Overturned by the previous flight serving 124 impressions in the same city. A Keyword Planner figure describes the keywords you fed it, in the geography you scoped it to — nothing else.
4. **"The rebuild dropped the winning keywords."** Half true. Per-keyword data showed the best keyword had survived, Eligible, at zero impressions. The mechanism was the negative list removing its query pool, not the rewrite.

**The pattern:** one cause that explains everything, when the truth was different causes in different cases. Franchil August (negatives removed the query pool) and Miracle August (unexplained; keywords carried over correctly and it still serves zero) are different failures that were treated as one for two days. **Write a separate diagnosis per campaign and let them disagree.**

Two more, statistical: at ~2.7% click-to-inquiry and ~20 clicks a flight, P(zero inquiries | healthy campaign) ≈ 58%. That is a likelihood, not a posterior; it does not mean ignoring a silent campaign is right 58% of the time. The likelihood ratio against "broken" is only 1.7, so **zero inquiries is almost no evidence either way. Zero impressions is.** And the 2.7% itself has a 95% interval of 1.2%–5.8% on 6 of 222 clicks, so any threshold derived from it is soft.

## Phase 0 — Internal pull (no browser; run first, and while any auth is pending)

Service-role key is in `.env.local`; never ask TJ for it. **Every metric column on `ad_campaign_requests` is hand-typed and wrong** — on 4 Sep Edmonds read $0.00 / 4 impressions against Google's $43.52 / 394. Read them for what the operator *believed*, never for what happened. Google is the only source for spend, clicks, impressions.

1. **Campaign rows** — all of them, not just live. Group by `provider_id`. Note `campaign_tag`, `status`, `flight_start_date`/`flight_end_date` (routinely null on live rows — a finding in itself), `provider_comms_paused_at`, `admin_note`.

   Also pull the **city campaigns**: `city_campaigns` and `city_leads`. These are Olera-owned, provider-agnostic campaigns on the same Google Ads account, and they are in scope for every audit. They are easy to miss twice over: they have no `provider_id`, and **they do not appear in the `/aw/campaigns` list under the saved view's filters** — a sweep run from the campaign table alone will skip them. Reach them by `platform_campaign_id`. Filter `city_leads` on `is_test=false`; TJ's own test rows are in there.

2. **Read every note in full and score its predictions. Do this before the browser and before forming any hypothesis.**

   `admin_note` is not background colour. It is the only durable record of what was decided at build time and why, and **it routinely contains the answer to the question the audit is asking.** The failure this step exists to prevent, observed 7 Sep 2026: three campaigns had served zero all day, and the cause was sitting in their own build notes — Google's own estimated CPC, recorded at build as **$3.68 / $3.61 / $2.94, every one of them above the $2.50 cap the campaign was then given**. Rosemonte's note had said it outright a month earlier: *"Google est. avg CPC $3.10 vs $2.50 cap — expect underspend."* The flag had been raised four times and scored zero times. The audit went to the browser and re-derived it as a "new discovery."

   So produce this table before anything else, and put it in the readout:

   | Campaign | Prediction or flag recorded in the note | Where | What actually happened | Scored |
   |---|---|---|---|---|

   Sweep every note for: Google's estimated CPC or clicks/week against the cap and budget actually set; any sentence beginning "expect", "watch", "flag for TJ", "PENDING", "decide at"; any deviation from SOP that was recorded and justified; any hypothesis stated at build. **Every one of those is a prediction nobody has scored.** Scoring them is usually cheaper and more conclusive than anything the browser will tell you.

   Two rules that follow from it:
   - **Nothing is a "new finding" until you have checked whether a prior note already recorded it.** If a note did, say so and credit it — the finding is *"this was flagged on <date> and not acted on"*, which is a different and more actionable claim than *"I discovered this."*
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

Present Phase 0 findings before opening the browser if TJ is mid-auth. Half the audit is here.

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

**Any Google re-auth mid-session is a checkpoint.** On 10 Aug a re-auth on this account wiped 13 headlines, 4 descriptions and 13 keywords from a campaign. After TJ completes one, **re-read keywords, the ad, and the final URL** on every campaign you touched before it, before doing anything else. On 4 Sep this check was run deliberately and passed; run it every time.

## Phase 2 — Google Ads read, per campaign, all flights

Set the date range to **All time** once (date picker → "All time"); it carries across pages. The default 30-day window renders ended campaigns as zeros and looks like "no data."

For every campaign object the provider has ever had — **and for both Olera City campaigns, every time, in full-book mode**:

> **The city campaigns do not appear in the `/aw/campaigns` list under the saved view's filters.** A sweep driven off that table will silently skip them, which is how they went unaudited until 7 Sep 2026. Reach them by `campaignId`: Charlotte `24223751948`, Dallas `24223844624`. Everything below applies to them unchanged — keywords, search terms, negatives, change history, settings.
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

## Phase 3 — Cross-reference (this is the audit)

For each provider with more than one flight, and for the program as a whole:

- **Keyword carryover.** For every keyword in the current flight: was it in the previous flight, and what did it earn there? For every keyword that earned a click in the previous flight: is it in the current one, verbatim? Reworded counts as absent — `"senior care killeen"` (53 impressions) became `"senior home care killeen"` (Low search volume). Table it.
- **Negatives against the prior flight's traffic.** Which of last flight's clicked queries does the current negative set block? Count impressions and clicks that would be blocked. If the prior flight converted and the current list blocks its traffic, that is a finding regardless of what the list was meant to do.
- **Negatives-during-flight, across the book.** Group every campaign by how many negatives were live *during its flight* (from change history dates, not the current state) and tabulate clicks and inquiries per group. On 4 Sep: 0–6 negatives → 140 clicks, 6 inquiries; 48+ → 105 clicks, 0.
- **DB vs Google.** Every hand-typed metric against Google's all-time figure. Report the worst deltas by name.
- **Told vs true.** Launch email date vs first impression date. Wrap-up sent vs `email_log` status (suppressed addresses fail silently). Outcome asked vs outcome answered.
- **Inquiry follow-through.** For every inquiry: qualification data present? Provider read it? Replied? Family replied? Outcome recorded? Five of six outcomes in program history were never established, and "one confirmed client" was a verbal claim not in the system.

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

## Output

**Targeted:** the answer, stated plainly in the first line. Then the case file. Then what you did not check. If the answer is "I cannot explain this," say that — Miracle August is currently in that state and pretending otherwise cost two days.

**Full book:** the cross-case tables from Phase 3, then the case files, then the list of things blocked on TJ (providers holding false claims, outcomes never asked, decisions pending a review). End with the single next action.

Either mode: **do not present a conclusion that is not falsified by any counter-example in your own tables.** Before writing the verdict, reread every table for the row that contradicts it. That is the whole discipline this command encodes.
