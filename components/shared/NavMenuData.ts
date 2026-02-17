/**
 * Navigation data for the Find Care mega-menu and top-level nav links.
 */

export interface NavResource {
  title: string;
  href: string;
  icon: "chat" | "heart" | "dollar" | "compare" | "book" | "info" | "shield";
}

export interface CareCategory {
  id: string;
  label: string;
  headline: string;
  description: string;
  image: string;
  resources: NavResource[];
}

export interface NavLink {
  label: string;
  href: string;
}

export const CARE_CATEGORIES: CareCategory[] = [
  {
    id: "home-health",
    label: "Home Health",
    headline: "Find Home Health Near You",
    description: "Skilled medical care in the comfort of home",
    image: "/images/home-health.webp",
    resources: [
      { title: "Community Forum", href: "/community?category=home-health", icon: "chat" },
      { title: "Home Health Guide", href: "/resources?type=home-health", icon: "book" },
      { title: "Paying for Home Health", href: "/benefits?type=home-health", icon: "dollar" },
      { title: "Home Health vs Home Care", href: "/resources/home-health-vs-home-care", icon: "info" },
    ],
  },
  {
    id: "home-care",
    label: "Home Care",
    headline: "Find Home Care Near You",
    description: "In-home assistance for daily living activities",
    image: "/images/home-care.jpg",
    resources: [
      { title: "Community Forum", href: "/community?category=home-care", icon: "chat" },
      { title: "Home Care Guide", href: "/resources?type=home-care", icon: "book" },
      { title: "Paying for Home Care", href: "/benefits?type=home-care", icon: "dollar" },
      { title: "When to Consider Home Care", href: "/resources/caregiver-burnout-prevention", icon: "info" },
    ],
  },
  {
    id: "assisted-living",
    label: "Assisted Living",
    headline: "Find Assisted Living Near You",
    description: "Residential communities with personal care support",
    image: "/images/assisted-living.webp",
    resources: [
      { title: "Community Forum", href: "/community?category=assisted-living", icon: "chat" },
      { title: "Assisted Living Guide", href: "/resources?type=assisted-living", icon: "book" },
      { title: "Paying for Assisted Living", href: "/benefits?type=assisted-living", icon: "dollar" },
      { title: "Assisted Living vs Nursing Home", href: "/resources/nursing-home-vs-assisted-living", icon: "info" },
    ],
  },
  {
    id: "memory-care",
    label: "Memory Care",
    headline: "Find Memory Care Near You",
    description: "Specialized care for dementia and Alzheimer's",
    image: "/images/memory-care.jpg",
    resources: [
      { title: "Community Forum", href: "/community?category=memory-care", icon: "chat" },
      { title: "Memory Care Guide", href: "/resources?type=memory-care", icon: "book" },
      { title: "Paying for Memory Care", href: "/benefits?type=memory-care", icon: "dollar" },
      { title: "Signs It's Time for Memory Care", href: "/resources/when-its-time-for-memory-care", icon: "info" },
    ],
  },
  {
    id: "nursing-homes",
    label: "Nursing Homes",
    headline: "Find Nursing Homes Near You",
    description: "24/7 skilled nursing and medical care",
    image: "/images/nursing-homes.webp",
    resources: [
      { title: "Community Forum", href: "/community?category=nursing-homes", icon: "chat" },
      { title: "Nursing Home Guide", href: "/resources?type=nursing-homes", icon: "book" },
      { title: "Paying for Nursing Home", href: "/benefits?type=nursing-homes", icon: "dollar" },
      { title: "Medicare & Medicaid Coverage", href: "/resources/medicaid-nursing-home-coverage", icon: "info" },
    ],
  },
  {
    id: "independent-living",
    label: "Independent Living",
    headline: "Find Independent Living Near You",
    description: "Active adult communities for seniors",
    image: "/images/independent-living.jpg",
    resources: [
      { title: "Community Forum", href: "/community?category=independent-living", icon: "chat" },
      { title: "Independent Living Guide", href: "/resources?type=independent-living", icon: "book" },
      { title: "Paying for Independent Living", href: "/benefits?type=independent-living", icon: "dollar" },
      { title: "Is Independent Living Right?", href: "/resources/independent-living-guide", icon: "info" },
    ],
  },
];

export const NAV_LINKS: NavLink[] = [
  { label: "Community", href: "/community" },
  { label: "Resources", href: "/resources" },
  { label: "Benefits Center", href: "/benefits" },
];
