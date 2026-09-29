"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FinderAnswers,
  type FinderResult,
  type FinderStep,
  emptyFinderAnswers,
  finderSteps,
  isStepAnswered,
} from "@/lib/benefits/finder-answers";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";
import { getOrCreateSessionId } from "@/lib/analytics/session";

/**
 * State for the redesigned finder (/benefits/finder).
 *
 * Every step is logged (viewed, completed) through the same funnel events
 * the program card uses, under variant "finder_v2", so drop-off by step is
 * visible for the first time. The old finder logged a page view and nothing
 * else.
 */

export type FinderPhase = "quiz" | "loading" | "results" | "error";

const STORAGE_KEY = "olera-finder-v2";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ENTRY_SOURCE = "/benefits/finder";
/** provider_activity needs a provider key; this one marks finder rows. */
const TRACKING_KEY = "benefits-finder";
const VARIANT = "finder_v2";

interface Stored {
  answers: FinderAnswers;
  stepIndex: number;
  phase: "quiz" | "results";
  result: FinderResult | null;
  savedAt: number;
}

function load(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s?.answers || Date.now() - s.savedAt > MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

function save(s: Omit<Stored, "savedAt">) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    // Private window or storage full: the quiz still works, it just won't
    // survive a reload.
  }
}

function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function useFinder() {
  const [answers, setAnswers] = useState<FinderAnswers>(emptyFinderAnswers);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<FinderPhase>("quiz");
  const [result, setResult] = useState<FinderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const stepShownAt = useRef<number>(Date.now());

  const steps = finderSteps(answers);
  const step: FinderStep = steps[Math.min(stepIndex, steps.length - 1)];

  // Restore a draft (or finished results) from this browser.
  useEffect(() => {
    const s = load();
    if (s) {
      setAnswers({ ...emptyFinderAnswers(), ...s.answers });
      setStepIndex(s.stepIndex);
      if (s.phase === "results" && s.result) {
        setResult(s.result);
        setPhase("results");
      }
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (phase === "quiz" || phase === "results") {
      save({ answers, stepIndex, phase, result: phase === "results" ? result : null });
    }
  }, [answers, stepIndex, phase, result, restored]);

  const track = useCallback(
    (event: "benefits_entry_viewed" | "benefits_step_viewed" | "benefits_step_completed", stepName: string, stepNumber: number) => {
      trackBenefitsEvent({
        event,
        sessionId: getOrCreateSessionId(),
        stateCode: answers.stateCode,
        stateName: null,
        providerName: null,
        providerSlug: TRACKING_KEY,
        variant: VARIANT,
        stepName,
        stepNumber,
        timeOnStepMs: event === "benefits_step_completed" ? Date.now() - stepShownAt.current : undefined,
        entrySource: ENTRY_SOURCE,
      });
    },
    [answers.stateCode],
  );

  // One entry event per visit, then a view event per step shown.
  const entryTracked = useRef(false);
  useEffect(() => {
    if (!restored || phase !== "quiz") return;
    if (!entryTracked.current) {
      entryTracked.current = true;
      track("benefits_entry_viewed", "entry", 0);
    }
    stepShownAt.current = Date.now();
    track("benefits_step_viewed", step, stepIndex + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phase, restored]);

  const update = useCallback((partial: Partial<FinderAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...partial }));
  }, []);

  const submit = useCallback(
    async (final: FinderAnswers) => {
      setPhase("loading");
      setError(null);
      try {
        const res = await fetch("/api/benefits/finder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(final),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "We couldn't load programs just now. Please try again.");
        setResult(body as FinderResult);
        setPhase("results");
        track("benefits_step_completed", "results", finderSteps(final).length + 1);
        if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't load programs just now. Please try again.");
        setPhase("error");
      }
    },
    [track],
  );

  /** Move on from the current step. Submits after the last one. */
  const next = useCallback(
    (latest?: FinderAnswers) => {
      const a = latest ?? answers;
      const list = finderSteps(a);
      const current = list[Math.min(stepIndex, list.length - 1)];
      if (!isStepAnswered(current, a)) return;
      track("benefits_step_completed", current, stepIndex + 1);
      if (stepIndex >= list.length - 1) {
        void submit(a);
      } else {
        setStepIndex(stepIndex + 1);
      }
    },
    [answers, stepIndex, submit, track],
  );

  /** Answer a single-choice question and move on. */
  const choose = useCallback(
    (partial: Partial<FinderAnswers>) => {
      const latest = { ...answers, ...partial };
      // Switching to "myself" drops the caregiver answers they no longer see.
      if (partial.who === "me") latest.caregiverNeeds = [];
      setAnswers(latest);
      // A short pause so the tap registers visually before the page moves.
      window.setTimeout(() => next(latest), 160);
    },
    [answers, next],
  );

  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const goTo = useCallback(
    (target: FinderStep) => {
      const idx = finderSteps(answers).indexOf(target);
      if (idx < 0) return;
      setStepIndex(idx);
      setPhase("quiz");
    },
    [answers],
  );

  const restart = useCallback(() => {
    clear();
    setAnswers(emptyFinderAnswers());
    setStepIndex(0);
    setResult(null);
    setError(null);
    setPhase("quiz");
  }, []);

  const allAnswered = steps.every((s) => isStepAnswered(s, answers));

  return {
    answers,
    steps,
    allAnswered,
    step,
    stepIndex,
    phase,
    result,
    error,
    restored,
    update,
    choose,
    next,
    back,
    goTo,
    restart,
    retry: () => submit(answers),
    /** Straight to results once every question has an answer, e.g. after
     *  changing one answer from the results page. */
    finish: () => {
      track("benefits_step_completed", step, stepIndex + 1);
      void submit(answers);
    },
    trackContact: () => track("benefits_step_completed", "contact", steps.length + 2),
  };
}

export type FinderState = ReturnType<typeof useFinder>;
