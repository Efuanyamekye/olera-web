"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zipToCounty, zipToState } from "@/lib/benefits/zip-lookup";
import { US_STATES } from "@/lib/us-states";
import { questionCopy, shortName, type ConversationTurn, type ConversationProgram } from "@/lib/benefits/conversation";
import type { FactKey, KnownFacts } from "@/lib/benefits/question-engine";
import { emptyFinderAnswers, finderVoice, type FinderAnswers, type FinderNeed, type FinderProgram, type FinderResult, type FinderWho } from "@/lib/benefits/finder-answers";
import { telHref } from "@/lib/benefits/call-script";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";
import { getOrCreateSessionId } from "@/lib/analytics/session";

/**
 * The benefits conversation (Phase 3, 5 Oct 2026), redesigned the same day
 * after TJ's read of the first build: "feels like a chore, lifeless, the
 * final page is an overwhelming mess".
 *
 * One question per screen with one grey line under it, a segmented bar, and
 * the programs held in a single pill so the question stays on top. When an
 * answer moves a program, a card says so for about a second. It ends on one
 * reveal ("5 programs look likely for your parent") and its own calm result:
 * one card with the first call, then the other likely programs as plain rows.
 *
 * The question engine (server) picks each question from the state's
 * fact-checked rules; the finder's engine builds the first call, reading the
 * same daily-help and savings answers so the two agree.
 */

type Step = "who" | "need" | "zip" | "engine" | "reveal" | "result";

const EMPTY: KnownFacts = { age: null, income: null, medicaid: null, veteran: null, dailyHelp: null, savings: null, disability: null, household: null };
const FINDER_KEY = "olera-finder-v2";
const WHO_VALUES = ["me", "parent", "spouse", "other"] as const;
// Same events and key as the finder (hooks/use-finder.ts), a different
// variant, so one query compares the two funnels step by step: the Phase 3
// test is "caregivers complete it at least as often as the form".
const TRACKING_KEY = "benefits-finder";
const VARIANT = "conversation_v1";
const ENTRY_SOURCE = "/benefits/conversation";
type TrackEvent = "benefits_entry_viewed" | "benefits_step_viewed" | "benefits_step_completed";

const WHO: { value: FinderWho; label: string }[] = [
  { value: "parent", label: "My mom or dad" },
  { value: "spouse", label: "My spouse" },
  { value: "me", label: "Me" },
  { value: "other", label: "Someone else" },
];
// Objects only where choosing between kinds of help: a picture is recognised
// faster than a phrase. Money and age questions keep words.
const NEEDS: { value: FinderNeed; label: string; icon: string; wide?: boolean }[] = [
  { value: "care", label: "Paying for care at home", icon: "house-with-garden" },
  { value: "memory", label: "Memory care", icon: "puzzle-piece" },
  { value: "bills", label: "Everyday bills", icon: "receipt" },
  { value: "health", label: "Medicare and health costs", icon: "stethoscope" },
  { value: "urgent", label: "Something urgent this week", icon: "alarm-clock", wide: true },
];

/** The object a program is shown with in the reward card, the reveal and the list. */
function iconFor(name: string): string {
  if (/memory|alzheim|dementia/i.test(name)) return "puzzle-piece";
  if (/meal|snap|food|nutrition|calfresh|commodit/i.test(name)) return "pot-of-food";
  if (/medicare|health|prescri|extra help|\bship\b|\bmsp\b/i.test(name)) return "stethoscope";
  if (/energy|liheap|weatheriz|utilit|bill|lifeline|phone|tax/i.test(name)) return "receipt";
  return "house-with-garden";
}

function Obj({ name, size = 40 }: { name: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/images/benefits-conversation/${name}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />;
}

interface Snapshot { step: Step; facts: KnownFacts; asked: FactKey[] }

export default function BenefitsConversationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("who");
  const [whoFromLink, setWhoFromLink] = useState(false);
  const [who, setWho] = useState<FinderWho | null>(null);
  const [need, setNeed] = useState<FinderNeed | null>(null);
  const [zip, setZip] = useState("");
  const [stateCode, setStateCode] = useState<string | null>(null);
  // The county picks the family's own Area Agency on Aging; without it the
  // plan falls back to the state's first agency alphabetically.
  const [county, setCounty] = useState<string | null>(null);
  const [facts, setFacts] = useState<KnownFacts>(EMPTY);
  const [asked, setAsked] = useState<FactKey[]>([]);
  const [turn, setTurn] = useState<ConversationTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [leftShown, setLeftShown] = useState<number | null>(null);
  const [reward, setReward] = useState<string[] | null>(null);
  const [pillOpen, setPillOpen] = useState(false);
  const [plan, setPlan] = useState<FinderResult | null>(null);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepShownAt = useRef<number>(Date.now());
  // True once the link's ?who= has been read, so the first screen logged is
  // the one the family actually sees.
  const [ready, setReady] = useState(false);

  const stateName = US_STATES.find((s) => s.value === stateCode)?.label ?? null;
  const v = finderVoice(who);
  const them = who === "me" || !who ? "you" : v.subject;

  const track = useCallback((event: TrackEvent, stepName: string, stepNumber: number) => {
    trackBenefitsEvent({
      event,
      sessionId: getOrCreateSessionId(),
      stateCode,
      stateName: null,
      providerName: null,
      providerSlug: TRACKING_KEY,
      variant: VARIANT,
      stepName,
      stepNumber,
      timeOnStepMs: event === "benefits_step_completed" ? Date.now() - stepShownAt.current : undefined,
      entrySource: ENTRY_SOURCE,
    });
  }, [stateCode]);

  // A link from an email or the hub can say who it's for (?who=parent).
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("who");
    if (w && (WHO_VALUES as readonly string[]).includes(w)) {
      setWho(w as FinderWho);
      setWhoFromLink(true);
      setStep("need");
    }
    setReady(true);
  }, []);

  useEffect(() => () => { if (rewardTimer.current) clearTimeout(rewardTimer.current); }, []);

  // The step a family is looking at: the opening screens by name, then each
  // engine question by the fact it asks ("dailyHelp", "savings"), then the
  // reveal and the result. Fired once per screen shown.
  const viewName = !ready ? null : step === "engine" ? (turn?.question && !loading && !reward ? turn.question.fact : null) : step === "result" ? (plan ? "results" : null) : step;
  const entryTracked = useRef(false);
  const lastViewed = useRef<string | null>(null);
  useEffect(() => {
    if (!entryTracked.current) {
      entryTracked.current = true;
      track("benefits_entry_viewed", "entry", 0);
    }
  }, [track]);
  useEffect(() => {
    if (!viewName || viewName === lastViewed.current) return;
    lastViewed.current = viewName;
    stepShownAt.current = Date.now();
    track("benefits_step_viewed", viewName, history.length + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewName]);
  const completed = (name: string) => track("benefits_step_completed", name, history.length + 1);

  const ask = useCallback(async (f: KnownFacts, a: FactKey[], before: ConversationProgram[] | null) => {
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
      const t = body as ConversationTurn;
      // The reward: programs this answer just made likely.
      const was = new Set((before || []).filter((p) => p.status === "likely").map((p) => p.id));
      const fresh = before ? t.programs.filter((p) => p.status === "likely" && !was.has(p.id)).map((p) => p.name) : [];
      if (fresh.length) {
        setReward(fresh);
        if (rewardTimer.current) clearTimeout(rewardTimer.current);
        rewardTimer.current = setTimeout(() => setReward(null), 1300);
      }
      setTurn(t);
      if (t.question) {
        const n = t.left;
        setLeftShown((prev) => (prev == null ? n : Math.max(1, Math.min(prev - 1, n))));
      } else {
        setStep("reveal");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load the next question.");
    } finally {
      setLoading(false);
    }
  }, [stateCode]);

  useEffect(() => {
    if (step === "engine" && !turn && stateCode) void ask(facts, asked, null);
  }, [step, turn, stateCode, facts, asked, ask]);

  const remember = () => setHistory((h) => [...h, { step, facts, asked }]);

  const answerFact = (fact: FactKey, value: string | null) => {
    completed(value ? fact : `${fact}:not_sure`);
    remember();
    const f = value ? ({ ...facts, [fact]: value } as KnownFacts) : facts;
    const a = [...asked, fact];
    setFacts(f);
    setAsked(a);
    setPillOpen(false);
    void ask(f, a, turn?.programs ?? null);
  };

  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setReward(null);
    setLeftShown(null);
    setStep(prev.step);
    setFacts(prev.facts);
    setAsked(prev.asked);
    if (prev.step === "engine") void ask(prev.facts, prev.asked, null);
  };

  const finderAnswers = (): FinderAnswers => ({
    ...emptyFinderAnswers(),
    who,
    zip,
    stateCode,
    county,
    place: stateName,
    age: facts.age,
    needs: need ? [need] : ["care"],
    household: facts.household === "couple" ? "2" : facts.household === "alone" ? "1" : null,
    income: facts.income ?? (asked.includes("income") ? "unsure" : null),
    // Carry what the conversation learned; a fact it never asked stays unknown
    // rather than "no", which would rule programs out unasked.
    medicaid: facts.medicaid === "has" ? "alreadyHas" : facts.medicaid === "no" ? "doesNotHave" : asked.includes("medicaid") ? "notSure" : null,
    veteran: facts.veteran ?? (asked.includes("veteran") ? "unsure" : null),
    dailyHelp: facts.dailyHelp,
    savings: facts.savings,
  });

  /** The first call comes from the finder's engine, which reads the same answers. */
  const openResult = async () => {
    completed("reveal");
    remember();
    setStep("result");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/benefits/finder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(finderAnswers()) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't load your first call.");
      setPlan(body as FinderResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load your first call.");
    } finally {
      setLoading(false);
    }
  };

  /** "Text me this" uses the finder's send-plan form, unchanged. */
  const textMe = () => {
    if (!plan) return;
    // "contact" is the finder's name for asking for the plan; the track route
    // turns it into a lead_started growth event.
    completed("contact");
    try {
      localStorage.setItem(FINDER_KEY, JSON.stringify({ answers: finderAnswers(), stepIndex: 99, phase: "results", result: plan, cohort: null, savedAt: Date.now() }));
    } catch {
      // Storage blocked: the finder opens on its first question instead.
    }
    router.push("/benefits/finder");
  };

  const programs = turn?.programs ?? [];
  const likely = programs.filter((p) => p.status === "likely");
  const checking = programs.filter((p) => p.status === "check");

  // Progress fills forward and never shows a count: a total that grew
  // ("6 of 6", "7 of 7", "8 of 8" on the first walk-through) reads as
  // endless. Done over done-plus-left only rises, because "left" only shrinks.
  const opening = (whoFromLink ? 0 : 1) + 2;
  const done =
    (step === "who" ? 0 : step === "need" ? (whoFromLink ? 0 : 1) : step === "zip" ? opening - 1 : opening) + asked.length;
  // The engine's own "left" starts low, so the bar is anchored on the typical
  // five engine questions (median 4 to 5 in simulation); it still only rises.
  const TYPICAL = 5;
  const engineTotal = Math.max(TYPICAL, asked.length + (step === "engine" ? (leftShown ?? 1) : TYPICAL));
  const fill = Math.min(0.96, (done + 0.5) / (opening + engineTotal + 0.5));
  const almostDone = step === "engine" && asked.length >= TYPICAL - 1 && (leftShown ?? 3) <= 1;
  const showBar = step !== "reveal" && step !== "result";

  return (
    <div className="flex flex-col gap-6 min-h-[70vh]">
      <style>{`
        @keyframes convRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        @keyframes convPop { 0% { opacity: 0; transform: translateY(8px) scale(.97) } 100% { opacity: 1; transform: none } }
        .conv-rise { animation: convRise .32s cubic-bezier(.16,1,.3,1) both }
        .conv-pop { animation: convPop .28s cubic-bezier(.16,1,.3,1) both }
        @media (prefers-reduced-motion: reduce) { .conv-rise, .conv-pop { animation: none } }
      `}</style>

      {showBar && (
        <div className="flex flex-col gap-3">
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-primary-700 transition-[width] duration-500 ease-out" style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-[14px] text-gray-500 min-h-[22px]">
            {history.length ? (
              <button type="button" onClick={back} className="bg-transparent border-none p-0 text-gray-600 font-medium cursor-pointer">← Back</button>
            ) : <span />}
            <span>{step === "engine" ? (almostDone ? "Almost done" : "") : "About 2 minutes"}</span>
          </div>
        </div>
      )}

      {step === "who" && (
        <Screen key="who" title="Who are you looking into benefits for?">
          {WHO.map((o) => <Choice key={o.value} label={o.label} onClick={() => { completed("who"); remember(); setWho(o.value); setStep("need"); }} />)}
        </Screen>
      )}

      {step === "need" && (
        <Screen key="need" title={`What would help ${who === "other" ? "them" : them} most right now?`}>
          <div className="grid grid-cols-2 gap-2.5">
            {NEEDS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { completed("need"); remember(); setNeed(o.value); setStep("zip"); }}
                className={`text-left bg-white border border-gray-200 rounded-[18px] p-3.5 cursor-pointer active:scale-[.98] transition-transform [@media(hover:hover)]:hover:border-primary-600 ${o.wide ? "col-span-2 flex items-center gap-3" : "flex flex-col gap-2.5"}`}
              >
                <Obj name={o.icon} size={o.wide ? 36 : 44} />
                <span className="text-[15px] font-semibold text-gray-900 leading-snug">{o.label}</span>
              </button>
            ))}
          </div>
        </Screen>
      )}

      {step === "zip" && (
        <Screen key="zip" title={who === "me" || !who ? "What's your ZIP code?" : "What ZIP code do they live in?"} sub="Most programs are run by the state.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const st = zip.length === 5 ? zipToState(zip) : null;
              if (!st) { setError(zip.length === 5 ? "We can only look up programs in the 50 states and DC so far. Check the five digits." : "Enter all five digits."); return; }
              setError(null);
              completed("zip");
              remember();
              setStateCode(st);
              setCounty(null);
              void zipToCounty(zip).then(setCounty);
              setTurn(null);
              setStep("engine");
            }}
            className="flex gap-2.5"
          >
            <input
              id="conversation-zip"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="flex-1 min-w-0 min-h-[58px] rounded-2xl border border-gray-300 bg-white px-4 text-[20px] tracking-wide focus:border-primary-700 focus:outline-none"
              aria-label="ZIP code"
            />
            <button type="submit" className="min-h-[58px] px-6 rounded-2xl bg-gray-900 text-white font-semibold border-none cursor-pointer">Next</button>
          </form>
        </Screen>
      )}

      {step === "engine" && (
        reward ? (
          <div key={reward.join("|")} className="conv-pop flex-1 flex items-center justify-center py-16">
            <div className="flex items-center gap-3.5 bg-white border border-gray-200 rounded-[20px] px-4 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.08)] max-w-[420px]">
              <Obj name={iconFor(reward[0])} size={44} />
              <div>
                <p className="m-0 text-[16px] font-semibold text-gray-900">
                  {reward.length === 1
                    ? `${shortName(reward[0], stateName)} looks likely`
                    : reward.length === 2
                      ? `${shortName(reward[0], stateName)} and ${shortName(reward[1], stateName)} look likely`
                      : `${shortName(reward[0], stateName)}, ${shortName(reward[1], stateName)} and ${reward.length - 2} more look likely`}
                </p>
                <p className="m-0 text-[14px] text-gray-500">Based on what you just told us.</p>
              </div>
            </div>
          </div>
        ) : turn?.question && !loading ? (() => {
          const c = questionCopy(turn.question.fact, who, turn.question.turnsOn, stateName);
          return (
            <Screen
              key={turn.question.fact}
              title={c.title}
              sub={c.why}
              pill={
                <button type="button" onClick={() => likely.length && setPillOpen((o) => !o)} className="self-start bg-primary-50 text-primary-800 text-[13px] font-semibold rounded-full px-3 py-1.5 border-none cursor-pointer">
                  {likely.length ? `${likely.length} look${likely.length === 1 ? "s" : ""} likely` : "Nothing settled yet"}
                  {likely.length ? <span aria-hidden="true"> {pillOpen ? "▴" : "▾"}</span> : null}
                </button>
              }
              pillList={pillOpen && likely.length ? likely.map((p) => p.name) : null}
            >
              {c.choices.map((o) => <Choice key={o.value} label={o.label} onClick={() => answerFact(turn.question!.fact, o.value)} />)}
              <Choice label="I'm not sure" ghost onClick={() => answerFact(turn.question!.fact, null)} />
            </Screen>
          );
        })() : error ? null : <Thinking text="One moment…" />
      )}

      {step === "reveal" && (
        <div className="conv-rise flex-1 flex flex-col">
          {/* The bar row (and its Back) is hidden here, but the last answer
              must stay changeable (pre-test, 5 Oct). */}
          <button type="button" onClick={back} className="self-start bg-transparent border-none p-0 text-[14px] text-gray-600 font-medium cursor-pointer">← Back</button>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 py-10">
            <div className="flex gap-2">
              {[...new Set((likely.length ? likely : checking).map((p) => iconFor(p.name)))].slice(0, 3).map((i) => <Obj key={i} name={i} size={60} />)}
            </div>
            <h1 className="font-display text-[38px] sm:text-[44px] leading-[1.05] text-gray-900 m-0 max-w-[14ch] [text-wrap:balance]">
              {likely.length
                ? `${likely.length} program${likely.length === 1 ? "" : "s"} look${likely.length === 1 ? "s" : ""} likely for ${them}.`
                : `${checking.length} program${checking.length === 1 ? " is" : "s are"} worth checking.`}
            </h1>
            <p className="m-0 text-[15px] text-gray-500">The first call takes about ten minutes.</p>
          </div>
          <div className="flex flex-col gap-3 pb-4">
            <button type="button" onClick={() => void openResult()} className="min-h-[58px] rounded-full bg-gray-900 text-white text-[17px] font-semibold border-none cursor-pointer">
              See your first call
            </button>
            {likely.length && checking.length ? <p className="m-0 text-center text-[14px] text-gray-500">{checking.length} more worth checking</p> : null}
          </div>
        </div>
      )}

      {step === "result" && (
        loading || !plan ? (
          error ? (
            <div className="flex gap-3">
              <button type="button" onClick={back} className="min-h-[52px] px-5 rounded-2xl border border-gray-200 bg-white text-gray-800 font-medium cursor-pointer">← Back</button>
              <button type="button" onClick={() => { setHistory((h) => h.slice(0, -1)); void openResult(); }} className="min-h-[52px] px-5 rounded-2xl bg-gray-900 text-white font-semibold border-none cursor-pointer">Try again</button>
            </div>
          ) : <Thinking text="Putting your first call together…" />
        ) : <ResultView plan={plan} callFor={v.callFor} onBack={back} onTextMe={textMe} onCall={() => completed("call")} />
      )}

      {error && <p role="alert" className="text-[15px] text-red-700 m-0">{error}</p>}
    </div>
  );
}

function Screen({ title, sub, pill, pillList, children }: { title: string; sub?: string; pill?: React.ReactNode; pillList?: string[] | null; children: React.ReactNode }) {
  return (
    <section className="conv-rise flex flex-col gap-4">
      {pill}
      {pillList ? (
        <ul className="list-none m-0 p-0 -mt-1">
          {pillList.map((n) => <li key={n} className="text-[14px] text-gray-600 py-1">{n}</li>)}
        </ul>
      ) : null}
      <h1 className="text-[26px] sm:text-[30px] font-bold tracking-[-0.01em] leading-[1.2] text-gray-900 m-0 [text-wrap:balance]">{title}</h1>
      {sub ? <p className="text-[15px] text-gray-500 m-0 -mt-2">{sub}</p> : null}
      <div className="flex flex-col gap-2.5 mt-1">{children}</div>
    </section>
  );
}

function Choice({ label, onClick, ghost }: { label: string; onClick: () => void; ghost?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[56px] w-full text-left px-4 rounded-2xl border text-[17px] cursor-pointer transition-colors active:bg-primary-800 active:text-white ${
        ghost ? "bg-transparent border-transparent text-gray-500 font-medium" : "bg-white border-gray-200 text-gray-900 font-semibold [@media(hover:hover)]:hover:border-primary-600"
      }`}
    >
      {label}
    </button>
  );
}

function Thinking({ text }: { text: string }) {
  return (
    <div className="py-16 flex items-center justify-center gap-3 text-gray-500" role="status">
      <div className="w-5 h-5 border-[2.5px] border-primary-600 border-t-transparent rounded-full animate-spin" />
      {text}
    </div>
  );
}

function ResultView({ plan, callFor, onBack, onTextMe, onCall }: { plan: FinderResult; callFor: string; onBack: () => void; onTextMe: () => void; onCall: () => void }) {
  const [open, setOpen] = useState<"say" | "ready" | "more" | null>(null);
  const first: FinderProgram | null = plan.firstStep;
  const likelyRest = plan.programs.filter((p) => p.tier === "likely");
  const checkRest = plan.programs.filter((p) => p.tier === "check");
  if (!first) return <p className="text-gray-600">We couldn&apos;t find a first call for this state yet.</p>;
  const isAgency = first.id === "local-agency";
  const script = isAgency
    ? `Hi, I'm looking for help finding benefits ${callFor}. Could you tell me what we might qualify for?`
    : `Hi, I'm calling to ask about ${first.shortName}. I'd like to apply ${callFor}. Could you help me get started?`;

  return (
    <div className="conv-rise flex flex-col gap-5">
      <div className="flex items-center justify-between text-[14px]">
        <button type="button" onClick={onBack} className="bg-transparent border-none p-0 text-gray-600 font-medium cursor-pointer">← Back</button>
        <button type="button" onClick={onTextMe} className="bg-transparent border-none p-0 text-primary-800 font-semibold cursor-pointer">Text me this</button>
      </div>

      <article className="bg-white border border-gray-200 rounded-[24px] p-5 flex flex-col gap-3.5">
        <span className="text-[13px] font-semibold text-primary-700">Start here</span>
        <h1 className="font-display text-[32px] leading-[1.05] text-gray-900 m-0">{first.shortName}</h1>
        {first.what ? <p className="m-0 text-[15px] text-gray-600">{first.what}</p> : null}
        {first.phone ? (
          <a href={telHref(first.phone)} onClick={onCall} className="min-h-[56px] rounded-2xl bg-primary-800 text-white text-[17px] font-semibold flex items-center justify-center no-underline">
            Call {first.phone}
          </a>
        ) : null}
        <div className="flex flex-col">
          <Fold label="What to say" open={open === "say"} onToggle={() => setOpen(open === "say" ? null : "say")}>
            <p className="m-0 text-[15px] text-gray-700">&ldquo;{script}&rdquo;</p>
          </Fold>
          {first.docs.length ? (
            <Fold label={`Have ready: ${first.docs.length} thing${first.docs.length === 1 ? "" : "s"}`} open={open === "ready"} onToggle={() => setOpen(open === "ready" ? null : "ready")}>
              <ul className="m-0 pl-5 flex flex-col gap-1.5 text-[15px] text-gray-700">{first.docs.map((d) => <li key={d}>{d}</li>)}</ul>
            </Fold>
          ) : null}
        </div>
      </article>

      {likelyRest.length ? (
        <section className="flex flex-col">
          <h2 className="text-[15px] font-semibold text-gray-900 m-0 mb-1">Also likely</h2>
          {likelyRest.map((p) => <Row key={p.id} p={p} />)}
        </section>
      ) : null}

      {checkRest.length ? (
        <section className="flex flex-col border-t border-gray-200">
          <button type="button" onClick={() => setOpen(open === "more" ? null : "more")} aria-expanded={open === "more"} className="text-left bg-transparent border-none p-0 py-3 text-[15px] text-gray-500 cursor-pointer">
            {checkRest.length} more worth checking {open === "more" ? "▴" : "▾"}
          </button>
          {open === "more" ? checkRest.map((p) => <Row key={p.id} p={p} />) : null}
        </section>
      ) : null}
    </div>
  );
}

function Fold({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex justify-between items-center bg-transparent border-none px-0 py-3 text-[15px] text-gray-900 font-medium cursor-pointer text-left">
        <span>{label}</span>
        <span className="text-gray-400" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function Row({ p }: { p: FinderProgram }) {
  return (
    <a href={p.url} className="flex items-center gap-3 py-3 border-t border-gray-200 no-underline">
      <Obj name={iconFor(p.name)} size={32} />
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] text-gray-900">{p.shortName}</span>
        {p.what ? <span className="block text-[13px] text-gray-500 truncate">{p.what}</span> : null}
      </span>
    </a>
  );
}
