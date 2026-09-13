import type { StudentMetadata } from "@/lib/types";

/**
 * MedJobs Profile Completeness — Single Source of Truth
 *
 * Organized into 8 logical sections that match the portal page structure:
 * 1. Profile Overview (name, university, location, photo - from onboarding)
 * 2. Semester Schedule
 * 3. Availability & Commitment
 * 4. Why I Want to Be a Caregiver
 * 5. Screening Questions
 * 6. Background & Experience (experience level, care types, languages, certifications)
 * 7. Resume & LinkedIn
 * 8. Verification (intro video, driver's license, car insurance) - the "go live" step
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
  | "skills"
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
 * @param hasBasicInfo - Whether basic profile info exists (name, university - from onboarding)
 */
export function getSectionCompleteness(
  meta: StudentMetadata,
  hasPhoto: boolean,
  hasBasicInfo: { hasName: boolean; hasUniversity: boolean; hasLocation: boolean }
): CompletenessSection[] {
  const scenarios = meta.scenario_responses || [];
  const answeredScenarios = scenarios.filter((s) => (s.answer?.length ?? 0) >= 50).length;

  // 1. Profile Overview (from onboarding)
  const overviewItems = [
    { key: "name", label: "Name", done: hasBasicInfo.hasName },
    { key: "university", label: "University", done: hasBasicInfo.hasUniversity },
    { key: "location", label: "Location", done: hasBasicInfo.hasLocation },
    { key: "photo", label: "Profile photo", done: hasPhoto },
  ];
  const overviewDone = overviewItems.filter((i) => i.done).length;
  const overviewPercent = Math.round((overviewDone / overviewItems.length) * 100);

  // 2. Verification
  const verificationItems = [
    { key: "video", label: "Intro video", done: !!meta.video_intro_url },
    { key: "license", label: "Driver's license", done: !!(meta.drivers_license_url && meta.drivers_license_expiration) },
    { key: "insurance", label: "Car insurance", done: !!(meta.car_insurance_url && meta.car_insurance_expiration) },
  ];
  const verificationDone = verificationItems.filter((i) => i.done).length;
  const verificationPercent = Math.round((verificationDone / verificationItems.length) * 100);

  // 3. Weekly Availability
  const hasAvailabilitySchedule = meta.availability_schedule
    ? Object.values(meta.availability_schedule).some((slots) => Array.isArray(slots) && slots.length > 0)
    : false;
  const scheduleItems = [
    { key: "schedule", label: "Weekly availability", done: hasAvailabilitySchedule || !!meta.course_schedule_grid },
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

  // 7b. Certifications (own section, optional but tracked)
  const certItems = [
    { key: "certifications", label: "Certifications", done: (meta.certifications?.length ?? 0) > 0 },
  ];
  const certsDone = certItems.filter((i) => i.done).length;
  const certsPercent = Math.round((certsDone / certItems.length) * 100);

  // 7c. Skills
  const skillsItems = [
    { key: "skills", label: "Skills", done: (meta.skills?.length ?? 0) >= 1 },
  ];
  const skillsDone = skillsItems.filter((i) => i.done).length;
  const skillsPercent = Math.round((skillsDone / skillsItems.length) * 100);

  // 8. Resume & LinkedIn
  const resumeItems = [
    { key: "resume_linkedin", label: "Resume or LinkedIn", done: !!(meta.resume_url || meta.linkedin_url) },
  ];
  const resumeDone = resumeItems.filter((i) => i.done).length;
  const resumePercent = Math.round((resumeDone / resumeItems.length) * 100);

  return [
    { id: "overview", label: "Profile Overview", percent: overviewPercent, done: overviewPercent === 100, items: overviewItems },
    { id: "schedule", label: "Weekly Availability", percent: schedulePercent, done: schedulePercent === 100, items: scheduleItems },
    { id: "availability", label: "Availability & Commitment", percent: availabilityPercent, done: availabilityPercent === 100, items: availabilityItems },
    { id: "why", label: "Why I Want to Be a Caregiver", percent: whyPercent, done: whyPercent === 100, items: whyItems },
    { id: "scenarios", label: "Screening Questions", percent: scenariosPercent, done: scenariosPercent === 100, items: scenarioItems },
    { id: "background", label: "Experience", percent: backgroundPercent, done: backgroundPercent === 100, items: backgroundItems },
    { id: "certifications", label: "Certifications", percent: certsPercent, done: certsPercent === 100, items: certItems },
    { id: "skills", label: "Skills", percent: skillsPercent, done: skillsPercent === 100, items: skillsItems },
    { id: "resume", label: "Resume & LinkedIn", percent: resumePercent, done: resumePercent === 100, items: resumeItems },
    { id: "verification", label: "Verification", percent: verificationPercent, done: verificationPercent === 100, items: verificationItems },
  ];
}

/**
 * Calculate the overall completeness percentage (0-100).
 * Uses section-weighted average where each section counts equally.
 */
export function calculateCompleteness(
  meta: StudentMetadata,
  hasPhoto: boolean,
  hasBasicInfo: { hasName: boolean; hasUniversity: boolean; hasLocation: boolean } = {
    hasName: true,
    hasUniversity: !!meta.university,
    hasLocation: true, // Location is typically set during onboarding
  }
): number {
  const sections = getSectionCompleteness(meta, hasPhoto, hasBasicInfo);
  const totalPercent = sections.reduce((sum, s) => sum + s.percent, 0);
  return Math.round(totalPercent / sections.length);
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
    { key: "commitment", label: "Availability & commitment", done: !!(meta.hours_per_week_range && meta.commitment_statement && meta.commitment_statement.length >= 50), category: "profile" },
    { key: "experience", label: "Experience level", done: meta.years_caregiving != null, category: "profile" },
    { key: "care_types", label: "Care types", done: (meta.care_experience_types?.length ?? 0) > 0, category: "profile" },
    { key: "languages", label: "Languages", done: (meta.languages?.length ?? 0) > 0, category: "profile" },
    { key: "why", label: "Why I want to be a caregiver", done: !!(meta.why_caregiving && meta.why_caregiving.length >= 100), category: "profile" },
    { key: "scenarios", label: "Screening questions", done: scenarios.length >= SCENARIO_QUESTIONS.length && scenarios.every((s) => (s.answer?.length ?? 0) >= 50), category: "profile" },
    { key: "resume_or_linkedin", label: "Resume or LinkedIn", done: !!(meta.resume_url || meta.linkedin_url), category: "profile" },
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
  hasBasicInfo: { hasName: boolean; hasUniversity: boolean; hasLocation: boolean }
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
