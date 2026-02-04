"use client";

import { useState } from "react";

interface ImageCarouselProps {
  images: string[];
  alt: string;
  className?: string;
}

export default function ImageCarousel({ images, alt, className }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) return null;

  const prev = () => setCurrent((c) => (c === 0 ? images.length - 1 : c - 1));
  const next = () => setCurrent((c) => (c === images.length - 1 ? 0 : c + 1));

  return (
    <div className={`group/carousel relative rounded-lg overflow-hidden bg-gray-100 ${className || "h-[400px]"}`}>
      <img
        src={images[current]}
        alt={`${alt} - Image ${current + 1}`}
        className="w-full h-full object-cover"
      />

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-gray-200 flex items-center justify-center hover:bg-white opacity-0 group-hover/carousel:opacity-100 transition-all duration-200"
            aria-label="Previous image"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-gray-200 flex items-center justify-center hover:bg-white opacity-0 group-hover/carousel:opacity-100 transition-all duration-200"
            aria-label="Next image"
          >
            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className="absolute bottom-[35px] left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 group-hover/carousel:opacity-100 transition-all duration-200">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === current ? "bg-white" : "bg-white/50"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Show all photos button */}
      {images.length > 1 && (
        <button
          className="absolute bottom-5 right-5 bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-medium shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="13" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="13" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
            <circle cx="13" cy="13" r="1.5" />
          </svg>
          Show all {images.length} photos
        </button>
      )}
    </div>
  );
}
