"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useCitySearch } from "@/hooks/use-city-search";

const PREFILL_KEY = "olera_provider_search_prefill";

export default function BottomCTASection() {
  const { user, profiles } = useAuth();
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  // Track if user selected a city from dropdown (vs typing a provider name)
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results: cityResults, preload: preloadCities } = useCitySearch(searchInput);

  useClickOutside(dropdownRef, () => setShowDropdown(false));

  // Check if user already has a provider profile
  const hasProviderProfile = (profiles || []).some(
    (p) => p.type === "organization" || p.type === "caregiver"
  );

  const handleSelectCity = (cityFull: string) => {
    setSearchInput(cityFull);
    setSelectedCity(cityFull);
    setShowDropdown(false);
  };

  const handleGetStarted = () => {
    const val = searchInput.trim();
    if (val) {
      const isZip = /^\d{5}$/.test(val);
      // Check if it's a selected city (format: "City, ST")
      const isCity = selectedCity === val || /^[A-Za-z\s]+,\s*[A-Z]{2}$/.test(val);

      try {
        sessionStorage.setItem(
          PREFILL_KEY,
          JSON.stringify({
            searchQuery: (isZip || isCity) ? "" : val,
            locationQuery: (isZip || isCity) ? val : "",
          }),
        );
      } catch {
        /* sessionStorage unavailable */
      }
    }

    // Navigate directly to onboarding (auth moved to end of flow)
    const targetUrl = (user && hasProviderProfile)
      ? "/provider/onboarding?adding=true"
      : "/provider/onboarding";

    router.push(targetUrl);
  };

  // Determine if we should show city suggestions
  const showCitySuggestions = showDropdown && cityResults.length > 0 && searchInput.trim().length > 0;

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-900 rounded-2xl px-6 sm:px-12 py-12 sm:py-16 text-center">
          <h2 className="font-serif text-display-sm md:text-display-md font-bold text-white">
            Ready to get started?
          </h2>

          {/* Search bar */}
          <div className="mt-8 flex items-center justify-center gap-3 max-w-lg mx-auto">
            <div className="relative flex-1" ref={dropdownRef}>
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 z-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Business name, city, or zip code"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setSelectedCity(null); // Clear selection when typing
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  setShowDropdown(true);
                  preloadCities();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // If dropdown is open and there are city results, select the first one
                    if (showCitySuggestions) {
                      handleSelectCity(cityResults[0].full);
                    } else {
                      handleGetStarted();
                    }
                  }
                  if (e.key === "Escape") {
                    setShowDropdown(false);
                  }
                }}
                className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-600 bg-gray-800 text-base text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />

              {/* City dropdown */}
              {showCitySuggestions && (
                <div className="absolute left-0 bottom-[calc(100%+4px)] w-full bg-white rounded-lg shadow-lg border border-gray-100 py-1.5 z-50 max-h-[240px] overflow-y-auto">
                  <div className="px-3 py-1">
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      Cities matching &quot;{searchInput}&quot;
                    </span>
                  </div>
                  {cityResults.slice(0, 6).map((city, index) => (
                    <button
                      key={city.full}
                      type="button"
                      onClick={() => handleSelectCity(city.full)}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                        index === 0
                          ? "bg-gray-50 text-gray-900"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <svg
                        className="w-4 h-4 text-gray-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span>{city.full}</span>
                      {index === 0 && (
                        <span className="ml-auto text-xs text-gray-400">Enter</span>
                      )}
                    </button>
                  ))}
                  <div className="mx-3 my-1.5 h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      handleGetStarted();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <span>Search for &quot;{searchInput}&quot; as business name</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleGetStarted}
              className="shrink-0 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors min-h-[44px]"
            >
              Get started
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
