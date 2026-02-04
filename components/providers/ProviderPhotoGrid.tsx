"use client";

import { useState } from "react";
import ImageGallery from "./ImageGallery";

interface ProviderPhotoGridProps {
  images: string[];
  alt: string;
}

export default function ProviderPhotoGrid({ images, alt }: ProviderPhotoGridProps) {
  const [showAll, setShowAll] = useState(false);

  if (images.length === 0) return null;

  // Mobile: always use carousel
  // Desktop: adaptive grid based on image count
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
      {/* Mobile: carousel */}
      <div className="block md:hidden relative rounded-2xl overflow-hidden h-64">
        <ImageGallery images={images} alt={alt} />
      </div>

      {/* Desktop: adaptive grid */}
      <div className="hidden md:block">
        {images.length === 1 && (
          <div className="relative rounded-2xl overflow-hidden h-80 lg:h-96">
            <img
              src={images[0]}
              alt={alt}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {images.length >= 2 && images.length <= 4 && (
          <div className="grid grid-cols-3 gap-2 rounded-2xl overflow-hidden h-80">
            <div className="col-span-2 relative">
              <img
                src={images[0]}
                alt={`${alt} - Image 1`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="grid grid-rows-2 gap-2">
              {images.slice(1, 3).map((img, index) => (
                <div key={index} className="relative overflow-hidden">
                  <img
                    src={img}
                    alt={`${alt} - Image ${index + 2}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {images.length < 3 && (
                <div className="bg-gray-100" />
              )}
            </div>
          </div>
        )}

        {images.length >= 5 && (
          <div className="relative">
            <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-2xl overflow-hidden h-96">
              <div className="col-span-2 row-span-2 relative">
                <img
                  src={images[0]}
                  alt={`${alt} - Image 1`}
                  className="w-full h-full object-cover"
                />
              </div>
              {images.slice(1, 5).map((img, index) => (
                <div key={index} className="relative overflow-hidden">
                  <img
                    src={img}
                    alt={`${alt} - Image ${index + 2}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
            {images.length > 5 && (
              <button
                onClick={() => setShowAll(true)}
                className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm text-gray-900 px-4 py-2 rounded-lg text-sm font-medium shadow-sm border border-gray-200 hover:bg-white transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Show all {images.length} photos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Full gallery modal */}
      {showAll && (
        <div className="fixed inset-0 z-50 bg-black/90 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white text-lg font-semibold">
                All photos ({images.length})
              </h2>
              <button
                onClick={() => setShowAll(false)}
                className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Close gallery"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {images.map((img, index) => (
                <div key={index} className="rounded-xl overflow-hidden">
                  <img
                    src={img}
                    alt={`${alt} - Image ${index + 1}`}
                    className="w-full h-auto object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
