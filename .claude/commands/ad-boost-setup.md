# Ad Boost Campaign Setup — Provider + City, Google + Nextdoor

Input: $ARGUMENTS — provider name(s) OR Olera city name(s)/quiz URL(s), optionally followed by channel, budget allocation, and flight dates; OR a screenshot of the relevant admin queue. Infer the campaign type and subjects from explicit text or a clear screenshot, then verify against the correct records below.

## Entry — determine what is being promoted

If the input and conversation do not identify the type, ask: **"What are we promoting—a specific provider or an Olera city care page?"** Ask only for missing information; a clear provider queue screenshot means provider, and `/care/{city}` or an explicit city quiz request means city. A city mentioned as a provider's address alone does not imply a city campaign.

- **Provider:** continue with the provider workflow below. Source of truth: `ad_campaign_requests`; destination `/provider/{slug}`; admin `/admin/ad-boost`.
- **City:** read and execute `.claude/commands/ad-boost-setup-city.md` instead of the provider phases below. Source of truth: `CITY_CONFIGS` plus `city_campaigns`; destination the existing `/care/{slug}` quiz; admin `/admin/city-ads`. Do not rebuild the quiz or create a fake provider request.
- **Mixed batch:** make one packet listing type, subject, channel, exact allocation, dates, and goal per row. Execute each type's workflow and keep the whole-batch budget explicit.

Existing session authorization persists. Do not ask TJ to repeat a type, channel, budget, or goal already agreed. Resolve routine choices within that agreement and present exact dates and platform settings at the final review. Publishing still requires the applicable final publish gate.

## Purpose

Take one or more Ad Boost providers from "Requested" to published, policy-audited campaigns on **Google, Nextdoor, or both**. Drive the selected ad manager directly through the visible browser, with TJ approving every final Publish/Create action. The Google track encodes the flow proven on Miracle-Lightstar + Impact (2026-07-05); the Nextdoor track encodes the Graceful Homecare pilot (2026-08-14).

Canonical references (read if uncertain, don't re-derive):

- Notion SOP: "SOP — Managed Ads (Ad Boost): Google Ads Campaign Setup (any provider)" (id `38d5903a-0ffe-818f-a75b-db0951f7b178`). It remains authoritative for the Google track. **Append a Worked Example entry for each provider when done.**
- Memory: `project_managed_ads_setup_sop` (locked invariants + browser-automation gotchas).

## Phase 0 — Channel + allocation gate (MANDATORY, before DB or browser work)

If `$ARGUMENTS` does not already answer these, ask TJ once, compactly, **for each provider**:

1. **Channel:** Google, Nextdoor, or both?
2. **Budget:** total authorized dollars for this flight.
3. **Allocation:** when both, exact Google dollars + exact Nextdoor dollars. They must sum to the total.
4. **Flight:** start and end dates. A comparison should use the same dates on both platforms.
5. **Learning goal:** cheapest qualified traffic, direct leads, or an apples-to-apples channel comparison?

Then present the proposed packet and wait for confirmation:

| Provider | Channel(s) | Total | Google | Nextdoor | Flight | Shared campaign tag | Goal |
|---|---|---:|---:|---:|---|---|---|

**Budget safety:** the historical free intro is **$50 total per provider**, not $50 per platform. Never silently turn “both” into a $100 commitment. For one channel, propose the usual $50. For both, ask for the split; an even split may be offered as a neutral starting point, but never selected without TJ confirming it.

**Decision framing:** Google is the higher-intent, higher-CPC search channel. Nextdoor is the lower-CPC local-discovery channel. “Both” is the cleanest traffic-efficiency comparison, but the current Ad Boost row stores one campaign tag and one aggregate performance triplet. Therefore use one shared campaign tag across both platforms, use platform-specific `utm_medium`, keep the dollar/campaign-ID breakdown in `admin_note`, and say plainly that Olera’s downstream questions/leads are combined while each ad manager keeps its own spend/click totals. Do not pretend Olera can assign a downstream conversion to one platform when both share a flight.

Do not touch either ad account or change the request status until this gate is resolved.

## Locked invariants

### Shared across Google + Nextdoor

- Canonical final URL: `https://olera.care/provider/{slug}?utm_source=olera_managed&utm_medium={medium}&utm_campaign={tag}` where `medium=paid_search` for Google and `medium=paid_social` for Nextdoor. Tag = `{stub}-{city}-{mon}{yy}` and must match `ad_campaign_requests.campaign_tag` **character-for-character before launch**. Never let the ad URL use a friendly tag while Olera stores the request UUID again.
- One selected channel → `channel='google'` or `channel='nextdoor'`; both → `channel='both'`.
- Budget fields must describe a real control, not a wish: one lifetime-capped platform (or two lifetime caps whose sum is the whole-flight envelope) → store the total with `ad_budget_type='lifetime'`; Single-platform daily budgeting (Google or explicitly authorized Nextdoor) → store the actual daily amount with `ad_budget_type='daily'` and put the planned total/end-date envelope in `admin_note`; Multiple platforms with any daily control → leave the aggregate budget pair blank rather than imply one platform control, and record each exact daily/lifetime control, end date, and total authorization in `admin_note`.
- Store the real platform start/end dates in `flight_start_date` and `flight_end_date`. Re-read them from each ad manager before launch and again during handoff; the Olera end date must not drift beyond the paid flight.
- Use the same provider page, core value proposition, geography, and dates when the goal is an apples-to-apples channel comparison. Adapt only the format constraints native to each platform.
- Never install a third-party pixel/tag during setup. Olera attribution is the managed UTM → first-party page/event trail.
- **Every platform has a publish gate.** Stop at the final review with the complete configuration and wait for TJ to say “publish” or “create.”

### Google-specific (never re-derive)

> ⚠️ **The 2-week / $50 defaults below are under active revision.** On 2026-08-19/20 TJ authorized **90-day flights on a daily budget with no end date** (copying Rosemonte's structure) at **$150 per channel** for the Graceful / Miracle-Lightstar / Edmonds Villa / Pacesetter batch, because short flights taught us nothing across eleven providers. Campaign-total budgets weld a campaign to a window that **cannot be extended** — seven attempts across four routes on 2026-08-19 all failed server-side, and the account has never extended one. **Confirm flight length and budget with TJ per batch rather than assuming either default.** These invariants are left as written pending his decision on whether 90 days becomes the standing default.

- Google Search only at the **confirmed Google allocation**, normally a **2-week flight** starting next Monday-ish (Mon → Sun, 14 days, match the setup-week convention in the request row). TJ set the 2-week default on 2026-08-02 so we learn faster and providers don't lose interest waiting a month. Campaigns launched before that date keep their original 4-week flights — do not shorten live campaigns.
- **Maximize clicks with $2.50 max CPC cap** — never Maximize conversions.
- Search-only: Search Partners OFF, Display Network OFF.
- Geo: provider's city + **20 mi radius**, **Presence only** (not presence-or-interest). If the provider's address is far from the city center (check lat/lng), center on their **ZIP + 20mi** instead.
- Languages: English + Spanish. AI Max **OFF** (verify again post-publish — it can silently re-enable, and its URL expansion strips `utm_campaign`).
- Final URL uses the shared invariant with `utm_medium=paid_search`. Display path: `Home-Care` / `{City}`.
- Campaign name: `{Provider} – {City} – {Mon YYYY}`.
- **Account-level auto-apply stays OFF, all 15 types.** Verify at the start of every session (Phase 1 step 0). This is the account's main silent-drift vector — it is what re-enables AI Max, reverts keywords to Google defaults, and re-adds the "Olera.care" headline.
- **NEVER set a device bid adjustment.** Paid traffic is already ~87% mobile on its own (desktop = 9.2% of clicks AND 9.2% of spend, measured 2026-07-25). Excluding desktop saves <$10/mo and only narrows the auction. Do not confuse this with the site's ORGANIC provider-page traffic, which is 71% desktop — different population, different problem, owned by Esther.
- **No bare "near me" phrase keywords.** Measured across HomeWell + Legacy Haven: `"home care near me"`, `"in home care near me"`, `"caregivers near me"` drew **zero impressions**. They are dead slots. Use `{service} {city}` and `{service} {suburb}` instead.

- **Every campaign needs 3-5 HEAD terms or it delivers nothing. Check this before publishing.** (2026-08-22, cost Zardy and Jasmine two dead days on live campaigns we had already told them were running.) A head term is either the provider's **own city + service** (`senior home care cleveland`) or a **city-less service phrase** (`personal care assistance`). Suburb names and modifier-prefixed variants (`live in home care {city}`, `24 hour senior care {city}`) are tail, not head — they are supplements to a head set, never a substitute for one. Miracle-Lightstar's July campaign: 5 head terms produced **320 of its 338 impressions** (`personal care assistance` 149, `in home care cleveland` 59, `senior home care cleveland` 40, `home care cleveland` 25); the two suburb keywords produced **3**. The August rebuild kept only suburbs and modifiers and served **0 impressions in 2 days** on an Eligible campaign with an approved ad. Nothing in the UI flags this — status reads Eligible, the ad is approved, and the campaign is simply invisible. **Pre-launch assertion: count the keywords that are (own city + service) or (service, no geo). If that count is under 3, the set is not shippable.**

- **"Never the big metro" does NOT mean "skip the provider's own city."** The rule (Oak Ridge yes, Knoxville no) exists to stop targeting a metro the provider cannot serve. A provider located *in* a big city has that city as its head term. Reading it as "avoid Cleveland" is what produced the suburb-only set above.

- **Correction to the near-me rule's stated evidence** (2026-08-22): `"home care near me"` is not always zero-impression. In Cleveland it drew **47 impressions at 2.13% CTR** against a 7.69% campaign average. The rule stands and is if anything more important than "dead slot" implies -- under Maximize Clicks a low-CTR keyword that *does* serve spends budget and drags campaign quality, which is worse than one that never enters the auction. Keep excluding it; the reason is CTR, not absence of volume.

- **A blanket "every keyword names a town" is too strict.** `"personal care assistance"` (no geo) was the single highest-volume keyword in Miracle-Lightstar's July flight -- 149 impressions, 7.38% CTR. Geo-targeting already constrains where a city-less keyword serves, so verify the campaign's Locations first (`/aw/locations?campaignId=X`) and then allow 2-3 city-less service terms.
- **Assisted-living / senior-living providers get a DIFFERENT negative list.** Never apply the home-care shared list to them — it contains `"assisted living"`, `"senior living"`, `"retirement community"` etc., which are their core intent. Build them a campaign-level list instead (home-care terms + home-care brands + senior-living operator brands + brokers).

### Nextdoor-specific (Graceful pilot baseline)

- Objective = **Increase website visits**; optimization = **Clicks**. Do not choose Promote your business or a Nextdoor lead form for the apples-to-apples provider-page test.
- Prefer the confirmed Nextdoor allocation as an **exact lifetime cap** when available. If the current UI requires daily budgeting, use only the explicitly authorized daily amount with a scheduled end. Re-read the real control on review; daily × duration is planned spend, not a hard lifetime cap. Never silently raise spend to meet a platform minimum.
- Target the provider’s actual service city/ZIP and only the area they can serve. For a comparison, align it as closely as Nextdoor permits with Google’s presence-only service area and document unavoidable geo differences.
- The Special ad category box stays unchecked for senior/home-care services; it is for regulated housing listings, job postings, and credit offers—not ordinary care-service advertising.
- Use the verified provider logo and provider-owned/approved imagery only. If website-image import is enabled, inspect every imported image before review.
- Campaign name: `{Provider} – {City} – {Mon YYYY} – Nextdoor`. Ad group: `{City} — ${allocation} Lifetime`. Give each creative a clear provider/city name.
- Keep automatic placements for the first flight unless TJ explicitly asks for a placement test. Graceful’s pilot strongly favored **Conversations** (93/101 clicks at $0.33 CPC) over Newsfeed (5 at $0.44) and For Sale & Free (3 at $1.01), but one pilot is not enough to hard-disable inventory globally.
- Nextdoor may report zero “Conversions” because no Nextdoor pixel is installed. That is not proof of zero Olera outcomes. Judge delivery using Nextdoor spend/impressions/clicks plus Olera tagged visitors, questions, direct leads, and contact-intent events.

### Expectation-setting (say this out loud, don't quietly over-promise)

- **Google baseline:** $50 ÷ ~$2.00 CPC = **~25 clicks total for the whole flight**. At the measured ~3% mobile landing conversion that is **~0.7 expected direct leads**, so roughly half of correctly-built campaigns will show zero leads.
- **Nextdoor baseline (Graceful, through 2026-08-16):** $35.66 bought 101 clicks at $0.35 CPC; 92 unique tagged Olera visitors produced 7 anonymous question submissions from 7 sessions, but **0 contactable/direct leads**. Cheap relevant traffic is proven once—not lead generation.
- **Both:** compare CPC, click→tagged-visitor delivery, question rate, direct leads, and contact-intent rate. Never compare only the ad platforms’ “Conversions” columns.

The budget is intentionally small and the product is still unproven. Optimize **clicks-per-dollar** and **conversion-per-click**; do not promise leads or raise spend without explicit approval.

## Phase 1 — Prep (DB + hygiene, no browser yet)

**Step 0 — Google account-level guard (Google selected only; do ONCE per session).** Open `https://ads.google.com/aw/recommendations/autoapply?ocid=984737409` and confirm both cards read **"0 of 7 selected"** and **"0 of 14 selected"**. If anything is on, uncheck it. **The save is a leave-confirmation modal, NOT an inline button** — uncheck everything, then navigate away and click **Save** in the "Save changes to your auto-apply settings?" dialog. The `Save` button visible at the top of the page is the filters/workspace save and does nothing for auto-apply. Reload to confirm it stuck.

For each provider (from screenshot or $ARGUMENTS, matched against `ad_campaign_requests` where status='requested'):

1. **Pre-flight**: provider is verified OR `verification_state='not_required'` (both deliver leads); has photos (`metadata.images`) — if none, note "ask provider for 1-2 photos" as a TJ follow-up and eyeball the live page; has non-null lat/lng (geocode if missing — organic Find Families matching depends on it).

1a. **LOOK AT THE PHOTOS. A COUNT IS NOT A CHECK.** (2026-08-20: all four providers in that batch passed "has photos" and all four had a landing-page problem serious enough to waste the clicks we were about to buy.) Download `metadata.images` and actually view them — a contact sheet built with PIL is the cheap way; the whole set is one image read. What that found:
   - **Miracle-Lightstar**: 5 of 13 were photographs of printed tri-fold flyers (QR codes, phone and email burnt into the pixels), 7 were stock models, 1 was the logo. **The hero was a picture of a brochure.** Zero real photographs of the business.
   - **Graceful**: real, well-shot, full-resolution photos — of a *facility*. Communal dining hall, twenty-chair lounge, multi-storey atrium. She sells **non-medical in-home care**. Authentic and off-message is worse than stock and on-message, because nobody thinks to check it.
   - **Pacesetter**: her two genuine branded headshots were her two **smallest files** (271×312, 284×308) and **last** in the gallery, behind a parking-lot exterior and two *clinical* stock shots (hospital bed, stethoscope) for a non-medical agency.
   - **Edmonds Villa**: every image genuinely hers, but hero = an empty room of banquet tables, second = **a crock pot**, and the one photo of residents and caregivers together sat at position 4. Four of fourteen were bathrooms; one was the propane tanks.

   Check, in order: **what is image[0]** (it is the hero and it is the whole first impression), is anything a flyer/screenshot/logo rather than a photograph, is it stock, does the subject match what they actually sell, and is anything under ~800px (it will render soft). **Ordering is usually the cheapest fix and needs nothing from the provider.**

1b. **Read `care_types[0]` — the page prints it verbatim as the hero chip.** All four in that batch were wrong: `"Respite Care"` for a general agency, `"Independent Living"` for a home-care agency, `"home-care"` (the raw lowercase slug, which reads as a broken page), and — on an adult family home whose ads we are building — `"Memory Care"`, the exact term Google health policy forbids in the ads. If the chip is wrong, fix the array order before spending; it is the first word a family reads.

1c. **Check for AI trust signals.** None of those four had any, so all four rendered nearly bare highlight rows (Tier 1 of the `lib/provider-highlights.ts` waterfall is trust signals). Two of them had a **state licence number sitting in `metadata`** that the page never surfaced. Worth flagging to TJ as a fast credibility win.
2. **ZeroBounce** the contact email (key in analysis scripts). Do NOT write results to `email_validity` (CHECK constraint only allows delivery outcomes).
3. **Flip the request row to `scheduled`** with the confirmed `channel`, exact shared campaign tag, actual flight dates, authorized total budget/control, and `admin_note` containing the per-platform allocation and planned campaign names. Do this through `/admin/ad-boost` so validation runs. If the row’s tag does not exactly match the ad URL, stop and correct it before any publish.
4. **Google selected:** build the Google packet: **14-20 phrase-match keywords, every one naming a town** (`senior home care {town}`, `in home care {town}`, `senior care {town}`, `elderly care {town}`, `home caregiver {town}`, `respite care {town}` across the provider's 3-5 real service towns). **Never bare category + town** (`home care oak ridge` ran 0% on 34 impressions while `senior home care oak ridge` ran 13.0%), **never `near me`** (0% everywhere), **never the big metro** (Oak Ridge yes, Knoxville no), and **never `home health aide {city}`** (see Known blockers). Expect 2-4 to report `Low search volume` — that is correct and harmless; a dead keyword costs nothing, a low-CTR live one costs the whole campaign. Then 13 headlines (provider name first; all ≤30 chars), 4 descriptions (≤90 chars). Only claim ratings if substantiated (e.g. "5-Star Rated" needs a real 5.0★ profile).
5. **Nextdoor selected:** build the Nextdoor packet: provider logo/image, short local headline, plain-language body, CTA to the same tagged provider page, exact service-area target, allocation, and flight. Keep the proposition aligned with the Google packet when comparing channels.

## Phase 2G — Build in Google Ads (Google selected only; chrome-devtools MCP)

### Step A — prove the window is REAL and VISIBLE before touching the wizard (do this every session)

**TJ has to watch this flow and personally complete the Publish click and any Google "Confirm it's you" re-auth. A window he cannot see makes the whole session worthless.** So the very first browser action of every session is a visibility check, not a navigation:

```
evaluate_script: () => ({ innerW: innerWidth, innerH: innerHeight, outerW: outerWidth, outerH: outerHeight })
```

**`outerW`/`outerH` of 0 means the automation browser process is alive but windowless** — snapshot/evaluate/click still work, so the session *looks* fine while TJ sees nothing. Screenshots time out ("Page.captureScreenshot timed out") and `resize_page` errors "Active contents not found". Do NOT paper over this with `emulate` viewport — that restores clicking but never puts a window on TJ's screen, and you will get all the way to the publish gate before discovering he was blind the whole time. (Cost this once, 2026-08-10.)

**Fix — relaunch the automation browser with a real window (~15s).** The MCP for this account runs in **attach mode** (`--browserUrl http://127.0.0.1:9222` in `~/.claude.json`), so it will **not** relaunch the browser for you; killing it and calling `new_page` just fails. You must hand-launch:

```bash
# 1. Kill ONLY the automation instance — it is the one with --remote-debugging-port.
#    NEVER kill TJ's main Dia (plain command line, no automation flags).
pgrep -f "remote-debugging-port=9222"   # confirm the pid first
kill <automation-pid>; sleep 3

# 2. Relaunch with explicit window geometry and a URL arg (the URL is what forces a window to open)
nohup /Applications/Dia.app/Contents/MacOS/Dia \
  --user-data-dir=/Users/tfalohun/.cache/chrome-devtools-mcp/chrome-profile \
  --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --restore-last-session=false \
  --window-size=1440,900 --window-position=40,40 \
  "https://ads.google.com/aw/overview?ocid=984737409" \
  >/tmp/dia-9222.log 2>&1 &
sleep 8
curl -s --max-time 5 http://127.0.0.1:9222/json/version   # must return JSON
```

Then `list_pages` (it will report "browser was restarted or reconnected" — call it again), `new_page`, and **re-run the visibility check**. Success looks like `outerW: 1440, outerH: 900` and a `take_screenshot` that actually returns an image. Confirm to TJ that the window is up before proceeding.

Note `--window-size` alone is not enough on a bare relaunch; pass the **URL argument** too or Dia can come back windowless again. If CDP answers but bounds are still 0×0, `Browser.setWindowBounds` over raw CDP on port 9222 can force geometry — but a fresh launch with the URL arg is the reliable path.

This is the same failure documented in the `/open-dia` skill under "Screenshots/resize time out but snapshot/evaluate still work" — that skill assumes launch mode (`kill` → `new_page` auto-relaunch); **this account is attach mode, so the hand-launch above is the correct version.** Read `/open-dia` for the other browser failure modes (Vercel Code 21, MCP launch hangs).

### Step B — the wizard

Open `ads.google.com` (Olera account 419-933-1442, tj@olera.care). If the Claude-managed Chrome profile is signed out, ask TJ to sign in once and wait.

Wizard path: Create campaign → New campaign → **Create a campaign without guidance** → Search → keep default conversion goals → check Website visits only (never Phone calls) → tagged Final URL → campaign name → then per step:

- **Bidding**: focus = Clicks, check max CPC limit, $2.50.
- **Campaign settings**: uncheck both networks; Custom locations → Advanced search → **Radius** → city or ZIP, 20 mi; Location options → **Presence**; add Spanish.
- **AI Max**: leave OFF. **Keyword/asset generation**: Skip.
- **Keywords and ads**: paste keywords; set display paths; **replace every prefilled asset** — Google prefills an "Olera.care" headline (URL in ad text = the classic past denial) and sometimes wrong-city descriptions. Add headline slots to reach 13.
- **Budget**: Campaign total = the confirmed Google allocation, with the confirmed start/end dates.
  - **If campaign-total refuses to publish, fall back to a daily budget.** A draft can get stuck showing `Add a budget: To publish your campaign, enter a budget` with **no Publish button**, even with the amount and both dates entered and rendering correctly in the Overview. Re-entering, blurring, and re-saving does not clear it. Switching to **Average daily budget → Set custom budget → Google allocation ÷ flight days** (e.g. $50 ÷ 14d ⇒ `$3.57`) clears it instantly. Same planned spend envelope; the differences are that daily can flex up to 2× on a given day and the stop is enforced by the **end date** rather than a hard total cap — so after switching, **confirm the end date survived** (Campaign settings → More settings), because the dates live on the campaign-total widget and vanish from the Overview when you switch. This is draft-specific, NOT account-wide: existing campaigns run on campaign-total fine, and reviving one (below) can still use it.

### Mandatory policy audit (TJ requirement — do this before Review, every time)

Scripted check over every headline + description: **no URLs** (`http|www|.com|.care|...`), **no phone numbers**, **no weird stuff** (!!, ALL-CAPS runs, symbols), headlines ≤30 / descriptions ≤90. Report the audit result to TJ.

### Known blockers & how to handle

- `"home health care {city}"` keywords → hard policy block ("Health in personalized advertising"). **Remove the keyword**, don't request an exception. Never include dementia/alzheimer's/memory-care terms.
- **`"24 hour home care {city}"` also trips "Health in personalized advertising"** — blocked LumiWell (Fresno, 2026-08-17) and Miracle-Lightstar (Cleveland, 2026-08-20). **The trigger is the literal string "24 hour home care", not "24 hour" generally:** in the same ad group, `"24 hour senior care cleveland"`, `"live in caregiver cleveland"` and `"live in home care cleveland"` all passed. Use those to carry 24/7 intent instead.
- **The classifier is not purely lexical — do not predict it.** The same block also flagged `"in home care cleveland heights"`, which contains no health term at all, while `"senior home care cleveland heights"` passed. Build the set, let the Review screen name the offenders, remove exactly those. On a fresh draft the Policy details panel lists the flagged keywords by name; expand it rather than guessing.
- **`"home health aide {city}"` is DEAD — do not use it.** It is a job-seeker query: 0% CTR across every campaign that ran it (16 impressions Miracle-Lightstar, 12 Abode, 9 Impact, zero clicks on all three). It was adopted as the `home health care` workaround and the negative list was deliberately shaped phrase-match to keep it alive. That was wrong. Drop the keyword; do not add it as a negative (that would block legitimate `home health aide agencies` queries).
- Budget step may fire a Google **"Confirm it's you"** re-auth that only TJ can complete in the browser ("Changes failed to save" in the sidebar until cleared). Ask TJ, retry, continue. Clicking **Confirm** opens the real challenge in a **new tab** — `list_pages`, `select_page` with `bringToFront`, screenshot it, and hand TJ the window. Never type credentials.
- **The `AD_FINAL_URL` re-auth SILENTLY ROLLS BACK the entire ads step.** (Cost this a full rebuild, 2026-08-10.) It is triggered by the ad's destination URL, so it fires on a first-time domain/UTM combo and again on any later Final URL edit — not by the budget itself, despite appearing during the budget step. After ANY Google identity challenge, **re-verify the ads step field-by-field before trusting the Review screen**: expect all headlines/descriptions reverted to Google's prefill (the `Olera.care` headline reappears), keywords and display paths blank, and the budget reset. Verify with `Headlines n/15` + `Descriptions n/4` counters and by asserting no headline equals `Olera.care`.
- **A CLEAN Review screen right after a re-auth is evidence of the rollback, not of health.** (2026-08-20, Miracle-Lightstar — nearly published a reverted ad on TJ's go-ahead.) The issue list is derived from the campaign's contents, so once keywords are wiped to 0 and assets revert to Google's own safe prefill, **there is nothing left to flag** — the screen reads its cleanest at exactly the moment the campaign is most broken. It reported "Your campaign is ready to publish", zero issues and no policy warning while the ad held an `Olera.care` headline, a competitor's name in a description, and 0 keywords. **Order of operations: assert the ads step is POPULATED (`Headlines n/15`, `Descriptions n/4`, keyword count > 0, no headline equal to `Olera.care`), and only then read the issue list.** Never infer a property of the keyword set from a screen that no longer contains the keyword set — doing so produced a confidently wrong "this keyword didn't trip the policy" call that the restored keywords immediately disproved.
- **The Review screen's Overview is not a reliable mirror of saved state.** It showed `Locations: All countries and territories` and AI Max "turned on" while the actual Campaign settings step held the correct radius and AI Max off — and it omits campaign start/end dates entirely even when they are set. Verify anything suspicious on its own step (dates live under Campaign settings → **More settings**, which does load despite the sub-panel warning above) before "fixing" what isn't broken.
- **`Publish campaign` only renders when you arrive at the summary through the wizard.** Loading `currentStep=campaign-summary` by URL, or reloading it, produces a page that says "ready to publish" with no button anywhere in the DOM. Go back one step and click **Next** to surface it.
- Bidding warning triangle after setting the CPC cap = standard advisory, not a blocker.
- Angular-Dart dropdowns don't expose options to the a11y tree — click options via evaluate_script on `material-list-item` / `material-select-dropdown-item`.
- **Synthetic JS `.click()` on `material-checkbox` does NOT register** — Angular never sees it and the counters don't even move. Use the real chrome-devtools `click` tool with snapshot uids. (JS native-setter DOES work for `<textarea>`, e.g. the negative-keyword paste box; it does NOT work for material-inputs or checkboxes.)
- **`Remove` in the keyword row's status dropdown silently no-ops under automation; `Pause` works.** (2026-08-22.) Two attempts via the bulk `Edit → Remove` menu returned a "removed" toast and the keyword was still Enabled after a hard reload. The per-row status control (`Edit this Keyword status`) → **Pause** applied first try and survived reload. Pausing achieves the same delivery outcome. Verify by reloading and reading the row's Status cell -- the default `Enabled, Paused` filter will still show a paused keyword, so a visible row is not proof of failure.
- **Campaign Settings sub-panels ("Other settings", where device/ad-schedule controls live) never finish loading** under the automation profile — they hang on "Loading name / Loading summary" forever, and Google shows a persistent "turn off ad blockers" dialog. Don't debug it; use the direct URLs below.
- **Before concluding "this setting won't save," check for a leave-confirmation modal.** Several Google Ads panels (notably auto-apply) defer the write until you navigate away. Uncheck → refresh will always look like a silent revert.
- **Clicks that "succeed" but change nothing → look for a stuck `ipl-progress-indicator`.** The wizard sometimes leaves a full-screen `position:fixed; z-index:9999; pointer-events:auto` loading overlay up permanently. The click tool reports success (it dispatched at the coordinates) but the overlay ate it, and `aria-selected` never flips. Diagnose with `document.elementFromPoint(x, y)` on the target's center — if it returns `IPL-PROGRESS-INDICATOR` instead of your element, that's it. **Fix: `navigate_page` reload.** Re-select from the reloaded page; wizard state up to that point lives in the `cmpnInfo` URL param and survives.
- **Verify each wizard selection actually took** before clicking Continue — `[role=tab]` → `aria-selected`, `material-checkbox` → `aria-checked`, dropdowns → the combobox `value`. Do not trust "Successfully clicked".

### Direct URLs (the in-app nav hides or 404s on most of these)

| Page | URL |
|---|---|
| Campaign settings (bid cap) | `/aw/adgroups?campaignId=X&ocid=984737409` → click **Campaign settings** (the direct `/aw/settings` URL hangs) |
| Device performance | `/aw/devices?campaignId=X&ocid=984737409` |
| Search terms | `/aw/keywords/searchterms?campaignId=X&ocid=984737409` |
| Keywords | `/aw/keywords?campaignId=X&ocid=984737409` |
| Campaign negatives | `/aw/keywords/negative?campaignId=X&ocid=984737409` |
| Auto-apply settings | `/aw/recommendations/autoapply?ocid=984737409` |
| Conversion actions | `/aw/conversions?ocid=984737409&subtab=allconv` |
| Change history | `/aw/changehistory?ocid=984737409` |

| Ads (status, Ad Strength) | `/aw/ads?campaignId=X&ocid=984737409` |
| Negative keyword list details | `/aw/negativekeywordlistdetails?ocid=984737409&sharedSetId=12134249254&sharedSetCustomerId=984737409` |

Campaign IDs: HomeWell `24052308622` · Legacy Haven `24062146484` · Miracle-Lightstar `23998344651` · Impact `23998367469` · Abode `23981427299` · Rosemonte (assisted living) `24126008389` · **Pacesetter `24072567829`** · **Edmonds Villa AFH `24094557242`**

Note `/aw/sharedlibrary/negativekeywordlists` and `/aw/campaigns/settings` both **404** — don't guess these. The shared-list URL above was derived by reading the list link's `href` off any campaign's negative-keywords page.

### Conversion tracking — known dead, don't chase it

All 6 lead conversion actions read **0.00** ("Provider inquiry (lead form)" = "No recent conversions"; others Inactive / Needs attention / Misconfigured). At ~72 clicks/month account-wide we will never reach the 15-30 conversions Smart Bidding needs, so **the "switch to Maximize Conversions once data accrues" plan is unreachable at this budget.** Leave campaigns on Maximize Clicks. Don't spend a session fixing tracking until volume justifies it.

### Google publish gate

**STOP at the Review screen and present the full config summary + audit result. TJ says "publish" → click Publish campaign.** Never publish without his explicit go. Record the campaign ID from the post-publish URL.

## Phase 2N — Build in Nextdoor Ads (Nextdoor selected only)

Use the same visible browser requirement as Phase 2G Step A. Open `https://ads.nextdoor.com/v2` and confirm the selected advertiser account belongs to the provider being built. **Never put another provider’s campaign inside the Graceful Homecare advertiser account.** If a new advertiser account or payment method is required, prepare everything else and hand TJ the account-creation/card step; do not invent billing details.

### Step A — objective + campaign shell

1. Create campaign → choose **Increase website visits**.
2. Leave **Special ad category** unchecked.
3. Enter the provider’s tagged Olera URL using `utm_medium=paid_social` and the exact shared tag already saved in Ad Boost.
4. Campaign name = `{Provider} – {City} – {Mon YYYY} – Nextdoor`.
5. Ad group name = `{City} — ${allocation} Lifetime`.

### Step B — audience, creative, and budget

1. **Location:** target the confirmed city/ZIP/service area. Read the final location label back verbatim; do not assume a radius was accepted merely because it was typed.
2. **Creative:** use the approved provider logo/image and the packet copy. Inspect auto-imported website imagery before accepting it. Avoid medical-condition targeting/claims, guarantees, unverifiable rankings, URLs/phone numbers in ad text, or wording that implies Nextdoor endorses the provider.
3. **CTA/destination:** website visits to the tagged provider page—not a generic Olera page and not the provider’s own website.
4. **Budget control:** the confirmed lifetime cap, or an explicitly authorized daily amount with a scheduled end. If platform minimums conflict, resolve the actual cost before publication.
5. **Flight:** exact confirmed dates. For a two-channel comparison, these must match Google.
6. Leave automatic placements on for the first flight unless the confirmed packet says otherwise.

### Nextdoor review audit

Before the final action, read back and present:

- advertiser account + account ID;
- objective = Website visits / Clicks;
- campaign, ad-group, and creative names;
- target geography;
- full tagged URL and exact campaign tag;
- flight start/end;
- actual budget control, daily amount/end time or lifetime cap, and planned flight total;
- logo/image + final headline/body;
- Special ad category unchecked;
- payment saved/available (never display card details).

### Nextdoor known gotchas

For the verified September 2026 Advanced editor recovery, duplication, budget-display and publication-state checks, also read **Advanced-mode execution and recovery** in `.claude/commands/ad-boost-setup-city.md`. Those browser mechanics apply to provider campaigns too; retain the provider-specific destination and records.

- Quick Create may preselect **Promote your business**. Explicitly select Increase website visits.
- The final button may say **Create**, then immediately submit the campaign for review. Treat it as the publish/spend gate even if the word “Publish” never appears.
- A post-create modal saying “Your campaign is under review” is success, not a draft. Do not create a duplicate.
- The Ads tab displays one row per placement; do not sum the campaign total and the placement rows together. Conversations + Newsfeed + For Sale & Free should equal the campaign total.
- Dashboard preset ranges generally end on the latest completed reporting day. Label partial/lagged data honestly.
- Zero in Nextdoor’s Conversions column is expected without its pixel. Verify Olera tagged landings before diagnosing the ad as broken.
- If the tab closes during setup, reopen `/v2/campaign/quick-create` and inspect whether a draft already exists before rebuilding.

### Nextdoor publish gate

**STOP at the final review and present the full audit above. TJ says “create” or “publish” → perform the final action.** Never submit without that explicit instruction. Record the campaign/account IDs and the confirmation state (`under review`, `active`, or `rejected`).

## Phase 3G — Google post-publish (immediately, per campaign)

0. **Re-open Settings → Bidding and read the Maximum CPC bid limit back. It must be `2.50`.** Edmonds Villa published at **$0.50** (2026-08-03) and nobody noticed for 11 days: 4 impressions, 0 clicks, $0.00 of $50 spent, >90% lost impression share to Ad Rank. A 5x-low cap cannot win auctions, and every downstream number looks like "low search volume" instead of a build error. The wizard's Review screen does not surface this. One read at publish time prevents a wasted flight.

   **How to actually read it** (2026-08-20): `/aw/settings?campaignId=X` **hangs** under the automation profile (the "turn off ad blockers" dialog, never finishes loading). Instead open `/aw/adgroups?campaignId=X&ocid=984737409` and click the **Campaign settings** button in the campaign header — the settings panel loads **inline on that page** and works. Then click the `Bidding` section (`aria-label="Bidding"`) to expand it and read the `Maximum CPC bid limit` input value. Click **Cancel** to close without writing. Change history is NOT a substitute: its default window ends yesterday, so a campaign published today does not appear.
1. Skip the Google-tag interstitial (attribution = UTM → provider-page cookie, PR #1239 — never install gtag).
2. **Apply the shared negative list** (`provider managed ads negative keywords`, sharedSetId `12134249254`, **97 terms** as of 2026-07-30) to the new campaign. This covers job-seeker terms, wrong care categories, and ~42 national competitor brands. **Home-care providers only** — see the assisted-living invariant above. Reach it via the campaign's Negative keywords page (`/aw/keywords/negative?campaignId=X`) → Add → "Use negative keyword list".
3. Open campaign Settings and **verify the AI Max toggle is still aria-checked=false**.
4. **Re-verify account auto-apply is still 0/7 and 0/14** (Phase 1 step 0). Publishing is exactly when Google likes to suggest re-enabling.

## Phase 3G.5 — Google search-terms harvest (MANDATORY, 3-5 days after launch — on a 2-week flight, day 7 is already halfway through)

**Do not skip this. It is where the actual money is being lost, and it is the single highest-value recurring chore in the whole product.**

> **Running this across the whole live book rather than for one new campaign? Use `/ad-boost-optimize`.** It sweeps every live campaign, prioritizes by days-in-flight and last-harvest date, and logs each sweep to `admin_note`. This phase and Phase 3G.6 are its core.

Open `https://ads.google.com/aw/keywords/searchterms?campaignId={id}&ocid=984737409`, set **Show rows: 50**, and read every term.

What we found on HomeWell (2026-07-25) after 5 days: **all 50 named search terms had ZERO clicks.** ~28 were competitor brand navigation (`amada senior care`, `ohana home care`, `home instead`, `shannondale`) and ~14 were the wrong category (`home health`, `nursing home`, `assisted living`, `hospice`). Phrase match with close variants pulls brand queries hard. Nobody clicks a generic ad after searching a specific company by name — so CTR collapses (1.04%), Quality Score follows, and the campaign loses **87% of its auctions to Ad Rank** and underspends ($4.91 of $50). Death spiral.

**Full-flight numbers for that same campaign (measured 2026-08-10, after it ended — supersedes the mid-flight read above):** 14 clicks, 462 impressions, **CTR 3.03%**, avg CPC $2.36, **$33.02 of $50**, zero leads. So it recovered from 1.04%, and named terms did eventually get clicks. But **every one of the 4 named-term clicks ($9.23) was still wasted** — `commonwealth senior living at oak ridge`, `private duty nursing knoxville tn`, `private nursing near me`, `south knoxville senior living photos`. Of 119 total terms: ~55 local competitor brands, ~20 senior-living communities, ~15 wrong-category, 4 out-of-market cities. **Read the mid-flight number as a leading indicator, not a verdict — but the waste pattern persists regardless of what CTR does.**

Harvest into negatives, **always phrase match, never broad** (broad match on a negative blocks far more than intended and can silently kill live town keywords):

- **Local competitor brands.** The national list is already applied; every market has its own operators that ONLY surface here. This is why the harvest is per-campaign and recurring, not one-time.
- **Wrong-category terms** the national list missed.
- **Government / nonprofit / info-seeking** (`council on aging`, `office on aging`).

Add local brands at **campaign level**; add anything nationally reusable to the **shared list**.

### Reading the diagnosis correctly

| Symptom | Real cause | Fix |
|---|---|---|
| High lost IS (rank), low CTR | Brand/wrong-category matching tanking Quality Score | Negatives (this phase) |
| "Eligible (Limited) — Missing enough relevant keywords" | Too few live keywords; some have 0 impressions | Rebuild keyword set |
| Campaign badly underspending its allocation | Losing auctions, not a budget problem (check lost IS budget is low) | Negatives first, then consider CPC cap |
| Zero leads on a clean campaign | Often just the small-budget expectation math | Nothing. Do not thrash. |

**Sequence matters:** fix negatives first, wait 48h, then re-read CTR. Only rebuild keywords if CTR did not move. One number decides; do not rebuild on a hunch.

## Phase 3G.6 — Google repeat customers (flight 2+): REVIVE, don't rebuild

**Always check `ad_campaign_requests` for prior rows on the same `provider_id` before building anything.** A provider whose earlier flight `ended` and who has requested again does NOT need a new campaign. Quality Score and ad history are per-campaign, and QS/Ad Rank is the thing throttling these campaigns — a fresh build throws that away and restarts learning. TJ chose revive on 2026-08-10 (HomeWell flight 2).

Revive order matters — **fix the config first, turn spend on last:**

1. **Harvest the prior flight's search terms first** (Phase 3G.5) — an ended campaign's terms are the whole point of flight 2. Set the date range to **All time**; the default window is empty for an ended campaign.
2. **Check what negatives already exist** before pasting. The shared list is usually already attached; you only need the delta. Read the `Level` column — a shared list shows as `List`, everything else as `Campaign`.
3. **Read the live keywords before writing negatives** (`/aw/keywords?campaignId=X`). A phrase negative blocks any query containing it, so it can silently kill a live keyword — e.g. negating `"home care"` would kill every live `senior home care {town}` keyword. Negate the specific variants instead (`"home health care"`, `"home health {city}"`, `"home health agencies"`, branded ones).
4. **Never negate the provider's own brand.** It will appear in the search terms and it is the cheapest, highest-intent traffic they get.
5. **Update the ad's Final URL `utm_campaign`** to the new flight tag (`{stub}-{city}-{mon}{yy}`) or attribution merges both flights. Hover the ad row → the `Edit this Ad` pencil (`.ess-edit-icon`) only appears on hover. **This edit re-triggers the `AD_FINAL_URL` re-auth** — see Known blockers.
6. **Raise the campaign total budget** to `already-spent + confirmed Google allocation` (HomeWell’s $50 example: $33.02 spent ⇒ $83) so the new flight gets its authorized runway.
7. **Extend the end date LAST** — that is what flips `Ended → Eligible` and turns spend back on.

Then run Phase 3G checks (AI Max off, auto-apply 0/7 + 0/14) as normal.

**Reporting caveat to tell TJ:** flight 1 and flight 2 metrics blend inside the revived campaign. Record flight 1's final numbers in `admin_note` before reviving so the flights stay separable.

**Don't change keywords in the same pass as negatives.** Per the diagnosis table, negatives first → wait 48h → re-read CTR. Changing both makes the read unattributable. Dead `"near me"` keywords can stay; they draw zero impressions and cost nothing.

## Phase 3N — Nextdoor post-publish + results check

Immediately after creation:

1. Verify the campaign exists once and is `under review` or `active`—not duplicated.
2. Re-open the campaign/ad-group settings and read back the actual budget control, geography, flight, objective, and final URL.
3. Confirm `utm_campaign` exactly matches the Ad Boost row. Fix either side before traffic begins if it does not.
4. Record Nextdoor account ID, campaign/ad-group/creative names or IDs, allocation, and review state in `admin_note`.

Once serving:

1. Read the **campaign total** for impressions, clicks, spend, CTR, CPC, and conversions for the exact flight window.
2. Read the placement rows separately to diagnose delivery; do not double-count them.
3. Reconcile ad clicks with Olera tagged page views + unique visitors using the exact campaign tag.
4. Read Olera questions, direct leads, benefits completions, saves, and contact-intent events. Anonymous questions are engagement signals, **not contactable leads**.
5. If Nextdoor is the only channel, save its exact impressions/clicks/spend in the Ad Boost performance fields. If both channels ran, save the combined totals there and preserve the per-platform breakdown in `admin_note`.
6. On or after the end date, verify the paid campaign actually stopped. Never extend Olera’s `flight_end_date` beyond the ad-manager end date unless TJ explicitly extends spend.

Graceful interpretation rule: $0.35 CPC and a 91% click→unique-landing rate proved cheap delivery; 7 questions from 7 sessions proved relevant curiosity; 0 contactable leads meant the lead-generation hypothesis was still unproven. Use that layered language—do not collapse every question into a lead or every zero platform conversion into failure.

## Phase 4 — Handoff (TJ-gated, do NOT do automatically)

Present as a checklist, don't execute:

- Reconcile channel, shared tag, flight dates, authorized total/control, and the platform allocation/campaign IDs in `admin_note`.
- Flip request rows → **live via the `/admin/ad-boost` UI** only once every selected platform is serving (auto-sends the once-guarded "campaign is live" email; a DB flip silently skips it).
- For both-channel tests, state that Ad Boost’s onsite outcomes are combined and include the separate Google/Nextdoor spend-click table in the handoff.
- Any photo/profile asks for the provider.

Then: log the session to SCRATCHPAD.md (campaign IDs, deviations, lessons) and append the Worked Example to the Notion SOP.
