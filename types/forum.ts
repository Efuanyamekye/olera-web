/**
 * Forum data types for the Olera Community Forum
 */

export type CareTypeId =
  | "home-health"
  | "home-care"
  | "assisted-living"
  | "memory-care"
  | "nursing-homes"
  | "independent-living";

export type AuthorRole = "family" | "caregiver" | "provider" | "expert";

export type SortOption = "recent" | "popular" | "unanswered" | "most-discussed";

export interface ForumAuthor {
  id: string;
  displayName: string;
  avatar?: string;
  isAnonymous: boolean;
  role: AuthorRole;
  joinedDate: string;
  postCount: number;
}

export interface ForumPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  author: ForumAuthor;
  careType: CareTypeId;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
}

export interface ForumComment {
  id: string;
  postId: string;
  parentId?: string;
  content: string;
  author: ForumAuthor;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  isAcceptedAnswer: boolean;
  replies?: ForumComment[];
}

export interface ForumCategory {
  id: CareTypeId;
  label: string;
  description: string;
  postCount: number;
  color: string;
}

export interface ForumFilters {
  careType?: CareTypeId | "all";
  sortBy: SortOption;
  searchQuery?: string;
  page: number;
  limit: number;
}

// Care type display configuration
export const CARE_TYPE_CONFIG: Record<
  CareTypeId,
  { label: string; color: string; bgColor: string }
> = {
  "home-health": {
    label: "Home Health",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
  },
  "home-care": {
    label: "Home Care",
    color: "text-teal-700",
    bgColor: "bg-teal-100",
  },
  "assisted-living": {
    label: "Assisted Living",
    color: "text-primary-700",
    bgColor: "bg-primary-100",
  },
  "memory-care": {
    label: "Memory Care",
    color: "text-purple-700",
    bgColor: "bg-purple-100",
  },
  "nursing-homes": {
    label: "Nursing Homes",
    color: "text-red-700",
    bgColor: "bg-red-100",
  },
  "independent-living": {
    label: "Independent Living",
    color: "text-green-700",
    bgColor: "bg-green-100",
  },
};

// Helper to get all care type IDs
export const ALL_CARE_TYPES: CareTypeId[] = [
  "home-health",
  "home-care",
  "assisted-living",
  "memory-care",
  "nursing-homes",
  "independent-living",
];
