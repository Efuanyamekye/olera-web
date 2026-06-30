interface BenefitsProgramForQuality {
  intro?: string | null;
  sourceUrl?: string | null;
  contentStatus?: string | null;
  structuredEligibility?: {
    summary?: string[] | null;
    ageRequirement?: string | null;
    incomeTable?: unknown[] | null;
    assetLimits?: {
      individual?: number | null;
      couple?: number | null;
      countedAssets?: string[] | null;
      exemptAssets?: string[] | null;
      homeEquityCap?: number | null;
    } | null;
    functionalRequirement?: string | null;
    otherRequirements?: string[] | null;
    povertyLevelReference?: string | null;
  } | null;
  applicationGuide?: {
    summary?: string | null;
    steps?: unknown[] | null;
    processingTime?: string | null;
    waitlist?: string | null;
    tip?: string | null;
  } | null;
  documentsNeeded?: string[] | null;
  contacts?: unknown[] | null;
  faqs?: unknown[] | null;
  contentSections?: unknown[] | null;
}

function hasText(value: string | undefined | null): boolean {
  return Boolean(value?.trim());
}

function hasItems<T>(value: T[] | undefined | null): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasAssetLimits(program: BenefitsProgramForQuality): boolean {
  const limits = program.structuredEligibility?.assetLimits;
  if (!limits) return false;

  return Boolean(
    limits.individual !== undefined ||
      limits.couple !== undefined ||
      hasItems(limits.countedAssets) ||
      hasItems(limits.exemptAssets) ||
      limits.homeEquityCap !== undefined
  );
}

function hasStructuredEligibility(program: BenefitsProgramForQuality): boolean {
  const eligibility = program.structuredEligibility;
  if (!eligibility) return false;

  return Boolean(
    hasItems(eligibility.summary) ||
      hasItems(eligibility.incomeTable) ||
      hasText(eligibility.functionalRequirement) ||
      hasText(eligibility.ageRequirement) ||
      hasItems(eligibility.otherRequirements) ||
      hasText(eligibility.povertyLevelReference) ||
      hasAssetLimits(program)
  );
}

/**
 * A program page needs at least one rich V3 body field before we should invite
 * search engines to index it. Legacy scaffold fields can render a hero, but
 * without these fields the actual page body is effectively empty.
 */
export function hasRichProgramContent(program: BenefitsProgramForQuality): boolean {
  const guide = program.applicationGuide;

  return Boolean(
    hasText(program.intro) ||
      hasText(program.sourceUrl) ||
      hasText(guide?.summary) ||
      hasText(guide?.processingTime) ||
      hasText(guide?.waitlist) ||
      hasText(guide?.tip) ||
      hasItems(guide?.steps) ||
      hasStructuredEligibility(program) ||
      hasItems(program.documentsNeeded) ||
      hasItems(program.contacts) ||
      hasItems(program.faqs) ||
      hasItems(program.contentSections)
  );
}

/**
 * First-pass SEO policy:
 * - Thin legacy fallback pages should render if reached, but should not index.
 * - Existing rich pipeline drafts remain indexable during the transition.
 * - New review-gated states such as under-review / needs-changes render for QA
 *   but stay out of search until a human approves or publishes them.
 */
export function shouldIndexBenefitsProgram(program: BenefitsProgramForQuality): boolean {
  if (!hasRichProgramContent(program)) return false;

  const status = program.contentStatus;
  return status !== "under-review" && status !== "needs-changes";
}

/**
 * Public discovery policy for Benefits listing surfaces. Keep existing Benefits
 * listings stable, but hide explicit review-gated statuses from state pages.
 * Indexability remains stricter and is handled by shouldIndexBenefitsProgram.
 */
export function shouldDiscoverBenefitsProgram(program: BenefitsProgramForQuality): boolean {
  const status = program.contentStatus;
  return status !== "under-review" && status !== "needs-changes";
}

export function benefitsNoindexRobots() {
  return {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  } as const;
}
