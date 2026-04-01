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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface BrowseCardProps {
  provider: ProviderCardData;
}

export default function BrowseCard({ provider }: BrowseCardProps) {
  const { activeProfile, openAuth } = useAuth();
  const { isSaved: checkSaved, toggleSave } = useSavedProviders();
  const isSaved = checkSaved(provider.id);
  const [imgFailed, setImgFailed] = useState(false);
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

  const showAsLogo = provider.imageType === "logo" || imgFailed;
  const showPlaceholder = provider.imageType === "placeholder" || (imgFailed && !provider.image);

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

  return (
    <Link
      href={`/provider/${provider.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col h-full bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200"
    >
      {/* Image */}
      <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50">
        {showPlaceholder ? (
          /* No image — gradient + initials */
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
              <span className="text-2xl font-bold text-primary-400">{getInitials(provider.name)}</span>
            </div>
            <span className="text-xs font-medium text-primary-300 mt-2">{provider.primaryCategory}</span>
          </div>
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

        {/* Heart — top right */}
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
        {/* Name + Rating */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-sans font-semibold text-base text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-2 flex-1 leading-snug">
            {provider.name}
          </h3>
          {provider.rating > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">{provider.rating.toFixed(1)}</span>
              {provider.reviewCount && provider.reviewCount > 0 && (
                <span className="text-xs text-gray-500">({provider.reviewCount.toLocaleString()})</span>
              )}
              <span className="text-xs text-gray-400">on Google</span>
            </div>
          )}
        </div>

        {/* Category + Location */}
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {careTypeLabel}{provider.address ? ` · ${provider.address}` : ""}
        </p>

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

        {/* Price */}
        {provider.providerCategory && getPricingConfig(provider.providerCategory).tier === 3 && (!provider.priceRange || provider.priceRange === "Contact for pricing" || provider.isRegionalEstimate) ? (
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
        ) : null}
      </div>
    </Link>
  );
}
