/**
 * Pure data-transformation utilities for profile cards.
 *
 * This module is intentionally NOT marked "use client" so it can be imported
 * by both server components (e.g., app/browse/page.tsx) and client components
 * (e.g., components/shared/ProfileCard.tsx).
 */

import type {
  Profile,
  OrganizationMetadata,
  CaregiverMetadata,
  FamilyMetadata,
} from "@/lib/types";

// ============================================================
// Normalized card data — the common shape for all profile types
// ============================================================

export interface CardProfile {
  id: string;
  slug: string;
  type: Profile["type"];
  name: string;
  location: string | null;
  imageUrl: string | null;
  verified: boolean;
  careTypes: string[];
  /** Primary label shown above the name (e.g., "Assisted Living", "Private Caregiver") */
  category: string | null;
  /** Price or rate string (e.g., "$4,500/mo", "$25-35/hr") */
  priceLabel: string | null;
  /** Type-specific detail chips shown below care types */
  details: { label: string; value: string }[];
  /** Link target (e.g., "/provider/slug" or null for non-linkable cards) */
  href: string | null;
}

// ============================================================
// Adapter: Supabase Profile → CardProfile
// ============================================================

export function profileToCard(profile: Profile): CardProfile {
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || null;
  const meta = profile.metadata;

  let category: string | null = null;
  let priceLabel: string | null = null;
  const details: { label: string; value: string }[] = [];

  if (profile.type === "organization") {
    const m = meta as OrganizationMetadata;
    category = formatCategory(profile.category);
    priceLabel = m?.price_range || null;
    if (m?.staff_count) details.push({ label: "Staff", value: `${m.staff_count} members` });
    if (m?.year_founded) details.push({ label: "Est.", value: String(m.year_founded) });
    if (m?.bed_count) details.push({ label: "Capacity", value: `${m.bed_count} beds` });
  } else if (profile.type === "caregiver") {
    const m = meta as CaregiverMetadata;
    category = "Private Caregiver";
    if (m?.hourly_rate_min && m?.hourly_rate_max) {
      priceLabel = `$${m.hourly_rate_min}–$${m.hourly_rate_max}/hr`;
    } else if (m?.hourly_rate_min) {
      priceLabel = `From $${m.hourly_rate_min}/hr`;
    }
    if (m?.years_experience) details.push({ label: "Experience", value: `${m.years_experience} yrs` });
    if (m?.certifications?.length) {
      details.push({ label: "Certs", value: m.certifications.slice(0, 2).join(", ") });
    }
    if (m?.availability) details.push({ label: "Availability", value: m.availability });
  } else if (profile.type === "family") {
    const m = meta as FamilyMetadata;
    category = "Family";
    if (m?.timeline) {
      const labels: Record<string, string> = {
        immediate: "Immediate",
        within_1_month: "Within 1 month",
        within_3_months: "Within 3 months",
        exploring: "Exploring options",
      };
      details.push({ label: "Timeline", value: labels[m.timeline] || m.timeline });
    }
    if (m?.budget_min || m?.budget_max) {
      const parts = [];
      if (m.budget_min) parts.push(`$${m.budget_min.toLocaleString()}`);
      if (m.budget_max) parts.push(`$${m.budget_max.toLocaleString()}`);
      priceLabel = parts.join("–") + "/mo";
    }
    if (m?.relationship_to_recipient) {
      details.push({ label: "Relationship", value: m.relationship_to_recipient });
    }
  }

  // Provider profiles link to their public page; families don't have public pages
  const href = profile.type !== "family" && profile.slug
    ? `/provider/${profile.slug}`
    : null;

  return {
    id: profile.id,
    slug: profile.slug,
    type: profile.type,
    name: profile.display_name,
    location,
    imageUrl: profile.image_url,
    verified: profile.claim_state === "claimed" && (profile.verification_state === "verified" || profile.verification_state === "not_required"),
    careTypes: profile.care_types || [],
    category,
    priceLabel,
    details,
    href,
  };
}

// ============================================================
// Category display names
// ============================================================

export function formatCategory(category: string | null): string | null {
  if (!category) return null;
  const map: Record<string, string> = {
    assisted_living: "Assisted Living",
    independent_living: "Independent Living",
    memory_care: "Memory Care",
    nursing_home: "Skilled Nursing",
    home_care_agency: "Home Care",
    home_health_agency: "Home Health",
    hospice_agency: "Hospice",
    inpatient_hospice: "Inpatient Hospice",
    rehab_facility: "Rehabilitation",
    adult_day_care: "Adult Day Care",
    wellness_center: "Wellness Center",
    private_caregiver: "Private Caregiver",
  };
  return map[category] || category;
}
