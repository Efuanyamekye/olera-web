import Link from "next/link";
import PlatformMarquee from "@/components/provider/PlatformMarquee";
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
  hasResults,
}: {
  costPerInquiry: string | null;
  hasResults: boolean;
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

        {/* Two buttons, not one. A single button leaves the row lopsided under
            a full-width headline, and the pair is what made the first draft's
            hero sit properly. The second is gated on the strip existing, since
            it anchors to it. */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <StartCampaignLink>Start your first campaign</StartCampaignLink>
          {hasResults && (
            <Link
              href="#results"
              className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-gray-300 bg-white px-7 py-3 text-text-md font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              See our real numbers
            </Link>
          )}
        </div>

        {/* One line. The proof belongs in the hero, the argument for it does
            not — the full comparison and its date are in the results strip. */}
        {costPerInquiry && (
          <p className="mt-4 text-text-sm text-gray-500">
            A family inquiry has cost us{" "}
            <span className="font-semibold text-gray-900">{costPerInquiry}</span>. The published
            home care benchmark is $80 to $150.
          </p>
        )}

        {/* Only the platforms we have actually bought media on. The shared strip
            defaults to six; the four omitted here have never served an
            impression for us, and the limits section says so outright.

            TO ADD ONE: append { name, slug } below — slug matches a file in
            public/images/platform-logos. Add it the day that campaign serves
            its first impression, NOT the day it is built. We have built and
            paused a whole batch before: five Nextdoor campaigns went up on
            26 Aug 2026 and were paused two days later having spent nothing.
            Built is not running, and this strip is a claim about running. */
        }
        <div className="mt-12">
          <PlatformMarquee
            platforms={[
              { name: "Google", slug: "google" },
              { name: "Nextdoor", slug: "nextdoor" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
