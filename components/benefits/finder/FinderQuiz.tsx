"use client";

import { useEffect, useRef, useState } from "react";
import { zipToState, zipToCounty } from "@/lib/benefits/zip-lookup";
import { US_STATES } from "@/lib/us-states";
import {
  type FinderAnswers,
  type FinderOption,
  type FinderStep,
  AGE_OPTIONS,
  CAREGIVER_OPTIONS,
  INCOME_OPTIONS,
  MEDICAID_OPTIONS,
  NEED_OPTIONS,
  STEP_LABELS,
  WHO_OPTIONS,
  answerLabel,
  finderVoice,
  householdOptions,
  isStepAnswered,
  veteranOptions,
} from "@/lib/benefits/finder-answers";
import type { FinderState } from "@/hooks/use-finder";

// ── Pieces ─────────────────────────────────────────────────────────────────

function Choice<T extends string>({
  option,
  selected,
  multi,
  onClick,
}: {
  option: FinderOption<T>;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  const quiet = option.value === "unsure" || option.value === "notSure";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "w-full min-h-[56px] flex items-center gap-3 text-left rounded-2xl border-[1.5px] px-4 py-3.5 transition-colors cursor-pointer",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        selected ? "border-primary-600 bg-primary-50" : "border-gray-200 bg-white hover:border-primary-200",
        quiet && !selected ? "border-dashed" : "",
      ].join(" ")}
    >
      {multi && (
        <span
          aria-hidden
          className={[
            "w-5 h-5 shrink-0 rounded-md border-[1.5px] grid place-items-center text-[13px] text-white",
            selected ? "bg-primary-600 border-primary-600" : "border-gray-400",
          ].join(" ")}
        >
          {selected ? "✓" : ""}
        </span>
      )}
      <span className="flex flex-col">
        <span className={["text-[15px] font-medium", quiet && !selected ? "text-gray-600" : "text-gray-900"].join(" ")}>
          {option.label}
        </span>
        {option.hint && <span className="text-[13px] text-gray-500">{option.hint}</span>}
      </span>
    </button>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-gray-500">{children}</p>;
}

/** Sits directly under (or beside) the answer it confirms, never pushed to
 *  the bottom of the page away from it. */
function Continue({ disabled, onClick, label = "Continue", inline }: { disabled: boolean; onClick: () => void; label?: string; inline?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={(inline ? "shrink-0 " : "w-full sm:w-auto sm:self-start ") + "min-h-[52px] px-7 rounded-2xl bg-primary-800 text-white text-base font-semibold border-none cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-primary-700 transition-colors"}
    >
      {label}
    </button>
  );
}

// ── ZIP ────────────────────────────────────────────────────────────────────

function ZipQuestion({ f, heading }: { f: FinderState; heading: string }) {
  const [zip, setZip] = useState(f.answers.zip);
  const [status, setStatus] = useState<"idle" | "bad">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (zip.length !== 5) {
      if (f.answers.stateCode) f.update({ stateCode: null, county: null, place: null });
      setStatus("idle");
      return;
    }
    const state = zipToState(zip);
    if (!state) {
      setStatus("bad");
      f.update({ zip, stateCode: null, county: null, place: null });
      return;
    }
    setStatus("idle");
    const stateName = US_STATES.find((s) => s.value === state)?.label ?? state;
    f.update({ zip, stateCode: state, place: stateName });
    let cancelled = false;
    zipToCounty(zip).then((county) => {
      if (cancelled || !county) return;
      // The lookup returns the bare name ("Bexar"). Louisiana has parishes;
      // Alaska's boroughs and independent cities already carry their kind.
      const kind = state === "LA" ? "Parish" : state === "AK" ? "" : "County";
      const label = kind && !/county|parish|borough|city|census area/i.test(county) ? `${county} ${kind}` : county;
      f.update({ county, place: `${label}, ${stateName}` });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip]);

  return (
    <>
      <h2 className="font-display text-[28px] lg:text-[34px] leading-tight text-gray-900 text-balance">{heading}</h2>
      <Why>Programs and phone numbers depend on the state and county.</Why>
      <label htmlFor="finder-zip" className="sr-only">ZIP code</label>
      <div className="flex gap-2.5 max-w-[420px]">
      <input
        ref={inputRef}
        id="finder-zip"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && f.answers.stateCode) f.next();
        }}
        placeholder="ZIP code"
        className="flex-1 min-w-0 rounded-2xl border-[1.5px] border-gray-200 bg-white px-4 py-3.5 text-lg font-medium tracking-wider text-gray-900 focus:border-primary-600 focus:outline-none"
      />
      <Continue inline disabled={!f.answers.stateCode} onClick={() => f.next()} />
      </div>
      {f.answers.stateCode && f.answers.place && (
        <p className="text-[15px] font-medium text-primary-800">✓ {f.answers.place}</p>
      )}
      {status === "bad" && (
        <p className="text-[14px] text-error-700" role="alert">
          We don&apos;t recognize that ZIP code. Please check it and try again.
        </p>
      )}
    </>
  );
}

// ── One question ───────────────────────────────────────────────────────────

function Question({ f }: { f: FinderState }) {
  const a = f.answers;
  const v = finderVoice(a.who);
  const h = (text: string) => (
    <h2 className="font-display text-[28px] lg:text-[34px] leading-tight text-gray-900 text-balance">{text}</h2>
  );
  const list = "flex flex-col gap-2.5";
  const grid = "grid grid-cols-1 lg:grid-cols-2 gap-2.5";

  const single = <T extends string>(opts: FinderOption<T>[], value: T | null, key: keyof FinderAnswers, layout = grid) => (
    <div className={layout}>
      {opts.map((o) => (
        <Choice key={o.value} option={o} selected={value === o.value} onClick={() => f.choose({ [key]: o.value } as Partial<FinderAnswers>)} />
      ))}
    </div>
  );

  const toggle = <T extends string>(current: T[], value: T, exclusive?: T): T[] => {
    if (value === exclusive) return current.includes(value) ? [] : [value];
    const without = current.filter((x) => x !== exclusive);
    return without.includes(value) ? without.filter((x) => x !== value) : [...without, value];
  };

  switch (f.step) {
    case "who":
      return (
        <>
          {h("Who are you looking for help for?")}
          {single(WHO_OPTIONS, a.who, "who", list)}
          <Why>We&apos;ll word every question for the right person. This is a guide, not an application.</Why>
        </>
      );
    case "zip":
      return <ZipQuestion f={f} heading={`What's ${v.possessive} ZIP code?`} />;
    case "age":
      return (
        <>
          {h(`How old ${v.be} ${v.subject}?`)}
          {single(AGE_OPTIONS, a.age, "age")}
          <Why>Many programs start at 60 or 65, so these are the lines that matter.</Why>
        </>
      );
    case "needs":
      return (
        <>
          {h("What would help most right now?")}
          <p className="text-gray-600">Pick any. This orders your results and never hides a program.</p>
          <div className={list}>
            {NEED_OPTIONS.map((o) => (
              <Choice key={o.value} option={o} multi selected={a.needs.includes(o.value)} onClick={() => f.update({ needs: toggle(a.needs, o.value) })} />
            ))}
          </div>
          <Continue disabled={!isStepAnswered("needs", a)} onClick={() => f.next()} />
        </>
      );
    case "caregiver":
      return (
        <>
          {h("And for you, as the one helping?")}
          <p className="text-gray-600">Pick any. Caregivers can get help too.</p>
          <div className={list}>
            {CAREGIVER_OPTIONS.map((o) => (
              <Choice
                key={o.value}
                option={o}
                multi
                selected={a.caregiverNeeds.includes(o.value)}
                onClick={() => f.update({ caregiverNeeds: toggle(a.caregiverNeeds, o.value, "ok") })}
              />
            ))}
          </div>
          <Continue disabled={!isStepAnswered("caregiver", a)} onClick={() => f.next()} />
        </>
      );
    case "household":
      return (
        <>
          {h(`Who lives in ${v.possessive} home?`)}
          {single(householdOptions(a.who), a.household, "household", list)}
          <Why>Income limits depend on household size, so we ask this first.</Why>
        </>
      );
    case "income":
      return (
        <>
          {h(`About how much comes in each month${a.household && a.household !== "1" ? ", for the whole household" : ""}?`)}
          <p className="text-gray-600">Count Social Security, pensions, VA payments and wages, before anything is taken out.</p>
          {single(INCOME_OPTIONS, a.income, "income")}
        </>
      );
    case "medicaid":
      return (
        <>
          {h(`${v.doQ} have Medicaid?`)}
          <p className="text-gray-600">Medicaid is not Medicare. Some states call it something else, like Medi-Cal or STAR+PLUS.</p>
          {single(MEDICAID_OPTIONS, a.medicaid, "medicaid")}
        </>
      );
    case "veteran":
      return (
        <>
          {h(`${v.didQ} serve in the military?`)}
          {single(veteranOptions(a.who), a.veteran, "veteran")}
          <Why>Last question.</Why>
        </>
      );
  }
}

// ── Rail (desktop) ─────────────────────────────────────────────────────────

/**
 * The care profile as a timeline. Every row is the same height whatever its
 * state, and the answer line is always reserved, so nothing below it moves
 * when you answer, go back, or move on (TJ flagged the jumping, 2026-09-30).
 */
function Rail({ f }: { f: FinderState }) {
  return (
    <nav aria-label="Your answers">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 mb-4 mt-0">
        {f.answers.who && f.answers.who !== "me" ? "Their care profile" : "Your care profile"}
      </p>
      <ol className="relative m-0 p-0 list-none">
        {/* The connecting line runs behind the dots. */}
        <span aria-hidden className="absolute left-[9px] top-[12px] bottom-[34px] w-px bg-gray-300" />
        {f.steps.map((s: FinderStep, i) => {
          const now = i === f.stepIndex;
          const answered = isStepAnswered(s, f.answers);
          const done = !now && answered;
          const label = answered ? answerLabel(s, f.answers) : null;
          return (
            <li key={s} className="relative">
              <button
                type="button"
                disabled={!answered || now}
                onClick={() => f.goTo(s)}
                aria-current={now ? "step" : undefined}
                className="w-full h-[56px] grid grid-cols-[20px_minmax(0,1fr)] gap-3 items-start bg-transparent border-none p-0 text-left cursor-pointer disabled:cursor-default group"
              >
                <span
                  aria-hidden
                  className={[
                    "relative z-[1] mt-[2px] w-[19px] h-[19px] rounded-full border-[1.5px] grid place-items-center text-[11px] leading-none text-white transition-colors duration-200",
                    done
                      ? "bg-primary-600 border-primary-600"
                      : now
                        ? "bg-vanilla-100 border-gray-900 after:content-[''] after:w-[9px] after:h-[9px] after:rounded-full after:bg-gray-900"
                        : "bg-vanilla-100 border-gray-300",
                  ].join(" ")}
                >
                  {done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex flex-col">
                  <span
                    className={[
                      "text-[15px] font-medium leading-[22px] transition-colors duration-200",
                      done || now ? "text-gray-900" : "text-gray-400",
                      done ? "group-hover:underline underline-offset-2" : "",
                    ].join(" ")}
                  >
                    {STEP_LABELS[s]}
                  </span>
                  {/* Always one line, reserved even when empty. */}
                  <span className="block truncate text-[13px] leading-[20px] text-gray-500" title={label ?? undefined}>
                    {label ?? "\u00a0"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function FinderQuiz({ f }: { f: FinderState }) {
  const first = f.stepIndex === 0;
  const progress = Math.round(((f.stepIndex + 1) / (f.steps.length + 1)) * 100);

  if (first) {
    // The cover is the first question: title, promise and trust line beside
    // "Who is this for", so one tap starts the quiz.
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-8 lg:gap-16 items-center lg:min-h-[520px]">
        <div className="flex flex-col gap-3 lg:gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Free · private · about 3 minutes</p>
          <h1 className="font-display text-[32px] lg:text-[52px] leading-[1.08] text-gray-900 text-balance">
            Find help paying for care and bills
          </h1>
          <p className="text-base lg:text-lg text-gray-600 max-w-[34ch]">
            Answer a few questions. We&apos;ll show what to do first, who to call and what to bring.
          </p>
        </div>
        <div className="flex flex-col gap-4 lg:bg-white lg:border lg:border-gray-200 lg:rounded-3xl lg:p-7 lg:shadow-[0_18px_40px_-28px_rgba(16,24,40,0.35)]">
          <Question f={f} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-8 lg:gap-16">
      <aside className="hidden lg:block">
        <div className="sticky top-[96px]">
          <Rail f={f} />
        </div>
      </aside>
      <div className="flex flex-col gap-5 max-w-[600px]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={f.back}
            className="min-h-[44px] -ml-2 px-2 bg-transparent border-none text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900"
          >
            ‹ Back
          </button>
          <div className="flex-1 h-1 rounded bg-gray-200 overflow-hidden lg:hidden" aria-hidden>
            <div className="h-full bg-primary-600 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-400 tabular-nums lg:hidden">
            {f.stepIndex + 1}/{f.steps.length}
          </span>
          {f.allAnswered && f.stepIndex < f.steps.length - 1 && (
            <button
              type="button"
              onClick={f.finish}
              className="ml-auto min-h-[44px] px-3 bg-transparent border-none text-sm font-semibold text-primary-800 cursor-pointer hover:underline"
            >
              See my updated plan
            </button>
          )}
        </div>
        <Question f={f} />
      </div>
    </div>
  );
}
