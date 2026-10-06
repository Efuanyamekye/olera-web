/**
 * Score the finder against the researched answer key (6 Oct 2026).
 *
 * The key (data/benefits/answer-key/answers/<ST>.json) was researched from
 * official state and federal sources without reading Olera's program data,
 * so agreement means something. Each family runs through the plan twice:
 * once with the nine-question form's answers, once with the conversation's
 * extra facts (daily help, savings).
 *
 * Reports per family and overall:
 *   found      researched "likely" programs the plan shows at all
 *   likely     ... the plan also marks likely
 *   wrong      plan marks likely, research says unlikely
 *   shownWrong plan shows it at all, research says unlikely
 *   missing    researched "likely" programs our catalog doesn't hold
 *   firstCall  plan's first call is the research's first call
 *
 * Programs are matched by name; data/benefits/answer-key/aliases.json pins
 * the ones a name match can't settle ("<ST>|<researched name>": "<program id>"
 * or null when we don't hold it).
 *
 *   npx -y tsx@4 scripts/benefits-answer-key-score.ts [--states TX,FL] [--verbose]
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { buildFinderResult } from "@/lib/benefits/finder-engine.server";
import { zipToCounty } from "@/lib/benefits/zip-lookup";
import { emptyFinderAnswers, type FinderAnswers, type FinderIncome } from "@/lib/benefits/finder-answers";
import { getCanonicalProgramIds, getEnrichedProgram, getStateSlug } from "@/lib/program-data";

for (const p of [resolve(process.cwd(), ".env.local"), resolve(process.env.HOME || "", "Desktop/olera-web/.env.local")]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const k = t.slice(0, t.indexOf("=")).trim();
    if (!process.env[k]) process.env[k] = t.slice(t.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const DIR = resolve(process.cwd(), "data/benefits/answer-key");
const argv = process.argv.slice(2);
const only = argv.includes("--states") ? argv[argv.indexOf("--states") + 1].split(",") : null;
const verbose = argv.includes("--verbose");
const showMatches = argv.includes("--matches");

type Verdict = "likely" | "possible" | "unlikely";
interface KeyProgram { name: string; alsoKnownAs?: string[]; verdict: Verdict; reason: string; keyRule?: string; source?: string; evidence?: string }
interface KeyFamily { familyId: string; programs: KeyProgram[]; firstCall: { program: string; why: string }; notes?: string }
interface Family {
  id: string; state: string; zip: string; who: "parent" | "spouse"; age: number; householdSize: number; household: string;
  story: string; dailyHelpDetail: string; monthlyIncome: number; savings: number; medicaid: "has" | "no"; veteran: "yes" | "no" | "spouse"; dailyHelp: "none" | "some" | "lots";
}

const families: Family[] = JSON.parse(readFileSync(`${DIR}/families.json`, "utf-8")).families;
const aliases: Record<string, string | null> = existsSync(`${DIR}/aliases.json`) ? JSON.parse(readFileSync(`${DIR}/aliases.json`, "utf-8")) : {};

const band = (n: number): FinderIncome => (n < 1000 ? "under1000" : n < 1500 ? "under1500" : n < 2500 ? "under2500" : n < 4000 ? "under4000" : "over4000");
const ageBand = (n: number): FinderAnswers["age"] => (n < 60 ? "under_60" : n < 65 ? "60_64" : n < 75 ? "65_74" : n < 85 ? "75_84" : "85_plus");

/** What a family would actually enter. Both flows ask the person's own
 *  income in practice (the conversation asks it outright). */
function answersFor(f: Family, conversation: boolean, county: string | null): FinderAnswers {
  return {
    ...emptyFinderAnswers(),
    county,
    who: f.who,
    zip: f.zip,
    stateCode: f.state,
    age: ageBand(f.age),
    // "Memory loss" only where the facts say dementia (the D families don't).
    needs: /dementia|alzheimer/i.test(`${f.story} ${f.dailyHelpDetail}`) ? ["memory", "care"] : ["care"],
    caregiverNeeds: ["paid"],
    household: f.householdSize === 1 ? "1" : f.householdSize === 2 ? "2" : "3",
    income: band(f.monthlyIncome),
    medicaid: f.medicaid === "has" ? "alreadyHas" : "doesNotHave",
    veteran: f.veteran,
    ...(conversation
      ? { dailyHelp: f.dailyHelp, savings: f.savings < 2000 ? "under2000" : f.savings < 10000 ? "under10000" : "over10000" }
      : {}),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const STOP = new Set(["program", "programs", "the", "of", "for", "and", "a", "in", "state", "services", "service", "assistance", "benefits", "benefit"]);
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
const acronym = (s: string) => (s.match(/\(([A-Z][A-Za-z/&+ -]{1,15})\)/g) || []).map((m) => norm(m));

interface Catalog { id: string; names: string[] }
function catalogFor(state: string): Catalog[] {
  const slug = getStateSlug(state)!;
  return getCanonicalProgramIds(slug)
    .map((id) => getEnrichedProgram(slug, id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.programType === "benefit")
    .map((p) => ({ id: p.id, names: [p.name, p.shortName || "", ...acronym(p.name)].filter(Boolean) }));
}

function match(state: string, kp: KeyProgram, cat: Catalog[]): string | null | undefined {
  const key = `${state}|${kp.name}`;
  if (key in aliases) return aliases[key];
  const theirs = [kp.name, ...(kp.alsoKnownAs || [])];
  let best: { id: string; score: number } | null = null;
  for (const c of cat)
    for (const a of theirs)
      for (const b of c.names) {
        if (norm(a) === norm(b)) return c.id;
        const ta = tokens(a), tb = tokens(b);
        if (!ta.size || !tb.size) continue;
        const inter = [...ta].filter((t) => tb.has(t)).length;
        const score = inter / Math.min(ta.size, tb.size);
        if (score > (best?.score ?? 0)) best = { id: c.id, score };
      }
  return best && best.score >= 0.75 ? best.id : undefined; // undefined = unmatched, needs an alias
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const unmatched = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const tot = { form: zero(), conversation: zero() };

  for (const f of families) {
    if (only && !only.includes(f.state)) continue;
    const file = `${DIR}/answers/${f.state}.json`;
    if (!existsSync(file)) continue;
    const kf: KeyFamily | undefined = JSON.parse(readFileSync(file, "utf-8")).families.find((x: KeyFamily) => x.familyId === f.id);
    if (!kf) continue;
    const cat = catalogFor(f.state);
    const keyed = kf.programs.map((kp) => {
      const id = match(f.state, kp, cat);
      if (id === undefined && kp.verdict !== "unlikely") unmatched.add(`${f.state}|${kp.name}`);
      return { kp, id };
    });
    if (showMatches) for (const { kp, id } of keyed) console.log(`${f.id}\t${kp.verdict}\t${kp.name}\t=> ${id === undefined ? "?" : id}`);
    const firstKey = keyed.find((k) => norm(k.kp.name) === norm(kf.firstCall.program))?.id
      ?? match(f.state, { name: kf.firstCall.program, verdict: "likely", reason: "" }, cat);

    for (const mode of ["form", "conversation"] as const) {
      const res = await buildFinderResult(db, answersFor(f, mode === "conversation", await zipToCounty(f.zip)));
      if (!res) throw new Error(`no result for ${f.id}`);
      // The first call is not repeated in programs.
      const shown = new Map([...(res.firstStep ? [res.firstStep] : []), ...res.programs].map((p) => [p.id, p.tier]));
      const s = zero();
      const detail: string[] = [];
      for (const { kp, id } of keyed) {
        const tier = id ? shown.get(id) : undefined;
        if (kp.verdict === "likely") {
          s.keyLikely++;
          if (!id) { s.missing++; detail.push(`  MISSING  ${kp.name}`); continue; }
          if (tier) s.found++; else detail.push(`  NOT SHOWN ${kp.name}  (${kp.keyRule ?? kp.reason})`);
          if (tier === "likely") s.likely++;
        } else if (kp.verdict === "unlikely" && id && tier) {
          s.shownWrong++;
          if (tier === "likely") { s.wrong++; detail.push(`  WRONG    ${kp.name} marked likely; research: ${kp.keyRule ?? kp.reason}`); }
          else detail.push(`  SHOWN    ${kp.name} as worth checking; research says unlikely: ${kp.keyRule ?? kp.reason}`);
        }
      }
      s.shown = shown.size;
      // The key often routes through the local aging agency (SHIP/HICAP
      // counseling, waiver screening), which is the plan's agency step.
      const keyViaAgency = /area agency|\baaa\b|daaa|agency on aging|alliance for aging|empowerline|shine|hicap|mmap/i.test(`${kf.firstCall.program} ${(kf.firstCall as { phoneOrWhere?: string }).phoneOrWhere ?? ""}`);
      const agree = !!res.firstStep && ((!!firstKey && res.firstStep.id === firstKey) || (res.firstStep.id === "local-agency" && keyViaAgency));
      s.firstMatch = agree ? 1 : 0;
      s.firstNotHeld = !agree && !firstKey ? 1 : 0;
      s.families = 1;
      add(tot[mode], s);
      rows.push({ family: f.id, mode, ...s, firstCall: res.firstStep?.name ?? null, keyFirstCall: kf.firstCall.program });
      if (verbose) {
        console.log(`\n${f.id} [${mode}] found ${s.found}/${s.keyLikely - s.missing} likely ${s.likely} wrong ${s.wrong} shown ${s.shown} | first: ${res.firstStep?.name ?? "none"} (key: ${kf.firstCall.program})`);
        detail.forEach((d) => console.log(d));
      }
    }
  }

  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a");
  for (const mode of ["form", "conversation"] as const) {
    const t = tot[mode];
    console.log(`\n${mode.toUpperCase()} (${t.families} families)`);
    console.log(`  finds the right programs   ${pct(t.found, t.keyLikely - t.missing)}  (${t.found} of ${t.keyLikely - t.missing} we hold)`);
    console.log(`  marks them likely          ${pct(t.likely, t.keyLikely - t.missing)}`);
    console.log(`  wrong "likely"             ${t.wrong}`);
    console.log(`  shows a program they fail  ${t.shownWrong}`);
    console.log(`  first call agrees          ${pct(t.firstMatch, t.families)}  (${t.firstNotHeld} more disagree because the right first call isn't in our catalog)`);
    console.log(`  not in our catalog         ${t.missing} of ${t.keyLikely} researched likely programs`);
    console.log(`  programs shown per family  ${(t.shown / (t.families || 1)).toFixed(1)}`);
  }
  if (unmatched.size) {
    console.log(`\n${unmatched.size} researched programs matched nothing by name; pin them in aliases.json:`);
    [...unmatched].sort().forEach((u) => console.log(`  "${u}": null,`));
  }
  writeFileSync(`${DIR}/last-score.json`, JSON.stringify({ scoredOn: new Date().toISOString().slice(0, 10), totals: tot, rows }, null, 2));
}

function zero() { return { families: 0, keyLikely: 0, found: 0, likely: 0, wrong: 0, shownWrong: 0, missing: 0, firstMatch: 0, firstNotHeld: 0, shown: 0 }; }
function add(a: ReturnType<typeof zero>, b: ReturnType<typeof zero>) { for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += b[k]; }

main().catch((e) => { console.error(e); process.exit(1); });
