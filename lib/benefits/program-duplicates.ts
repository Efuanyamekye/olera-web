/**
 * Programs the data holds more than once, under a second id and usually a
 * slightly different name ("Indiana PathWays for Aging" and "PathWays for
 * Aging Waiver"). Each entry maps the duplicate id to the id that stays.
 *
 * Hand-checked on 2 Oct 2026 from 112 look-alike pairs: same agency, same
 * program, usually the same phone. Pairs that only look alike are NOT here
 * (Utah Medicaid and Utah SNAP share a phone; Louisiana's Community Choices
 * Waiver and paid family caregiving through it are different programs;
 * Connecticut's two CHCPE entries and Arizona's ALTCS vs its HCBS branch were
 * too unclear to merge). The kept id is the fact-checked pipeline draft where
 * there is one; between two drafts, the one listed first, because the state
 * page shows the first few in draft order. In Indiana it is also the entry
 * with the verified 800-713-9023.
 *
 * A duplicate id leaves the finder, the plan, the state page and the
 * sitemaps, and its page permanently redirects to the kept program.
 */
const DUPLICATES: Record<string, Record<string, string>> = {
  AL: {
    "ed-medicaid-waiver": "medicaid-elderly-disabled-waiver",
    "elderly-and-disabled-e-d-medicaid-waiver": "medicaid-elderly-disabled-waiver",
  },
  AR: { "national-family-caregiver-support-program": "family-caregiver-support" },
  AZ: { "arizona-long-term-care-system-altcs": "ahcccs-altcs" },
  CA: { "multipurpose-senior-services-program-mssp": "mssp-waiver" },
  DE: { "diamond-state-health-plan-plus-long-term-care-community-serv": "diamond-state-health-plan" },
  GA: { "aged-blind-and-disabled-medicaid-abd": "medicaid-aged-blind-disabled" },
  ID: {
    "home-delivered-meals": "home-delivered-meals-title-iii",
    "national-family-caregiver-support-program": "nfcsp-caregiver-support",
  },
  IL: { "community-care-program-home-delivered-meals": "ccp-home-delivered-meals" },
  IN: {
    "indiana-pathways-for-aging": "pathways-aging-waiver",
    "pathways-for-aging-waiver": "pathways-aging-waiver",
    "pathways-aging-ltss": "pathways-aging-waiver",
  },
  IA: { "elderly-waiver-program-hcbs-waiver": "medicaid-hcbs-elderly-waiver" },
  KS: { "family-caregiver-support-program": "caregiver-support-programs" },
  KY: {
    "national-family-caregiver-support-program-nfcsp": "national-family-caregiver-support",
    "home-and-community-based-hcb-waiver": "hcb-waiver",
  },
  MI: { "mi-choice-waiver-program": "choice-waiver" },
  MN: { "medical-assistance-ma-for-elderly-blind-and-disabled": "medical-assistance-medicaid" },
  MS: {
    "elderly-and-disabled-waiver": "elderly-disabled-waiver",
    "national-family-caregiver-support-program": "family-caregiver-support",
  },
  MO: {
    "mo-healthnet-for-the-aged-blind-and-disabled-abd": "healthnet-medicaid",
    "missouri-property-tax-credit": "property-tax-credit-circuit-breaker",
  },
  MT: { "medicaid-for-aged-blind-or-disabled": "medicaid-abd" },
  NE: {
    "aged-disabled-waiver": "aged-disabled-hcbs-waiver",
    "nebraska-home-delivered-meals-through-aging-services": "home-delivered-meals-aaa",
  },
  NV: {
    "hcbs-waiver": "medicaid-long-term-care",
    "hcbw-fe-waiver": "medicaid-long-term-care",
    "home-and-community-based-services-hcbs-frail-elderly-waiver": "medicaid-long-term-care",
    "home-delivered-meals-nevada-senior-services": "home-delivered-meals",
  },
  NH: {
    "medicaid-for-aged-disabled": "medicaid-aged-blind-disabled",
    "choices-for-independence-waiver": "cfi-waiver",
  },
  NJ: { "paad-pharmaceutical-assistance-to-the-aged-and-disabled": "paad-prescription-assistance" },
  NM: { "community-benefit-program": "centennial-care-community-benefit" },
  NC: {
    "home-delivered-meals-eat-right-to-age-well": "home-delivered-meals",
    "national-family-caregiver-support-program": "lifespan-respite-family-caregiver-support",
  },
  OH: {
    "aged-blind-or-disabled-abd-medicaid": "medicaid-aged-blind-disabled",
    "home-delivered-meals-golden-buckeye-nutrition-program": "home-delivered-meals-aging-network",
    "national-family-caregiver-support-program": "nfcsp-caregiver-support",
  },
  OK: {
    "soonercare-aged-blind-and-disabled": "medicaid-soonercare",
    "advantage-waiver-program": "advantage-waiver-hcbs",
  },
  OR: {
    "oregon-project-independence-medicaid-opi-m": "opi-m-medicaid-home-care",
    "family-caregiver-support-program": "family-caregiver-assistance-support",
  },
  PA: {
    "community-healthchoices": "community-healthchoices-chc",
    "family-caregiver-support-program": "caregiver-support-program",
  },
  TN: { "tennessee-family-caregiver-support-program": "nfcsp-caregiver-support" },
  UT: { "aging-waiver-home-and-community-based-services": "aging-waiver" },
  VA: { "commonwealth-coordinated-care-plus-ccc-plus-waiver": "ccc-plus-waiver" },
  WV: { "national-family-caregiver-support-program": "nfcsp-caregiver-support" },
  WI: { "wisconsin-seniorcare": "seniorcare-prescription-assistance" },
};

/** The id a duplicate program should resolve to, or null when it isn't one. */
export function duplicateTarget(stateAbbrev: string, programId: string): string | null {
  return DUPLICATES[stateAbbrev.toUpperCase()]?.[programId] ?? null;
}

/** A program list with duplicates (and any id listed twice) removed, order kept. */
export function withoutDuplicates<T extends { id: string }>(stateAbbrev: string, programs: T[]): T[] {
  const seen = new Set<string>();
  return programs.filter((p) => {
    if (seen.has(p.id) || duplicateTarget(stateAbbrev, p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/** For tests: every state and pair in the list. */
export const DUPLICATE_PROGRAMS = DUPLICATES;
