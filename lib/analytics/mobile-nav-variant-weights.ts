// Server-side reader/writer for the experiment_weights table (Mobile Nav variant).
//
// Design note: weight changes need to take effect within ~30s of TJ
// hitting Save in the admin UI, so we don't hand weights down through
// ISR-cached HTML. Instead the assignment stays client-side and reads
// weights from the public /api/variant-weights/mobile-nav route, which
// sets short s-maxage CDN headers. The functions below back both that
// public read and the admin write endpoint.

import { getServiceClient } from "@/lib/admin";
import {
  MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS,
  MOBILE_NAV_VARIANTS,
  type MobileNavVariant,
} from "./mobile-nav-variant";

export const MOBILE_NAV_EXPERIMENT_ID = "mobile_nav_variant";

export type MobileNavWeightsRecord = {
  weights: Record<MobileNavVariant, number>;
  version: number;
};

/** Build a fresh `Record<MobileNavVariant, number>` filled with the same
 *  initial value for every arm. Used as the seed shape inside the
 *  helpers so adding a new arm to MOBILE_NAV_VARIANTS doesn't require
 *  hunting down hardcoded literals. */
function emptyWeightShape(): Record<MobileNavVariant, number> {
  return Object.fromEntries(MOBILE_NAV_VARIANTS.map((v) => [v, 0])) as Record<MobileNavVariant, number>;
}

/**
 * Coerce arbitrary jsonb into a clean weights dict. Unknown variant keys
 * are dropped (so removing an arm in code doesn't require backfilling
 * the row); known variants missing from the dict default to 0 (the arm
 * is dark). Negative or non-finite values become 0.
 *
 * Does NOT validate sum=100 — the read path tolerates drift; the write
 * path is where 100-summing is enforced.
 */
function coerceWeights(raw: unknown): Record<MobileNavVariant, number> {
  if (!raw || typeof raw !== "object") return { ...MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS };
  const out = emptyWeightShape();
  const obj = raw as Record<string, unknown>;
  for (const v of MOBILE_NAV_VARIANTS) {
    const n = obj[v];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      out[v] = Math.round(n);
    }
  }
  return out;
}

/**
 * Read the live Mobile Nav weights. Falls back to MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS
 * (100% on current, version 0) if the row is missing, the DB throws, or
 * the jsonb is malformed. Default version is 0 so a real row at
 * version >= 1 always supersedes the fallback in any cache-coherence
 * comparison.
 */
export async function getMobileNavVariantWeights(): Promise<MobileNavWeightsRecord> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("experiment_weights")
      .select("weights, version")
      .eq("experiment_id", MOBILE_NAV_EXPERIMENT_ID)
      .maybeSingle();
    if (error) {
      // Log so a real outage shows up in server logs instead of silently
      // serving defaults forever. A missing-row case (data === null with
      // no error) is normal pre-migration and shouldn't log.
      console.warn("[mobile-nav-variant-weights] read returned error, serving defaults:", error.message);
      return { weights: { ...MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS }, version: 0 };
    }
    if (!data) {
      return { weights: { ...MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS }, version: 0 };
    }
    return {
      weights: coerceWeights(data.weights),
      version: typeof data.version === "number" ? data.version : 0,
    };
  } catch (err) {
    console.error("[mobile-nav-variant-weights] read threw:", err);
    return { weights: { ...MOBILE_NAV_VARIANT_DEFAULT_WEIGHTS }, version: 0 };
  }
}

export type SaveResult =
  | { ok: true; record: MobileNavWeightsRecord }
  | { ok: false; error: string };

/**
 * Write new weights and bump the version. Validates:
 *   - Every key is a known variant (unknowns rejected with a clear error
 *     so a typo in the admin UI doesn't silently no-op).
 *   - Every value is a non-negative integer.
 *   - The sum is exactly 100.
 *
 * The version bump is atomic with the weight write — done in one upsert
 * — so a concurrent reader either sees old weights+old version or new
 * weights+new version, never a mismatch. updatedBy is optional; pass
 * the admin user id when available for the audit trail.
 */
export async function saveMobileNavVariantWeights(
  weights: Record<string, unknown>,
  updatedBy: string | null,
): Promise<SaveResult> {
  // Reject unknown keys up-front. Helps the admin UI catch a stale
  // variant name before it lands in the DB and stops being assignable.
  for (const key of Object.keys(weights)) {
    if (!(MOBILE_NAV_VARIANTS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown variant: ${key}` };
    }
  }

  const cleaned = emptyWeightShape();
  let sum = 0;
  for (const v of MOBILE_NAV_VARIANTS) {
    const n = weights[v];
    if (n === undefined) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return { ok: false, error: `${v} must be a non-negative integer` };
    }
    cleaned[v] = n;
    sum += n;
  }
  if (sum !== 100) {
    return { ok: false, error: `Weights must sum to 100 (got ${sum})` };
  }

  try {
    const db = getServiceClient();
    // Read-then-write to compute the next version. A race here would
    // result in two saves landing the same version — annoying but
    // bounded (one save loses, both arms are still well-defined).
    // Acceptable for an admin UI with single-digit writers.
    const existing = await db
      .from("experiment_weights")
      .select("version")
      .eq("experiment_id", MOBILE_NAV_EXPERIMENT_ID)
      .maybeSingle();
    const nextVersion = (existing.data?.version ?? 0) + 1;

    const { error } = await db
      .from("experiment_weights")
      .upsert({
        experiment_id: MOBILE_NAV_EXPERIMENT_ID,
        weights: cleaned,
        version: nextVersion,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      });
    if (error) {
      console.error("[mobile-nav-variant-weights] write failed:", error);
      return { ok: false, error: "Database write failed" };
    }
    return { ok: true, record: { weights: cleaned, version: nextVersion } };
  } catch (err) {
    console.error("[mobile-nav-variant-weights] write threw:", err);
    return { ok: false, error: "Database write failed" };
  }
}
