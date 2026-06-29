"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProviderDashboardV2Data } from "@/hooks/useProviderDashboardV2Data";
import type { ProfileCompleteness } from "@/lib/profile-completeness";
import type { ProfileCategory } from "@/lib/types";
import {
  pickNextAction,
  previewCopy,
  NUDGE_SECTION_IDS,
  type NudgeSectionId,
  type NextAction,
} from "@/lib/next-best-action";
import { trackProviderEvent } from "@/lib/analytics/track-provider-event";
import { prefetchBoostState } from "@/lib/ad-boost/boost-state";
import {
  HERO_DISMISS_KEY,
  isDismissibleBanner,
  todayStamp,
  readDismissedToday,
} from "./heroDismiss";
import type { ManagedAdsVariant } from "@/lib/analytics/managed-ads-variant";
import { managedAdsPitchCopy } from "@/lib/analytics/managed-ads-variant-copy";
import { useManagedAdsVariant, isManagedAdsPreviewMode } from "@/hooks/use-managed-ads-variant";

/**
 * Pillar A — Greeting + one primary action (Wispr-style dark moment).
 *
 * The dashboard has one dark card-sized moment per screen. This is it.
 * Modeled on Wispr Flow's "Hold down [fn] to dictate" panel — a warm photo
 * sits on the right side of the card; a left-to-right dark gradient keeps
 * the headline readable while letting the image show through on the right.
 * Greeting is serif italic for a personal-letter touch. Single light pill
 * CTA on the dark surface.
 *
 * Prioritized signal stack (after the 2026-04-29 refactor that folded the
 * standalone smart-picker banner into this hero — one banner per surface;
 * 2026-06-04 added the Find Families tiers):
 *
 *   1. Fresh leads this period   (highest intent — someone reaching out)
 *   2. Unanswered questions      (action needed)
 *   3. Family near you           (a real published care-seeker in catchment —
 *                                 the rare concrete lead; jumps the line over
 *                                 profile housekeeping because there's a live
 *                                 family to reach out to → Find Families)
 *   4. View spike vs. prior      (positive momentum, no CTA)
 *   5. Views ≥ 10                (engagement headline; if profile is
 *                                 incomplete, CTA opens the highest-impact
 *                                 section's edit modal — otherwise Find
 *                                 Families market intel)
 *   6. Views < 10 + incomplete   (cold: completion pick, but every ~3rd visit
 *                                 rotates in Find Families market intel so the
 *                                 capability surfaces without letting profile
 *                                 completion collapse)
 *   7. Views < 10 + complete     (Find Families market intel — nothing left to
 *                                 complete, so pull them toward families)
 *
 * Rule: pick ONE headline signal. Never stack multiple "you have X, Y, and Z."
 * Engagement + Find Families tiers navigate via Link; completion-section CTAs
 * open an edit modal in place. Every banner carries a stable `bannerId` and
 * fires a `provider_picker_impression` once per visit, so the admin Dashboard
 * Banners leaderboard can compute click-through per banner. Click events keep
 * the legacy `source: "hero"` + section/tier keys so the existing comms-funnel
 * rollup is unaffected.
 */

const HERO_IMAGE_DEFAULT = "/images/for-providers/dashboard-hero.jpg";

// Per-section images for completion-tier picks (Tiers 4 + 5). When the picker
// lands on a section, the hero uses that section's dedicated image to give
// the nudge a context-specific visual mood. Sections without a custom image
// (or that get added later) fall back to HERO_IMAGE_DEFAULT.
const SECTION_IMAGES: Record<NudgeSectionId, string> = {
  gallery: "/images/for-providers/dashboard-hero-gallery.jpg",
  about: "/images/for-providers/dashboard-hero-about.jpg",
  pricing: "/images/for-providers/dashboard-hero-pricing.jpg",
  services: "/images/for-providers/dashboard-hero-services.jpg",
  screening: "/images/for-providers/dashboard-hero-overview.jpg", // reuses overview (original had white strip)
  payment: "/images/for-providers/dashboard-hero-payment.jpg",
  overview: "/images/for-providers/dashboard-hero-overview.jpg",
};

// Per-tier images for engagement signals (Tiers 1, 2, 3) and the
// fully-complete fallback (Tier 6).
const TIER_LEADS_IMAGE = "/images/for-providers/dashboard-hero-leads.jpg";
const TIER_QUESTIONS_IMAGE = "/images/for-providers/dashboard-hero-questions.jpg";
const TIER_SPIKE_IMAGE = "/images/for-providers/dashboard-hero-spike.jpg";
const TIER_FALLBACK_IMAGE = "/images/for-providers/dashboard-hero-fallback.jpg";
const TIER_MANAGED_ADS_IMAGE = "/images/for-providers/dashboard-hero-managed-ads.jpg";

// Every hero image we might render. Preloaded on mount so tier swaps during
// the session (provider saves a section → completeness changes → picker
// chooses a different section → hero re-renders with a new image) are
// instant from browser cache instead of fetching ~150-260KB on swap.
const ALL_HERO_IMAGES: readonly string[] = [
  HERO_IMAGE_DEFAULT,
  TIER_LEADS_IMAGE,
  TIER_QUESTIONS_IMAGE,
  TIER_SPIKE_IMAGE,
  TIER_FALLBACK_IMAGE,
  TIER_MANAGED_ADS_IMAGE,
  ...Object.values(SECTION_IMAGES),
];

const ENGAGEMENT_VIEW_THRESHOLD = 10;

// Find Families (/provider/matches) is now leads-only: the hot "family near you"
// tier links here to the lead cards. The cold "market intel" tier instead links
// to Growth (/provider/growth) — the demand/competition diagnostic, which
// split out into its own tab. Reuse existing hero imagery — the leads photo
// (someone reaching out) for the live-family case, the spike photo (upward
// momentum) for the market read — so no new assets ship.
const FIND_FAMILIES_HREF = "/provider/matches";
const MARKET_HREF = "/provider/growth";
const FIND_FAMILIES_LIVE_IMAGE = TIER_LEADS_IMAGE;
const MARKET_INTEL_IMAGE = TIER_SPIKE_IMAGE;

// Cold providers (sparse traffic) get the completion nudge by default, but
// every Nth dashboard visit the hero rotates in the Find Families market-intel
// banner instead — so the capability surfaces early and repeatedly without
// letting profile completion collapse. Deterministic per-visit via a
// localStorage counter (true "every 3rd visit", and easy to QA: reload thrice).
const ROTATE_EVERY = 3;

/** Increment + read the per-browser hero visit counter. Returns the new count
 *  (1-based). Drives the cold-tier completion ⇄ market-intel rotation. SSR-safe
 *  (returns 0 server-side) and failure-safe (returns 0 if storage is blocked). */
function bumpHeroRotation(): number {
  if (typeof window === "undefined") return 0;
  try {
    const key = "olera_hero_rotation";
    const next = (parseInt(window.localStorage.getItem(key) || "0", 10) || 0) + 1;
    window.localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
}

// Dismiss helpers (shared with DashboardHeroSkeleton so the skeleton hides too).
// See heroDismiss.ts for the Robinhood-style daily-reset rationale.

interface Props {
  firstName: string;
  data: ProviderDashboardV2Data;
  /** Profile completeness — feeds the completion-tier picker. */
  completeness: ProfileCompleteness;
  /** Provider category — feeds category-aware copy (place vs service). */
  category: ProfileCategory | null;
  /** Open the relevant edit modal in place. Only fires for completion-tier CTAs. */
  onOpenSection: (sectionId: NudgeSectionId) => void;
  /** Slug used as provider_id for fire-and-forget activity events. */
  providerSlug: string;
  /** Reports the hero's resolved actionable CTA so the mobile sticky action
   *  bar can mirror exactly what the hero shows (same rotation, same tier).
   *  Null when the current tier carries no CTA (e.g. the view-spike moment). */
  onHeroAction?: (action: HeroAction | null) => void;
  /** Reports the banner the hero resolved to this visit, so the dashboard can
   *  suppress the redundant post-edit managed-ads nudge when the hero itself
   *  is already showing the managed-ads banner. */
  onBannerResolved?: (bannerId: string) => void;
  /** True if the provider has an active ad boost request. When true, the
   *  reviews banner is shown instead of managed_ads in the cold tier. */
  hasActiveBoostRequest?: boolean;
}

/** The hero's chosen action, flattened for the mobile sticky bar to mirror. */
export interface HeroAction {
  label: string;
  /** "section" opens an edit modal in place; "nav" navigates to href. */
  kind: "section" | "nav";
  sectionId?: NudgeSectionId;
  href?: string;
}

/** Engagement-tier CTA tags (Tiers 1, 2). Used for tracking clicks so the
 *  same provider_picker_clicked event covers both engagement and completion
 *  tiers — the admin funnel + Slack alert see all hero engagement, not
 *  only the completion-section subset. */
type EngagementTier = "leads" | "questions";

export interface NavCta {
  label: string;
  href: string;
  /** Set on engagement-tier CTAs so click tracking knows which tier fired. */
  engagementTier?: EngagementTier;
}

export interface SectionCta {
  label: string;
  sectionId: NudgeSectionId;
  weight: number;
}

export interface Hook {
  /** Stable identity for the leaderboard + impression dedupe. Section banners
   *  use `completion:<section>`; the rest use a fixed slug. */
  bannerId: string;
  headline: string;
  subline?: string;
  cta?: NavCta | SectionCta;
  /** Optional per-tier / per-section image. Falls back to HERO_IMAGE_DEFAULT. */
  imageUrl?: string;
}

function isSectionCta(cta: NavCta | SectionCta): cta is SectionCta {
  return "sectionId" in cta;
}

export default function DashboardHero({
  firstName,
  data,
  completeness,
  category,
  onOpenSection,
  providerSlug,
  onHeroAction,
  onBannerResolved,
  hasActiveBoostRequest = false,
}: Props) {
  // Per-browser visit counter, read once per mount (lazy init runs a single
  // time, even under StrictMode's double-invoked effects). Drives the cold-tier
  // rotation below.
  const [rotationCount] = useState(bumpHeroRotation);
  const managedAdsVariant = useManagedAdsVariant(providerSlug);
  const hook = resolveHook(
    data,
    completeness,
    category,
    rotationCount,
    managedAdsVariant ?? "direct_reach",
    hasActiveBoostRequest,
  );

  // Robinhood-style dismiss: only the non-essential banner is hideable, and only
  // for the rest of today. `hidden` gates rendering + every side effect below so
  // a dismissed banner fires no impression and clears the mobile sticky CTA.
  const [dismissedToday, setDismissedToday] = useState(readDismissedToday);
  const dismissible = isDismissibleBanner(hook.bannerId);
  const hidden = dismissible && dismissedToday;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(HERO_DISMISS_KEY, todayStamp());
    } catch {
      /* storage blocked — dismissal just won't persist across reloads */
    }
    setDismissedToday(true);
  };

  // Preload every tier image once the hero mounts. After a provider saves
  // a section the picker re-evaluates and the hero swaps to a different
  // image; without preload, the new image's ~150-260KB fetch causes a
  // visible flash of either no-image or stale-image before the swap. With
  // preload, all 11 images sit in browser cache and tier swaps are instant.
  // Total preload payload is ~1.6MB, fired off the critical path.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // The hero background is `hidden md:block` — it never paints on phones, so
    // preloading ~1.6MB of tier imagery on mobile is pure waste on 4G. Warm the
    // cache only where the image actually renders (md+). Tier swaps mid-session
    // are a desktop concern; mobile shows the solid warm-950 card regardless.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    for (const url of ALL_HERO_IMAGES) {
      const img = new window.Image();
      img.src = url;
    }
  }, []);

  const firedImpression = useRef<string | null>(null);
  const firedManagedAdsPitch = useRef(false);
  const { bannerId } = hook;
  const sectionId =
    hook.cta && isSectionCta(hook.cta) ? hook.cta.sectionId : null;
  const sectionWeight =
    hook.cta && isSectionCta(hook.cta) ? hook.cta.weight : null;

  // One impression per (visit, bannerId) for EVERY banner — not just the
  // completion sections — so the leaderboard's click-through denominator covers
  // all banners. Section banners still carry section/weight for the existing
  // rollup.
  useEffect(() => {
    if (hidden) return; // dismissed today — not shown, so not an impression
    if (firedImpression.current === bannerId) return;
    firedImpression.current = bannerId;
    track("provider_picker_impression", providerSlug, {
      source: "hero",
      banner: bannerId,
      ...(bannerId === "managed_ads" ? { managed_ads_variant: managedAdsVariant ?? "direct_reach" } : {}),
      ...(sectionId ? { section: sectionId, weight: sectionWeight } : {}),
    });
  }, [hidden, bannerId, managedAdsVariant, sectionId, sectionWeight, providerSlug]);

  useEffect(() => {
    if (hidden || bannerId !== "managed_ads" || !managedAdsVariant || firedManagedAdsPitch.current) return;
    if (isManagedAdsPreviewMode()) return;
    firedManagedAdsPitch.current = true;
    trackProviderEvent(providerSlug, "managed_ads_pitch_viewed", {
      provider_name: firstName,
      source: "hero",
      managed_ads_variant: managedAdsVariant,
    });
  }, [hidden, bannerId, firstName, managedAdsVariant, providerSlug]);

  // Tell the dashboard which banner won this visit, so it can suppress the
  // post-edit managed-ads nudge when the hero is already the managed-ads pitch.
  // When the managed-ads banner wins, also warm the boost-state cache so the
  // "Get my launch plan" → /provider/boost transition paints instantly (no snap).
  useEffect(() => {
    // When dismissed, the hero shows nothing — report no resolved banner so the
    // dashboard's separate (non-hero) managed-ads nudge isn't wrongly suppressed.
    onBannerResolved?.(hidden ? "" : bannerId);
    if (!hidden && bannerId === "managed_ads") prefetchBoostState();
  }, [hidden, bannerId, onBannerResolved]);

  // Flatten the resolved CTA for the mobile sticky bar. Reported via effect so
  // the bar mirrors EXACTLY the tier the hero landed on this visit — no
  // duplicated picker logic, no separate rotation roll. Null for no-CTA tiers.
  const heroActionLabel = hook.cta?.label ?? null;
  const heroActionHref =
    hook.cta && !isSectionCta(hook.cta) ? hook.cta.href : null;
  useEffect(() => {
    if (!onHeroAction) return;
    // Hidden (dismissed) → clear the mobile sticky CTA so it doesn't mirror a
    // banner that isn't on screen.
    if (hidden || !hook.cta) {
      onHeroAction(null);
      return;
    }
    onHeroAction(
      isSectionCta(hook.cta)
        ? { label: hook.cta.label, kind: "section", sectionId: hook.cta.sectionId }
        : { label: hook.cta.label, kind: "nav", href: hook.cta.href }
    );
    // hook.cta is recomputed each render; key the effect on its primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onHeroAction, hidden, sectionId, heroActionLabel, heroActionHref]);

  const handleSectionClick = (cta: SectionCta) => {
    track("provider_picker_clicked", providerSlug, {
      source: "hero",
      banner: bannerId,
      tier: "completion",
      section: cta.sectionId,
      weight: cta.weight,
    });
    onOpenSection(cta.sectionId);
  };

  // Nav-CTA clicks (engagement Tiers 1-2 + the Find Families tiers) fire the
  // same provider_picker_clicked event so the admin funnel + leaderboard cover
  // all hero clicks, not only the completion-section subset. The Link still
  // navigates — track is fire-and-forget with keepalive so the POST survives
  // the navigation.
  const handleNavClick = (cta: NavCta) => {
    track("provider_picker_clicked", providerSlug, {
      source: "hero",
      banner: bannerId,
      ...(cta.engagementTier ? { tier: cta.engagementTier } : {}),
      destination: cta.href,
    });
    // Also feed the managed-ads funnel so hero-origin shows up alongside the
    // dashboard-card / Find Families sources (the boost page reads source).
    if (bannerId === "managed_ads") {
      trackProviderEvent(providerSlug, "managed_ads_cta_clicked", {
        provider_name: firstName,
        source: "hero",
        managed_ads_variant: managedAdsVariant ?? "direct_reach",
      });
    }
  };

  // Dismissed for today — render nothing. The wrapping div in DashboardPage has
  // no intrinsic height, so this leaves no gap.
  if (hidden) return null;

  return (
    <HeroCard
      firstName={firstName}
      hook={hook}
      className="mb-6"
      onSectionClick={handleSectionClick}
      onNavClick={handleNavClick}
      onDismiss={dismissible ? handleDismiss : undefined}
    />
  );
}

// Shared pill styling for the CTA — reused by the live button/link and the
// inert preview span so all three render identically.
const CTA_PILL =
  "inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-full bg-vanilla-100 text-warm-950 text-sm font-medium hover:bg-white transition-colors group";

/**
 * Pure presentational hero card. Production composes `resolveHook()` → this;
 * the admin banner preview renders it directly with a synthetic hook so the
 * preview is the *actual* component (no screenshot, no re-render, no drift).
 *
 * `surface` controls how the photo backdrop renders:
 *   - "responsive" (default, production): photo `hidden md:block` — phones get
 *     the solid warm-950 card, desktop gets the portrait.
 *   - "desktop": photo always painted (preview forces the desktop look at any
 *     admin viewport width).
 *   - "mobile": no photo at all — solid warm-950, the exact phone treatment.
 *
 * Click handlers are optional: when omitted (preview), the CTA renders as an
 * inert span styled identically to the live pill.
 */
export function HeroCard({
  firstName,
  hook,
  surface = "responsive",
  className = "",
  onSectionClick,
  onNavClick,
  onDismiss,
}: {
  firstName: string;
  hook: Hook;
  surface?: "responsive" | "desktop" | "mobile";
  className?: string;
  onSectionClick?: (cta: SectionCta) => void;
  onNavClick?: (cta: NavCta) => void;
  /** When provided, renders a dismiss (X) in the top-right. Only the live
   *  dashboard passes this (for non-essential banners); the admin preview omits
   *  it so previews show the banner content uncluttered. */
  onDismiss?: () => void;
}) {
  // Photo + gradient paint for desktop/responsive; mobile is solid warm-950.
  const showPhoto = surface !== "mobile";
  const photoVis = surface === "desktop" ? "block" : "hidden md:block";
  // Surface-driven responsive classes. "responsive" keeps the live `md:` breakpoint
  // behavior (production, byte-identical). The preview surfaces FORCE one rendering
  // regardless of the admin viewport width — so the Mobile toggle shows real phone
  // type/padding (no photo, smaller headline, tighter pad) and Desktop shows the
  // portrait treatment, not whatever the admin window happens to be wide enough for.
  const minH =
    surface === "responsive" ? "md:min-h-[260px]" : surface === "desktop" ? "min-h-[260px]" : "";
  const pad =
    surface === "responsive" ? "px-6 py-5 md:px-9 md:py-7" : surface === "desktop" ? "px-9 py-7" : "px-6 py-5";
  const greetSize =
    surface === "responsive" ? "text-[15px] md:text-[16px]" : surface === "desktop" ? "text-[16px]" : "text-[15px]";
  const headSize =
    surface === "responsive" ? "text-[20px] md:text-[24px]" : surface === "desktop" ? "text-[24px]" : "text-[20px]";

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-warm-950 ${minH} ${className}`}>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/30 text-white/90 backdrop-blur-sm hover:bg-black/50 hover:text-white active:bg-black/60 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {showPhoto && (
        <>
          {/* Background image — warm photo behind the card. backgroundSize is
              `auto 150%` (not `cover`): sized off the card's HEIGHT, not width,
              so the face frame stays consistent at any card width — a contained
              portrait on the right, empty warm-950 on the left blended out by
              the gradient. */}
          <div
            aria-hidden
            className={`${photoVis} absolute inset-0 pointer-events-none`}
            style={{
              backgroundImage: `url('${hook.imageUrl ?? HERO_IMAGE_DEFAULT}')`,
              backgroundSize: "auto 150%",
              backgroundPosition: "right 35%",
              backgroundRepeat: "no-repeat",
              // Soft-fade the image's left edge into the warm-950 background so
              // there's no hard rectangle line where the photo starts.
              maskImage:
                "linear-gradient(to right, transparent 0%, transparent calc(100% - 720px), black calc(100% - 460px), black 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, transparent calc(100% - 720px), black calc(100% - 460px), black 100%)",
            }}
          />
          {/* Dark gradient — keeps the headline readable while the image shows
              through on the right side. */}
          <div
            aria-hidden
            className={`${photoVis} absolute inset-0 pointer-events-none`}
            style={{
              background:
                "linear-gradient(to right, rgba(42, 24, 16, 0.96) 0%, rgba(42, 24, 16, 0.96) calc(100% - 600px), rgba(42, 24, 16, 0.7) calc(100% - 440px), rgba(42, 24, 16, 0.25) calc(100% - 200px), rgba(42, 24, 16, 0.08) 100%)",
            }}
          />
        </>
      )}
      <div className={`relative ${pad} max-w-[560px]`}>
        {/* font-serif (not font-display) because DM Serif Display only loads
            the regular weight — italic on it would be a fake browser-synthesized
            slant. font-serif falls back to New York / Georgia, both of which
            have a real designed italic baked into the OS, no extra download. */}
        <p className={`font-serif italic ${greetSize} text-warm-200/85 leading-snug mb-2`}>
          Hey {firstName}
        </p>
        <p className={`font-display ${headSize} font-semibold text-white leading-[1.2] tracking-tight`}>
          {hook.headline}
        </p>
        {hook.subline && (
          <p className="mt-2 text-sm text-warm-100/90 leading-relaxed [text-shadow:0_1px_3px_rgba(42,24,16,0.55)]">
            {hook.subline}
          </p>
        )}
        {hook.cta && (
          isSectionCta(hook.cta) ? (
            onSectionClick ? (
              <button
                type="button"
                onClick={() => onSectionClick(hook.cta as SectionCta)}
                className={CTA_PILL}
              >
                {hook.cta.label}
                <CtaArrow />
              </button>
            ) : (
              <span className={`${CTA_PILL} cursor-default`}>
                {hook.cta.label}
                <CtaArrow />
              </span>
            )
          ) : onNavClick ? (
            <Link
              href={hook.cta.href}
              onClick={() => onNavClick(hook.cta as NavCta)}
              className={CTA_PILL}
            >
              {hook.cta.label}
              <CtaArrow />
            </Link>
          ) : (
            <span className={`${CTA_PILL} cursor-default`}>
              {hook.cta.label}
              <CtaArrow />
            </span>
          )
        )}
      </div>
    </div>
  );
}

function CtaArrow() {
  return (
    <svg
      className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Per-tier hook factories ──────────────────────────────────────────────
// One factory per banner so resolveHook (live) and buildBannerPreviews (admin)
// build identical hooks from one source — copy/image edits can't drift between
// what providers see and what the preview shows.

function leadsHook(n: number): Hook {
  return {
    bannerId: "leads",
    headline: `${n} new ${n === 1 ? "inquiry" : "inquiries"} this month.`,
    subline:
      "Families expect a response within a day — quick replies read as professional.",
    cta: { label: "View inquiries", href: "/provider/connections", engagementTier: "leads" },
    imageUrl: TIER_LEADS_IMAGE,
  };
}

function questionsHook(n: number): Hook {
  return {
    bannerId: "questions",
    headline: `${n} question${n === 1 ? "" : "s"} waiting for your answer.`,
    subline:
      "Under a minute each, and families feel like you're paying attention.",
    cta: { label: "Review questions", href: "/provider/qna", engagementTier: "questions" },
    imageUrl: TIER_QUESTIONS_IMAGE,
  };
}

function nearbyFamiliesHook(nearby: number): Hook {
  return {
    bannerId: "find_families_live",
    headline:
      nearby === 1
        ? "A family near you is looking for care."
        : `${nearby} families near you are looking for care.`,
    subline:
      "The first provider to reach out usually wins the conversation. See who they are and say hello.",
    cta: { label: "See families near you", href: FIND_FAMILIES_HREF },
    imageUrl: FIND_FAMILIES_LIVE_IMAGE,
  };
}

function viewSpikeHook(deltaPct: number, viewsThisPeriod: number, viewsPriorPeriod: number): Hook {
  return {
    bannerId: "view_spike",
    headline: `Your page views are up ${deltaPct}% this month.`,
    subline: `${viewsThisPeriod} families found you — ${Math.max(0, viewsThisPeriod - viewsPriorPeriod)} more than last month.`,
    imageUrl: TIER_SPIKE_IMAGE,
  };
}

/** Engagement-tier completion banner (≥10 views): the headline rewards the
 *  traffic, the CTA points at the highest-impact incomplete section. */
function engagementCompletionHook(viewCount: number, next: NextAction): Hook {
  return {
    bannerId: `completion:${next.sectionId}`,
    headline: `${viewCount} families viewed your page this month.`,
    subline: next.copy.subline,
    cta: { label: next.copy.cta, sectionId: next.sectionId, weight: next.weight },
    imageUrl: SECTION_IMAGES[next.sectionId],
  };
}

/** Views-to-ads banner (≥10 views, complete profile): leverage existing traffic
 *  to pitch ads — they have eyeballs, help them convert more. */
function viewsToAdsHook(viewCount: number): Hook {
  return {
    bannerId: "views_to_ads",
    headline: `${viewCount} families viewed your page this month.`,
    subline: "Turn views into leads.",
    cta: { label: "See how", href: "/provider/boost" },
    imageUrl: TIER_SPIKE_IMAGE,
  };
}

/** Cold-tier completion banner (sparse traffic): the section's own headline. */
function coldCompletionHook(next: NextAction): Hook {
  return {
    bannerId: `completion:${next.sectionId}`,
    headline: next.copy.headline,
    subline: next.copy.subline,
    cta: { label: next.copy.cta, sectionId: next.sectionId, weight: next.weight },
    imageUrl: SECTION_IMAGES[next.sectionId],
  };
}

/** Find Families "market intel" banner — the cold-tier nudge when there's no
 *  nearby seeker yet. The value is the demand read, not a roster of families,
 *  so the copy points at the market, not at people to contact. */
function marketIntelHook(): Hook {
  return {
    bannerId: "find_families_intel",
    headline: "See who's searching in your market",
    subline:
      "Olera tracks the families looking for care near you — explore your local demand and where you stand against nearby providers.",
    cta: { label: "Explore your market", href: MARKET_HREF },
    imageUrl: MARKET_INTEL_IMAGE,
  };
}

/** Managed Ads banner — the primary cold-tier nudge. The ~99% have no local
 *  families surfacing organically; managed ads is the one lever that GENERATES
 *  demand (external paid acquisition), so it leads the empty-handed fallback.
 *  Shown regardless of completeness — the 70% eligibility gate lives on
 *  /provider/boost, which routes thin profiles to "finish these to unlock," so
 *  the ads desire pulls providers into completing. */
function managedAdsHook(variant: ManagedAdsVariant): Hook {
  const copy = managedAdsPitchCopy(variant);
  return {
    bannerId: "managed_ads",
    headline: `${copy.headline} ${copy.accent}.`,
    subline: copy.body,
    cta: { label: "Get my launch plan", href: "/provider/boost" },
    imageUrl: TIER_MANAGED_ADS_IMAGE,
  };
}

/** Reviews banner — shown when provider already has an active ad boost request.
 *  Instead of showing "Get my launch plan" again, we nudge them to collect
 *  reviews, which strengthens their profile for when families arrive via ads. */
function reviewsHook(): Hook {
  return {
    bannerId: "reviews",
    headline: "Collect reviews from families.",
    subline:
      "Reviews build trust with new families. Send a quick invite to past clients and let their words do the selling.",
    cta: { label: "Get more reviews", href: "/provider/reviews" },
    imageUrl: TIER_SPIKE_IMAGE,
  };
}

function resolveHook(
  data: ProviderDashboardV2Data,
  completeness: ProfileCompleteness,
  category: ProfileCategory | null,
  rotationCount: number,
  managedAdsVariant: ManagedAdsVariant,
  hasActiveBoostRequest: boolean,
): Hook {
  const { greeting } = data;

  // Priority 1 — fresh leads this period. Highest intent: a family is
  // actively reaching out for placement. Beats info-gathering questions.
  if (greeting.newLeadsThisPeriod > 0) return leadsHook(greeting.newLeadsThisPeriod);

  // Priority 2 — unanswered questions. Real family on the other end.
  if (greeting.unansweredQuestions > 0) return questionsHook(greeting.unansweredQuestions);

  // Priority 3 — a real published care-seeker within the catchment. This is the
  // rare concrete lead: someone Find Families would pin for them. It jumps the
  // line over profile housekeeping and view momentum because there's a live
  // family to reach out to RIGHT NOW. Honest by construction — only fires when
  // the count is real (the dashboard API counts active care_posts within 50mi).
  const nearby = data.nearbyFamilies?.count ?? 0;
  if (nearby > 0) return nearbyFamiliesHook(nearby);

  // Priority 4 — meaningful view spike. Positive reinforcement, no CTA —
  // the headline IS the value.
  if (greeting.deltaPct !== null && greeting.deltaPct >= 25 && greeting.viewsThisPeriod >= 5) {
    return viewSpikeHook(greeting.deltaPct, greeting.viewsThisPeriod, greeting.viewsPriorPeriod);
  }

  const next = pickNextAction(completeness, category);

  // Priority 5 — meaningful traffic (≥ 10 views). With a completion gap, the
  // engagement headline rewards the activity and the section CTA fills the
  // activation lever (kept strong — no rotation — because traffic means they're
  // closer to converting and the gap is the higher-leverage fix). With a
  // complete profile, there's nothing to fix, so pull them toward Find Families
  // market intel instead of the old no-CTA filler.
  // Priority 5 — meaningful traffic (≥10 views) with a completion gap. They
  // already have eyeballs arriving organically, so plugging the profile leak
  // converts traffic they ALREADY have — higher leverage than paying for more.
  // No rotation here; this is the strongest activation moment. (Complete + this
  // much traffic falls through to the managed-ads default below.)
  if (greeting.viewsThisPeriod >= ENGAGEMENT_VIEW_THRESHOLD && next) {
    return engagementCompletionHook(greeting.viewsThisPeriod, next);
  }

  // Priority 5b — meaningful traffic (≥10 views) with a COMPLETE profile and no
  // active boost. They have eyeballs but no completion lever to pull — pitch ads
  // as the way to convert views into leads.
  if (greeting.viewsThisPeriod >= ENGAGEMENT_VIEW_THRESHOLD && !next && !hasActiveBoostRequest) {
    return viewsToAdsHook(greeting.viewsThisPeriod);
  }

  // Priorities 6-7 — the cold, empty-handed majority (~99%): no leads, no
  // questions, no nearby family, sparse traffic. Managed Ads leads here — it's
  // the one lever that GENERATES demand (external paid acquisition) rather than
  // waiting on an empty local funnel, so it's the KPI move for this cohort.
  // Shown regardless of completeness: the 70% gate lives on /provider/boost,
  // which turns the ads desire into a profile-completion pull.
  //
  // Every ROTATE_EVERY-th visit we rotate to a secondary so neither the
  // activation nudge nor the market insight is lost — alternating completion
  // (when there's a gap) and the market read across rotations. Providers with
  // active ads see the reviews banner on rotation visits too — keeps the
  // reviews nudge visible more often to drive review collection.
  if (rotationCount > 0 && rotationCount % ROTATE_EVERY === 0) {
    if (hasActiveBoostRequest) return reviewsHook();
    const altCompletion = Math.floor(rotationCount / ROTATE_EVERY) % 2 === 0;
    if (next && altCompletion) return coldCompletionHook(next);
    return marketIntelHook();
  }

  // If the provider already has an active ad boost request, show the reviews
  // banner instead of "Get my launch plan" — no point pitching ads to someone
  // who already bought in. Reviews strengthen their profile for when families
  // arrive via ads.
  if (hasActiveBoostRequest) return reviewsHook();

  return managedAdsHook(managedAdsVariant);
}

/** One previewable banner: the stable id (matches the leaderboard) + the hook
 *  the live picker would build for it, with representative sample counts. */
export interface BannerPreview {
  bannerId: string;
  hook: Hook;
}

/**
 * Every distinct hero banner, rendered from the same factories the live picker
 * uses — the admin banner preview flips through these. Completion banners use
 * the cold-tier framing (the section's own headline), which is the creative the
 * `completion:<section>` leaderboard row maps to. Sample counts are illustrative.
 */
export function buildBannerPreviews(): BannerPreview[] {
  const previews: BannerPreview[] = [
    { bannerId: "leads", hook: leadsHook(3) },
    { bannerId: "questions", hook: questionsHook(2) },
    { bannerId: "find_families_live", hook: nearbyFamiliesHook(1) },
    { bannerId: "managed_ads", hook: managedAdsHook("direct_reach") },
    { bannerId: "reviews", hook: reviewsHook() },
    { bannerId: "find_families_intel", hook: marketIntelHook() },
    { bannerId: "view_spike", hook: viewSpikeHook(33, 12, 9) },
    { bannerId: "views_to_ads", hook: viewsToAdsHook(15) },
  ];
  for (const sectionId of NUDGE_SECTION_IDS) {
    previews.push({
      bannerId: `completion:${sectionId}`,
      hook: coldCompletionHook({ sectionId, weight: 0, copy: previewCopy(sectionId) }),
    });
  }
  return previews;
}

/**
 * Fire-and-forget event capture. `keepalive: true` ensures the POST survives
 * a same-tab navigation. Mirrors the AnalyticsTeaserCard tracking pattern.
 */
function track(
  eventType: "provider_picker_impression" | "provider_picker_clicked",
  providerSlug: string,
  metadata: Record<string, unknown>,
): void {
  try {
    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        actor_type: "provider",
        provider_id: providerSlug,
        event_type: eventType,
        metadata,
      }),
    }).catch(() => {
      /* fire-and-forget */
    });
  } catch {
    /* fire-and-forget */
  }
}
