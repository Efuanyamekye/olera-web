"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import type { CardImageType } from "@/lib/types/provider";
import PricingEducationBadge from "@/components/providers/PricingEducationBadge";
import RegionalEstimateLabel from "@/components/providers/RegionalEstimateLabel";
import { getPricingConfig } from "@/lib/pricing-config";

export interface StaffMember {
  name: string;
  position: string;
  bio: string;
  image: string;
}

export interface Provider {
  id: string;
  slug: string;
  name: string;
  image: string;
  imageType?: CardImageType;
  images?: string[]; // Multiple images for carousel
  address: string;
  rating: number;
  reviewCount?: number; // Number of reviews
  priceRange: string;
  primaryCategory: string; // Main category displayed prominently (e.g., "Assisted Living")
  careTypes: string[]; // Legacy field - kept for compatibility
  highlights: string[]; // What sets this provider apart (2-3 items)
  acceptedPayments?: string[]; // e.g., "Medicare", "Medicaid", "Private Pay"
  verified: boolean;
  // New optional fields for enhanced card
  badge?: string; // e.g., "Top Rated", "New", "Featured"
  staffImage?: string; // Optional staff/caregiver avatar (legacy, use staff instead)
  staff?: StaffMember; // Staff member info for overlay
  description?: string; // Short tagline or description
  isRegionalEstimate?: boolean; // True when priceRange is a regional estimate
  isMetroAdjusted?: boolean; // True when estimate uses metro-level adjustment
  providerCategory?: string; // Raw category for pricing tier logic
  // Detailed pricing breakdown
  pricingDetails?: {
    service: string; // e.g., "Assisted Living"
    rate: string; // e.g., "$3,500"
    rateType: string; // e.g., "per month"
  }[];
  // Staff screening & safety
  staffScreening?: string[];
  // Reviews
  reviews?: {
    name: string;
    rating: number;
    date: string;
    comment: string;
    relationship?: string;
  }[];
  lat?: number | null;
  lon?: number | null;
}

interface ProviderCardProps {
  provider: Provider;
}

// Map care types to colors for visual distinction
const careTypeColors: Record<string, string> = {
  "Assisted Living": "bg-primary-100 text-primary-700 border-primary-200",
  "Home Care": "bg-blue-100 text-blue-700 border-blue-200",
  "Memory Care": "bg-purple-100 text-purple-700 border-purple-200",
  "Independent Living": "bg-green-100 text-green-700 border-green-200",
  "Skilled Nursing": "bg-red-100 text-red-700 border-red-200",
  "Respite Care": "bg-warm-100 text-warm-700 border-warm-200",
  "Hospice": "bg-gray-100 text-gray-700 border-gray-200",
  "Companion Care": "bg-teal-100 text-teal-700 border-teal-200",
};

const getCareTypeColor = (type: string) => {
  return careTypeColors[type] || "bg-gray-100 text-gray-700 border-gray-200";
};

export default function ProviderCard({ provider }: ProviderCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [showPricingInfo, setShowPricingInfo] = useState(false);
  const [showStaffInfo, setShowStaffInfo] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { activeProfile, openAuth } = useAuth();
  const { isSaved: checkSaved, toggleSave } = useSavedProviders();
  const isSaved = checkSaved(provider.id);
  const displayedHighlights = provider.highlights?.slice(0, 3) || [];
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

  // Use images array if available, otherwise fall back to single image
  const images = provider.images && provider.images.length > 0
    ? provider.images
    : [provider.image];
  const hasMultipleImages = images.length > 1;

  // Get staff info (use new staff object or fall back to legacy staffImage)
  const staffImage = provider.staff?.image || provider.staffImage;
  const hasStaff = !!staffImage;

  const goToPrevious = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <Link
      href={`/provider/${provider.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col h-full bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-200"
    >
      {/* Image Container */}
      <div className={`relative h-64 group/image ${provider.imageType === "logo" || provider.imageType === "placeholder" || imgFailed ? "bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50" : "bg-gray-200"}`}>
        {provider.imageType === "placeholder" || imgFailed ? (
          /* No image — gradient + initials */
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
              <span className="text-2xl font-bold text-primary-400">
                {provider.name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
              </span>
            </div>
            <span className="text-xs font-medium text-primary-300 mt-2">{provider.primaryCategory}</span>
          </div>
        ) : provider.imageType === "logo" ? (
          /* Logo — contained, not cropped */
          <div className="w-full h-full flex items-center justify-center p-8">
            <img
              src={images[currentImageIndex]}
              alt={provider.name}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          /* Photo carousel */
          <div className="relative w-full h-full overflow-hidden">
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
            >
              {images.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt={`${provider.name} - Image ${index + 1}`}
                  className="w-full h-full object-cover flex-shrink-0"
                  onError={() => setImgFailed(true)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Staff Info Overlay - Shown when staff avatar is hovered */}
        {provider.staff && (
          <div className={`absolute inset-0 bg-gradient-to-b from-primary-700 to-primary-900 z-20 p-5 flex flex-col transition-opacity duration-300 ${showStaffInfo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="flex-1">
              <h4 className="text-white font-bold text-xl">{provider.staff.name}</h4>
              <p className="text-primary-200 text-sm font-medium mt-0.5">{provider.staff.position}</p>
              <p className="text-white/90 text-sm mt-3 leading-relaxed">{provider.staff.bio}</p>
            </div>
          </div>
        )}

        {/* Navigation Arrows - Only show on hover when multiple images and staff overlay not visible */}
        {hasMultipleImages && !showStaffInfo && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 hover:bg-white shadow-md z-20"
              aria-label="Previous image"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 hover:bg-white shadow-md z-10"
              aria-label="Next image"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Dot Indicators - Only show on hover when multiple images and staff overlay not visible */}
        {hasMultipleImages && !showStaffInfo && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 z-10">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCurrentImageIndex(index);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  index === currentImageIndex
                    ? 'bg-white w-2'
                    : 'bg-white/60 hover:bg-white/80'
                }`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}

        {/* Gradient overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

        {/* Top badges row */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
          {/* Badge pills hidden for now */}
          <div />

          {/* Heart/Save Button - Larger touch target with save state */}
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
            className={`w-9 h-9 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white shadow-sm transition-all duration-200 ${isSaved ? 'scale-110' : ''}`}
            aria-label={isSaved ? "Remove from saved" : "Save provider"}
          >
            <svg
              className={`w-6 h-6 transition-all duration-200 ${isSaved ? 'text-primary-600 fill-primary-600 scale-110' : 'text-gray-400 hover:text-primary-600'}`}
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
              className="absolute top-12 right-0 z-30 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-3 animate-in fade-in slide-in-from-top-1 duration-150"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <p className="text-sm text-gray-600 mb-2">
                Save providers with a family account.
              </p>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowTooltip(false);
                  openAuth({ defaultMode: "sign-up", intent: "family" });
                }}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
              >
                Create one →
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Use a different email than your {accountTypeLabel} account.
              </p>
            </div>
          )}
        </div>

        {/* Staff Avatar - Overlapping the image/content boundary, aligned with heart icon */}
        {hasStaff && (
          <div
            onMouseEnter={() => provider.staff && setShowStaffInfo(true)}
            onMouseLeave={() => setShowStaffInfo(false)}
            className={`absolute -bottom-8 right-4 z-30 ${provider.staff ? 'cursor-pointer' : 'cursor-default'}`}
            aria-label={provider.staff ? "View staff info" : "Staff member"}
          >
            <div className={`w-16 h-16 rounded-full border-4 shadow-lg overflow-hidden bg-gray-200 transition-all duration-200 ${showStaffInfo ? 'border-primary-500 ring-2 ring-primary-300' : 'border-white'} ${provider.staff ? 'hover:border-primary-300' : ''}`}>
              <img
                src={staffImage}
                alt={provider.staff?.name || "Staff member"}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        {/* Name + Rating */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 text-lg group-hover:text-primary-700 transition-colors line-clamp-2 flex-1 leading-snug">
            {provider.name}
          </h3>
          {provider.rating > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">{provider.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Category · Location */}
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {provider.primaryCategory}{provider.address ? ` · ${provider.address}` : ""}
        </p>

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
