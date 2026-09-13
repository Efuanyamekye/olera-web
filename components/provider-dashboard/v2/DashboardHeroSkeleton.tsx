"use client";

import { readUpdatesCollapsed } from "./heroDismiss";

/**
 * Loading state for DashboardHero. Reserves the card and browsing-control space
 * while the provider-specific update queue is loading. The
 * "Hey {firstName}" greeting renders immediately — we have it from the auth
 * context synchronously, so the loading moment is partial-content rather
 * than pure shimmer. Only the headline / subline / CTA pill shimmer.
 *
 * Dark warm-950 background matches the real hero exactly. On desktop the
 * right-side image area is left as solid warm (no skeleton image) — the
 * gradient mask in the real hero softens that edge anyway, and a fake
 * image-shaped placeholder would add visual noise without adding
 * information about what's loading.
 */
interface Props {
  firstName: string;
  providerSlug: string;
}

export default function DashboardHeroSkeleton({ firstName, providerSlug }: Props) {
  // Avoid flashing the full card after all updates were dismissed. A newly
  // arrived inquiry can still expand the hero once the response is available.
  if (readUpdatesCollapsed(providerSlug)) {
    return <div aria-hidden className="mb-6 min-h-11 flex items-center text-sm text-gray-500">Checking updates…</div>;
  }
  return (
    <div aria-hidden className="mb-6">
      <div
        className="relative overflow-hidden rounded-2xl bg-warm-950 md:min-h-[260px]"
      >
        <div className="relative px-6 py-5 md:px-9 md:py-7 max-w-[560px]">
          <p className="font-serif italic text-[15px] md:text-[16px] text-warm-200/85 leading-snug mb-2">
            Hey {firstName}
          </p>
          {/* Headline shimmer — matches the font-display 20-24px line height */}
          <div className="animate-pulse">
            <div className="h-7 md:h-8 w-72 max-w-full bg-warm-800 rounded mb-3" />
            {/* Subline shimmer */}
            <div className="h-4 w-56 max-w-full bg-warm-800/70 rounded mb-1" />
            <div className="h-4 w-40 max-w-full bg-warm-800/70 rounded" />
            {/* CTA pill shimmer */}
            <div className="mt-4 h-9 w-32 bg-vanilla-100/15 rounded-full" />
          </div>
        </div>
      </div>
      <div className="h-12" />
    </div>
  );
}
