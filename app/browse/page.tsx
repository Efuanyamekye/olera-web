import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile, OrganizationMetadata, CaregiverMetadata } from "@/lib/types";
import BrowseFilters from "@/components/browse/BrowseFilters";

const CARE_TYPE_OPTIONS = [
  "Assisted Living",
  "Memory Care",
  "Independent Living",
  "Skilled Nursing",
  "Home Care",
  "Home Health",
  "Hospice",
  "Respite Care",
  "Adult Day Care",
  "Rehabilitation",
];

interface BrowsePageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    state?: string;
    location?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const params = await searchParams;
  const searchQuery = params.q || params.location || "";
  const careTypeFilter = params.type || "";
  const stateFilter = params.state || "";

  let profiles: Profile[] = [];
  let fetchError = false;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("profiles")
      .select("*")
      .neq("type", "family")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);

    // Text search on display_name or city
    if (searchQuery) {
      query = query.or(
        `display_name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,zip.eq.${searchQuery}`
      );
    }

    // State filter
    if (stateFilter) {
      query = query.ilike("state", stateFilter);
    }

    // Care type filter
    if (careTypeFilter) {
      // Map URL slug back to display name
      const careTypeName = CARE_TYPE_OPTIONS.find(
        (ct) => ct.toLowerCase().replace(/\s+/g, "-") === careTypeFilter
      );
      if (careTypeName) {
        query = query.contains("care_types", [careTypeName]);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("Browse fetch error:", error.message);
      fetchError = true;
    } else {
      profiles = (data as Profile[]) || [];
    }
  } catch {
    fetchError = true;
  }

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
          careTypes={CARE_TYPE_OPTIONS}
          currentQuery={searchQuery}
          currentType={careTypeFilter}
          currentState={stateFilter}
        />
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {fetchError ? (
          <div className="text-center py-12">
            <p className="text-lg text-gray-600">
              Unable to load providers. Please try again later.
            </p>
          </div>
        ) : profiles.length === 0 ? (
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
              {profiles.length} provider{profiles.length !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {profiles.map((profile) => (
                <BrowseCard key={profile.id} profile={profile} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BrowseCard({ profile }: { profile: Profile }) {
  const meta = profile.metadata as OrganizationMetadata & CaregiverMetadata;
  const priceRange =
    meta?.price_range ||
    (meta?.hourly_rate_min && meta?.hourly_rate_max
      ? `$${meta.hourly_rate_min}-${meta.hourly_rate_max}/hr`
      : null);
  const locationStr = [profile.city, profile.state].filter(Boolean).join(", ");
  const displayedCareTypes = (profile.care_types || []).slice(0, 2);
  const remainingCount = Math.max(0, (profile.care_types || []).length - 2);

  return (
    <Link
      href={`/provider/${profile.slug}`}
      className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md hover:border-primary-200 hover:-translate-y-0.5 transition-all duration-200 block cursor-pointer"
    >
      {/* Image */}
      <div className="relative h-48 bg-gray-200">
        {profile.image_url ? (
          <img
            src={profile.image_url}
            alt={profile.display_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 to-primary-300 flex items-center justify-center">
            <span className="text-4xl font-bold text-primary-600/40">
              {profile.display_name.charAt(0)}
            </span>
          </div>
        )}

        {/* Claim state badge */}
        {profile.claim_state === "claimed" &&
          profile.verification_state === "verified" && (
            <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-primary-600 text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Verified
            </div>
          )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-lg leading-tight">
          {profile.display_name}
        </h3>

        {locationStr && (
          <p className="text-gray-500 text-base mt-1">{locationStr}</p>
        )}

        {priceRange && (
          <div className="mt-3">
            <p className="text-gray-500 text-sm">Estimated Pricing</p>
            <p className="text-gray-900 font-semibold">{priceRange}</p>
          </div>
        )}

        {displayedCareTypes.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {displayedCareTypes.map((ct) => (
              <span
                key={ct}
                className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full"
              >
                {ct}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full">
                +{remainingCount} more
              </span>
            )}
          </div>
        )}

        <div className="mt-4 text-primary-600 font-medium text-base">
          View provider
        </div>
      </div>
    </Link>
  );
}
