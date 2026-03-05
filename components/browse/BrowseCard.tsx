"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSavedProviders } from "@/hooks/use-saved-providers";
import { type ProviderCardData, getCategoryDisplayName } from "@/lib/types/provider";

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
  const { isSaved: checkSaved, toggleSave } = useSavedProviders();
  const isSaved = checkSaved(provider.id);
  const [imgFailed, setImgFailed] = useState(false);
  const showAsLogo = provider.imageType === "logo" || imgFailed;
  const showPlaceholder = provider.imageType === "placeholder" || (imgFailed && !provider.image);

  const careTypeLabel = getCategoryDisplayName(provider.careTypes[0]) || provider.primaryCategory;
  const displayedHighlights = provider.highlights?.slice(0, 3) || [];

  return (
    <Link
      href={`/provider/${provider.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200"
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
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
          <h3 className="font-display font-semibold text-base text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-2 flex-1 leading-snug">
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

        {/* Category + Location */}
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {careTypeLabel} · {provider.address}
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
        <p className="text-sm font-bold text-gray-900 mt-3">{provider.priceRange}</p>
      </div>
    </Link>
  );
}
