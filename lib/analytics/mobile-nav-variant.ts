// Deterministic variant assignment for the Mobile Nav A/B test on provider pages.
// Pure function: same sessionId always returns the same arm, so a user sees
// the same variant for the lifetime of their session cookie (30 days per
// lib/analytics/session.ts).
//
// Hash: djb2. Cheap, no dep, well-distributed for short strings like UUIDs.
//
// ─── Mobile Nav Variants ───────────────────────────────────────────────────────
//   current      — Existing hamburger-only mobile navigation
//   bottom_tabs  — Fixed bottom tab bar with key links + reduced hamburger
//
// The hook useMobileNavVariant() routes to the correct nav implementation
// based on the assigned arm.

/**
 * Canonical list of mobile nav variant arms. The array is the source of truth —
 * MobileNavVariant derives from it via `as const`, and the weights helper, admin
 * UI, and assignment logic all iterate this list rather than hardcoding
 * individual arm names. Adding a new arm is a one-line append here (plus an
 * updated default-weights map below — TypeScript will flag it).
 */
export const MOBILE_NAV_VARIANTS = ["current", "bottom_tabs"] as const;

export type MobileNavVariant = (typeof MOBILE_NAV_VARIANTS)[number];

/** Default weights used when the experiment_weights row is missing or
 *  unreadable. "current" starts at 100% as the control. */
export const MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS: Record<MobileNavVariant, number> = {
  current: 100,
  bottom_tabs: 0,
};

export type MobileNavWeightMap = Partial<Record<MobileNavVariant, number>>;

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // (hash * 33) + char, kept in 32-bit range via `| 0`
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // coerce to unsigned 32-bit
}

/** Equal-split assignment across the canonical arms. Kept for callers that
 *  haven't been wired to the weighted path yet. New code should use
 *  assignMobileNavVariantWeighted at the page-level routing point. */
export function assignMobileNavVariant(sessionId: string): MobileNavVariant {
  return MOBILE_NAV_VARIANTS[djb2(sessionId) % MOBILE_NAV_VARIANTS.length];
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
export function assignMobileNavVariantWeighted(
  sessionId: string,
  weights: MobileNavWeightMap,
  version: number,
): MobileNavVariant {
  const total = MOBILE_NAV_VARIANTS.reduce((sum, v) => sum + Math.max(0, weights[v] ?? 0), 0);
  if (total <= 0) return MOBILE_NAV_VARIANTS[djb2(sessionId) % MOBILE_NAV_VARIANTS.length];

  // djb2 → unsigned 32-bit → [0, 1). Stable across runs of the same
  // (sessionId, version) input, which is what we need for stickiness.
  const r = djb2(`${sessionId}:mobile_nav:v${version}`) / 0x1_0000_0000;
  const target = r * total;

  let cumulative = 0;
  for (const v of MOBILE_NAV_VARIANTS) {
    cumulative += Math.max(0, weights[v] ?? 0);
    if (target < cumulative) return v;
  }
  // Floating-point pinhole — target landed on or past the last bucket
  // boundary. Pick the last variant with non-zero weight so the picked
  // arm is one the operator actually wants traffic in.
  for (let i = MOBILE_NAV_VARIANTS.length - 1; i >= 0; i--) {
    if ((weights[MOBILE_NAV_VARIANTS[i]] ?? 0) > 0) return MOBILE_NAV_VARIANTS[i];
  }
  return MOBILE_NAV_VARIANTS[0];
}
