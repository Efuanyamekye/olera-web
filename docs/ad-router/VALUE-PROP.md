# Olera as an ad router

**Status:** live on `/managed-ads` as of 2026-09-09 (the track-record band in
`components/managed-ads/WhatWeKnow.tsx`). This doc is the source those figures
are drawn from. Change a number here and on the page together, or not at all.

---

## 1. The thesis

Jupiter, on Solana, is a DEX aggregator. You do not go to Jupiter to use one
exchange; you go because it finds you the best route across all of them.

**Olera is an ad router for senior care.** A provider does not buy "Facebook
ads" from us. They buy the routing — we find the cheapest effective way to
reach families in their market, across any platform, including ones they have
never opened an account on.

Say it that way round. The earlier framing was *"look how much overhead we
absorb"*, which is a seller's invoice: true, and nobody buys it. Routing is an
outcome. A single agency can fund one channel and has to guess which one; we
run several, across many providers, and move budget to whatever is cheapest in
that market this month.

**One-line version for sales:** *We buy where the families are cheapest to
reach this month, not where we happen to have an account.*

---

## 2. The evidence ledger

Read at source on **9 September 2026** in the ad platforms themselves. There is
no API ingestion — these are point-in-time reads.

| Figure | Source | Proves | Does **not** prove |
|---|---|---|---|
| **990 leads @ $0.55** | Meta, `[Chantel]-(CARE-NAV)-Leads`, $542.25 | The acquisition mechanism works. Our strongest number. | Instant **Form** leads. Not sign-ups, not providers, not clients. The verb is **captured**. |
| **$40,703 · 223 campaigns** | Meta ad account `739297033485646` | Sustained spend over four years | Nothing about outcomes. Account is on TJ's *personal* profile. |
| **$19,643.03 · 28 campaigns** | Google Ads `419-933-1442`, all time (Aug 2022→) | Sustained Google spend | Completeness — see open item below |
| **1,001,793 impr · 29,044 interactions · $1.15 CPC** | Same Google all-time row | Real reach at a click price we control | That any of it converted |

The **2.5M impressions** on the page is Google's 1,001,793 plus ~1.48M summed
from the handful of Meta campaigns visible on the first page of 225. It is a
floor twice over — most Meta campaigns were not summed, and anything before
9 Aug 2023 reports blank.

| **~21,000 clicks @ $0.33–0.36** | Meta, two 2023 traffic campaigns (TX, Houston) | Cheap traffic at volume | Anything downstream of the click |
| ~~81 conversions @ $242.51~~ | Google all-time row | **Nothing. Do not use.** | 8 account-level goals, 1 real; inflated by duplicates and Android installs |

**Both totals are floors.** Meta's Ads Manager retains only 37 months of
insights — "Maximum" reaches back to 9 Aug 2023 and no further. Campaigns
before that ran, were paid for, and report blank.

**Nextdoor is not in the $60,300.** Five Nextdoor campaigns went live 1–7 Sep
2026 and the pilot before them spent real money, but we have not read a
lifetime figure out of the dashboard. The page names the platform without
folding a number in.

---

## 3. The moat: what one channel actually costs to stand up

This is the part that is invisible from outside and is the real product. All of
it is from building **one** $150 Meta campaign on 2026-09-09.

- Two datasets both displayed as "Olera Pixel"; the ad set pre-selected the
  **dead** one, with no ID visible until you open the dropdown. Published as
  configured, the flight would have reported zero conversions and we would have
  concluded Meta does not work for senior care.
- Ad account owned by a personal profile while the business portfolio sat
  empty — so the pixel and the ad account had different owners. Portfolio
  membership alone does not grant dataset access; the explicit assignment is
  still required.
- **Eight defaults** that each degrade or waste the flight: Instant forms as
  conversion location, +40 km radius appended to every city, "reach more people
  likely to respond" geo expansion, daily-budget-no-end-date, a Call button
  pre-filled with a stray Maryland number, Add music, Visual touch-ups,
  generative crop-and-expand.
- An account security lockout (#3858385) that only the account owner can clear.
- A CTA menu that differs between grandfathered and new ads.
- A UI that **silently discards typed values while reporting "All edits saved"** —
  caught a reverted landing URL (no UTMs) and a budget reverted to 2.3× the
  approved amount, minutes before publishing. See
  `reference_meta_ads_manager_scripted_writes_revert`.

Then Nextdoor is a different set of considerations, and Google is the most
complex of the three. A small agency without a marketing division does not
survive that list, and would never learn which part of their money was wasted.

---

## 4. What we do not say

- **No client count, no client rate, no cost per client.** The program has
  **one** confirmed provider client and the platform records almost no provider
  outcomes at all.
- **Never phrase the 990 as clients delivered to providers.** A provider
  reading `/managed-ads` will hear it that way. It is caregiver acquisition for
  our own research, and that is still exactly the capability being sold.
- **Never merge the two scopes.** `ResultsTicker` / `HonestLimits` answer *what
  Olera has done for providers* ($535, 255 clicks, 1 client). The track-record
  band answers *can Olera run ads at all* ($60,300). Two orders of magnitude
  apart, and blurring them makes the page lie by juxtaposition.
- **Do not quote the Google conversion figures.** See the ledger.

---

## 5. Open

- [ ] **Does `tfalohun@gmail.com` hold Google Ads accounts?** Meta's spend is on
  the personal profile, so Google may be too. Only `tj@olera.care` was
  enumerated (two accounts, one of them cancelled with $0). If personal
  campaigns exist, $60,300 is low. **Owner: TJ — needs his sign-in.**
- [ ] **Nextdoor lifetime spend** — read it out of the dashboard and decide
  whether it folds into the headline figure.
- [ ] **`page.tsx` metadata description** still says we run ads "on Google and
  Nextdoor". Correct today — no provider Meta campaign has run — but it needs
  changing the day one does.
- [ ] **Hero and `TwoEngines` rewrite** around the router framing. Deferred
  until after the 20 Sep city-ads read, which may change what we can claim.
