/**
 * The redesigned finder's results (/api/benefits/finder).
 *
 * Reads the same fact-checked programs the plan page and letters read, and
 * screens them with the same rules (rankProgramsForFamily). On top of that it
 * decides three things the old results page never said:
 *
 *   1. Likely or Worth checking. "Likely" needs at least one fact the family
 *      gave us that meets the program's own rule, and no open question on its
 *      main tests (a Medicaid program with Medicaid "not sure" is worth
 *      checking, never likely). Everything else is worth checking, with the
 *      reason why.
 *   2. Left out, and why. Programs the family's own answers rule out are
 *      listed, not hidden.
 *   3. One first step, chosen from what the family said would help most.
 *
 * Nothing here claims eligibility. The agency decides, and the page says so.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WaiverProgram } from "@/data/waiver-library";
import { getCanonicalProgramIds, getEnrichedProgram, getStateSlug } from "@/lib/program-data";
import { US_STATES } from "@/lib/us-states";
import { ageMeetsMin } from "@/lib/benefits/age";
import { pickCallContact, stripParen } from "@/lib/benefits/call-script";
import { findLocalAAA } from "@/lib/benefits/local-aaa";
import { programCategory } from "@/lib/benefits/program-category";
import {
  loadSbfEligibility,
  rankProgramsForFamily,
  incomeLimitFromTable,
  draftMinAge,
  medicaidGatedName,
  isMedicaidDoor,
} from "@/lib/benefits/eligibility.server";
import {
  type FamilyBenefitsFacts,
  incomeBandFloor,
  incomeBandCeiling,
} from "@/lib/family-comms/benefits-guidance.server";
import type { BenefitCategory } from "@/lib/types/benefits";
import {
  type FinderAnswers,
  type FinderProgram,
  type FinderResult,
  type FinderLeftOut,
  type FinderGroup,
  type FinderAgency,
  type FinderIconName,
  careNeedFromFinder,
  finderVoice,
  isHelpingSomeone,
} from "@/lib/benefits/finder-answers";

const NEED_CATEGORIES: Record<string, BenefitCategory[]> = {
  urgent: ["utilities", "food"],
  bills: ["food", "utilities", "housing", "income"],
  care: ["healthcare"],
  memory: ["healthcare", "caregiver"],
  health: ["healthcare"],
};

const PAYS_FOR_CARE = /waiver|hcbs|home and community|star\+plus|\bpace\b|all-inclusive|personal care|attendant|in-home|ihss|choices|long[- ]term care|community medicaid/i;
const MEDICARE_HELP = /medicare savings|\bqmb\b|\bslmb\b|\bmsp\b|extra help|low[- ]income subsidy/i;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Summary lines about age or money are covered by the questions. */
const COVERED_RULE = /priority|\bage\b|\d+\s*\+|income|asset|savings|fpl|poverty|resident|citizen|immigra|medicare part|medicaid/i;

/** Summary lines that say nothing a family needs to check ("Must reside in
 *  Alabama", "All ages eligible", "Own or rent"). Shown as the "also requires"
 *  line, they read as a hurdle that isn't one. */
const TRIVIAL_RULE = /must (reside|live) in|resident of|all ages|any age|all housing|own or rent|homeowners? (or|and) renters?|renters? (are )?eligible|qualify automatically|automatically qualif|responsible for paying/i;

/** A rule no question settles and that decides the program: a level-of-care
 *  or daily-help assessment, being homebound, or an asset limit. With one of
 *  these, a family can't be "likely" on income alone (ARChoices needs
 *  nursing-home level of care; Georgia's ABD Medicaid caps resources). */
const UNASKED_GATE = /level of care|nursing (home|facility)|daily help|help with (bathing|dressing|eating|daily)|activities of daily living|\badls?\b|at risk of|homebound|assessment|functional|resources|asset/i;

/** Lowercase the first letter to follow "It also requires:", but leave an
 *  acronym alone ("SSI recipients", not "sSI recipients"). */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** The first rule the questions don't cover, e.g. "State-certified need for
 *  nursing home level of care" or "Primarily homebound". */
function otherRequirement(p: WaiverProgram): string | null {
  const line = (p.structuredEligibility?.summary || []).find((l) => !COVERED_RULE.test(l) && !TRIVIAL_RULE.test(l));
  if (!line) return null;
  const clean = line.replace(/[.;]\s*$/, "").trim();
  return clean ? `It also requires: ${lowerFirst(clean)}.` : null;
}

/** The program's own first rule, for when nothing we asked settles it. */
function mainRule(p: WaiverProgram): string | null {
  const line = (p.structuredEligibility?.summary || [])[0];
  return line ? `The main rule: ${lowerFirst(line.replace(/[.;]\s*$/, ""))}.` : null;
}

/** Medicaid for the "aged, blind and disabled": under 65 it needs a
 *  disability, which the finder never asks about. */
const AGED_OR_DISABLED = /\baged\b|\belderly\b|seniors?\s*(\/|and)\s*disabled/i;

function factsFor(a: FinderAnswers, stateCode: string): FamilyBenefitsFacts {
  return {
    state: stateCode,
    careTypes: [],
    careNeed: careNeedFromFinder(a),
    financialPath: null,
    medicaidStatus: a.medicaid,
    // A veteran's surviving spouse can qualify for VA pension, so only a
    // plain "no" may rule a veteran program out.
    veteranStatus: a.veteran === "no" ? "no" : a.veteran === "yes" ? "yes" : null,
    age: null,
    ageBand: a.age && a.age !== "unsure" ? a.age : null,
    incomeBand: a.income && a.income !== "unsure" ? a.income : null,
    // The limits we compare against are one-person limits. With anyone else
    // in the home, the shared rules must not rule out or promote on income.
    hasSpouse: a.household ? a.household !== "1" : null,
  };
}

/** The glyph for a program: its kind of help, from the category plus a few
 *  name patterns that split a category (meals vs groceries, weatherization
 *  vs bill help, Medicare help vs care at home vs a clinic-style program). */
function iconFor(p: WaiverProgram, category: BenefitCategory): FinderIconName {
  const name = `${p.name} ${p.shortName ?? ""}`;
  switch (category) {
    case "caregiver":
      return "caregiver";
    case "food":
      // SNAP's full name says "Nutrition", so groceries is decided first.
      if (/\bsnap\b|supplemental nutrition|food stamp|calfresh|basic food|grocer/i.test(name)) return "groceries";
      return /meal|nutrition|congregate/i.test(name) ? "meals" : "groceries";
    case "utilities":
      return /weatheriz|repair|insulat/i.test(name) ? "weather" : "energy";
    case "housing":
      return "home";
    case "income":
      return "money";
    default:
      if (MEDICARE_HELP.test(name) || /prescription|pharmac|drug|insurance/i.test(name)) return "medicare";
      if (/\bpace\b|all-inclusive|clinic|health center/i.test(name)) return "clinic";
      if (PAYS_FOR_CARE.test(name) || /home|personal care|attendant/i.test(name)) return "home";
      return "clinic";
  }
}

function groupFor(category: BenefitCategory, helping: boolean): FinderGroup {
  if (category === "caregiver") return helping ? "you" : "care";
  if (category === "healthcare") return "care";
  return "bills";
}

interface Screened {
  program: FinderProgram;
  category: BenefitCategory;
  score: number;
  raw: WaiverProgram;
  /** The money facts fit and only an assessment the call arranges is open. */
  fitsButAssess: boolean;
}

type TierResult = Pick<FinderProgram, "tier" | "reason"> & { fitsButAssess?: boolean };

/** Likely or worth checking, and the one-line reason, for a kept program. */
function tierAndReason(p: WaiverProgram, category: BenefitCategory, a: FinderAnswers): TierResult {
  const v = finderVoice(a.who);
  const helping = isHelpingSomeone(a);

  if (category === "caregiver") {
    const where = a.place ? ` in ${a.place.split(",")[0]}` : "";
    const whom = a.who === "parent" ? "your parent" : a.who === "spouse" ? "your spouse" : "someone";
    return helping
      ? { tier: "likely", reason: `You're caring for ${whom}${where}, and family caregivers can get this help for themselves.` }
      : { tier: "check", reason: "For family members caring for someone at home." };
  }

  const draftAge = draftMinAge(p.structuredEligibility?.ageRequirement);
  const ageOk = draftAge != null && a.age && a.age !== "unsure" ? ageMeetsMin({ exact: null, band: a.age }, draftAge) : null;

  const limit = incomeLimitFromTable(p.structuredEligibility?.incomeTable);
  const band = a.income && a.income !== "unsure" ? a.income : null;
  const floor = incomeBandFloor(band);
  const ceiling = incomeBandCeiling(band);
  type IncomeStatus = "under" | "near" | "household" | "unknown" | "none";
  let income: IncomeStatus = "none";
  if (limit != null) {
    if (a.household && a.household !== "1") income = "household";
    else if (!band) income = "unknown";
    else if (ceiling != null && ceiling <= limit) income = "under";
    else if (floor != null && floor <= limit) income = "near";
    else income = "unknown";
  }

  const gated = medicaidGatedName(p.name);
  const hasMedicaid = a.medicaid === "alreadyHas";
  const also = otherRequirement(p);
  const withAlso = (text: string) => (also ? `${text} ${also}` : text);

  // Medicare help needs Medicare, which most people get at 65. The drafts
  // say "no age limit" because disability also qualifies, so the age rule
  // can't catch this.
  if (MEDICARE_HELP.test(p.name) && (a.age === "under_60" || a.age === "60_64")) {
    return { tier: "check", reason: "Needs Medicare, which usually starts at 65 or comes with a disability." };
  }
  if (AGED_OR_DISABLED.test(p.name) && (a.age === "under_60" || a.age === "60_64")) {
    return { tier: "check", reason: "For people 65 or older, or with a disability." };
  }

  // A denial rules out programs that sit on top of Medicaid (the shared
  // rules drop them), but not the application itself: long-term care
  // Medicaid is judged on different income, asset and spend-down rules
  // than the category most denials come from.
  if (a.medicaid === "denied" && isMedicaidDoor(p.name)) {
    return { tier: "check", reason: "A past no often doesn't decide this. Medicaid for care at home uses different income rules." };
  }

  // Open questions first: each one keeps the program at "worth checking".
  if (gated && !hasMedicaid) {
    if (a.medicaid === "applying") {
      return { tier: "check", reason: "Needs Medicaid first. Worth asking about while the Medicaid application is in." };
    }
    return { tier: "check", reason: `Needs Medicaid first. Worth checking whether ${v.subject} already ${v.subject === "you" ? "have" : "has"} it.` };
  }
  if (income === "near" && limit != null) {
    return { tier: "check", reason: `The limit is ${money(limit)} a month for one person, close to what you told us, so it's worth checking.` };
  }
  if (income === "household" && limit != null) {
    return { tier: "check", reason: `The limit is ${money(limit)} a month for one person, and higher for a bigger household.` };
  }
  if (income === "unknown" && limit != null) {
    return { tier: "check", reason: `The limit is ${money(limit)} a month for one person.` };
  }

  // "Likely" needs a money fact that meets the program's own rule: income
  // under its limit, or Medicaid in hand for a Medicaid program. Age alone
  // is not enough (PACE is 55+ but needs nursing-home-level care).
  const fits: string[] = [];
  if (ageOk === true && draftAge != null) fits.push(`${draftAge} or older`);
  if (income === "under" && limit != null) fits.push(`income under the ${money(limit)} limit`);
  if (gated && hasMedicaid) fits.push(fits.length ? "Medicaid already in place" : "already has Medicaid");
  const sentence = fits.length ? fits.join(", with ") : "";
  const cap = sentence ? sentence.charAt(0).toUpperCase() + sentence.slice(1) + "." : "";
  // A rule about a diagnosis or disability is one we never asked about, so
  // it can't be likely (NY's developmental-disability waiver otherwise led
  // for a 70-year-old with Medicaid).
  const needsDiagnosis = !!also && /diagnos|disab|autism|blind/i.test(also);
  const needsAssessment = !!also && UNASKED_GATE.test(also);
  if ((income === "under" || (gated && hasMedicaid)) && !needsDiagnosis && !needsAssessment) {
    return { tier: "likely", reason: withAlso(cap) };
  }
  // Income or Medicaid fits and the only open rule is an assessment (level
  // of care, daily help): still "worth checking", but calling is how the
  // assessment starts, so it can lead the plan.
  if ((income === "under" || (gated && hasMedicaid)) && needsAssessment && !needsDiagnosis) {
    return { tier: "check", reason: withAlso(cap), fitsButAssess: true };
  }
  if (cap) return { tier: "check", reason: withAlso(cap) };
  if (draftAge != null && ageOk == null) {
    return { tier: "check", reason: withAlso(`Starts at age ${draftAge}.`) };
  }
  return { tier: "check", reason: mainRule(p) || "We don't have enough to say more. It's worth a call." };
}

function pickFirstStep(list: Screened[], a: FinderAnswers): Screened | null {
  const helping = isHelpingSomeone(a);
  const wants = (re: RegExp | null, category?: BenefitCategory[]) => (s: Screened) =>
    (re ? re.test(s.raw.name) || re.test(s.raw.shortName || "") : true) && (!category || category.includes(s.category));

  const preferences: ((s: Screened) => boolean)[] = [];
  if (helping && a.caregiverNeeds.some((n) => n === "break" || n === "learn" || n === "talk")) {
    preferences.push(wants(null, ["caregiver"]));
  }
  if (a.needs.includes("urgent") || a.needs.includes("bills")) {
    preferences.push(wants(null, ["utilities"]), wants(null, ["food"]));
  }
  if (a.needs.includes("care") || a.needs.includes("memory")) {
    preferences.push(wants(PAYS_FOR_CARE));
  }
  if (a.needs.includes("health")) preferences.push(wants(MEDICARE_HELP));
  preferences.push(() => true);

  const withPhone = list.filter((s) => s.program.phone);
  const pool = withPhone.length ? withPhone : list;
  // The top preference is what they said would help most. If nothing there
  // is likely, a local benefits counselor is a better first call than a
  // long shot, so return null and let the caller lead with the agency.
  for (const pref of preferences.slice(0, -1)) {
    const likely = pool.find((s) => pref(s) && s.program.tier === "likely") ?? pool.find((s) => pref(s) && s.fitsButAssess);
    if (likely) return likely;
    if (pool.some(pref)) return null;
  }
  return pool.find((s) => s.program.tier === "likely") ?? null;
}

function agencyStep(agency: FinderAgency, a: FinderAnswers): FinderProgram {
  const v = finderVoice(a.who);
  return {
    id: "local-agency",
    stateId: "",
    name: agency.name,
    shortName: "Free benefits counseling",
    what: "A counselor at your local Area Agency on Aging can check every program with you and help with the applications. It's free.",
    tier: "likely",
    reason: `Nothing on the list is a clear fit yet for what ${v.subject === "you" ? "you" : v.subject} need${v.subject === "you" ? "" : "s"} most, so start with someone who can check them all.`,
    group: "care",
    icon: "helper",
    phone: agency.phone,
    phoneLabel: agency.name,
    hours: null,
    docs: ["A list of monthly income: Social Security, pensions, other payments", "Medicare and Medicaid cards, if any", "Recent bills you need help with"],
    url: agency.website || "",
  };
}

export async function buildFinderResult(db: SupabaseClient, a: FinderAnswers): Promise<FinderResult | null> {
  const stateCode = a.stateCode?.toUpperCase() || null;
  const stateSlug = stateCode ? getStateSlug(stateCode) : undefined;
  if (!stateCode || !stateSlug) return null;
  const stateName = US_STATES.find((s) => s.value === stateCode)?.label ?? stateCode;
  const helping = isHelpingSomeone(a);

  const [sbfRows, aaa] = await Promise.all([
    loadSbfEligibility(db, stateCode),
    findLocalAAA(db, stateCode, a.zip.length === 5 ? a.zip : null, a.county),
  ]);

  // Same program set as the /m plan: canonical ids, benefits only.
  const programs = getCanonicalProgramIds(stateSlug)
    .map((id) => getEnrichedProgram(stateSlug, id))
    .filter((p): p is WaiverProgram => !!p && p.programType === "benefit");

  const { kept: rankedKept, ruledOut } = rankProgramsForFamily(
    programs,
    (p) => ({
      name: p.name,
      ageRequirement: p.structuredEligibility?.ageRequirement,
      eligibilitySummary: p.structuredEligibility?.summary,
      incomeLimitSingle: incomeLimitFromTable(p.structuredEligibility?.incomeTable),
    }),
    sbfRows,
    factsFor(a, stateCode),
    stateName,
  );

  // Someone who already has Medicaid doesn't need the Medicaid application.
  const alreadyCovered = rankedKept.filter(({ item }) => a.medicaid === "alreadyHas" && isMedicaidDoor(item.name));
  const kept = rankedKept.filter((k) => !alreadyCovered.includes(k));

  const wanted = new Set(a.needs.flatMap((n) => NEED_CATEGORIES[n] || []));
  if (helping && a.caregiverNeeds.some((n) => n !== "ok")) wanted.add("caregiver");

  const screened: Screened[] = kept.map(({ item, verdict }, idx) => {
    const category = programCategory(item);
    const contact = pickCallContact(item.contacts);
    const { tier, reason, fitsButAssess = false } = tierAndReason(item, category, a);
    let score = verdict.boost - idx * 0.01;
    if (wanted.has(category)) score += 15;
    if (a.needs.includes("memory") && /alzheimer|dementia|memory|respite|adult day/i.test(item.name)) score += 10;
    const program: FinderProgram = {
      id: item.id,
      stateId: stateSlug,
      name: stripParen(item.name),
      shortName: item.shortName || stripParen(item.name),
      what: item.tagline || "",
      tier,
      reason,
      group: groupFor(category, helping),
      icon: iconFor(item, category),
      phone: contact?.phone || item.phone || null,
      phoneLabel: contact ? stripParen(contact.label) : null,
      hours: contact?.hours || null,
      docs: (item.documentsNeeded || []).slice(0, 4),
      url: `/benefits/${stateSlug}/${item.id}`,
    };
    return { program, category, score, raw: item, fitsButAssess };
  });

  // Likely before worth checking; within each, what they asked for first.
  screened.sort((x, y) => (x.program.tier === y.program.tier ? y.score - x.score : x.program.tier === "likely" ? -1 : 1));
  // The program data holds some programs twice under two ids (14 states on
  // 1 Oct, e.g. Alabama's E&D waiver, Idaho's caregiver support). Keep the
  // higher-ranked copy so a family never sees the same program twice.
  const seen = new Set<string>();
  const unique = screened.filter((s) => {
    const key = s.program.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(s.program.id) || seen.has(key)) return false;
    seen.add(s.program.id);
    seen.add(key);
    return true;
  });
  screened.splice(0, screened.length, ...unique);
  const first = pickFirstStep(screened, a);

  const leftOut: FinderLeftOut[] = [
    ...ruledOut.map(({ item, verdict }) => ({
      id: item.id,
      name: stripParen(item.name),
      reason: verdict.reason || "Not a match for what you told us.",
    })),
    ...alreadyCovered.map(({ item }) => ({ id: item.id, name: stripParen(item.name), reason: "Already has Medicaid" })),
  ];

  const agency: FinderAgency | null = aaa?.agency?.phone
    ? { name: aaa.agency.name, phone: aaa.agency.phone, website: aaa.agency.website ?? null }
    : null;
  const firstStep = first?.program ?? (agency ? agencyStep(agency, a) : screened[0]?.program ?? null);

  return {
    stateCode,
    stateName,
    firstStep,
    programs: screened.filter((s) => s.program !== firstStep).map((s) => s.program),
    leftOut,
    // When the agency is the first step it is not repeated below.
    agency: firstStep?.id === "local-agency" ? null : agency,
    urgent: a.needs.includes("urgent"),
  };
}
