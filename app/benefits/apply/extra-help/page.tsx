import { getEnrichedProgram, getStateSlug } from "@/lib/program-data";
import { US_STATES } from "@/lib/us-states";
import { buildApplyAlong, startsWithExtraHelp, type ApplyHousehold } from "@/lib/benefits/apply-along";
import { parseCuts } from "@/lib/benefits/cut";
import type { FinderWho } from "@/lib/benefits/finder-answers";
import ApplyAlongView from "./ApplyAlongView";

/**
 * /benefits/apply/extra-help?st=PA&p=<program id>&w=spouse&h=couple&i=under2500&ic=under:2455&s=under10000&sc=over:3000[&t=<plan token>]
 *
 * The answers come in the link (no personal data: ranges, who, household), so
 * the plan, the saved plan page and a texted link all open the same sheet.
 * `t` is the saved plan's token, which lets "we submitted it" be recorded.
 */
const WHO = ["me", "parent", "spouse", "other"];
const HOUSEHOLD = ["alone", "couple", "family"];
const INCOME = ["under1000", "under1500", "under2500", "under4000", "over4000"];
const SAVINGS = ["under2000", "under10000", "over10000"];

export default async function ApplyAlongPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const pick = (v: string | undefined, allowed: string[]) => (v && allowed.includes(v) ? v : null);
  const stateCode = (q.st || "").toUpperCase();
  const stateName = US_STATES.find((s) => s.value === stateCode)?.label ?? null;
  const stateSlug = stateName ? getStateSlug(stateCode) ?? null : null;
  const program = stateSlug && q.p ? getEnrichedProgram(stateSlug, q.p) : undefined;
  const mspName = program && startsWithExtraHelp(program.name) && !/extra help|low[- ]income subsidy/i.test(program.name)
    ? (program.shortName || program.name).replace(/\s*\([^)]*\)/g, "").trim()
    : "Medicare Savings";

  const who = pick(q.w, WHO) as FinderWho | null;
  const household = pick(q.h, HOUSEHOLD) as ApplyHousehold;
  const income = pick(q.i, INCOME);
  const savings = pick(q.s, SAVINGS);
  const sheet = buildApplyAlong({
    who,
    household,
    income,
    incomeCut: parseCuts(q.ic) ? q.ic! : null,
    savings,
    savingsCut: parseCuts(q.sc) ? q.sc! : null,
    stateName: stateName ?? "your state",
    mspName,
  });

  return (
    <ApplyAlongView
      sheet={sheet}
      token={q.t && /^[A-Za-z0-9_-]{16}$/.test(q.t) ? q.t : null}
      stateCode={stateName ? stateCode : null}
      stateSlug={stateSlug}
      program={program && stateSlug ? { id: program.id, name: program.name, shortName: program.shortName || null } : null}
      who={who}
      household={household}
      income={income}
    />
  );
}
