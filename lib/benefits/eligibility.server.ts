/**
 * Per-family eligibility over PIPELINE programs (Phase 3, real situation
 * capture — 2026-07-28 handoff).
 *
 * The scored engine (/api/benefits/match) holds the structured eligibility
 * columns (min_age / max_income_single / requires_medicaid / requires_veteran)
 * but lives on the sbf_* DB tables, while every family-facing surface — the
 * /m plan, the cascade first step, program pages — runs on pipeline draft
 * programs with slug ids and prose eligibility. The two universes share no
 * key (waiver_library_url covers only ~530 of 1,629 state rows), so this
 * module bridges them by CANONICAL NAME and applies the engine's rules to
 * the pipeline side.
 *
 * Philosophy (same as getProgramsForFamily): hard-exclude only on facts we
 * HOLD, and only when the name-join or the draft's own text gives us
 * confidence. Unknown facts and unjoined programs always stay in. Income
 * exclusion uses the band FLOOR (the family's whole band must clear the
 * limit); an age requirement with an alternative pathway ("or 18-64 with a
 * disability") never rules anyone out on age.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ageMeetsMin } from "@/lib/benefits/age";
import {
  type FamilyBenefitsFacts,
  incomeBandFloor,
  incomeBandCeiling,
  incomeBandIsHouseholdScoped,
} from "@/lib/family-comms/benefits-guidance.server";

// ── sbf eligibility rows ────────────────────────────────────────────────────

export interface SbfEligibilityRow {
  name: string;
  min_age: number | null;
  max_income_single: number | null;
  requires_medicaid: boolean | null;
  requires_veteran: boolean | null;
}

/** Load the structured-eligibility rows for a state (state + federal tables).
 *  Returns [] on any error — callers degrade to draft-text-only checks. */
export async function loadSbfEligibility(
  db: SupabaseClient,
  stateCode: string | null,
): Promise<SbfEligibilityRow[]> {
  const cols = "name, min_age, max_income_single, requires_medicaid, requires_veteran";
  try {
    const [stateRes, federalRes] = await Promise.all([
      stateCode
        ? db.from("sbf_state_programs").select(cols).eq("state_code", stateCode.toUpperCase()).eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
      db.from("sbf_federal_programs").select(cols).eq("is_active", true),
    ]);
    return [
      ...((stateRes.data as SbfEligibilityRow[] | null) || []),
      ...((federalRes.data as SbfEligibilityRow[] | null) || []),
    ];
  } catch (err) {
    console.error("[eligibility] sbf load failed:", err);
    return [];
  }
}

// ── Canonical-name join ─────────────────────────────────────────────────────

/**
 * National program archetypes both universes contain under different names
 * ("SNAP (Food Assistance)" vs "SNAP (Supplemental Nutrition Assistance
 * Program)"). An alias hit on BOTH sides is the highest-confidence join.
 */
const ARCHETYPES: { key: string; re: RegExp }[] = [
  { key: "liheap", re: /\bliheap\b|low[- ]income home energy/i },
  { key: "snap", re: /\bsnap\b|food stamp|supplemental nutrition/i },
  { key: "weatherization", re: /weatheriz/i },
  { key: "msp", re: /medicare savings|\bqmb\b|\bslmb\b/i },
  { key: "ship", re: /\bship\b|serving health insurance|health insurance (assistance|counseling)|i-care/i },
  { key: "pace", re: /\bpace\b|all-inclusive care/i },
  { key: "ombudsman", re: /ombudsman/i },
  { key: "extra-help", re: /extra help|low[- ]income subsidy/i },
  { key: "ssi", re: /\bssi\b|supplemental security income/i },
  { key: "aid-attendance", re: /aid (and|&) attendance/i },
  { key: "homestead", re: /homestead/i },
  { key: "meals", re: /home[- ]delivered meals|meals on wheels|congregate/i },
];

function archetypeOf(name: string): string | null {
  for (const a of ARCHETYPES) if (a.re.test(name)) return a.key;
  return null;
}

const NAME_STOPWORDS = new Set([
  "program", "programs", "assistance", "services", "service", "benefits",
  "benefit", "the", "of", "for", "and", "senior", "seniors", "elderly",
  "state", "county", "local", "office", "offices",
]);

/** Lowercase, drop parentheticals/punctuation/stopwords/state name → token set. */
export function canonicalTokens(name: string, stateName?: string | null): Set<string> {
  let s = name.toLowerCase().replace(/\([^)]*\)/g, " ");
  if (stateName) s = s.replaceAll(stateName.toLowerCase(), " ");
  s = s.replace(/[^a-z0-9 ]/g, " ");
  return new Set(s.split(/\s+/).filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t)));
}

/**
 * Resolve a pipeline program name to its sbf row, or null. Match order:
 * shared archetype → token-subset containment (≥2 meaningful tokens on the
 * smaller side). Ambiguity (two archetype hits) resolves to the first row —
 * rows arrive state-first, which is the program the pipeline draft mirrors.
 */
export function resolveSbfRow(
  rows: SbfEligibilityRow[],
  pipelineName: string,
  stateName?: string | null,
): SbfEligibilityRow | null {
  const arch = archetypeOf(pipelineName);
  if (arch) {
    const hit = rows.find((r) => archetypeOf(r.name) === arch);
    if (hit) return hit;
  }
  const target = canonicalTokens(pipelineName, stateName);
  if (target.size < 2) return null;
  for (const r of rows) {
    const tokens = canonicalTokens(r.name, stateName);
    if (tokens.size < 2) continue;
    const [small, large] = tokens.size <= target.size ? [tokens, target] : [target, tokens];
    let contained = true;
    for (const t of small) if (!large.has(t)) { contained = false; break; }
    if (contained) return r;
  }
  return null;
}

// ── Verdicts ────────────────────────────────────────────────────────────────

/** Medicaid-gated by NAME (waivers require Medicaid enrollment by
 *  definition). Name only, never description — mirrors the guidance module's
 *  isMedicaidGated caveat about prose mentioning Medicaid. Medicare Savings
 *  Programs are exempt even when a state's draft prefixes them "Medicaid":
 *  MSP is Medicaid-ADMINISTERED help that families apply to directly —
 *  requiring Medicaid first would be factually wrong. */
export function medicaidGatedName(name: string): boolean {
  if (archetypeOf(name) === "msp") return false;
  if (isMedicaidDoor(name)) return false;
  return /\bmedicaid\b|\bwaiver\b/i.test(name);
}

/**
 * Is this program the Medicaid APPLICATION rather than something that sits on
 * top of Medicaid?
 *
 * The gate below rules a program out when the family says they have no
 * Medicaid. That is right for a waiver, which you can only join once you are
 * eligible. It is exactly backwards for base Medicaid itself: not having it is
 * the whole reason to apply. Until 2026-09-01 the name regex could not tell the
 * two apart, so every family who answered "no Medicaid" was ruled out of the 25
 * state Medicaid programs in the library and fell through to food and energy
 * aid. That is why first-step letters kept opening with SNAP and LIHEAP for
 * people who had told us they need help paying for care.
 *
 * Name-based, like the rest of this module, because `requires_medicaid` is seed
 * noise in both directions. The two exclusions below are services Medicaid pays
 * for rather than doors into it, and they do need Medicaid first:
 *   - Washington's "Medicaid Personal Care (MPC) Program"
 *   - Oregon's "OPI-M (Medicaid-funded)"
 * Measured across all 51 states with this predicate (not a reimplementation of
 * it — the first census used /waiver/i and hid a plural bug): 23 programs open
 * up, 47 stay gated, and no program with "waiver" in its name opens. This
 * belongs in the program data eventually; a per-program flag would not need the
 * exception list.
 */
export function isMedicaidDoor(name: string): boolean {
  // Plural matters: `\bwaiver\b` does not match "Waivers", and most program
  // names use the plural, which would have opened every "<State> Medicaid HCBS
  // Waivers" as though it were the Medicaid door.
  if (/waivers?\b/i.test(name)) return false;
  if (/medicaid[- ]funded/i.test(name)) return false;
  if (/personal care/i.test(name)) return false;
  return /\bmedicaid\b|\bmedical assistance\b|husky health|med-quest|healthnet|soonercare/i.test(name);
}

/** Parse a bare minimum age out of the draft's own ageRequirement ("65+",
 *  "Age 60+"). Returns null when the text hints an alternative pathway
 *  ("65+ or 18-64 with a disability") — those programs never age-exclude. */
export function draftMinAge(ageRequirement: string | null | undefined): number | null {
  if (!ageRequirement) return null;
  if (/\bor\b|disab|blind|\b1[89]\b|\b21\b/i.test(ageRequirement)) return null;
  const m = ageRequirement.match(/(\d{2})\s*\+/);
  return m ? parseInt(m[1], 10) : null;
}

export interface EligibilityVerdict {
  ruledOut: boolean;
  /** Family-readable reason, e.g. "needs Medicaid first". Null when kept. */
  reason: string | null;
  /** Re-rank boost from CONFIRMED facts (mirrors the scored engine's
   *  weights: within income +12, meets age +8, Medicaid held on a gated
   *  program +10). 0 when nothing is confirmed. */
  boost: number;
  /** One family-readable line per confirmed fact behind the boost, e.g.
   *  "Income looks under the limit". Empty when nothing is confirmed. */
  fits: string[];
}

export interface ProgramForVerdict {
  name: string;
  /** The draft's structuredEligibility.ageRequirement, when available. */
  ageRequirement?: string | null;
  /** The draft's structuredEligibility.summary lines — scanned for an
   *  alternative eligibility pathway ("18-64 with a disability") that vetoes
   *  any age rule-out. */
  eligibilitySummary?: string[] | null;
  /** The draft's own single-person monthly income limit
   *  (structuredEligibility.incomeTable, householdSize 1) — the program's
   *  OWN number outranks the fuzzy-joined sbf column. */
  incomeLimitSingle?: number | null;
}

/** Pull the householdSize=1 monthly limit out of a draft income table. */
export function incomeLimitFromTable(
  table: { householdSize: number; monthlyLimit: number }[] | null | undefined,
): number | null {
  // Some tables list several tiers for the same household size (Medicare
  // Savings: QMB 100%, SLMB 120%, QI 135% of the poverty line, in 25 states on
  // 2 Oct 2026). The first row is the strictest tier, and reading it ruled out
  // families the generous tier would take. For "could this family qualify",
  // the limit is the most generous row.
  let limit: number | null = null;
  for (const r of table || []) if (r.householdSize === 1 && r.monthlyLimit > 0 && (limit == null || r.monthlyLimit > limit)) limit = r.monthlyLimit;
  return limit;
}

/** Apply the scored engine's rules to one pipeline program. Conservative by
 *  construction: every exclusion needs a HELD fact plus either a joined sbf
 *  row or the draft's own text. */
export function evaluateProgramForFamily(
  program: ProgramForVerdict,
  sbf: SbfEligibilityRow | null,
  facts: FamilyBenefitsFacts,
): EligibilityVerdict {
  // Rule-out gating is NAME-only. The requires_medicaid column is seed noise
  // in both directions (under-set: TX STAR+PLUS carries false; over-set: GA
  // Medicare Savings carries true, and MSP is how families GET coverage
  // help) — so the column may only ever BOOST, never exclude.
  const gatedName = medicaidGatedName(program.name);
  const gated = gatedName || sbf?.requires_medicaid === true;

  // A denial leaves the family without Medicaid just as surely as never having
  // applied, so a program that genuinely requires it is out of reach either
  // way. What differs between the two is the letter, not the program.
  const noMedicaid = facts.medicaidStatus === "doesNotHave" || facts.medicaidStatus === "denied";
  if (noMedicaid && gatedName) {
    return { ruledOut: true, reason: "Needs Medicaid first", boost: 0, fits: [] };
  }
  if (sbf?.requires_veteran === true && facts.veteranStatus === "no") {
    return { ruledOut: true, reason: "For veteran families", boost: 0, fits: [] };
  }

  // Age: rule out ONLY from the draft's own clean "N+" requirement (the
  // pipeline content is per-state fact-checked; the sbf min_age column is
  // seed-seniorized — FL LIHEAP carries 65 for a program with no age floor
  // — so like requires_medicaid it may only boost, never exclude). A
  // disability/younger pathway anywhere in the draft's eligibility text
  // vetoes the rule-out too.
  const draftAge = draftMinAge(program.ageRequirement);
  const altPathway = (program.eligibilitySummary || []).some((s) =>
    /disab|blind|18\s*[-–]\s*64/i.test(s),
  );
  const careAge = { exact: facts.age, band: facts.ageBand };
  // Only a held fact rules out: "Under 65" against a 60+ rule is unknown.
  if (!altPathway && draftAge != null && ageMeetsMin(careAge, draftAge) === false) {
    return { ruledOut: true, reason: `For age ${draftAge} and up`, boost: 0, fits: [] };
  }

  // Income tests compare a HOUSEHOLD figure to a household limit. The stored
  // band is the care recipient's own income ("About how much is their monthly
  // income?"), so when a spouse lives with them it is a fragment of the
  // tested amount and neither direction of comparison is sound. Skipping the
  // boost matters more than skipping the rule-out: an $980 band read against
  // a couple limit floats premium-help programs to the top of the plan for a
  // household that is thousands over. Falls back to "unknown", which this
  // module always treats as keep-and-do-not-promote.
  const incomeUsable = incomeBandIsHouseholdScoped(facts);
  // Rule out on the draft's own fact-checked limit only. The sbf column is
  // the March 2026 seed: where both stores hold a limit, two in three differ
  // by more than 10% (measured 2 Oct 2026), and for 111 programs it was the
  // only limit, so it was deciding exclusions alone. Like min_age and
  // requires_medicaid it may boost, never exclude.
  const incomeLimit = program.incomeLimitSingle ?? sbf?.max_income_single ?? null;
  const floor = incomeUsable ? incomeBandFloor(facts.incomeBand) : null;
  if (floor != null && program.incomeLimitSingle != null && floor > program.incomeLimitSingle) {
    return { ruledOut: true, reason: "Income is likely above its limit", boost: 0, fits: [] };
  }

  let boost = 0;
  const fits: string[] = [];
  // Weight each signal BELOW the one that covers more of the library, so a
  // boost never outranks a better-covered one on the strength of luck.
  //
  // Only 178 of 642 programs (28%) publish an income table this can read, and
  // the gaps are not random: cash assistance and waivers state eligibility in
  // tiers and prose, while energy and weatherization publish one clean number.
  // So a program that cannot earn this boost is usually the LARGER benefit. At
  // +12 the boost outweighed age (+8, 65% coverage) and every complexity gap,
  // which meant the letter led with whatever the scraper had parsed best: a
  // North Carolina family was moved off State-County Special Assistance
  // ($17,604/yr) onto weatherization, not because she fit it better but
  // because weatherization publishes $2,608 and Special Assistance publishes
  // nothing. Coverage is uneven by state too — ND and WI have no income table
  // at all, so there the signal only ever fired as a tie.
  //
  // It stays a real signal where it fires: proof a family sits under a limit
  // is worth something. It is just worth less than a fact we hold about two
  // thirds of the library, and far less than the difference between a cash
  // program and a home retrofit. Absence of a number is not evidence of misfit.
  const ceiling = incomeUsable ? incomeBandCeiling(facts.incomeBand) : null;
  if (ceiling != null && incomeLimit != null && ceiling <= incomeLimit) {
    boost += 6;
    fits.push("Income looks under the limit");
  }
  const boostMinAge = draftAge ?? sbf?.min_age ?? null;
  if (boostMinAge != null && ageMeetsMin(careAge, boostMinAge) === true) {
    boost += 8;
    // Say so only when the age rule is the program's own. The sbf column is
    // seed-seniorized (SNAP carries 60), so it may boost but never be quoted.
    if (draftAge != null) fits.push(`Meets the age rule (${draftAge}+)`);
  }
  if (facts.medicaidStatus === "alreadyHas" && gated) {
    boost += 10;
    fits.push("Already has Medicaid");
  }
  return { ruledOut: false, reason: null, boost, fits };
}

/** True when the family has given at least one Phase 3 eligibility fact —
 *  the gate for running the re-rank at all (no facts, no reorder). */
export function hasEligibilityFacts(facts: FamilyBenefitsFacts): boolean {
  return (
    facts.age != null ||
    facts.ageBand != null ||
    facts.medicaidStatus != null ||
    facts.veteranStatus != null ||
    // Recipient-only income against a household limit is not a fact we can
    // act on, so a spouse family whose ONLY fact is income gets no re-rank.
    (incomeBandIsHouseholdScoped(facts) && incomeBandFloor(facts.incomeBand) != null)
  );
}

// ── Ranked partition (the /m re-rank) ───────────────────────────────────────

export interface RankedProgram<T> {
  item: T;
  verdict: EligibilityVerdict;
}

/**
 * Partition + reorder a program list by the family's facts. Kept programs
 * are stably reordered by boost (confirmed facts float, unknowns keep their
 * original relative order); ruled-out programs come back separately with
 * their reasons for the "probably not a fit" group.
 */
export function rankProgramsForFamily<T>(
  items: T[],
  getProgram: (item: T) => ProgramForVerdict,
  sbfRows: SbfEligibilityRow[],
  facts: FamilyBenefitsFacts,
  stateName?: string | null,
): { kept: RankedProgram<T>[]; ruledOut: RankedProgram<T>[] } {
  const kept: (RankedProgram<T> & { idx: number })[] = [];
  const ruledOut: RankedProgram<T>[] = [];
  items.forEach((item, idx) => {
    const program = getProgram(item);
    const sbf = resolveSbfRow(sbfRows, program.name, stateName);
    const verdict = evaluateProgramForFamily(program, sbf, facts);
    if (verdict.ruledOut) ruledOut.push({ item, verdict });
    else kept.push({ item, verdict, idx });
  });
  kept.sort((a, b) => b.verdict.boost - a.verdict.boost || a.idx - b.idx);
  return { kept: kept.map(({ item, verdict }) => ({ item, verdict })), ruledOut };
}
