"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zipToState } from "@/lib/benefits/zip-lookup";
import { US_STATES } from "@/lib/us-states";
import { questionCopy, shortName, type ConversationTurn, type ConversationProgram } from "@/lib/benefits/conversation";
import type { FactKey, KnownFacts } from "@/lib/benefits/question-engine";
import { emptyFinderAnswers, type FinderAnswers, type FinderNeed, type FinderWho } from "@/lib/benefits/finder-answers";

/**
 * The benefits conversation, first screen (Phase 3, 5 Oct 2026).
 *
 * One question per screen, the reason under it, the programs firming up as
 * the family answers. The question engine (on the server) picks each question
 * from the state's fact-checked rules; this page only asks and shows. It ends
 * by handing the answers to the finder's plan, so the call, the script and
 * "send me this plan" are the finder's, unchanged.
 *
 * The plan reads daily help and savings too (finder-engine conversationFacts),
 * so it agrees with the list the family watched settle.
 */

type Step = "who" | "zip" | "need" | "engine" | "medicaid" | "done";

const EMPTY: KnownFacts = { age: null, income: null, medicaid: null, veteran: null, dailyHelp: null, savings: null, disability: null, household: null };
const FINDER_KEY = "olera-finder-v2";

const WHO: { value: FinderWho; label: string }[] = [
  { value: "parent", label: "My mom or dad" },
  { value: "spouse", label: "My spouse" },
  { value: "me", label: "Me" },
  { value: "other", label: "Someone else" },
];
// Objects only on this screen: choosing between kinds of help is where a
// picture is recognised faster than a phrase. Money and age questions keep
// words; the number is the answer. Fluent 3D emoji, the hub's object family.
const NEEDS: { value: FinderNeed; label: string; icon: string }[] = [
  { value: "care", label: "Paying for care at home", icon: "house-with-garden" },
  { value: "memory", label: "Memory care or dementia", icon: "puzzle-piece" },
  { value: "bills", label: "Everyday bills", icon: "receipt" },
  { value: "health", label: "Medicare and health costs", icon: "stethoscope" },
  { value: "urgent", label: "Something urgent this week", icon: "alarm-clock" },
];

interface Snapshot { step: Step; facts: KnownFacts; asked: FactKey[] }

export default function BenefitsConversationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("who");
  const [who, setWho] = useState<FinderWho | null>(null);
  const [zip, setZip] = useState("");
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [need, setNeed] = useState<FinderNeed | null>(null);
  const [facts, setFacts] = useState<KnownFacts>(EMPTY);
  const [asked, setAsked] = useState<FactKey[]>([]);
  const [medicaid, setMedicaid] = useState<FinderAnswers["medicaid"]>(null);
  const [turn, setTurn] = useState<ConversationTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const stateName = US_STATES.find((s) => s.value === stateCode)?.label ?? null;

  const ask = useCallback(async (f: KnownFacts, a: FactKey[]) => {
    if (!stateCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/benefits/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateCode, facts: f, asked: a }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't load the next question.");
      setTurn(body as ConversationTurn);
      if (!(body as ConversationTurn).question) setStep("medicaid");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load the next question.");
    } finally {
      setLoading(false);
    }
  }, [stateCode]);

  useEffect(() => {
    if (step === "engine" && !turn && stateCode) void ask(facts, asked);
  }, [step, turn, stateCode, facts, asked, ask]);

  const remember = () => setHistory((h) => [...h, { step, facts, asked }]);

  const answerFact = (fact: FactKey, value: string | null) => {
    remember();
    const f = value ? ({ ...facts, [fact]: value } as KnownFacts) : facts;
    const a = [...asked, fact];
    setFacts(f);
    setAsked(a);
    void ask(f, a);
  };

  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setStep(prev.step);
    setFacts(prev.facts);
    setAsked(prev.asked);
    if (prev.step === "engine") void ask(prev.facts, prev.asked);
  };

  /** Hand everything to the finder's plan: same engine, same call, same "send me this plan". */
  const seePlan = async () => {
    if (!stateCode) return;
    setLoading(true);
    setError(null);
    const answers: FinderAnswers = {
      ...emptyFinderAnswers(),
      who,
      zip,
      stateCode,
      place: stateName,
      age: facts.age,
      needs: need ? [need] : ["care"],
      household: facts.household === "couple" ? "2" : facts.household === "alone" ? "1" : null,
      income: facts.income ?? (asked.includes("income") ? "unsure" : null),
      medicaid,
      veteran: facts.veteran ?? "no",
      dailyHelp: facts.dailyHelp,
      savings: facts.savings,
    };
    try {
      const res = await fetch("/api/benefits/finder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't load your plan.");
      try {
        localStorage.setItem(FINDER_KEY, JSON.stringify({ answers, stepIndex: 99, phase: "results", result: body, cohort: null, savedAt: Date.now() }));
      } catch {
        // Storage blocked: the finder will open on its first question instead.
      }
      router.push("/benefits/finder");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load your plan.");
      setLoading(false);
    }
  };

  const programs = turn?.programs ?? [];
  const likely = programs.filter((p) => p.status === "likely");
  const checking = programs.filter((p) => p.status === "check");
  const out = programs.filter((p) => p.status === "out");
  const answeredCount = asked.length;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between text-sm text-gray-500 min-h-[24px]">
        {history.length ? (
          <button type="button" onClick={back} className="bg-transparent border-none p-0 text-primary-800 font-medium cursor-pointer">
            ← Back
          </button>
        ) : <span />}
        <span>{progressLine(step, turn)}</span>
      </div>

      {step === "who" && (
        <Question title="Who are you looking into benefits for?" why="So I can talk about the right person.">
          {WHO.map((o) => (
            <Chip key={o.value} label={o.label} onClick={() => { remember(); setWho(o.value); setStep("zip"); }} />
          ))}
        </Question>
      )}

      {step === "zip" && (
        <Question title={who === "me" ? "What's your ZIP code?" : "What ZIP code do they live in?"} why="Most programs are run by the state, and some by the county.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const st = zip.length === 5 ? zipToState(zip) : null;
              if (!st) { setError("That ZIP code doesn't match a state. Check the five digits."); return; }
              setError(null);
              remember();
              setStateCode(st);
              setStep("need");
            }}
            className="flex gap-3"
          >
            <input
              id="conversation-zip"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="flex-1 min-h-[56px] rounded-2xl border-[1.5px] border-gray-300 bg-white px-4 text-xl tracking-wide focus:border-primary-700 focus:outline-none"
              aria-label="ZIP code"
            />
            <button type="submit" className="min-h-[56px] px-6 rounded-2xl bg-primary-800 text-white font-semibold border-none cursor-pointer hover:bg-primary-700">
              Next
            </button>
          </form>
        </Question>
      )}

      {step === "need" && (
        <Question title="What would help most right now?" why="This decides which program I point you to first.">
          {NEEDS.map((o) => (
            <Chip key={o.value} label={o.label} icon={o.icon} onClick={() => { remember(); setNeed(o.value); setStep("engine"); }} />
          ))}
        </Question>
      )}

      {step === "engine" && (
        <>
          {answeredCount > 0 && <ProgramList likely={likely} checking={checking} out={out} stateName={stateName} compact />}
          {turn?.question && !loading ? (() => {
            const c = questionCopy(turn.question.fact, who, turn.question.turnsOn, stateName);
            return (
              <Question title={c.title} why={c.why}>
                {c.choices.map((o) => <Chip key={o.value} label={o.label} onClick={() => answerFact(turn.question!.fact, o.value)} />)}
                <Chip label="I'm not sure" ghost onClick={() => answerFact(turn.question!.fact, null)} />
              </Question>
            );
          })() : <Thinking />}
        </>
      )}

      {step === "medicaid" && (
        <>
          <ProgramList likely={likely} checking={checking} out={out} stateName={stateName} compact />
          <Question
            title={who === "me" || !who ? "Last one: do you have Medicaid now?" : `Last one: does ${who === "parent" ? "your parent" : who === "spouse" ? "your spouse" : "the person you help"} have Medicaid now?`}
            why="It doesn't change which programs fit. It changes what to say when you call."
          >
            {([["alreadyHas", "Yes"], ["doesNotHave", "No"], ["applying", "Applying now"], ["notSure", "I'm not sure"]] as const).map(([v, l]) => (
              <Chip key={v} label={l} ghost={v === "notSure"} onClick={() => { remember(); setMedicaid(v); setStep("done"); }} />
            ))}
          </Question>
        </>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-6">
          <h1 className="font-display text-[30px] leading-tight text-gray-900 m-0">Here&apos;s where things stand</h1>
          <ProgramList likely={likely} checking={checking} out={out} stateName={stateName} />
          <button
            type="button"
            onClick={() => void seePlan()}
            disabled={loading}
            className="min-h-[56px] rounded-2xl bg-primary-800 text-white text-lg font-semibold border-none cursor-pointer hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? "Building your plan…" : "See your first call"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-[15px] text-red-700 m-0">{error}</p>}
    </div>
  );
}

/** "About N left" from the engine's upper bound, plus the Medicaid question. */
function progressLine(step: Step, turn: ConversationTurn | null): string {
  if (step === "who" || step === "zip" || step === "need") return "About 2 minutes";
  if (step === "engine" && turn?.question) {
    const n = turn.left + 1;
    return `About ${n} question${n === 1 ? "" : "s"} left`;
  }
  if (step === "medicaid") return "Last question";
  return "";
}

function Question({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section key={title} className="flex flex-col gap-4">
      <h1 className="font-display text-[28px] sm:text-[32px] leading-[1.15] text-gray-900 m-0 [text-wrap:balance]">{title}</h1>
      <p className="text-[15px] text-gray-600 m-0 border-l-2 border-primary-600 pl-3">
        <span className="font-medium text-gray-800">Why I&apos;m asking: </span>{why}
      </p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Chip({ label, onClick, ghost, icon }: { label: string; onClick: () => void; ghost?: boolean; icon?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[56px] w-full text-left px-4 rounded-2xl border-[1.5px] bg-transparent text-[17px] cursor-pointer transition-colors flex items-center gap-3.5 ${icon ? "py-2.5" : ""} ${
        // Hover only where there is a mouse: on a phone the tint sticks after a
        // tap or Back and the next screen looks pre-answered (TJ's iPhone, 5 Oct).
        ghost ? "border-gray-200 text-gray-600 font-medium [@media(hover:hover)]:hover:border-gray-300" : "border-primary-700 text-primary-800 font-semibold [@media(hover:hover)]:hover:bg-primary-50 active:bg-primary-50"
      }`}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/images/benefits-conversation/${icon}.svg`} alt="" width={40} height={40} className="w-10 h-10 shrink-0" />
      ) : null}
      <span>{label}</span>
    </button>
  );
}

function Thinking() {
  return (
    <div className="py-10 flex items-center gap-3 text-gray-600" role="status">
      <div className="w-6 h-6 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin" />
      Checking the programs…
    </div>
  );
}

function ProgramList({ likely, checking, out, stateName, compact }: { likely: ConversationProgram[]; checking: ConversationProgram[]; out: ConversationProgram[]; stateName: string | null; compact?: boolean }) {
  const row = (p: ConversationProgram, label: string, tone: string) => (
    <li key={p.id} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2.5 border-b border-gray-200 last:border-b-0">
      <span className={`text-[11px] font-semibold tracking-wider uppercase pt-1 ${tone}`}>{label}</span>
      <span className="text-[15px] text-gray-900">
        {shortName(p.name, stateName)}
        {p.why && !compact ? <span className="block text-[13px] text-gray-500">{p.why}</span> : null}
      </span>
    </li>
  );
  if (compact) {
    return (
      <ul className="list-none m-0 p-0 border-t border-gray-200">
        {likely.map((p) => row(p, "Likely", "text-primary-700"))}
        {checking.length ? (
          <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2.5 border-b border-gray-200">
            <span className="text-[11px] font-semibold tracking-wider uppercase pt-1 text-gray-500">Checking</span>
            <span className="text-[15px] text-gray-600">{checking.length} program{checking.length === 1 ? "" : "s"}</span>
          </li>
        ) : null}
        {out.length ? (
          <li className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-2.5">
            <span className="text-[11px] font-semibold tracking-wider uppercase pt-1 text-red-700">Not a fit</span>
            <span className="text-[15px] text-gray-600">{out.length}</span>
          </li>
        ) : null}
      </ul>
    );
  }
  return (
    <ul className="list-none m-0 p-0 border-t border-gray-200">
      {likely.map((p) => row(p, "Likely", "text-primary-700"))}
      {checking.map((p) => row(p, "Checking", "text-gray-500"))}
      {out.map((p) => row(p, "Not a fit", "text-red-700"))}
    </ul>
  );
}
