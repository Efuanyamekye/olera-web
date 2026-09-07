import type { Metadata } from "next";
import ManagedAdsHero from "@/components/managed-ads/ManagedAdsHero";
import TwoEngines from "@/components/managed-ads/TwoEngines";
import WhatItLooksLike from "@/components/managed-ads/WhatItLooksLike";
import ResultsTicker from "@/components/managed-ads/ResultsTicker";
import HonestLimits from "@/components/managed-ads/HonestLimits";
import WhatWeKnow from "@/components/managed-ads/WhatWeKnow";
import TheLoop from "@/components/managed-ads/TheLoop";
import TheHandoff from "@/components/managed-ads/TheHandoff";
import Pricing from "@/components/managed-ads/Pricing";
import ClosingCTA from "@/components/managed-ads/ClosingCTA";
import { getManagedAdsStats } from "@/lib/managed-ads/stats.server";

/**
 * /managed-ads — the public explainer for Olera Managed Ads.
 *
 * WHY THIS EXISTS
 * The product surface at /provider/boost is behind the sign-in wall, so the
 * only thing a provider could be sent before claiming their page was a pitch of
 * three sentences. What we actually run is two ad products, a qualification
 * form, a consent record, a provider relay, a follow-up loop and a standing
 * optimization routine, none of it written anywhere a provider could read it.
 *
 * ORDER, AND WHY IT IS THIS ORDER
 * offer → what you are buying → see it → the numbers → what they do not prove →
 * why our campaigns are different → how we run them → price → close. The first
 * draft opened with the ledger and closed on the caveats, which is the order an
 * operator writes in and the reverse of the order a buyer reads in.
 *
 * THE RULE FOR EDITING IT
 * Every claim is traceable to code or to a measured campaign, and no number is
 * typed into a section. Hero, strip and limits all read the same stats object,
 * because an earlier version hardcoded $535 in prose two screens under a strip
 * reading $298 and the page contradicted itself. The other guardrails live in
 * the section files: the provider relay is built but dormant, no Meta campaign
 * has ever run, and recorded spend is a floor.
 */

export const revalidate = 900;

const TITLE = "Managed Ads for Senior Care Providers | Olera";
const DESCRIPTION =
  "Olera writes and runs the ads that bring local families to senior care providers on Google and Nextdoor. Your first campaign is free. See exactly what our campaigns have cost and delivered.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/managed-ads" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/managed-ads",
    siteName: "Olera",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const dollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export default async function ManagedAdsPage() {
  const stats = await getManagedAdsStats();

  // Render the strip only when a real signal came back. An unreadable database
  // would otherwise print a confident row of zeroes next to a page arguing that
  // our numbers are checkable, which is the worst available outcome.
  const hasSignal =
    !!stats &&
    (stats.spendCents > 0 ||
      stats.clicks > 0 ||
      (stats.familiesDelivered ?? 0) > 0 ||
      stats.cityRequests > 0);

  const asOf = stats?.economicsAsOf
    ? new Date(stats.economicsAsOf).toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main>
      <ManagedAdsHero costPerInquiry={dollars(stats?.costPerInquiryCents)} asOf={asOf} />
      <TwoEngines />
      <WhatItLooksLike />
      {hasSignal && stats ? (
        <>
          <ResultsTicker stats={stats} />
          <HonestLimits spend={dollars(stats.spendCents)} inquiries={stats.familiesDelivered} />
        </>
      ) : null}
      <WhatWeKnow />
      <TheLoop />
      <TheHandoff />
      <Pricing />
      <ClosingCTA />
    </main>
  );
}
