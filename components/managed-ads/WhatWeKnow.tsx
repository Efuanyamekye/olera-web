/**
 * The expertise section — the reason to pick us over an agency.
 *
 * Every item is a specific thing we got wrong or discovered, with the evidence
 * attached, sourced from the operating notes in .claude/commands/ad-boost-*.md.
 * That is deliberate on two counts. A named number is checkable and a claim of
 * expertise is not; and a company willing to publish the mistake that taught it
 * something reads as more competent than one publishing only wins, because the
 * reader already knows nobody gets this right first time.
 *
 * Do not add an item here that is not traceable to a measured campaign.
 *
 * THE TRACK RECORD BAND, AND WHY IT IS SCOPED SO HARD
 * The band above the findings answers a different question from the rest of the
 * page. Everything in ResultsTicker and HonestLimits answers "what has Olera
 * done for providers" — $535, 255 clicks, one confirmed client, deliberately
 * scoped to Google provider campaigns in stats.server.ts. The band answers "can
 * Olera run ads at all", and it is Olera's OWN acquisition history, two orders
 * of magnitude larger.
 *
 * Those two must never read as one claim. A visitor who sees $60,300 near the
 * words "cost per inquiry" concludes we spent sixty thousand dollars on their
 * behalf, which is false and is exactly the kind of blur this page exists to
 * avoid. Hence the scope line under the tiles: it is load-bearing copy, not a
 * disclaimer, and it does not come out.
 */

const FINDINGS = [
  {
    title: "Google silently blocks phrases you would never guess",
    body:
      "The phrase 24 hour home care is refused under Google's health policy. In the same ad group, 24 hour senior care and live in caregiver both pass. The trigger is the exact string, not the meaning, so the fix is to keep the intent and change the words. We learned that by having two campaigns rejected in two different cities.",
  },
  {
    title: "A campaign can be approved, eligible, and completely invisible",
    body:
      "One provider's flight drew 320 of its 338 impressions from five broad keywords. The rebuild kept only the neighborhood variations and served zero impressions in two days, while the interface reported the campaign as eligible and the ad as approved. Nothing anywhere flags this. We now count those terms before a campaign is allowed to publish.",
  },
  {
    title: "Near me is the obvious keyword and it quietly costs you",
    body:
      "It is not that nobody searches it. In one market it drew 47 impressions at a 2.13% click rate against a 7.69% campaign average. On a click-maximizing budget, a keyword that serves badly is worse than one that never enters the auction, because it spends your money and drags the quality score that sets your price.",
  },
  {
    title: "We were wrong about competitor searches, and our own data proved it",
    body:
      "We used to block searches for other agencies and for the wrong kind of care on sight. Then we grouped every campaign by how heavily it was filtered: every inquiry in our history came from a campaign running six or fewer blocked terms. The best flight we ever ran produced three families at about $12 each, almost entirely from searches for nursing homes and for a competitor by name. A family in crisis takes the answer in front of them. We reversed the rule and froze the list.",
  },
  {
    title: "An assisted living community needs the opposite list from a home care agency",
    body:
      "The filter that protects a home care agency blocks the words assisted living, senior living and retirement community. Applied to a care home, it removes exactly the searches that community exists to win. The same list is protection for one business and self-sabotage for the other, so we build them separately.",
  },
  {
    title: "A bid set five times too low looks exactly like no demand",
    body:
      "One campaign published with a $0.50 limit instead of $2.50 and ran eleven days on four impressions and no clicks. Every downstream number reads as a quiet market rather than a build error, and the review screen does not show it. It is now read back off the live campaign at publish, every single time.",
  },
];

/**
 * Read at source on 9 Sep 2026, in the ad platforms themselves, not in our
 * database. There is no ads-platform API ingestion here, so this is a
 * point-in-time read recorded as a dated constant — the same posture as
 * VERIFIED_PROGRAM_TOTALS in lib/managed-ads/stats.server.ts. Do not edit a
 * figure to make it look better; the only valid reason to change one is a fresh
 * read at source, with the date moved.
 *
 * PROVENANCE, FIGURE BY FIGURE
 * - leads: Meta campaign [Chantel]-(CARE-NAV)-Leads, 990 form leads on $542.25.
 *   These are Instant Form submissions. They are caregivers who gave us their
 *   details — NOT platform sign-ups, NOT providers, and NOT clients. The verb
 *   in the copy is "captured" and it carries that distinction. Do not upgrade it.
 * - spend: $40,703 Meta (account 739297033485646) + $19,643 Google (account
 *   419-933-1442, all time from Aug 2022). Nextdoor has live campaigns too and
 *   its spend is NOT in this figure, which is why the scope line names the two
 *   platforms the number covers rather than implying it covers all of them.
 * - campaigns: 223 Meta + 28 Google.
 * - impressions: 1,001,793 Google + ~1.5M Meta. The Meta half is a floor —
 *   Ads Manager retains only 37 months of insights, so anything before
 *   9 Aug 2023 reports blank even though it ran and was paid for.
 *
 * NOT USABLE, DO NOT ADD: the Google account also reports 81 conversions at
 * $242.51. Eight account-level conversion goals are configured and only one
 * records real conversions; the count is inflated by duplicates and Android
 * installs. Spend, impressions, clicks and CPC are sound. Conversions are not.
 */
const TRACK_RECORD = {
  measuredOn: "9 September 2026",
  tiles: [
    { value: "990", label: "caregiver leads captured, at $0.55 each" },
    { value: "$60,300", label: "of our own money spent learning how" },
    { value: "250+", label: "campaigns run since 2022" },
    { value: "2.5M", label: "impressions bought and measured" },
  ],
} as const;

export default function WhatWeKnow() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          We run senior care ads for a living
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          We buy where the families are cheapest to reach this month, not where we happen to have
          an account. Google, Meta and Nextdoor today, YouTube next.
        </p>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            {TRACK_RECORD.tiles.map((t) => (
              <div key={t.label}>
                <dt className="font-serif text-display-sm font-bold tabular-nums text-gray-900 md:text-display-md">
                  {t.value}
                </dt>
                <dd className="mt-1.5 text-text-sm leading-snug text-gray-600">{t.label}</dd>
              </div>
            ))}
          </dl>

          {/* Load-bearing. See the header comment: without this line the figures
              read as money spent on the visitor's behalf. */}
          <p className="mt-7 border-t border-gray-100 pt-5 text-text-sm leading-relaxed text-gray-500">
            That is <span className="font-semibold text-gray-700">Olera&rsquo;s own advertising</span>,
            not client spend, and not what your campaign costs. It is how we learned the trade: we
            spent it acquiring caregivers for our own research, on Google and Meta, and read the
            figures out of both platforms on {TRACK_RECORD.measuredOn}.
          </p>
        </div>

        <p className="mt-12 max-w-2xl text-text-md text-gray-600">
          Six things that cost us money to find out. None are visible from inside one account: they
          are what running many campaigns, in many markets, on the same product buys you.
        </p>

        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-2">
          {FINDINGS.map((f) => (
            <div key={f.title} className="bg-white p-6 sm:p-8">
              <h3 className="font-serif text-text-xl font-bold leading-snug text-gray-900">
                {f.title}
              </h3>
              <p className="mt-3 text-text-sm leading-relaxed text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-text-sm leading-relaxed text-gray-500">
          Every one of these came out of a campaign that underperformed while looking healthy.
          Your campaign starts on the far side of them.
        </p>
      </div>
    </section>
  );
}
