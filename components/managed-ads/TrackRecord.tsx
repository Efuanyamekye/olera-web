/**
 * The credential, sitting directly under the hero.
 *
 * WHY IT IS THE SECOND THING ON THE PAGE
 * The hero makes a promise and offers to spend $50 proving it. The very next
 * thought a senior care operator has is "who are you, and why is this not
 * another marketing firm" — and until 9 Sep 2026 the page answered that with
 * three sections of product mechanics and about 4,500px of scroll before any
 * evidence appeared. The numbers were there, buried inside WhatWeKnow, where a
 * skeptical reader had already left (TJ, 9 Sep 2026).
 *
 * This does not reverse the page's documented ordering rule. That rule says do
 * not open with the *ledger* — the $535 and the seven inquiries, small figures
 * that need their caveats attached and read as an operator's notes rather than
 * a buyer's answer. This is not the ledger. It is a credential: how long we
 * have been doing this, with whose money, and what it bought. Those belong
 * before the product explanation, not after it.
 *
 * THE SCOPE LINE IS LOAD-BEARING AND TRAVELS WITH THE TILES
 * The figures are Olera's own acquisition history, two orders of magnitude
 * larger than anything spent on a provider's behalf. A visitor who reads
 * $60,300 as their money, or as a result we produced for a client, has been
 * misled by this page. That is why the line sits inside the same card and not
 * in a footnote, and why this section may not be moved or excerpted without it.
 *
 * Read at source in Meta and Google on 9 Sep 2026 and recorded as a dated
 * constant. There is no ads-platform API ingestion, so this is a point-in-time
 * read, the same posture as VERIFIED_PROGRAM_TOTALS in stats.server.ts. Do not
 * edit a figure to make it look better; the only valid reason to change one is
 * a fresh read at source, with the date moved.
 *
 * PROVENANCE, FIGURE BY FIGURE
 * - leads: Meta campaign [Chantel]-(CARE-NAV)-Leads, 990 form leads on $542.25.
 *   These are Instant Form submissions — caregivers who gave us their details.
 *   NOT platform sign-ups, NOT providers, NOT clients. The verb in the copy is
 *   "captured" and it carries that distinction. Do not upgrade it.
 * - spend: $40,703 Meta (account 739297033485646) + $19,643 Google (account
 *   419-933-1442, all time from Aug 2022). Nextdoor has live campaigns too and
 *   its spend is NOT in this figure, which is why the scope line names the two
 *   platforms the number covers rather than implying it covers all of them.
 * - campaigns: 223 Meta + 28 Google.
 * - impressions: 1,001,793 Google + ~1.48M summed from the Meta campaigns
 *   visible on the first page of 225. A floor twice over: most Meta campaigns
 *   were not summed, and Ads Manager retains only 37 months of insights, so
 *   anything before 9 Aug 2023 reports blank even though it ran and was paid for.
 *
 * NOT USABLE, DO NOT ADD: the Google account also reports 81 conversions at
 * $242.51. Eight account-level conversion goals are configured and only one
 * records real conversions; the count is inflated by duplicates and Android
 * installs. Spend, impressions, clicks and CPC are sound. Conversions are not.
 *
 * Full ledger and the claims we have agreed not to make: docs/ad-router/VALUE-PROP.md
 */

const MEASURED_ON = "9 September 2026";

const TILES = [
  { value: "990", label: "caregiver leads captured, at $0.55 each" },
  { value: "$60,300", label: "of our own money spent learning how" },
  { value: "250+", label: "campaigns run since 2022" },
  { value: "2.5M", label: "impressions bought and measured" },
] as const;

export default function TrackRecord() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 md:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          We have been buying these ads since 2022
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          We buy where the families are cheapest to reach this month, not where we happen to have
          an account. Google, Meta and Nextdoor today, YouTube next.
        </p>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
            {TILES.map((t) => (
              <div key={t.label}>
                {/* Steps up from display-xs on the narrowest phones. At
                    display-sm a 2-column tile leaves ~128px for "$60,300" in
                    tabular figures, which is under 8px of slack before the
                    number wraps mid-value. */}
                <dt className="font-serif text-display-xs font-bold tabular-nums text-gray-900 sm:text-display-sm md:text-display-md">
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
            figures out of both platforms on {MEASURED_ON}.
          </p>
        </div>
      </div>
    </section>
  );
}
