"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  type Provider,
  PROVIDERS_TABLE,
  formatLocation,
  formatPriceRange,
  getCategoryDisplayName,
  getPrimaryImage,
  toCardFormat,
  mockToCardFormat,
  type ProviderCardData,
} from "@/lib/types/provider";
import { allBrowseProviders } from "@/lib/mock-providers";
import BrowseFilters from "@/components/browse/BrowseFilters";

// Care types matching iOS Supabase provider_category values
const CARE_TYPE_OPTIONS = [
  { label: "Home Care", value: "Home Care (Non-medical)" },
  { label: "Home Health", value: "Home Health Care" },
  { label: "Assisted Living", value: "Assisted Living" },
  { label: "Memory Care", value: "Memory Care" },
  { label: "Independent Living", value: "Independent Living" },
  { label: "Nursing Home", value: "Nursing Home" },
];

interface BrowsePageClientProps {
  searchQuery: string;
  careTypeFilter: string;
  stateFilter: string;
}

export default function BrowsePageClient({
  searchQuery,
  careTypeFilter,
  stateFilter,
}: BrowsePageClientProps) {
  const [providers, setProviders] = useState<ProviderCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);

  useEffect(() => {
    async function fetchProviders() {
      // Always try Supabase first (don't check isSupabaseConfigured - it can give false negatives)
      try {
        const supabase = createClient();

        // Base query - match homepage pattern exactly
        const { data, error } = await supabase
          .from(PROVIDERS_TABLE)
          .select("*")
          .eq("deleted", false)
          .order("google_rating", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Browse fetch error:", error.message);
          // Fall back to mock data
          setProviders(allBrowseProviders.map(mockToCardFormat));
          setUsingMockData(true);
        } else if (!data || data.length === 0) {
          // No results from Supabase - show mock data as fallback
          setProviders(allBrowseProviders.map(mockToCardFormat));
          setUsingMockData(true);
        } else {
          // Success! Use real data
          setProviders((data as Provider[]).map(toCardFormat));
          setUsingMockData(false);
        }
      } catch (err) {
        console.error("Browse page error:", err);
        // Fall back to mock data on any error
        setProviders(allBrowseProviders.map(mockToCardFormat));
        setUsingMockData(true);
      }

      setIsLoading(false);
    }

    fetchProviders();
  }, [searchQuery, careTypeFilter, stateFilter]);

  // Filter mock data client-side if using fallback
  const filteredProviders = usingMockData
    ? providers.filter((p) => {
        // Apply care type filter
        if (careTypeFilter) {
          const careTypeOption = CARE_TYPE_OPTIONS.find(
            (ct) => ct.label.toLowerCase().replace(/\s+/g, "-") === careTypeFilter
          );
          if (careTypeOption && p.primaryCategory) {
            // Match category loosely
            const searchTerm = careTypeOption.label.toLowerCase();
            if (!p.primaryCategory.toLowerCase().includes(searchTerm)) {
              return false;
            }
          }
        }
        // Apply search filter
        if (searchQuery) {
          const search = searchQuery.toLowerCase();
          const nameMatch = p.name.toLowerCase().includes(search);
          const addressMatch = p.address?.toLowerCase().includes(search);
          if (!nameMatch && !addressMatch) {
            return false;
          }
        }
        return true;
      })
    : providers;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Browse Care Providers
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Find and compare trusted senior care providers in your area.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <BrowseFilters
          careTypes={CARE_TYPE_OPTIONS.map((ct) => ct.label)}
          currentQuery={searchQuery}
          currentType={careTypeFilter}
          currentState={stateFilter}
        />
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-4 text-lg text-gray-600">Loading providers...</p>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No providers found
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              {searchQuery || careTypeFilter || stateFilter
                ? "Try adjusting your filters or search term."
                : "No providers have been listed yet."}
            </p>
            {(searchQuery || careTypeFilter || stateFilter) && (
              <Link
                href="/browse"
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                Clear all filters
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="text-base text-gray-500 mb-6">
              {filteredProviders.length} provider{filteredProviders.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProviders.map((provider) => (
                <ProviderBrowseCard key={provider.id} provider={provider} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProviderBrowseCard({ provider }: { provider: ProviderCardData }) {
  const rating = provider.rating;

  return (
    <Link
      href={`/provider/${provider.slug || provider.id}`}
      className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-primary-200 transition-shadow duration-200 block cursor-pointer"
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-200">
        {provider.image ? (
          <img
            src={provider.image}
            alt={provider.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-300 flex items-center justify-center">
            <span className="text-4xl font-bold text-primary-600/40">
              {provider.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Rating badge */}
        {rating && rating >= 4.0 && (
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-gray-900 text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1.5">
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {rating.toFixed(1)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Category */}
        {provider.primaryCategory && (
          <p className="text-xs font-semibold text-primary-600 uppercase tracking-wide mb-1">
            {provider.primaryCategory}
          </p>
        )}

        <h3 className="font-semibold text-gray-900 text-lg leading-tight">
          {provider.name}
        </h3>

        {provider.address && (
          <p className="text-gray-500 text-base mt-1">{provider.address}</p>
        )}

        {provider.priceRange && (
          <div className="mt-3">
            <p className="text-gray-500 text-sm">Estimated Pricing</p>
            <p className="text-gray-900 font-semibold">{provider.priceRange}</p>
          </div>
        )}

        <div className="mt-4 text-primary-600 font-medium text-base">
          View provider
        </div>
      </div>
    </Link>
  );
}
