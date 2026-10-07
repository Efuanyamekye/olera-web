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
import { draftMinAge, incomeLimitFromTable, requiresMedicaid, isWaiverPath } from "@/lib/benefits/eligibility.server";
import thresholds from "@/data/pipeline/federal-thresholds.json";
import { parseCut, cutAnswer } from "@/lib/benefits/cut";

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
  /** Who they live with. "couple": a spouse, and income and savings are the
   *  two of them together, judged against a program's couple limit.
   *  "family": with family other than a spouse (a parent living with their
   *  daughter). Individual programs (Medicaid, SSI, waivers) count only the
   *  person's own income, so they read as "alone"; programs that count the
   *  whole home's income (SNAP, energy help) can't be judged from it, so they
   *  stay "worth checking" (answer key, 6 Oct 2026: they read "likely" for
   *  parents in a household whose income disqualifies them). */
  household: "alone" | "couple" | "family" | null;
  /** A follow-up on an answered range, asked only when a program's limit
   *  falls inside it ("$1,796 or less?"): "under:1796" or "over:1796". The
   *  ranges are coarse on purpose (one tap), but Medicare Savings' $9,950
   *  savings limit sits inside "$2,000 to $10,000" and SSI's $994 inside
   *  "under $1,000", so without it those programs could never be settled
   *  (answer key, 7 Oct 2026: Medicare Savings "worth checking" 17 times
   *  where research says likely). */
  incomeCut?: string | null;
  savingsCut?: string | null;
}

export type FactKey = keyof KnownFacts;
/** Follow-ups whose dollar figure comes from the programs, not a fixed list. */
export const CUT_FACTS = ["incomeCut", "savingsCut"] as const;
export type CutFact = (typeof CUT_FACTS)[number];

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
  household: ["alone", "couple", "family"],
  // Dynamic: the figure is picked by nextQuestion (cutAnswer builds a value).
  incomeCut: [],
  savingsCut: [],
};

export { parseCut, cutAnswer };

/** A range narrowed by its follow-up: "or less" caps it at the figure, "more" starts just above. */
function narrowed([lo, hi]: [number, number], cut: string | null | undefined): [number, number] {
  const c = parseCut(cut);
  if (!c) return [lo, hi];
  return c.under ? [lo, Math.min(hi, c.at)] : [Math.max(lo, c.at + 1), hi];
}

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
  /** Limits for a couple, from the household-of-two row and the couple asset limit. */
  incomeLimitCouple: number | null;
  assetLimitCouple: number | null;
  /** Counts everyone in the home's income (SNAP, energy help), not the person's own. */
  countsHousehold: boolean;
  /** SNAP: an older household has no gross-income test (only a net test
   *  after medical and housing costs), and most states waive the savings
   *  test under 200% of the poverty line. Its limits can confirm a fit but
   *  never rule one out (answer key, 6 Oct 2026: Illinois' $4,500 asset
   *  figure ruled out a couple who qualifies). */
  limitsConfirmOnly: boolean;
  /** Its income limit can confirm a fit but not rule one out (federal SSI in
   *  a state that adds its own supplement). */
  incomeConfirmOnly?: boolean;
  medicaidGated: boolean;
  /** Says it has an income or savings limit we couldn't read as a number
   *  (Texas MEPD: "must meet income and resource limits"). It can't be
   *  "likely" on age alone; it stays worth checking. */
  unreadMeansTest: boolean;
  /** For people WITHOUT Medicaid (New York's EISEP, Pennsylvania's PACE drug
   *  program): having Medicaid rules it out. */
  notForMedicaid: boolean;
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
    assetLimits?: { individual?: number | null; couple?: number | null } | null;
    functionalRequirement?: string | null;
  } | null;
}

/** Programs whose income test counts the whole home, not the person's own. */
const HOUSEHOLD_PROGRAM = /\bsnap\b|food stamp|food (and nutrition|assistance)|nutrition assistance|calfresh|foodshare|3squares|basic food|liheap|\bheap\b|energy assistance|heating|fuel assistance|weatheriz|\bleap\b|\bceap\b|\bieap\b|\bwheap\b|crisis intervention/i;

const NOT_FOR_MEDICAID = /^\s*(not (eligible for|enrolled in|on)|ineligible for|does not qualify for) (full )?medicaid\b/i;
const SNAP_PROGRAM = /\bsnap\b|food stamp|food (and nutrition|assistance)|nutrition assistance|calfresh|foodshare|3squares|basic food/i;

/**
 * The federal ceiling of Medicare Savings' widest tier, QI: 135% of the
 * poverty line plus the $20 general income disregard, monthly, for one person
 * and a couple (48 states; Alaska and Hawaii are higher, so this stays a safe
 * floor there). A state may be more generous (New York), never stricter.
 * Florida's and California's tables held only the QMB row (about $1,350), and
 * once the conversation could ask "$1,350 or less?", a parent at $1,400 was
 * ruled out of a program research says she gets (answer key, 7 Oct 2026).
 */
const MSP_QI = (() => {
  const years = Object.keys(thresholds.fpl).sort();
  const [first, extra] = (thresholds.fpl as Record<string, Record<string, number[]>>)[years[years.length - 1]]["48"];
  const at = (annual: number) => Math.round((annual * 1.35) / 12 + 20);
  return { single: at(first), couple: at(first + extra) };
})();
/** A Medicare Savings program covering every tier, not one named tier (QMB only). */
const MSP_ALL_TIERS = /medicare savings|\bqi\b|\bqi-1\b/i;

/** A state's own add-on to SSI ("State SSI Supplement", California's SSP,
 *  North Carolina's Special Assistance). */
const STATE_SUPPLEMENT = /state (ssi )?supplement|ssi supplement|\bssp\b|special assistance|optional state supplement/i;
const FEDERAL_SSI = /^supplemental security income\b|^ssi\b/i;

/** Does a state's program list hold its own SSI supplement? Pass the result to rulesOf. */
export function hasStateSupplement(names: string[]): boolean {
  return names.some((n) => STATE_SUPPLEMENT.test(n));
}

/**
 * `stateSupplement`: the state adds its own payment to SSI, which raises SSI's
 * income limit above the federal $1,014 by an amount we don't hold (New York
 * adds $87 for someone living alone). There SSI's income limit can confirm a
 * fit but not rule one out (answer key, 7 Oct 2026: a New York widow at
 * $1,050 was ruled out of SSI she qualifies for).
 */
export function rulesOf(d: DraftLike, opts: { stateSupplement?: boolean } = {}): ProgramRules {
  const se = d.structuredEligibility || {};
  const text = [se.ageRequirement, ...(se.summary || [])].filter(Boolean).join(" ");
  const fn = se.functionalRequirement || "";
  const lots = /nursing (facility|home)[- ]level|level of care|\bNF ?LOC\b|nursing facility|institutional/i;
  const some = /daily (activities|living|tasks)|\bADLs?\b|bathing|dressing|toileting|eating|transferring|mobility|prepare meals|homebound|personal care/i;
  const assets = se.assetLimits?.individual;
  const coupleAssets = se.assetLimits?.couple;
  const coupleRows = (se.incomeTable || []).filter((r) => r.householdSize === 2 && r.monthlyLimit > 0);
  let incomeLimit = incomeLimitFromTable(se.incomeTable);
  let incomeLimitCouple = coupleRows.length ? Math.max(...coupleRows.map((r) => r.monthlyLimit)) : null;
  if (MSP_ALL_TIERS.test(d.name) && incomeLimit != null) {
    incomeLimit = Math.max(incomeLimit, MSP_QI.single);
    incomeLimitCouple = Math.max(incomeLimitCouple ?? 0, MSP_QI.couple);
  }
  return {
    id: d.id,
    name: d.name,
    // The finder's own parse: an age text with any other pathway ("60+ (18+
    // with verified dementia diagnosis)", Florida's ADI) yields no floor, so
    // it never rules anyone out. A local fallback here once read 60 from it
    // and excluded an under-60 person with dementia, the audience this is for.
    minAge: draftMinAge(se.ageRequirement),
    disabilityPathway: /disab|blind|18\s*[-–]\s*(59|64)/i.test(text),
    incomeLimit,
    assetLimit: typeof assets === "number" && assets > 0 ? assets : null,
    incomeLimitCouple,
    assetLimitCouple: typeof coupleAssets === "number" && coupleAssets > 0 ? coupleAssets : null,
    countsHousehold: HOUSEHOLD_PROGRAM.test(d.name),
    incomeConfirmOnly: !!opts.stateSupplement && FEDERAL_SSI.test(d.name),
    limitsConfirmOnly: SNAP_PROGRAM.test(d.name),
    // Regular Medicaid and SSI-type cash only: a care waiver or the VA
    // pension is "likely" on its other rules by design (their limits net out
    // care costs, so a number would rule out families who qualify).
    unreadMeansTest:
      /medicaid|medical assistance|medi-cal|mainecare|husky|\bssi\b|supplemental security|state supplement/i.test(d.name) &&
      !isWaiverPath(d.name) &&
      incomeLimitFromTable(se.incomeTable) == null &&
      !(typeof assets === "number" && assets > 0) &&
      (se.summary || []).some((x) => /\b(income|resource|asset)s?\b[^.]*\blimit|\blimits?\b[^.]*\b(income|resource|asset)/i.test(x) && !/\bno (income|asset|resource)/i.test(x)),
    // Not Medicare Savings Programs, whose summaries say "not eligible for
    // full Medicaid" although most people on full Medicaid also hold one.
    notForMedicaid: !/medicare savings|\bqmb\b|\bslmb\b|healthy horizons/i.test(d.name) && (se.summary || []).some((x) => NOT_FOR_MEDICAID.test(x)),
    // A care waiver is a way into Medicaid (isWaiverPath), so not having
    // Medicaid yet never rules it out; income and savings do.
    medicaidGated: requiresMedicaid(d.name, se.summary) && !isWaiverPath(d.name),
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

/**
 * An income or savings band against a program's limits. A couple answers for
 * the two of them and is judged against the couple limit; anyone else against
 * the one-person limit. Under the one-person limit is under a couple's too,
 * so that passes whatever the household. A program that counts the whole
 * home can't be judged for someone living with family. `atLimit` makes the
 * band's floor fail when it equals the limit (savings bands start at it).
 */
function within([lo, hi]: [number, number], single: number | null, couple: number | null, r: ProgramRules, f: KnownFacts, atLimit: boolean, confirmOnly = false): Tri {
  // The home's income counts, so the person's own says nothing until we know
  // they live alone or with only a spouse.
  if (r.countsHousehold && (f.household === "family" || f.household == null)) return "unknown";
  if (single != null && hi <= single) return "pass";
  const limit = f.household === "couple" ? couple : f.household === "alone" || f.household === "family" ? single : null;
  if (limit == null) return "unknown";
  if (hi <= limit) return "pass";
  if (r.limitsConfirmOnly || confirmOnly) return "unknown";
  return lo > limit || (atLimit && lo >= limit) ? "fail" : "unknown";
}

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
  if (r.incomeLimit != null || r.incomeLimitCouple != null) {
    out.push({ rule: "income", result: f.income ? within(narrowed(INCOME_RANGE[f.income], f.incomeCut), r.incomeLimit, r.incomeLimitCouple, r, f, false, r.incomeConfirmOnly) : "unknown" });
  }
  if (r.assetLimit != null || r.assetLimitCouple != null) {
    out.push({ rule: "savings", result: f.savings ? within(narrowed(SAVINGS_RANGE[f.savings], f.savingsCut), r.assetLimit, r.assetLimitCouple, r, f, true) : "unknown" });
  }
  // A whole-home program is only "likely" once we know the home is just them
  // (or them and a spouse); Ohio's SNAP holds only an age rule and read
  // likely for a parent living with her daughter's family.
  if (r.countsHousehold) out.push({ rule: "household", result: f.household === "alone" || f.household === "couple" ? "pass" : "unknown" });
  // A whole-home program is means-tested; with no limit we can read it can't
  // be "likely" on age and household alone (Ohio SNAP holds only an age rule).
  if (r.unreadMeansTest || (r.countsHousehold && r.incomeLimit == null && r.incomeLimitCouple == null)) out.push({ rule: "income", result: "unknown" });
  if (r.notForMedicaid) out.push({ rule: "notMedicaid", result: f.medicaid === "has" ? "fail" : "unknown" });
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
  /** For a follow-up (incomeCut, savingsCut): the dollar figure to ask about. */
  at?: number;
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
  for (const c of cutCandidates(programs, f, now, weight, opts.asked)) {
    const settles = c.settles * (1 - (opts.priors?.notSure?.[c.fact] ?? 0));
    if (settles > 0 && (!best || settles > best.settles)) best = { ...c, settles };
  }
  for (const fact of Object.keys(ANSWERS) as FactKey[]) {
    if ((CUT_FACTS as readonly string[]).includes(fact)) continue;
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
 * Each follow-up worth asking: for an answered income or savings range, every
 * limit of a still-undecided program that falls strictly inside it, scored
 * like any other question (an even chance of each side). Asked at most once
 * per range, and never when the range was "not sure".
 */
function cutCandidates(
  programs: ProgramRules[],
  f: KnownFacts,
  now: Status[],
  weight: (r: ProgramRules) => number,
  asked: ReadonlySet<FactKey> | undefined,
): NextQuestion[] {
  const out: NextQuestion[] = [];
  const kinds: { fact: CutFact; range: [number, number] | null; limits: (r: ProgramRules) => (number | null)[] }[] = [
    { fact: "incomeCut", range: f.income ? INCOME_RANGE[f.income] : null, limits: (r) => [r.incomeLimit, f.household === "couple" ? r.incomeLimitCouple : null] },
    { fact: "savingsCut", range: f.savings ? SAVINGS_RANGE[f.savings] : null, limits: (r) => [r.assetLimit, f.household === "couple" ? r.assetLimitCouple : null] },
  ];
  for (const k of kinds) {
    if (!k.range || f[k.fact] != null || asked?.has(k.fact)) continue;
    const [lo, hi] = k.range;
    const figures = new Set<number>();
    programs.forEach((r, i) => {
      if (now[i] !== "check") return;
      for (const l of k.limits(r)) if (l != null && l > lo && l < hi) figures.add(Math.round(l));
    });
    for (const at of figures) {
      let total = 0;
      const touched = new Set<string>();
      for (const under of [true, false]) {
        const g = { ...f, [k.fact]: cutAnswer(at, under) } as KnownFacts;
        programs.forEach((r, i) => {
          if (now[i] !== "check") return;
          if (statusOf(r, g) !== "check") { total += 0.5 * weight(r); touched.add(r.name); }
        });
      }
      if (total > 0) out.push({ fact: k.fact, at, settles: total, turnsOn: [...touched] });
    }
  }
  return out;
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
    household: { alone: 45, couple: 35, family: 20 },
  },
  // Follow-ups: someone who picked a range may not know which side of a
  // figure inside it they're on, savings more often than income (assumed).
  notSure: { age: 0.02, income: 0.15, medicaid: 0.18, veteran: 0.02, dailyHelp: 0.05, savings: 0.3, disability: 0.1, household: 0.01, incomeCut: 0.2, savingsCut: 0.35 },
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
  let n = new Set(cutCandidates(programs, f, now, () => 1, asked).map((c) => c.fact)).size;
  for (const fact of Object.keys(ANSWERS) as FactKey[]) {
    if ((CUT_FACTS as readonly string[]).includes(fact)) continue;
    if (f[fact] != null || asked.has(fact)) continue;
    const moves = (ANSWERS[fact] as string[]).some((a) => {
      const g = { ...f, [fact]: a } as KnownFacts;
      return programs.some((r, i) => now[i] === "check" && statusOf(r, g) !== "check");
    });
    if (moves) n++;
  }
  return n;
}
