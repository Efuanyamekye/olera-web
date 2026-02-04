/**
 * Utility functions for the provider details page.
 */

import type { ProfileCategory } from "@/lib/types";
import type { Provider } from "@/components/providers/ProviderCard";
import { providersByCategory } from "@/lib/mock-providers";

// ============================================================
// Initials
// ============================================================

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ============================================================
// Category formatting
// ============================================================

const categoryLabels: Record<ProfileCategory, string> = {
  home_care_agency: "Home Care",
  home_health_agency: "Home Health",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
  inpatient_hospice: "Inpatient Hospice",
  rehab_facility: "Rehabilitation",
  adult_day_care: "Adult Day Care",
  wellness_center: "Wellness Center",
  private_caregiver: "Private Caregiver",
};

export function formatCategory(category: ProfileCategory | null): string | null {
  if (!category) return null;
  return categoryLabels[category] || null;
}

// Map ProfileCategory to the providersByCategory keys used in mock data
const categoryToBrowseKey: Record<string, string> = {
  home_care_agency: "home-care",
  home_health_agency: "home-health",
  assisted_living: "assisted-living",
  memory_care: "memory-care",
  independent_living: "independent-living",
  nursing_home: "nursing-home",
  hospice_agency: "home-health",
  inpatient_hospice: "home-health",
  rehab_facility: "nursing-home",
  adult_day_care: "home-care",
  wellness_center: "home-care",
  private_caregiver: "home-care",
};

// ============================================================
// Quick Facts builder
// ============================================================

export interface QuickFact {
  label: string;
  value: string;
  icon: "category" | "location" | "calendar" | "users" | "award" | "shield" | "dollar";
}

interface QuickFactsInput {
  category: ProfileCategory | null;
  city: string | null;
  state: string | null;
  yearFounded?: number;
  bedCount?: number;
  yearsExperience?: number;
  acceptsMedicaid?: boolean;
  acceptsMedicare?: boolean;
  priceRange?: string | null;
}

export function buildQuickFacts(input: QuickFactsInput): QuickFact[] {
  const facts: QuickFact[] = [];

  const categoryLabel = formatCategory(input.category);
  if (categoryLabel) {
    facts.push({ label: "Type", value: categoryLabel, icon: "category" });
  }

  const location = [input.city, input.state].filter(Boolean).join(", ");
  if (location) {
    facts.push({ label: "Location", value: location, icon: "location" });
  }

  if (input.yearFounded) {
    facts.push({ label: "Founded", value: String(input.yearFounded), icon: "calendar" });
  }

  if (input.bedCount) {
    facts.push({ label: "Capacity", value: `${input.bedCount} beds`, icon: "users" });
  }

  if (input.yearsExperience) {
    facts.push({ label: "Experience", value: `${input.yearsExperience} years`, icon: "award" });
  }

  if (input.acceptsMedicare || input.acceptsMedicaid) {
    const types = [];
    if (input.acceptsMedicare) types.push("Medicare");
    if (input.acceptsMedicaid) types.push("Medicaid");
    facts.push({ label: "Insurance", value: types.join(" & "), icon: "shield" });
  }

  if (input.priceRange) {
    facts.push({ label: "Pricing", value: input.priceRange, icon: "dollar" });
  }

  return facts;
}

// ============================================================
// Similar providers
// ============================================================

export function getSimilarProviders(
  category: ProfileCategory | null,
  excludeSlug: string,
  limit: number = 3
): Provider[] {
  if (!category) return [];

  const browseKey = categoryToBrowseKey[category];
  if (!browseKey) return [];

  const providers = providersByCategory[browseKey];
  if (!providers) return [];

  return providers
    .filter((p) => p.slug !== excludeSlug)
    .slice(0, limit);
}
