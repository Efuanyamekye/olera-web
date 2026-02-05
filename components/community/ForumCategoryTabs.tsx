"use client";

import { useRouter } from "next/navigation";
import { CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";
import { getCategoryPostCounts } from "@/data/mock/forumPosts";

interface ForumCategoryTabsProps {
  activeCategory: CareTypeId | "all";
}

export default function ForumCategoryTabs({ activeCategory }: ForumCategoryTabsProps) {
  const router = useRouter();
  const postCounts = getCategoryPostCounts();

  const handleCategoryChange = (category: CareTypeId | "all") => {
    if (category === "all") {
      router.push("/community");
    } else {
      router.push(`/community/${category}`);
    }
  };

  const totalPosts = Object.values(postCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 min-w-max pb-2">
        <button
          onClick={() => handleCategoryChange("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
            activeCategory === "all" ? "bg-primary-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          All Topics
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory === "all" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
            {totalPosts}
          </span>
        </button>
        {ALL_CARE_TYPES.map((careType) => {
          const config = CARE_TYPE_CONFIG[careType];
          const count = postCounts[careType];
          const isActive = activeCategory === careType;
          return (
            <button
              key={careType}
              onClick={() => handleCategoryChange(careType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive ? "bg-primary-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {config.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
