/**
 * Resource/Guide types for the Olera Resources Center
 */

import { CareTypeId } from "./forum";

export type ResourceCategory =
  | "guide"           // Comprehensive guides
  | "comparison"      // Side-by-side comparisons
  | "financial"       // Payment, costs, insurance
  | "checklist"       // Actionable checklists
  | "story"           // Personal stories/experiences
  | "news";           // Industry news/updates

export type ReadingTime =
  | "3 min" | "4 min" | "5 min" | "6 min" | "7 min"
  | "8 min" | "9 min" | "10 min" | "11 min" | "12 min"
  | "13 min" | "15 min" | "20 min";

export interface ResourceAuthor {
  name: string;
  role: string;
  avatar?: string;
}

export interface Resource {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content?: string;
  coverImage: string;
  careTypes: CareTypeId[];     // Can belong to multiple care types
  category: ResourceCategory;
  author: ResourceAuthor;
  publishedAt: string;
  updatedAt?: string;
  readingTime: ReadingTime;
  featured: boolean;
  tags: string[];
}

// Category display configuration
export const RESOURCE_CATEGORY_CONFIG: Record<
  ResourceCategory,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  guide: {
    label: "Guide",
    icon: "book",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
  },
  comparison: {
    label: "Comparison",
    icon: "compare",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
  },
  financial: {
    label: "Financial",
    icon: "dollar",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
  },
  checklist: {
    label: "Checklist",
    icon: "check",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
  },
  story: {
    label: "Story",
    icon: "heart",
    color: "text-rose-700",
    bgColor: "bg-rose-50",
  },
  news: {
    label: "News",
    icon: "news",
    color: "text-gray-700",
    bgColor: "bg-gray-100",
  },
};

// Quick filter tags for the hero section
export const QUICK_FILTER_TAGS = [
  { label: "Getting Started", query: "getting-started" },
  { label: "Costs & Payment", query: "financial" },
  { label: "Comparisons", query: "comparison" },
  { label: "Checklists", query: "checklist" },
  { label: "Medicare & Medicaid", query: "medicare" },
];

// Helper to get all resource categories
export const ALL_RESOURCE_CATEGORIES: ResourceCategory[] = [
  "guide",
  "comparison",
  "financial",
  "checklist",
  "story",
  "news",
];
