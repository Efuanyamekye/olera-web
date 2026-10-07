/**
 * Simulate families through the question engine against the nine-question
 * finder form, with "not sure" answers.
 *
 * Families are sampled per state from an answer mix. Income, Medicaid and
 * veteran mixes and "not sure" rates are real: the 75 families who used the
 * finder before the 30 Sep 2026 redesign (income declined 15%, Medicaid not
 * sure or applying 18%, veteran declined 2%). The finder has never asked
 * about savings, daily help or disability, so those are ASSUMED and the
 * savings "not sure" rate is swept, since it is the largest unknown.
 *
 * A "not sure" leaves the fact unknown and the engine never asks it again.
 * The run throws if the engine rules out a program the family's true answers
 * keep, which must never happen.
 *
 *   npx -y tsx@4 scripts/question-engine-sim.ts
 */
import { rulesOf, hasStateSupplement, cutAnswer, CUT_FACTS, statusOf, nextQuestion, EMPTY_FACTS, ANSWERS, type KnownFacts, type FactKey, type AnswerPriors } from "@/lib/benefits/question-engine";
import { getEnrichedProgram, getPlanProgramIds, getStateSlug } from "@/lib/program-data";
import { US_STATES } from "@/lib/us-states";

const perState: Record<string, ReturnType<typeof rulesOf>[]> = {};
for (const s of US_STATES) {
  const slug = getStateSlug(s.value);
  if (!slug) continue;
  const drafts = getPlanProgramIds(slug)
    .map((id) => getEnrichedProgram(slug, id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.programType === "benefit");
  const stateSupplement = hasStateSupplement(drafts.map((d) => d.name));
  perState[s.value] = drafts.map((d) => rulesOf(d as Parameters<typeof rulesOf>[0], { stateSupplement }));
}

const MIX: Required<AnswerPriors>["weights"] = {
  age: { under_60: 5, "60_64": 8, "65_74": 30, "75_84": 35, "85_plus": 22 }, // real: exact ages of 75 finder families, bucketed
  income: { under1000: 20, under1500: 23, under2500: 28, under4000: 9, over4000: 6 }, // real
  medicaid: { has: 32, no: 49 }, // real
  veteran: { yes: 5, no: 93 }, // real
  dailyHelp: { none: 25, some: 40, lots: 35 }, // ASSUMED: families looking for care
  savings: { under2000: 40, under10000: 30, over10000: 30 }, // ASSUMED
  disability: { yes: 30, no: 70 }, // ASSUMED
  household: { alone: 45, couple: 35, family: 20 }, // ASSUMED
};
const BASE_NOT_SURE: Record<FactKey, number> = { age: 0.02, income: 0.15, medicaid: 0.18, veteran: 0.02, dailyHelp: 0.05, savings: 0.3, disability: 0.1, household: 0.01, incomeCut: 0.2, savingsCut: 0.35 };
// Exact amounts inside each range, for the follow-up questions (uniform; ASSUMED).
const INCOME_SPAN: Record<string, [number, number]> = { under1000: [500, 1000], under1500: [1000, 1500], under2500: [1500, 2500], under4000: [2500, 4000], over4000: [4000, 8000] };
const SAVINGS_SPAN: Record<string, [number, number]> = { under2000: [0, 2000], under10000: [2000, 10000], over10000: [10000, 100000] };
// The form asks household too ("How many people live in the home?").
const FORM_FACTS: FactKey[] = ["age", "income", "medicaid", "veteran", "household"];

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T extends string>(w: Partial<Record<T, number>>): T => {
  const e = Object.entries(w) as [T, number][];
  let x = rand() * e.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of e) if ((x -= v) <= 0) return k;
  return e[e.length - 1][0];
};

function run(notSure: Record<FactKey, number>, perStateFamilies = 300) {
  seed = 7;
  const priors: AnswerPriors = { weights: MIX, notSure };
  let progs = 0;
  const asked: number[] = [];
  const t = { form: { check: 0, likely: 0, out: 0 }, engine: { check: 0, likely: 0, out: 0 } };
  for (const rules of Object.values(perState))
    for (let i = 0; i < perStateFamilies; i++) {
      const truth = {} as KnownFacts;
      const unsure = new Set<FactKey>();
      for (const k of Object.keys(ANSWERS) as FactKey[]) {
        if ((CUT_FACTS as readonly string[]).includes(k)) { if (rand() < notSure[k]) unsure.add(k); continue; }
        (truth as Record<string, unknown>)[k] = pick(MIX[k] as Record<string, number>);
        if (rand() < notSure[k]) unsure.add(k);
      }
      const form = { ...EMPTY_FACTS };
      for (const k of FORM_FACTS) if (!unsure.has(k)) (form as Record<string, unknown>)[k] = truth[k];
      let f: KnownFacts = { ...EMPTY_FACTS };
      const done = new Set<FactKey>();
      const span = (r: [number, number]) => r[0] + rand() * (r[1] - r[0]);
      const exact = { income: span(INCOME_SPAN[truth.income!]), savings: span(SAVINGS_SPAN[truth.savings!]) };
      for (let q = nextQuestion(rules, f, undefined, { asked: done, priors }); q; q = nextQuestion(rules, f, undefined, { asked: done, priors })) {
        done.add(q.fact);
        if (unsure.has(q.fact)) continue;
        const value = q.fact === "incomeCut" ? cutAnswer(q.at!, exact.income <= q.at!) : q.fact === "savingsCut" ? cutAnswer(q.at!, exact.savings <= q.at!) : truth[q.fact];
        f = { ...f, [q.fact]: value };
      }
      // The truth, told the same follow-ups truthfully, for the safety check.
      const truthAsked = { ...truth, incomeCut: f.incomeCut ?? null, savingsCut: f.savingsCut ?? null };
      asked.push(done.size);
      progs += rules.length;
      for (const r of rules) {
        t.form[statusOf(r, form)]++;
        const s = statusOf(r, f);
        t.engine[s]++;
        if (s === "out" && statusOf(r, truthAsked) !== "out") throw new Error(`engine excluded ${r.name}`);
      }
    }
  asked.sort((a, b) => a - b);
  const pct = (x: number) => `${((100 * x) / progs).toFixed(1)}%`;
  return { asked: `median ${asked[asked.length >> 1]}, p90 ${asked[Math.floor(asked.length * 0.9)]}, max ${asked[asked.length - 1]}`, form: t.form, engine: t.engine, pct, n: asked.length };
}

for (const savings of [0.15, 0.3, 0.5]) {
  const r = run({ ...BASE_NOT_SURE, savings });
  console.log(`\nsavings "not sure" ${savings * 100}% · ${r.n} families · engine questions ${r.asked}`);
  for (const k of ["form", "engine"] as const) console.log(`  ${k.padEnd(6)} worth checking ${r.pct(r[k].check)} | likely ${r.pct(r[k].likely)} | ruled out ${r.pct(r[k].out)}`);
}
const none = run({ age: 0, income: 0, medicaid: 0, veteran: 0, dailyHelp: 0, savings: 0, disability: 0, household: 0, incomeCut: 0, savingsCut: 0 });
console.log(`\nno "not sure" at all (same mix): form ${none.pct(none.form.check)} vs engine ${none.pct(none.engine.check)} worth checking`);
