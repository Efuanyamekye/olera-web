import Link from "next/link";
import type { ProfileCategory } from "@/lib/types";

const categoryToBrowseSlug: Partial<Record<ProfileCategory, string>> = {
  home_care_agency: "home-care",
  home_health_agency: "home-health",
  assisted_living: "assisted-living",
  memory_care: "memory-care",
  nursing_home: "skilled-nursing",
  independent_living: "independent-living",
  hospice_agency: "hospice",
  inpatient_hospice: "hospice",
};

const categoryLabels: Partial<Record<ProfileCategory, string>> = {
  home_care_agency: "Home Care",
  home_health_agency: "Home Health",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  independent_living: "Independent Living",
  hospice_agency: "Hospice",
  inpatient_hospice: "Hospice",
};

interface BreadcrumbsProps {
  category: ProfileCategory | null;
  city: string | null;
  state: string | null;
  providerName: string;
}

function Chevron() {
  return (
    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function Breadcrumbs({ category, city, state, providerName }: BreadcrumbsProps) {
  const browseSlug = category ? categoryToBrowseSlug[category] : null;
  const categoryLabel = category ? categoryLabels[category] : null;
  const locationStr = [city, state].filter(Boolean).join(", ");

  return (
    <nav className="hidden md:flex items-center gap-2 text-sm mb-2 flex-wrap" aria-label="Breadcrumb">
      <Link href="/" className="text-gray-500 hover:text-gray-700 transition-colors">
        Home
      </Link>

      {categoryLabel && browseSlug && (
        <>
          <Chevron />
          <Link
            href={`/browse?type=${browseSlug}`}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            {categoryLabel}
          </Link>
        </>
      )}

      {locationStr && browseSlug && (
        <>
          <Chevron />
          <Link
            href={`/browse?type=${browseSlug}&q=${encodeURIComponent(locationStr)}`}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            {locationStr}
          </Link>
        </>
      )}

      <Chevron />
      <span className="text-gray-900 font-medium truncate max-w-[300px]">
        {providerName}
      </span>
    </nav>
  );
}
