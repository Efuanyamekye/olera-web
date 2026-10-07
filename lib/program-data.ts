/**
 * Program data merge layer — combines waiver-library base data with
 * pipeline-generated draft content. Hand-curated fields always win.
 *
 * This is the single source of truth for program page rendering.
 */

import type { WaiverProgram, StateData } from "@/data/waiver-library";
import { getStateById, getProgramById } from "@/data/waiver-library";
import { pipelineDrafts, type PipelineDraft } from "@/data/pipeline-drafts";
import { withoutDuplicates } from "@/lib/benefits/program-duplicates";
import { FEDERAL_PROGRAMS, federalProgramsFor } from "@/data/benefits/federal-programs";

// State name → abbreviation lookup
const STATE_ABBREVS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new-hampshire": "NH", "new-jersey": "NJ",
  "new-mexico": "NM", "new-york": "NY", "north-carolina": "NC", "north-dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode-island": "RI",
  "south-carolina": "SC", "south-dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west-virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district-of-columbia": "DC",
};

function normalizeId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Strip state name or abbreviation prefix from a normalized ID
// e.g., "texassnapfoodbenefits" → "snapfoodbenefits", "txsnapfoodbenefits" → "snapfoodbenefits"
function stripStatePrefix(normalizedId: string, stateAbbrev: string): string {
  const abbrevLower = stateAbbrev.toLowerCase();
  // Find the full state name from abbreviation (reverse lookup)
  const fullName = Object.entries(STATE_ABBREVS).find(([, v]) => v === stateAbbrev)?.[0]?.replace(/-/g, "") || "";

  if (fullName && normalizedId.startsWith(fullName)) return normalizedId.slice(fullName.length);
  if (normalizedId.startsWith(abbrevLower)) return normalizedId.slice(abbrevLower.length);
  return normalizedId;
}

/**
 * Does a name contain a short name as whole words ("NY SSI Supplement"
 * contains "SSI"; "Supplemental Nutrition Assistance" does not)? A substring
 * test on the separator-free ids gave New York's state SSI supplement (short
 * name "SSI") the SNAP draft's rules, because "assistance" contains "ssi"
 * (7 Oct 2026).
 */
const DRAFT_PINS: Record<string, string> = {
  // New York calls its LIHEAP "HEAP".
  "NY|low-income-home-energy-assistance-program-liheap": "heap-energy-assistance",
  "MS|elderly-and-disabled-waiver": "elderly-disabled-waiver",
};

/**
 * Library programs with no draft of their own that had borrowed another
 * program's type and rules through the substring match. They stay in the
 * finder, judged on nothing ("worth checking") rather than on SNAP's rules
 * (New York) or Family Care's (Wisconsin).
 */
const BASE_TYPES: Record<string, WaiverProgram["programType"]> = {
  "NY|state-supplemental-security-income-ssi-supplement": "benefit",
  "WI|wisconsin-family-caregiver-support-program": "benefit",
};

function hasWords(name: string, short: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const n = words(short);
  return !!n && ` ${words(name)} `.includes(` ${n} `);
}

function findDraftMatch(stateAbbrev: string, programId: string): PipelineDraft | undefined {
  const stateDrafts = pipelineDrafts[stateAbbrev];
  if (!stateDrafts?.programs) return undefined;

  const normalizedTarget = normalizeId(programId);

  // 1. Exact ID match
  const exact = stateDrafts.programs.find((d) => d.id === programId);
  if (exact) return exact;

  // 2. Normalized ID match
  const normalized = stateDrafts.programs.find(
    (d) => normalizeId(d.id) === normalizedTarget
  );
  if (normalized) return normalized;

  // 3. State-prefix-stripped match (handles "texas-snap" vs "tx-snap")
  const strippedTarget = stripStatePrefix(normalizedTarget, stateAbbrev);
  const prefixMatch = stateDrafts.programs.find(
    (d) => stripStatePrefix(normalizeId(d.id), stateAbbrev) === strippedTarget
  );
  if (prefixMatch) return prefixMatch;

  // Pairs whose names share no whole short name, matched by hand (7 Oct
  // 2026, when the substring test that had matched them by chance went).
  const pinned = DRAFT_PINS[`${stateAbbrev}|${programId}`];
  if (pinned) {
    const hit = stateDrafts.programs.find((d) => d.id === pinned);
    if (hit) return hit;
  }

  // 4. Name-based match (handles completely different IDs like
  //    "star-plus-home-and-community-based-services" vs "tx-star-plus-medicaid-hcbs")
  // Try to find the base program name from waiver-library and match against draft names
  const state = getStateById(
    Object.entries(STATE_ABBREVS).find(([, v]) => v === stateAbbrev)?.[0] || ""
  );
  const baseProgram = state?.programs.find((p) => p.id === programId);
  if (baseProgram) {
    const baseName = normalizeId(baseProgram.name);
    const baseShort = normalizeId(baseProgram.shortName || "");
    return stateDrafts.programs.find((d) => {
      const draftName = normalizeId(d.name);
      const draftShort = normalizeId(d.shortName || "");
      return draftName === baseName || draftShort === baseShort
        || (baseShort && hasWords(d.name, baseProgram.shortName || ""))
        || (draftShort && hasWords(baseProgram.name, d.shortName || ""));
    });
  }

  return undefined;
}

/**
 * Resolve a program id — from either catalog — to its pipeline draft.
 *
 * The two catalogs name the same programs differently: waiver-library (the
 * hand-curated base) calls it `texas-medicare-savings-programs`, the pipeline
 * calls it `medicaid-buy-in-qmb-slmb-qi`. `findDraftMatch` is the bridge, and
 * every public surface already goes through it via `getEnrichedProgram`.
 *
 * Exported because the Care Navigator letter composer needs the same bridge:
 * it looks families up by their SAVED id (waiver-library vocabulary) but can
 * only write a letter from a draft. It was doing a bare exact-id match, which
 * silently dropped 672 of 2,911 saved rows — programs we hold full content for
 * and simply failed to find.
 *
 * Returns null rather than a guess. Callers must not fall back to fuzzy
 * matching: a confident wrong match puts the right program name next to the
 * wrong office's phone number, which is the failure this whole thread exists
 * to prevent.
 */
export function findPipelineDraftFor(
  stateAbbrev: string,
  programId: string,
): PipelineDraft | null {
  return findDraftMatch(stateAbbrev, programId) ?? null;
}

/**
 * Get all program IDs for a state — both waiver-library and pipeline-only.
 * Used by generateStaticParams to create pages for all known programs.
 */
export function getAllProgramIds(stateId: string): string[] {
  const state = getStateById(stateId);
  const ids = new Set<string>();

  // Waiver-library programs
  if (state) {
    for (const p of state.programs) ids.add(p.id);
  }

  // Pipeline-only programs (not in waiver-library)
  const stateAbbrev = STATE_ABBREVS[stateId] || stateId.toUpperCase();
  const drafts = pipelineDrafts[stateAbbrev]?.programs || [];
  for (const d of drafts) ids.add(d.id);

  return Array.from(ids);
}

// ─── Canonical program identity ─────────────────────────────────────────────
//
// The two catalogs describe many of the same programs under different ids:
// waiver-library `texas-snap-food-benefits` and pipeline `snap-food-benefits`
// are one program, and the legacy entry carries older, conflicting numbers
// ($3,576 – $21,468/yr vs the current $3,576 maximum). Matching over the union
// showed families SNAP, Medicare Savings and Weatherization twice.
//
// A TOPIC is assigned only when exactly one unambiguous pattern matches the
// name, so a vague name ("Family Caregiver Support") never collapses into a
// different program.

const PROGRAM_TOPICS: [string, RegExp][] = [
  ["snap", /\b(snap|food stamps|supplemental nutrition|calfresh)\b/i],
  ["liheap", /\b(liheap|ceap|home energy assistance|energy assistance program)\b/i],
  ["weatherization", /\bweatherization\b/i],
  ["msp", /\b(medicare savings|qmb|slmb|medicaid buy-in)\b/i],
  ["pace", /\b(pace|all-inclusive care)\b/i],
  ["meals", /\bmeals on wheels\b/i],
  ["ship", /\b(ship|health insurance assistance program|medicare counseling)\b/i],
  ["ombudsman", /\bombudsman\b/i],
  ["scsep", /\b(scsep|community service employment)\b/i],
  ["starplus", /\bstar\s?\+\s?plus\b/i],
  // CSFP (the USDA "Senior Box") is not SNAP. A name that mentions both
  // (SD "SNAP/Food Assistance (Senior Box Program/CSFP)") gets two hits and
  // so no topic, instead of absorbing the legacy SNAP page.
  ["csfp", /\b(csfp|commodity supplemental food|senior (food )?box)\b/i],
  // Senior Medicare Patrol (fraud help) is not SHIP counseling, even when a
  // name carries both ("Senior Medicare Patrol (SMP/SHIP)").
  ["smp", /\b(senior medicare patrol|smp)\b/i],
];

export function programTopic(name: string | null | undefined): string | null {
  if (!name) return null;
  // Only the PRIMARY program counts: in "Home Care Program for Elders
  // (CHCPE) - Medicare Savings" the part after the dash is a bundled
  // secondary benefit, so the name must not stand in for the MSP page.
  const primary = name.split(/\s[-–—]\s/)[0];
  const hits = PROGRAM_TOPICS.filter(([, re]) => re.test(primary)).map(([t]) => t);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * A legacy waiver-library id's CURRENT pipeline page, only when the match is
 * clean: the id itself matches (exact / normalized / state-prefix-stripped),
 * the names are identical, or both names carry the same unambiguous topic.
 * findDraftMatch's substring fallback alone is not enough (it maps Alabama
 * "Home-Delivered Meals" to the E&D waiver). Null otherwise, never a guess.
 */
export function findCanonicalDraftFor(stateId: string, legacyId: string): PipelineDraft | null {
  const stateAbbrev = STATE_ABBREVS[stateId] || stateId.toUpperCase();
  const drafts = pipelineDrafts[stateAbbrev]?.programs || [];
  if (drafts.some((d) => d.id === legacyId)) return null; // already canonical
  const base = getProgramById(stateId, legacyId);
  if (!base) return null;
  const draft = findDraftMatch(stateAbbrev, legacyId);
  if (!draft) return null;

  const target = stripStatePrefix(normalizeId(legacyId), stateAbbrev);
  const idClean =
    normalizeId(draft.id) === normalizeId(legacyId) ||
    stripStatePrefix(normalizeId(draft.id), stateAbbrev) === target;
  const nameClean = normalizeId(draft.name) === normalizeId(base.name);
  const baseTopic = programTopic(base.name);
  const topicClean = baseTopic != null && baseTopic === programTopic(draft.name);
  if (!idClean && !nameClean && !topicClean) return null;

  // Two legacy ids landing on the same draft means the mapping is not 1:1;
  // refuse rather than send one of them to the wrong page.
  const state = getStateById(stateId);
  const collisions = (state?.programs || []).filter(
    (p) => p.id !== legacyId && findDraftMatch(stateAbbrev, p.id)?.id === draft.id,
  );
  if (collisions.length > 0 && !idClean) return null;
  return draft;
}

/**
 * Program ids for MATCHING (the /m results, the program-card email set):
 * every current pipeline program, plus legacy waiver-library programs that
 * have no current equivalent. A legacy entry is dropped when it cleanly maps
 * to a current page, or when a current program in the state carries the same
 * unambiguous topic (TX "CEAP/LIHEAP" vs "LIHEAP"). Order: current first.
 */
export function getCanonicalProgramIds(stateId: string): string[] {
  const stateAbbrev = STATE_ABBREVS[stateId] || stateId.toUpperCase();
  const drafts = pipelineDrafts[stateAbbrev]?.programs || [];
  if (drafts.length === 0) return getAllProgramIds(stateId);

  const ids = drafts.map((d) => d.id);
  const draftIds = new Set(ids);
  const draftTopics = new Set(drafts.map((d) => programTopic(d.name)).filter(Boolean) as string[]);
  const state = getStateById(stateId);
  for (const p of state?.programs || []) {
    if (draftIds.has(p.id)) continue;
    if (findCanonicalDraftFor(stateId, p.id)) continue;
    const topic = programTopic(p.name);
    if (topic && draftTopics.has(topic)) continue;
    ids.push(p.id);
  }
  // Programs held twice under two ids are listed once (see program-duplicates).
  return withoutDuplicates(stateAbbrev, ids.map((id) => ({ id }))).map((p) => p.id);
}

/** A draft as a WaiverProgram, for a program the waiver library doesn't hold. */
function draftToProgram(draft: PipelineDraft): WaiverProgram {
  return {
    id: draft.id,
    name: draft.name,
    shortName: draft.shortName,
    tagline: draft.tagline,
    savingsRange: draft.savingsRange,
    description: draft.intro || draft.tagline,
    eligibilityHighlights: draft.structuredEligibility?.summary || [],
    applicationSteps: draft.applicationGuide?.steps || [],
    forms: [],
    // Pipeline fields
    programType: draft.programType as WaiverProgram["programType"],
    complexity: draft.complexity as WaiverProgram["complexity"],
    geographicScope: draft.geographicScope as WaiverProgram["geographicScope"],
    intro: draft.intro,
    structuredEligibility: draft.structuredEligibility as WaiverProgram["structuredEligibility"],
    applicationGuide: draft.applicationGuide as WaiverProgram["applicationGuide"],
    contentSections: draft.contentSections as WaiverProgram["contentSections"],
    faqs: draft.faqs,
    savingsSource: draft.savingsSource,
    savingsVerified: draft.savingsVerified,
    phone: draft.phone || undefined,
    sourceUrl: draft.sourceUrl || undefined,
    contentStatus: draft.contentStatus as WaiverProgram["contentStatus"],
    draftedAt: draft.draftedAt,
    documentsNeeded: draft.documentsNeeded,
    contacts: draft.contacts,
    applicationNotes: draft.applicationNotes,
    relatedPrograms: draft.relatedPrograms,
    regionalApplications: draft.regionalApplications,
    layoutIntent: draft.layoutIntent as WaiverProgram["layoutIntent"],
    icon: draft.icon,
  };
}

/**
 * The programs a family's plan considers: the state's canonical list plus the
 * federal programs it doesn't already hold (Extra Help, SSI, VA pension).
 * The finder and the conversation read this; state pages and sitemaps keep
 * getCanonicalProgramIds, so federal programs get no per-state pages listed.
 */
export function getPlanProgramIds(stateId: string): string[] {
  const ids = getCanonicalProgramIds(stateId);
  const names = ids.map((id) => getEnrichedProgram(stateId, id)?.name ?? "");
  return [...ids, ...federalProgramsFor(names).map((p) => p.id)];
}

/**
 * Get an enriched program by merging waiver-library base data with pipeline draft.
 * Hand-curated fields from waiver-library always win over pipeline-generated.
 * Also returns pipeline-only programs that don't exist in waiver-library.
 */
export function getEnrichedProgram(
  stateId: string,
  programId: string
): WaiverProgram | undefined {
  // A federal program (data/benefits/federal-programs.ts) under any state's
  // address. Checked first so the fuzzy draft match below can't turn
  // "federal-ssi" into the state's own SSI page.
  const federal = FEDERAL_PROGRAMS.find((p) => p.id === programId);
  if (federal) return draftToProgram(federal);

  const baseProgram = getProgramById(stateId, programId);

  // Find matching pipeline draft
  const stateAbbrev = STATE_ABBREVS[stateId] || stateId.toUpperCase();
  const draft = findDraftMatch(stateAbbrev, programId);

  // Pipeline-only program — create synthetic WaiverProgram from draft
  if (!baseProgram && draft) return draftToProgram(draft);

  if (!baseProgram) return undefined;
  if (!draft) {
    const type = BASE_TYPES[`${stateAbbrev}|${programId}`];
    return type && !baseProgram.programType ? { ...baseProgram, programType: type } : baseProgram;
  }

  // Merge: base wins for existing fields, draft fills gaps
  return {
    ...baseProgram,
    // Pipeline classification — only if base doesn't have it
    programType: baseProgram.programType || (draft.programType as WaiverProgram["programType"]),
    complexity: baseProgram.complexity || (draft.complexity as WaiverProgram["complexity"]),
    geographicScope: baseProgram.geographicScope || draft.geographicScope as WaiverProgram["geographicScope"],
    // Rich content — base wins if present
    intro: baseProgram.intro || draft.intro,
    structuredEligibility: baseProgram.structuredEligibility || draft.structuredEligibility as WaiverProgram["structuredEligibility"],
    applicationGuide: baseProgram.applicationGuide || draft.applicationGuide as WaiverProgram["applicationGuide"],
    contentSections: baseProgram.contentSections || draft.contentSections as WaiverProgram["contentSections"],
    faqs: baseProgram.faqs || draft.faqs,
    // Metadata
    savingsRange: baseProgram.savingsRange || draft.savingsRange,
    savingsSource: baseProgram.savingsSource || draft.savingsSource,
    savingsVerified: baseProgram.savingsVerified ?? draft.savingsVerified,
    phone: baseProgram.phone || draft.phone || undefined,
    sourceUrl: baseProgram.sourceUrl || draft.sourceUrl || undefined,
    contentStatus: baseProgram.contentStatus || (draft.contentStatus as WaiverProgram["contentStatus"]),
    draftedAt: baseProgram.draftedAt || draft.draftedAt,
    // v3 fields — pass through from pipeline (base rarely has these)
    documentsNeeded: baseProgram.documentsNeeded || draft.documentsNeeded,
    contacts: baseProgram.contacts || draft.contacts,
    applicationNotes: baseProgram.applicationNotes || draft.applicationNotes,
    relatedPrograms: baseProgram.relatedPrograms || draft.relatedPrograms,
    regionalApplications: baseProgram.regionalApplications || draft.regionalApplications,
    layoutIntent: baseProgram.layoutIntent || draft.layoutIntent as WaiverProgram["layoutIntent"],
    icon: baseProgram.icon || draft.icon,
    // Use pipeline name/tagline only if base is clearly a scaffold
    tagline: baseProgram.tagline?.length > 50 ? baseProgram.tagline : (draft.tagline || baseProgram.tagline),
  };
}

/**
 * Get the state abbreviation from a state slug.
 */
export function getStateAbbrev(stateId: string): string {
  return STATE_ABBREVS[stateId] || stateId.toUpperCase();
}

// Reverse lookup: abbreviation → slug (e.g., "TX" → "texas")
const ABBREV_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREVS).map(([slug, abbrev]) => [abbrev, slug])
);

/**
 * Get state slug from abbreviation (e.g., "TX" → "texas").
 */
export function getStateSlug(abbrev: string): string | undefined {
  return ABBREV_TO_SLUG[abbrev.toUpperCase()];
}

/**
 * Parse a savings range string to extract the upper bound number.
 * "$10,000 – $30,000/year" → 30000, "Free" → 0
 */
function parseSavingsUpper(savingsRange?: string): number {
  if (!savingsRange) return 0;
  const matches = savingsRange.match(/\$[\d,]+/g);
  if (!matches || matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  return parseInt(last.replace(/[$,]/g, ""), 10) || 0;
}

/**
 * Get top programs for a state by savings potential.
 * Returns enriched programs sorted by highest savings, filtered to benefits only.
 * Dynamically reads from waiver-library + pipeline-drafts — no hardcoding.
 */
export function getTopProgramsForState(
  stateAbbrev: string,
  limit = 3
): { programs: WaiverProgram[]; stateId: string; stateName: string } | null {
  const stateId = getStateSlug(stateAbbrev);
  if (!stateId) return null;

  const state = getStateById(stateId);
  const allIds = getAllProgramIds(stateId);
  if (allIds.length === 0) return null;

  // Enrich all programs and filter to benefits with savings data
  const enriched = allIds
    .map((id) => getEnrichedProgram(stateId, id))
    .filter((p): p is WaiverProgram => !!p)
    .filter((p) => p.programType === "benefit" && parseSavingsUpper(p.savingsRange) > 0)
    .sort((a, b) => parseSavingsUpper(b.savingsRange) - parseSavingsUpper(a.savingsRange));

  if (enriched.length === 0) return null;

  return {
    programs: enriched.slice(0, limit),
    stateId,
    stateName: state?.name || stateId.charAt(0).toUpperCase() + stateId.slice(1).replace(/-/g, " "),
  };
}
