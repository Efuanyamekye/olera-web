"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MOCK_RESOURCES, searchResources } from "@/data/mock/resources";
import { Resource } from "@/types/resource";
import { CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";
import Pagination from "@/components/ui/Pagination";

// Color-coded category styles (matching Community Forum)
const CATEGORY_STYLES: Record<CareTypeId, { emoji: string; bg: string; text: string }> = {
  "home-health": { emoji: "🏥", bg: "bg-rose-100", text: "text-rose-700" },
  "home-care": { emoji: "🏠", bg: "bg-amber-100", text: "text-amber-700" },
  "assisted-living": { emoji: "🤝", bg: "bg-blue-100", text: "text-blue-700" },
  "memory-care": { emoji: "🧠", bg: "bg-purple-100", text: "text-purple-700" },
  "nursing-homes": { emoji: "🏢", bg: "bg-emerald-100", text: "text-emerald-700" },
  "independent-living": { emoji: "☀️", bg: "bg-orange-100", text: "text-orange-700" },
};

// Care type emojis for the CTA banner
const CARE_TYPE_EMOJI: Record<CareTypeId, string> = {
  "home-health": "🏥",
  "home-care": "🏠",
  "assisted-living": "🤝",
  "memory-care": "🧠",
  "nursing-homes": "🏢",
  "independent-living": "☀️",
};

// Contextual CTA Banner component
function ProviderBanner({ careType }: { careType: CareTypeId }) {
  const emoji = CARE_TYPE_EMOJI[careType];
  const label = CARE_TYPE_CONFIG[careType].label;

  return (
    <Link
      href={`/browse?type=${careType}`}
      className="group relative block col-span-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50 via-primary-50/80 to-white border border-primary-100/60 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/40 transition-all duration-300"
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 to-primary-600" />

      <div className="p-6 pl-7 flex items-center gap-5">
        {/* Icon circle */}
        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
          <span className="text-2xl">{emoji}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-lg font-bold text-gray-900 leading-snug">
            Looking for {label.toLowerCase()} providers?
          </h4>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse verified providers in your area and compare options.
          </p>
        </div>

        {/* Arrow circle */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center group-hover:bg-primary-600 transition-colors duration-300">
          <svg className="w-5 h-5 text-primary-600 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ArticleCard({ resource }: { resource: Resource }) {
  const careType = resource.careTypes[0];
  const style = careType ? CATEGORY_STYLES[careType] : null;

  return (
    <Link href={`/resources/${resource.slug}`} className="group block">
      <article>
        <div className="aspect-[2/1] mb-4 rounded-xl overflow-hidden relative">
          <img
            src={resource.coverImage}
            alt={resource.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {careType && style && (
            <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg ${style.bg} ${style.text}`}>
              <span>{style.emoji}</span>
              {CARE_TYPE_CONFIG[careType].label}
            </span>
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-900 leading-tight group-hover:text-primary-600 transition-colors mb-1 line-clamp-2">
          {resource.title}
        </h3>
        <span className="text-sm text-gray-400">
          {formatDate(resource.publishedAt)}
        </span>
      </article>
    </Link>
  );
}

const ARTICLES_PER_PAGE = 12;

function ResourcesPageContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const [activeCareType, setActiveCareType] = useState<CareTypeId | "all">(
    (typeParam as CareTypeId) || "all"
  );
  const [currentPage, setCurrentPage] = useState(1);

  // Calculate counts for each category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: MOCK_RESOURCES.length };
    ALL_CARE_TYPES.forEach((careType) => {
      counts[careType] = MOCK_RESOURCES.filter((r) =>
        r.careTypes.includes(careType)
      ).length;
    });
    return counts;
  }, []);

  const filteredResources = useMemo(() => {
    let resources = MOCK_RESOURCES;

    if (activeCareType !== "all") {
      resources = resources.filter((r) => r.careTypes.includes(activeCareType));
    }

    return [...resources].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [activeCareType]);

  // Pagination
  const totalPages = Math.ceil(filteredResources.length / ARTICLES_PER_PAGE);
  const paginatedResources = useMemo(() => {
    const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;
    return filteredResources.slice(startIndex, startIndex + ARTICLES_PER_PAGE);
  }, [filteredResources, currentPage]);

  // Reset to page 1 when category changes
  const handleCategoryChange = (category: CareTypeId | "all") => {
    setActiveCareType(category);
    setCurrentPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-1">
            Care seeker resources
          </h1>
          <p className="text-lg text-gray-500 max-w-lg mx-auto">
            Guides and practical advice to help you navigate senior care.
          </p>
        </header>

        {/* Category Pills */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex flex-wrap justify-center gap-1.5 p-1.5 bg-gray-100/80 rounded-full">
            <button
              onClick={() => handleCategoryChange("all")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCareType === "all"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All ({categoryCounts.all})
            </button>
            {ALL_CARE_TYPES.map((careType) => (
              <button
                key={careType}
                onClick={() => handleCategoryChange(careType)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeCareType === careType
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {CARE_TYPE_CONFIG[careType].label} ({categoryCounts[careType]})
              </button>
            ))}
          </div>
        </div>

        {/* Articles Grid with Contextual Banner */}
        {paginatedResources.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* First 6 articles */}
            {paginatedResources.slice(0, 6).map((resource) => (
              <ArticleCard key={resource.id} resource={resource} />
            ))}

            {/* Contextual Provider Banner - only show if we have more than 3 articles */}
            {paginatedResources.length > 3 && (
              <ProviderBanner
                careType={activeCareType === "all" ? "home-health" : activeCareType}
              />
            )}

            {/* Remaining articles */}
            {paginatedResources.slice(6).map((resource) => (
              <ArticleCard key={resource.id} resource={resource} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="text-gray-400 mb-4">No articles found</p>
            <button
              onClick={() => handleCategoryChange("all")}
              className="text-sm text-gray-900 underline underline-offset-4"
            >
              View all
            </button>
          </div>
        )}

        {/* Pagination */}
        <div className="mt-12 flex justify-center">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredResources.length}
            itemsPerPage={ARTICLES_PER_PAGE}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            itemLabel="articles"
            showItemCount={false}
          />
        </div>
      </div>
    </main>
  );
}

function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <div className="h-12 w-72 bg-gray-200 rounded-lg mx-auto mb-4 animate-pulse" />
          <div className="h-5 w-96 bg-gray-200 rounded mx-auto animate-pulse" />
        </div>
        <div className="flex gap-2 mb-12">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i}>
              <div className="aspect-[4/3] bg-gray-200 rounded-2xl mb-4 animate-pulse" />
              <div className="h-4 w-20 bg-gray-200 rounded mb-2 animate-pulse" />
              <div className="h-5 w-full bg-gray-200 rounded mb-2 animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function ResourcesPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ResourcesPageContent />
    </Suspense>
  );
}
