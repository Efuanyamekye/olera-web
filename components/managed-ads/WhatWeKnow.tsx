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

export default function WhatWeKnow() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          We run senior care ads for a living
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          Six things that cost us money to find out. None are visible from inside one account: they
          are what running many campaigns, in many markets, on the same product buys you.
        </p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-2">
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
