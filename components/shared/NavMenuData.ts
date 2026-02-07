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
      { title: "Home Health Guide", href: "/resources/home-health", icon: "heart" },
      { title: "Paying for Home Health", href: "/resources/paying-for-home-health", icon: "dollar" },
      { title: "Home Health vs Home Care", href: "/resources/home-health-vs-home-care", icon: "compare" },
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
      { title: "Home Care Support", href: "/resources/home-care", icon: "heart" },
      { title: "Paying for Home Care", href: "/resources/paying-for-home-care", icon: "dollar" },
      { title: "Home Care vs Home Health", href: "/resources/home-care-vs-home-health", icon: "compare" },
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
      { title: "Assisted Living Guide", href: "/resources/assisted-living", icon: "book" },
      { title: "Paying for Assisted Living", href: "/resources/paying-for-assisted-living", icon: "dollar" },
      { title: "Assisted Living vs Nursing Home", href: "/resources/assisted-living-vs-nursing-home", icon: "compare" },
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
      { title: "Memory Care Guide", href: "/resources/memory-care", icon: "book" },
      { title: "Paying for Memory Care", href: "/resources/paying-for-memory-care", icon: "dollar" },
      { title: "Signs It's Time for Memory Care", href: "/resources/when-memory-care", icon: "info" },
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
      { title: "Nursing Home Guide", href: "/resources/nursing-homes", icon: "book" },
      { title: "Paying for Nursing Home", href: "/resources/paying-for-nursing-home", icon: "dollar" },
      { title: "Medicare & Medicaid Coverage", href: "/resources/medicare-medicaid", icon: "shield" },
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
      { title: "Independent Living Guide", href: "/resources/independent-living", icon: "book" },
      { title: "Cost of Independent Living", href: "/resources/independent-living-costs", icon: "dollar" },
      { title: "Is Independent Living Right?", href: "/resources/is-independent-living-right", icon: "info" },
    ],
  },
];

export const NAV_LINKS: NavLink[] = [
  { label: "Community", href: "/community" },
  { label: "Resources", href: "/resources" },
  { label: "Benefits Center", href: "/benefits" },
];
