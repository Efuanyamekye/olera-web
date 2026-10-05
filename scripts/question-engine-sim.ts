/**
 * Simulate every state's benefit programs through the question engine against
 * the nine-question finder form. Families answer truthfully; the engine asks
 * until no question would change a program. A throw means the engine ruled out
 * a program the family's full answers keep, which must never happen.
 *
 *   npx -y tsx@4 scripts/question-engine-sim.ts
 */
import { rulesOf, statusOf, nextQuestion, EMPTY_FACTS, ANSWERS, type KnownFacts, type FactKey } from "@/lib/benefits/question-engine";
import { getCanonicalProgramIds, getEnrichedProgram, getStateSlug } from "@/lib/program-data";
import { US_STATES } from "@/lib/us-states";

const perState: Record<string, ReturnType<typeof rulesOf>[]> = {};
for (const s of US_STATES) {
  const slug = getStateSlug(s.value);
  if (!slug) continue;
  perState[s.value] = getCanonicalProgramIds(slug)
    .map((id) => getEnrichedProgram(slug, id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.programType === "benefit")
    .map((d) => rulesOf(d as Parameters<typeof rulesOf>[0]));
}

let runs = 0, progs = 0;
const asked: number[] = [];
const tally = { form: { check: 0, likely: 0, out: 0 }, engine: { check: 0, likely: 0, out: 0 } };
for (const rules of Object.values(perState))
  for (const age of ANSWERS.age) for (const income of ANSWERS.income) for (const medicaid of ANSWERS.medicaid)
    for (const dailyHelp of ANSWERS.dailyHelp) for (const savings of ANSWERS.savings) for (const disability of ANSWERS.disability) {
      const truth = { age, income, medicaid, veteran: "no", dailyHelp, savings, disability } as KnownFacts;
      const form = { ...EMPTY_FACTS, age, income, medicaid, veteran: "no" } as KnownFacts;
      let f: KnownFacts = { ...EMPTY_FACTS };
      let n = 0;
      for (let q = nextQuestion(rules, f); q; q = nextQuestion(rules, f)) { f = { ...f, [q.fact]: truth[q.fact as FactKey] }; n++; }
      runs++; asked.push(n); progs += rules.length;
      for (const r of rules) {
        tally.form[statusOf(r, form)]++;
        const s = statusOf(r, f);
        tally.engine[s]++;
        if (s === "out" && statusOf(r, truth) !== "out") throw new Error(`engine excluded ${r.name}`);
      }
    }
asked.sort((a, b) => a - b);
const pct = (x: number) => `${((100 * x) / progs).toFixed(1)}%`;
console.log(`families ${runs}; engine questions median ${asked[runs >> 1]}, p90 ${asked[Math.floor(runs * 0.9)]}, max ${asked[runs - 1]}`);
for (const k of ["form", "engine"] as const) console.log(`${k.padEnd(6)} worth checking ${pct(tally[k].check)} | likely ${pct(tally[k].likely)} | ruled out ${pct(tally[k].out)}`);
