/**
 * Shared mock provider data for development.
 *
 * Both the landing page (client component) and the provider detail page
 * (server component) import from here so mock data stays in sync.
 */

import type { Provider, StaffMember } from "@/components/providers/ProviderCard";
import type { Profile, ProfileCategory, OrganizationMetadata } from "@/lib/types";

// ============================================================
// Top Providers (the 6 featured cards on the homepage)
// ============================================================

export const topProviders: Provider[] = [
  {
    id: "1",
    slug: "sunrise-senior-living",
    name: "Sunrise Senior Living",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
    images: [
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
    ],
    address: "1234 Oak Street, Austin, TX 78701",
    rating: 4.8,
    reviewCount: 3,
    priceRange: "$3,500/mo",
    primaryCategory: "Assisted Living",
    careTypes: [
      "Memory Care", "Respite Care", "Vitals check", "Personal care assistants",
      "Walking wheelchair assistance", "In home care", "Social activities",
      "Exercise help", "Transportation", "Health and wellness programs",
      "Bathing assistance", "Medication reminders", "Dental care",
      "Bathroom assistance", "Dressing assistance", "Laundry assistance",
      "Wellness checks", "24-hr care", "Fall prevention", "Meal service",
      "Escort to appointments", "Errands", "Shopping", "Toileting assistance",
      "Incontinence care", "Assistance with mobility", "Light housekeeping",
    ],
    highlights: ["24/7 Nursing Staff", "Pet Friendly", "Private Rooms"],
    acceptedPayments: ["Medicare", "Medicaid", "Private Pay"],
    verified: true,
    badge: "Top Rated",
    description:
      "Award-winning senior living community with personalized care plans. Our dedicated team provides compassionate, around-the-clock support in a warm, home-like environment. We specialize in assisted living and memory care, offering individualized programs that promote independence while ensuring safety and comfort.",
    staffImage: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200",
    staff: {
      name: "Dr. Sarah Mitchell",
      position: "Director of Care",
      bio: "Board-certified geriatrician with 15+ years experience in senior care. Passionate about creating personalized care plans that prioritize dignity and quality of life.",
      image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200",
    },
    pricingDetails: [
      { service: "Assisted Living", rate: "$3,500", rateType: "per month" },
      { service: "Memory Care", rate: "$4,800", rateType: "per month" },
      { service: "Respite Care", rate: "$250", rateType: "per day" },
    ],
    staffScreening: { background_checked: true, licensed: true, insured: true },
    reviews: [
      {
        name: "Margaret T.",
        rating: 5,
        date: "January 2025",
        comment: "The staff at Sunrise have been wonderful with my mother. They truly treat every resident like family. The memory care program is exceptional and we've seen real improvements in her daily engagement.",
        relationship: "Daughter of Resident",
      },
      {
        name: "Robert K.",
        rating: 5,
        date: "December 2024",
        comment: "We toured several facilities before choosing Sunrise. The cleanliness, attentive staff, and range of activities really set them apart. My father has been happy here for over a year now.",
        relationship: "Son of Resident",
      },
      {
        name: "Linda W.",
        rating: 4,
        date: "November 2024",
        comment: "Overall a great experience. The care team communicates well and my mom enjoys the social activities. Pricing is on the higher side but the quality of care justifies it.",
        relationship: "Daughter of Resident",
      },
    ],
  },
  {
    id: "2",
    slug: "harmony-care-home",
    name: "Harmony Care Home",
    image: "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
    images: [
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "5678 Maple Avenue, Austin, TX 78702",
    rating: 4.6,
    reviewCount: 0,
    priceRange: "$4,200/mo",
    primaryCategory: "Memory Care",
    careTypes: [
      "Hospice", "Skilled Nursing", "Vitals check", "Medication reminders",
      "24-hr care", "Wellness checks", "Health and wellness programs",
      "Personal care assistants", "Bathing assistance", "Dressing assistance",
      "Meal service", "Fall prevention", "Incontinence care",
      "Assistance with mobility", "Bathroom assistance", "Toileting assistance",
      "Social activities", "Light housekeeping",
    ],
    highlights: ["Dementia Specialists", "Secured Facility", "Family Support"],
    acceptedPayments: ["Medicaid", "Long-term Insurance"],
    verified: true,
    description:
      "Specialized memory care community with 24/7 nursing support. Our evidence-based approach combines clinical excellence with compassionate care, providing a secure and stimulating environment for individuals with Alzheimer's and dementia.",
    pricingDetails: [
      { service: "Memory Care", rate: "$4,200", rateType: "per month" },
      { service: "Hospice Care", rate: "$5,100", rateType: "per month" },
      { service: "Skilled Nursing", rate: "$6,000", rateType: "per month" },
    ],
    staffScreening: { background_checked: true, licensed: true, insured: true },
  },
  {
    id: "3",
    slug: "golden-years-residence",
    name: "Golden Years Residence",
    image: "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    images: [
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "910 Pine Road, Austin, TX 78703",
    rating: 4.5,
    reviewCount: 2,
    priceRange: "$2,800/mo",
    primaryCategory: "Independent Living",
    careTypes: [
      "Assisted Living", "Social activities", "Exercise help",
      "Transportation", "Health and wellness programs", "Meal service",
      "Escort to appointments", "Errands", "Shopping", "Light housekeeping",
      "Wellness checks", "Fall prevention", "Assistance with mobility",
    ],
    highlights: ["Active Lifestyle", "On-site Fitness", "Social Events"],
    acceptedPayments: ["Private Pay", "Veterans Benefits"],
    verified: true,
    badge: "New",
    description:
      "Modern community designed for active, independent seniors. Enjoy resort-style amenities, daily fitness classes, social events, and the peace of mind that comes with on-site wellness support whenever you need it.",
    staffImage: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200",
    staff: {
      name: "Michael Chen",
      position: "Activities Director",
      bio: "Certified recreation therapist dedicated to keeping seniors active and engaged. Organizes daily fitness classes, social events, and community outings.",
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200",
    },
    pricingDetails: [
      { service: "Independent Living", rate: "$2,800", rateType: "per month" },
      { service: "Assisted Living", rate: "$3,900", rateType: "per month" },
    ],
    staffScreening: { background_checked: true, licensed: true, insured: true },
    reviews: [
      {
        name: "James P.",
        rating: 5,
        date: "January 2025",
        comment: "My parents love it here. The community is vibrant and there's always something to do. The fitness center is excellent and the staff genuinely cares about everyone's well-being.",
        relationship: "Son of Resident",
      },
      {
        name: "Dorothy H.",
        rating: 4,
        date: "October 2024",
        comment: "A lovely place to live. I enjoy the social events and the dining options are varied. Wish there were more weekend activities but overall very happy with my decision to move here.",
        relationship: "Resident",
      },
    ],
  },
  {
    id: "4",
    slug: "caring-hearts-home-care",
    name: "Caring Hearts Home Care",
    image: "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
    images: [
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=800",
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    ],
    address: "Serving Greater Austin Area",
    rating: 4.9,
    reviewCount: 6,
    priceRange: "$25/hr",
    primaryCategory: "Home Care",
    careTypes: [
      "Respite Care", "Companion Care", "Personal care assistants",
      "In home care", "Bathing assistance", "Medication reminders",
      "Dressing assistance", "Laundry assistance", "Meal service",
      "Light housekeeping", "Errands", "Shopping", "Transportation",
      "Escort to appointments", "Exercise help", "Wellness checks",
      "Toileting assistance", "Incontinence care", "Assistance with mobility",
      "Fall prevention", "Walking wheelchair assistance",
    ],
    highlights: ["Flexible Scheduling", "Background Checked", "Bilingual Staff"],
    acceptedPayments: ["Medicare", "Private Pay"],
    verified: true,
    description:
      "Compassionate in-home care tailored to your loved one's needs. Our carefully screened and trained caregivers provide personal care, meal preparation, medication reminders, and companionship in the comfort of home.",
    pricingDetails: [
      { service: "Personal Care", rate: "$25", rateType: "per hour" },
      { service: "Companion Care", rate: "$22", rateType: "per hour" },
      { service: "Respite Care", rate: "$28", rateType: "per hour" },
    ],
    staffScreening: { background_checked: true, licensed: false, insured: true },
    reviews: [
      {
        name: "Susan M.",
        rating: 5,
        date: "January 2025",
        comment: "Caring Hearts has been a lifesaver for our family. The caregiver assigned to my father is incredibly patient and kind. She treats him like her own family member. Highly recommend their services.",
        relationship: "Daughter of Client",
      },
      {
        name: "David R.",
        rating: 5,
        date: "December 2024",
        comment: "Excellent home care service. The scheduling is flexible and the caregivers are always on time. My mother feels comfortable and safe with her caregiver, which gives us tremendous peace of mind.",
        relationship: "Son of Client",
      },
      {
        name: "Patricia L.",
        rating: 5,
        date: "November 2024",
        comment: "We've been using Caring Hearts for six months now and couldn't be happier. They matched us with a bilingual caregiver which was exactly what we needed for my grandmother.",
        relationship: "Granddaughter of Client",
      },
      {
        name: "Thomas B.",
        rating: 4,
        date: "October 2024",
        comment: "Good service overall. There was one scheduling mix-up early on but they resolved it quickly and it hasn't happened since. The caregiver is wonderful with my wife.",
        relationship: "Spouse of Client",
      },
      {
        name: "Maria G.",
        rating: 5,
        date: "September 2024",
        comment: "The best home care agency we've worked with. Professional, compassionate, and reliable. They go above and beyond to make sure my father is comfortable and well cared for at home.",
        relationship: "Daughter of Client",
      },
      {
        name: "Karen S.",
        rating: 5,
        date: "August 2024",
        comment: "I cannot say enough good things about this team. From the initial consultation to the daily care, everything has been handled with professionalism and genuine warmth.",
        relationship: "Daughter of Client",
      },
    ],
  },
  {
    id: "5",
    slug: "oak-meadows-retirement",
    name: "Oak Meadows Retirement",
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
    images: [
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
    ],
    address: "2345 Elm Street, Austin, TX 78704",
    rating: 4.7,
    reviewCount: 1,
    priceRange: "$3,200/mo",
    primaryCategory: "Independent Living",
    careTypes: [
      "Assisted Living", "Social activities", "Exercise help",
      "Transportation", "Health and wellness programs", "Meal service",
      "Wellness checks", "Fall prevention", "Light housekeeping",
      "Escort to appointments", "Shopping", "Errands",
    ],
    highlights: ["Golf Course Access", "Fine Dining", "Spa Services"],
    acceptedPayments: ["Private Pay", "Long-term Insurance"],
    verified: true,
    badge: "Featured",
    description:
      "Luxury retirement living with resort-style amenities. From our championship golf course to our award-winning dining program, every detail is designed to make retirement the best chapter of your life.",
    pricingDetails: [
      { service: "Independent Living", rate: "$3,200", rateType: "per month" },
      { service: "Assisted Living", rate: "$4,500", rateType: "per month" },
    ],
    staffScreening: { background_checked: true, licensed: true, insured: true },
    reviews: [
      {
        name: "Richard M.",
        rating: 5,
        date: "December 2024",
        comment: "Beautiful campus with excellent amenities. The golf course is a wonderful bonus. My wife and I have been here for three months and we've already made lifelong friends. The dining is top-notch.",
        relationship: "Resident",
      },
    ],
  },
  {
    id: "6",
    slug: "peaceful-pines-hospice",
    name: "Peaceful Pines Hospice",
    image: "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
    images: [
      "https://images.unsplash.com/photo-1559526324-593bc073d938?w=800",
      "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=800",
    ],
    address: "789 Willow Lane, Austin, TX 78705",
    rating: 4.9,
    reviewCount: 4,
    priceRange: "$4,800/mo",
    primaryCategory: "Hospice",
    careTypes: [
      "Skilled Nursing", "Memory Care", "Vitals check", "24-hr care",
      "Medication reminders", "Personal care assistants", "Wellness checks",
      "Health and wellness programs", "Bathing assistance", "Dressing assistance",
      "Meal service", "Fall prevention", "Incontinence care",
      "Assistance with mobility", "Bathroom assistance", "Toileting assistance",
      "Light housekeeping",
    ],
    highlights: ["Palliative Care", "Family Counseling", "24/7 Support"],
    acceptedPayments: ["Medicare", "Medicaid", "Private Pay"],
    verified: true,
    description:
      "Compassionate end-of-life care with dignity. Our interdisciplinary team provides expert symptom management, emotional and spiritual support, and family counseling in a peaceful, home-like setting.",
    staffImage: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200",
    staff: {
      name: "Dr. Emily Watson",
      position: "Medical Director",
      bio: "Hospice and palliative medicine specialist dedicated to ensuring comfort and quality of life for patients and their families.",
      image: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200",
    },
    pricingDetails: [
      { service: "Hospice Care", rate: "$4,800", rateType: "per month" },
      { service: "Palliative Care", rate: "$3,600", rateType: "per month" },
      { service: "Skilled Nursing", rate: "$5,500", rateType: "per month" },
    ],
    staffScreening: { background_checked: true, licensed: true, insured: true },
    reviews: [
      {
        name: "Catherine D.",
        rating: 5,
        date: "January 2025",
        comment: "The team at Peaceful Pines provided the most compassionate care for my father during his final months. The nurses were attentive and the counseling support for our family was invaluable.",
        relationship: "Daughter of Patient",
      },
      {
        name: "William F.",
        rating: 5,
        date: "November 2024",
        comment: "Words cannot express our gratitude. Every staff member treated my mother with such dignity and respect. The spiritual care program brought her so much comfort. An extraordinary place.",
        relationship: "Son of Patient",
      },
      {
        name: "Janet R.",
        rating: 5,
        date: "September 2024",
        comment: "Dr. Watson and her team are truly remarkable. They kept my husband comfortable and pain-free, and made sure our whole family was supported through a very difficult time.",
        relationship: "Spouse of Patient",
      },
      {
        name: "Steven A.",
        rating: 4,
        date: "July 2024",
        comment: "Very professional and caring staff. The facility is peaceful and well-maintained. Communication could sometimes be quicker but the quality of care itself was excellent.",
        relationship: "Son of Patient",
      },
    ],
  },
];

// ============================================================
// Browse-by-category providers (derived from top providers)
// ============================================================

export const providersByCategory: Record<string, Provider[]> = {
  "home-care": [
    { ...topProviders[3], primaryCategory: "Home Care" },
    { ...topProviders[0], id: "hc-2", primaryCategory: "Home Care", name: "Comfort Keepers", slug: "comfort-keepers" },
    { ...topProviders[1], id: "hc-3", primaryCategory: "Home Care", name: "Home Instead", slug: "home-instead" },
    { ...topProviders[2], id: "hc-4", primaryCategory: "Home Care", name: "Visiting Angels", slug: "visiting-angels" },
    { ...topProviders[4], id: "hc-5", primaryCategory: "Home Care", name: "Right at Home", slug: "right-at-home" },
    { ...topProviders[5], id: "hc-6", primaryCategory: "Home Care", name: "BrightStar Care", slug: "brightstar-care" },
    { ...topProviders[0], id: "hc-7", primaryCategory: "Home Care", name: "Seniors Helping Seniors", slug: "seniors-helping-seniors" },
    { ...topProviders[1], id: "hc-8", primaryCategory: "Home Care", name: "Griswold Home Care", slug: "griswold-home-care" },
  ],
  "home-health": [
    { ...topProviders[5], primaryCategory: "Home Health" },
    { ...topProviders[0], id: "hh-2", primaryCategory: "Home Health", name: "Amedisys", slug: "amedisys" },
    { ...topProviders[1], id: "hh-3", primaryCategory: "Home Health", name: "LHC Group", slug: "lhc-group" },
    { ...topProviders[2], id: "hh-4", primaryCategory: "Home Health", name: "Kindred at Home", slug: "kindred-at-home" },
    { ...topProviders[3], id: "hh-5", primaryCategory: "Home Health", name: "AccordantHealth", slug: "accordanthealth" },
    { ...topProviders[4], id: "hh-6", primaryCategory: "Home Health", name: "Enhabit Home Health", slug: "enhabit-home-health" },
    { ...topProviders[5], id: "hh-7", primaryCategory: "Home Health", name: "Elara Caring", slug: "elara-caring" },
    { ...topProviders[0], id: "hh-8", primaryCategory: "Home Health", name: "Bayada Home Health", slug: "bayada-home-health" },
  ],
  "assisted-living": [
    { ...topProviders[0], primaryCategory: "Assisted Living" },
    { ...topProviders[1], id: "al-2", primaryCategory: "Assisted Living", name: "Brookdale Senior Living", slug: "brookdale-senior-living" },
    { ...topProviders[2], id: "al-3", primaryCategory: "Assisted Living", name: "Five Star Senior Living", slug: "five-star-senior-living" },
    { ...topProviders[3], id: "al-4", primaryCategory: "Assisted Living", name: "Atria Senior Living", slug: "atria-senior-living" },
    { ...topProviders[4], id: "al-5", primaryCategory: "Assisted Living", name: "Senior Lifestyle", slug: "senior-lifestyle" },
    { ...topProviders[5], id: "al-6", primaryCategory: "Assisted Living", name: "Silverado", slug: "silverado" },
    { ...topProviders[0], id: "al-7", primaryCategory: "Assisted Living", name: "Belmont Village", slug: "belmont-village" },
    { ...topProviders[1], id: "al-8", primaryCategory: "Assisted Living", name: "Merrill Gardens", slug: "merrill-gardens" },
  ],
  "memory-care": [
    { ...topProviders[1], primaryCategory: "Memory Care" },
    { ...topProviders[0], id: "mc-2", primaryCategory: "Memory Care", name: "Silverado Memory Care", slug: "silverado-memory-care" },
    { ...topProviders[2], id: "mc-3", primaryCategory: "Memory Care", name: "Arden Courts", slug: "arden-courts" },
    { ...topProviders[3], id: "mc-4", primaryCategory: "Memory Care", name: "Sunrise Memory Care", slug: "sunrise-memory-care" },
    { ...topProviders[4], id: "mc-5", primaryCategory: "Memory Care", name: "Artis Senior Living", slug: "artis-senior-living" },
    { ...topProviders[5], id: "mc-6", primaryCategory: "Memory Care", name: "Autumn Leaves", slug: "autumn-leaves" },
    { ...topProviders[0], id: "mc-7", primaryCategory: "Memory Care", name: "The Kensington", slug: "the-kensington" },
    { ...topProviders[1], id: "mc-8", primaryCategory: "Memory Care", name: "Bridges by EPOCH", slug: "bridges-by-epoch" },
  ],
  "independent-living": [
    { ...topProviders[2], primaryCategory: "Independent Living" },
    { ...topProviders[0], id: "il-2", primaryCategory: "Independent Living", name: "Vi Living", slug: "vi-living" },
    { ...topProviders[1], id: "il-3", primaryCategory: "Independent Living", name: "Holiday Retirement", slug: "holiday-retirement" },
    { ...topProviders[3], id: "il-4", primaryCategory: "Independent Living", name: "Erickson Living", slug: "erickson-living" },
    { ...topProviders[4], id: "il-5", primaryCategory: "Independent Living", name: "Leisure Care", slug: "leisure-care" },
    { ...topProviders[5], id: "il-6", primaryCategory: "Independent Living", name: "Watermark Retirement", slug: "watermark-retirement" },
    { ...topProviders[0], id: "il-7", primaryCategory: "Independent Living", name: "Aegis Living", slug: "aegis-living" },
    { ...topProviders[1], id: "il-8", primaryCategory: "Independent Living", name: "Kisco Senior Living", slug: "kisco-senior-living" },
  ],
  "nursing-home": [
    { ...topProviders[5], primaryCategory: "Nursing Home" },
    { ...topProviders[0], id: "nh-2", primaryCategory: "Nursing Home", name: "Genesis HealthCare", slug: "genesis-healthcare" },
    { ...topProviders[1], id: "nh-3", primaryCategory: "Nursing Home", name: "PruittHealth", slug: "pruitthealth" },
    { ...topProviders[2], id: "nh-4", primaryCategory: "Nursing Home", name: "Ensign Group", slug: "ensign-group" },
    { ...topProviders[3], id: "nh-5", primaryCategory: "Nursing Home", name: "Sabra Health Care", slug: "sabra-health-care" },
    { ...topProviders[4], id: "nh-6", primaryCategory: "Nursing Home", name: "ProMedica Senior Care", slug: "promedica-senior-care" },
    { ...topProviders[5], id: "nh-7", primaryCategory: "Nursing Home", name: "Life Care Centers", slug: "life-care-centers" },
    { ...topProviders[0], id: "nh-8", primaryCategory: "Nursing Home", name: "Consulate Health Care", slug: "consulate-health-care" },
  ],
};

// ============================================================
// Browse page exports
// ============================================================

/** Flat array of all providers for browse/search results */
export const allBrowseProviders: Provider[] = [
  ...topProviders,
  ...Object.values(providersByCategory).flat(),
];

/** Map care type slug to display label */
const careTypeLabelMap: Record<string, string> = {
  "home-care": "Home Care",
  "home-health": "Home Health",
  "assisted-living": "Assisted Living",
  "memory-care": "Memory Care",
  "nursing-homes": "Nursing Homes",
  "nursing-home": "Nursing Homes",
  "independent-living": "Independent Living",
  "hospice": "Hospice",
};

export function getCareTypeLabel(slug: string): string {
  return careTypeLabelMap[slug] || "Senior Care";
}

/** Map care type slug to the primaryCategory value used on Provider objects */
export function getCareTypeName(slug: string): string {
  const nameMap: Record<string, string> = {
    "home-care": "Home Care",
    "home-health": "Home Health",
    "assisted-living": "Assisted Living",
    "memory-care": "Memory Care",
    "nursing-homes": "Nursing Home",
    "nursing-home": "Nursing Home",
    "independent-living": "Independent Living",
    "hospice": "Hospice",
  };
  return nameMap[slug] || "";
}

// ============================================================
// Helpers
// ============================================================

/**
 * Look up a mock provider by slug across all data sets.
 * Searches topProviders first, then every category bucket.
 */
export function getProviderBySlug(slug: string): Provider | null {
  // Search top providers
  const fromTop = topProviders.find((p) => p.slug === slug);
  if (fromTop) return fromTop;

  // Search category providers
  for (const providers of Object.values(providersByCategory)) {
    const found = providers.find((p) => p.slug === slug);
    if (found) return found;
  }

  return null;
}

/**
 * Map the card-side `Provider` type to the database `Profile` type
 * so the provider detail page can render without changes.
 */

// Map human-readable category names to ProfileCategory enum values
const categoryMap: Record<string, ProfileCategory> = {
  "Assisted Living": "assisted_living",
  "Home Care": "home_care_agency",
  "Home Health": "home_health_agency",
  "Memory Care": "memory_care",
  "Independent Living": "independent_living",
  "Nursing Home": "nursing_home",
  "Hospice": "hospice_agency",
  "Skilled Nursing": "nursing_home",
  "Respite Care": "home_care_agency",
  "Companion Care": "home_care_agency",
};

export function mockProviderToProfile(provider: Provider): Profile {
  // Parse "city, state" from address like "1234 Oak Street, Austin, TX 78701"
  const addressParts = provider.address.split(",").map((s) => s.trim());
  let city: string | null = null;
  let state: string | null = null;

  if (addressParts.length >= 3) {
    // "1234 Oak Street", "Austin", "TX 78701"
    city = addressParts[1];
    const stateZip = addressParts[2].split(" ");
    state = stateZip[0] || null;
  } else if (addressParts.length === 2) {
    city = addressParts[0];
    const stateZip = addressParts[1].split(" ");
    state = stateZip[0] || null;
  }

  // Build metadata with extra mock-specific fields
  const metadata: OrganizationMetadata & {
    rating?: number;
    review_count?: number;
    images?: string[];
    staff?: StaffMember;
    badge?: string;
    accepted_payments?: string[];
    pricing_details?: { service: string; rate: string; rateType: string }[];
    staff_screening?: { background_checked: boolean; licensed: boolean; insured: boolean };
    reviews?: { name: string; rating: number; date: string; comment: string; relationship?: string }[];
  } = {
    price_range: provider.priceRange,
    amenities: provider.highlights || [],
    accepts_medicaid: provider.acceptedPayments?.includes("Medicaid") ?? false,
    accepts_medicare: provider.acceptedPayments?.includes("Medicare") ?? false,
    // Extra fields the detail page can read from metadata
    rating: provider.rating,
    review_count: provider.reviewCount,
    images: provider.images,
    staff: provider.staff,
    badge: provider.badge,
    accepted_payments: provider.acceptedPayments,
    pricing_details: provider.pricingDetails,
    staff_screening: provider.staffScreening,
    reviews: provider.reviews,
  };

  return {
    id: provider.id,
    account_id: null,
    slug: provider.slug,
    type: "organization",
    category: categoryMap[provider.primaryCategory] || "assisted_living",
    display_name: provider.name,
    description: provider.description || null,
    image_url: provider.image,
    phone: "(512) 555-0100",
    email: `info@${provider.slug}.com`,
    website: `https://www.${provider.slug}.com`,
    address: provider.address,
    city,
    state,
    zip: null,
    lat: null,
    lng: null,
    service_area: "Greater Austin Area",
    care_types: [provider.primaryCategory, ...provider.careTypes],
    metadata,
    claim_state: provider.reviews && provider.reviews.length > 0 ? "claimed" : "unclaimed",
    verification_state: provider.reviews && provider.reviews.length > 0 ? "verified" : "unverified",
    source: "seeded",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ============================================================
// iOS Supabase Provider to Profile Adapter
// ============================================================

import type { Provider as IOSProvider } from "@/lib/types/provider";
import {
  parseProviderImages,
  formatPriceRange as formatIOSPriceRange,
  getPrimaryImage,
  getCategoryDisplayName,
} from "@/lib/types/provider";

/**
 * Map iOS provider_category strings to ProfileCategory enum values
 */
const iosCategoryMap: Record<string, ProfileCategory> = {
  "Home Care (Non-medical)": "home_care_agency",
  "Home Health Care": "home_health_agency",
  "Assisted Living": "assisted_living",
  "Independent Living": "independent_living",
  "Memory Care": "memory_care",
  "Nursing Home": "nursing_home",
  "Assisted Living | Independent Living": "assisted_living",
  "Memory Care | Assisted Living": "memory_care",
  "Hospice": "hospice_agency",
};

/**
 * Convert iOS Supabase Provider to Profile format for the provider details page.
 * This allows the rich provider page to work with real iOS data.
 */
export function iosProviderToProfile(provider: IOSProvider): Profile {
  const images = parseProviderImages(provider.provider_images);
  const primaryImage = getPrimaryImage(provider);
  const allImages = primaryImage && !images.includes(primaryImage)
    ? [primaryImage, ...images]
    : images.length > 0 ? images : (primaryImage ? [primaryImage] : []);

  const priceRange = formatIOSPriceRange(provider);
  const categoryDisplay = getCategoryDisplayName(provider.provider_category);

  // Build metadata with iOS-specific fields
  const metadata: OrganizationMetadata & {
    rating?: number;
    review_count?: number;
    images?: string[];
    badge?: string;
    accepted_payments?: string[];
    community_score?: number;
    value_score?: number;
    info_score?: number;
  } = {
    price_range: priceRange || undefined,
    amenities: [categoryDisplay],
    // iOS scores
    rating: provider.google_rating || undefined,
    review_count: undefined,
    images: allImages,
    community_score: provider.community_Score || undefined,
    value_score: provider.value_score || undefined,
    info_score: provider.information_availability_score || undefined,
  };

  // Build care_types array from category and main_category
  const careTypes: string[] = [provider.provider_category];
  if (provider.main_category && provider.main_category !== provider.provider_category) {
    careTypes.push(provider.main_category);
  }

  return {
    id: provider.provider_id,
    account_id: null,
    slug: provider.provider_id, // iOS uses provider_id as the slug
    type: "organization",
    category: iosCategoryMap[provider.provider_category] || "assisted_living",
    display_name: provider.provider_name,
    description: provider.provider_description,
    image_url: primaryImage,
    phone: provider.phone,
    email: provider.email,
    website: provider.website,
    address: provider.address,
    city: provider.city,
    state: provider.state,
    zip: provider.zipcode?.toString() || null,
    lat: provider.lat,
    lng: provider.lon,
    service_area: provider.city && provider.state ? `${provider.city}, ${provider.state}` : null,
    care_types: careTypes,
    metadata,
    claim_state: "unclaimed", // iOS data doesn't have claim status
    verification_state: "unverified", // iOS data doesn't have verification status
    source: "seeded",
    is_active: !provider.deleted,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
