"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProviderCard, { Provider } from "@/components/providers/ProviderCard";

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

// Dummy provider data
const topProviders: Provider[] = [
  {
    id: "1",
    slug: "sunrise-senior-living",
    name: "Sunrise Senior Living",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
    images: [
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
    ],
    address: "1234 Oak Street, Austin, TX 78701",
    rating: 4.8,
    reviewCount: 47,
    priceRange: "$3,500/mo",
    primaryCategory: "Assisted Living",
    careTypes: ["Memory Care", "Respite Care"],
    highlights: ["24/7 Nursing Staff", "Pet Friendly", "Private Rooms"],
    acceptedPayments: ["Medicare", "Medicaid", "Private Pay"],
    verified: true,
    badge: "Top Rated",
    description: "Award-winning senior living community with personalized care plans",
    staffImage: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200",
    staff: {
      name: "Dr. Sarah Mitchell",
      position: "Director of Care",
      bio: "Board-certified geriatrician with 15+ years experience in senior care. Passionate about creating personalized care plans that prioritize dignity and quality of life.",
      image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200",
    },
  },
  {
    id: "2",
    slug: "harmony-care-home",
    name: "Harmony Care Home",
    image: "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
    images: [
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "5678 Maple Avenue, Austin, TX 78702",
    rating: 4.6,
    reviewCount: 21,
    priceRange: "$4,200/mo",
    primaryCategory: "Memory Care",
    careTypes: ["Hospice", "Skilled Nursing"],
    highlights: ["Dementia Specialists", "Secured Facility", "Family Support"],
    acceptedPayments: ["Medicaid", "Long-term Insurance"],
    verified: true,
    description: "Specialized memory care with 24/7 nursing support",
  },
  {
    id: "3",
    slug: "golden-years-residence",
    name: "Golden Years Residence",
    image: "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    images: [
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "910 Pine Road, Austin, TX 78703",
    rating: 4.5,
    reviewCount: 12,
    priceRange: "$2,800/mo",
    primaryCategory: "Independent Living",
    careTypes: ["Assisted Living"],
    highlights: ["Active Lifestyle", "On-site Fitness", "Social Events"],
    acceptedPayments: ["Private Pay", "Veterans Benefits"],
    verified: true,
    badge: "New",
    description: "Modern community designed for active, independent seniors",
    staffImage: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200",
    staff: {
      name: "Michael Chen",
      position: "Activities Director",
      bio: "Certified recreation therapist dedicated to keeping seniors active and engaged. Organizes daily fitness classes, social events, and community outings.",
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200",
    },
  },
  {
    id: "4",
    slug: "caring-hearts-home-care",
    name: "Caring Hearts Home Care",
    image: "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
    images: [
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "Serving Greater Austin Area",
    rating: 4.9,
    reviewCount: 83,
    priceRange: "$25/hr",
    primaryCategory: "Home Care",
    careTypes: ["Respite Care", "Companion Care"],
    highlights: ["Flexible Scheduling", "Background Checked", "Bilingual Staff"],
    acceptedPayments: ["Medicare", "Private Pay"],
    verified: true,
    description: "Compassionate in-home care tailored to your loved one's needs",
  },
  {
    id: "5",
    slug: "oak-meadows-retirement",
    name: "Oak Meadows Retirement",
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
    images: [
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
    ],
    address: "2345 Elm Street, Austin, TX 78704",
    rating: 4.7,
    reviewCount: 38,
    priceRange: "$3,200/mo",
    primaryCategory: "Independent Living",
    careTypes: ["Assisted Living"],
    highlights: ["Golf Course Access", "Fine Dining", "Spa Services"],
    acceptedPayments: ["Private Pay", "Long-term Insurance"],
    verified: true,
    badge: "Featured",
    description: "Luxury retirement living with resort-style amenities",
  },
  {
    id: "6",
    slug: "peaceful-pines-hospice",
    name: "Peaceful Pines Hospice",
    image: "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    images: [
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
    ],
    address: "789 Willow Lane, Austin, TX 78705",
    rating: 4.9,
    reviewCount: 56,
    priceRange: "$4,800/mo",
    primaryCategory: "Hospice",
    careTypes: ["Skilled Nursing", "Memory Care"],
    highlights: ["Palliative Care", "Family Counseling", "24/7 Support"],
    acceptedPayments: ["Medicare", "Medicaid", "Private Pay"],
    verified: true,
    description: "Compassionate end-of-life care with dignity",
    staffImage: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200",
    staff: {
      name: "Dr. Emily Watson",
      position: "Medical Director",
      bio: "Hospice and palliative medicine specialist dedicated to ensuring comfort and quality of life for patients and their families.",
      image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200",
    },
  },
];

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

// Sample providers by category (in real app, this would come from API)
const providersByCategory: Record<string, Provider[]> = {
  "home-care": [
    { ...topProviders[3], primaryCategory: "Home Care" },
    { ...topProviders[0], id: "hc-2", primaryCategory: "Home Care", name: "Comfort Keepers" },
    { ...topProviders[1], id: "hc-3", primaryCategory: "Home Care", name: "Home Instead" },
    { ...topProviders[2], id: "hc-4", primaryCategory: "Home Care", name: "Visiting Angels" },
    { ...topProviders[4], id: "hc-5", primaryCategory: "Home Care", name: "Right at Home" },
    { ...topProviders[5], id: "hc-6", primaryCategory: "Home Care", name: "BrightStar Care" },
    { ...topProviders[0], id: "hc-7", primaryCategory: "Home Care", name: "Seniors Helping Seniors" },
    { ...topProviders[1], id: "hc-8", primaryCategory: "Home Care", name: "Griswold Home Care" },
  ],
  "home-health": [
    { ...topProviders[5], primaryCategory: "Home Health" },
    { ...topProviders[0], id: "hh-2", primaryCategory: "Home Health", name: "Amedisys" },
    { ...topProviders[1], id: "hh-3", primaryCategory: "Home Health", name: "LHC Group" },
    { ...topProviders[2], id: "hh-4", primaryCategory: "Home Health", name: "Kindred at Home" },
    { ...topProviders[3], id: "hh-5", primaryCategory: "Home Health", name: "AccordantHealth" },
    { ...topProviders[4], id: "hh-6", primaryCategory: "Home Health", name: "Enhabit Home Health" },
    { ...topProviders[5], id: "hh-7", primaryCategory: "Home Health", name: "Elara Caring" },
    { ...topProviders[0], id: "hh-8", primaryCategory: "Home Health", name: "Bayada Home Health" },
  ],
  "assisted-living": [
    { ...topProviders[0], primaryCategory: "Assisted Living" },
    { ...topProviders[1], id: "al-2", primaryCategory: "Assisted Living", name: "Brookdale Senior Living" },
    { ...topProviders[2], id: "al-3", primaryCategory: "Assisted Living", name: "Five Star Senior Living" },
    { ...topProviders[3], id: "al-4", primaryCategory: "Assisted Living", name: "Atria Senior Living" },
    { ...topProviders[4], id: "al-5", primaryCategory: "Assisted Living", name: "Senior Lifestyle" },
    { ...topProviders[5], id: "al-6", primaryCategory: "Assisted Living", name: "Silverado" },
    { ...topProviders[0], id: "al-7", primaryCategory: "Assisted Living", name: "Belmont Village" },
    { ...topProviders[1], id: "al-8", primaryCategory: "Assisted Living", name: "Merrill Gardens" },
  ],
  "memory-care": [
    { ...topProviders[1], primaryCategory: "Memory Care" },
    { ...topProviders[0], id: "mc-2", primaryCategory: "Memory Care", name: "Silverado Memory Care" },
    { ...topProviders[2], id: "mc-3", primaryCategory: "Memory Care", name: "Arden Courts" },
    { ...topProviders[3], id: "mc-4", primaryCategory: "Memory Care", name: "Sunrise Memory Care" },
    { ...topProviders[4], id: "mc-5", primaryCategory: "Memory Care", name: "Artis Senior Living" },
    { ...topProviders[5], id: "mc-6", primaryCategory: "Memory Care", name: "Autumn Leaves" },
    { ...topProviders[0], id: "mc-7", primaryCategory: "Memory Care", name: "The Kensington" },
    { ...topProviders[1], id: "mc-8", primaryCategory: "Memory Care", name: "Bridges by EPOCH" },
  ],
  "independent-living": [
    { ...topProviders[2], primaryCategory: "Independent Living" },
    { ...topProviders[0], id: "il-2", primaryCategory: "Independent Living", name: "Vi Living" },
    { ...topProviders[1], id: "il-3", primaryCategory: "Independent Living", name: "Holiday Retirement" },
    { ...topProviders[3], id: "il-4", primaryCategory: "Independent Living", name: "Erickson Living" },
    { ...topProviders[4], id: "il-5", primaryCategory: "Independent Living", name: "Leisure Care" },
    { ...topProviders[5], id: "il-6", primaryCategory: "Independent Living", name: "Watermark Retirement" },
    { ...topProviders[0], id: "il-7", primaryCategory: "Independent Living", name: "Aegis Living" },
    { ...topProviders[1], id: "il-8", primaryCategory: "Independent Living", name: "Kisco Senior Living" },
  ],
  "nursing-home": [
    { ...topProviders[5], primaryCategory: "Nursing Home" },
    { ...topProviders[0], id: "nh-2", primaryCategory: "Nursing Home", name: "Genesis HealthCare" },
    { ...topProviders[1], id: "nh-3", primaryCategory: "Nursing Home", name: "PruittHealth" },
    { ...topProviders[2], id: "nh-4", primaryCategory: "Nursing Home", name: "Ensign Group" },
    { ...topProviders[3], id: "nh-5", primaryCategory: "Nursing Home", name: "Sabra Health Care" },
    { ...topProviders[4], id: "nh-6", primaryCategory: "Nursing Home", name: "ProMedica Senior Care" },
    { ...topProviders[5], id: "nh-7", primaryCategory: "Nursing Home", name: "Life Care Centers" },
    { ...topProviders[0], id: "nh-8", primaryCategory: "Nursing Home", name: "Consulate Health Care" },
  ],
};

// Care type options for search dropdown
const careTypeOptions = [
  { value: "", label: "Type of care" },
  { value: "assisted-living", label: "Assisted Living" },
  { value: "home-care", label: "Home Care" },
  { value: "memory-care", label: "Memory Care" },
  { value: "independent-living", label: "Independent Living" },
  { value: "skilled-nursing", label: "Skilled Nursing" },
  { value: "respite-care", label: "Respite Care" },
];

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
    <section className="py-16 md:py-24 bg-gradient-to-b from-gray-50 via-white to-white overflow-hidden relative">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary-100/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-warm-100/40 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center mb-12">
          <p className="text-primary-600 font-semibold text-sm uppercase tracking-wider mb-3">Trusted nationwide</p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Helping families find care, every day
          </h2>
        </div>

        {/* Stats Row */}
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 max-w-4xl mx-auto">
          {/* Stat 1 */}
          <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all duration-300 group">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight tabular-nums">
              {providersCount.toLocaleString()}+
            </p>
            <p className="mt-2 text-gray-500 text-base font-medium">care providers</p>
          </div>

          {/* Stat 2 */}
          <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md hover:border-warm-100 transition-all duration-300 group">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-warm-100 to-warm-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-warm-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <p className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight tabular-nums">
              {familiesCount.toLocaleString()}+
            </p>
            <p className="mt-2 text-gray-500 text-base font-medium">families helped</p>
          </div>

          {/* Stat 3 */}
          <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all duration-300 group">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-4xl md:text-5xl font-bold text-primary-600 tracking-tight tabular-nums">
              {citiesCount.toLocaleString()}+
            </p>
            <p className="mt-2 text-gray-500 text-base font-medium">cities covered</p>
          </div>
        </div>

      </div>

      {/* Scrolling Tags - Full width, no fades */}
      <div className="mt-12">
        {/* Scrolling Tags - Row 1 (scrolls left) */}
        <div className="mb-3">
          <div className="flex animate-scroll-left">
            {[...scrollingTags.row1, ...scrollingTags.row1].map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center bg-white border border-gray-200 px-5 py-2.5 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap mx-2 shadow-sm hover:shadow hover:border-primary-200 hover:text-primary-700 transition-all duration-200 cursor-default"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Scrolling Tags - Row 2 (scrolls right) */}
        <div>
          <div className="flex animate-scroll-right">
            {[...scrollingTags.row2, ...scrollingTags.row2].map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center bg-white border border-gray-200 px-5 py-2.5 rounded-full text-sm font-medium text-gray-700 whitespace-nowrap mx-2 shadow-sm hover:shadow hover:border-primary-200 hover:text-primary-700 transition-all duration-200 cursor-default"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Browse by Care Type Section Component
function BrowseByCareTypeSection() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleCategoryClick = (categoryId: string) => {
    if (selectedCategory === categoryId) {
      // Deselect if clicking the same category
      setIsAnimating(true);
      setTimeout(() => {
        setSelectedCategory(null);
        setIsAnimating(false);
      }, 200);
    } else {
      // Select new category
      setIsAnimating(true);
      setTimeout(() => {
        setSelectedCategory(categoryId);
        setIsAnimating(false);
      }, selectedCategory ? 200 : 0);
    }
  };

  const selectedProviders = selectedCategory ? providersByCategory[selectedCategory] || [] : [];

  return (
    <section className="pt-16 md:pt-24 pb-6 md:pb-10 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Browse by care type
          </h2>
        </div>

        {/* Category Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {careCategories.map((category) => {
            const isSelected = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`rounded-2xl border-2 text-left transition-all duration-200 px-5 py-6 flex flex-col items-start ${
                  isSelected
                    ? "border-primary-500 bg-primary-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                }`}
              >
                {/* Icon with background container */}
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors duration-200 ${
                    isSelected
                      ? "bg-primary-100"
                      : "bg-primary-50"
                  }`}
                >
                  <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={category.iconPath} />
                  </svg>
                </div>
                {/* Category Name */}
                <span className={`font-semibold block text-lg transition-colors duration-200 ${
                  isSelected
                    ? "text-primary-700"
                    : "text-gray-800"
                }`}>
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Provider Cards - Revealed on category selection */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            selectedCategory && !isAnimating
              ? "max-h-[3000px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <div className={`pt-8 transition-all duration-300 ${isAnimating ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}>
            {/* Provider Grid - 6 cards in 3 columns, 2 rows */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {selectedProviders.slice(0, 6).map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>

            {/* View All Link */}
            <div className="mt-6 text-center">
              <Link
                href={`/browse?type=${selectedCategory}`}
                className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
              >
                View all {careCategories.find(c => c.id === selectedCategory)?.name} providers
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [location, setLocation] = useState("");
  const [careType, setCareType] = useState("");
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const router = useRouter();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

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
    <div>
      {/* Hero Section */}
      <section className="relative text-white overflow-hidden">
        {/* Background Image - Caregiver with senior, warm home setting */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/hero.png')"
          }}
        />
        {/* Overlay for text readability */}
        <div className="absolute inset-0 bg-black/55" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
            {/* Stack 1: Social Proof Pill + Headline + Subtitle */}
            <div className="mb-10">
              {/* Social Proof Pill */}
              <div className="inline-flex items-center gap-2.5 bg-white/15 backdrop-blur-md border border-white/20 px-5 py-2.5 rounded-full text-sm font-medium text-white mb-6 shadow-lg">
                <span className="flex items-center justify-center w-5 h-5 bg-primary-500 rounded-full">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </span>
                <span>48,000+ care providers</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                Find the right care
                <br />
                <span className="text-primary-200">for your loved one</span>
              </h1>
              <p className="mt-3 text-lg md:text-xl text-primary-100/90 max-w-xl mx-auto">
                Compare trusted providers. Free, no pressure.
              </p>
            </div>

            {/* Stack 2: Search Bar */}
            <div className="w-full">
              <form onSubmit={handleSearch}>
              {/* White outer container with slight border radius */}
              <div className="bg-white shadow-2xl w-full max-w-4xl mx-auto p-2.5 flex flex-col md:flex-row md:items-center gap-2.5 rounded-xl">
                {/* Location Input - Gray pill */}
                <div className="flex-1 flex items-center px-4 py-3.5 bg-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <svg
                    className="w-5 h-5 text-gray-500 flex-shrink-0"
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
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Where are you looking?"
                    className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 text-base font-medium"
                  />
                  <svg
                    className="w-4 h-4 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Care Type Dropdown - Gray pill */}
                <div className="flex-1 flex items-center px-4 py-3.5 bg-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <svg
                    className="w-5 h-5 text-gray-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <select
                    value={careType}
                    onChange={(e) => setCareType(e.target.value)}
                    className="w-full ml-3 bg-transparent border-none text-gray-900 focus:outline-none focus:ring-0 text-base font-medium cursor-pointer appearance-none"
                  >
                    {careTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="w-4 h-4 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Search Button - Colored pill */}
                <button
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-base px-6 py-3.5 rounded-lg transition-all duration-200 whitespace-nowrap flex items-center justify-center gap-2 md:min-w-[110px]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden md:inline">Search</span>
                </button>
              </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Top Providers Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header with title and arrows */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Top providers near you
            </h2>
            <div className="flex gap-2">
              <button
                onClick={scrollLeft_handler}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                  canScrollLeft
                    ? "border-primary-600 text-primary-600 hover:bg-primary-50"
                    : "border-gray-200 text-gray-300"
                }`}
                aria-label="Scroll left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={scrollRight_handler}
                className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                  canScrollRight
                    ? "border-primary-600 text-primary-600 hover:bg-primary-50"
                    : "border-gray-200 text-gray-300"
                }`}
                aria-label="Scroll right"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Provider Cards - Horizontal Scroll */}
          <div
            ref={scrollContainerRef}
            className="flex gap-5 overflow-x-scroll pb-4 scrollbar-hide"
          >
            {topProviders.map((provider) => (
              <div key={provider.id} className="flex-shrink-0 w-[370px] h-[512px]">
                <ProviderCard provider={provider} />
              </div>
            ))}
          </div>

          {/* View all link */}
          <div className="mt-6 text-center">
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
            >
              View all providers
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof Stats Section */}
      <SocialProofSection />

      {/* Browse by Care Type Section */}
      <BrowseByCareTypeSection />

      {/* Featured Video Section - Connected to Browse by Care Type */}
      <section className="pt-4 md:pt-6 pb-16 md:pb-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl overflow-hidden">
            {/* Diagonal stripe pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 10px,
                  rgba(255,255,255,0.1) 10px,
                  rgba(255,255,255,0.1) 11px
                )`
              }}
            />

            {/* Teal glow effect behind video area */}
            <div className="absolute top-1/2 right-0 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl transform translate-x-1/4 -translate-y-1/2" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-primary-400/10 rounded-full blur-2xl" />

            {/* Decorative elements */}
            <div className="absolute top-12 left-12 w-20 h-20 border border-white/10 rounded-full" />
            <div className="absolute top-16 left-16 w-12 h-12 border border-primary-500/20 rounded-full" />
            <div className="absolute bottom-12 left-1/4 w-2 h-2 bg-primary-400/40 rounded-full" />
            <div className="absolute bottom-20 left-1/3 w-1.5 h-1.5 bg-white/20 rounded-full" />

            <div className="relative flex items-center justify-center p-8 md:p-12 lg:p-16">
              <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 w-full max-w-6xl">
                {/* Left side - Text content */}
                <div className="flex flex-col lg:w-[40%]">
                  {/* Chapter badge */}
                  <div className="flex items-center gap-3 mb-6">
                    <span className="inline-flex items-center gap-1.5 bg-primary-500/20 border border-primary-500/30 text-primary-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Chapter 1
                    </span>
                    <span className="text-gray-500 text-sm">Documentary Series</span>
                  </div>

                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                    Aging in America
                  </h2>

                  <p className="text-gray-400 text-base mb-8 max-w-sm leading-relaxed">
                    Explore the realities of senior care in America and discover how families navigate finding the right care.
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center items-start gap-4">
                    <Link
                      href="/browse"
                      className="group inline-flex items-center gap-2 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-all duration-300 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:scale-[1.02]"
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
                      className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm font-medium transition-colors"
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
                  <div className="relative w-full group">
                    {/* Glow ring around video */}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-500/50 via-primary-400/30 to-primary-500/50 rounded-2xl blur-sm opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

                    {/* Video container */}
                    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black ring-1 ring-white/10">
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

      {/* How It Works Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              How Olera Works
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Finding care shouldn&apos;t be overwhelming. We make it simple.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Search Your Area",
                description:
                  "Enter your location to see care providers near you. Filter by care type, amenities, and more.",
              },
              {
                step: "2",
                title: "Compare Options",
                description:
                  "Browse detailed profiles, read about services, and save your favorites to compare.",
              },
              {
                step: "3",
                title: "Connect Directly",
                description:
                  "Request a consultation with providers you're interested in. No middleman, no pressure.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-primary-700 font-bold text-lg">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-secondary-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            Ready to Start Your Search?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Join thousands of families who have found the right care through
            Olera.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/browse" className="btn-primary">
              Browse Care Options
            </Link>
            <Link href="/auth/signup" className="btn-secondary">
              Create Free Account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
