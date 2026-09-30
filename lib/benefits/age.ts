/**
 * Age of the person needing care: exact age vs. one-tap age BAND.
 *
 * The one-tap chips ("Under 65", "65 to 74", "75 to 84", "85 or older") used
 * to be stored as fake exact ages in metadata.age (60 / 70 / 80 / 87). Every
 * reader then treated 60 as a literal age, so a 40-year-old who tapped
 * "Under 65" passed every "Age 60+" rule. Chip answers now land in
 * metadata.age_band and metadata.age is reserved for a typed exact age.
 *
 * Every reader goes through readCareAge() so legacy rows (age in
 * {60,70,80,87} written by a chip, detected by the quiz_answers.age stamp)
 * and new rows read the same way. Isomorphic: no server imports.
 */

export type AgeBand = "under_65" | "65_74" | "75_84" | "85_plus" | "under_60" | "60_64";

/** The four one-tap chips on the program card. */
export const AGE_BANDS: readonly AgeBand[] = ["under_65", "65_74", "75_84", "85_plus"];

/** Every band a stored answer may hold. The full finder splits "Under 65"
 *  into "Under 60" and "60 to 64", because 60 is where most senior food,
 *  meal and Older Americans Act programs start. */
export const ALL_AGE_BANDS: readonly AgeBand[] = [...AGE_BANDS, "under_60", "60_64"];

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  under_65: "Under 65",
  "65_74": "65 to 74",
  "75_84": "75 to 84",
  "85_plus": "85 or older",
  under_60: "Under 60",
  "60_64": "60 to 64",
};

/** Inclusive bounds. under_65 has no known floor (could be any adult age). */
const BAND_BOUNDS: Record<AgeBand, { min: number | null; max: number | null }> = {
  under_65: { min: null, max: 64 },
  "65_74": { min: 65, max: 74 },
  "75_84": { min: 75, max: 84 },
  "85_plus": { min: 85, max: null },
  under_60: { min: null, max: 59 },
  "60_64": { min: 60, max: 64 },
};

/** The representative numbers the chips used to store (and that quiz tokens
 *  already sitting in inboxes still carry as their answer). */
const LEGACY_CHIP_AGE_TO_BAND: Record<number, AgeBand> = {
  60: "under_65",
  70: "65_74",
  80: "75_84",
  87: "85_plus",
};

export function isAgeBand(v: unknown): v is AgeBand {
  return typeof v === "string" && (ALL_AGE_BANDS as readonly string[]).includes(v);
}

/** Chip wire value → band. Accepts the band itself or a legacy chip number
 *  ("60" / "70" / "80" / "87"). Anything else → null. */
export function chipValueToAgeBand(v: unknown): AgeBand | null {
  if (isAgeBand(v)) return v;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
  return LEGACY_CHIP_AGE_TO_BAND[n] ?? null;
}

export function ageBandFromExact(age: number): AgeBand {
  if (age < 65) return "under_65";
  if (age < 75) return "65_74";
  if (age < 85) return "75_84";
  return "85_plus";
}

export interface CareAge {
  /** A typed exact age. Never a chip's representative number. */
  exact: number | null;
  /** The band: the chip answer, or derived from the exact age. */
  band: AgeBand | null;
}

/** True when metadata.age is a legacy chip number rather than a typed age. */
export function isLegacyChipAge(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  const age =
    typeof meta.age === "number" ? meta.age : typeof meta.age === "string" && /^\d+$/.test(meta.age) ? parseInt(meta.age, 10) : NaN;
  if (!(age in LEGACY_CHIP_AGE_TO_BAND)) return false;
  const quiz = meta.quiz_answers as Record<string, unknown> | undefined;
  const qa = quiz?.age as Record<string, unknown> | undefined;
  return !!(qa && typeof qa.via === "string" && qa.via && String(qa.answer) === String(age));
}

/** Read the care recipient's age from a profile's metadata. */
export function readCareAge(metadata: unknown): CareAge {
  if (!metadata || typeof metadata !== "object") return { exact: null, band: null };
  const meta = metadata as Record<string, unknown>;
  const rawAge = meta.age;
  const numAge =
    typeof rawAge === "number" ? rawAge : typeof rawAge === "string" && /^\d+$/.test(rawAge) ? parseInt(rawAge, 10) : null;
  if (numAge != null && numAge > 0 && !isLegacyChipAge(meta)) {
    return { exact: numAge, band: ageBandFromExact(numAge) };
  }
  if (isAgeBand(meta.age_band)) return { exact: null, band: meta.age_band };
  if (numAge != null && isLegacyChipAge(meta)) return { exact: null, band: LEGACY_CHIP_AGE_TO_BAND[numAge] };
  return { exact: null, band: null };
}

export function hasCareAge(age: CareAge | null | undefined): boolean {
  return !!age && (age.exact != null || age.band != null);
}

/**
 * Does this age meet an "N and up" rule?
 *   true  = definitely meets it
 *   false = definitely does not
 *   null  = cannot tell from what we hold (never claim eligibility on this)
 * "Under 65" against a 60+ rule is null: the person could be 40 or 63.
 */
export function ageMeetsMin(age: CareAge | null | undefined, minAge: number | null | undefined): boolean | null {
  if (minAge == null || !age) return null;
  if (age.exact != null) return age.exact >= minAge;
  if (!age.band) return null;
  const { min, max } = BAND_BOUNDS[age.band];
  if (min != null && min >= minAge) return true;
  if (max != null && max < minAge) return false;
  return null;
}

/** "72 years old" / "Under 65" / null. */
export function careAgeDisplay(age: CareAge | null | undefined): string | null {
  if (!age) return null;
  if (age.exact != null) return `${age.exact} years old`;
  if (age.band) return AGE_BAND_LABELS[age.band];
  return null;
}

/** Prefill for a free-text "age" input: the typed exact age, or "". A band
 *  (or a legacy chip number like 60) must never be shown as an exact age. */
export function exactAgeInput(metadata: unknown): string {
  const exact = readCareAge(metadata).exact;
  return exact != null ? String(exact) : "";
}

/** When a profile form saves with the age input left empty, the legacy chip
 *  number (still meaning a band until the backfill runs) must survive rather
 *  than be wiped. Returns that number, or undefined. */
export function legacyChipAgeToKeep(metadata: unknown): number | undefined {
  if (!isLegacyChipAge(metadata)) return undefined;
  return Number((metadata as Record<string, unknown>).age);
}

/** Compact form for inline lists: "age 72" / "age under 65" / null. */
export function careAgeShort(age: CareAge | null | undefined): string | null {
  if (!age) return null;
  if (age.exact != null) return `age ${age.exact}`;
  if (age.band) return `age ${AGE_BAND_LABELS[age.band].toLowerCase()}`;
  return null;
}
