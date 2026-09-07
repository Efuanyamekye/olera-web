import StartCampaignLink from "@/components/managed-ads/StartCampaignLink";

/**
 * Hero for the public Managed Ads explainer.
 *
 * Outcome first, then the offer, then one proof number. The earlier draft led
 * with "we run senior care ads for a living", which is a good line for someone
 * who already trusts us and a poor one for a tired agency owner deciding
 * whether to read on. That line now titles the section where it belongs, next
 * to the lessons that earn it.
 *
 * The proof number is computed, never typed. It has to agree with the results
 * strip further down, and the only way to guarantee that is to read the same
 * field. An earlier version quoted the figure in prose while the strip read the
 * database, and the two disagreed on the same screen.
 */
export default function ManagedAdsHero({
  costPerInquiry,
  asOf,
}: {
  costPerInquiry: string | null;
  asOf: string | null;
}) {
  return (
    <section className="bg-vanilla-100">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
        <span className="inline-flex items-center rounded-full border border-primary-200 bg-white px-3.5 py-1.5 text-text-sm font-semibold text-primary-700">
          Olera Managed Ads
        </span>

        <h1 className="mt-6 max-w-3xl font-serif text-display-md font-bold leading-tight text-gray-900 sm:text-display-lg lg:text-display-xl">
          Reach the families searching for care in your city this week.
        </h1>

        <p className="mt-5 max-w-2xl text-text-lg leading-relaxed text-gray-600">
          We write the ads, buy the traffic and send every family to your Olera page. You keep
          whoever contacts you, with no commission and no per-lead fee. Your first campaign is on
          us: about $50 of advertising, no card, no contract.
        </p>

        <div className="mt-8">
          <StartCampaignLink>Start your first campaign</StartCampaignLink>
        </div>

        {costPerInquiry && (
          <div className="mt-10 max-w-2xl rounded-xl border border-primary-200 bg-white p-5 sm:p-6">
            <p className="text-text-md leading-relaxed text-gray-700">
              Across every provider campaign we have run, a family inquiry has cost{" "}
              <span className="font-semibold text-gray-900">{costPerInquiry}</span>. The published
              benchmark for home care lead generation is $80 to $150, and those leads are usually
              sold to several agencies at once. Ours are yours alone.
            </p>
            <p className="mt-2 text-text-sm text-gray-500">
              Measured on our own spend{asOf ? `, as of ${asOf}` : ""}. It is a small sample and we
              say exactly how small further down.
            </p>
          </div>
        )}

        {/* Deliberately NOT the shared PlatformMarquee. That strip scrolls
            Facebook, Instagram, YouTube and X, we have never run a campaign on
            any of them, and this page says so out loud a few screens later. */}
        <p className="mt-8 max-w-2xl text-text-sm text-gray-600">
          <span className="font-semibold text-gray-900">Google Search</span> for families actively
          looking, <span className="font-semibold text-gray-900">Nextdoor</span> for the
          neighborhood feed. Facebook and Instagram are next, and we will publish what they do when
          we have run them.
        </p>
      </div>
    </section>
  );
}
