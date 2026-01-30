"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function HomePage() {
  const [location, setLocation] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (location.trim()) {
      router.push(`/browse?location=${encodeURIComponent(location.trim())}`);
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Find the Right Senior Care for Your Loved One
            </h1>
            <p className="mt-6 text-lg md:text-xl text-primary-100">
              Compare trusted care providers in your area. From assisted living
              to home care, we help families make confident decisions.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="mt-8">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-grow relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg
                      className="w-5 h-5 text-gray-400"
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
                  </div>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Enter zip code or city"
                    className="w-full pl-12 pr-4 py-4 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-primary-300"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-warm-500 hover:bg-warm-600 text-white font-semibold px-8 py-4 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Search
                </button>
              </div>
            </form>

            {/* Trust indicators */}
            <div className="mt-8 flex flex-wrap items-center gap-6 text-primary-200 text-sm">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-primary-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Free to search</span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-primary-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No pressure</span>
              </div>
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-primary-300"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Verified providers</span>
              </div>
            </div>
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
