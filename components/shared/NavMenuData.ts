/**
 * Navigation menu structure for care category dropdowns.
 *
 * Each top-level item maps to a dropdown panel with sub-items.
 * Sub-items link to /browse with a pre-applied care type filter,
 * or to future educational content pages.
 */

export interface NavSubItem {
  label: string;
  description: string;
  href: string;
}

export interface NavCategory {
  label: string;
  items: NavSubItem[];
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: "Home Care",
    items: [
      {
        label: "Home Care Agencies",
        description: "Non-medical help with daily living",
        href: "/browse?type=home-care",
      },
      {
        label: "Home Health",
        description: "Skilled nursing and therapy at home",
        href: "/browse?type=home-health",
      },
      {
        label: "Private Caregivers",
        description: "Independent caregivers for hire",
        href: "/browse?type=home-care&q=caregiver",
      },
    ],
  },
  {
    label: "Assisted Living",
    items: [
      {
        label: "Assisted Living",
        description: "Help with daily activities in a community setting",
        href: "/browse?type=assisted-living",
      },
      {
        label: "Independent Living",
        description: "Active senior communities with minimal support",
        href: "/browse?type=independent-living",
      },
      {
        label: "Memory Care",
        description: "Specialized care for Alzheimer's and dementia",
        href: "/browse?type=memory-care",
      },
    ],
  },
  {
    label: "Memory Care",
    items: [
      {
        label: "Memory Care Communities",
        description: "Dedicated facilities for dementia care",
        href: "/browse?type=memory-care",
      },
      {
        label: "Assisted Living with Memory Care",
        description: "Assisted living communities offering memory units",
        href: "/browse?type=assisted-living",
      },
    ],
  },
  {
    label: "Nursing Homes",
    items: [
      {
        label: "Skilled Nursing Facilities",
        description: "24/7 medical care and supervision",
        href: "/browse?type=skilled-nursing",
      },
      {
        label: "Rehabilitation",
        description: "Short-term recovery after surgery or illness",
        href: "/browse?type=rehabilitation",
      },
    ],
  },
  {
    label: "More",
    items: [
      {
        label: "Hospice",
        description: "Comfort-focused end-of-life care",
        href: "/browse?type=hospice",
      },
      {
        label: "Respite Care",
        description: "Temporary relief for family caregivers",
        href: "/browse?type=respite-care",
      },
      {
        label: "Adult Day Care",
        description: "Daytime programs for socialization and support",
        href: "/browse?type=adult-day-care",
      },
      {
        label: "Browse All Providers",
        description: "See all care providers on Olera",
        href: "/browse",
      },
    ],
  },
];
