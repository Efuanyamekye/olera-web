/**
 * The question engine (Phase 3 of the benefits caseworker, started 5 Oct 2026).
 *
 * Given what we know about a family and a state's programs, which question
 * would settle the most programs? The finder asks nine fixed questions and
 * never asks about daily help, savings or disability, though those decide
 * most care programs: 241 of 469 benefit drafts carry a daily-help rule and
 * 205 an asset limit. Here the rules choose the next question and the model
 * only words it.
 *
 * Pure: no database, no model. Eligibility stays in code (the founding
 * principle "hard eligibility lives in code"), and every question it picks
 * can be traced to the rules it would settle.
 *
 * Conservative like the finder engine: only a fact the family gave can rule a
 * program out, and "not sure" is always an answer that settles nothing.
 */
import { draftMinAge, incomeLimitFromTable, medicaidGatedName, isWaiverPath } from "@/lib/benefits/eligibility.server";

export type DailyHelp = "none" | "some" | "lots";
export type Savings = "under2000" | "under10000" | "over10000";
export type AgeBucket = "under_60" | "60_64" | "65_74" | "75_84" | "85_plus";
export type IncomeBucket = "under1000" | "under1500" | "under2500" | "under4000" | "over4000";

/** What we hold about the person who needs care. null = not asked or "not sure". */
export interface KnownFacts {
  age: AgeBucket | null;
  income: IncomeBucket | null;
  medicaid: "has" | "no" | null;
  veteran: "yes" | "no" | null;
  dailyHelp: DailyHelp | null;
  savings: Savings | null;
  disability: "yes" | "no" | null;
  /** "couple" when a spouse lives with them. Income and savings limits here
   *  are one-person figures, so they rule a program out only for someone we
   *  know lives alone (stricter than the finder, which also uses them when
   *  household is unknown; the finder always asks it). */
  household: "alone" | "couple" | null;
}

export type FactKey = keyof KnownFacts;

export const EMPTY_FACTS: KnownFacts = { age: null, income: null, medicaid: null, veteran: null, dailyHelp: null, savings: null, disability: null, household: null };

/** The answers each question offers ("not sure" is always added in the UI). */
export const ANSWERS: { [K in FactKey]: NonNullable<KnownFacts[K]>[] } = {
  age: ["under_60", "60_64", "65_74", "75_84", "85_plus"],
  income: ["under1000", "under1500", "under2500", "under4000", "over4000"],
  medicaid: ["has", "no"],
  veteran: ["yes", "no"],
  dailyHelp: ["none", "some", "lots"],
  savings: ["under2000", "under10000", "over10000"],
  disability: ["yes", "no"],
  household: ["alone", "couple"],
};

const AGE_RANGE: Record<AgeBucket, [number, number]> = { under_60: [0, 59], "60_64": [60, 64], "65_74": [65, 74], "75_84": [75, 84], "85_plus": [85, 120] };
// Read as today's quiz labels them ("$1,000 to $1,500"). The finder's rule-out
// table floors under1500 at 0 because answers saved before the 30 Sep 2026
// redesign used the same code for "under $1,500"; never pass one of those here.
const INCOME_RANGE: Record<IncomeBucket, [number, number]> = { under1000: [0, 1000], under1500: [1000, 1500], under2500: [1500, 2500], under4000: [2500, 4000], over4000: [4000, Infinity] };
const SAVINGS_RANGE: Record<Savings, [number, number]> = { under2000: [0, 2000], under10000: [2000, 10000], over10000: [10000, Infinity] };

/** The rules a program holds, read from its fact-checked draft. */
export interface ProgramRules {
  id: string;
  name: string;
  minAge: number | null;
  /** A disability pathway lets a younger person in ("65+ or 18-64 with a disability"). */
  disabilityPathway: boolean;
  incomeLimit: number | null;
  assetLimit: number | null;
  medicaidGated: boolean;
  veteranOnly: boolean;
  /** "lots" = nursing-facility level of care; "some" = help with daily activities. */
  dailyHelp: "some" | "lots" | null;
}

export interface DraftLike {
  id: string;
  name: string;
  structuredEligibility?: {
    summary?: string[] | null;
    ageRequirement?: string | null;
    incomeTable?: { householdSize: number; monthlyLimit: number }[] | null;
    assetLimits?: { individual?: number | null } | null;
    functionalRequirement?: string | null;
  } | null;
}

export function rulesOf(d: DraftLike): ProgramRules {
  const se = d.structuredEligibility || {};
  const text = [se.ageRequirement, ...(se.summary || [])].filter(Boolean).join(" ");
  const fn = se.functionalRequirement || "";
  const lots = /nursing (facility|home)[- ]level|level of care|\bNF ?LOC\b|nursing facility|institutional/i;
  const some = /daily (activities|living|tasks)|\bADLs?\b|bathing|dressing|toileting|eating|transferring|mobility|prepare meals|homebound|personal care/i;
  const assets = se.assetLimits?.individual;
  return {
    id: d.id,
    name: d.name,
    // The finder's own parse: an age text with any other pathway ("60+ (18+
    // with verified dementia diagnosis)", Florida's ADI) yields no floor, so
    // it never rules anyone out. A local fallback here once read 60 from it
    // and excluded an under-60 person with dementia, the audience this is for.
    minAge: draftMinAge(se.ageRequirement),
    disabilityPathway: /disab|blind|18\s*[-–]\s*(59|64)/i.test(text),
    incomeLimit: incomeLimitFromTable(se.incomeTable),
    assetLimit: typeof assets === "number" && assets > 0 ? assets : null,
    // A care waiver is a way into Medicaid (isWaiverPath), so not having
    // Medicaid yet never rules it out; income and savings do.
    medicaidGated: medicaidGatedName(d.name) && !isWaiverPath(d.name),
    veteranOnly: /\bveteran|\bVA\b/.test(d.name),
    dailyHelp: /no functional (requirement|criteria|assessment)|no (daily[- ]help|functional) (is )?required/i.test(fn)
      ? null
      : lots.test(fn) && !/level of care (is )?not required|not (require|need)[^.]{0,30}level of care/i.test(fn)
        ? "lots"
        : some.test(fn) ? "some" : null,
  };
}

export type Status = "likely" | "check" | "out";
type Tri = "pass" | "fail" | "unknown";

/** Each rule against the facts: pass, fail, or unknown. */
function checks(r: ProgramRules, f: KnownFacts): { rule: string; result: Tri }[] {
  const out: { rule: string; result: Tri }[] = [];
  if (r.minAge != null) {
    let res: Tri = "unknown";
    if (f.age) {
      const [lo, hi] = AGE_RANGE[f.age];
      if (lo >= r.minAge) res = "pass";
      else if (hi < r.minAge) res = r.disabilityPathway ? (f.disability === "yes" ? "pass" : f.disability === "no" ? "fail" : "unknown") : "fail";
    }
    out.push({ rule: "age", result: res });
  }
  if (r.incomeLimit != null) {
    let res: Tri = "unknown";
    // Under the one-person limit is under a couple's too, so it passes either
    // way; over it rules out only someone we know lives alone.
    if (f.income) { const [lo, hi] = INCOME_RANGE[f.income]; if (hi <= r.incomeLimit) res = "pass"; else if (lo > r.incomeLimit && f.household === "alone") res = "fail"; }
    out.push({ rule: "income", result: res });
  }
  if (r.assetLimit != null) {
    let res: Tri = "unknown";
    if (f.savings) { const [lo, hi] = SAVINGS_RANGE[f.savings]; if (hi <= r.assetLimit) res = "pass"; else if (lo >= r.assetLimit && f.household === "alone") res = "fail"; }
    out.push({ rule: "savings", result: res });
  }
  if (r.medicaidGated) out.push({ rule: "medicaid", result: f.medicaid === "has" ? "pass" : f.medicaid === "no" ? "fail" : "unknown" });
  if (r.veteranOnly) out.push({ rule: "veteran", result: f.veteran === "yes" ? "pass" : f.veteran === "no" ? "fail" : "unknown" });
  if (r.dailyHelp) {
    let res: Tri = "unknown";
    if (f.dailyHelp === "none") res = "fail";
    else if (f.dailyHelp === "lots") res = "pass";
    // "Some help" meets an ADL rule; against nursing-facility level of care it
    // stays for the state's assessment to decide, never ruled out by us.
    else if (f.dailyHelp === "some") res = r.dailyHelp === "some" ? "pass" : "unknown";
    out.push({ rule: "dailyHelp", result: res });
  }
  return out;
}

export function statusOf(r: ProgramRules, f: KnownFacts): Status {
  const c = checks(r, f);
  if (c.some((x) => x.result === "fail")) return "out";
  // A program with no rule we can read is unknown, not a fit: "likely" needs
  // at least one rule met. (Weatherization with no parsed rule read "likely"
  // before a single answer, found building the first mock on 5 Oct 2026.)
  if (c.length && c.every((x) => x.result === "pass")) return "likely";
  return "check";
}

export interface NextQuestion {
  fact: FactKey;
  /** Average number of programs one answer settles (moves out of "check"). */
  settles: number;
  /** The programs whose status this question can change, for the "why I'm asking" line. */
  turnsOn: string[];
}

/**
 * How likely each answer is, and how often families say "not sure". Defaults
 * are even with no "not sure"; a caller passes real rates when it has them.
 */
export interface AnswerPriors {
  weights?: { [K in FactKey]?: Partial<Record<NonNullable<KnownFacts[K]>, number>> };
  notSure?: Partial<Record<FactKey, number>>;
}

/**
 * The unknown fact that settles the most programs, in expectation over its
 * answers and discounted by how often families can't answer it. Facts already
 * asked (answered or "not sure") are never asked again. Null when no
 * remaining question would change any program: stop asking.
 * `weight` lets a caller count a program more (e.g. one that pays for care).
 */
export function nextQuestion(
  programs: ProgramRules[],
  f: KnownFacts,
  weight: (r: ProgramRules) => number = () => 1,
  opts: { asked?: ReadonlySet<FactKey>; priors?: AnswerPriors } = {},
): NextQuestion | null {
  const now = programs.map((r) => statusOf(r, f));
  let best: NextQuestion | null = null;
  for (const fact of Object.keys(ANSWERS) as FactKey[]) {
    if (f[fact] != null || opts.asked?.has(fact)) continue;
    const answers = ANSWERS[fact] as string[];
    const w = (opts.priors?.weights?.[fact] || {}) as Record<string, number>;
    const sum = answers.reduce((x, a) => x + (w[a] ?? 1), 0);
    let total = 0;
    const touched = new Set<string>();
    for (const a of answers) {
      const pa = (w[a] ?? 1) / sum;
      const g = { ...f, [fact]: a } as KnownFacts;
      programs.forEach((r, i) => {
        if (now[i] !== "check") return;
        if (statusOf(r, g) !== "check") { total += pa * weight(r); touched.add(r.name); }
      });
    }
    const settles = total * (1 - (opts.priors?.notSure?.[fact] ?? 0));
    if (settles > 0 && (!best || settles > best.settles)) best = { fact, settles, turnsOn: [...touched] };
  }
  return best;
}

/**
 * Answer mix and "not sure" rates for weighing questions. Income, Medicaid
 * and veteran are real (the 75 families who used the finder before the 30 Sep
 * 2026 redesign); daily help, savings, disability and household are assumed.
 */
export const DEFAULT_PRIORS: AnswerPriors = {
  weights: {
    age: { under_60: 5, "60_64": 8, "65_74": 30, "75_84": 35, "85_plus": 22 },
    income: { under1000: 20, under1500: 23, under2500: 28, under4000: 9, over4000: 6 },
    medicaid: { has: 32, no: 49 },
    veteran: { yes: 5, no: 93 },
    dailyHelp: { none: 25, some: 40, lots: 35 },
    savings: { under2000: 40, under10000: 30, over10000: 30 },
    disability: { yes: 30, no: 70 },
    household: { alone: 60, couple: 40 },
  },
  notSure: { age: 0.02, income: 0.15, medicaid: 0.18, veteran: 0.02, dailyHelp: 0.05, savings: 0.3, disability: 0.1, household: 0.01 },
};

/** Status plus the rules behind it, for the one-line reason on each program. */
export function explain(r: ProgramRules, f: KnownFacts): { status: Status; failed: string[]; met: string[] } {
  const c = checks(r, f);
  return { status: statusOf(r, f), failed: c.filter((x) => x.result === "fail").map((x) => x.rule), met: c.filter((x) => x.result === "pass").map((x) => x.rule) };
}

/** How many more questions could still change a program: an upper bound on
 *  what the conversation has left to ask, for its "about N left" line. */
export function questionsLeft(programs: ProgramRules[], f: KnownFacts, asked: ReadonlySet<FactKey>): number {
  const now = programs.map((r) => statusOf(r, f));
  let n = 0;
  for (const fact of Object.keys(ANSWERS) as FactKey[]) {
    if (f[fact] != null || asked.has(fact)) continue;
    const moves = (ANSWERS[fact] as string[]).some((a) => {
      const g = { ...f, [fact]: a } as KnownFacts;
      return programs.some((r, i) => now[i] === "check" && statusOf(r, g) !== "check");
    });
    if (moves) n++;
  }
  return n;
}
