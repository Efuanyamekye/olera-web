"use client";

import { useRouter } from "next/navigation";
import { CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";

interface ForumCategoryTabsV2Props {
  activeCategory: CareTypeId | "all";
}

export default function ForumCategoryTabsV2({ activeCategory }: ForumCategoryTabsV2Props) {
  const router = useRouter();

  const handleCategoryChange = (category: CareTypeId | "all") => {
    if (category === "all") {
      router.push("/community");
    } else {
      router.push(`/community/${category}`);
    }
  };

  return (
    <div className="border-b border-gray-100">
      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max">
          <button
            onClick={() => handleCategoryChange("all")}
            className={`relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeCategory === "all"
                ? "text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All Topics
            {activeCategory === "all" && (
              <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-gray-900 rounded-full" />
            )}
          </button>
          {ALL_CARE_TYPES.map((careType) => {
            const config = CARE_TYPE_CONFIG[careType];
            const isActive = activeCategory === careType;
            return (
              <button
                key={careType}
                onClick={() => handleCategoryChange(careType)}
                className={`relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {config.label}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-gray-900 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
