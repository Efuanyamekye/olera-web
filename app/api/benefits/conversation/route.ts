import { NextRequest, NextResponse } from "next/server";
import { getCanonicalProgramIds, getEnrichedProgram, getStateSlug } from "@/lib/program-data";
import { rulesOf, explain, nextQuestion, questionsLeft, ANSWERS, DEFAULT_PRIORS, EMPTY_FACTS, type FactKey, type KnownFacts } from "@/lib/benefits/question-engine";
import { whyLine, type ConversationTurn } from "@/lib/benefits/conversation";
import { isWaiverPath } from "@/lib/benefits/eligibility.server";

/**
 * POST /api/benefits/conversation
 * { stateCode, facts, asked } → the next question and every program's status.
 *
 * The question engine runs here, on the fact-checked drafts, so the page only
 * asks and shows. Stateless: the page holds the answers. Not linked from any
 * page yet (Phase 3 prototype, 5 Oct 2026).
 */
export async function POST(request: NextRequest) {
  let body: { stateCode?: unknown; facts?: unknown; asked?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const stateCode = typeof body.stateCode === "string" ? body.stateCode.toUpperCase() : "";
  const slug = getStateSlug(stateCode);
  if (!slug) return NextResponse.json({ error: "Unknown state." }, { status: 400 });

  // Accept only known facts with known answers; anything else is unknown.
  const facts: KnownFacts = { ...EMPTY_FACTS };
  const raw = (body.facts && typeof body.facts === "object" ? body.facts : {}) as Record<string, unknown>;
  for (const k of Object.keys(ANSWERS) as FactKey[]) {
    const v = raw[k];
    if (typeof v === "string" && (ANSWERS[k] as string[]).includes(v)) (facts as unknown as Record<string, unknown>)[k] = v;
  }
  const asked = new Set<FactKey>(
    (Array.isArray(body.asked) ? body.asked : []).filter((x): x is FactKey => typeof x === "string" && x in ANSWERS),
  );

  const drafts = getCanonicalProgramIds(slug)
    .map((id) => getEnrichedProgram(slug, id))
    .filter((d): d is NonNullable<typeof d> => !!d && d.programType === "benefit");
  const rules = drafts.map((d) => rulesOf(d as Parameters<typeof rulesOf>[0]));

  // Families read the short name ("STAR+PLUS", "PACE"), not the official one.
  const short = new Map(drafts.map((d) => [d.name, (d as { shortName?: string | null }).shortName || d.name]));
  const q = nextQuestion(rules, facts, undefined, { asked, priors: DEFAULT_PRIORS });
  const order = { likely: 0, check: 1, out: 2 } as const;
  const turn: ConversationTurn = {
    question: q ? { fact: q.fact, turnsOn: q.turnsOn.map((n) => short.get(n) ?? n) } : null,
    left: q ? questionsLeft(rules, facts, asked) : 0,
    programs: rules
      .map((r) => {
        const e = explain(r, facts);
        let why = whyLine(e.status, e.failed, e.met);
        // A care waiver's own income limit is not in the data yet, so "likely"
        // says what the state still checks.
        if (e.status === "likely" && isWaiverPath(r.name)) why = `${why ? `${why} ` : ""}The state also checks income and does a care assessment.`;
        return { id: r.id, name: short.get(r.name) ?? r.name, status: e.status, why };
      })
      .sort((a, b) => order[a.status] - order[b.status]),
  };
  return NextResponse.json(turn);
}
