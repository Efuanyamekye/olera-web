"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Provider } from "./ProviderCard";
import { FallbackImage } from "./FallbackImage";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders } from "@/hooks/use-saved-providers";
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

interface CompactProviderCardProps {
  provider: Provider;
}

export default function CompactProviderCard({ provider }: CompactProviderCardProps) {
  const { activeProfile, openAuth } = useAuth();
  const { isSaved: checkSaved, toggleSave } = useSavedProviders();
  const isSaved = checkSaved(provider.id);
  const displayedHighlights = provider.highlights?.slice(0, 3) || [];
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const heartButtonRef = useRef<HTMLButtonElement>(null);

  // Check if user is a non-family profile
  const isNonFamilyProfile = activeProfile && activeProfile.type !== "family";

  // Dynamic label for account type hint
  const accountTypeLabel = activeProfile?.type === "organization"
    ? "provider"
    : (activeProfile?.type === "caregiver" || activeProfile?.type === "student")
    ? "caregiver"
    : "current";

  // Close tooltip on click outside
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
      className="group flex flex-col bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image */}
      <div className="relative h-40 bg-gray-100">
        {provider.image ? (
          <FallbackImage
            src={provider.image}
            alt={provider.name}
            fallback={
              <div className="w-full h-full bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-primary-300">
                  {getInitials(provider.name)}
                </span>
                <span className="text-xs font-medium text-primary-300 mt-1">{provider.primaryCategory}</span>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-primary-300">
              {getInitials(provider.name)}
            </span>
            <span className="text-xs font-medium text-primary-300 mt-1">{provider.primaryCategory}</span>
          </div>
        )}

        {/* Heart/Save Button */}
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
          className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white flex items-center justify-center transition-colors shadow-sm"
          aria-label={isSaved ? "Remove from saved" : "Save provider"}
        >
          <svg
            className={`w-4 h-4 transition-colors ${isSaved ? "text-primary-600" : "text-gray-500"}`}
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
            className="absolute top-12 right-2 left-2 sm:left-auto z-20 sm:w-56 bg-gray-900 text-white rounded-xl shadow-lg p-3 animate-in fade-in slide-in-from-top-1 duration-150"
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
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col">
        {/* Name + Rating */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-primary-700 transition-colors line-clamp-1 flex-1">
            {provider.name}
          </h3>
          {provider.rating && provider.rating > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-xs font-semibold text-gray-900">{provider.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Category · Location */}
        <p className="text-xs text-gray-500 mt-1 line-clamp-1">
          {provider.primaryCategory}{provider.address ? ` · ${provider.address}` : ""}
        </p>

        {/* Highlights */}
        {displayedHighlights.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
            {displayedHighlights.map((h) => (
              <span key={h} className="flex items-center gap-1 text-xs text-gray-600">
                <svg className="w-3 h-3 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {h}
              </span>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1 min-h-1" />

        {/* Price */}
        {provider.providerCategory && getPricingConfig(provider.providerCategory).tier === 3 && (!provider.priceRange || provider.priceRange === "Contact for pricing" || provider.isRegionalEstimate) ? (
          <div className="mt-2"><PricingEducationBadge category={provider.providerCategory} compact /></div>
        ) : provider.priceRange && provider.priceRange !== "Contact for pricing" ? (
          <div className="mt-2">
            <RegionalEstimateLabel
              priceRange={provider.priceRange}
              isRegionalEstimate={!!provider.isRegionalEstimate}
              isMetroAdjusted={!!provider.isMetroAdjusted}
            />
          </div>
        ) : provider.priceRange ? (
          <p className="text-sm font-bold text-gray-900 mt-2">{provider.priceRange}</p>
        ) : null}
      </div>
    </Link>
  );
}
