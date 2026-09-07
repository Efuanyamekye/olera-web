import Link from "next/link";
import StartCampaignLink from "@/components/managed-ads/StartCampaignLink";

/**
 * The close.
 *
 * The page used to end on the honest-limits block, which is the right section
 * to have and the wrong one to leave a skimmer on. Limits now sit next to the
 * numbers they qualify, and the page ends where a page asking for a decision
 * should: on the offer.
 */
export default function ClosingCTA() {
  return (
    <section className="bg-gray-900 px-4 py-16 sm:px-6 md:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-serif text-display-sm font-bold text-white md:text-display-md">
          Your first campaign costs nothing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-text-lg leading-relaxed text-gray-300">
          About $50 of advertising, aimed at families searching near you, pointed at your page. No
          card, no contract, and you keep everyone who contacts you.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <StartCampaignLink tone="onDark">Start your first campaign</StartCampaignLink>
          <Link
            href="/contact"
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-gray-600 px-7 py-3 text-text-md font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Ask us something first
          </Link>
        </div>
        <p className="mt-6 text-text-sm text-gray-400">
          Questions about billing, cancellation or the zero-inquiry refund are answered on the{" "}
          <Link href="/managed-ads-terms" className="text-white underline hover:text-gray-200">
            Managed Ads terms page
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
