"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProfileCategory } from "@/lib/types";

interface ProviderHeroGalleryProps {
  images: string[];
  providerName: string;
  category: ProfileCategory | null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const categoryLabels: Partial<Record<ProfileCategory, string>> = {
  home_care_agency: "Home Care",
  home_health_agency: "Home Health",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
};

export default function ProviderHeroGallery({ images, providerName, category }: ProviderHeroGalleryProps) {
  const categoryLabel = category ? categoryLabels[category] ?? null : null;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  // Filter out images that failed to load
  const validImages = images.filter((_, i) => !failedImages.has(i));

  // 0 valid images — gradient placeholder with avatar circle + hint
  if (validImages.length === 0) {
    return (
      <div className="w-full aspect-[3/2] rounded-none md:max-w-md md:rounded-2xl bg-gradient-to-br from-primary-100 via-primary-50 to-warm-50 flex flex-col items-center justify-center">
        <div className="w-20 h-20 rounded-full bg-white/80 flex items-center justify-center mb-3 shadow-sm">
          <span className="text-3xl font-bold text-primary-400">
            {getInitials(providerName)}
          </span>
        </div>
        {categoryLabel && (
          <span className="text-sm font-medium text-primary-400">{categoryLabel}</span>
        )}
        <span className="text-xs text-primary-300 mt-1">No photos yet</span>
      </div>
    );
  }

  const safeIndex = Math.min(currentIndex, validImages.length - 1);
  const goNext = () => setCurrentIndex((i) => (i + 1) % validImages.length);
  const goPrev = () => setCurrentIndex((i) => (i - 1 + validImages.length) % validImages.length);

  // 1+ images — fixed aspect ratio with navigation
  return (
    <div className="relative w-full aspect-[3/2] rounded-none md:max-w-md md:rounded-2xl overflow-hidden bg-gray-100">
      <Image
        key={validImages[safeIndex]}
        src={validImages[safeIndex]}
        alt={`${providerName} — photo ${safeIndex + 1}`}
        fill
        sizes="(max-width: 768px) 100vw, 448px"
        priority
        className="object-cover"
        onError={() => {
          const origIndex = images.indexOf(validImages[safeIndex]);
          setFailedImages((prev) => new Set(prev).add(origIndex));
        }}
      />
      {validImages.length > 1 && (
        <>
          {/* Left arrow */}
          {safeIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
              aria-label="Previous photo"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {/* Right arrow */}
          {safeIndex < validImages.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
              aria-label="Next photo"
            >
              <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {/* Photo count */}
          <span className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
            {safeIndex + 1}/{validImages.length}
          </span>
        </>
      )}
    </div>
  );
}
