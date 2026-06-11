/**
 * Provider Pricing Strategy & Configuration
 *
 * Category-aware pricing system with three tiers:
 *   Tier 1 — Estimates Welcome (show ranges, standard disclaimer)
 *   Tier 2 — Estimates + Education (show ranges with payment/coverage context)
 *   Tier 3 — Education First (lead with coverage info, price secondary)
 *
 * State-level median costs from CareScout/Genworth Cost of Care Survey 2024.
 * Data collected July–December 2024, published March 2025.
 * Source: https://www.carescout.com/cost-of-care
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PricingTier = 1 | 2 | 3;

export type PriceUnit = "hour" | "month" | "day";

/**
 * Context passed into disclaimer/coverageNote template functions to
 * parameterize otherwise-generic copy with the specific provider's
 * name and location. When no context is supplied, the template returns
 * the generic sentence so non-provider callers (dashboards, city pages,
 * etc.) still get sensible default text.
 */
export interface PricingCopyContext {
  providerName?: string;
  city?: string;
  state?: string;
}

export type PricingCopyFn = (ctx?: PricingCopyContext) => string;

export interface CategoryPricingConfig {
  /** Display name for the category */
  label: string;
  /** Pricing strategy tier */
  tier: PricingTier;
  /** Default billing unit */
  unit: PriceUnit;
  /** Whether to show dollar estimates for unclaimed providers */
  showEstimate: boolean;
  /** Short disclaimer shown in tooltip next to price. Parameterized with provider name + city/state when context is supplied. */
  disclaimer: PricingCopyFn;
  /** Coverage/payment education note (Tier 2 & 3 only). Parameterized with provider name + city/state when context is supplied. */
  coverageNote: PricingCopyFn | null;
  /** One-line context for city page SEO content (static — city pages already have city context in the URL). */
  cityPageNote: string;
}

/** Build " in {city}, {state}" suffix, or " in {city}" / "" when data is partial. */
function locSuffix(ctx?: PricingCopyContext): string {
  if (!ctx) return "";
  if (ctx.city && ctx.state) return ` in ${ctx.city}, ${ctx.state}`;
  if (ctx.city) return ` in ${ctx.city}`;
  return "";
}

export interface StateMedianCosts {
  /** Homemaker / non-medical home care — hourly rate */
  homeCareHourly: number;
  /** Home health aide — hourly rate */
  homeHealthHourly: number;
  /** Assisted living community — monthly rate (private, one bedroom) */
  assistedLivingMonthly: number;
  /** Nursing home semi-private room — monthly rate */
  nursingHomeSemiPrivateMonthly: number;
  /** Nursing home private room — monthly rate */
  nursingHomePrivateMonthly: number;
}

// ---------------------------------------------------------------------------
// Category Pricing Configuration
// ---------------------------------------------------------------------------

/**
 * Maps provider_category (from olera-providers table) to pricing config.
 * Keys match CATEGORY_HIGHLIGHTS in lib/types/provider.ts.
 */
export const CATEGORY_PRICING_CONFIG: Record<string, CategoryPricingConfig> = {
  "Home Care (Non-medical)": {
    label: "Home Care",
    tier: 1,
    unit: "hour",
    showEstimate: true,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Rates at ${ctx.providerName}${locSuffix(ctx)} vary based on care needs, schedule, and caregiver experience.`
        : "Rates vary based on care needs, schedule, and caregiver experience.",
    coverageNote: null,
    cityPageNote:
      "Home care costs vary based on hours needed and level of care.",
  },

  "Independent Living": {
    label: "Independent Living",
    tier: 1,
    unit: "month",
    showEstimate: true,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Costs at ${ctx.providerName}${locSuffix(ctx)} vary by apartment size, community amenities, and location.`
        : "Costs vary by apartment size, community amenities, and location.",
    coverageNote: null,
    cityPageNote:
      "Independent living costs are similar to market-rate apartments with added amenities and services.",
  },

  "Assisted Living": {
    label: "Assisted Living",
    tier: 1,
    unit: "month",
    showEstimate: true,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Costs at ${ctx.providerName}${locSuffix(ctx)} vary based on room type, care level, and community amenities.`
        : "Costs vary based on room type, care level, and community amenities.",
    coverageNote: null,
    cityPageNote:
      "Assisted living costs depend on room type, care level needed, and community amenities.",
  },

  "Memory Care": {
    label: "Memory Care",
    tier: 2,
    unit: "month",
    showEstimate: true,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Costs at ${ctx.providerName}${locSuffix(ctx)} vary significantly based on the level of specialized care needed.`
        : "Costs vary significantly based on the level of specialized care needed.",
    coverageNote: (ctx) =>
      ctx?.providerName
        ? `Some memory care costs at ${ctx.providerName}${locSuffix(ctx)} may be partially covered by Medicaid or Veterans benefits. Long-term care insurance may also apply.`
        : "Some memory care costs may be partially covered by Medicaid or Veterans benefits. Long-term care insurance may also apply.",
    cityPageNote:
      "Memory care costs depend heavily on the level of specialized care needed. Some costs may be covered by Medicaid or VA benefits.",
  },

  "Home Health Care": {
    label: "Home Health",
    tier: 3,
    unit: "hour",
    showEstimate: false,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Most home health services at ${ctx.providerName}${locSuffix(ctx)} are covered by Medicare at no cost to patients when ordered by a doctor.`
        : "Most home health services are covered by Medicare at no cost to patients when ordered by a doctor.",
    coverageNote: (ctx) =>
      ctx?.providerName
        ? `Medicare covers most home health services at ${ctx.providerName}${locSuffix(ctx)} — skilled nursing, physical therapy, occupational therapy, and speech therapy — at no cost when you are homebound and have a doctor's order.`
        : "Medicare covers most home health services — skilled nursing, physical therapy, occupational therapy, and speech therapy — at no cost when you are homebound and have a doctor's order.",
    cityPageNote:
      "Most home health services are covered by Medicare at no cost to patients. A doctor's order is required.",
  },

  "Nursing Home": {
    label: "Nursing Home",
    tier: 3,
    unit: "month",
    showEstimate: false,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Most stays at ${ctx.providerName}${locSuffix(ctx)} are covered by Medicare (short-term rehab) or Medicaid (long-term care for eligible individuals).`
        : "Most nursing home stays are covered by Medicare (short-term rehab) or Medicaid (long-term care for eligible individuals).",
    coverageNote: (ctx) =>
      ctx?.providerName
        ? `At ${ctx.providerName}${locSuffix(ctx)}, Medicare covers up to 100 days of skilled nursing care after a qualifying hospital stay. Medicaid covers long-term nursing home care for eligible individuals. Private-pay rates apply for those not covered.`
        : "Medicare covers up to 100 days of skilled nursing care after a qualifying hospital stay. Medicaid covers long-term nursing home care for eligible individuals. Private-pay rates apply for those not covered.",
    cityPageNote:
      "Most nursing home care is covered by Medicare (short-term rehab) or Medicaid (long-term care). Private-pay rates vary by facility.",
  },

  "Hospice": {
    label: "Hospice",
    tier: 3,
    unit: "month",
    showEstimate: false,
    disclaimer: (ctx) =>
      ctx?.providerName
        ? `Hospice care at ${ctx.providerName}${locSuffix(ctx)} is typically covered by the Medicare Hospice Benefit at no cost to patients and families.`
        : "Hospice care is typically covered by the Medicare Hospice Benefit at no cost to patients and families.",
    coverageNote: (ctx) =>
      ctx?.providerName
        ? `The Medicare Hospice Benefit covers virtually all hospice services at ${ctx.providerName}${locSuffix(ctx)} — nursing care, medical equipment, medications, and counseling — at no cost to the patient.`
        : "The Medicare Hospice Benefit covers virtually all hospice services — nursing care, medical equipment, medications, and counseling — at no cost to the patient.",
    cityPageNote:
      "Hospice care is typically covered by Medicare at no cost to patients and families.",
  },
};

// ---------------------------------------------------------------------------
// State-Level Median Costs (CareScout/Genworth 2024)
// ---------------------------------------------------------------------------

/**
 * State median costs from CareScout Cost of Care Survey 2024.
 * Data: July–December 2024. Published March 2025.
 *
 * - homeCareHourly: Homemaker services (non-medical), hourly
 * - homeHealthHourly: Home health aide, hourly
 * - assistedLivingMonthly: Assisted living community, monthly (private, 1BR)
 * - nursingHomeSemiPrivateMonthly: Nursing home semi-private room, monthly
 * - nursingHomePrivateMonthly: Nursing home private room, monthly
 *
 * Memory care is not tracked separately by CareScout. We derive it as
 * assisted living + 25% (industry median premium).
 *
 * Independent living is not tracked by CareScout. We derive it as
 * assisted living × 0.55 (industry median ratio).
 */
export const STATE_MEDIAN_COSTS: Record<string, StateMedianCosts> = {
  AL: { homeCareHourly: 25, homeHealthHourly: 25, assistedLivingMonthly: 4572, nursingHomeSemiPrivateMonthly: 8152, nursingHomePrivateMonthly: 8517 },
  AK: { homeCareHourly: 34, homeHealthHourly: 34, assistedLivingMonthly: 10198, nursingHomeSemiPrivateMonthly: 30371, nursingHomePrivateMonthly: 30371 },
  AZ: { homeCareHourly: 35, homeHealthHourly: 36, assistedLivingMonthly: 6370, nursingHomeSemiPrivateMonthly: 7604, nursingHomePrivateMonthly: 10494 },
  AR: { homeCareHourly: 26, homeHealthHourly: 26, assistedLivingMonthly: 4724, nursingHomeSemiPrivateMonthly: 7148, nursingHomePrivateMonthly: 7711 },
  CA: { homeCareHourly: 38, homeHealthHourly: 39, assistedLivingMonthly: 7350, nursingHomeSemiPrivateMonthly: 11695, nursingHomePrivateMonthly: 15178 },
  CO: { homeCareHourly: 40, homeHealthHourly: 42, assistedLivingMonthly: 5877, nursingHomeSemiPrivateMonthly: 10038, nursingHomePrivateMonthly: 11650 },
  CT: { homeCareHourly: 34, homeHealthHourly: 35, assistedLivingMonthly: 8955, nursingHomeSemiPrivateMonthly: 15056, nursingHomePrivateMonthly: 16577 },
  DE: { homeCareHourly: 34, homeHealthHourly: 34, assistedLivingMonthly: 8558, nursingHomeSemiPrivateMonthly: 14174, nursingHomePrivateMonthly: 14889 },
  DC: { homeCareHourly: 38, homeHealthHourly: 38, assistedLivingMonthly: 9640, nursingHomeSemiPrivateMonthly: 8167, nursingHomePrivateMonthly: 16699 },
  FL: { homeCareHourly: 30, homeHealthHourly: 30, assistedLivingMonthly: 5324, nursingHomeSemiPrivateMonthly: 10342, nursingHomePrivateMonthly: 11558 },
  GA: { homeCareHourly: 28, homeHealthHourly: 29, assistedLivingMonthly: 4940, nursingHomeSemiPrivateMonthly: 8821, nursingHomePrivateMonthly: 9429 },
  HI: { homeCareHourly: 40, homeHealthHourly: 42, assistedLivingMonthly: 11311, nursingHomeSemiPrivateMonthly: 15087, nursingHomePrivateMonthly: 16364 },
  ID: { homeCareHourly: 31, homeHealthHourly: 34, assistedLivingMonthly: 4600, nursingHomeSemiPrivateMonthly: 10068, nursingHomePrivateMonthly: 10707 },
  IL: { homeCareHourly: 35, homeHealthHourly: 35, assistedLivingMonthly: 5836, nursingHomeSemiPrivateMonthly: 7908, nursingHomePrivateMonthly: 9125 },
  IN: { homeCareHourly: 32, homeHealthHourly: 33, assistedLivingMonthly: 5365, nursingHomeSemiPrivateMonthly: 8486, nursingHomePrivateMonthly: 10357 },
  IA: { homeCareHourly: 35, homeHealthHourly: 39, assistedLivingMonthly: 5184, nursingHomeSemiPrivateMonthly: 8927, nursingHomePrivateMonthly: 9657 },
  KS: { homeCareHourly: 31, homeHealthHourly: 32, assistedLivingMonthly: 5950, nursingHomeSemiPrivateMonthly: 7756, nursingHomePrivateMonthly: 8517 },
  KY: { homeCareHourly: 32, homeHealthHourly: 34, assistedLivingMonthly: 4900, nursingHomeSemiPrivateMonthly: 8730, nursingHomePrivateMonthly: 9946 },
  LA: { homeCareHourly: 20, homeHealthHourly: 22, assistedLivingMonthly: 5100, nursingHomeSemiPrivateMonthly: 7482, nursingHomePrivateMonthly: 7604 },
  ME: { homeCareHourly: 43, homeHealthHourly: 43, assistedLivingMonthly: 7988, nursingHomeSemiPrivateMonthly: 12927, nursingHomePrivateMonthly: 13885 },
  MD: { homeCareHourly: 35, homeHealthHourly: 35, assistedLivingMonthly: 7082, nursingHomeSemiPrivateMonthly: 12501, nursingHomePrivateMonthly: 14448 },
  MA: { homeCareHourly: 38, homeHealthHourly: 38, assistedLivingMonthly: 9058, nursingHomeSemiPrivateMonthly: 14448, nursingHomePrivateMonthly: 15543 },
  MI: { homeCareHourly: 33, homeHealthHourly: 34, assistedLivingMonthly: 6040, nursingHomeSemiPrivateMonthly: 10646, nursingHomePrivateMonthly: 11574 },
  MN: { homeCareHourly: 40, homeHealthHourly: 43, assistedLivingMonthly: 5825, nursingHomeSemiPrivateMonthly: 12167, nursingHomePrivateMonthly: 14068 },
  MS: { homeCareHourly: 22, homeHealthHourly: 25, assistedLivingMonthly: 4445, nursingHomeSemiPrivateMonthly: 9642, nursingHomePrivateMonthly: 9885 },
  MO: { homeCareHourly: 32, homeHealthHourly: 33, assistedLivingMonthly: 5150, nursingHomeSemiPrivateMonthly: 6357, nursingHomePrivateMonthly: 7148 },
  MT: { homeCareHourly: 40, homeHealthHourly: 40, assistedLivingMonthly: 6134, nursingHomeSemiPrivateMonthly: 9064, nursingHomePrivateMonthly: 9429 },
  NE: { homeCareHourly: 35, homeHealthHourly: 36, assistedLivingMonthly: 5118, nursingHomeSemiPrivateMonthly: 8380, nursingHomePrivateMonthly: 10038 },
  NV: { homeCareHourly: 36, homeHealthHourly: 38, assistedLivingMonthly: 6110, nursingHomeSemiPrivateMonthly: 11209, nursingHomePrivateMonthly: 12790 },
  NH: { homeCareHourly: 38, homeHealthHourly: 39, assistedLivingMonthly: 7431, nursingHomeSemiPrivateMonthly: 12471, nursingHomePrivateMonthly: 13140 },
  NJ: { homeCareHourly: 36, homeHealthHourly: 37, assistedLivingMonthly: 8548, nursingHomeSemiPrivateMonthly: 12380, nursingHomePrivateMonthly: 14357 },
  NM: { homeCareHourly: 28, homeHealthHourly: 28, assistedLivingMonthly: 6162, nursingHomeSemiPrivateMonthly: 9764, nursingHomePrivateMonthly: 10707 },
  NY: { homeCareHourly: 34, homeHealthHourly: 34, assistedLivingMonthly: 6300, nursingHomeSemiPrivateMonthly: 14722, nursingHomePrivateMonthly: 15558 },
  NC: { homeCareHourly: 30, homeHealthHourly: 30, assistedLivingMonthly: 6354, nursingHomeSemiPrivateMonthly: 8821, nursingHomePrivateMonthly: 9885 },
  ND: { homeCareHourly: 40, homeHealthHourly: 40, assistedLivingMonthly: 5335, nursingHomeSemiPrivateMonthly: 8882, nursingHomePrivateMonthly: 9672 },
  OH: { homeCareHourly: 32, homeHealthHourly: 33, assistedLivingMonthly: 5500, nursingHomeSemiPrivateMonthly: 9034, nursingHomePrivateMonthly: 10038 },
  OK: { homeCareHourly: 34, homeHealthHourly: 35, assistedLivingMonthly: 4822, nursingHomeSemiPrivateMonthly: 6448, nursingHomePrivateMonthly: 7604 },
  OR: { homeCareHourly: 40, homeHealthHourly: 40, assistedLivingMonthly: 7312, nursingHomeSemiPrivateMonthly: 15817, nursingHomePrivateMonthly: 17094 },
  PA: { homeCareHourly: 33, homeHealthHourly: 34, assistedLivingMonthly: 6100, nursingHomeSemiPrivateMonthly: 11832, nursingHomePrivateMonthly: 12958 },
  RI: { homeCareHourly: 38, homeHealthHourly: 42, assistedLivingMonthly: 7038, nursingHomeSemiPrivateMonthly: 11406, nursingHomePrivateMonthly: 12699 },
  SC: { homeCareHourly: 30, homeHealthHourly: 30, assistedLivingMonthly: 5200, nursingHomeSemiPrivateMonthly: 8958, nursingHomePrivateMonthly: 9536 },
  SD: { homeCareHourly: 44, homeHealthHourly: 44, assistedLivingMonthly: 4350, nursingHomeSemiPrivateMonthly: 8821, nursingHomePrivateMonthly: 9338 },
  TN: { homeCareHourly: 30, homeHealthHourly: 31, assistedLivingMonthly: 5358, nursingHomeSemiPrivateMonthly: 9125, nursingHomePrivateMonthly: 9855 },
  TX: { homeCareHourly: 28, homeHealthHourly: 30, assistedLivingMonthly: 5250, nursingHomeSemiPrivateMonthly: 5475, nursingHomePrivateMonthly: 7087 },
  UT: { homeCareHourly: 36, homeHealthHourly: 38, assistedLivingMonthly: 4685, nursingHomeSemiPrivateMonthly: 8365, nursingHomePrivateMonthly: 10646 },
  VT: { homeCareHourly: 44, homeHealthHourly: 44, assistedLivingMonthly: 7872, nursingHomeSemiPrivateMonthly: 13688, nursingHomePrivateMonthly: 15208 },
  VA: { homeCareHourly: 32, homeHealthHourly: 33, assistedLivingMonthly: 6512, nursingHomeSemiPrivateMonthly: 8669, nursingHomePrivateMonthly: 9825 },
  WA: { homeCareHourly: 42, homeHealthHourly: 42, assistedLivingMonthly: 6975, nursingHomeSemiPrivateMonthly: 12714, nursingHomePrivateMonthly: 13840 },
  WV: { homeCareHourly: 25, homeHealthHourly: 29, assistedLivingMonthly: 5600, nursingHomeSemiPrivateMonthly: 12471, nursingHomePrivateMonthly: 12866 },
  WI: { homeCareHourly: 36, homeHealthHourly: 38, assistedLivingMonthly: 6150, nursingHomeSemiPrivateMonthly: 10068, nursingHomePrivateMonthly: 11254 },
  WY: { homeCareHourly: 28, homeHealthHourly: 32, assistedLivingMonthly: 4700, nursingHomeSemiPrivateMonthly: 9916, nursingHomePrivateMonthly: 10326 },
};

/** National median costs (2024) — used as fallback when state not found */
const NATIONAL_MEDIANS: StateMedianCosts = {
  homeCareHourly: 34,
  homeHealthHourly: 35,
  assistedLivingMonthly: 5900,
  nursingHomeSemiPrivateMonthly: 9600,
  nursingHomePrivateMonthly: 10800,
};

/** Data provenance for attribution in UI */
export const PRICING_DATA_SOURCE = {
  name: "CareScout Cost of Care Survey",
  year: 2024,
  url: "https://www.carescout.com/cost-of-care",
  attribution: "Source: CareScout/Genworth Cost of Care Survey, 2024",
} as const;

// ---------------------------------------------------------------------------
// Metro-Level Cost Adjustment Factors (HUD FMR 2025)
// ---------------------------------------------------------------------------

/**
 * Metro cost adjustment factors derived from HUD Fair Market Rents (FY 2025).
 * Each factor represents how a metro area's housing costs compare to its
 * state's population-weighted median. Loaded lazily on first use.
 *
 * Key format: "CityName|ST" (e.g., "Houston|TX")
 * Value: adjustment factor (e.g., 1.23 = 23% above state median)
 * Cities with factor ≈ 1.0 are omitted to save space.
 *
 * Coverage: ~15,800 cities across 618 metro areas (~86% of US population).
 * Cities not in the dataset fall back to state median (factor = 1.0).
 *
 * Source: HUD Fair Market Rents FY 2025 (revised April 2025)
 * Methodology: MSA pop-weighted FMR / state pop-weighted-median FMR
 */
let _metroCostFactors: Record<string, number> | null = null;
let _loadAttempted = false;

function getMetroCostFactors(): Record<string, number> {
  // Return cached value if available
  if (_metroCostFactors) return _metroCostFactors;

  // Only attempt load once to avoid repeated failures
  if (_loadAttempted) return {};
  _loadAttempted = true;

  // Server-side only: try to load from filesystem
  // (webpack config excludes fs/path from client bundle)
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("fs");
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require("path");
      const filePath = path.join(process.cwd(), "public/data/metro-cost-factors.json");
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, number>;
      _metroCostFactors = data;
      return data;
    } catch {
      // Fall through - file not found or read error
    }
  }

  // Client-side or file not found — fall back to empty (factor = 1.0 for all)
  _metroCostFactors = {};
  return _metroCostFactors;
}

/**
 * Get metro-level cost adjustment factor for a city.
 * Returns 1.0 if city is not in a metro area or data unavailable.
 */
export function getMetroFactor(city: string | null | undefined, state: string): number {
  if (!city) return 1.0;
  const factors = getMetroCostFactors();
  const key = `${city}|${normalizeStateCode(state)}`;
  return factors[key] ?? 1.0;
}

// ---------------------------------------------------------------------------
// Derived Pricing Multipliers
// ---------------------------------------------------------------------------

/**
 * Memory care premium over assisted living.
 * Industry median: memory care costs 20–40% more than assisted living.
 * We use 25% as a conservative midpoint.
 */
const MEMORY_CARE_PREMIUM = 1.25;

/**
 * Independent living ratio to assisted living.
 * Industry median: independent living costs ~50–60% of assisted living.
 * We use 0.55 as a conservative midpoint.
 */
const INDEPENDENT_LIVING_RATIO = 0.55;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps ProfileCategory enum values (business_profiles.category) to
 * the display-name keys used in CATEGORY_PRICING_CONFIG.
 */
const PROFILE_CATEGORY_TO_CONFIG_KEY: Record<string, string> = {
  home_care_agency: "Home Care (Non-medical)",
  home_health_agency: "Home Health Care",
  hospice_agency: "Hospice",
  independent_living: "Independent Living",
  assisted_living: "Assisted Living",
  memory_care: "Memory Care",
  nursing_home: "Nursing Home",
};

/**
 * Get pricing configuration for a care category.
 * Accepts both display names ("Nursing Home") and ProfileCategory enums ("nursing_home").
 * Falls back to Tier 1 with generic disclaimer for unknown categories.
 */
export function getPricingConfig(category: string): CategoryPricingConfig {
  const key = PROFILE_CATEGORY_TO_CONFIG_KEY[category] ?? category;
  return (
    CATEGORY_PRICING_CONFIG[key] ?? {
      label: category,
      tier: 1 as PricingTier,
      unit: "month" as PriceUnit,
      showEstimate: true,
      disclaimer: (ctx) =>
        ctx?.providerName
          ? `Pricing at ${ctx.providerName}${locSuffix(ctx)} is an estimate and may vary. Contact the provider for exact rates.`
          : "Price is an estimate and may vary. Contact the provider for exact rates.",
      coverageNote: null,
      cityPageNote: "Costs vary by provider, location, and level of care.",
    }
  );
}

/**
 * Get the state-level median cost for a category.
 * Returns a formatted range (low–high) or single value.
 *
 * For categories with hourly rates, returns hourly.
 * For monthly categories, returns monthly.
 */
export function getRegionalEstimate(
  category: string,
  state: string,
  city?: string | null
): { low: number; high: number; unit: PriceUnit; formatted: string; isMetroAdjusted: boolean } | null {
  const config = getPricingConfig(category);
  // Normalize to display name for switch matching
  const cat = PROFILE_CATEGORY_TO_CONFIG_KEY[category] ?? category;

  // Tier 3 categories with showEstimate=false should not get estimates
  // unless explicitly overridden (e.g., provider-entered data)
  if (!config.showEstimate) return null;

  const stateCode = normalizeStateCode(state);
  const costs = STATE_MEDIAN_COSTS[stateCode] ?? NATIONAL_MEDIANS;

  // Metro adjustment factor (1.0 = state average, >1 = more expensive metro)
  const metroFactor = city ? getMetroFactor(city, state) : 1.0;
  const isMetroAdjusted = metroFactor !== 1.0;

  switch (cat) {
    case "Home Care (Non-medical)": {
      const rate = Math.round(costs.homeCareHourly * metroFactor);
      // Range: ±15% of adjusted median
      const low = Math.round(rate * 0.85);
      const high = Math.round(rate * 1.15);
      return {
        low,
        high,
        unit: "hour",
        formatted: `$${low}–$${high}/hr`,
        isMetroAdjusted,
      };
    }

    case "Home Health Care": {
      // Home Health is Tier 3, won't reach here due to showEstimate=false check above
      return null;
    }

    case "Assisted Living": {
      const monthly = costs.assistedLivingMonthly * metroFactor;
      const low = roundToHundred(monthly * 0.85);
      const high = roundToHundred(monthly * 1.15);
      return {
        low,
        high,
        unit: "month",
        formatted: `$${low.toLocaleString()}–$${high.toLocaleString()}/mo`,
        isMetroAdjusted,
      };
    }

    case "Memory Care": {
      // Derived: assisted living + 25% premium, then metro-adjusted
      const base = costs.assistedLivingMonthly * MEMORY_CARE_PREMIUM * metroFactor;
      const low = roundToHundred(base * 0.85);
      const high = roundToHundred(base * 1.2);
      return {
        low,
        high,
        unit: "month",
        formatted: `$${low.toLocaleString()}–$${high.toLocaleString()}/mo`,
        isMetroAdjusted,
      };
    }

    case "Independent Living": {
      // Derived: ~55% of assisted living, then metro-adjusted
      const base = costs.assistedLivingMonthly * INDEPENDENT_LIVING_RATIO * metroFactor;
      const low = roundToHundred(base * 0.8);
      const high = roundToHundred(base * 1.2);
      return {
        low,
        high,
        unit: "month",
        formatted: `$${low.toLocaleString()}–$${high.toLocaleString()}/mo`,
        isMetroAdjusted,
      };
    }

    // Nursing Home, Hospice, Home Health: showEstimate is false, handled above
    default:
      return null;
  }
}

/**
 * Get the raw state median for a category (no range, just the survey median).
 * Useful for city page "state average" display.
 */
export function getStateMedian(
  category: string,
  state: string
): { value: number; unit: PriceUnit; formatted: string } | null {
  const cat = PROFILE_CATEGORY_TO_CONFIG_KEY[category] ?? category;
  const stateCode = normalizeStateCode(state);
  const costs = STATE_MEDIAN_COSTS[stateCode] ?? NATIONAL_MEDIANS;

  switch (cat) {
    case "Home Care (Non-medical)":
      return { value: costs.homeCareHourly, unit: "hour", formatted: `$${costs.homeCareHourly}/hr` };
    case "Home Health Care":
      return { value: costs.homeHealthHourly, unit: "hour", formatted: `$${costs.homeHealthHourly}/hr` };
    case "Assisted Living":
      return { value: costs.assistedLivingMonthly, unit: "month", formatted: `$${costs.assistedLivingMonthly.toLocaleString()}/mo` };
    case "Memory Care": {
      const val = roundToHundred(costs.assistedLivingMonthly * MEMORY_CARE_PREMIUM);
      return { value: val, unit: "month", formatted: `$${val.toLocaleString()}/mo` };
    }
    case "Independent Living": {
      const val = roundToHundred(costs.assistedLivingMonthly * INDEPENDENT_LIVING_RATIO);
      return { value: val, unit: "month", formatted: `$${val.toLocaleString()}/mo` };
    }
    case "Nursing Home": {
      // Show semi-private as the reference point (more common)
      return { value: costs.nursingHomeSemiPrivateMonthly, unit: "month", formatted: `$${costs.nursingHomeSemiPrivateMonthly.toLocaleString()}/mo` };
    }
    // Hospice: no pricing to show
    default:
      return null;
  }
}

/**
 * Check if a price was entered by the provider (not a regional fallback).
 * Provider-entered prices come from:
 *   - business_profiles.metadata.lower_price (claimed providers)
 *   - olera-providers.lower_price (seeded — almost always NULL)
 */
export function isProviderEnteredPrice(
  lowerPrice: number | null | undefined,
  upperPrice: number | null | undefined,
  contactForPrice?: string | boolean | null
): boolean {
  if (typeof contactForPrice === "boolean") return contactForPrice;
  if (contactForPrice === "True") return true;
  return (lowerPrice != null && lowerPrice > 0) || (upperPrice != null && upperPrice > 0);
}

// ---------------------------------------------------------------------------
// Internal Utilities
// ---------------------------------------------------------------------------

/**
 * Normalize full state name or abbreviation to 2-letter code.
 */
function normalizeStateCode(state: string): string {
  if (!state) return "";
  const trimmed = state.trim();
  // Already a 2-letter code
  if (trimmed.length === 2) return trimmed.toUpperCase();
  // Full name → code lookup
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
}

function roundToHundred(n: number): number {
  return Math.round(n / 100) * 100;
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
