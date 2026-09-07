/**
 * MedJobs Eligibility Detection
 *
 * Determines if a provider is within a partner university's catchment area.
 * Used during provider claim to auto-populate medjobs_eligible flag.
 */

import { PARTNER_UNIVERSITIES } from "@/lib/staffing-outreach/partner-universities";

export interface MedjobsEligibility {
  eligible: boolean;
  university: string | null;
}

/**
 * Check if a city/state combination falls within any partner university's
 * catchment area. Returns the university name if found.
 *
 * @param city - Provider's city (case-insensitive match)
 * @param state - Provider's state (2-letter code, case-insensitive)
 */
export function detectMedjobsCatchment(
  city: string | null | undefined,
  state: string | null | undefined
): MedjobsEligibility {
  if (!city || !state) {
    return { eligible: false, university: null };
  }

  const normalizedCity = city.toLowerCase().trim();
  const normalizedState = state.toUpperCase().trim();

  for (const uni of PARTNER_UNIVERSITIES) {
    for (const catchment of uni.catchment) {
      if (
        catchment.city.toLowerCase() === normalizedCity &&
        catchment.state.toUpperCase() === normalizedState
      ) {
        return { eligible: true, university: uni.name };
      }
    }
  }

  return { eligible: false, university: null };
}

/**
 * Batch check eligibility for multiple providers.
 * Returns a map of business_profile_id to eligibility result.
 */
export function detectMedjobsCatchmentBatch(
  providers: Array<{
    id: string;
    city: string | null | undefined;
    state: string | null | undefined;
  }>
): Map<string, MedjobsEligibility> {
  const results = new Map<string, MedjobsEligibility>();

  for (const provider of providers) {
    results.set(provider.id, detectMedjobsCatchment(provider.city, provider.state));
  }

  return results;
}

/**
 * Get all cities within a specific university's catchment.
 */
export function getCatchmentCities(universitySlug: string): Array<{ city: string; state: string }> {
  const uni = PARTNER_UNIVERSITIES.find((u) => u.slug === universitySlug);
  return uni?.catchment ?? [];
}

/**
 * Get all partner universities with their catchment city counts.
 */
export function getPartnerUniversitySummary(): Array<{
  slug: string;
  name: string;
  city: string;
  state: string;
  catchmentCount: number;
}> {
  return PARTNER_UNIVERSITIES.map((uni) => ({
    slug: uni.slug,
    name: uni.name,
    city: uni.city,
    state: uni.state,
    catchmentCount: uni.catchment.length,
  }));
}
