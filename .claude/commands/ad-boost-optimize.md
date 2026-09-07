# Ad Boost Campaign Optimization (Browser-Driven)

Input: $ARGUMENTS — provider name(s), Google campaign ID(s), or nothing.

## Two modes

| | **Sweep mode** (no arguments) | **Targeted mode** (`/ad-boost-optimize Rosemonte`) |
|---|---|---|
| Scope | Every campaign currently serving | Only the named provider(s) / campaign ID(s) |
| Phase 1 | Full query + prioritization + skip rules | Resolve the name to a campaign ID, then straight to Phase 2 |
| Phase 2 read | Fixed comparable set, same for all | Same set **plus** whatever the specific complaint requires — ad-level performance, geo report, ad schedule, change history |
| Depth | Stop at the diagnosis table | Keep going until the campaign is actually explained |
| Output | Cross-campaign table + decision list | One campaign, full narrative: what's wrong, why, what was changed, what to watch |
| Use when | Routine 3-4 day maintenance | Something specific looks broken, TJ asks about one provider, or a campaign just came back from a fix and needs its 48h re-read |

Sweep mode is the default and the one that should run on a cadence. **Targeted mode is not "sweep mode with a filter"** — a sweep triages the book and moves on, a targeted run does not stop at "negatives look fine," it keeps digging until the number is explained. If a sweep flags a campaign as anomalous, the follow-up is a targeted run on that one.

**This command maintains. It does not diagnose.** When a campaign's number cannot be explained from the Phase 2 read — zero impressions on an Eligible campaign, a flight that converted and a rebuild that did not, a provider whose two flights disagree — stop and run **`/ad-boost-audit`** on it. That command reads internal data and Google together, across flights, and writes case files. This one only reads what a sweep needs.

**A bare invocation always sweeps.** No arguments means sweep — do not ask TJ which campaigns he meant, do not narrow it, just run the book. An attached screenshot alone does **not** switch modes here: it is context, not a target list. (This deliberately differs from `/ad-boost-setup`, where a screenshot of the Requested queue *does* pick the providers — that command acts on a queue, this one acts on everything serving.) Only an explicitly named provider or campaign ID in the text switches to targeted mode.

If arguments name a provider with more than one campaign (a revived flight 2, or a provider running two cities), list them and ask which — do not guess and do not do both silently.

## Purpose

The recurring mid-flight maintenance sweep for campaigns that are already running. `/ad-boost-setup` builds campaigns; this one keeps them from bleeding. It is the same work as that command's Phase 3.5 (search-terms harvest) and Phase 3.6 (revive), lifted out so it can be run across the whole live book on a cadence instead of once per build.

**Run this every 3-4 days.** On a 2-week flight there are only ~3 useful sweeps before the money is gone.

Canonical references (read if uncertain, don't re-derive):
- `/ad-boost-setup` — locked invariants, direct URLs, campaign ID registry, all Google Ads automation gotchas.
- Notion SOP: "SOP — Managed Ads (Ad Boost): Google Ads Campaign Setup (any provider)" (id `38d5903a-0ffe-818f-a75b-db0951f7b178`).
- Memory: `project_managed_ads_setup_sop`, `project_adboost_outcome_blindness`.

## Read this before harvesting a single negative

This command's original thesis was that category-adjacent and competitor-brand queries are waste, and that negatives are "the only lever that compounds." That thesis was measured on one campaign (HomeWell, 119 terms, 4 named clicks, zero leads) and then rolled across the whole home-care book as a 98-term shared list between 2 and 23 August 2026.

**The 4 September audit found the opposite pattern, and the rule below replaces the old one.**

- Every inquiry in the program's history came from a campaign running **six or fewer** negatives during its flight. No campaign running 48 or more has produced one. At the earlier rate, P(zero across the 105 clicks in the high-negatives group) ≈ 1%.
- Franchil's June flight — the best result ever, 3 inquiries at ~$12 on 124 impressions — served almost entirely on `rosewood villas killeen`, `nursing homes killeen`, `assisted living killeen tx`, `memory care killeen tx`, `visiting angels killeen tx`. Exactly the buckets this command used to negate on sight. **Its 3 conversions came from those 16 clicks.** The shared list, applied to the August rebuild, removed that query pool; the campaign served 1 impression in 12 days.
- HomeWell — the campaign the list was built from — produced zero leads *before* it had any negatives. Wrong-category traffic did not cause that zero.

**The rule now:** a search term is not waste because it names a competitor or a different care category. It is waste only if it is *unambiguously not a family seeking care*. That means jobseeker terms (`jobs`, `hiring`, `careers`, `salary`, `resume`, `become a caregiver`, `certification`, `training`, `visa`, `sponsorship`) and nothing else by default. A family searching "nursing homes killeen" is in crisis and open to any answer; a family searching "visiting angels" is comparison shopping and may well take the second option they see. **Both are leads.**

Negating a category or a competitor is a hypothesis, not a hygiene step. It gets logged as a `tweak` in `ad_campaign_log` with an expected signal and a review date, like any other change, and it gets reversed if the review says it cost impressions without saving money.

**The list this command built still exists** (`provider managed ads negative keywords`, sharedSetId `12134249254`, 98 terms, on 9 campaigns as of 4 Sep). Do not attach it to anything new. Do not add to it. Removing it from the 8 campaigns still carrying it is a pending decision that waits on Franchil's 7 Sep review.

## Do NOT thrash

$50 ÷ ~$2.00 CPC = ~25 clicks per flight. At ~3% landing conversion that is **~0.7 expected leads**, so **roughly half of correctly-built campaigns will show zero leads and nothing is wrong.** Zero leads is not a signal. Zero *clicks* with impressions is a signal. Know the difference before touching anything.

Never change keywords and negatives in the same pass — the read becomes unattributable. Sequence is fixed: **negatives → wait 48h → re-read CTR → only then consider a keyword rebuild.** The one exception is a campaign at zero impressions, where there is nothing to attribute anyway; there, restore the prior flight's proven configuration in one move and log it as such.

**Every change this command makes is a `tweak` in `ad_campaign_log`** — `POST /api/admin/ad-boost/case` with `expected_signal` and `review_after`, or the database rejects it. Reading Google and not writing the case is the same mistake as reading Google and not writing the numbers back. The overdue-review badge on `/admin/ad-boost` is what makes the 48h re-read actually happen.

## Phase 0 — Browser up (`/open-dia`, FIRST ACTION of every sweep)

**Invoke `/open-dia`.** Not "read it," not "follow its principles from memory" — invoke it, so its rules are actually loaded: snapshot before screenshot, viewport set deliberately, TJ handles every auth wall, irreversible clicks gated. Everything below assumes a live, visible window.

Then, in this order:

1. **Is the automation browser even running?**
   ```bash
   pgrep -f "remote-debugging-port=9222" && curl -s --max-time 5 http://127.0.0.1:9222/json/version
   ```
2. **If it is not running, hand-launch it.** This account runs the MCP in **attach mode** (`--browserUrl http://127.0.0.1:9222` in `~/.claude.json`), so it will *not* launch a browser for you, and `/open-dia`'s kill → `new_page` relaunch path does not apply here. Pass the URL argument — without it Dia can come back windowless:
   ```bash
   nohup /Applications/Dia.app/Contents/MacOS/Dia \
     --user-data-dir=/Users/tfalohun/.cache/chrome-devtools-mcp/chrome-profile \
     --remote-debugging-port=9222 \
     --no-first-run --no-default-browser-check --restore-last-session=false \
     --window-size=1440,900 --window-position=40,40 \
     "https://ads.google.com/aw/campaigns?ocid=984737409" \
     >/tmp/dia-9222.log 2>&1 &
   sleep 9; curl -s --max-time 5 http://127.0.0.1:9222/json/version   # must return JSON
   ```
3. **Prove the window is visible before touching anything:**
   ```
   evaluate_script: () => ({ innerW: innerWidth, innerH: innerHeight, outerW: outerWidth, outerH: outerHeight })
   ```
   **`outerW`/`outerH` of 0 means the process is alive but windowless.** Snapshot and evaluate keep working, so the session looks fine while TJ sees nothing, and you will not find out until the first screenshot times out. Relaunch per step 2 rather than papering over it with `emulate`.
4. **Expect a Google auth wall and budget for it.** `tj@olera.care` re-auths often, including a "Verify it's you" on a freshly launched profile. `select_page` with `bringToFront: true`, tell TJ exactly what to click, and wait. **Never type credentials.** This is a hard stop, not something to work around — so raise it early rather than after the DB work.

Phase 1 needs no browser, so if TJ is mid-auth, **run Phase 1 while waiting** and present its findings instead of idling.

## Phase 0.5 — Session guard (once per sweep, before any campaign)

Open `https://ads.google.com/aw/recommendations/autoapply?ocid=984737409`. Both cards must read **"0 of 7 selected"** and **"0 of 14 selected"**. If anything is on, uncheck it — then **navigate away and click Save in the leave-confirmation modal** (the top-of-page Save button is the workspace filter save and does nothing here). Reload to confirm.

This is the account's main silent-drift vector. It is what re-enables AI Max, reverts keywords to Google defaults, and re-adds the "Olera.care" headline.

## Phase 1 — Build the sweep list (no browser)

**Targeted mode:** run the same query filtered to that provider — you still need the row `id`, `campaign_tag`, and `flight_start_date` for the Phase 5 write-back — then resolve to the Google campaign ID and go. Skip only the prioritization. Still run Phases 0 and 0.5 — the browser has to be up either way, and auto-apply drift is account-wide, so one campaign is enough to catch it.

**There is no Google campaign ID column on this table.** The mapping is by campaign name / `campaign_tag` against the registry, which is why the registry has to be maintained by hand.

Query prod `ad_campaign_requests` (service-role key is in `.env.local`; never ask TJ for it):

```sql
select id, display_name, provider_slug, campaign_tag, status,
       flight_start_date, flight_end_date, admin_note,
       ad_clicks, ad_impressions, ad_spend_cents, ad_budget_cents,
       created_at, ended_at
from ad_campaign_requests
where status in ('live','scheduled') and deleted_at is null
order by flight_end_date asc nulls last;
```

**Days-in-flight is measured from `flight_start_date`, never `created_at`.** `created_at` is when the provider requested, which routinely runs weeks ahead of launch (Legacy Haven requested Jul 1 for a Jul 6 flight). Using it silently misprioritizes the whole sweep. If `flight_start_date` is null on a live row, that is itself a data gap worth reporting.

Then map each row to its Google campaign ID. **The registry lives at the bottom of `/ad-boost-setup` Phase 2** (HomeWell `24052308622` · Legacy Haven `24062146484` · Miracle-Lightstar Jul `23998344651` · **Miracle-Lightstar Aug `24151612515`** · Impact `23998367469` · Abode `23981427299` · Rosemonte `24126008389` · **Franchil Jun `23961292547`** · **Franchil Aug `24166094865`** · **Graceful Aug `24162206362`** · **Edmonds Aug `24094557242`** · **Edmonds Sep `24176699440`**; bold ones verified 4 Sep 2026). **A provider can have more than one ID.** Franchil and Miracle each have two campaign objects, and the case that explains the current one usually lives in the previous one — read both. Anything not listed: read `/aw/campaigns?ocid=984737409`, match on campaign name `{Provider} – {City} – {Mon YYYY}`, and **write the new ID back into that table in `ad-boost-setup.md`** so the next sweep doesn't re-derive it.

Prioritize the list:

| Situation | Priority |
|---|---|
| 3-7 days since launch, never harvested | **Highest** — this is where the money is still recoverable |
| ≥3 days since the last harvest line in `admin_note` | High |
| Flight ends in <3 days | High, different purpose — the terms feed the flight-2 revive, not this flight |
| Launched <3 days ago | Skip, no data yet |
| `status='scheduled'` but not actually serving | Not an optimization problem — check the launch, then hand to `/ad-boost-setup` |

**The sweep is not only provider campaigns.** Olera runs two of its own, and they are the only campaigns in the account where Olera pays the bill, so an unread number there costs us directly rather than a provider. They live in `city_campaigns`, not `ad_campaign_requests`, so a query against the provider table will silently miss them:

| Campaign | Google ID | Row |
|---|---|---|
| Olera City – Charlotte NC – Sep 2026 | `24223751948` | `city_campaigns` where `slug='charlotte-nc'`, `channel='google'` |
| Olera City – Dallas TX – Sep 2026 | `24223844624` | `city_campaigns` where `slug='dallas-tx'`, `channel='google'` |

Read them exactly like a provider campaign in Phase 2. `GET /api/admin/city-ads` returns both rows with their `id`, which Phase 5 needs.

**Note which campaigns still carry the shared list** — `Level` column reads `List` on their Negative keywords page. As of 4 Sep that is 9 campaigns; Franchil Aug had it detached. Assisted-living providers (Rosemonte, Edmonds) never had it, because it negates `"assisted living"` — and that same reasoning, that a list can negate a campaign's actual intent, is what the 4 Sep audit found had happened to the home-care campaigns too. Treat the list as a suspect on every campaign carrying it, not as protection.

## Phase 2 — Per-campaign read (gather before judging)

For each campaign, pull the same fixed set so verdicts are comparable across the book. Use the direct URLs — in-app nav hides or 404s most of these.

1. **Campaign row** — `/aw/campaigns?ocid=984737409`: status (Eligible / Eligible (Limited) / Ended), budget, spend-to-date, clicks, impressions, CTR, avg CPC.
2. **Impression share** — same page, Columns → Modify columns → **Competitive metrics**: `Search lost IS (rank)` and `Search lost IS (budget)`. Without these you cannot tell "losing auctions" from "budget-capped," and the fix is different.
3. **Search terms** — `/aw/keywords/searchterms?campaignId={id}&ocid=984737409`, **Show rows: 50**, read every term. For an ended campaign set the date range to **All time**; the default window renders empty and looks like "no data."

   **The report is partial by construction and you must say so in the readout.** Google only exposes search terms above a privacy threshold, so `Total: Search terms` is routinely a fraction of the campaign's real numbers — Pacesetter showed **2 of 13 clicks and 49 of 149 impressions** on 2026-08-14, with the balance hidden under `Total: Other search terms`. Compare the two totals every time. A clean-looking harvest on a campaign with 15% term visibility is not evidence the spend is clean; it is evidence you cannot see it. Never report "no waste found" without the visibility ratio next to it.
4. **Keywords** — `/aw/keywords?campaignId={id}&ocid=984737409`: note which have zero impressions, and **read the live set before writing any negative** (Phase 3).
5. **Existing negatives** — `/aw/keywords/negative?campaignId={id}&ocid=984737409`: read the `Level` column. Shared list shows as `List`, campaign-level as `Campaign`. You only need the delta.
6. **AI Max toggle** — campaign Settings, confirm `aria-checked=false`. It silently re-enables and its URL expansion strips `utm_campaign`, which kills attribution.

**Targeted mode adds** — pull these only when the campaign is the subject, they are too expensive for a sweep:

- **Change history** (`/aw/changehistory?ocid=984737409` — verified): the fastest answer to "why did this change?", including changes Google made on its own.
- **Device split** (`/aw/devices?campaignId={id}&ocid=984737409` — verified) — read only. **Never set a device bid adjustment**; see the locked invariant in `/ad-boost-setup`.
- **Ad-level performance** (`/aw/ads?campaignId={id}&ocid=984737409` — **verified 2026-08-14**): ad status (Eligible / Disapproved) and Ad Strength. First thing to check on any near-zero-impressions campaign, since it rules approval in or out in one read.
- **Geo report**: out-of-market cities in the search terms usually mean the radius or Presence setting drifted. **URL not verified** — reach it via in-app nav, then add it to the direct-URL table in `/ad-boost-setup`.
- **Live landing page**: load the provider page with the campaign's exact Final URL and confirm it renders, the UTM lands, and the inquiry CTA works. Clicks paid for a broken page are the worst outcome available and no Google-side report will ever show it.

Do not guess Google Ads URLs. That direct-URL table exists because the in-app nav hides or 404s most of these, and a guessed URL costs a live browser session. Derive once, verify, record.

## Phase 3 — Diagnose

| Symptom | First thing to check | Then |
|---|---|---|
| **Impressions ~0 on an Eligible campaign** | Does it carry the shared negative list, and did the *previous* flight serve on queries that list now blocks? Read the prior flight's search terms at All time | If yes: that is the cause. Detach the list, restore the prior flight's earning keywords, log the tweak. If the prior flight has no such terms: `/ad-boost-audit` |
| High lost IS (rank) everywhere | This is the account baseline — 72–89% on every home-care campaign that has ever served, 77.8% account-wide. It is not a per-campaign fault | Do not reach for negatives. Landing page experience is Below average on 4 of the 5 keywords Google has ever scored; that is the rank drag, and it is a page problem, not a keyword problem |
| Low CTR with named terms that look off-category | Did the campaign that converted have the same pattern? Franchil June's 12.90% CTR — best ever — came from exactly this traffic | Do not negate on sight. If CTR is genuinely collapsing, `/ad-boost-audit` before touching anything |
| "Eligible (Limited) — Missing enough relevant keywords" | Too few live keywords; some drawing 0 impressions | Rebuild from the **previous flight's per-keyword impressions**, never from a template. Franchil Aug was rebuilt from June's zero-impression terms |
| Underspending with lost IS (budget) high | Actually budget-constrained | Leave it. $50 is the locked intro spend |
| Zero leads, clean campaign, clicks landing | Just the $50 math (~0.7 expected leads) | **Nothing.** Do not thrash |
| Clicks but no leads across several flights | Landing page, or the lead arrived and nobody followed up | Read the inquiry threads — `connections` rows for the provider — before blaming the page. Four of four inquiries in program history were read by the provider within a day; one was never answered |
| Disapproved ad / policy | Ad status on `/aw/ads?campaignId=` | Fix the asset. The only case where the ad itself is the cause |

**Mid-flight CTR is a leading indicator, not a verdict.** HomeWell read 1.04% at day 5 and finished the flight at 3.03%. The *waste pattern* in the search terms is the durable signal; CTR recovers on its own sometimes. Harvest on the terms, not on the CTR number.

## Phase 4 — Harvest negatives (the actual work)

Sort every search term into: **provider's own brand** (never negate) · **jobseeker** (negate — the only bucket that is waste by definition) · **out-of-market cities** (negate only if the geo radius is right and the term is genuinely outside it) · **competitor brands** (do **not** negate by default; see the section above) · **adjacent care category** (do **not** negate by default; this is where Franchil's conversions came from) · **legitimate**.

The old buckets negated the middle two on sight. That is now a logged hypothesis with a review date, not a default.

Rules, all non-negotiable:

- **Always phrase match, never broad.** Broad would kill the live `"home health aide {city}"` keyword.
- **A phrase negative blocks any query containing it.** Negating `"home health"` kills the live `"home health aide {city}"`. Negate the specific variants instead: `"home health care"`, `"home health {city}"`, `"home health agencies"`, and the branded ones.
- **Everything goes at campaign level.** The shared list (`12134249254`, 98 terms) is frozen: do not add to it, do not attach it to anything. A per-campaign negative can be reviewed and reversed against that campaign's own numbers; a shared one changes nine campaigns at once and cannot be attributed.
- **Never negate a term the previous flight got a click on.** Read the prior flight's search terms at All time before writing anything.

**TJ gate:** present the proposed negative list per campaign — grouped by bucket, with the live keywords it was checked against — and get his go before pasting. A wrong phrase negative silently kills a live keyword and you will not notice for days. Everything else in this command is read-only and needs no gate.

Pasting: the negative-keyword box is a `<textarea>`, so the JS native-setter trick works. `material-checkbox` and material-inputs do **not** accept synthetic clicks — use the real chrome-devtools `click` tool with snapshot uids. If a click reports success but nothing changes, check `document.elementFromPoint(x,y)` for a stuck `IPL-PROGRESS-INDICATOR` overlay and fix it with a `navigate_page` reload.

**What does and does not respond to synthetic clicks** (measured 2026-08-14, saves a lot of expensive snapshots):

| Element | Synthetic `.click()` | Notes |
|---|---|---|
| `material-fab` (the `+` Add negative keywords) | **works** | On a campaign with no campaign-level negatives yet the control is a FAB, not a labeled button — search by `aria-label`, not text |
| `material-button` labelled Save / Cancel | **works** | |
| `material-expansionpanel` header (`div.header.closed`) | **fails silently** | Panel stays `closed`. Needs the real `click` tool with a uid |
| `material-checkbox`, material text inputs | **fails** | |

**Typing into material inputs:** JS value setters do not stick. `focus()` → `document.execCommand('selectAll')` → `document.execCommand('insertText', …)` does, and Angular sees it. This is how the CPC cap and the flight end date were both edited.

**The date picker renders on a `<canvas>`** — there are no day cells in the DOM to click, and `innerHTML` for the calendar is empty. Don't try to compute canvas coordinates. There is a plain `<input>` holding the formatted date (e.g. `Aug 16, 2026`) with no aria-label; find it by value and `insertText` the new date (`Aug 30, 2026`), then Save.

**The "Turn off ad blockers" dialog is permanent on this profile** and has no dismiss button. Dia ships a component extension that Google detects, and `--disable-extensions` does not remove it. It does **not** block the negative-keyword or settings work — proceed through it. But it does sometimes leave the Settings panel needing a second attempt: reload, click Settings again, and it renders.

**Watch for the "Unsaved changes" modal.** Editing one settings section and then clicking into another can throw `Your last change wasn't saved. Continue without saving?` — click **Go back**, save the first section, then move on. Save one section at a time and re-verify after a full page reload; the panel will happily show a value that never persisted.

## Phase 5 — Write the numbers back (do NOT skip — this is half the value)

Every metric read in Phase 2 has a real column. **Reading Google and not writing back is the single most wasteful thing this command can do**, because those columns are load-bearing:

| Column | What it drives |
|---|---|
| `ad_clicks`, `ad_impressions` | The CLICKS column in `/admin/ad-boost` — which reads `ad_clicks ?? ad_landings ?? 0`, so a number there does **not** mean Google data is stored; it may be our own UTM-cookie landings. Also the provider receipt (`lib/ad-boost/receipts.server.ts`) |
| `ad_spend_cents` | Receipt spend line; wrap-up and end-of-flight emails |
| `ad_clicks` / `ad_spend_cents` > 0 | **Makes the traction email eligible.** `lib/ad-boost/admin-communications.ts` gates it on exactly this. **Check `provider_comms_paused_at` first** — a campaign under experiment has provider email paused (migration 204) and must not be told it has traction until the review says it does |
| `flight_start_date`, `flight_end_date` | Days-in-flight for the next sweep's prioritization; auto-end scheduler |

Write via **`POST /api/admin/ad-boost`** (the route exports GET, POST, DELETE — **there is no PATCH handler**, a PATCH 405s) or the `/admin/ad-boost` UI. **Cents, not dollars** — $33.02 is `3302`.

Body rules the route enforces, all of which 400 if you get them wrong:

- `ad_budget_cents` and `ad_budget_type` **must be sent together** (or both cleared). Valid types are **`daily`** and **`lifetime`** only — a campaign-total budget is `lifetime`; Rosemonte-style daily budgets are `daily` (`$3.57/day` ⇒ `357`).
- `flight_start_date` must be ≤ `flight_end_date`, evaluated against whatever the row already holds for the field you don't send.
- `id` is required and the write is one row per call.

**Authentication:** the route needs an admin session, and the automation browser profile is usually signed into Google but *not* into olera.care. Check with `fetch('/api/admin/ad-boost')` from the page early — a `401 {"error":"Not authenticated"}` means TJ has to sign in in that window before any of this works. Do that check at Phase 0, not after the whole read is done.

**Backfill `flight_start_date` whenever it is null** while you are already writing. As of the 2026-08-14 sweep every live row had it null, forcing dates to be reconstructed from `admin_note` prose.

**The two Olera City campaigns write somewhere else.** They are not rows in `ad_campaign_requests` and `POST /api/admin/ad-boost` will not find them. Use:

```
POST /api/admin/city-ads
{ action: "update_campaign", id: "<city_campaigns.id>",
  fields: { ad_spend_cents, ad_clicks, ad_impressions } }
```

Cents, not dollars, same as above. The route stamps `metrics_updated_at` itself, rejects a negative number, and also accepts `status`, `platform_campaign_id`, `flight_start`, `flight_end`, `budget_cents`, `max_cpc_cents` if any of those drifted.

This matters more than the provider write-backs, not less. Olera funds these two, and **cost per family a provider actually reached is the one number the city pilot exists to produce**. Its numerator is spend, and spend has exactly one source: this read. Nothing else in the system will ever fill that column, so a sweep that skips it means the pilot cannot be evaluated at all. If you read Google and write nothing, say so plainly in the readout rather than leaving it implied.

Then write the narrative to **`ad_campaign_log`**, not `admin_note`:

```
POST /api/admin/ad-boost/case
{ request_id, google_campaign_id, campaign_tag,
  entry_type: "check_in",
  summary: "Sweep: 47 terms read · CTR 3.03% · avg CPC $2.36",
  detail: "...visibility ratio, what was and was not negated, and why...",
  metrics_snapshot: { impressions, clicks, ctr, cost, lost_is_rank, lost_is_budget } }
```

Any negative added is a **separate `tweak` entry** with `before_state`/`after_state`, an `expected_signal`, and `review_after` 48h out. The route and a DB CHECK both reject a tweak without those. `admin_note` is legacy — it is one text blob that was written at setup and never updated, which is how two months of per-campaign facts went unconnected. Read it for history; do not write to it.

Keep the split clean: **numbers go in columns, narrative goes in the note.** The note explains what was done and why; it should not be the only place a metric exists. **Record final numbers before any revive** — flight 1 and flight 2 blend inside a revived campaign and become unseparable.

## Phase 6 — Flights that are ending

A flight at its end date does **not** get optimized. It gets:

1. A final search-terms harvest at **All time** — those terms are the entire input to flight 2.
2. Final numbers written to the **columns** (`ad_clicks`, `ad_impressions`, `ad_spend_cents`) per Phase 5, plus a closing `admin_note` line. The end-of-flight receipt and wrap-up email read the columns; if they are null the provider gets a receipt with blanks in it.
3. Wrap-up recorded so the outcome flow can ask the provider what actually happened. We are otherwise blind to conversions (see `project_adboost_outcome_blindness`: Franchil spent $36.50 and produced 1 confirmed client the platform never saw).

If the provider has requested again, **do not build a new campaign** — go to `/ad-boost-setup` Phase 3.6 and revive. Quality Score and ad history are per-campaign, and QS is exactly what throttles these campaigns; a fresh build throws it away and restarts learning.

## Output — one readout, not a click narration

**Sweep mode** — a single table across the whole book:

| Provider | Days in flight | Clicks / Impr / CTR | Spend | Verdict | Action taken | Needs TJ |
|---|---|---|---|---|---|---|

Then a short list of anything that needs a decision (keyword rebuilds pending the 48h re-read, providers to ask for photos, flights to revive) and, separately, **any campaign that warrants a targeted run** and why.

**Targeted mode** — no table, one campaign explained: the numbers, the diagnosis and what ruled out the alternatives, what changed, what to re-read and when. If the answer is "nothing is wrong," say that plainly and show the numbers that prove it.

Either mode: do not report a campaign as "optimized" if the only finding was zero leads on clean traffic. Say "healthy, no action, $50 math" and move on.
