/**
 * Federal programs every state's plan includes (6 Oct 2026).
 *
 * The researched answer key (data/benefits/answer-key) found a counselor
 * recommends these for most dementia-caregiver families, and no state's
 * program list held them: for 12 of 40 families the right first call was the
 * VA. They live here, once, rather than copied into 51 state files.
 *
 * Same shape as a pipeline draft, so the finder, the question engine and the
 * program page read them unchanged. Income limits are rules, not dollars:
 * incomeTable is computed from data/pipeline/federal-thresholds.json, so the
 * January update of that table moves them. Ids carry a "federal-" prefix so
 * they never collide with a state's own.
 *
 * Verify yearly: Extra Help limits (medicare.gov, January), VA pension rates
 * and net worth limit (va.gov, each 1 December), SSI rate (federal-thresholds).
 */
import type { PipelineDraft } from "@/data/pipeline-drafts-types";
import thresholds from "@/data/pipeline/federal-thresholds.json";

const YEAR = 2026;
const fpl = (thresholds.fpl as Record<string, Record<string, number[]>>)[String(YEAR)]["48"];
const ssi = (thresholds.ssi as Record<string, { individual: number; couple: number }>)[String(YEAR)];
/** Monthly limit at a percentage of the poverty guideline, rounded down. */
const fplMonthly = (size: number, percent: number) => Math.floor(((fpl[0] + fpl[1] * (size - 1)) * percent) / 100 / 12);
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const CHECKED = "2026-10-06";
const source = (url: string, confidence: "official" | "aggregator" = "official") => ({ url, checkedAt: CHECKED, confidence, checkedBy: "claude (answer key, read on the page)" });

const EXTRA_HELP = { individual: 18090, couple: 36100 };
const VA = { netWorth: 163699, veteranCoupleAA: 34488, veteranAloneAA: 29093, survivorAA: 18697 };

const base = {
  programType: "benefit",
  complexity: "low",
  savingsSource: "",
  savingsVerified: false,
  contentStatus: "published",
  draftedAt: CHECKED,
  lastVerifiedDate: CHECKED,
  geographicScope: { type: "federal", stateVariation: false },
} satisfies Partial<PipelineDraft>;

export const FEDERAL_PROGRAMS: PipelineDraft[] = [
  {
    ...base,
    id: "federal-extra-help",
    name: "Extra Help with Medicare Prescription Drug Costs",
    shortName: "Extra Help",
    tagline: "Lowers what Medicare drug coverage costs: the premium, the deductible and each prescription.",
    intro: "Extra Help is a Medicare program, run by Social Security, that pays most of the cost of Part D drug coverage. Anyone who has Medicaid, a Medicare Savings Program or SSI gets it automatically.",
    savingsRange: "Most of the cost of Part D coverage",
    structuredEligibility: {
      summary: [
        "Has Medicare (age 65+, or any age on Medicare for a disability)",
        `Income under 150% of the federal poverty level: ${money(fplMonthly(1, 150))}/month for one person, ${money(fplMonthly(2, 150))} for a couple (${YEAR})`,
        `Savings under ${money(EXTRA_HELP.individual)} for one person, ${money(EXTRA_HELP.couple)} for a couple (${YEAR}); a home, one car and burial funds don't count`,
        "Automatic for anyone with Medicaid, a Medicare Savings Program or SSI",
      ],
      ageRequirement: "65+ (or any age on Medicare with a disability)",
      incomeTable: [
        { householdSize: 1, monthlyLimit: fplMonthly(1, 150) },
        { householdSize: 2, monthlyLimit: fplMonthly(2, 150) },
      ],
      incomeRule: { basis: "FPL", percent: 150, year: YEAR, confidence: "official" },
      assetLimits: { individual: EXTRA_HELP.individual, couple: EXTRA_HELP.couple, exemptAssets: ["Home", "One car", "Burial funds"] },
      functionalRequirement: null,
    },
    applicationGuide: {
      method: "online",
      summary: "Apply online with Social Security, by phone, or at a local office. A free Medicare counselor (SHIP) can help.",
      processingTime: "About 4 to 6 weeks",
      urls: [{ label: "Apply for Extra Help", url: "https://www.ssa.gov/medicare/part-d-extra-help" }],
    },
    phone: "1-800-772-1213",
    sourceUrl: "https://www.medicare.gov/basics/costs/help/drug-costs",
    contacts: [{ label: "Social Security", description: "Apply for Extra Help by phone", phone: "1-800-772-1213", hours: "Mon to Fri, 8am to 7pm local time" }],
    documentsNeeded: ["Medicare card", "Social Security number", "Recent bank statements", "Social Security or pension award letters"],
    ruleSources: {
      incomeTable: source("https://www.medicare.gov/basics/costs/help/drug-costs"),
      assetLimits: source("https://www.medicare.gov/basics/costs/help/drug-costs"),
      phone: source("https://www.ssa.gov/medicare/part-d-extra-help"),
    },
  },
  {
    ...base,
    id: "federal-ssi",
    name: "Supplemental Security Income (SSI)",
    shortName: "SSI",
    tagline: "A monthly check from Social Security for people 65+ or disabled with very little income and savings.",
    intro: "SSI pays a monthly amount that tops up very low income. In most states it also brings Medicaid with it.",
    savingsRange: `Up to ${money(ssi.individual * 12)}/year`,
    savingsSource: `${YEAR} federal benefit rate, ${money(ssi.individual)}/month`,
    structuredEligibility: {
      summary: [
        "Age 65+, or any age with a disability or blindness",
        `Income under about ${money(ssi.individual + 20)}/month for one person, ${money(ssi.couple + 20)} for a couple (${YEAR}; the first $20 doesn't count)`,
        "Savings under $2,000 for one person, $3,000 for a couple; a home and one car don't count",
      ],
      ageRequirement: "65+ (or any age with a disability or blindness)",
      incomeTable: [
        { householdSize: 1, monthlyLimit: ssi.individual + 20 },
        { householdSize: 2, monthlyLimit: ssi.couple + 20 },
      ],
      incomeRule: { basis: "SSI", percent: 100, year: YEAR, disregard: 20, confidence: "official" },
      assetLimits: { individual: 2000, couple: 3000, exemptAssets: ["Home", "One car"] },
      functionalRequirement: null,
    },
    applicationGuide: {
      method: "phone",
      summary: "Call Social Security to make an appointment, or start online.",
      processingTime: "About 3 to 6 months",
      urls: [{ label: "Supplemental Security Income", url: "https://www.ssa.gov/ssi" }],
    },
    phone: "1-800-772-1213",
    sourceUrl: "https://www.ssa.gov/ssi",
    contacts: [{ label: "Social Security", description: "Apply for SSI", phone: "1-800-772-1213", hours: "Mon to Fri, 8am to 7pm local time" }],
    documentsNeeded: ["Social Security number", "Birth certificate or proof of age", "Bank statements", "Lease or mortgage statement", "Award letters for any other income"],
    ruleSources: {
      incomeTable: source("https://www.ssa.gov/oact/cola/SSI.html"),
      assetLimits: source("https://www.ssa.gov/ssi/text-resources-ussi.htm"),
      phone: source("https://www.ssa.gov/ssi"),
    },
  },
  {
    ...base,
    id: "federal-va-pension",
    name: "VA Pension with Aid and Attendance (veterans and surviving spouses)",
    shortName: "VA Pension and Aid & Attendance",
    tagline: "A monthly VA payment for wartime veterans and their surviving spouses, more when they need help with daily care.",
    intro: "The VA pension tops up income for wartime veterans and surviving spouses. Aid and Attendance adds to it for someone who needs help bathing, dressing or staying safe, which is how many families pay for care at home. Paid care counts against income, so families with more income than the limit often still qualify once care costs are counted.",
    savingsRange: `Up to ${money(VA.veteranCoupleAA)}/year`,
    savingsSource: "VA maximum annual pension rates from 1 Dec 2025",
    structuredEligibility: {
      summary: [
        "A veteran who served at least 90 days of active duty, with at least one day during a wartime period, or the surviving spouse of one",
        "A veteran 65+ or with a permanent disability; any age for a surviving spouse",
        `Net worth (savings plus a year's income) under ${money(VA.netWorth)} (Dec 2025 to Nov 2026); a home and car don't count`,
        `Yearly income, after paid medical and care costs, under the pension limit: with Aid and Attendance ${money(VA.veteranCoupleAA)} for a married veteran, ${money(VA.veteranAloneAA)} for a single veteran, ${money(VA.survivorAA)} for a surviving spouse`,
        "Aid and Attendance is for someone who needs help with daily activities, is bedbound, or lives in a nursing home",
      ],
      ageRequirement: "65+ (or any age with a permanent disability; any age for a surviving spouse)",
      // No incomeTable: the limit is net of medical and care costs, which the
      // finder doesn't ask, so a monthly cap would rule out families who qualify.
      incomeTable: null,
      // The net worth limit stays in the summary but not as a rule: the
      // savings question tops out at "more than $10,000", so it could never
      // confirm a $163,699 limit and the pension would never read as likely.
      assetLimits: null,
      functionalRequirement: null,
    },
    applicationGuide: {
      method: "mixed",
      summary: "A free accredited Veterans Service Officer at the county or state veterans office can file it. File an Intent to File first: it holds the start date for up to a year.",
      processingTime: "About 3 to 6 months",
      urls: [
        { label: "Aid and Attendance", url: "https://www.va.gov/pension/aid-attendance-housebound/" },
        { label: "Find an accredited representative", url: "https://www.va.gov/get-help-from-accredited-representative/find-rep/" },
      ],
    },
    phone: "1-800-827-1000",
    sourceUrl: "https://www.va.gov/pension/veterans-pension-rates/",
    contacts: [{ label: "VA benefits line", description: "Ask about pension and Aid and Attendance, or a local service officer", phone: "1-800-827-1000", hours: "Mon to Fri, 8am to 9pm ET" }],
    documentsNeeded: ["Discharge papers (DD-214)", "Marriage and death certificates, for a surviving spouse", "Income and bank statements", "Bills for care and medical costs", "A doctor's note on help needed with daily care"],
    ruleSources: {
      assetLimits: source("https://www.va.gov/pension/veterans-pension-rates/"),
      phone: source("https://www.va.gov/resources/helpful-va-phone-numbers/"),
    },
  },
];

export const FEDERAL_PROGRAM_IDS = new Set(FEDERAL_PROGRAMS.map((p) => p.id));

/** The state's own program covers it already (California's SSI/SSP). A
 *  "State SSI Supplement" doesn't: it is paid on top of SSI, so the family
 *  still needs SSI itself (11 states list only the supplement). */
const STATE_HOLDS: Record<string, RegExp> = {
  "federal-ssi": /^(?!.*\bsupplement\b).*(\bssi\b|supplemental security income)/i,
  "federal-extra-help": /extra help|low[- ]income subsidy|\blis\b/i,
  "federal-va-pension": /aid (and|&) attendance|va pension|veterans? pension/i,
};

/** Federal programs to add to a state's list: those the state's own list doesn't already hold. */
export function federalProgramsFor(stateProgramNames: string[]): PipelineDraft[] {
  return FEDERAL_PROGRAMS.filter((p) => !stateProgramNames.some((n) => STATE_HOLDS[p.id]?.test(n)));
}
