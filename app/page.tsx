"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useCitySearch } from "@/hooks/use-city-search";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ProviderCard from "@/components/providers/ProviderCard";
import { topProviders, providersByCategory } from "@/lib/mock-providers";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  type Provider as IOSProvider,
  type ProviderCardData,
  PROVIDERS_TABLE,
  toCardFormat,
  mockToCardFormat,
} from "@/lib/types/provider";

// Hook to detect when element is in view
function useInView(threshold: number = 0.3) {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold]);

  return { isInView, ref };
}

// Hook to animate multiple counters together
function useAnimatedCounters(
  targets: { end: number; duration?: number }[],
  shouldStart: boolean
) {
  const [counts, setCounts] = useState<number[]>(targets.map(() => 0));
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (!shouldStart || hasAnimatedRef.current) return;

    hasAnimatedRef.current = true;
    let startTime: number | null = null;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;

      const newCounts = targets.map((target) => {
        const duration = target.duration || 2000;
        const progress = Math.min((currentTime - startTime!) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        return Math.floor(easeOut * target.end);
      });

      setCounts(newCounts);

      // Continue if any animation isn't complete
      const allComplete = targets.every((target, i) => {
        const duration = target.duration || 2000;
        const progress = (currentTime - startTime!) / duration;
        return progress >= 1;
      });

      if (!allComplete) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [shouldStart, targets]);

  return counts;
}

// Care categories for the browse section
const careCategories = [
  {
    id: "home-care",
    name: "Home Care",
    iconPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    id: "home-health",
    name: "Home Health",
    iconPath: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
  {
    id: "assisted-living",
    name: "Assisted Living",
    iconPath: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  },
  {
    id: "memory-care",
    name: "Memory Care",
    iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    id: "independent-living",
    name: "Independent Living",
    iconPath: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  },
  {
    id: "nursing-home",
    name: "Nursing Home",
    iconPath: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  },
];

// Care type options for search dropdown
const careTypeOptions = [
  { value: "home-health", label: "Home Health" },
  { value: "home-care", label: "Home Care" },
  { value: "assisted-living", label: "Assisted Living" },
  { value: "nursing-home", label: "Nursing Home" },
  { value: "memory-care", label: "Memory Care" },
  { value: "independent-living", label: "Independent Living" },
];

// Location suggestions moved to useCitySearch hook for comprehensive US city search

// Scrolling tags data
const scrollingTags = {
  row1: [
    "Memory Care Specialists",
    "24/7 Nursing Staff",
    "Pet-Friendly Communities",
    "Veteran Discounts",
    "Dementia Support",
    "Spanish-Speaking Staff",
    "Physical Therapy On-Site",
    "Chef-Prepared Meals",
  ],
  row2: [
    "In-Home Care",
    "Art & Music Therapy",
    "Transportation Services",
    "Medication Management",
    "Garden & Outdoor Spaces",
    "24/7 Family Support",
    "Assisted Bathing",
    "Personalized Care Plans",
  ],
};

// Counter targets - defined outside component to avoid re-creating on every render
const counterTargets = [
  { end: 48000, duration: 2000 },
  { end: 12000, duration: 2000 },
  { end: 500, duration: 1500 },
];

// Social Proof Section Component
function SocialProofSection() {
  // Single ref to trigger all counters when section is in view
  const { isInView, ref } = useInView(0.3);

  // All counters animate together
  const [providersCount, familiesCount, citiesCount] = useAnimatedCounters(
    counterTargets,
    isInView
  );

  return (
    <section className="pt-8 md:pt-12 pb-8 md:pb-12 relative overflow-hidden">
      {/* Section Header */}
      <div className="text-center mb-6 relative">
        <p className="text-primary-600 font-semibold text-sm uppercase tracking-wider mb-2">Trusted nationwide</p>
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
          Helping families find care
        </h2>
      </div>

      {/* ========== Enhanced Connected Journey — Premium Stats Section ========== */}
      <div ref={ref} className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Flowing connection line with enhanced animation */}
          <svg className="absolute top-1/2 left-0 w-full h-32 -translate-y-1/2 hidden md:block" preserveAspectRatio="none" viewBox="0 0 800 100">
            <defs>
              {/* Gradient for the main line */}
              <linearGradient id="lineGradientEnhanced" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(25, 144, 135)" stopOpacity="0.6" />
                <stop offset="50%" stopColor="rgb(194, 120, 86)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="rgb(25, 144, 135)" stopOpacity="0.6" />
              </linearGradient>
              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              {/* Animated gradient for traveling dot */}
              <radialGradient id="dotGradient">
                <stop offset="0%" stopColor="rgb(25, 144, 135)" stopOpacity="1" />
                <stop offset="100%" stopColor="rgb(25, 144, 135)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Shadow/glow line underneath */}
            <path
              d="M 60 50 Q 200 15, 400 50 T 740 50"
              stroke="url(#lineGradientEnhanced)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              opacity="0.3"
              filter="url(#glow)"
            />

            {/* Main flowing line */}
            <path
              d="M 60 50 Q 200 15, 400 50 T 740 50"
              stroke="url(#lineGradientEnhanced)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="8 4"
              className="animate-pulse"
            />

            {/* Multiple animated dots traveling along the path */}
            <circle r="6" fill="rgb(25, 144, 135)" filter="url(#glow)">
              <animateMotion dur="3s" repeatCount="indefinite" path="M 60 50 Q 200 15, 400 50 T 740 50" />
            </circle>
            <circle r="4" fill="rgb(194, 120, 86)" filter="url(#glow)">
              <animateMotion dur="3s" repeatCount="indefinite" begin="1s" path="M 60 50 Q 200 15, 400 50 T 740 50" />
            </circle>
            <circle r="5" fill="rgb(25, 144, 135)" filter="url(#glow)">
              <animateMotion dur="3s" repeatCount="indefinite" begin="2s" path="M 60 50 Q 200 15, 400 50 T 740 50" />
            </circle>
          </svg>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative z-10">
            {/* Stat 1 — Providers */}
            <div className="group text-center">
              <div className="relative inline-block mb-6">
                {/* Outer pulsing ring */}
                <div className="absolute inset-0 w-36 h-36 -m-4 rounded-full bg-gradient-to-br from-primary-400/20 to-transparent animate-ping opacity-20" style={{ animationDuration: '3s' }} />

                {/* Main circle container */}
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary-100 to-white flex items-center justify-center shadow-xl shadow-primary-500/20 group-hover:shadow-2xl group-hover:shadow-primary-500/30 transition-all duration-700 group-hover:scale-110">
                  {/* Inner decorative ring */}
                  <div className="absolute inset-2 rounded-full border-2 border-dashed border-primary-200/50 animate-spin" style={{ animationDuration: '20s' }} />

                  {/* Icon container */}
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg transform group-hover:rotate-12 transition-transform duration-500">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                </div>

                {/* Step badge */}
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-primary-500/40 border-4 border-white">
                  1
                </div>
              </div>

              <p className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight tabular-nums mb-2 group-hover:text-primary-700 transition-colors duration-300">
                {providersCount.toLocaleString()}+
              </p>
              <p className="text-gray-700 font-semibold text-lg">Providers Listed</p>
            </div>

            {/* Stat 2 — Families (Center, emphasized) */}
            <div className="group text-center md:mt-6">
              <div className="relative inline-block mb-6">
                {/* Outer pulsing ring */}
                <div className="absolute inset-0 w-44 h-44 -m-5 rounded-full bg-gradient-to-br from-warm-400/25 to-transparent animate-ping opacity-25" style={{ animationDuration: '2.5s' }} />

                {/* Secondary glow ring */}
                <div className="absolute inset-0 w-40 h-40 -m-3 rounded-full border-2 border-warm-300/30 animate-pulse" />

                {/* Main circle container - larger for emphasis */}
                <div className="relative w-34 h-34 rounded-full bg-gradient-to-br from-warm-100 via-white to-warm-50 flex items-center justify-center shadow-2xl shadow-warm-500/25 group-hover:shadow-3xl group-hover:shadow-warm-500/40 transition-all duration-700 group-hover:scale-110" style={{ width: '136px', height: '136px' }}>
                  {/* Inner decorative ring */}
                  <div className="absolute inset-3 rounded-full border-2 border-dashed border-warm-200/50 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />

                  {/* Floating hearts decoration */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 text-warm-400 animate-bounce" style={{ animationDuration: '2s' }}>
                    <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  </div>
                  <div className="absolute -top-2 right-2 w-3 h-3 text-warm-300 animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }}>
                    <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  </div>

                  {/* Icon container */}
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-warm-400 via-warm-500 to-warm-600 flex items-center justify-center shadow-xl transform group-hover:rotate-6 group-hover:scale-105 transition-all duration-500">
                    <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                </div>

                {/* Step badge */}
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-warm-500 to-warm-700 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-warm-500/40 border-4 border-white">
                  2
                </div>
              </div>

              <p className="text-5xl md:text-6xl font-bold text-gray-900 tracking-tight tabular-nums mb-2 group-hover:text-warm-600 transition-colors duration-300">
                {familiesCount.toLocaleString()}+
              </p>
              <p className="text-gray-700 font-semibold text-xl">Families Connected</p>
            </div>

            {/* Stat 3 — Cities */}
            <div className="group text-center">
              <div className="relative inline-block mb-6">
                {/* Outer pulsing ring */}
                <div className="absolute inset-0 w-36 h-36 -m-4 rounded-full bg-gradient-to-br from-primary-500/20 to-transparent animate-ping opacity-20" style={{ animationDuration: '3.5s' }} />

                {/* Main circle container */}
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary-100 to-white flex items-center justify-center shadow-xl shadow-primary-600/20 group-hover:shadow-2xl group-hover:shadow-primary-600/30 transition-all duration-700 group-hover:scale-110">
                  {/* Inner decorative ring */}
                  <div className="absolute inset-2 rounded-full border-2 border-dashed border-primary-200/50 animate-spin" style={{ animationDuration: '25s' }} />

                  {/* Decorative dots representing cities */}
                  <div className="absolute top-0 left-1/2 w-2 h-2 bg-primary-400 rounded-full -translate-x-1/2 -translate-y-1" />
                  <div className="absolute bottom-1 right-2 w-1.5 h-1.5 bg-primary-300 rounded-full" />
                  <div className="absolute top-4 left-1 w-1.5 h-1.5 bg-primary-300 rounded-full" />

                  {/* Icon container */}
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-lg transform group-hover:-rotate-12 transition-transform duration-500">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </div>

                {/* Step badge */}
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br from-primary-600 to-primary-800 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-primary-600/40 border-4 border-white">
                  3
                </div>
              </div>

              <p className="text-4xl md:text-5xl font-bold text-primary-600 tracking-tight tabular-nums mb-2 group-hover:text-primary-700 transition-colors duration-300">
                {citiesCount.toLocaleString()}+
              </p>
              <p className="text-gray-700 font-semibold text-lg">Cities Covered</p>
            </div>
          </div>
        </div>

      {/* Video Card */}
      <div className="mt-6 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative bg-gradient-to-br from-warm-50 to-warm-100/50 rounded-3xl overflow-hidden border border-warm-200/50">
          <div className="relative flex items-center justify-center p-8 md:p-12 lg:p-16">
            <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 w-full max-w-6xl">
              {/* Left side - Text content */}
              <div className="flex flex-col lg:w-[40%]">
                {/* Chapter badge */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="inline-flex items-center gap-1.5 bg-primary-500/10 border border-primary-500/20 text-primary-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Chapter 1
                  </span>
                  <span className="text-warm-600 text-sm">Documentary Series</span>
                </div>

                <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-4">
                  Aging in America
                </h3>

                <p className="text-gray-600 text-base mb-8 max-w-sm leading-relaxed">
                  Explore the realities of senior care in America and discover how families navigate finding the right care.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center items-start gap-4">
                  <Link
                    href="/browse"
                    className="group inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-all duration-300"
                  >
                    Start Your Search
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  <Link
                    href="https://youtube.com/@olera"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                  >
                    Watch more chapters
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Right side - YouTube Video */}
              <div className="lg:w-[60%]">
                <div className="relative w-full">
                  {/* Video container */}
                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black">
                    <iframe
                      src="https://www.youtube.com/embed/TiVrqkrYhEc"
                      title="Aging in America - Chapter 1"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Bento Grid Data - Senior care focused images (2 rows, 4 columns)
const bentoCards = [
  {
    id: 1,
    title: "Memory Care",
    image: "https://images.unsplash.com/photo-1442458370899-ae20e367c5d8?w=800&q=80", // grandmother with family
    href: "/browse?type=memory-care",
    className: "col-span-1 row-span-2", // tall left
  },
  {
    id: 2,
    title: "Home Care",
    image: "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800&q=80", // caregiver and senior
    href: "/browse?type=home-care",
    className: "col-span-2 row-span-1", // wide top middle
  },
  {
    id: 3,
    title: "Assisted Living",
    image: "https://images.unsplash.com/photo-1505455184862-554165e5f6ba?w=800&q=80", // happy seniors
    href: "/browse?type=assisted-living",
    className: "col-span-1 row-span-2", // tall right
  },
  {
    id: 4,
    title: "Skilled Nursing",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80", // nurse caring
    href: "/browse?type=skilled-nursing",
    className: "col-span-1 row-span-1", // square bottom left-middle
  },
  {
    id: 5,
    title: "Hospice Care",
    image: "https://images.unsplash.com/photo-1559234938-b60fff04894d?w=800&q=80", // caring hands
    href: "/browse?type=hospice",
    className: "col-span-1 row-span-1", // square bottom right-middle
  },
];

// Bento Grid Section Component
function BentoGridSection() {
  return (
    <section className="pt-8 md:pt-12 pb-8 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Explore Care Options
          </h2>
        </div>

        {/* Bento Grid - 2 rows, 4 columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 auto-rows-[180px] md:auto-rows-[200px]">
          {bentoCards.map((card, index) => (
            <Link
              key={card.id}
              href={card.href}
              className={`relative overflow-hidden rounded-3xl group cursor-pointer ${card.className}`}
              style={{
                boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1), 0 2px 8px -2px rgba(0,0,0,0.06)',
              }}
            >
              {/* Image layer */}
              <div className="absolute inset-0">
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  className="object-cover transition-all duration-700 ease-out group-hover:scale-110"
                />
              </div>

              {/* Gradient overlays - creates depth */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5 transition-opacity duration-500" />
              <div className="absolute inset-0 bg-gradient-to-br from-primary-600/0 via-transparent to-warm-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Shine effect on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              </div>

              {/* Top badge - category indicator */}
              <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                <span className="inline-flex items-center gap-2 bg-white text-gray-900 text-xs font-semibold px-3 py-2 rounded-full shadow-lg">
                  <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                  Browse {card.title}
                </span>
              </div>

              {/* Bottom content */}
              <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                <div className="flex items-end justify-between gap-3">
                  {/* Title with animated underline */}
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg md:text-xl lg:text-2xl leading-tight tracking-tight">
                      {card.title}
                    </h3>
                    <div className="h-0.5 bg-primary-400 mt-2 w-0 group-hover:w-full transition-all duration-500 ease-out rounded-full" />
                  </div>

                  {/* Arrow button */}
                  <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:bg-primary-500 group-hover:border-primary-500 transition-all duration-300 group-hover:scale-110">
                    <svg
                      className="w-5 h-5 md:w-6 md:h-6 text-white transition-transform duration-300 group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-primary-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Ring on hover */}
              <div className="absolute inset-0 rounded-3xl ring-2 ring-white/0 group-hover:ring-white/30 transition-all duration-300" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Map UI category IDs to iOS Supabase provider_category values
const categoryToProviderCategory: Record<string, string> = {
  "home-care": "Home Care (Non-medical)",
  "home-health": "Home Health Care",
  "assisted-living": "Assisted Living",
  "memory-care": "Memory Care",
  "independent-living": "Independent Living",
  "nursing-home": "Nursing Home",
};

// Browse by Care Type Section Component
function BrowseByCareTypeSection() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>("home-care");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [categoryProviders, setCategoryProviders] = useState<ProviderCardData[]>([]);
  const [isLoadingCategory, setIsLoadingCategory] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const updateScrollState = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // Reset scroll to start when category changes
      container.scrollTo({ left: 0, behavior: "instant" });
      // Small delay to let DOM update before checking scroll state
      setTimeout(() => {
        updateScrollState();
      }, 50);
      container.addEventListener("scroll", updateScrollState);
      window.addEventListener("resize", updateScrollState);
      return () => {
        container.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
      };
    }
  }, [updateScrollState, selectedCategory]);

  const scrollLeft = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const newScrollLeft = Math.max(0, container.scrollLeft - 400);
      container.scrollTo({ left: newScrollLeft, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const maxScroll = container.scrollWidth - container.clientWidth;
      const newScrollLeft = Math.min(maxScroll, container.scrollLeft + 400);
      container.scrollTo({ left: newScrollLeft, behavior: "smooth" });
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    if (selectedCategory === categoryId) return;
    setSelectedCategory(categoryId);
    // Reset scroll position when changing category
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: "instant" });
    }
  };

  // Fetch providers for selected category from iOS Supabase
  useEffect(() => {
    async function fetchCategoryProviders() {
      if (!selectedCategory) {
        setCategoryProviders([]);
        setIsLoadingCategory(false);
        return;
      }

      setIsLoadingCategory(true);
      const providerCategory = categoryToProviderCategory[selectedCategory];

      if (!isSupabaseConfigured() || !providerCategory) {
        // Fall back to mock data
        const mockProviders = providersByCategory[selectedCategory] || [];
        setCategoryProviders(mockProviders.map(mockToCardFormat));
        setIsLoadingCategory(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from(PROVIDERS_TABLE)
          .select("*")
          .eq("deleted", false)
          .ilike("provider_category", `%${providerCategory}%`)
          .not("provider_images", "is", null)
          .order("google_rating", { ascending: false, nullsFirst: false })
          .limit(8);

        if (error || !data || data.length === 0) {
          // Fall back to mock data
          const mockProviders = providersByCategory[selectedCategory] || [];
          setCategoryProviders(mockProviders.map(mockToCardFormat));
        } else {
          setCategoryProviders((data as IOSProvider[]).map(toCardFormat));
        }
      } catch (err) {
        console.error("Error fetching category providers:", err);
        // Fall back to mock data
        const mockProviders = providersByCategory[selectedCategory] || [];
        setCategoryProviders(mockProviders.map(mockToCardFormat));
      } finally {
        setIsLoadingCategory(false);
      }
    }

    fetchCategoryProviders();
  }, [selectedCategory]);

  return (
    <section className="pt-8 md:pt-12 pb-6 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Browse by care type
          </h2>
        </div>

        {/* Category Tabs - Equal width grid layout */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          {careCategories.map((category) => {
            const isSelected = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`rounded-xl border transition-all duration-200 px-3 py-3 flex items-center justify-center gap-2 ${
                  isSelected
                    ? "border-primary-500 bg-primary-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors duration-200 ${
                    isSelected
                      ? "bg-primary-100"
                      : "bg-primary-50"
                  }`}
                >
                  <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={category.iconPath} />
                  </svg>
                </div>
                {/* Category Name */}
                <span className={`font-medium text-sm transition-colors duration-200 ${
                  isSelected
                    ? "text-primary-700"
                    : "text-gray-700"
                }`}>
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Provider Cards - Horizontal Scroll */}
        <div className="pt-8">
            {/* Horizontal Scroll Container with Arrows */}
            <div className="relative overflow-visible">
              {/* Left Arrow */}
              <button
                onClick={scrollLeft}
                disabled={!canScrollLeft}
                className={`hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl border border-gray-200 items-center justify-center transition-all ${
                  canScrollLeft
                    ? "hover:bg-gray-50 hover:shadow-2xl hover:scale-105 cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                }`}
                aria-label="Scroll left"
              >
                <svg className={`w-6 h-6 ${canScrollLeft ? "text-gray-700" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Right Arrow */}
              <button
                onClick={scrollRight}
                disabled={!canScrollRight}
                className={`hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl border border-gray-200 items-center justify-center transition-all ${
                  canScrollRight
                    ? "hover:bg-gray-50 hover:shadow-2xl hover:scale-105 cursor-pointer"
                    : "opacity-50 cursor-not-allowed"
                }`}
                aria-label="Scroll right"
              >
                <svg className={`w-6 h-6 ${canScrollRight ? "text-gray-700" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Scrollable Container */}
              <div
                ref={scrollContainerRef}
                className="flex gap-5 overflow-x-scroll pb-4 scrollbar-hide"
              >
                {isLoadingCategory ? (
                  // Loading skeleton
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[370px] h-[512px] bg-gray-100 rounded-2xl animate-pulse" />
                  ))
                ) : (
                  categoryProviders.slice(0, 6).map((provider) => (
                    <div key={provider.id} className="flex-shrink-0 w-[370px] h-[512px]">
                      <ProviderCard provider={provider} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* View All Link */}
            <div className="mt-4 text-center">
              <Link
                href={`/browse?type=${selectedCategory}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white shadow-sm shadow-primary-600/20 hover:shadow-md hover:shadow-primary-600/30 transition-all"
              >
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
        </div>
      </div>
    </section>
  );
}

// US state abbreviation mapping
const stateAbbreviations: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

export default function HomePage() {
  const [location, setLocation] = useState("");
  const [careType, setCareType] = useState("home-health");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCareTypeDropdown, setShowCareTypeDropdown] = useState(false);
  const [isGeolocating, setIsGeolocating] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [featuredProviders, setFeaturedProviders] = useState<ProviderCardData[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const router = useRouter();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const careTypeDropdownRef = useRef<HTMLDivElement>(null);

  // Geolocation function
  const detectLocation = () => {
    if (!navigator.geolocation) return;

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&countrycodes=us`
          );
          const data = await response.json();

          const country = data.address?.country_code?.toUpperCase();
          if (country !== "US") {
            setIsGeolocating(false);
            return;
          }

          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            "Unknown";
          const stateName = data.address?.state || "";
          const stateAbbr =
            stateAbbreviations[stateName] || stateName.substring(0, 2).toUpperCase();
          const locationString = `${city}, ${stateAbbr}`;
          setLocation(locationString);
        } catch {
          // Silently fail
        }
        setIsGeolocating(false);
      },
      () => {
        setIsGeolocating(false);
      }
    );
  };

  // City search with progressive loading (18K+ US cities, ZIP codes, states)
  const { results: cityResults, preload: preloadCities } = useCitySearch(location);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(e.target as Node)
      ) {
        setShowLocationDropdown(false);
      }
      if (
        careTypeDropdownRef.current &&
        !careTypeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCareTypeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch featured providers from iOS Supabase
  useEffect(() => {
    async function fetchFeaturedProviders() {
      if (!isSupabaseConfigured()) {
        // Fall back to mock data if Supabase not configured
        setFeaturedProviders(topProviders.map(mockToCardFormat));
        setIsLoadingProviders(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from(PROVIDERS_TABLE)
          .select("*")
          .eq("deleted", false)
          .not("google_rating", "is", null)
          .gte("google_rating", 4.0)
          .not("provider_images", "is", null)
          .order("google_rating", { ascending: false })
          .limit(8);

        if (error || !data || data.length === 0) {
          // Fall back to mock data
          setFeaturedProviders(topProviders.map(mockToCardFormat));
        } else {
          // Convert iOS providers to card format
          setFeaturedProviders((data as IOSProvider[]).map(toCardFormat));
        }
      } catch (err) {
        console.error("Error fetching providers:", err);
        // Fall back to mock data
        setFeaturedProviders(topProviders.map(mockToCardFormat));
      } finally {
        setIsLoadingProviders(false);
      }
    }

    fetchFeaturedProviders();
  }, []);

  const updateScrollState = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10); // 10px threshold
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      updateScrollState();
      container.addEventListener("scroll", updateScrollState);
      window.addEventListener("resize", updateScrollState);
      return () => {
        container.removeEventListener("scroll", updateScrollState);
        window.removeEventListener("resize", updateScrollState);
      };
    }
  }, [updateScrollState]);

  const scrollLeft_handler = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const newScrollLeft = Math.max(0, container.scrollLeft - 400);
      container.scrollTo({ left: newScrollLeft, behavior: "smooth" });
    }
  };

  const scrollRight_handler = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const maxScroll = container.scrollWidth - container.clientWidth;
      const newScrollLeft = Math.min(maxScroll, container.scrollLeft + 400);
      container.scrollTo({ left: newScrollLeft, behavior: "smooth" });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location.trim()) {
      params.set("location", location.trim());
    }
    if (careType) {
      params.set("type", careType);
    }
    router.push(`/browse?${params.toString()}`);
  };

  return (
    <div className="bg-gray-50">
      {/* Hero Section - Full Image Background */}
      <section className="pt-4 pb-8">
        <div className="mx-4 sm:mx-6 lg:mx-8">
          <div className="relative rounded-[2rem] min-h-[75vh] flex items-center px-8 md:px-16 lg:px-20 py-16 md:py-20">
            {/* Background Image Container - overflow hidden only for bg */}
            <div className="absolute inset-0 rounded-[2rem] overflow-hidden">
              <img
                src="/hero.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Warm gradient overlay for readability */}
              <div className="absolute inset-0 bg-gradient-to-r from-warm-950/85 via-warm-900/70 to-warm-900/40" />
              <div className="absolute inset-0 bg-gradient-to-t from-warm-950/50 via-transparent to-warm-900/20" />
            </div>

            {/* Content */}
            <div className="relative z-10 max-w-7xl mx-auto w-full flex flex-col items-center text-center">
              {/* Social Proof Pill */}
              <div className="inline-flex items-center gap-2.5 bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2 rounded-full text-sm font-medium text-white mb-6">
                <span className="flex items-center justify-center w-5 h-5 bg-primary-500 rounded-full">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </span>
                <span>48,000+ care providers</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[80px] font-bold leading-tight text-white">
                Find the right care
                <br />
                <span className="text-primary-200">for your loved one</span>
              </h1>

              {/* Search Bar */}
              <div className="mt-8 w-full max-w-3xl">
                <form onSubmit={handleSearch}>
                  <div className="bg-white/95 backdrop-blur-sm shadow-2xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl">
                    {/* Location Input with Dropdown */}
                    <div className="relative flex-1" ref={locationDropdownRef}>
                      <div
                        className={`flex items-center px-4 py-3 bg-gray-50 rounded-xl border transition-colors cursor-text ${
                          showLocationDropdown ? "border-primary-400 ring-2 ring-primary-100" : "border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => {
                          setShowLocationDropdown(true);
                          locationInputRef.current?.focus();
                        }}
                      >
                        <svg
                          className="w-5 h-5 text-gray-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <input
                          ref={locationInputRef}
                          type="text"
                          value={location}
                          onChange={(e) => {
                            setLocation(e.target.value);
                            setShowLocationDropdown(true);
                          }}
                          onFocus={() => {
                            setShowLocationDropdown(true);
                            preloadCities(); // Preload full city data on focus
                          }}
                          placeholder="City or ZIP code"
                          className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 text-base"
                        />
                      </div>

                      {/* Location Dropdown */}
                      {showLocationDropdown && (
                        <div className="absolute left-0 top-[calc(100%+8px)] w-full bg-white rounded-xl shadow-xl border border-gray-200 py-3 z-50 max-h-[340px] overflow-y-auto">
                          {/* Use Current Location - Prominent Button */}
                          <div className="px-3 pb-3">
                            <button
                              type="button"
                              onClick={() => {
                                detectLocation();
                                setShowLocationDropdown(false);
                              }}
                              disabled={isGeolocating}
                              className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg text-primary-700 font-medium transition-colors disabled:opacity-60"
                            >
                              {isGeolocating ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
                                </svg>
                              )}
                              <span>{isGeolocating ? "Detecting location..." : "Use my current location"}</span>
                            </button>
                          </div>

                          {/* Divider with "or" */}
                          <div className="flex items-center gap-3 px-4 py-1">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400 font-medium">or search</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>

                          {/* Popular Cities Label */}
                          {!location.trim() && cityResults.length > 0 && (
                            <div className="px-4 pt-2 pb-1">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Popular cities</span>
                            </div>
                          )}

                          {cityResults.length > 0 ? (
                            cityResults.map((loc) => (
                              <button
                                key={loc.full}
                                type="button"
                                onClick={() => {
                                  setLocation(loc.full);
                                  setShowLocationDropdown(false);
                                }}
                                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                                  location === loc.full ? "bg-primary-50 text-primary-700" : "text-gray-900"
                                }`}
                              >
                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="font-medium">{loc.full}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                              No locations found
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Care Type Dropdown */}
                    <div className="relative flex-1" ref={careTypeDropdownRef}>
                      <div
                        className={`flex items-center px-4 py-3 bg-gray-50 rounded-xl border transition-colors cursor-pointer ${
                          showCareTypeDropdown ? "border-primary-400 ring-2 ring-primary-100" : "border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => setShowCareTypeDropdown(!showCareTypeDropdown)}
                      >
                        <svg
                          className="w-5 h-5 text-gray-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                        <span className="flex-1 ml-3 text-base text-left text-gray-900">
                          {careTypeOptions.find(opt => opt.value === careType)?.label}
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showCareTypeDropdown ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {/* Care Type Dropdown Menu */}
                      {showCareTypeDropdown && (
                        <div className="absolute left-0 top-[calc(100%+8px)] w-full bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50">
                          {careTypeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setCareType(option.value);
                                setShowCareTypeDropdown(false);
                              }}
                              className={`flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                                careType === option.value ? "bg-primary-50 text-primary-700" : "text-gray-900"
                              }`}
                            >
                              <span className="font-medium">{option.label}</span>
                              {careType === option.value && (
                                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Search Button */}
                    <button
                      type="submit"
                      className="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base px-6 py-3 rounded-xl shadow-lg shadow-primary-600/25 transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>Search</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top Providers Section */}
      <section className="pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header with title and View All button */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Top providers near you
            </h2>
            <Link
              href="/browse"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white shadow-sm shadow-primary-600/20 hover:shadow-md hover:shadow-primary-600/30 transition-all"
            >
              View all providers
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Provider Cards - Horizontal Scroll with Side Arrows */}
          <div className="relative overflow-visible">
            {/* Left Arrow */}
            <button
              onClick={scrollLeft_handler}
              disabled={!canScrollLeft}
              className={`hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl border border-gray-200 items-center justify-center transition-all ${
                canScrollLeft
                  ? "hover:bg-gray-50 hover:shadow-2xl hover:scale-105 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
              aria-label="Scroll left"
            >
              <svg className={`w-6 h-6 ${canScrollLeft ? "text-gray-700" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Right Arrow */}
            <button
              onClick={scrollRight_handler}
              disabled={!canScrollRight}
              className={`hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl border border-gray-200 items-center justify-center transition-all ${
                canScrollRight
                  ? "hover:bg-gray-50 hover:shadow-2xl hover:scale-105 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
              aria-label="Scroll right"
            >
              <svg className={`w-6 h-6 ${canScrollRight ? "text-gray-700" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Scrollable Container */}
            <div
              ref={scrollContainerRef}
              className="flex gap-5 overflow-x-scroll pb-4 scrollbar-hide"
            >
              {isLoadingProviders ? (
                // Loading skeleton
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-[370px] h-[512px] bg-gray-100 rounded-2xl animate-pulse" />
                ))
              ) : (
                featuredProviders.map((provider) => (
                  <div key={provider.id} className="flex-shrink-0 w-[370px] h-[512px]">
                    <ProviderCard provider={provider} />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mobile View All button */}
          <div className="mt-6 text-center sm:hidden">
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white shadow-sm shadow-primary-600/20 hover:shadow-md hover:shadow-primary-600/30 transition-all"
            >
              View all providers
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Bento Grid - Explore Care Options */}
      <BentoGridSection />

      {/* Social Proof Stats Section */}
      <SocialProofSection />

      {/* Browse by Care Type Section */}
      <BrowseByCareTypeSection />

      {/* Community Forum Preview Section */}
      <section className="pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-warm-50 to-warm-100/50 rounded-3xl border border-warm-200/50 p-6 md:p-10 overflow-hidden">

          {/* Decorative background elements */}
          <div className="absolute top-6 right-8 w-20 h-20 text-warm-300/20 hidden md:block">
            <svg fill="currentColor" viewBox="0 0 24 24"><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </div>
          <div className="absolute bottom-10 left-6 w-16 h-16 text-primary-300/10 hidden md:block rotate-12">
            <svg fill="currentColor" viewBox="0 0 24 24"><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </div>
          <div className="absolute top-1/2 right-1/4 w-10 h-10 text-warm-200/15 hidden lg:block -rotate-12">
            <svg fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </div>

          {/* Header — centered */}
          <div className="relative flex flex-col items-center text-center mb-5">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-green-600">Live conversations</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              The Olera Community
            </h2>
            <Link
              href="/community"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 mt-4 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white shadow-sm shadow-primary-600/20 hover:shadow-md hover:shadow-primary-600/30 transition-all"
            >
              Join the conversation
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Forum Posts Grid */}
          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                id: 1,
                topic: "Memory Care",
                question: "My mom was just diagnosed with early-stage dementia. What should I look for in a memory care facility?",
                replies: 14,
                likes: 32,
                timeAgo: "2h ago",
                topReply: "Start with the staff-to-resident ratio. We found that smaller communities with a 1:5 ratio made all the difference for my dad.",
                avatars: ["S", "A", "R"],
                accentColor: "primary",
                iconPath: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
              },
              {
                id: 2,
                topic: "Home Care",
                question: "How do you handle the transition from hospital to home care? My father is being discharged next week.",
                replies: 8,
                likes: 19,
                timeAgo: "5h ago",
                topReply: "Ask the hospital for a care transition plan. We also hired a home care aide for the first 2 weeks — it was a lifesaver.",
                avatars: ["M", "K"],
                accentColor: "warm",
                iconPath: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
              },
              {
                id: 3,
                topic: "Costs & Insurance",
                question: "Does Medicare cover assisted living? We're trying to figure out how to afford care for my grandmother.",
                replies: 21,
                likes: 47,
                timeAgo: "8h ago",
                topReply: "Medicare doesn't cover assisted living directly, but Medicaid might. Check your state's waiver programs — they vary a lot.",
                avatars: ["J", "L", "D", "P"],
                accentColor: "blue",
                iconPath: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
              },
            ].map((post) => {
              const colorMap: Record<string, { tag: string; accent: string; glow: string; avatar: string; stripe: string; icon: string }> = {
                primary: {
                  tag: "text-primary-600 bg-primary-100/80",
                  accent: "group-hover:border-primary-200",
                  glow: "group-hover:shadow-primary-200/40",
                  avatar: "bg-primary-100 text-primary-700 ring-primary-200/50",
                  stripe: "from-primary-400 to-primary-600",
                  icon: "text-primary-400",
                },
                warm: {
                  tag: "text-warm-600 bg-warm-100/80",
                  accent: "group-hover:border-warm-200",
                  glow: "group-hover:shadow-warm-200/40",
                  avatar: "bg-warm-100 text-warm-700 ring-warm-200/50",
                  stripe: "from-warm-400 to-warm-600",
                  icon: "text-warm-400",
                },
                blue: {
                  tag: "text-blue-600 bg-blue-100/80",
                  accent: "group-hover:border-blue-200",
                  glow: "group-hover:shadow-blue-200/40",
                  avatar: "bg-blue-100 text-blue-700 ring-blue-200/50",
                  stripe: "from-blue-400 to-blue-600",
                  icon: "text-blue-400",
                },
              };
              const colors = colorMap[post.accentColor];

              return (
                <Link
                  key={post.id}
                  href="/community"
                  className={`group relative bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg ${colors.accent} ${colors.glow} transition-all duration-300`}
                >
                  {/* Left accent stripe */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${colors.stripe} rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                  {/* Card content */}
                  <div className="p-5">
                    {/* Topic row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg className={`w-3.5 h-3.5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={post.iconPath} />
                        </svg>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colors.tag}`}>
                          {post.topic}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">{post.timeAgo}</span>
                    </div>

                    {/* Question */}
                    <p className="text-[15px] font-semibold text-gray-900 leading-snug mb-4 line-clamp-2 group-hover:text-gray-800 transition-colors">
                      {post.question}
                    </p>

                    {/* Top reply — speech bubble style */}
                    <div className="relative mb-4">
                      {/* Speech bubble triangle */}
                      <div className="absolute -top-1.5 left-5 w-3 h-3 bg-gray-50 rotate-45 border-l border-t border-gray-100" />
                      <div className="relative bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ring-1 ${colors.avatar}`}>
                            {post.avatars[0]}
                          </div>
                          <span className="text-[11px] text-gray-400 font-medium">Top reply</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                          {post.topReply}
                        </p>
                      </div>
                    </div>

                    {/* Footer — avatars, engagement, read more */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Stacked avatar group */}
                        <div className="flex -space-x-1.5">
                          {post.avatars.slice(0, 3).map((a, i) => (
                            <div
                              key={i}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ring-white ${
                                i === 0 ? colors.avatar.replace(/ring-[^\s]+/, '') : 'bg-gray-100 text-gray-500'
                              }`}
                              style={{ zIndex: 3 - i }}
                            >
                              {a}
                            </div>
                          ))}
                          {post.avatars.length > 3 && (
                            <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-[8px] font-bold ring-2 ring-white">
                              +{post.avatars.length - 3}
                            </div>
                          )}
                        </div>

                        {/* Reply count */}
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span className="font-medium">{post.replies}</span>
                        </div>

                        {/* Like count */}
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                          <span className="font-medium">{post.likes}</span>
                        </div>
                      </div>

                      {/* Read more */}
                      <span className="text-xs font-semibold text-primary-600 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1">
                        Read
                        <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Mobile CTA */}
          <div className="mt-6 text-center sm:hidden">
            <Link
              href="/community"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-xl text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition-all"
            >
              Join the conversation
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          </div>

          {/* Resource + Benefits Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Resources Card */}
            <Link
              href="/resources"
              className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50 via-primary-50/80 to-white border border-primary-100/60 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/40 transition-all duration-300"
            >
              {/* Permanent left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 to-primary-600 rounded-l-2xl" />

              <div className="p-5 pl-6 flex items-center gap-4">
                {/* Icon circle */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5.5 h-5.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 leading-snug">
                    Caregiving Guides & Articles
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">Expert resources for every stage of the care journey.</p>
                </div>

                {/* Arrow circle */}
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center group-hover:bg-primary-600 transition-colors duration-300">
                  <svg className="w-4 h-4 text-primary-600 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Benefits Finder Card */}
            <Link
              href="/benefits"
              className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-warm-50 via-warm-50/80 to-white border border-warm-100/60 hover:border-warm-200 hover:shadow-lg hover:shadow-warm-100/40 transition-all duration-300"
            >
              {/* Permanent left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-warm-400 to-warm-600 rounded-l-2xl" />

              <div className="p-5 pl-6 flex items-center gap-4">
                {/* Icon circle */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5.5 h-5.5 text-warm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-900 leading-snug">
                    Find Financial Aid Programs
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">Medicare, Medicaid, and veteran benefits you may qualify for.</p>
                </div>

                {/* Arrow circle */}
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-warm-100 flex items-center justify-center group-hover:bg-warm-600 transition-colors duration-300">
                  <svg className="w-4 h-4 text-warm-600 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section — matches hero width */}
      <section className="pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="mx-4 sm:mx-6 lg:mx-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 px-8 py-16 md:px-16 md:py-20">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-warm-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/5" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/5" />

            <div className="relative z-10 max-w-2xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Ready to find the right care?
              </h2>
              <p className="mt-4 text-lg text-primary-100/90 max-w-xl mx-auto">
                Join thousands of families who have found trusted care through Olera.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/browse"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white hover:bg-gray-50 rounded-xl text-sm font-semibold text-primary-700 shadow-lg shadow-black/10 hover:shadow-xl transition-all"
                >
                  Browse Care Options
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-xl text-sm font-semibold text-white transition-all"
                >
                  Create Free Account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
