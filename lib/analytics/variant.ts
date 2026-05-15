// Deterministic variant assignment for the SBF intake A/B test on provider
// pages. Pure function: same sessionId always returns the same arm, so a user
// sees the same variant for the lifetime of their session cookie (30 days per
// lib/analytics/session.ts).
//
// Hash: djb2. Cheap, no dep, well-distributed for short strings like UUIDs.
//
// ─── 6-arm IntakeVariant (canonical, since 2026-05-07) ──────────────────────
// Adds "multi_provider" arm on top of the existing 5. Sessions in this arm
// see a click-to-send multi-provider comparison flow: when tapping a suggested
// question, card expands showing similar providers they can also send the
// question to. No template answer — the value prop is "compare REAL answers
// from REAL providers."
//
//   availability     — "There's help paying for care in {state}."   (benefits, positive)
//   loss             — "Most {state} families miss out on help…"     (benefits, loss)
//   empathic         — "Care is expensive."                          (benefits, shared-truth)
//   outreach         — "Don't know which one to trust?" (H1 demand test, care-team framing)
//   qa_email_capture — Q&A enrichment ON, SBF / outreach OFF.        (qa-first email capture)
//   multi_provider   — Click-to-send multi-provider comparison       (H2 comparison UX test)
//
// Page-level routing decides which surface renders. BenefitsDiscoveryModule,
// AgentOutreachModule, QASectionV2's enrichment prompt, and MultiProviderCard
// are mutually exclusive across the 6 arms.
//
// ─── Allocation (since 2026-05-05) ──────────────────────────────────────────
// Allocation is no longer a hardcoded equal split. Live percentages come from
// the experiment_weights table (one row per experiment, edited via the dial
// in /admin/analytics). assignIntakeVariantWeighted reads the weights and
// version number, walks a cumulative-bucket lookup over [0, 1), and returns
// the picked arm. assignIntakeVariant is kept for the few legacy callers that
// still need an equal-split fallback (BenefitsDiscoveryModule's mod-3 V3 copy
// A/B continues to use its own assignBenefitsVariant — gcd(3, N) = 1 keeps
// the two splits uncorrelated for any N coprime with 3, including 6).
//
// V3 rename history (2026-04-30): replaced the old "control" | "money_loss"
// 2-arm copy A/B with the 3-arm test on the rebuilt 2-step embedded SBF. Each
// arm changes only the H2/sub copy on step 1; everything downstream is identical.
//
// Live copy strings + per-variant performance tracked in Notion:
//   https://app.notion.com/p/ec27110d1c6a4cc1a76bdf991344f63d

/**
 * Canonical list of intake-variant arms. The array is the source of
 * truth — IntakeVariant derives from it via `as const`, and the
 * weights helper, admin UI, and assignment logic all iterate this list
 * rather than hardcoding individual arm names. Adding a new arm is a
 * one-line append here (plus a copy entry in variant-copy.ts and an
 * updated default-weights map below — TypeScript will flag both).
 */
export const INTAKE_VARIANTS = [
  "availability",
  "loss",
  "empathic",
  "outreach",
  "qa_email_capture",
  "multi_provider",
  "multi_provider_v2",
] as const;

export type IntakeVariant = (typeof INTAKE_VARIANTS)[number];

/** Narrow alias for the benefits-copy arms. Excludes outreach because the
 *  BenefitsDiscoveryModule never legitimately renders for it, qa_email_capture
 *  because that arm suppresses the SBF entirely, multi_provider and
 *  multi_provider_v2 because those arms use the MultiProviderCard instead. */
export type BenefitsVariant = Exclude<IntakeVariant, "outreach" | "qa_email_capture" | "multi_provider" | "multi_provider_v2">;

const BENEFITS_VARIANTS: BenefitsVariant[] = ["availability", "loss", "empathic"];

/** Default weights used when the experiment_weights row is missing or
 *  unreadable. Adjusted 2026-05-07 for the empathic_single (Arm D)
 *  consolidation: empathic absorbs availability + loss's slots and runs at
 *  60% to test the structural mechanic change (1-step capture vs 3-step
 *  relay). availability and loss stay paused at 0% — bench assets, ready
 *  to re-enable via the admin dial when D's read is in. outreach and
 *  qa_email_capture continue at 20% each. multi_provider defaults to 0
 *  so a missing-DB fallback doesn't accidentally route traffic into a
 *  newly-shipped arm before TJ enables it via the live dial. */
export const INTAKE_VARIANT_DEFAULT_WEIGHTS: Record<IntakeVariant, number> = {
  availability: 0,
  loss: 0,
  empathic: 60,
  outreach: 20,
  qa_email_capture: 20,
  multi_provider: 0,
  multi_provider_v2: 0,
};

export type IntakeWeightMap = Partial<Record<IntakeVariant, number>>;

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash * 33) + char, kept in 32-bit range via `| 0`
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // coerce to unsigned 32-bit
}

/** Equal-split assignment across the canonical arms. Kept for callers
 *  that haven't been wired to the weighted path yet (e.g. legacy
 *  assignBenefitsVariant). New code should use assignIntakeVariantWeighted
 *  at the page-level routing point. */
export function assignIntakeVariant(sessionId: string): IntakeVariant {
  return INTAKE_VARIANTS[djb2(sessionId) % INTAKE_VARIANTS.length];
}

/**
 * Weighted assignment. Given a per-variant percentage map and a config
 * version, returns the arm this session falls into.
 *
 * `weights`: dict of variant → integer 0-100. Missing keys default to 0
 *   (arm is dark). Sum is expected to be 100 but the function is robust
 *   to drift — it normalizes against the actual sum, so e.g. {a:50,b:50}
 *   and {a:1,b:1} both yield a 50/50 split. If the sum is 0 (every arm
 *   zeroed out, malformed row, etc.) we fall back to equal split across
 *   the canonical arms rather than going dark.
 *
 * `version`: namespaced into the hash so a deliberate weight change
 *   reshuffles returning sessions in one cut. Same sessionId + same
 *   version always returns the same arm.
 */
export function assignIntakeVariantWeighted(
  sessionId: string,
  weights: IntakeWeightMap,
  version: number,
): IntakeVariant {
  const total = INTAKE_VARIANTS.reduce((sum, v) => sum + Math.max(0, weights[v] ?? 0), 0);
  if (total <= 0) return INTAKE_VARIANTS[djb2(sessionId) % INTAKE_VARIANTS.length];

  // djb2 → unsigned 32-bit → [0, 1). Stable across runs of the same
  // (sessionId, version) input, which is what we need for stickiness.
  const r = djb2(`${sessionId}:v${version}`) / 0x1_0000_0000;
  const target = r * total;

  let cumulative = 0;
  for (const v of INTAKE_VARIANTS) {
    cumulative += Math.max(0, weights[v] ?? 0);
    if (target < cumulative) return v;
  }
  // Floating-point pinhole — target landed on or past the last bucket
  // boundary. Pick the last variant with non-zero weight so the picked
  // arm is one the operator actually wants traffic in.
  for (let i = INTAKE_VARIANTS.length - 1; i >= 0; i--) {
    if ((weights[INTAKE_VARIANTS[i]] ?? 0) > 0) return INTAKE_VARIANTS[i];
  }
  return INTAKE_VARIANTS[0];
}

/** Legacy 3-arm assignment — kept for back-compat / reference. Live callers
 *  now use useIntakeVariant() so the 5-arm dial drives the copy variant
 *  directly (was previously two independent splits, which decoupled the
 *  dial from the actual copy a session saw). */
export function assignBenefitsVariant(sessionId: string): BenefitsVariant {
  return BENEFITS_VARIANTS[djb2(sessionId) % 3];
}
