"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProviderCard, { Provider } from "@/components/providers/ProviderCard";

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

// Care type options for the quick filters
const careTypes = [
  {
    id: "assisted-living",
    name: "Assisted Living",
    description: "Support with daily activities in a residential setting",
    icon: "🏠",
  },
  {
    id: "home-care",
    name: "Home Care",
    description: "Care services delivered in the comfort of home",
    icon: "🏡",
  },
  {
    id: "memory-care",
    name: "Memory Care",
    description: "Specialized care for dementia and Alzheimer's",
    icon: "💜",
  },
  {
    id: "independent-living",
    name: "Independent Living",
    description: "Active adult communities with amenities",
    icon: "🌳",
  },
  {
    id: "skilled-nursing",
    name: "Skilled Nursing",
    description: "24/7 medical care and rehabilitation",
    icon: "🏥",
  },
  {
    id: "respite-care",
    name: "Respite Care",
    description: "Short-term relief for family caregivers",
    icon: "🤝",
  },
];

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
            backgroundImage: "url('https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=1920&q=80')"
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
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <span>48,000+ verified providers listed</span>
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
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header with title and arrows */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
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
              <div key={provider.id} className="flex-shrink-0 w-[370px] h-[480px]">
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

      {/* Care Types Section */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              What Type of Care Are You Looking For?
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Every situation is different. Explore options to find what works
              best for your family.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {careTypes.map((type) => (
              <Link
                key={type.id}
                href={`/browse?type=${type.id}`}
                className="card p-6 hover:border-primary-200 group"
              >
                <div className="text-4xl mb-4">{type.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                  {type.name}
                </h3>
                <p className="mt-2 text-gray-600">{type.description}</p>
                <div className="mt-4 text-primary-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  <span>Browse options</span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
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
