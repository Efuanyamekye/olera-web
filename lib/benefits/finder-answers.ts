/**
 * The full finder's questions and answers (/benefits/finder, redesigned
 * 2026-09-30). Isomorphic: the quiz, the results page and the match route
 * all read this file.
 *
 * Order and wording follow the research behind the redesign:
 *   - "Who is this for" goes first. It is the easiest answer and it rewords
 *     every question after it (the old finder asked "Do you have Medicaid"
 *     of a caregiver filling it in for a parent).
 *   - Caregivers get one question about their own needs.
 *   - Household size comes before income, so the income question can ask
 *     for the whole household, and ranges replace exact amounts.
 *   - Every question has a way to say "not sure".
 */

import type { AgeBand } from "@/lib/benefits/age";
import type { MedicaidStatus } from "@/lib/types/benefits";

export type FinderWho = "me" | "parent" | "spouse" | "other";
export type FinderAgeAnswer = Extract<AgeBand, "under_60" | "60_64" | "65_74" | "75_84" | "85_plus"> | "unsure";
export type FinderNeed = "urgent" | "bills" | "care" | "memory" | "health";
export type FinderCaregiverNeed = "break" | "paid" | "learn" | "talk" | "ok";
export type FinderHousehold = "1" | "2" | "3";
export type FinderIncome = "under1000" | "under1500" | "under2500" | "under4000" | "over4000" | "unsure";
export type FinderVeteran = "yes" | "spouse" | "no" | "unsure";

export interface FinderAnswers {
  who: FinderWho | null;
  zip: string;
  stateCode: string | null;
  county: string | null;
  /** "San Antonio, TX", shown back to the family. */
  place: string | null;
  age: FinderAgeAnswer | null;
  needs: FinderNeed[];
  caregiverNeeds: FinderCaregiverNeed[];
  household: FinderHousehold | null;
  income: FinderIncome | null;
  medicaid: MedicaidStatus | null;
  veteran: FinderVeteran | null;
  /** From the benefits conversation only (5 Oct 2026); the nine-question
   *  finder never asks these. Daily-help and savings rules settle most care
   *  programs, so the plan reads them when present. */
  dailyHelp?: "none" | "some" | "lots" | null;
  savings?: "under2000" | "under10000" | "over10000" | null;
  /** The conversation's follow-ups on those ranges ("under:1796"), when it
   *  asked one (question-engine parseCut). */
  incomeCut?: string | null;
  savingsCut?: string | null;
}

export function emptyFinderAnswers(): FinderAnswers {
  return {
    who: null,
    zip: "",
    stateCode: null,
    county: null,
    place: null,
    age: null,
    needs: [],
    caregiverNeeds: [],
    household: null,
    income: null,
    medicaid: null,
    veteran: null,
  };
}

export type FinderStep =
  | "who"
  | "zip"
  | "age"
  | "needs"
  | "caregiver"
  | "household"
  | "income"
  | "medicaid"
  | "veteran";

export const isHelpingSomeone = (a: Pick<FinderAnswers, "who">) => !!a.who && a.who !== "me";

/** The steps this family sees, in order. The caregiver step only appears
 *  when they are filling it in for someone else. */
export function finderSteps(a: Pick<FinderAnswers, "who">): FinderStep[] {
  const steps: FinderStep[] = ["who", "zip", "age", "needs", "caregiver", "household", "income", "medicaid", "veteran"];
  return isHelpingSomeone(a) ? steps : steps.filter((s) => s !== "caregiver");
}

export function isStepAnswered(step: FinderStep, a: FinderAnswers): boolean {
  switch (step) {
    case "who": return !!a.who;
    case "zip": return !!a.stateCode;
    case "age": return !!a.age;
    case "needs": return a.needs.length > 0;
    case "caregiver": return a.caregiverNeeds.length > 0;
    case "household": return !!a.household;
    case "income": return !!a.income;
    case "medicaid": return !!a.medicaid;
    case "veteran": return !!a.veteran;
  }
}

// ── Wording ────────────────────────────────────────────────────────────────

export interface FinderVoice {
  /** "you" / "your parent" */
  subject: string;
  /** "your" / "their" */
  possessive: string;
  /** "are" / "is" */
  be: string;
  /** "Do you" / "Does your parent" */
  doQ: string;
  /** "Did you" / "Did your parent" */
  didQ: string;
  /** "for myself" / "for my parent", used in the call script */
  callFor: string;
  /** "you" / "your parent", used in "Plan for …" */
  planFor: string;
}

export function finderVoice(who: FinderWho | null): FinderVoice {
  switch (who) {
    case "parent":
      return { subject: "your parent", possessive: "their", be: "is", doQ: "Does your parent", didQ: "Did your parent", callFor: "for my parent", planFor: "your parent" };
    case "spouse":
      return { subject: "your spouse", possessive: "their", be: "is", doQ: "Does your spouse", didQ: "Did your spouse", callFor: "for my spouse", planFor: "your spouse" };
    case "other":
      return { subject: "the person you help", possessive: "their", be: "is", doQ: "Does the person you help", didQ: "Did the person you help", callFor: "for a family member", planFor: "the person you help" };
    default:
      return { subject: "you", possessive: "your", be: "are", doQ: "Do you", didQ: "Did you", callFor: "for myself", planFor: "you" };
  }
}

export interface FinderOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export const WHO_OPTIONS: FinderOption<FinderWho>[] = [
  { value: "me", label: "Myself" },
  { value: "parent", label: "My parent" },
  { value: "spouse", label: "My spouse or partner" },
  { value: "other", label: "Someone else" },
];

export const AGE_OPTIONS: FinderOption<FinderAgeAnswer>[] = [
  { value: "under_60", label: "Under 60" },
  { value: "60_64", label: "60 to 64" },
  { value: "65_74", label: "65 to 74" },
  { value: "75_84", label: "75 to 84" },
  { value: "85_plus", label: "85 or older" },
  { value: "unsure", label: "Not sure" },
];

export const NEED_OPTIONS: FinderOption<FinderNeed>[] = [
  { value: "urgent", label: "Something urgent today", hint: "Shutoff notice, no heat or AC, no food" },
  { value: "bills", label: "Bills: food, power, rent" },
  { value: "care", label: "Paying for care at home", hint: "Help with bathing, meals, getting around" },
  { value: "memory", label: "Memory loss or dementia" },
  { value: "health", label: "Medicare and health costs", hint: "Premiums, prescriptions" },
];

export const CAREGIVER_OPTIONS: FinderOption<FinderCaregiverNeed>[] = [
  { value: "break", label: "A break from caregiving", hint: "Respite, adult day care" },
  { value: "paid", label: "Getting paid to care" },
  { value: "learn", label: "Learning what to expect", hint: "Dementia, care skills" },
  { value: "talk", label: "Someone to talk to", hint: "Support groups, counseling" },
  { value: "ok", label: "I'm OK for now" },
];

export function householdOptions(who: FinderWho | null): FinderOption<FinderHousehold>[] {
  const self = who === "me" || !who;
  return [
    { value: "1", label: self ? "Just me" : "Just them" },
    { value: "2", label: self ? "Me and a spouse or partner" : "Them and a spouse or partner" },
    { value: "3", label: "Three or more people" },
  ];
}

export const INCOME_OPTIONS: FinderOption<FinderIncome>[] = [
  { value: "under1000", label: "Under $1,000" },
  { value: "under1500", label: "$1,000 to $1,500" },
  { value: "under2500", label: "$1,500 to $2,500" },
  { value: "under4000", label: "$2,500 to $4,000" },
  { value: "over4000", label: "Over $4,000" },
  { value: "unsure", label: "Not sure" },
];

export const MEDICAID_OPTIONS: FinderOption<MedicaidStatus>[] = [
  { value: "alreadyHas", label: "Yes" },
  { value: "applying", label: "Applied, waiting to hear" },
  { value: "denied", label: "Applied and was turned down" },
  { value: "doesNotHave", label: "No" },
  { value: "notSure", label: "Not sure" },
];

export function veteranOptions(who: FinderWho | null): FinderOption<FinderVeteran>[] {
  const self = who === "me" || !who;
  return [
    { value: "yes", label: "Yes" },
    { value: "spouse", label: self ? "No, but my late spouse did" : "No, but their spouse did" },
    { value: "no", label: "No" },
    { value: "unsure", label: "Not sure" },
  ];
}

export const STEP_LABELS: Record<FinderStep, string> = {
  who: "Who",
  zip: "Location",
  age: "Age",
  needs: "Needs",
  caregiver: "For you",
  household: "Household",
  income: "Income",
  medicaid: "Medicaid",
  veteran: "Veteran",
};

/** The answer as the family would say it back, for the side rail. */
export function answerLabel(step: FinderStep, a: FinderAnswers): string | null {
  const pick = <T extends string>(opts: FinderOption<T>[], v: T | null) => opts.find((o) => o.value === v)?.label ?? null;
  const many = <T extends string>(opts: FinderOption<T>[], vs: T[]) =>
    vs.length ? vs.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ") : null;
  switch (step) {
    case "who": return pick(WHO_OPTIONS, a.who);
    case "zip": return a.place || (a.zip.length === 5 ? a.zip : null);
    case "age": return pick(AGE_OPTIONS, a.age);
    case "needs": return many(NEED_OPTIONS, a.needs);
    case "caregiver": return many(CAREGIVER_OPTIONS, a.caregiverNeeds);
    case "household": return pick(householdOptions(a.who), a.household);
    case "income": return pick(INCOME_OPTIONS, a.income);
    case "medicaid": return pick(MEDICAID_OPTIONS, a.medicaid);
    case "veteran": return pick(veteranOptions(a.who), a.veteran);
  }
}

// ── Results ────────────────────────────────────────────────────────────────

export type FinderTier = "likely" | "check";

/** Which glyph a program row shows (components/benefits/finder/FinderIcon). */
export type FinderIconName =
  | "phone"
  | "caregiver"
  | "medicare"
  | "energy"
  | "home"
  | "groceries"
  | "meals"
  | "weather"
  | "clinic"
  | "helper"
  | "docs"
  | "money";
export type FinderGroup = "care" | "bills" | "you";

export interface FinderProgram {
  id: string;
  stateId: string;
  name: string;
  shortName: string;
  /** One line on what it does, from the program page. */
  what: string;
  tier: FinderTier;
  /** Why it is on the list, in the family's terms. */
  reason: string;
  group: FinderGroup;
  icon: FinderIconName;
  phone: string | null;
  phoneLabel: string | null;
  hours: string | null;
  /** Up to four items from the program's own document list. */
  docs: string[];
  /** /benefits/<state>/<id> */
  url: string;
  /** Needs Medicaid first and the family hasn't said they have it, so the
   *  call script asks to start the Medicaid application on the same call. */
  needsMedicaid?: boolean;
}

export interface FinderLeftOut {
  id: string;
  name: string;
  reason: string;
}

export interface FinderAgency {
  name: string;
  phone: string;
  website: string | null;
}

export interface FinderResult {
  stateCode: string;
  stateName: string;
  firstStep: FinderProgram | null;
  programs: FinderProgram[];
  leftOut: FinderLeftOut[];
  agency: FinderAgency | null;
  urgent: boolean;
}

// ── Saving the plan (/api/benefits/save-results) ───────────────────────────

/** The care-need bucket the plan page, letters and companion read. */
export function careNeedFromFinder(a: FinderAnswers): "stayingAtHome" | "payingForCare" | "memoryHealth" | "companionship" {
  if (a.needs.includes("memory")) return "memoryHealth";
  if (a.needs.includes("care")) return "stayingAtHome";
  return "payingForCare";
}

export function relationshipFromFinder(who: FinderWho | null): "myself" | "my-parent" | "my-spouse" | "other-family" | undefined {
  switch (who) {
    case "me": return "myself";
    case "parent": return "my-parent";
    case "spouse": return "my-spouse";
    case "other": return "other-family";
    default: return undefined;
  }
}

/** save-results stores the card's four income bands. */
export function incomeRangeFromFinder(i: FinderIncome | null): "under1500" | "under2500" | "under4000" | "over4000" | "preferNotToSay" | null {
  switch (i) {
    case "under1000":
    case "under1500": return "under1500";
    case "under2500": return "under2500";
    case "under4000": return "under4000";
    case "over4000": return "over4000";
    case "unsure": return "preferNotToSay";
    default: return null;
  }
}
