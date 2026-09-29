// Senior Benefits Finder types — ported from iOS BenefitsModels.swift

// ─── Enums ────────────────────────────────────────────────────────────────────

export type BenefitCategory =
  | "healthcare"
  | "income"
  | "housing"
  | "food"
  | "utilities"
  | "caregiver";

export const BENEFIT_CATEGORIES: Record<
  BenefitCategory,
  { displayTitle: string; icon: string; color: string; shortDescription: string }
> = {
  healthcare: {
    displayTitle: "Healthcare",
    icon: "🏥",
    color: "blue",
    shortDescription: "Medical coverage & health services",
  },
  income: {
    displayTitle: "Income Support",
    icon: "💰",
    color: "green",
    shortDescription: "Financial assistance & cash benefits",
  },
  housing: {
    displayTitle: "Housing",
    icon: "🏠",
    color: "purple",
    shortDescription: "Housing assistance & home modifications",
  },
  food: {
    displayTitle: "Food & Nutrition",
    icon: "🍎",
    color: "orange",
    shortDescription: "Food assistance & meal programs",
  },
  utilities: {
    displayTitle: "Utilities",
    icon: "⚡",
    color: "yellow",
    shortDescription: "Help with utility bills & energy costs",
  },
  caregiver: {
    displayTitle: "Caregiver Support",
    icon: "🤝",
    color: "pink",
    shortDescription: "Support for family caregivers",
  },
};

export type CarePreference = "stayHome" | "exploringFacility" | "unsure";

export const CARE_PREFERENCES: Record<
  CarePreference,
  { displayTitle: string; icon: string }
> = {
  stayHome: { displayTitle: "Stay at home", icon: "🏠" },
  exploringFacility: { displayTitle: "Exploring facilities", icon: "🏢" },
  unsure: { displayTitle: "Not sure yet", icon: "🤔" },
};

export type PrimaryNeed =
  | "personalCare"
  | "householdTasks"
  | "healthManagement"
  | "companionship"
  | "financialHelp"
  | "memoryCare"
  | "mobilityHelp";

export const PRIMARY_NEEDS: Record<
  PrimaryNeed,
  { displayTitle: string; shortDescription: string; icon: string }
> = {
  personalCare: {
    displayTitle: "Personal Care",
    shortDescription: "Bathing, dressing, grooming",
    icon: "🛁",
  },
  householdTasks: {
    displayTitle: "Household Tasks",
    shortDescription: "Cooking, cleaning, laundry",
    icon: "🧹",
  },
  healthManagement: {
    displayTitle: "Health Management",
    shortDescription: "Medications, doctor visits",
    icon: "💊",
  },
  companionship: {
    displayTitle: "Companionship",
    shortDescription: "Social interaction, activities",
    icon: "👋",
  },
  financialHelp: {
    displayTitle: "Financial Help",
    shortDescription: "Paying for care, benefits",
    icon: "💵",
  },
  memoryCare: {
    displayTitle: "Memory Care",
    shortDescription: "Alzheimer's, dementia support",
    icon: "🧠",
  },
  mobilityHelp: {
    displayTitle: "Mobility Help",
    shortDescription: "Walking, transfers, wheelchair",
    icon: "🦽",
  },
};

export type IncomeRange =
  | "under1500"
  | "under2500"
  | "under4000"
  | "under6000"
  | "over6000"
  | "preferNotToSay";

export const INCOME_RANGES: Record<
  IncomeRange,
  { displayTitle: string; midpointMonthly: number | null; maxMonthly: number | null }
> = {
  under1500: { displayTitle: "Under $1,500/mo", midpointMonthly: 1000, maxMonthly: 1500 },
  under2500: { displayTitle: "$1,500 – $2,500/mo", midpointMonthly: 2000, maxMonthly: 2500 },
  under4000: { displayTitle: "$2,500 – $4,000/mo", midpointMonthly: 3250, maxMonthly: 4000 },
  under6000: { displayTitle: "$4,000 – $6,000/mo", midpointMonthly: 5000, maxMonthly: 6000 },
  over6000: { displayTitle: "Over $6,000/mo", midpointMonthly: 8000, maxMonthly: null },
  preferNotToSay: { displayTitle: "Prefer not to say", midpointMonthly: null, maxMonthly: null },
};

/**
 * `doesNotHave` and `denied` are BOTH "no Medicaid today", and they are kept
 * apart because they need different letters, not different programs.
 *
 * A family that has never applied should be told how to apply. A family that
 * applied and was turned down should be told why this is still worth a call:
 * long-term-care Medicaid runs on different income, asset and spend-down rules
 * than the category most denials come from, so an earlier "no" often does not
 * decide it. Sending the first letter to someone already denied is the version
 * that costs us their trust.
 *
 * `doesNotHave` predates the split (50 families hold it as of 2026-09-01) and
 * stays ambiguous for them on purpose — we will not retroactively assert which
 * of the two they meant. Treat a legacy `doesNotHave` as "unknown which", and
 * prefer the denial-aware wording, which reads correctly either way.
 */
export type MedicaidStatus =
  | "alreadyHas"
  | "applying"
  | "notSure"
  | "doesNotHave"
  | "denied";

export const MEDICAID_STATUSES: Record<
  MedicaidStatus,
  { displayTitle: string; shortTitle: string }
> = {
  alreadyHas: { displayTitle: "Already have Medicaid", shortTitle: "Has Medicaid" },
  applying: { displayTitle: "Currently applying", shortTitle: "Applying" },
  notSure: { displayTitle: "Not sure", shortTitle: "Not sure" },
  doesNotHave: { displayTitle: "Haven't applied", shortTitle: "No Medicaid" },
  denied: { displayTitle: "Applied and was turned down", shortTitle: "Medicaid denied" },
};

export type VeteranStatus = "yes" | "no" | "preferNotToSay";

export const VETERAN_STATUSES: Record<
  VeteranStatus,
  { displayTitle: string; shortTitle: string }
> = {
  yes: { displayTitle: "Yes, a veteran", shortTitle: "Veteran" },
  no: { displayTitle: "No", shortTitle: "Not a veteran" },
  preferNotToSay: { displayTitle: "Prefer not to say", shortTitle: "Undisclosed" },
};

export type IntakeStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const INTAKE_STEPS: Record<
  IntakeStep,
  { title: string; question: string }
> = {
  0: { title: "Location", question: "What's your ZIP code?" },
  1: { title: "Age", question: "How old is the person who needs care?" },
  2: { title: "Care Setting", question: "Hoping to stay at home, or exploring facilities?" },
  3: { title: "Needs", question: "What kind of help is most needed?" },
  // Stored as incomeRange and compared to program INCOME limits, so it has
  // to ask for income (research participants asked "whose income?").
  4: { title: "Income", question: "About how much is the monthly income of the person who needs care?" },
  5: { title: "Medicaid", question: "Do you currently have Medicaid?" },
  6: { title: "Veteran", question: "Is the person who needs care a veteran?" },
};

export const TOTAL_INTAKE_STEPS = 7;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BenefitsIntakeAnswers {
  zipCode: string | null;
  age: number | null;
  carePreference: CarePreference | null;
  primaryNeeds: PrimaryNeed[];
  incomeRange: IncomeRange | null;
  medicaidStatus: MedicaidStatus | null;
  veteranStatus: VeteranStatus | null;
  // Derived from ZIP
  stateCode: string | null;
  county: string | null;
}

export function createEmptyIntakeAnswers(): BenefitsIntakeAnswers {
  return {
    zipCode: null,
    age: null,
    carePreference: null,
    primaryNeeds: [],
    incomeRange: null,
    medicaidStatus: null,
    veteranStatus: null,
    stateCode: null,
    county: null,
  };
}

/** Matches the Supabase `sbf_federal_programs` and `sbf_state_programs` schema */
export interface BenefitProgram {
  id: string;
  name: string;
  short_name: string | null;
  description: string;
  category: BenefitCategory;
  min_age: number | null;
  max_income_single: number | null;
  max_income_couple: number | null;
  requires_disability: boolean;
  requires_veteran: boolean | null;
  requires_medicaid: boolean;
  requires_medicare: boolean | null;
  phone: string | null;
  website: string | null;
  application_url: string | null;
  what_to_say: string | null;
  priority_score: number;
  is_active: boolean;
  state_code: string | null;
  savings_range: string | null;
  waiver_library_url: string | null;
  // Verification metadata
  source_url: string | null;
  last_verified_date: string | null;
  verified_by: string | null;
  savings_source: string | null;
  savings_verified: boolean;
}

/** Matches the Supabase `sbf_area_agencies` schema */
export interface AreaAgency {
  id: string;
  name: string;
  state_code: string;
  city: string | null;
  region_name: string | null;
  counties_served: string[] | null;
  zip_codes_served: string[] | null;
  phone: string;
  website: string | null;
  email: string | null;
  address: string | null;
  services_offered: string[] | null;
  what_to_say: string | null;
  is_active: boolean;
}

export interface BenefitMatch {
  id: string;
  program: BenefitProgram;
  matchScore: number; // 0-100
  matchReasons: string[];
  tierLabel: "Strong Match" | "Likely Match" | "May Qualify";
}

export interface BenefitsSearchResult {
  federalPrograms: BenefitProgram[];
  statePrograms: BenefitProgram[];
  localAAA: AreaAgency | null;
  matchedPrograms: BenefitMatch[];
}

// ─── Savings Estimates ───────────────────────────────────────────────────────
// Client-side lookup for estimated monthly savings per program.
// These are approximate ranges based on typical benefit values.
// Keyed by program `name` (case-insensitive match via helper).

const PROGRAM_SAVINGS_ESTIMATES: Record<string, { monthlyLow: number; monthlyHigh: number }> = {
  // Healthcare
  "Medicaid": { monthlyLow: 400, monthlyHigh: 900 },
  "Medicare Savings Program (QMB)": { monthlyLow: 170, monthlyHigh: 250 },
  "Medicare Savings Program (SLMB)": { monthlyLow: 100, monthlyHigh: 180 },
  "Medicare Savings Program (QI)": { monthlyLow: 100, monthlyHigh: 180 },
  "Medicare Part D Extra Help (LIS)": { monthlyLow: 50, monthlyHigh: 150 },
  "Aid & Attendance (A&A)": { monthlyLow: 1400, monthlyHigh: 2400 },
  "Veterans Directed Care": { monthlyLow: 1500, monthlyHigh: 3000 },
  "PACE (Program of All-Inclusive Care for the Elderly)": { monthlyLow: 500, monthlyHigh: 2000 },
  // Income
  "Supplemental Security Income (SSI)": { monthlyLow: 600, monthlyHigh: 950 },
  "Social Security Disability Insurance (SSDI)": { monthlyLow: 800, monthlyHigh: 1800 },
  // Food
  "SNAP (Supplemental Nutrition Assistance Program)": { monthlyLow: 100, monthlyHigh: 300 },
  "Commodity Supplemental Food Program (CSFP)": { monthlyLow: 50, monthlyHigh: 100 },
  "Meals on Wheels": { monthlyLow: 100, monthlyHigh: 250 },
  "Senior Farmers\u2019 Market Nutrition Program": { monthlyLow: 20, monthlyHigh: 50 },
  // Housing
  "Section 8 Housing Choice Voucher": { monthlyLow: 400, monthlyHigh: 1200 },
  "Section 202 Supportive Housing for the Elderly": { monthlyLow: 300, monthlyHigh: 800 },
  "USDA Rural Housing": { monthlyLow: 200, monthlyHigh: 500 },
  // Utilities
  "LIHEAP (Low Income Home Energy Assistance Program)": { monthlyLow: 50, monthlyHigh: 200 },
  "Weatherization Assistance Program": { monthlyLow: 30, monthlyHigh: 80 },
  "Lifeline (Phone/Internet Discount)": { monthlyLow: 10, monthlyHigh: 35 },
  // Caregiver
  "National Family Caregiver Support Program": { monthlyLow: 100, monthlyHigh: 400 },
  "Respite Care": { monthlyLow: 200, monthlyHigh: 600 },
  "Medicaid Home and Community-Based Services (HCBS)": { monthlyLow: 800, monthlyHigh: 3000 },
};

/** Look up estimated savings for a program. Returns null if not in the table. */
export function getEstimatedSavings(
  programName: string
): { monthly: number; annual: number } | null {
  const key = programName.trim();
  const match = PROGRAM_SAVINGS_ESTIMATES[key];
  if (!match) {
    // Try partial match (program name contains the key or vice versa)
    const partial = Object.entries(PROGRAM_SAVINGS_ESTIMATES).find(
      ([k]) => key.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(key.toLowerCase())
    );
    if (!partial) return null;
    const avg = Math.round((partial[1].monthlyLow + partial[1].monthlyHigh) / 2);
    return { monthly: avg, annual: avg * 12 };
  }
  const avg = Math.round((match.monthlyLow + match.monthlyHigh) / 2);
  return { monthly: avg, annual: avg * 12 };
}

/** Get savings range for a program (for display as "$X–$Y/mo"). */
export function getSavingsRange(
  programName: string
): { low: number; high: number } | null {
  const key = programName.trim();
  const match = PROGRAM_SAVINGS_ESTIMATES[key];
  if (match) return { low: match.monthlyLow, high: match.monthlyHigh };
  const partial = Object.entries(PROGRAM_SAVINGS_ESTIMATES).find(
    ([k]) => key.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(key.toLowerCase())
  );
  if (!partial) return null;
  return { low: partial[1].monthlyLow, high: partial[1].monthlyHigh };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTierLabel(score: number): BenefitMatch["tierLabel"] {
  if (score >= 75) return "Strong Match";
  if (score >= 50) return "Likely Match";
  return "May Qualify";
}

export function getEstimatedMonthlyIncome(
  incomeRange: IncomeRange | null
): number | null {
  if (!incomeRange) return null;
  return INCOME_RANGES[incomeRange].midpointMonthly;
}

/** Maps PrimaryNeed selections to BenefitCategory for matching boost */
export function needsToCategories(needs: PrimaryNeed[]): BenefitCategory[] {
  const mapping: Record<PrimaryNeed, BenefitCategory[]> = {
    personalCare: ["healthcare"],
    householdTasks: ["caregiver", "housing"],
    healthManagement: ["healthcare"],
    companionship: ["caregiver"],
    financialHelp: ["income", "food", "housing", "utilities"],
    // Dementia care leans on caregiver programs (respite, adult day, family
    // caregiver support) as much as on medical ones.
    memoryCare: ["healthcare", "caregiver"],
    mobilityHelp: ["healthcare", "housing"],
  };
  const categories = new Set<BenefitCategory>();
  for (const need of needs) {
    for (const cat of mapping[need]) {
      categories.add(cat);
    }
  }
  return Array.from(categories);
}
