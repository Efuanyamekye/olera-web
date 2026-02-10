"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useCitySearch } from "@/hooks/use-city-search";
import { useRouter } from "next/navigation";
import ProviderCard from "@/components/providers/ProviderCard";
import type { Provider as ProviderCardType } from "@/components/providers/ProviderCard";
import { useNavbar } from "@/components/shared/NavbarContext";
import Pagination from "@/components/ui/Pagination";
import { createClient } from "@/lib/supabase/client";
import {
  type Provider as SupabaseProvider,
  PROVIDERS_TABLE,
  toCardFormat,
  type ProviderCardData,
} from "@/lib/types/provider";

const BrowseMap = dynamic(() => import("@/components/browse/BrowseMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center">
      <span className="text-sm text-gray-400">Loading map...</span>
    </div>
  ),
});

// Location suggestions moved to useCitySearch hook for comprehensive US city search

const careTypes = [
  { id: "all", label: "All Care Types" },
  { id: "home-care", label: "Home Care" },
  { id: "home-health", label: "Home Health" },
  { id: "assisted-living", label: "Assisted Living" },
  { id: "memory-care", label: "Memory Care" },
  { id: "nursing-homes", label: "Nursing Homes" },
  { id: "independent-living", label: "Independent Living" },
];

const paymentTypeOptions = [
  { value: "any", label: "Any Payment Type" },
  { value: "Medicare", label: "Medicare" },
  { value: "Medicaid", label: "Medicaid" },
  { value: "Private Pay", label: "Private Pay" },
  { value: "Long-term Insurance", label: "Long-term Care Insurance" },
  { value: "Veterans Benefits", label: "VA Benefits" },
];

const ratingOptions = [
  { value: "any", label: "Any Rating" },
  { value: "4.5", label: "4.5+ Stars" },
  { value: "4.0", label: "4.0+ Stars" },
  { value: "3.5", label: "3.5+ Stars" },
  { value: "3.0", label: "3.0+ Stars" },
];

const sortOptions = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest Rated" },
  { value: "reviews", label: "Most Reviewed" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
];

// Map URL care type params to Supabase provider_category values
const CARE_TYPE_TO_SUPABASE: Record<string, string> = {
  "home-care": "Home Care (Non-medical)",
  "home-health": "Home Health Care",
  "assisted-living": "Assisted Living",
  "memory-care": "Memory Care",
  "nursing-homes": "Nursing Home",
  "independent-living": "Independent Living",
};

// Helper to get care type label from ID
function getCareTypeLabel(id: string): string {
  const ct = careTypes.find((c) => c.id === id);
  return ct?.label || "All Care Types";
}

type ViewMode = "carousel" | "grid" | "map";

const PROVIDERS_PER_PAGE = 24;

// Helper function to parse price for sorting
function parsePrice(price: string): number {
  const numericValue = parseInt(price.replace(/[^0-9]/g, ""));
  if (price.includes("/hr")) return numericValue * 160;
  if (price.includes("/day")) return numericValue * 30;
  return numericValue;
}

// Carousel Section Component
function CarouselSection({
  title,
  providers,
  scrollId,
}: {
  title: string;
  providers: ProviderCardType[];
  scrollId: string;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-400 font-medium">({providers.length})</span>
      </div>
      <div className="relative group/carousel">
        <div
          id={scrollId}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
        >
          {providers.map((provider, index) => (
            <div key={`${provider.id}-${index}`} className="flex-shrink-0 w-[340px] snap-start">
              <ProviderCard provider={provider} />
            </div>
          ))}
        </div>
        {/* Arrow Navigation */}
        <button
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center hover:scale-105 transition-transform z-10 opacity-0 group-hover/carousel:opacity-100"
          onClick={() => {
            const container = document.getElementById(scrollId);
            if (container) container.scrollBy({ left: -600, behavior: "smooth" });
          }}
        >
          <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center hover:scale-105 transition-transform z-10 opacity-0 group-hover/carousel:opacity-100"
          onClick={() => {
            const container = document.getElementById(scrollId);
            if (container) container.scrollBy({ left: 600, behavior: "smooth" });
          }}
        >
          <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface BrowseClientProps {
  careType: string;
  searchQuery: string;
}

export default function BrowseClient({ careType, searchQuery }: BrowseClientProps) {
  const router = useRouter();
  const { visible: navbarVisible, enableAutoHide, disableAutoHide, setForceHidden } = useNavbar();
  const isAllTypes = !careType || careType === "all";
  const careTypeLabel = isAllTypes ? "All Care Types" : getCareTypeLabel(careType);

  // Enable navbar auto-hide on this page
  useEffect(() => {
    enableAutoHide();
    return () => disableAutoHide();
  }, [enableAutoHide, disableAutoHide]);

  // Filter states - use searchQuery from URL if provided, otherwise empty (auto-detect will fill)
  const initialLocation = searchQuery?.trim() || "";
  const [searchLocation, setSearchLocation] = useState(initialLocation);
  const [locationInput, setLocationInput] = useState(initialLocation);
  const [selectedRating, setSelectedRating] = useState("any");
  const [selectedPayment, setSelectedPayment] = useState("any");
  const [sortBy, setSortBy] = useState("recommended");
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  const [hoveredProviderId, setHoveredProviderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Dropdown states
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showCareTypeDropdown, setShowCareTypeDropdown] = useState(false);
  const [showRatingDropdown, setShowRatingDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Geolocation state
  const [isGeolocating, setIsGeolocating] = useState(false);

  // Provider data from Supabase
  const [providers, setProviders] = useState<ProviderCardData[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);

  // Fetch providers from Supabase
  const fetchProviders = useCallback(async () => {
    setIsLoadingProviders(true);

    try {
      const supabase = createClient();
      let query = supabase
        .from(PROVIDERS_TABLE)
        .select("*")
        .not("deleted", "is", true);

      // Apply care type filter
      if (careType && careType !== "all") {
        const supabaseCategory = CARE_TYPE_TO_SUPABASE[careType];
        if (supabaseCategory) {
          query = query.ilike("provider_category", `%${supabaseCategory}%`);
        }
      }

      // Apply location filter
      if (searchLocation) {
        const trimmed = searchLocation.trim();
        const cityStateMatch = trimmed.match(/^(.+),\s*([A-Z]{2})$/i);
        if (cityStateMatch) {
          const city = cityStateMatch[1].trim();
          const state = cityStateMatch[2].toUpperCase();
          query = query.ilike("city", `%${city}%`).eq("state", state);
        } else if (/^[A-Z]{2}$/i.test(trimmed)) {
          query = query.eq("state", trimmed.toUpperCase());
        } else {
          query = query.or(`city.ilike.%${trimmed}%,provider_name.ilike.%${trimmed}%`);
        }
      }

      // Order by rating and limit
      const { data, error } = await query
        .order("google_rating", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Browse fetch error:", error.message);
        setProviders([]);
      } else {
        setProviders((data as SupabaseProvider[]).map(toCardFormat));
      }
    } catch (err) {
      console.error("Browse page error:", err);
      setProviders([]);
    }
    setIsLoadingProviders(false);
  }, [careType, searchLocation]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Map view: lock body scroll and force-hide navbar
  useEffect(() => {
    if (viewMode === "map") {
      document.body.style.overflow = "hidden";
      setForceHidden(true);
      return () => {
        document.body.style.overflow = "";
        setForceHidden(false);
      };
    }
  }, [viewMode, setForceHidden]);

  // Reset scroll position when switching view modes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [viewMode]);

  // Refs
  const locationInputRef = useRef<HTMLInputElement>(null);
  const mapListingsRef = useRef<HTMLDivElement>(null);

  // City search with progressive loading (18K+ US cities, ZIP codes, states)
  const { results: cityResults, preload: preloadCities } = useCitySearch(locationInput);

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

  // Default location for fallback (simulates geolocation default)
  const DEFAULT_LOCATION = "New York, NY";

  // Geolocation function
  const detectLocation = () => {
    if (!navigator.geolocation) {
      // No geolocation available, use default
      setSearchLocation(DEFAULT_LOCATION);
      setLocationInput(DEFAULT_LOCATION);
      return;
    }

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
            setSearchLocation(DEFAULT_LOCATION);
            setLocationInput(DEFAULT_LOCATION);
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
          setSearchLocation(locationString);
          setLocationInput(locationString);
        } catch {
          setSearchLocation(DEFAULT_LOCATION);
          setLocationInput(DEFAULT_LOCATION);
        }
        setIsGeolocating(false);
      },
      () => {
        // Geolocation denied or failed, use default
        setSearchLocation(DEFAULT_LOCATION);
        setLocationInput(DEFAULT_LOCATION);
        setIsGeolocating(false);
      }
    );
  };

  // Auto-detect location on mount ONLY if no location was provided via URL
  useEffect(() => {
    if (!initialLocation) {
      detectLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".dropdown-container")) {
        setShowLocationDropdown(false);
        // Restore locationInput to current searchLocation when closing without selection
        setLocationInput(searchLocation);
        setShowCareTypeDropdown(false);
        setShowRatingDropdown(false);
        setShowPaymentDropdown(false);
        setShowSortDropdown(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [searchLocation]);

  // Filter and sort providers (Supabase already filtered by care type and location)
  const filteredProviders = useMemo(() => {
    let result = [...providers];

    // Apply rating filter (client-side)
    if (selectedRating !== "any") {
      const minRating = parseFloat(selectedRating);
      result = result.filter((p) => p.rating >= minRating);
    }

    // Apply payment filter (client-side)
    if (selectedPayment !== "any") {
      result = result.filter((p) => p.acceptedPayments?.includes(selectedPayment));
    }

    // Apply sorting
    switch (sortBy) {
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;
      case "price-low":
        result.sort((a, b) => parsePrice(a.priceRange) - parsePrice(b.priceRange));
        break;
      case "price-high":
        result.sort((a, b) => parsePrice(b.priceRange) - parsePrice(a.priceRange));
        break;
      case "reviews":
        result.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      default:
        // Recommended - mix of rating and reviews
        result.sort((a, b) => b.rating * (b.reviewCount || 1) - a.rating * (a.reviewCount || 1));
    }

    return result;
  }, [providers, selectedRating, selectedPayment, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredProviders.length / PROVIDERS_PER_PAGE);
  const paginatedProviders = useMemo(() => {
    const startIndex = (currentPage - 1) * PROVIDERS_PER_PAGE;
    return filteredProviders.slice(startIndex, startIndex + PROVIDERS_PER_PAGE);
  }, [filteredProviders, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [careType, selectedRating, selectedPayment, sortBy]);

  // Categorized providers for carousel view - override badges to match section
  const topRatedProviders = useMemo(
    () => [...filteredProviders]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8)
      .map((p) => ({ ...p, badge: "Top Rated" })),
    [filteredProviders]
  );

  const affordableProviders = useMemo(
    () => filteredProviders
      .filter((p) => p.acceptedPayments?.includes("Medicaid"))
      .slice(0, 8)
      .map((p) => ({ ...p, badge: undefined })), // No badge for affordable section
    [filteredProviders]
  );

  const highlyReviewedProviders = useMemo(
    () =>
      [...filteredProviders]
        .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
        .slice(0, 8)
        .map((p) => ({ ...p, badge: "Top Rated" })),
    [filteredProviders]
  );

  const featuredProviders = useMemo(
    () => filteredProviders
      .filter((p) => p.verified)
      .slice(0, 8)
      .map((p) => ({ ...p, badge: "Featured" })),
    [filteredProviders]
  );

  // For "all" view, group by type - keep original badges for category sections
  const homeCareProviders = useMemo(
    () => filteredProviders.filter((p) => p.primaryCategory === "Home Care").slice(0, 8),
    [filteredProviders]
  );

  const assistedLivingProviders = useMemo(
    () => filteredProviders.filter((p) => p.primaryCategory === "Assisted Living").slice(0, 8),
    [filteredProviders]
  );

  const memoryCareProviders = useMemo(
    () => filteredProviders.filter((p) => p.primaryCategory === "Memory Care").slice(0, 8),
    [filteredProviders]
  );

  const nursingHomeProviders = useMemo(
    () => filteredProviders.filter((p) => p.primaryCategory === "Nursing Home").slice(0, 8),
    [filteredProviders]
  );

  const isMapView = viewMode === "map";

  // Check if any filters are active
  const hasActiveFilters =
    selectedRating !== "any" ||
    selectedPayment !== "any" ||
    sortBy !== "recommended";

  // Clear all filters
  const clearFilters = () => {
    setSearchLocation(DEFAULT_LOCATION);
    setLocationInput(DEFAULT_LOCATION);
    setSelectedRating("any");
    setSelectedPayment("any");
    setSortBy("recommended");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Filter Bar - Sticky below navbar (slides smoothly with navbar hide/show), fixed at top-0 for map view */}
      <div
        className={`z-40 bg-white border-b border-gray-200 ${isMapView ? "fixed top-0 left-0 right-0" : "sticky top-0 -mt-16"}`}
        style={!isMapView ? {
          transform: navbarVisible ? "translateY(64px)" : "translateY(0)",
          transition: "transform 200ms cubic-bezier(0.33, 1, 0.68, 1)"
        } : undefined}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-3">
          {/* Filter Buttons - Left Side */}
          <div className="flex items-center gap-2 flex-nowrap overflow-visible">
            {/* Location Dropdown */}
            <div className="relative dropdown-container flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const opening = !showLocationDropdown;
                  setShowLocationDropdown(opening);
                  setShowCareTypeDropdown(false);
                  setShowRatingDropdown(false);
                  setShowPaymentDropdown(false);
                  setShowSortDropdown(false);
                  if (opening) {
                    // Clear input so popular cities show (matching landing page dropdown)
                    setLocationInput("");
                    setTimeout(() => locationInputRef.current?.focus({ preventScroll: true }), 100);
                  }
                }}
                className={`flex items-center justify-between h-9 px-3 w-[200px] rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                  searchLocation.trim()
                    ? "bg-white text-gray-900 border-2 border-primary-400"
                    : "bg-white border border-gray-300 text-gray-900 hover:border-gray-400"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isGeolocating ? (
                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                  <span className="truncate">{isGeolocating ? "Detecting..." : (searchLocation || "Enter location")}</span>
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showLocationDropdown && (
                <div className="absolute left-0 top-[calc(100%+8px)] w-[380px] bg-white rounded-xl shadow-xl border border-gray-200 py-3 z-[100] max-h-[340px] overflow-y-auto">
                  {/* Search Input */}
                  <div className="px-3 pb-2">
                    <div className={`flex items-center px-4 py-3 bg-gray-50 rounded-xl border transition-colors ${
                      locationInput.trim() ? "border-primary-400 ring-2 ring-primary-100" : "border-gray-200"
                    }`}>
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <input
                        ref={locationInputRef}
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        onFocus={preloadCities}
                        placeholder="City or ZIP code"
                        className="w-full ml-3 bg-transparent border-none text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 text-base"
                      />
                    </div>
                  </div>

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

                  {/* Divider */}
                  <div className="flex items-center gap-3 px-4 py-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">or search</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Popular Cities Label */}
                  {!locationInput.trim() && cityResults.length > 0 && (
                    <div className="px-4 pt-2 pb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Popular cities</span>
                    </div>
                  )}

                  {cityResults.map((loc) => (
                    <button
                      key={loc.full}
                      type="button"
                      onClick={() => {
                        setSearchLocation(loc.full);
                        setLocationInput(loc.full);
                        setShowLocationDropdown(false);
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                        searchLocation === loc.full
                          ? "bg-primary-50 text-primary-700"
                          : "text-gray-900"
                      }`}
                    >
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-medium">{loc.full}</span>
                    </button>
                  ))}
                  {cityResults.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">
                      No locations found
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Care Type Dropdown */}
            <div className="relative dropdown-container flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCareTypeDropdown(!showCareTypeDropdown);
                  setShowLocationDropdown(false);
                  setShowRatingDropdown(false);
                  setShowPaymentDropdown(false);
                  setShowSortDropdown(false);
                }}
                className={`flex items-center justify-between h-9 px-3 w-[180px] rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  !isAllTypes
                    ? "bg-white text-gray-900 border-2 border-gray-900"
                    : "bg-white border border-gray-300 text-gray-900 hover:border-gray-400"
                }`}
              >
                <span>{careTypeLabel}</span>
                <svg
                  className={`w-4 h-4 ml-2 transition-transform ${showCareTypeDropdown ? "rotate-180" : ""} ${!isAllTypes ? "text-gray-900" : "text-gray-400"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showCareTypeDropdown && (
                <div className="absolute left-0 top-[calc(100%+6px)] w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[100]">
                  {careTypes.map((type) => {
                    const isActive = (isAllTypes && type.id === "all") || careType === type.id;
                    return (
                      <button
                        key={type.id}
                        onClick={() => {
                          setShowCareTypeDropdown(false);
                          router.push(type.id === "all" ? "/browse" : `/browse?type=${type.id}`);
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-1 text-left text-base hover:bg-gray-50 transition-colors ${
                          isActive ? "text-gray-900 font-medium" : "text-gray-900"
                        }`}
                      >
                        {isActive ? (
                          <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="w-5" />
                        )}
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rating Dropdown */}
            <div className="relative dropdown-container flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRatingDropdown(!showRatingDropdown);
                  setShowLocationDropdown(false);
                  setShowCareTypeDropdown(false);
                  setShowPaymentDropdown(false);
                  setShowSortDropdown(false);
                }}
                className={`flex items-center justify-between h-9 px-3 w-[160px] rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                  selectedRating !== "any"
                    ? "bg-white text-gray-900 border-2 border-gray-900"
                    : "bg-white border border-gray-300 text-gray-900 hover:border-gray-400"
                }`}
              >
                <span className="truncate">{selectedRating === "any" ? "Rating" : `${selectedRating}+ Stars`}</span>
                <svg
                  className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${showRatingDropdown ? "rotate-180" : ""} ${selectedRating !== "any" ? "text-gray-900" : "text-gray-400"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showRatingDropdown && (
                <div className="absolute left-0 top-[calc(100%+6px)] w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[100]">
                  {ratingOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedRating(option.value);
                        setShowRatingDropdown(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-1 text-left text-base hover:bg-gray-50 transition-colors ${
                        selectedRating === option.value ? "text-gray-900 font-medium" : "text-gray-900"
                      }`}
                    >
                      {selectedRating === option.value ? (
                        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="w-5" />
                      )}
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Payments Dropdown */}
            <div className="relative dropdown-container flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPaymentDropdown(!showPaymentDropdown);
                  setShowLocationDropdown(false);
                  setShowCareTypeDropdown(false);
                  setShowRatingDropdown(false);
                  setShowSortDropdown(false);
                }}
                className={`flex items-center justify-between h-9 px-3 w-[160px] rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                  selectedPayment !== "any"
                    ? "bg-white text-gray-900 border-2 border-gray-900"
                    : "bg-white border border-gray-300 text-gray-900 hover:border-gray-400"
                }`}
              >
                <span className="truncate">{selectedPayment === "any" ? "Payments" : selectedPayment}</span>
                <svg
                  className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${showPaymentDropdown ? "rotate-180" : ""} ${selectedPayment !== "any" ? "text-gray-900" : "text-gray-400"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPaymentDropdown && (
                <div className="absolute left-0 top-[calc(100%+6px)] w-72 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[100]">
                  {paymentTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedPayment(option.value);
                        setShowPaymentDropdown(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-1 text-left text-base hover:bg-gray-50 transition-colors whitespace-nowrap ${
                        selectedPayment === option.value ? "text-gray-900 font-medium" : "text-gray-900"
                      }`}
                    >
                      {selectedPayment === option.value ? (
                        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="w-5" />
                      )}
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative dropdown-container flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSortDropdown(!showSortDropdown);
                  setShowLocationDropdown(false);
                  setShowCareTypeDropdown(false);
                  setShowRatingDropdown(false);
                  setShowPaymentDropdown(false);
                }}
                className={`flex items-center justify-between h-9 px-3 w-[160px] rounded-lg text-sm font-medium transition-colors overflow-hidden ${
                  sortBy !== "recommended"
                    ? "bg-white text-gray-900 border-2 border-gray-900"
                    : "bg-white border border-gray-300 text-gray-900 hover:border-gray-400"
                }`}
              >
                <span className="truncate">
                  {sortBy === "recommended" ? "Sort" : sortOptions.find((o) => o.value === sortBy)?.label}
                </span>
                <svg
                  className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${showSortDropdown ? "rotate-180" : ""} ${sortBy !== "recommended" ? "text-gray-900" : "text-gray-400"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showSortDropdown && (
                <div className="absolute left-0 top-[calc(100%+6px)] w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[100]">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortBy(option.value);
                        setShowSortDropdown(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-1 text-left text-base hover:bg-gray-50 transition-colors ${
                        sortBy === option.value ? "text-gray-900 font-medium" : "text-gray-900"
                      }`}
                    >
                      {sortBy === option.value ? (
                        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="w-5" />
                      )}
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear Filters - always rendered to prevent layout shift */}
            <button
              onClick={clearFilters}
              className={`flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                hasActiveFilters
                  ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                  : "invisible"
              }`}
              aria-hidden={!hasActiveFilters}
              tabIndex={hasActiveFilters ? 0 : -1}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          </div>

          {/* Right Side - View Toggle */}
          <div className="flex items-center flex-shrink-0">
            <div className="inline-flex items-center bg-gray-100 rounded-lg">
              <button
                onClick={() => setViewMode("carousel")}
                className={`flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-all ${
                  viewMode === "carousel"
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                List
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Grid
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg transition-all ${
                  viewMode === "map"
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className={viewMode === "map" ? "" : ""}>
        {/* Carousel View */}
        {viewMode === "carousel" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[94px] pb-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-[34px]">
              <h1 className="text-2xl font-bold text-gray-900">
                {careTypeLabel} in {searchLocation}
              </h1>
              <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-900">
                {filteredProviders.length} {filteredProviders.length === 1 ? "result" : "results"}
              </span>
            </div>

            {isAllTypes ? (
              <>
                <CarouselSection
                  title={`Top Rated Providers in ${searchLocation}`}
                  providers={topRatedProviders}
                  scrollId="top-rated-scroll"
                />
                <CarouselSection
                  title={`Home Care Services in ${searchLocation}`}
                  providers={homeCareProviders}
                  scrollId="home-care-scroll"
                />
                <CarouselSection
                  title={`Assisted Living Communities in ${searchLocation}`}
                  providers={assistedLivingProviders}
                  scrollId="assisted-living-scroll"
                />
                <CarouselSection
                  title={`Memory Care Facilities in ${searchLocation}`}
                  providers={memoryCareProviders}
                  scrollId="memory-care-scroll"
                />
                <CarouselSection
                  title={`Nursing Homes in ${searchLocation}`}
                  providers={nursingHomeProviders}
                  scrollId="nursing-homes-scroll"
                />
              </>
            ) : filteredProviders.length > 0 ? (
              <>
                <CarouselSection
                  title={`Top Rated ${careTypeLabel} in ${searchLocation}`}
                  providers={topRatedProviders}
                  scrollId="top-rated-scroll"
                />
                {affordableProviders.length > 0 && (
                  <CarouselSection
                    title={`Affordable ${careTypeLabel} in ${searchLocation}`}
                    providers={affordableProviders}
                    scrollId="affordable-scroll"
                  />
                )}
                <CarouselSection
                  title={`Highly Reviewed ${careTypeLabel} in ${searchLocation}`}
                  providers={highlyReviewedProviders}
                  scrollId="highly-reviewed-scroll"
                />
                {featuredProviders.length > 0 && (
                  <CarouselSection
                    title={`Featured ${careTypeLabel} in ${searchLocation}`}
                    providers={featuredProviders}
                    scrollId="featured-scroll"
                  />
                )}
              </>
            ) : (
              <EmptyState onClear={clearFilters} />
            )}
          </div>
        )}

        {/* Grid View */}
        {viewMode === "grid" && (
          <div className="min-h-[calc(100vh-200px)] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[94px] pb-8">
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {careTypeLabel} in {searchLocation}
              </h1>
              <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-900">
                {filteredProviders.length} {filteredProviders.length === 1 ? "result" : "results"}
              </span>
            </div>

            {filteredProviders.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {paginatedProviders.map((provider, index) => (
                    <ProviderCard key={`${provider.id}-${index}`} provider={provider} />
                  ))}
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredProviders.length}
                  itemsPerPage={PROVIDERS_PER_PAGE}
                  onPageChange={setCurrentPage}
                  itemLabel="providers"
                  className="mt-8"
                />
              </>
            ) : (
              <EmptyState onClear={clearFilters} />
            )}
          </div>
        )}

        {/* Map View */}
        {viewMode === "map" && (
          <div className="flex" style={{ height: "100vh" }}>
            {/* Left Side - Listings (aligned with navbar) */}
            <div
              ref={mapListingsRef}
              className="w-full lg:flex-1 h-full overflow-y-auto bg-gray-50"
            >
              <div className="px-4 sm:px-6 lg:pr-6 pt-6 pb-8" style={{ paddingLeft: "max(calc((100vw - 80rem) / 2 + 2rem), 2rem)" }}>
                <div className="flex items-center gap-3 mb-4">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {careTypeLabel} in {searchLocation}
                  </h1>
                  <span className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-900">
                    {filteredProviders.length} {filteredProviders.length === 1 ? "result" : "results"}
                  </span>
                </div>

                {filteredProviders.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {filteredProviders.map((provider, index) => (
                        <div
                          key={`${provider.id}-${index}`}
                          onMouseEnter={() => setHoveredProviderId(provider.id)}
                          onMouseLeave={() => setHoveredProviderId(null)}
                        >
                          <ProviderCard provider={provider} />
                        </div>
                      ))}
                    </div>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={filteredProviders.length}
                      itemsPerPage={PROVIDERS_PER_PAGE}
                      onPageChange={setCurrentPage}
                      itemLabel="providers"
                      className="mt-6"
                    />
                  </>
                ) : (
                  <EmptyState onClear={clearFilters} />
                )}
              </div>
            </div>

            {/* Right Side - Interactive Map */}
            <div className="hidden lg:flex flex-col w-[600px] h-full pt-6 pb-[90px] pl-0" style={{ paddingRight: "max(calc((100vw - 80rem) / 2 + 2rem), 1rem)" }}>
              <div className="relative w-full flex-1 min-h-0 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
                <BrowseMap
                  providers={filteredProviders}
                  hoveredProviderId={hoveredProviderId}
                  onMarkerHover={setHoveredProviderId}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No providers found</h3>
      <p className="text-gray-500 mb-6">Try adjusting your filters or search in a different area.</p>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
      >
        Clear all filters
      </button>
    </div>
  );
}
