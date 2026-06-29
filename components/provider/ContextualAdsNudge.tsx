"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";
import { useManagedAdsVariant, isManagedAdsPreviewMode } from "@/hooks/use-managed-ads-variant";

type NudgeContext = "question" | "lead";

const CONTEXT_COPY: Record<NudgeContext, { headline: string; body: string }> = {
  question: {
    headline: "Great response.",
    body: "Want more families reaching out? See the ads we'd run for you.",
  },
  lead: {
    headline: "Families are reaching out.",
    body: "Ads can bring even more to your page.",
  },
};

/**
 * Contextual Managed Ads nudge — shown once per session on high-intent surfaces:
 * - After answering a question (question context)
 * - On the leads page when provider has leads (lead context)
 *
 * Same design language as PostEditAdsNudge: dismissible, light, a pivot not an upsell.
 *
 * Suppressed when provider already has an active boost request (pending_profile,
 * requested, scheduled, or live) — no point pitching ads to someone who has them.
 */
export default function ContextualAdsNudge({
  context,
  providerSlug,
  providerName,
  hasActiveBoostRequest,
  onDismiss,
}: {
  context: NudgeContext;
  providerSlug: string;
  providerName?: string;
  /** If true, the nudge won't render (provider already has ads). */
  hasActiveBoostRequest?: boolean;
  onDismiss: () => void;
}) {
  const assignedVariant = useManagedAdsVariant(providerSlug);
  const firedView = useRef(false);
  const copy = CONTEXT_COPY[context];

  useEffect(() => {
    if (!providerSlug || !assignedVariant || firedView.current || isManagedAdsPreviewMode()) return;
    if (hasActiveBoostRequest) return; // Don't track view if suppressed
    firedView.current = true;
    trackProviderEvent(providerSlug, "managed_ads_pitch_viewed", {
      provider_name: providerName,
      source: context === "question" ? "post_question" : "leads_page",
      managed_ads_variant: assignedVariant,
    });
  }, [assignedVariant, providerName, providerSlug, context, hasActiveBoostRequest]);

  // Don't render if provider already has an active boost request
  if (hasActiveBoostRequest) {
    return null;
  }

  return (
    <div
      className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-primary-100/70 bg-primary-50/50 px-4 py-3"
      style={{ animation: "card-enter 0.25s ease-out both" }}
    >
      <p className="text-sm text-gray-700 leading-snug">
        <span className="font-semibold text-gray-900">{copy.headline}</span>{" "}
        {copy.body}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/provider/boost"
          onClick={() => {
            if (providerSlug) {
              trackProviderEvent(providerSlug, "managed_ads_cta_clicked", {
                provider_name: providerName,
                source: context === "question" ? "post_question" : "leads_page",
                managed_ads_variant: assignedVariant ?? "direct_reach",
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
          onClick={onDismiss}
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
