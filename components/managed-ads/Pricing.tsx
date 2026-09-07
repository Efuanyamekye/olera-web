import Link from "next/link";
import StartCampaignLink from "@/components/managed-ads/StartCampaignLink";
import { BUDGET_STOPS, BUDGET_TRUST_STRIP, CUSTOM_SCALE_STOP } from "@/lib/ad-boost/estimate";

/**
 * The offer — one step, not a ladder to choose from.
 *
 * The earlier version showed four paid tiers each carrying an expected inquiry
 * band. Those bands are conservative INDUSTRY benchmarks, not our measured
 * rate, and printing "1–2 inquiries a month" beside a ledger showing seven
 * inquiries in total made the whole ladder read as theoretical. They are gone.
 * Prices are real and stay; the promise attached to them did not survive
 * contact with our own sample size.
 *
 * This also matches the product. lib/ad-boost/estimate.ts records that the
 * apply flow deliberately stopped asking providers to pick a tier — every real
 * request chose the cheapest stop, so the choice was pure friction. Every
 * request starts on the free campaign and the plan conversation happens once
 * there are results to look at. The page now says the same thing.
 *
 * Prices come from that file rather than being retyped, so a marketing page can
 * never quote a number the product does not charge.
 */
export default function Pricing() {
  const [intro, ...paid] = BUDGET_STOPS;
  const tiers = [...paid, CUSTOM_SCALE_STOP];

  return (
    <section id="pricing" className="bg-vanilla-100 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          What it costs
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          One price covering the advertising budget and the work of running it. No setup fee, no
          charge per lead, and no cut of anything you win.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-5">
          <div className="rounded-2xl border-2 border-primary-300 bg-white p-6 sm:p-8 lg:col-span-3">
            <div className="text-text-xs font-semibold uppercase tracking-wider text-primary-700">
              Everyone starts here
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-sans text-[3rem] font-semibold leading-none tracking-tight text-gray-900">
                {intro.amount}
              </span>
              <span className="text-text-lg text-gray-600">{intro.sublabel}</span>
            </div>
            <p className="mt-4 max-w-md text-text-md leading-relaxed text-gray-600">
              {intro.blurb} There is no plan to pick today and nothing switches to a paid one on
              its own.
            </p>
            <StartCampaignLink className="mt-6 w-full sm:w-auto">
              Start your first campaign
            </StartCampaignLink>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-gray-200 pt-6">
              {BUDGET_TRUST_STRIP.map((s) => (
                <div key={s.label}>
                  <div className="font-sans text-text-lg font-semibold text-gray-900">{s.value}</div>
                  <div className="mt-0.5 text-text-sm leading-snug text-gray-600">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 lg:col-span-2">
            <h3 className="font-serif text-text-lg font-bold text-gray-900">If you want to continue</h3>
            <p className="mt-2 text-text-sm leading-relaxed text-gray-600">
              When the first campaign wraps, your results land in your dashboard and you decide. A
              plan is flat and all-in: the advertising budget, the setup and the management
              together.
            </p>
            <div className="mt-5 divide-y divide-gray-200 border-t border-gray-200">
              {tiers.map((t) => (
                <div key={t.name} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-text-sm font-medium text-gray-900">{t.name}</span>
                  <span className="whitespace-nowrap text-text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{t.amount}</span>
                    {t.sublabel}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-text-sm leading-relaxed text-gray-500">
              We deliberately do not print an expected number of inquiries against these. Our own
              sample is too small to stand one up, and you can see exactly how small it is above.
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-text-sm leading-relaxed text-gray-600">
          A paid month that ends with no family inquiries at all is refunded in full. Families who
          contact you are yours, with no commission and no referral fee, and you can stop any time.
          Full terms on the{" "}
          <Link href="/managed-ads-terms" className="text-primary-700 underline hover:text-primary-800">
            Managed Ads terms page
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
