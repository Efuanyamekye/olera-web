"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";
import { managedAdsPitchCopy } from "@/lib/analytics/managed-ads-variant-copy";
import { useManagedAdsVariant, isManagedAdsPreviewMode } from "@/hooks/use-managed-ads-variant";

/**
 * Contextual Managed Ads nudge — shown once per session right after a provider
 * saves a profile edit. Editing is the one in-app behavior the engaged minority
 * actually does, so the moment of "I just polished my page" is the earned,
 * high-intent time to pitch getting it seen — the Telegram/Grok pattern of
 * surfacing the offer on a trigger, not as an always-on sidebar fixture.
 * Dismissible, light (no marquee) — a confirmation that pivots, not an upsell.
 */
export default function PostEditAdsNudge({
  providerSlug,
  providerName,
  onDismiss,
}: {
  providerSlug: string;
  providerName?: string;
  onDismiss: () => void;
}) {
  const assignedVariant = useManagedAdsVariant(providerSlug);
  const copy = managedAdsPitchCopy(assignedVariant ?? "direct_reach");
  const firedView = useRef(false);

  useEffect(() => {
    if (!providerSlug || !assignedVariant || firedView.current || isManagedAdsPreviewMode()) return;
    firedView.current = true;
    trackProviderEvent(providerSlug, "managed_ads_pitch_viewed", {
      provider_name: providerName,
      source: "post_edit",
      managed_ads_variant: assignedVariant,
    });
    // Separate touchpoint tracking for behavior analysis
    trackProviderEvent(providerSlug, "ads_touchpoint_viewed", {
      touchpoint: "post_edit",
      provider_name: providerName,
    });
  }, [assignedVariant, providerName, providerSlug]);

  return (
    <div
      className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary-100/70 bg-primary-50/50 px-4 py-3"
      style={{ animation: "card-enter 0.25s ease-out both" }}
    >
      <p className="text-sm text-gray-700 leading-snug">
        <span className="font-semibold text-gray-900">Looking sharp.</span>{" "}
        {assignedVariant === "local_plan"
          ? "See the local ad plan we'd run before any spend starts."
          : `${copy.headline} ${copy.accent.toLowerCase()} with a simple launch plan.`}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/provider/boost"
          onClick={() => {
            if (providerSlug) {
              trackProviderEvent(providerSlug, "managed_ads_cta_clicked", {
                provider_name: providerName,
                source: "post_edit",
                managed_ads_variant: assignedVariant ?? "direct_reach",
              });
              // Separate touchpoint tracking for behavior analysis
              trackProviderEvent(providerSlug, "ads_touchpoint_clicked", {
                touchpoint: "post_edit",
                provider_name: providerName,
              });
            }
          }}
          className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white transition-transform hover:gap-1.5 active:scale-[0.98]"
        >
          See plan
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => {
            if (providerSlug) {
              trackProviderEvent(providerSlug, "ads_touchpoint_dismissed", {
                touchpoint: "post_edit",
                provider_name: providerName,
              });
            }
            onDismiss();
          }}
          aria-label="Dismiss"
          className="ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-white/60 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
