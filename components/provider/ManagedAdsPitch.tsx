"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import PlatformMarquee from "@/components/provider/PlatformMarquee";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";
import { managedAdsPitchCopy } from "@/lib/analytics/managed-ads-variant-copy";
import { useManagedAdsVariant, isManagedAdsPreviewMode } from "@/hooks/use-managed-ads-variant";
import { useMobileNavVariant } from "@/hooks/use-mobile-nav-variant";

/**
 * The Managed Ads pitch — shared between the boost page (above the gate/picker)
 * and the no-leads state of Find Families (the ~99.9% default), so there's one
 * source of truth for the value prop. Headline + platform marquee + the three
 * "you do nothing" pillars, with an optional CTA (Find Families passes one that
 * links to /provider/boost; the boost page omits it because the picker follows).
 */

/** The three reasons this is different from every DIY/agency alternative. */
function ValuePillars() {
  const pillars = [
    {
      title: "Targeted where families look",
      body: "Search, social, and local neighborhood feeds — wherever families are searching for care.",
    },
    {
      title: "Powered by your market",
      body: "We aim the spend at the high-private-pay ZIPs and local demand we already map for you.",
    },
    {
      title: "You do nothing",
      body: "No ad account, no keywords, no agency. We already have your page — we run all of it.",
    },
  ];
  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-3">
      {pillars.map((p) => (
        <div key={p.title}>
          <h3 className="text-[15px] font-semibold text-gray-900">{p.title}</h3>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">{p.body}</p>
        </div>
      ))}
    </div>
  );
}

export default function ManagedAdsPitch({
  ctaHref,
  ctaLabel = "Start my free campaign",
  providerSlug,
  providerName,
}: {
  ctaHref?: string;
  ctaLabel?: string;
  /** When set (Find Families no-leads), the CTA click is tracked as a managed-ads CTA. */
  providerSlug?: string;
  providerName?: string;
}) {
  const assignedVariant = useManagedAdsVariant(providerSlug);
  const copy = managedAdsPitchCopy(assignedVariant ?? "direct_reach");
  const mobileNavVariant = useMobileNavVariant();
  const firedView = useRef(false);

  useEffect(() => {
    if (!providerSlug || !assignedVariant || firedView.current || isManagedAdsPreviewMode()) return;
    firedView.current = true;
    trackProviderEvent(providerSlug, "managed_ads_pitch_viewed", {
      provider_name: providerName,
      source: "ff_pitch",
      managed_ads_variant: assignedVariant,
    });
  }, [assignedVariant, providerName, providerSlug]);

  const trackCta = () => {
    if (providerSlug) {
      trackProviderEvent(providerSlug, "managed_ads_cta_clicked", {
        provider_name: providerName,
        source: "ff_pitch",
        managed_ads_variant: assignedVariant ?? "direct_reach",
      });
    }
  };

  return (
    <div>
      <header className="max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-50/60 border border-primary-100/60 mb-6">
          <span className="text-sm font-semibold text-primary-700">Managed Ads</span>
        </div>
        <h1 className="text-[clamp(2rem,4.5vw,2.75rem)] font-display font-bold text-gray-900 leading-[1.1] tracking-tight">
          {copy.headline}<br />
          <span className="text-primary-600 italic">{copy.accent}</span>.
        </h1>
        <p className="text-lg text-gray-500 mt-5 leading-relaxed">
          {copy.body}
        </p>
      </header>

      <PlatformMarquee />
      <ValuePillars />

      {/* Desktop CTA - hidden on mobile */}
      {ctaHref && (
        <div className="mt-10 hidden sm:block">
          <p className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <span className="text-primary-600">✦</span>
            <span>
              First campaign on us — <span className="text-primary-600 font-medium">$50, free</span>
            </span>
          </p>
          <Link
            href={ctaHref}
            onClick={trackCta}
            className="inline-flex items-center gap-2.5 px-9 py-3.5 bg-gray-900 hover:bg-gray-800 text-white text-[16px] font-semibold rounded-full active:scale-[0.98] transition-all duration-200"
          >
            {ctaLabel}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      )}

      {/* Mobile sticky CTA - fixed at bottom of viewport, raised above bottom tabs when active */}
      {ctaHref && (
        <div
          className={`fixed left-0 right-0 z-50 sm:hidden bg-white border-t border-gray-200 px-4 py-4 ${
            mobileNavVariant === "bottom_tabs"
              ? ""
              : "bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          }`}
          style={mobileNavVariant === "bottom_tabs" ? { bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" } : undefined}
        >
          <p className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            <span className="text-primary-600">✦</span>
            <span>
              First campaign on us — <span className="text-primary-600 font-medium">$50, free</span>
            </span>
          </p>
          <Link
            href={ctaHref}
            onClick={trackCta}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gray-900 hover:bg-gray-800 text-white text-[16px] font-semibold rounded-full active:scale-[0.98] transition-all duration-200"
          >
            {ctaLabel}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      )}

      {/* Spacer for mobile sticky CTA - taller when bottom tabs are present */}
      {ctaHref && <div className={`sm:hidden ${mobileNavVariant === "bottom_tabs" ? "h-48" : "h-36"}`} />}
    </div>
  );
}
