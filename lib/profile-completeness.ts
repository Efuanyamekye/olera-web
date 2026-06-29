import type { Profile, StaffInfo } from "@/lib/types";

// Extended metadata shape — matches the JSONB metadata stored on provider profiles
export interface ExtendedMetadata {
  // Core organization fields
  license_number?: string;
  year_founded?: number;
  bed_count?: number;
  staff_count?: number;
  accepts_medicaid?: boolean;
  accepts_medicare?: boolean;
  amenities?: string[];
  hours?: string;
  price_range?: string;
  lower_price?: number;
  upper_price?: number;
  price_frequency?: string;
  contact_for_pricing?: boolean;

  // Caregiver fields
  hourly_rate_min?: number;
  hourly_rate_max?: number;
  certifications?: string[];
  years_experience?: number;
  languages?: string[];
  availability?: string;

  // Extended fields (enriched from olera-providers / mock data)
  rating?: number;
  review_count?: number;
  images?: string[];
  staff?: StaffInfo;
  badge?: string;
  accepted_payments?: string[];
  pricing_details?: { service: string; rate: string; rateMin?: string; rateMax?: string; rateType: string }[];
  staff_screening?: string[];
  reviews?: {
    name: string;
    rating: number;
    date: string;
    comment: string;
    relationship?: string;
  }[];
  community_score?: number;
  value_score?: number;
  info_score?: number;
}

// Aggregated inputs for the two new (Phase 2A) sections. Caller decides how
// to combine Google + Olera review data and how to compute the time-windowed
// response rate.
export interface ReviewsSummary {
  /** Combined count across Olera reviews + Google reviews. */
  count: number;
  /** Weighted avg rating (null when count = 0). */
  avgRating: number | null;
}

export interface ResponseRateSummary {
  /** Questions received within the measurement window (default: last 90 days). */
  totalQuestions: number;
  /** Of those, how many received a provider response. */
  answeredCount: number;
}

export interface SectionScore {
  id: string;
  label: string;
  /** 0–100 score for this section. */
  percent: number;
  /** Contribution weight in the overall score (integer sums to ~100 across all sections used). */
  weight: number;
}

export interface ProfileCompleteness {
  /** 0–100 over the sections the provider CONTROLS (the 7 self-completable
   *  sections). Achievable to 100 by effort alone — this is what gates features
   *  and what the completion meter shows. */
  overall: number;
  sections: SectionScore[];
  /** Earned quality signals that depend on families (reviews) or traffic
   *  (response rate) — NOT part of `overall` and never gating. Surfaced
   *  separately as "boost your results" carrots. `null` = none yet (N/A).
   *  Gating a family-acquisition feature on these would be circular: you need
   *  families to earn them, and the feature is how you get families. */
  boosters: {
    reviews: number | null;
    responseRate: number | null;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Weights (signed off by TJ 2026-04-23 for Phase 2A)
//
// Heavier on sections that correlate with inquiries (photos, reviews,
// response rate); lighter on less-acted-upon signals (payments, screening).
// Phase 2E can revisit after real-data distribution shows how providers
// naturally bucket across these dimensions.
// ─────────────────────────────────────────────────────────────────────
const WEIGHT_OVERVIEW = 12;
const WEIGHT_PRICING = 12;
const WEIGHT_STAFF_SCREENING = 8;
const WEIGHT_CARE_SERVICES = 10;
const WEIGHT_GALLERY = 15;
const WEIGHT_ABOUT = 10;
const WEIGHT_PAYMENT = 6;
// The completion % covers only these 7 self-completable sections (the weighted
// average normalizes by their total, so 100% is reachable by effort alone).
// Reviews + response rate used to be weighted sections; they're now non-gating
// boosters (see `boosters` in the return) — earned signals, not "completion."

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function scoreProfileOverview(profile: Profile): number {
  let score = 0;
  if (profile.display_name?.trim()) score += 25;
  if (profile.category) score += 25;
  if (profile.address?.trim() || (profile.city?.trim() && profile.state?.trim()))
    score += 25;
  if (profile.image_url?.trim()) score += 25;
  return clamp(score);
}

function scorePricing(meta: ExtendedMetadata): number {
  // Pricing is a DECISION, not a wall. Some providers can't publish rates
  // (franchise rules, ahead-of-market positioning), so an explicit "Contact for
  // pricing" is a complete, valid choice — we never nag them to disclose.
  // Showing actual rates is preferred (listings with prices get more inquiries)
  // and encouraged in the editor, but it's a strength signal, not a completeness
  // requirement. Any deliberate pricing input completes the section.
  if (meta.contact_for_pricing) return 100;
  if (meta.lower_price || meta.price_range?.trim() || (meta.pricing_details?.length ?? 0) > 0)
    return 100;
  return 0;
}

function scoreStaffScreening(meta: ExtendedMetadata): number {
  const count = meta.staff_screening?.length ?? 0;
  if (count >= 3) return 100;
  if (count >= 1) return 50;
  return 0;
}

function scoreCareServices(profile: Profile): number {
  const count = profile.care_types?.length ?? 0;
  if (count >= 3) return 100;
  if (count >= 1) return 50;
  return 0;
}

function scoreGallery(meta: ExtendedMetadata): number {
  const count = meta.images?.length ?? 0;
  // A real, presentable gallery is "complete" at 3 photos — demanding 8 made
  // providers who'd clearly filled in their gallery read as half-done and got
  // nagged to "complete" it (confusing during setup). More photos help, but
  // that's a strength signal, not a completeness requirement.
  if (count >= 3) return 100;
  if (count >= 2) return 70;
  if (count >= 1) return 40;
  return 0;
}

function scoreAbout(profile: Profile): number {
  const desc = profile.description?.trim() ?? "";
  if (desc.length >= 100) return 100;
  if (desc.length > 0) return 50;
  return 0;
}

function scorePaymentInsurance(meta: ExtendedMetadata): number {
  const count = meta.accepted_payments?.length ?? 0;
  if (count >= 3) return 100;
  if (count >= 1) return 50;
  return 0;
}

/**
 * Reviews score — combined Olera + Google.
 * Caller sums both sources into ReviewsSummary before calling.
 *
 * Tier thresholds (TJ signed off 2026-04-23):
 *   3+ reviews, avg >= 4.0   → 100%   (target state)
 *   3+ reviews, avg 3.5–4.0  → 75%    (rating pulls it back)
 *   1–2 reviews              → 50%    (some validation, not much)
 *   0 reviews                → 0%     (no signal)
 */
export function scoreReviews(summary: ReviewsSummary): number {
  if (summary.count === 0) return 0;
  if (summary.count >= 3) {
    if (summary.avgRating !== null && summary.avgRating >= 4.0) return 100;
    if (summary.avgRating !== null && summary.avgRating >= 3.5) return 75;
    return 50;
  }
  return 50;
}

/**
 * Response rate score — proportion of received questions with a provider
 * response, measured in a rolling window (caller provides, default 90d).
 *
 * Returned `null` signals "N/A" — provider has received zero questions, so
 * we don't penalize. `calculateProfileCompleteness()` excludes a null-scored
 * section from both numerator and denominator of the weighted average.
 *
 * Tier thresholds (TJ signed off 2026-04-23):
 *   >= 75%  → 100%   (consistently engaged)
 *   50–75%  → 75%    (responsive when it matters)
 *   25–50%  → 50%    (inconsistent)
 *   0–25%   → 25%    (mostly missing signals)
 *   no questions → null (N/A)
 */
export function scoreResponseRate(summary: ResponseRateSummary): number | null {
  if (summary.totalQuestions === 0) return null;
  const ratio = summary.answeredCount / summary.totalQuestions;
  if (ratio >= 0.75) return 100;
  if (ratio >= 0.5) return 75;
  if (ratio >= 0.25) return 50;
  return 25;
}

/**
 * Aggregate score across all applicable sections.
 *
 * `reviews` and `responseRate` are optional — if not provided, those
 * sections are omitted entirely (backward compat with existing callers
 * that only know about the original 7 sections).
 *
 * When `responseRate` IS provided but has zero questions received,
 * scoreResponseRate returns null and we exclude that section so the
 * provider isn't penalized for a section that doesn't apply yet.
 *
 * Overall is a weight-weighted average over sections that apply.
 */
export function calculateProfileCompleteness(
  profile: Profile,
  metadata: ExtendedMetadata,
  reviews?: ReviewsSummary,
  responseRate?: ResponseRateSummary,
): ProfileCompleteness {
  const sections: SectionScore[] = [
    {
      id: "overview",
      label: "Profile overview",
      percent: scoreProfileOverview(profile),
      weight: WEIGHT_OVERVIEW,
    },
    {
      id: "pricing",
      label: "Pricing",
      percent: scorePricing(metadata),
      weight: WEIGHT_PRICING,
    },
    {
      id: "screening",
      label: "Staff screening",
      percent: scoreStaffScreening(metadata),
      weight: WEIGHT_STAFF_SCREENING,
    },
    {
      id: "services",
      label: "Care services",
      percent: scoreCareServices(profile),
      weight: WEIGHT_CARE_SERVICES,
    },
    {
      id: "gallery",
      label: "Gallery",
      percent: scoreGallery(metadata),
      weight: WEIGHT_GALLERY,
    },
    {
      id: "about",
      label: "About",
      percent: scoreAbout(profile),
      weight: WEIGHT_ABOUT,
    },
    {
      id: "payment",
      label: "Accepted Payments & Insurance",
      percent: scorePaymentInsurance(metadata),
      weight: WEIGHT_PAYMENT,
    },
  ];

  // Boosters are NOT pushed into `sections` — they don't gate and aren't part
  // of the completion %. Reviews are N/A (null) until a family leaves one;
  // response rate is N/A until a question is received. Surfaced separately.
  const boosters = {
    reviews: reviews && reviews.count > 0 ? scoreReviews(reviews) : null,
    responseRate: responseRate ? scoreResponseRate(responseRate) : null,
  };

  const totalWeight = sections.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = sections.reduce((sum, s) => sum + s.percent * s.weight, 0);
  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { overall, sections, boosters };
}
