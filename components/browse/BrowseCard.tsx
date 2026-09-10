"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { type ProviderCardData, getCategoryDisplayName } from "@/lib/types/provider";
import PricingEducationBadge from "@/components/providers/PricingEducationBadge";
import RegionalEstimateLabel from "@/components/providers/RegionalEstimateLabel";
import { getPricingConfig } from "@/lib/pricing-config";
import { getOrCreateSessionId } from "@/lib/analytics/session";

function inferBrowseSource(): string {
  if (typeof window === "undefined") return "unknown";
  const path = window.location.pathname;
  if (path === "/" || path === "") return "homepage";
  if (path.startsWith("/browse")) return "browse";
  // Routes are /[category], /[category]/[state], /[category]/[state]/[city].
  // Distinguish by segment count rather than by literal first segment.
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 3) return "city-category-page";
  if (segments.length === 2) return "state-category-page";
  if (segments.length === 1) return "category-page";
  return "other";
}

// TODO Phase 1: thread `position` (index in results) and `query` (search terms / filters)
// down to BrowseCard so the funnel can be analyzed by query intent and rank.

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// MedJobs student variant: students don't read "agency," so the card leads with
// the care opportunity (the need) and names the agency as "through {name}".
const CARE_OPPORTUNITY_LABELS: Record<string, string> = {
  home_care: "In-home senior care",
  in_home_care: "In-home senior care",
  non_medical_home_care: "In-home senior care",
  home_health: "Home health care",
  assisted_living: "Assisted living care",
  memory_care: "Memory care",
  nursing_home: "Skilled nursing care",
  skilled_nursing: "Skilled nursing care",
  hospice: "Hospice & end-of-life care",
  adult_day_care: "Adult day care",
  adult_day: "Adult day care",
  independent_living: "Senior living support",
  senior_living: "Senior living support",
  residential_care: "Residential senior care",
};

function careOpportunityLabel(provider: ProviderCardData): string {
  const raw = provider.providerCategory;
  if (raw && CARE_OPPORTUNITY_LABELS[raw]) return CARE_OPPORTUNITY_LABELS[raw];
  if (provider.careTypes[0]) return getCategoryDisplayName(provider.careTypes[0]) || provider.careTypes[0];
  return provider.primaryCategory || "Senior care";
}

interface BrowseCardProps {
  provider: ProviderCardData;
  /** "student" re-renders this directory card for the MedJobs families board
   *  (opportunity-led, Request-interview). "candidate" re-renders it for the
   *  provider candidate board (a person: name, track·university, availability).
   *  Both descend from the one directory card — only the contextual bits change. */
  variant?: "default" | "student" | "candidate";
  /** Sample listing (cold-start) — dashed border, "Demo" badge, non-clickable. */
  isDemo?: boolean;
  isRequested?: boolean;
  canRequest?: boolean;
  onRequestInterview?: () => void;
  /** student variant — label for the request button (defaults to "Request
   *  interview"; not-live students get "Complete profile to apply →"). */
  requestLabel?: string;
  /** candidate variant — the detail link target (e.g. /medjobs/candidates/{slug}). */
  href?: string;
  /** candidate variant — "Covers your evenings" match line. */
  matchLabel?: string;
  /** candidate variant — 0-100 match score. Shows colored badge on card. */
  matchScore?: number | null;
  /** candidate variant — quick invite button callback. */
  onQuickInvite?: () => void;
  /** candidate variant — generic CTA label + handler (e.g. "Schedule Interview" / "More details"). */
  ctaLabel?: string;
  onCta?: () => void;
  /** candidate variant — true if already invited. */
  isInvited?: boolean;
  /** student variant — campus slug, carried into the provider detail link. */
  campus?: string;
}

export default function BrowseCard({
  provider,
  variant = "default",
  isDemo = false,
  isRequested = false,
  canRequest = false,
  onRequestInterview,
  requestLabel = "Request interview",
  href,
  matchLabel,
  matchScore,
  onQuickInvite,
  ctaLabel,
  onCta,
  isInvited = false,
  campus,
}: BrowseCardProps) {
  const isStudent = variant === "student";
  const isCandidate = variant === "candidate";
  const opportunityLabel = careOpportunityLabel(provider);
  const { activeProfile, openAuth } = useAuth();
  const { isSaved: checkSaved, toggleSave } = useSavedProviders();
  const isSaved = checkSaved(provider.id);
  const [imgFailed, setImgFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const heartButtonRef = useRef<HTMLButtonElement>(null);

  // Check if user is a non-family profile (provider/caregiver/student)
  const isNonFamilyProfile = activeProfile && activeProfile.type !== "family";

  // Dynamic label for the account type hint
  const accountTypeLabel = activeProfile?.type === "organization"
    ? "provider"
    : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
    ? "caregiver"
    : "current";

  const primaryUnusable = provider.imageType === "placeholder" || imgFailed;
  const fallbackAvailable = !!provider.fallbackImage && !fallbackFailed;
  const showFallbackPhoto = primaryUnusable && fallbackAvailable;
  const showPlaceholder = primaryUnusable && !fallbackAvailable;
  const showAsLogo = !primaryUnusable && provider.imageType === "logo";

  const careTypeLabel = getCategoryDisplayName(provider.careTypes[0]) || provider.primaryCategory;
  const displayedHighlights = provider.highlights?.slice(0, 3) || [];

  // Close tooltip on click outside (excluding the heart button itself)
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        heartButtonRef.current &&
        !heartButtonRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  const handleCardClick = () => {
    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actor_type: "anonymous",
        event_type: "search_click",
        related_provider_id: provider.slug,
        session_id: getOrCreateSessionId(),
        metadata: {
          source: inferBrowseSource(),
          provider_name: provider.name,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  };

  const rootClass = `group flex flex-col h-full bg-white rounded-xl overflow-hidden border transition-all duration-200 ${
    isStudent && isDemo
      ? "border-dashed border-slate-300"
      : "border-gray-200 hover:shadow-md hover:border-gray-300"
  }`;

  const cardBody = (
    <>
      {/* Image */}
      <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50">
        {showPlaceholder ? (
          /* Last resort — gradient + initials */
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
              <span className="text-2xl font-bold text-primary-400">{getInitials(provider.name)}</span>
            </div>
            <span className="text-xs font-medium text-primary-300 mt-2">{provider.primaryCategory}</span>
          </div>
        ) : showFallbackPhoto ? (
          /* Stock photo — when real image is unavailable or failed */
          <Image
            src={provider.fallbackImage!}
            alt={provider.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 400px"
            onError={() => setFallbackFailed(true)}
          />
        ) : showAsLogo ? (
          /* Logo — contained on gradient background, not cropped */
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Image
              src={provider.image}
              alt={provider.name}
              fill
              className="object-contain p-6"
              sizes="(max-width: 640px) 100vw, 400px"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          /* Real photo — full bleed cover */
          <Image
            src={provider.image}
            alt={provider.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 400px"
            onError={() => setImgFailed(true)}
          />
        )}

        {/* Heart — top right (family-only; hidden in student/candidate variants) */}
        {variant === "default" && (
        <button
          ref={heartButtonRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isNonFamilyProfile) {
              setShowTooltip(true);
              return;
            }
            toggleSave({
              providerId: provider.id,
              slug: provider.slug,
              name: provider.name,
              location: provider.address,
              careTypes: [provider.primaryCategory],
              image: provider.image,
              rating: provider.rating || undefined,
            });
          }}
          className="absolute top-2 right-2 z-10 w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white flex items-center justify-center transition-colors shadow-sm"
          aria-label={isSaved ? "Remove from saved" : "Save provider"}
        >
          <svg
            className={`w-5 h-5 transition-colors ${
              isSaved ? "text-primary-600" : "text-gray-500"
            }`}
            fill={isSaved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>
        )}

        {/* Tooltip for non-family users */}
        {showTooltip && (
          <div
            ref={tooltipRef}
            className="absolute top-14 right-2 left-2 sm:left-auto z-20 sm:w-64 bg-gray-900 text-white rounded-xl shadow-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p className="text-sm mb-2">
              Save providers with a family account.
            </p>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTooltip(false);
                openAuth({ defaultMode: "sign-up", intent: "family" });
              }}
              className="text-sm font-medium text-primary-300 hover:text-primary-200 hover:underline"
            >
              Create one →
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Use a different email than your {accountTypeLabel} account.
            </p>
          </div>
        )}

        {/* Match score badge — candidate variant, top right */}
        {isCandidate && matchScore != null && matchScore > 0 && (
          <div className="absolute top-2 right-2 z-10 group/match">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold shadow-sm cursor-default ${
                matchScore >= 80
                  ? "bg-white text-emerald-700 ring-1 ring-emerald-200"
                  : matchScore >= 50
                    ? "bg-white text-orange-700 ring-1 ring-orange-200"
                    : "bg-white text-amber-700 ring-1 ring-amber-200"
              }`}
            >
              {matchScore}% match
            </span>
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-gray-900 text-white text-[11px] leading-relaxed px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/match:opacity-100 transition-opacity z-20">
              Matching is based on the skill set, training, and certifications mentioned in your job posting.
            </div>
          </div>
        )}

        {/* Badge — bottom left */}
        {provider.badge && (
          <div className="absolute bottom-2.5 left-2.5 z-10">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-600 text-white shadow-sm">
              {provider.badge}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col">
        {isStudent && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary-600">
            Paid caregiver role
          </p>
        )}
        {/* Name + Rating */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-sans font-semibold text-base text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-2 flex-1 leading-snug">
            {isStudent ? opportunityLabel : provider.name}
          </h3>
          {provider.rating > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">{provider.rating.toFixed(1)}</span>
              {provider.reviewCount != null && provider.reviewCount > 0 && (
                <span className="text-xs text-gray-500">({provider.reviewCount.toLocaleString()})</span>
              )}
              <span className="text-xs text-gray-400">on Google</span>
            </div>
          )}
        </div>

        {/* Subtitle — student: location + the agency; candidate: track · university;
            default: care type + location. */}
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {isStudent
            ? `${provider.address ? `${provider.address} · ` : ""}through ${provider.name}`
            : isCandidate
              ? `${provider.primaryCategory}${provider.address ? ` · ${provider.address}` : ""}`
              : `${careTypeLabel}${provider.address ? ` · ${provider.address}` : ""}`}
        </p>
        {isStudent && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Hiring student caregivers
          </p>
        )}
        {isCandidate && matchLabel && (
          <p className="mt-1.5 text-xs font-medium text-emerald-600">✓ {matchLabel}</p>
        )}

        {/* CMS Medicare Quality — only show 4/5 and 5/5 publicly (lower scores used for ranking only) */}
        {provider.cmsRating != null && provider.cmsRating >= 4 && (
          <div className="flex items-center gap-1 mt-1.5">
            <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <span className="text-xs font-medium text-blue-700">Medicare Quality: {provider.cmsRating}/5</span>
          </div>
        )}

        {/* AI Verified Credentials — show when no CMS badge displayed */}
        {!(provider.cmsRating != null && provider.cmsRating >= 4) && provider.trustSignalCount != null && provider.trustSignalCount > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            <span className="text-xs font-medium text-emerald-700">{provider.trustSignalCount} Verified Credential{provider.trustSignalCount !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* Highlights */}
        {displayedHighlights.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
            {displayedHighlights.map((h) => (
              <span key={h} className="flex items-center gap-1.5 text-xs text-gray-600">
                <svg className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1 min-h-2" />

        {/* Price (family-only — hidden in student/candidate variants) */}
        {variant === "default" && (provider.providerCategory && getPricingConfig(provider.providerCategory).tier === 3 && (!provider.priceRange || provider.priceRange === "Contact for pricing" || provider.isRegionalEstimate) ? (
          <div className="mt-3"><PricingEducationBadge category={provider.providerCategory} compact /></div>
        ) : provider.priceRange && provider.priceRange !== "Contact for pricing" ? (
          <div className="mt-3">
            <RegionalEstimateLabel
              priceRange={provider.priceRange}
              isRegionalEstimate={!!provider.isRegionalEstimate}
              isMetroAdjusted={!!provider.isMetroAdjusted}
            />
          </div>
        ) : provider.priceRange ? (
          <p className="text-sm font-bold text-gray-900 mt-3">{provider.priceRange}</p>
        ) : null)}

        {/* Candidate action: generic CTA (Schedule Interview / More details) */}
        {isCandidate && onCta && (
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCta(); }}
              className="inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm"
            >
              {ctaLabel ?? "Schedule interview"}
            </button>
          </div>
        )}

        {/* Candidate action: quick invite (legacy) */}
        {isCandidate && !onCta && onQuickInvite && (
          <div className="mt-3 flex items-center justify-end">
            {isInvited ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                Invited
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickInvite(); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
                Invite
              </button>
            )}
          </div>
        )}

        {/* Student action: request interview */}
        {isStudent && !isDemo && (
          <div className="mt-3">
            {isRequested ? (
              <span className="inline-flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-primary-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                Requested
              </span>
            ) : canRequest ? (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestInterview?.(); }}
                className="w-full px-4 py-2 text-sm font-semibold text-primary-600 rounded-lg ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50 transition-all"
              >
                {requestLabel}
              </button>
            ) : (
              // Anon: not a dead button — routes into the eligibility screener.
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestInterview?.(); }}
                className="w-full px-4 py-2 text-sm font-semibold text-primary-600 rounded-lg ring-1 ring-primary-200 hover:ring-primary-300 hover:bg-primary-50 transition-all"
              >
                Apply Now →
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  // Demo (sample) listings open a read-only sample detail page.
  if ((isStudent || isCandidate) && isDemo) {
    const demoHref = isCandidate
      ? `/medjobs/candidates/${provider.slug}`
      : `/medjobs/families/${provider.slug}`;
    return (
      <Link
        href={demoHref}
        target={isCandidate ? "_blank" : undefined}
        rel={isCandidate ? "noopener noreferrer" : undefined}
        className={`relative ${rootClass}`}
      >
        <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase bg-primary-100 text-primary-700 rounded-full">
          Demo
        </span>
        {cardBody}
      </Link>
    );
  }

  const linkHref = isCandidate
    ? href ?? `/medjobs/candidates/${provider.slug}`
    : isStudent
      ? `/provider/${provider.slug}?ctx=medjobs-student${campus ? `&campus=${encodeURIComponent(campus)}` : ""}`
      : `/provider/${provider.slug}`;

  return (
    <Link
      href={linkHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleCardClick}
      className={rootClass}
    >
      {cardBody}
    </Link>
  );
}
