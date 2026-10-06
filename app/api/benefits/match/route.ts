import { NextResponse } from "next/server";
import { countyForZip } from "@/lib/benefits/zip-county.server";
import { createClient } from "@supabase/supabase-js";
import type {
  BenefitsIntakeAnswers,
  BenefitProgram,
  BenefitMatch,
  AreaAgency,
  BenefitsSearchResult,
} from "@/lib/types/benefits";
import { getTierLabel, needsToCategories } from "@/lib/types/benefits";
import type { WaiverProgram } from "@/data/waiver-library";
import { getCanonicalProgramIds, getEnrichedProgram, getStateSlug } from "@/lib/program-data";
import { US_STATES } from "@/lib/us-states";
import { zipToState } from "@/lib/benefits/zip-lookup";
import { findLocalAAA } from "@/lib/benefits/local-aaa";
import { ageBandFromExact } from "@/lib/benefits/age";
import { pickCallContact, stripParen } from "@/lib/benefits/call-script";
import { programCategory } from "@/lib/benefits/program-category";
import {
  loadSbfEligibility,
  rankProgramsForFamily,
  incomeLimitFromTable,
} from "@/lib/benefits/eligibility.server";
import type { FamilyBenefitsFacts } from "@/lib/family-comms/benefits-guidance.server";

/**
 * The full finder's matcher (/benefits/finder).
 *
 * Until 2026-09-29 this route scored the seeded sbf_* tables with its own
 * rules, while the program pages, the /m plan and the navigator letters all
 * read the pipeline drafts, which are the fact-checked copy. The same family
 * could be shown a different program list and a different phone number
 * depending on which door they came in by. It now reads the same programs
 * the plan page reads and screens them with the same rules
 * (rankProgramsForFamily), so a fact-check correction reaches every surface.
 *
 * Two finder-specific choices sit on top:
 *   - The "Needs" answer re-ranks and never removes. It used to be a hard
 *     cut, which meant a dementia caregiver who tapped only "Memory Care"
 *     never saw respite or caregiver support.
 *   - Programs the family's own answers rule out are left off the list, as
 *     before. The rules only rule out on a fact the family gave us.
 */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

const MAX_RESULTS = 20;
/** Every kept program starts here: "May Qualify" until something fits. */
const BASE_SCORE = 35;
const NEED_BONUS = 15;
const MEMORY_BONUS = 10;
const SETTING_BONUS = 8;

const MEMORY_RE = /alzheimer|dementia|memory|respite|adult day|caregiver/i;
// "home care", not "home": LIHEAP's "Home Energy" is not an at-home care program.
const HOME_RE = /home care|home health|in-home|homemaker|hcbs|home and community|community[- ]based|attendant|personal care|aging in place/i;
const FACILITY_RE = /facility|nursing|assisted living|residential|institutional/i;

function careSetting(p: WaiverProgram): "home" | "facility" | "any" {
  const isHome = HOME_RE.test(p.name);
  const isFacility = FACILITY_RE.test(p.name);
  if (isHome && !isFacility) return "home";
  if (isFacility && !isHome) return "facility";
  return "any";
}

/** The finder's answers in the shape the shared eligibility rules read. */
function factsFromAnswers(answers: BenefitsIntakeAnswers, stateCode: string): FamilyBenefitsFacts {
  const needs = answers.primaryNeeds || [];
  const careNeed: FamilyBenefitsFacts["careNeed"] = needs.includes("memoryCare")
    ? "memoryHealth"
    : needs.includes("financialHelp")
      ? "payingForCare"
      : needs.includes("companionship")
        ? "companionship"
        : needs.length > 0
          ? "stayingAtHome"
          : null;
  return {
    state: stateCode,
    careTypes: [],
    careNeed,
    financialPath: null,
    medicaidStatus: answers.medicaidStatus,
    veteranStatus:
      answers.veteranStatus === "yes" || answers.veteranStatus === "no" ? answers.veteranStatus : null,
    age: answers.age,
    ageBand: answers.age != null ? ageBandFromExact(answers.age) : null,
    incomeBand: answers.incomeRange && answers.incomeRange !== "preferNotToSay" ? answers.incomeRange : null,
    // The finder never asks who is in the household. Unknown, not false.
    hasSpouse: null,
  };
}

function firstSentence(text: string, maxLen = 200): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const period = clean.indexOf(". ");
  const sentence = period > 20 ? clean.slice(0, period + 1) : clean;
  return sentence.length > maxLen ? sentence.slice(0, maxLen - 1).trimEnd() + "…" : sentence;
}

/** A pipeline program in the card shape the finder's results page renders. */
function toBenefitProgram(p: WaiverProgram, stateCode: string, stateSlug: string): BenefitProgram {
  const contact = pickCallContact(p.contacts);
  return {
    id: p.id,
    name: p.name,
    short_name: p.shortName || null,
    description: p.tagline || firstSentence(p.description),
    category: programCategory(p),
    min_age: null,
    max_income_single: incomeLimitFromTable(p.structuredEligibility?.incomeTable),
    max_income_couple: null,
    requires_disability: false,
    requires_veteran: null,
    requires_medicaid: false,
    requires_medicare: null,
    phone: contact?.phone || p.phone || null,
    website: p.sourceUrl || null,
    application_url: p.applicationGuide?.urls?.[0]?.url || null,
    // buildCallScript says who the call is for, and the finder does not ask
    // (null would read "for a family member" to the 70% calling for
    // themselves). Same opening, no claim about whom.
    what_to_say: `Hi, I'm calling to ask about ${stripParen(p.shortName || p.name)}. Could you help me get started, or point me to the right person?`,
    priority_score: 0,
    is_active: true,
    state_code: stateCode,
    savings_range: p.savingsRange || null,
    waiver_library_url: `/benefits/${stateSlug}/${p.id}`,
    source_url: p.sourceUrl || null,
    last_verified_date: p.lastVerifiedDate || null,
    verified_by: p.verifiedBy || null,
    savings_source: p.savingsSource || null,
    savings_verified: p.savingsVerified === true,
  };
}

export async function POST(request: Request) {
  try {
    const answers: BenefitsIntakeAnswers = await request.json();

    const stateCode = (
      answers.stateCode || (answers.zipCode ? zipToState(answers.zipCode) : null)
    )?.toUpperCase();
    const stateSlug = stateCode ? getStateSlug(stateCode) : undefined;
    if (!stateCode || !stateSlug) {
      return NextResponse.json(
        { error: "Could not determine state from ZIP code" },
        { status: 400 }
      );
    }

    // The full ZIP's county over the three-digit guess the browser sent.
    if (answers.zipCode) answers.county = await countyForZip(answers.zipCode, answers.county);

    const supabase = getSupabase();
    const [sbfRows, aaa] = await Promise.all([
      loadSbfEligibility(supabase, stateCode),
      findLocalAAA(supabase, stateCode, answers.zipCode, answers.county),
    ]);
    const localAAA: AreaAgency | null = aaa?.agency ?? null;

    // Same program set as the /m plan: canonical ids, benefits only.
    const programs = getCanonicalProgramIds(stateSlug)
      .map((id) => getEnrichedProgram(stateSlug, id))
      .filter((p): p is WaiverProgram => !!p && p.programType === "benefit");

    const stateName = US_STATES.find((s) => s.value === stateCode)?.label ?? null;
    const facts = factsFromAnswers(answers, stateCode);
    const { kept } = rankProgramsForFamily(
      programs,
      (p) => ({
        name: p.name,
        ageRequirement: p.structuredEligibility?.ageRequirement,
        eligibilitySummary: p.structuredEligibility?.summary,
        incomeLimitSingle: incomeLimitFromTable(p.structuredEligibility?.incomeTable),
      }),
      sbfRows,
      facts,
      stateName,
    );

    const relevant = needsToCategories(answers.primaryNeeds || []);
    const wantsMemory = (answers.primaryNeeds || []).includes("memoryCare");
    const scored = kept.map(({ item, verdict }, idx) => {
      const program = toBenefitProgram(item, stateCode, stateSlug);
      const reasons = [...verdict.fits];
      let score = BASE_SCORE + verdict.boost;
      if (relevant.includes(program.category)) {
        score += NEED_BONUS;
        reasons.unshift("Fits the help you picked");
      }
      if (wantsMemory && MEMORY_RE.test(`${item.name} ${item.shortName ?? ""}`)) {
        score += MEMORY_BONUS;
      }
      if (answers.carePreference === "stayHome" || answers.carePreference === "exploringFacility") {
        const setting = careSetting(item);
        const wanted = answers.carePreference === "stayHome" ? "home" : "facility";
        if (setting === wanted) {
          score += SETTING_BONUS;
          reasons.push(wanted === "home" ? "Helps you stay at home" : "Covers care in a facility");
        } else if (setting !== "any") {
          score -= SETTING_BONUS;
        }
      }
      score = Math.max(0, Math.min(score, 100));
      const match: BenefitMatch = {
        id: program.id,
        program,
        matchScore: score,
        matchReasons: reasons.length > 0 ? reasons : ["Worth checking"],
        tierLabel: getTierLabel(score),
      };
      return { match, idx };
    });

    // Highest score first; ties keep the order the state's programs are
    // listed in, which is the order the plan page uses.
    scored.sort((a, b) => b.match.matchScore - a.match.matchScore || a.idx - b.idx);
    const matchedPrograms = scored.slice(0, MAX_RESULTS).map((s) => s.match);

    const result: BenefitsSearchResult = {
      federalPrograms: [],
      statePrograms: [],
      localAAA,
      matchedPrograms,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[benefits/match]", err);
    return NextResponse.json(
      { error: "Failed to find matching programs" },
      { status: 500 }
    );
  }
}
