"use client";

import { useRouter } from "next/navigation";
import { CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";

interface ForumCategoryTabsV3Props {
  activeCategory: CareTypeId | "all";
  baseUrl?: string; // Allow custom base URL for V2/V3
}

// Icons for each category
const CATEGORY_ICONS: Record<CareTypeId | "all", string> = {
  all: "chat",
  "home-health": "medical",
  "home-care": "home",
  "assisted-living": "building",
  "memory-care": "brain",
  "nursing-homes": "hospital",
  "independent-living": "sun",
};

function CategoryIcon({ type, isActive }: { type: CareTypeId | "all"; isActive: boolean }) {
  const iconClass = `w-4 h-4 ${isActive ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"}`;

  switch (CATEGORY_ICONS[type]) {
    case "chat":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case "medical":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 12.75l6 6 9-13.5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      );
    case "home":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "building":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case "brain":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "hospital":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m4-12h.01M12 12h.01M12 16h.01" />
        </svg>
      );
    case "sun":
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ForumCategoryTabsV3({ activeCategory, baseUrl = "/community" }: ForumCategoryTabsV3Props) {
  const router = useRouter();

  const handleCategoryChange = (category: CareTypeId | "all") => {
    if (category === "all") {
      router.push(baseUrl);
    } else {
      router.push(`${baseUrl}/${category}`);
    }
  };

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max py-1">
          {/* All Topics tab */}
          <button
            onClick={() => handleCategoryChange("all")}
            className={`group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 ${
              activeCategory === "all"
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <CategoryIcon type="all" isActive={activeCategory === "all"} />
            <span>All Topics</span>
          </button>

          {/* Divider */}
          <div className="w-px bg-gray-200 mx-2 my-2" />

          {/* Care type tabs */}
          {ALL_CARE_TYPES.map((careType) => {
            const config = CARE_TYPE_CONFIG[careType];
            const isActive = activeCategory === careType;
            return (
              <button
                key={careType}
                onClick={() => handleCategoryChange(careType)}
                className={`group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <CategoryIcon type={careType} isActive={isActive} />
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
