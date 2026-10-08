import type { StudentMetadata } from "@/lib/types";

/**
 * MedJobs Profile Completeness — Single Source of Truth
 *
 * Organized into 9 sections that match the portal page structure:
 * 1. Profile Overview (name, email, phone, university, location, photo) — 10%
 * 2. Weekly Schedule (schedule grid) — 10%
 * 3. Availability & Commitment (statement, seasonal availability) — 10%
 * 4. Why I Want to Be a Caregiver — 15%
 * 5. Screening Questions (3 scenario questions) — 14%
 * 6. Experience (experience timeline entries) — 0% (optional)
 * 7. Certifications — 0% (optional)
 * 8. Resume — 20%
 * 9. Verification (intro video) — 21%
 *
 * Optional sections (Experience & Certifications) don't block 100% completion.
 * Driver's license and car insurance are shown but don't affect completeness.
 */

export const SCENARIO_QUESTIONS = [
  {
    key: "scenario_reliability",
    question:
      "You have an exam tomorrow but your client's family is counting on you for a shift tonight. What do you do?",
  },
  {
    key: "scenario_judgement",
    question:
      "You arrive at a client's home and notice they seem confused and have a bruise they can't explain. What steps do you take?",
  },
  {
    key: "scenario_commitment",
    question:
      "Why do you want to commit to caregiving for multiple semesters, and how will this experience help your career in healthcare?",
  },
] as const;

export type SectionId =
  | "overview"
  | "verification"
  | "schedule"
  | "availability"
  | "why"
  | "scenarios"
  | "background"
  | "certifications"
  | "resume";

export interface CompletenessSection {
  id: SectionId;
  label: string;
  /** Percentage complete (0-100) for this section */
  percent: number;
  /** Whether section is fully complete */
  done: boolean;
  /** Items within this section and their completion status */
  items: { key: string; label: string; done: boolean }[];
}

/**
 * Calculate section-based completeness for a student profile.
 *
 * @param meta - StudentMetadata from the business_profiles.metadata JSONB
 * @param hasPhoto - Whether the profile has an image_url set
 * @param hasBasicInfo - Whether basic profile info exists (name, email, phone, university, location)
 */
export function getSectionCompleteness(
  meta: StudentMetadata,
  hasPhoto: boolean,
  hasBasicInfo: { hasName: boolean; hasEmail: boolean; hasPhone: boolean; hasUniversity: boolean; hasLocation: boolean }
): CompletenessSection[] {
  const scenarios = meta.scenario_responses || [];

  // 1. Profile Overview (from onboarding)
  const overviewItems = [
    { key: "name", label: "Name", done: hasBasicInfo.hasName },
    { key: "email", label: "Email", done: hasBasicInfo.hasEmail },
    { key: "phone", label: "Phone", done: hasBasicInfo.hasPhone },
    { key: "university", label: "University", done: hasBasicInfo.hasUniversity },
    { key: "location", label: "Location", done: hasBasicInfo.hasLocation },
    { key: "photo", label: "Profile photo", done: hasPhoto },
  ];
  const overviewDone = overviewItems.filter((i) => i.done).length;
  const overviewPercent = Math.round((overviewDone / overviewItems.length) * 100);

  // 2. Verification (only intro video counts toward completeness; license/insurance are optional)
  const verificationItems = [
    { key: "video", label: "Intro video", done: !!meta.video_intro_url },
  ];
  const verificationDone = verificationItems.filter((i) => i.done).length;
  const verificationPercent = Math.round((verificationDone / verificationItems.length) * 100);

  // 3. Weekly Schedule
  const hasAvailabilitySchedule = meta.availability_schedule
    ? Object.values(meta.availability_schedule).some((slots) => Array.isArray(slots) && slots.length > 0)
    : false;
  const scheduleItems = [
    { key: "schedule", label: "Weekly schedule", done: hasAvailabilitySchedule || !!meta.course_schedule_grid },
  ];
  const scheduleDone = scheduleItems.filter((i) => i.done).length;
  const schedulePercent = Math.round((scheduleDone / scheduleItems.length) * 100);

  // 4. Availability & Commitment
  const hasCommitment = !!(meta.commitment_statement && meta.commitment_statement.length >= 50);
  const hasSeasonalAvailability = meta.year_round_availability
    ? Object.keys(meta.year_round_availability).length > 0
    : false;
  const availabilityItems = [
    { key: "statement", label: "Commitment statement", done: hasCommitment },
    { key: "seasonal", label: "Seasonal availability", done: hasSeasonalAvailability },
  ];
  const availabilityDone = availabilityItems.filter((i) => i.done).length;
  const availabilityPercent = Math.round((availabilityDone / availabilityItems.length) * 100);

  // 5. Why I Want to Be a Caregiver
  const whyItems = [
    { key: "why", label: "Personal statement", done: !!(meta.why_caregiving && meta.why_caregiving.length >= 100) },
  ];
  const whyDone = whyItems.filter((i) => i.done).length;
  const whyPercent = Math.round((whyDone / whyItems.length) * 100);

  // 6. Screening Questions
  const scenarioItems = SCENARIO_QUESTIONS.map((q, i) => ({
    key: q.key,
    label: `Question ${i + 1}`,
    done: (scenarios.find((s) => s.question === q.question)?.answer?.length ?? 0) >= 50,
  }));
  const scenariosDone = scenarioItems.filter((i) => i.done).length;
  const scenariosPercent = Math.round((scenariosDone / scenarioItems.length) * 100);

  // 7. Experience Timeline
  const backgroundItems = [
    { key: "experience_entries", label: "Experience timeline", done: (meta.experience_entries?.length ?? 0) > 0 },
  ];
  const backgroundDone = backgroundItems.filter((i) => i.done).length;
  const backgroundPercent = Math.round((backgroundDone / backgroundItems.length) * 100);

  // 7b. Certifications (optional section - doesn't affect overall completeness)
  // Section is "done" if they have certifications OR explicitly marked "no certifications" (__none__)
  const hasCerts = (meta.certifications?.length ?? 0) > 0;
  const hasNoCertsMarker = meta.certifications?.includes("__none__") ?? false;
  const certItems = [
    { key: "certifications", label: "Certifications", done: hasCerts || hasNoCertsMarker },
  ];
  const certsDone = certItems.filter((i) => i.done).length;
  const certsPercent = Math.round((certsDone / certItems.length) * 100);

  // 8. Resume
  const resumeItems = [
    { key: "resume", label: "Resume", done: !!meta.resume_url },
  ];
  const resumeDone = resumeItems.filter((i) => i.done).length;
  const resumePercent = Math.round((resumeDone / resumeItems.length) * 100);

  return [
    { id: "overview", label: "Profile Overview", percent: overviewPercent, done: overviewPercent === 100, items: overviewItems },
    { id: "schedule", label: "Weekly Schedule", percent: schedulePercent, done: schedulePercent === 100, items: scheduleItems },
    { id: "availability", label: "Availability & Commitment", percent: availabilityPercent, done: availabilityPercent === 100, items: availabilityItems },
    { id: "why", label: "Why I Want to Be a Caregiver", percent: whyPercent, done: whyPercent === 100, items: whyItems },
    { id: "scenarios", label: "Screening Questions", percent: scenariosPercent, done: scenariosPercent === 100, items: scenarioItems },
    { id: "background", label: "Experience", percent: backgroundPercent, done: backgroundPercent === 100, items: backgroundItems },
    { id: "certifications", label: "Certifications", percent: certsPercent, done: certsPercent === 100, items: certItems },
    { id: "resume", label: "Resume", percent: resumePercent, done: resumePercent === 100, items: resumeItems },
    { id: "verification", label: "Video Introduction", percent: verificationPercent, done: verificationPercent === 100, items: verificationItems },
  ];
}

/**
 * Section weights for overall completeness calculation.
 * Total adds up to 100%. Resume and Verification are weighted higher
 * as they are most important for provider visibility.
 *
 * Optional sections (0%):
 * - Certifications: not all students have them
 * - Experience (background): not all students have prior caregiving experience
 *
 * The 10% from experience was redistributed to:
 * - why: +2% (13% → 15%)
 * - scenarios: +2% (12% → 14%)
 * - resume: +3% (17% → 20%)
 * - verification: +3% (18% → 21%)
 */
export const SECTION_WEIGHTS: Record<SectionId, number> = {
  overview: 10,
  schedule: 10,
  availability: 10,
  why: 15,           // +2% (from experience)
  scenarios: 14,     // +2% (from experience)
  background: 0,     // Optional - not all students have experience
  certifications: 0, // Optional - not all students have certifications
  resume: 20,        // +3% (from experience)
  verification: 21,  // +3% (from experience)
};

/** Section IDs that are optional (0% weight) and don't affect completeness */
export const OPTIONAL_SECTIONS: SectionId[] = ["background", "certifications"];

/** Check if a section is required for 100% completeness */
export function isRequiredSection(sectionId: SectionId): boolean {
  return SECTION_WEIGHTS[sectionId] > 0;
}

/**
 * Calculate the overall completeness percentage (0-100).
 * Uses weighted sections where Resume and Verification count more.
 *
 * @param meta - StudentMetadata from the business_profiles.metadata JSONB
 * @param hasPhoto - Whether the profile has an image_url set
 * @param hasBasicInfo - Override for basic info checks. If not provided, derives from meta.
 * @param profileFields - Optional top-level profile fields (email, phone, city, state, display_name)
 */
export function calculateCompleteness(
  meta: StudentMetadata,
  hasPhoto: boolean,
  hasBasicInfo?: { hasName: boolean; hasEmail: boolean; hasPhone: boolean; hasUniversity: boolean; hasLocation: boolean },
  profileFields?: { email?: string | null; phone?: string | null; city?: string | null; state?: string | null; display_name?: string | null }
): number {
  // Derive hasBasicInfo from profileFields if not explicitly provided
  const info = hasBasicInfo ?? {
    hasName: !!(profileFields?.display_name),
    hasEmail: !!(profileFields?.email),
    hasPhone: !!(profileFields?.phone),
    hasUniversity: !!meta.university,
    hasLocation: !!(profileFields?.city && profileFields?.state),
  };
  const sections = getSectionCompleteness(meta, hasPhoto, info);

  // Weighted calculation: section's contribution = (section% / 100) * weight
  let totalWeighted = 0;
  for (const section of sections) {
    const weight = SECTION_WEIGHTS[section.id] ?? 10;
    totalWeighted += (section.percent / 100) * weight;
  }

  return Math.round(totalWeighted);
}

/**
 * Get verification items only (for the verification section UI).
 * @deprecated Use getSectionCompleteness instead
 */
export function getVerificationItems(meta: StudentMetadata): { key: string; label: string; done: boolean; category: string }[] {
  return [
    { key: "video", label: "Intro video", done: !!meta.video_intro_url, category: "verification" },
    { key: "drivers_license", label: "Driver\u2019s license", done: !!(meta.drivers_license_url && meta.drivers_license_expiration), category: "verification" },
    { key: "car_insurance", label: "Car insurance", done: !!(meta.car_insurance_url && meta.car_insurance_expiration), category: "verification" },
  ];
}

/**
 * Legacy: Get profile items only (for backward compatibility).
 * @deprecated Use getSectionCompleteness instead
 */
export function getProfileItems(
  meta: StudentMetadata,
  hasPhoto: boolean
): { key: string; label: string; done: boolean; category: string }[] {
  const scenarios = meta.scenario_responses || [];
  return [
    { key: "photo", label: "Profile photo", done: hasPhoto, category: "profile" },
    { key: "schedule", label: "Semester schedule", done: !!meta.course_schedule_grid, category: "profile" },
    { key: "commitment", label: "Availability & commitment", done: !!(meta.commitment_statement && meta.commitment_statement.length >= 50), category: "profile" },
    { key: "why", label: "Why I want to be a caregiver", done: !!(meta.why_caregiving && meta.why_caregiving.length >= 100), category: "profile" },
    { key: "scenarios", label: "Screening questions", done: scenarios.length >= SCENARIO_QUESTIONS.length && scenarios.every((s) => (s.answer?.length ?? 0) >= 50), category: "profile" },
    { key: "resume", label: "Resume", done: !!meta.resume_url, category: "profile" },
  ];
}

/**
 * Legacy: Get all completeness items (for backward compatibility).
 * @deprecated Use getSectionCompleteness instead
 */
export function getCompletenessItems(
  meta: StudentMetadata,
  hasPhoto: boolean
): { key: string; label: string; done: boolean; category: string }[] {
  return [
    ...getVerificationItems(meta),
    ...getProfileItems(meta, hasPhoto),
  ];
}

/**
 * Get list of incomplete section labels (for nudge emails).
 */
export function getIncompleteSections(
  meta: StudentMetadata,
  hasPhoto: boolean,
  hasBasicInfo: { hasName: boolean; hasEmail: boolean; hasPhone: boolean; hasUniversity: boolean; hasLocation: boolean }
): string[] {
  return getSectionCompleteness(meta, hasPhoto, hasBasicInfo)
    .filter((s) => !s.done)
    .map((s) => s.label);
}

/**
 * Legacy: Get list of incomplete item labels.
 * @deprecated Use getIncompleteSections instead
 */
export function getIncompleteItems(
  meta: StudentMetadata,
  hasPhoto: boolean
): string[] {
  return getCompletenessItems(meta, hasPhoto)
    .filter((i) => !i.done)
    .map((i) => i.label);
}
