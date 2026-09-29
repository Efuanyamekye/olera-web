/**
 * Which finder category a pipeline program belongs to.
 *
 * Pipeline drafts carry no category, but the finder groups and ranks by one
 * (the "Needs" answer maps to categories, and the results page filters by
 * them). Name first, then shortName, most specific pattern first: Medicaid,
 * waivers, PACE and Medicare help are healthcare before anything else can
 * claim them, "Family Caregiver Support" is caregiver, and "Home Energy" is
 * utilities even though it says "home". The tagline is never read: it
 * describes what a program covers ("adult day care, companions"), which
 * tagged PACE as a caregiver program. Anything unmatched is healthcare.
 */

import type { BenefitCategory } from "@/lib/types/benefits";

export interface CategorizableProgram {
  name: string;
  shortName?: string | null;
  tagline?: string | null;
}

const RULES: { category: BenefitCategory; re: RegExp }[] = [
  { category: "healthcare", re: /medicaid|medicare|\bmsp\b|\bqmb\b|waiver|\bpace\b|all-inclusive care|hcbs|home and community|star\+plus|medi-cal|prescription|pharmac|health insurance/i },
  { category: "caregiver", re: /caregiver|respite|adult day|companion/i },
  { category: "utilities", re: /liheap|energy|weatheriz|utilit|heating|cooling|lifeline|telephone|broadband|water bill/i },
  { category: "food", re: /\bsnap\b|calfresh|basic food|food|meal|nutrition|grocer|commodity|farmers|\ba?esap\b|simplified application/i },
  { category: "housing", re: /housing|rent|property tax|homestead|home repair|home modification|circuit breaker|homeowner/i },
  { category: "income", re: /\bssi\b|\bssp\b|supplemental security|state supplement|supplementary payment|cash|pension|income|financial assistance|special assistance|tax credit|burial/i },
];

export function programCategory(p: CategorizableProgram): BenefitCategory {
  const texts = [p.name, p.shortName ?? ""];
  for (const text of texts) {
    for (const rule of RULES) if (rule.re.test(text)) return rule.category;
  }
  return "healthcare";
}
