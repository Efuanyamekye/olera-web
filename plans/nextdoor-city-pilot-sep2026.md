# Current launch status — September 9, 2026

**Both campaigns published after TJ explicitly confirmed the final Terms/publication step.** Campaign switches are on; both ad groups show Pending review (disabled switches pending approval), $10.00 daily, Sep 10–24, Clicks, Auto bid. No serving confirmed. Campaign overview says No active ad groups while review is pending. Do not republish or recreate.

- Charlotte campaign `1023274174694557629`; group `1023274175558584258`.
- Dallas campaign `1023340399281833119`; group `1023340400171025573`; ad `1023340401144104113`.
- Both flights: September 10, 2026 noon through September 24 noon Central. $140 planned/city, $280 combined; daily control is not a hard lifetime cap.
- Saved and reloaded geo: Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson NC; Richardson, Plano, Garland, Frisco TX. Zero country-wide or DMA targets.
- Both city-specific quiz URLs preserve `utm_medium=paid_social`. Newsfeed creatives inspected with Olera logo and square hero photo. Dallas uses a cloned creative to preserve Charlotte.
- Olera admin reconciliation completed September 9: both Nextdoor rows are scheduled with pending-review notes, $140 planned budgets and exact campaign IDs. Charlotte row `6a3dad58-e9cb-44f4-92d5-13fdb9bafe9f` reused; Dallas row `6e31d8d4-bd89-4fda-8cdf-a8e87f40ef12` inserted. Verified database readback and unchanged Google/Meta rows. Dia admin was returning HTTP 429 and retained stale UI content after reload; DB reconciliation itself succeeded. Do not label either serving/live before confirmed. No provider outreach, production lead submission, migration, or app deployment occurred.

The historical notes below document the build and superseded blockers.

# Charlotte + Dallas Nextdoor pilot — launch packet

Prepared September 9, 2026. TJ approved two city campaigns, one initial ad each, $10/day per city for 14 days ($280 combined planned spend), using the existing conversion quiz. This supersedes the original $50/city proposal. **Historical pre-publication snapshot; current published status is at the top of this file.** Opening the native Google Chrome application and signing in resolved access. The browser extension labeled Chrome was a different session and continued showing the earlier application exception.

Historical build snapshot (superseded): verified Olera advertiser account `1003810864513418699`. Charlotte saved as **Draft**, platform campaign ID `1023274174694557629`; Edit URL verified after saving. Advanced Create was selected to expose end dates. Campaign name and website-visits objective restored. $10 daily budget read back, scheduled September 10, 2026 at 12:00 PM through September 24, 2026 at 12:00 PM, Central Time (14 elapsed days). Overview confirmed Draft, Sep 10 start, Sep 24 end, zero active campaigns. No publication. Dallas not built yet. Saved ad-group row verified: `1023274175558584258`, $10 daily, clicks, auto bid, Sep 10–24, Draft. Targeting remains incomplete. Switching modes reset creative: the earlier Quick Create creative is not verified in this saved draft.

**Budget decision resolved:** TJ explicitly approved $10/day per city and 14 days. Planned spend is $140 per city / $280 combined; daily budgeting is not a verified hard lifetime cap. Do not use the previous $50 proposal or ask this budget question again. Exact proposed schedule is noon Sep 10–noon Sep 24 Central; show it at final review.

**Computer-control recovery:** The window was visible; `noWindowsAvailable` and ScreenCaptureKit -3811 were control errors, not absence of Chrome. Exiting narrow split view exposed location search. Native Window → Nextdoor Ads Manager explicitly activates the window. File dialogs accepted `KP_Enter`; `Return` repeatedly reset the Go to Folder entry. Native accessibility actions sometimes returned stale state before settling; inspect the actual resulting values before repeating a mutation. Native text-area `setValue` did not populate the creative; click + typeText followed by verification did. No security settings changed.

**Geography decision resolved:** Proceed with Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson (NC), and Richardson, Plano, Garland, Frisco (TX). Omit whole-city Dallas and both DMAs. These are concierge acquisition areas supported by the research, not enabled automatic routing or guaranteed provider acceptance. Charlotte now has all six cities selected with 0 countries and 0 DMAs; Save updates completed and returned to overview. Dallas targeting remains to be built.

## Shared settings

- Advertiser: Olera, account `1003810864513418699` (verified September 9).
- Objective: increase website visits; optimization: clicks.
- Budget: $10/day per city for 14 days; $140 planned per city, $280 combined. No change to Google spend.
- Proposed flight: September 10 noon–September 24 noon, 2026, Central Time, 14 elapsed days. Charlotte draft dates verified. If launch slips, shift both together; do not backdate or increase spend.
- Placements: automatic initially.
- CTA: Get started if available; otherwise Learn more.
- Image: existing `public/images/hero-home.jpg` (1920 × 1270), visually inspected: an older adult being supported by a younger adult outdoors. Representative imagery; do not identify them as customers or claim a city location. Use the same photo in both cities. Inspect placement crops in Nextdoor before accepting.
- Logo: existing `public/images/olera-logo.png`, visually inspected Olera hummingbird.
- The ad offers free help finding care, not free home care. Olera calls after the quiz; there is no immediate provider availability claim.

## Charlotte

- Campaign: `Olera – Charlotte – Sep 2026 – Nextdoor`
- Ad group: `Charlotte — $10 daily — 14 days`
- Creative: `Charlotte — Home care quiz — v1`
- Headline: **Finding home care in Charlotte? Start here.**
- Body: **Answer four quick questions about the care you need. Olera will call to help you find local home care. Our help is free for families.**
- Destination: `https://olera.care/care/charlotte-nc?utm_source=olera_city&utm_medium=paid_social&utm_campaign=olera-charlotte-sep26`
- Intended geography: Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson, North Carolina. Exact accepted location labels must be recorded at setup.
- Admin: existing Nextdoor draft visible on September 9. Reuse/reconcile it after inspecting dates and tag; do not duplicate.

## Dallas

- Campaign: `Olera – Dallas – Sep 2026 – Nextdoor`
- Ad group: `Dallas — $10 daily — 14 days`
- Creative: `Dallas — Home care quiz — v1`
- Headline: **Finding home care in the Dallas area? Start here.**
- Body: **Answer four quick questions about the care you need. Olera will call to help you find local home care. Our help is free for families.**
- Destination: `https://olera.care/care/dallas-tx?utm_source=olera_city&utm_medium=paid_social&utm_campaign=olera-dallas-sep26`
- Intended geography: Richardson, Plano, Garland, Frisco, Texas. Exclude whole-city Dallas from this pilot. Exact accepted location labels must be recorded at setup.
- Admin: only Google visible on September 9; a Nextdoor city campaign row is needed. The current admin cannot create campaign rows. Inspect production records before inserting through an authorized database path.

## Verification completed

- Both production `/care/` pages load with the correct city, four-question proposition, Olera callback, and staffed-hours wording.
- Charlotte's Get started button opens “Who needs care?” (step 1 of 4). No answers or fake lead submitted, avoiding production start alerts/SMS.
- Source trace: page query parameters → client `utm` prop → POST `/api/city-leads` → `city_leads` source/medium/campaign fields. `paid_social` classifies as Nextdoor. This is source verification, not a completed production Nextdoor conversion test.
- The city implementation is reusable through `CITY_CONFIGS`; unconfigured city slugs return 404. New cities also need fulfillment and campaign records.
- Production admin: Google live in both cities, Charlotte Nextdoor draft, no providers on call, one Dallas lead awaiting attention. Fulfillment remains concierge. No personal lead details copied into this packet.
- No Olera database campaign records changed. Charlotte platform draft saved, ID verified above. Reuse it rather than creating another Charlotte campaign.

## Resume and final review

1. Resume saved Charlotte ad group `1023274175558584258` in Olera account `1003810864513418699`; do not recreate it.
2. Enter the researched city lists above and verify that the US default is replaced. Do not copy Google DMA targeting.
3. Build both campaigns with the copy/assets above; inspect actual placement crops, category requirements, caps, dates/timezone, and complete URLs.
4. Reconcile Charlotte's existing city draft and prepare Dallas's missing row. Preserve the Google rows.
5. Confirm concierge can handle new requests and the outstanding Dallas lead has an owner.
6. Present the exact saved platform configuration, both creatives, and $280 combined planned spend for TJ's final create/publish instruction.
7. After creation, record IDs and under-review/serving state; verify settings and update city records truthfully.

Success measurement: tagged visit → quiz engagement → contactable qualified family → reached family/provider outcome. Compare channels over equivalent windows and exclude test leads. This small test is directional; no lead-count guarantee. Day-5/day-14 checks are intended review points, not scheduled automations.

## Concurrent Meta work — verified September 9

PR #1844 (`lively-carson` → `staging`) is open. Read its `docs/city-ads/CHANNEL-INFRASTRUCTURE.md` through GitHub. It reserves migration 220, adds Meta pixel/CAPI and channel reporting, and keeps Nextdoor `paid_social` separate from Meta `paid_meta`. Our current changes are documentation only; no overlap with its four application files and no migration reservation. No merge or deployment performed.

Keep the subject-first, channel-second command entry. Reuse the shared channel reporting when deployed. A Nextdoor pixel is a possible follow-up with platform-specific API verification, not an implemented feature or an explanation proven to account for prior zero-lead performance. The handoff also changes the geo review: validate actual franchise/concierge coverage rather than copying the full Google DMA. Preserve the 8am–noon local callback window. The later explicit $10/day and 14-day messages supersede the pending budget decision; the handoff screenshots themselves did not authorize spend.

## Geography recommendation after requested deep research

See `docs/city-ads/NEXTDOOR-GEOGRAPHY-RESEARCH.md`. Final Nextdoor inclusions after internal notes reconciliation: Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson (NC); Richardson, Plano, Garland, Frisco (TX). These are publicly supported coverage recommendations, not confirmed staffing or automatic-routing readiness. Do not copy the Google DMA. Keep concierge; verify exact accepted Nextdoor labels before final review. No geography was changed in the platform during research. Current admin access in native Chrome redirected to the public home page; no refreshed provider-enabled count obtained.

Research found ZIP defaults and lack of automatic ZIP matching, plus possible Care Mountain category/identity ambiguity. Do not change overlapping application files or provider categories on that evidence alone. Confirm actual care ZIP in concierge callbacks.

## Internal notes reconciliation

Notion PR #1813 confirms TJ deliberately chose concierge-first recruitment against real requests; unsent pre-commit texts are not a pilot launch blocker. Read research report addendum for sources. The September 8 south-Dallas investigation changes the recommendation to Richardson, Plano, Garland, Frisco, omitting whole-city Dallas until specific coverage is verified. Charlotte remains Charlotte/Concord/Harrisburg/Huntersville/Cornelius/Davidson. TJ authorized continuing with this recommendation. These lists are not yet verified saved in Nextdoor. No provider enabling or outreach. Preserve 8am–noon local callbacks; latest internal Google CPC evidence is ~$4.5, not the old ~$2.25 forecast.

## Latest editor recovery

The saved ad-group edit URL without dashboard query parameters loaded successfully: `https://ads.nextdoor.com/v2/ad-group/edit/1023274175558584258`. City/Region selector worked, but search results and text edits became inconsistent; result clicks returned `elementHasNoFrame`, coordinate clicks returned `noWindowsAvailable`. Resetting controls and raising/reloading Chrome did not establish a saved geography change. Do not count typed search text or transient results as selected locations. Budget and noon-to-noon dates were re-read before reload; no Save or Publish submitted during these attempts.

## Targeting saved after browser recovery

Charlotte: selected Charlotte, Concord, Harrisburg, Huntersville, Cornelius, Davidson (all NC, US); verified 0 countries / 6 cities / 0 DMAs. Save updates completed and returned to Overview. Existing Ads tab was empty, confirming creative needs creation. Opened Create Ad for existing campaign/group. Native AX result clicks sometimes only closed the dropdown; screenshot coordinates selected the actual result. Exact queries like `Concord, NC` produce one result. Re-read selected chips/counts after each click. `setValue` worked for search after recovery; native paste briefly pasted unrelated restored clipboard text, so avoid paste here.

## Both platform builds — latest September 9 status

- Charlotte campaign `1023274174694557629`, group `1023274175558584258`: six NC cities saved. Created Newsfeed creative with inspected square hero crop and Olera logo. Ad-only Publish submitted and Ads dashboard confirmed Pending review. Parent campaign/group remained Draft, disabled, so this is NOT a completed campaign launch.
- Dallas campaign `1023340399281833119`, group `1023340400171025573`, ad `1023340401144104113`: duplicated draft, replaced all Charlotte cities with Richardson, Plano, Garland, Frisco TX; reloaded group verified 0 countries / 4 cities / 0 DMAs, $10 daily, noon Sep10–noon Sep24 Central, Autobid. Cloned creative via Actions > Clone creative before changing headline and URL, preserving Charlotte. Dallas name/copy/URL saved; Pending review ad, Draft parent.
- Review bug: opening Save and Review from ad edit showed $10 daily in summary but $1,000 daily in payment; did NOT publish. Reopened direct Dallas group edit without stale query parameters, re-entered `10`, then Save and Review: payment now $10/day. Review still displays $2.25 Bid and all three placement names despite group editor Autobid and sole Newsfeed creative; do not infer a bid/placement change from this summary alone. Ad table confirms Newsfeed.
- Full campaign Publish now includes explicit agreement to Advertising Terms and Self-Service Terms. Final action-time confirmation is required by native computer-use tool policy even though TJ already gave publish intent. Prepare both final reviews first, then ask once for both. No duplicate or repeated ad creation needed.
