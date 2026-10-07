"use client";

/**
 * ProgramBenefitsCard — the "soft lane" conversion card for benefit program
 * pages (the /benefits/[state]/[program] V3 surface).
 *
 * Mirrors the *mechanic* of the provider-page Connection Card (Door A):
 * value first → one email field → one button → trust line. But it's a
 * distinct, self-contained component, NOT the BenefitsDiscoveryModule. The
 * discovery module is question-driven (it infers care need from a Q&A that
 * program pages don't have) and is under active A/B on provider pages — we
 * deliberately don't touch it. Here we reuse only the load-bearing backend:
 *   - /api/benefits/save-results  (family-profile creation + welcome email
 *     that already ships the matched-program breakdown + a /m/{token} link)
 *   - matchesCareNeed             (filter the state's programs for the email)
 *   - trackBenefitsEvent          (funnel analytics, tagged variant="program_card")
 *
 * Post-email enrichment (7 steps):
 *   - After email submission, we show optional enrichment steps to
 *     improve profile completeness from ~21% to ~55%:
 *     1. Who needs care? (Self, Parent, Spouse, Other)
 *     2. How soon? (ASAP, Within a month, In a few months, Just researching)
 *     3. How will you pay? (Medicare, Medicaid, Private insurance, etc.)
 *     4. Want this by text? (phone capture — the SMS-reachability funnel;
 *        DELIBERATELY at this depth: phone is the one ask the dialogue can't
 *        continue without, so the Phase 3 facts go AFTER it, never before.
 *        Server texts the results link immediately so the promise is kept in
 *        seconds, and stores the consent stamp the SMS rungs gate on.)
 *     5-7. Age band / Medicaid / income band (Phase 3 real-situation facts —
 *        the bonus round riding the just-texted-you reciprocity. Each tap
 *        PATCHes immediately so a mid-round abandon loses nothing; Medicaid
 *        is skipped when payment=medicaid, the facts reader already infers
 *        alreadyHas from payment_methods.)
 *   - User can answer any/all or skip to see the success card
 *
 * three_tap arm (program card flow experiment, 2026-09-24; arm assigned by
 * useProgramCardFlow in ProgramPageV3 and passed in as `cardFlow`). The
 * capture step is identical. After the email saves:
 *     1. Who is this for? (Me / A parent / A spouse / Someone else — the
 *        same stored recipient values; sets "you" vs "they" after it)
 *     2. How many people live in your home? (only when the page has an
 *        income table)
 *     3. Is your income under $X a month? (X = the page's own limit for that
 *        household size; Yes / No / Not sure)
 *     → the answer screen: a fixed-string verdict (no AI), the call for the
 *       program they came for (same pick rule as the plan page), what to
 *       say, then quiet "Text me my plan", "2 more questions" (age +
 *       Medicaid) and "See your plan". No inbox banner, no timing or payment
 *       questions.
 *
 * Value-first display:
 *   - savingsRange present (~26% of programs) → lead with "Up to $X/mo"
 *   - empty (~74%)                            → eligibility-first "Could you qualify?"
 *
 * The care need is pre-derived from the program the user is reading (see
 * deriveProgramCareNeed in ProgramPageV3), so there's no care-need step —
 * landing on this program IS the care signal. One field, one tap.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { studyCohort } from "@/lib/benefits/study-cohort";
import { ArrowRight, CheckCircle, Phone, ShieldCheck, Spinner } from "@phosphor-icons/react";
import { trackBenefitsEvent } from "@/lib/analytics/track-step";
import { isPreviewMode } from "@/lib/analytics/preview-mode";
import { matchesCareNeed, type CareNeed } from "@/lib/benefits/match-care-need";
import { useAuth } from "@/components/auth/AuthProvider";
import { getOrCreateVisitId } from "@/lib/analytics/session";
import { trackGrowthEvent } from "@/lib/analytics/growth-attribution";
import {
  trackBenefitsEnrichmentStarted,
  trackBenefitsEnrichmentStepCompleted,
  trackBenefitsEnrichmentStepSkipped,
  trackBenefitsEnrichmentCompleted,
  trackBenefitsNamedStep,
  type BenefitsEnrichmentStep,
} from "@/lib/analytics/benefits-enrichment-tracking";
import type { ProgramCardFlow } from "@/lib/analytics/program-card-variant";
import {
  buildCallScript,
  looksLikeHours,
  stripParen,
  telHref,
  type CallContact,
} from "@/lib/benefits/call-script";
import { benefitAmountLabel, benefitAmountCaption } from "@/lib/benefits/savings-label";

/** Lightweight program shape returned by /api/benefits/programs. */
export interface BenefitsProgram {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  savingsRange?: string;
  programType?: string;
  structuredEligibility?: {
    ageRequirement?: string;
    incomeTable?: Array<{ householdSize: number; monthlyLimit: number }>;
  };
  callContact?: { label: string; phone: string; hours: string | null } | null;
  /** The program's own eligibility summary says it has no income limit. */
  noIncomeLimit?: boolean;
}

export interface ProgramBenefitsCardProps {
  programId: string;
  programName: string;
  programShortName?: string;
  savingsRange?: string;
  programType?: string;
  /** 2-letter state code, e.g. "TX". */
  stateCode: string;
  /** Display state name, e.g. "Texas". */
  stateName: string;
  /** State slug, e.g. "texas". */
  stateId: string;
  /** Care need pre-derived from the program (the page IS the care signal). */
  careNeed: CareNeed;
  /** The state's full program list, fetched once by the parent page (so the
   *  rail and the mobile sheet share one fetch and one entry-view event
   *  instead of each firing their own — see ProgramPageV3). Used to build the
   *  matched set for the welcome email. May be empty before the fetch lands;
   *  submit falls back to [this program]. */
  programs?: BenefitsProgram[];
  /** Anonymous session id, owned by the parent page. */
  sessionId?: string;
  /** Visual context. "bare" drops the card chrome (used inside the mobile sheet,
   *  which provides its own surface). */
  variant?: "rail" | "bare";
  /** Program-card flow experiment arm, resolved once by the page. Null until
   *  resolved; a submit before then runs control. */
  cardFlow?: ProgramCardFlow | null;
  /** This program's own income table (pipeline draft structuredEligibility).
   *  Drives the three_tap household + income questions. */
  incomeTable?: { householdSize: number; monthlyLimit: number }[] | null;
  /** This program's callable contact (pickCallContact over the draft's
   *  contacts, the same rule the plan page's first step uses). */
  callContact?: CallContact | null;
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CardState =
  | "capture"
  | "enrichment_1"
  | "enrichment_2"
  | "enrichment_3"
  | "enrichment_4"
  | "enrichment_5"
  | "enrichment_6"
  | "enrichment_7"
  | "success"
  // three_tap arm
  | "tt_who"
  | "tt_household"
  | "tt_income"
  | "tt_answer"
  | "tt_age"
  | "tt_medicaid"
  // The email belongs to an existing account and the caller is not signed in
  // as it. The server returns no plan token (privacy), so there is nothing to
  // enrich here; the owner gets a sign-in link to their plan by email.
  | "welcome_back";

/** Loose US phone check for the enrichment step — 10 digits (optionally with
 *  a leading 1). The server does the real E.164 normalization. */
function phoneLooksValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

const RECIPIENT_OPTIONS: { label: string; value: string }[] = [
  { label: "Myself", value: "self" },
  { label: "My parent", value: "parent" },
  { label: "My spouse", value: "spouse" },
  { label: "Someone else", value: "other" },
];

// three_tap "Who is this for?" — same stored values as RECIPIENT_OPTIONS.
const TT_RECIPIENT_OPTIONS: { label: string; value: string }[] = [
  { label: "Me", value: "self" },
  { label: "A parent", value: "parent" },
  { label: "A spouse", value: "spouse" },
  { label: "Someone else", value: "other" },
];

const TT_HOUSEHOLD_OPTIONS: { label: string; value: number }[] = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4 or more", value: 4 },
];

type IncomeAnswer = "under" | "over" | "not_sure";

const TT_INCOME_OPTIONS: { label: string; value: IncomeAnswer }[] = [
  { label: "Yes", value: "under" },
  { label: "No", value: "over" },
  { label: "Not sure", value: "not_sure" },
];

/** The display relationship buildCallScript expects. */
const RELATIONSHIP_DISPLAY: Record<string, string> = {
  self: "Self",
  parent: "Parent",
  spouse: "Spouse",
  other: "Family member",
};

/** The income-table row for a household size ("4 or more" reads the 4
 *  row). Exact size only: 81 of 180 tables stop at 2 people, and asking a
 *  family of 3 against the 2-person limit turns a "No" into a wrong verdict,
 *  so a missing size skips the income question instead. When a size repeats
 *  (tiered tables such as Medicare Savings: QMB / SLMB / QI), the highest
 *  limit is the one that still qualifies for something. Null when the table
 *  has no row for that size. */
function incomeRowFor(
  rows: { householdSize: number; monthlyLimit: number }[],
  size: number,
): { householdSize: number; monthlyLimit: number } | null {
  let best: { householdSize: number; monthlyLimit: number } | null = null;
  for (const r of rows) {
    if (r.householdSize === size && (!best || r.monthlyLimit > best.monthlyLimit)) best = r;
  }
  return best;
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// Energy assistance counts the people who share the energy bill (the federal
// LIHEAP household rule), so that is the one program-specific helper line we
// can state reliably from the name alone. Everything else stays generic.
function isEnergyAssistance(name: string): boolean {
  return /\bliheap\b|\bceap\b|energy assistance|heating assistance/i.test(name);
}

const TIMELINE_OPTIONS: { label: string; value: string }[] = [
  { label: "As soon as possible", value: "asap" },
  { label: "Within a month", value: "within_month" },
  { label: "In a few months", value: "few_months" },
  { label: "Just researching", value: "researching" },
];

// Payment options reframed 2026-07-28: live data showed "Medicare" winning
// at ~41% — families answering "what coverage do I have," not "how will I
// pay" (Medicare doesn't pay for long-term care). Medicare and private
// insurance are dropped as noise-generators; "Not sure yet" is the honest
// top answer for this funnel and stores as its own signal
// (metadata.payment_unsure), never into payment_methods.
const PAYMENT_OPTIONS: { label: string; value: string }[] = [
  { label: "Not sure yet, I need to find out what helps", value: "not_sure" },
  { label: "Medicaid", value: "medicaid" },
  { label: "Savings or family will pay", value: "private_pay" },
  { label: "Veterans benefits", value: "veterans_benefits" },
  { label: "Long-term care insurance", value: "long_term_care_insurance" },
];

// Phase 3 facts (steps 5-7). Age answers are BANDS (metadata.age_band), the
// same vocabulary as the email micro-quiz, never a fake exact age.
const AGE_OPTIONS: { label: string; value: string }[] = [
  { label: "Under 65", value: "under_65" },
  { label: "65 to 74", value: "65_74" },
  { label: "75 to 84", value: "75_84" },
  { label: "85 or older", value: "85_plus" },
];

// Worded for whoever needs care: "Yes, I have it" when the family picked
// "Myself", "Yes, they have it" otherwise.
function medicaidOptions(isSelf: boolean): { label: string; value: string }[] {
  return [
    { label: isSelf ? "Yes, I have it" : "Yes, they have it", value: "alreadyHas" },
    { label: "Applying or not sure", value: "notSure" },
    { label: "No", value: "doesNotHave" },
  ];
}

const INCOME_OPTIONS: { label: string; value: string }[] = [
  { label: "Under $1,500 a month", value: "under1500" },
  { label: "$1,500 to $2,500", value: "under2500" },
  { label: "$2,500 to $4,000", value: "under4000" },
  { label: "Over $4,000", value: "over4000" },
  { label: "Prefer not to say", value: "preferNotToSay" },
];

export default function ProgramBenefitsCard({
  programId,
  programName,
  programShortName,
  savingsRange,
  programType,
  stateCode,
  stateName,
  stateId,
  careNeed,
  programs,
  sessionId,
  variant = "rail",
  cardFlow = null,
  incomeTable = null,
  callContact = null,
}: ProgramBenefitsCardProps) {
  const { user } = useAuth();
  const authedEmail = user?.email ?? null;

  const [cardState, setCardState] = useState<CardState>("capture");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState(0);
  const [resultToken, setResultToken] = useState<string | null>(null);
  // save-results sends the welcome email (plan link) only to a NEW account,
  // so the three_tap answer screen mentions the email only when one went.
  const [planEmailed, setPlanEmailed] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [signInEmailed, setSignInEmailed] = useState(true);

  // Enrichment data
  const [recipient, setRecipient] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  // The phone save now runs in the background (the card advances at once),
  // so a failure has to surface on the success card instead.
  const [phoneSaveFailed, setPhoneSaveFailed] = useState(false);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [medicaidChoice, setMedicaidChoice] = useState<string | null>(null);
  const [incomeBand, setIncomeBand] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<BenefitsEnrichmentStep[]>([]);

  // The arm this visitor ran, frozen at submit so a late-resolving arm can't
  // switch flows mid-way. Null before submit.
  const [activeFlow, setActiveFlow] = useState<ProgramCardFlow | null>(null);
  const [previewRun, setPreviewRun] = useState(false);
  // three_tap answers
  const [householdSize, setHouseholdSize] = useState<number | null>(null);
  const [incomeAnswer, setIncomeAnswer] = useState<IncomeAnswer | null>(null);
  const [ttError, setTtError] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textResult, setTextResult] = useState<"sent" | "not_sent" | null>(null);
  const answerHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Track enrichment start only once
  const hasTrackedEnrichmentStart = useRef(false);
  const hasTrackedCtaEngagement = useRef(false);

  const entrySource = `/benefits/${stateId}/${programId}`;
  const ctaSurface = variant === "bare" ? "mobile" : "desktop";
  // Every enrichment event carries the arm (metadata.card_flow).
  const trackParams = {
    programId,
    stateCode,
    profileId: profileId || undefined,
    ctaSurface,
    cardFlow: activeFlow ?? cardFlow ?? null,
  } as const;
  const shortLabel = programShortName || programName;
  // Null when there's no leading dollar value: the eligibility-first headline.
  const savings = benefitAmountLabel(savingsRange);

  const submittableEmail = (authedEmail ?? email).trim();
  const emailValid = EMAIL_RE.test(submittableEmail);

  const trackCtaEngagement = useCallback(() => {
    if (hasTrackedCtaEngagement.current) return;
    hasTrackedCtaEngagement.current = true;
    trackGrowthEvent({
      eventType: "cta_engaged",
      pagePath: entrySource,
      ctaId: "benefits_intake",
      ctaSurface,
      metadata: { card_flow: cardFlow },
    });
  }, [ctaSurface, entrySource, cardFlow]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const flowForSubmit: ProgramCardFlow = cardFlow === "three_tap" ? "three_tap" : "control";
    if (isPreviewMode()) {
      // Admin preview walks either arm with nothing saved or sent: no
      // profile id means every PATCH below is skipped, and the analytics
      // helpers drop events in preview.
      const filteredPreview = (programs ?? []).filter((p) => matchesCareNeed(p, careNeed));
      setResultCount(Math.max(filteredPreview.length, 1));
      setActiveFlow(flowForSubmit);
      setPreviewRun(true);
      setCardState(flowForSubmit === "three_tap" ? "tt_who" : "enrichment_1");
      return;
    }
    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    // Build the matched-program set for the welcome email. Filter the state
    // list (provided by the parent page) to this care need; if that's empty
    // — list not loaded yet, or nothing matched — fall back to just the
    // program the user is reading so we always save & email at least one.
    const thisProgram: BenefitsProgram = {
      id: programId,
      name: programName,
      shortName: shortLabel,
      tagline: "",
      savingsRange,
      programType,
    };
    const filtered = (programs ?? []).filter((p) => matchesCareNeed(p, careNeed));
    const matched = filtered.length > 0 ? filtered : [thisProgram];

    if (sessionId) {
      trackBenefitsEvent({
        event: "benefits_step_completed",
        sessionId,
        stateCode,
        stateName,
        providerName: null,
        providerSlug: null,
        variant: "program_card",
        entrySource,
        stepNumber: 1,
        stepName: "contact",
        careNeedSelected: careNeed,
        cardFlow: flowForSubmit,
      });
    }

    setSaving(true);
    try {
      const res = await fetch("/api/benefits/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careNeed,
          // CARE-NAV study tag, if this browser carries one.
          cohort: studyCohort() ?? undefined,
          // The card never asks: careNeed is derived from the program page
          // (deriveProgramCareNeed). Say so, so nothing downstream presents
          // it as the family's words (lib/benefits/care-need-source.ts).
          careNeedSource: "inferred_from_page",
          age: null,
          medicaidStatus: null,
          incomeRange: null,
          stateCode,
          contactChannel: "email",
          email: submittableEmail.toLowerCase(),
          entrySource,
          sessionId: sessionId || undefined,
          visitId: getOrCreateVisitId(),
          matchedPrograms: matched.map((p) => ({
            programId: p.id,
            stateId,
            name: p.name,
            shortName: p.shortName,
            programType: p.programType,
            savingsRange: p.savingsRange,
          })),
          matchCount: matched.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.suggestion || data?.error || "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }
      setResultCount(typeof data.matchCount === "number" ? data.matchCount : matched.length);
      if (data.existingUser) {
        // No token or profile id comes back for an existing account, so the
        // enrichment steps (which write through the token) cannot run.
        setSignInEmailed(data.signInEmailed !== false);
        setSaving(false);
        setCardState("welcome_back");
        return;
      }
      setResultToken(typeof data.token === "string" ? data.token : null);
      setPlanEmailed(data.isNewUser === true);
      setProfileId(typeof data.profileId === "string" ? data.profileId : null);
      setSaving(false);
      // Transition to the arm's post-email flow
      setActiveFlow(flowForSubmit);
      setCardState(flowForSubmit === "three_tap" ? "tt_who" : "enrichment_1");
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }, [
    emailValid,
    submittableEmail,
    careNeed,
    programs,
    sessionId,
    stateCode,
    stateName,
    stateId,
    entrySource,
    programId,
    programName,
    shortLabel,
    savingsRange,
    programType,
    cardFlow,
  ]);

  const shell =
    variant === "bare"
      ? ""
      : "rounded-2xl border border-gray-200/70 bg-white p-5 shadow-sm shadow-gray-900/[0.03]";

  // Track enrichment started when entering enrichment flow
  useEffect(() => {
    if ((cardState === "enrichment_1" || cardState === "tt_who") && !hasTrackedEnrichmentStart.current && profileId) {
      hasTrackedEnrichmentStart.current = true;
      trackBenefitsEnrichmentStarted({
        programId,
        stateCode,
        profileId,
        ctaSurface,
        cardFlow: activeFlow,
      });
    }
  }, [cardState, profileId, programId, stateCode, ctaSurface, activeFlow]);

  // All update-enrichment PATCHes run through one chain: the route does a
  // read-merge-write on profile metadata, so two in-flight requests can
  // interleave (the later read landing before the earlier write commits) and
  // silently drop a fact. Serializing client-side closes the window.
  const patchChain = useRef<Promise<unknown>>(Promise.resolve());
  const enqueuePatch = useCallback((body: Record<string, unknown>) => {
    const run = (): Promise<Response | null> =>
      fetch("/api/benefits/update-enrichment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null); // best-effort; callers that promise something check it
    const p = patchChain.current.then(run, run);
    patchChain.current = p;
    return p;
  }, []);

  // One action per step. Every answer/Skip advances after a short beat, and
  // before this lock a second tap in that window (or, on the phone step,
  // while the save was in flight) landed on the NEXT step's Skip and threw
  // away a question the family never saw. The lock releases when the step
  // actually changes.
  const stepLock = useRef(false);
  useEffect(() => {
    stepLock.current = false;
  }, [cardState]);
  const claimStep = useCallback(() => {
    if (stepLock.current) return false;
    stepLock.current = true;
    return true;
  }, []);

  // The phone checkpoint: saves steps 1-3 (+phone when given) in one PATCH,
  // then advances into the facts round (5-7) instead of ending the flow.
  // Advances IMMEDIATELY: the save rides the serialized chain in the
  // background (later fact PATCHes queue behind it), so the card never sits
  // on the phone step waiting for the SMS send.
  // Note: finalPayment/finalPhone are passed directly to avoid stale closure
  // issues (React state updates are async, so the state values may not be
  // updated yet when called from selectPayment / submitPhone)
  const saveEnrichmentData = useCallback((
    finalCompletedSteps: BenefitsEnrichmentStep[],
    finalPayment?: string,
    finalPhone?: string
  ) => {
    const payment = finalPayment ?? paymentMethod;
    const phoneToSave = finalPhone?.trim() || undefined;

    // Only call API if we have data to save
    if (profileId && (recipient || timeline || payment || phoneToSave)) {
      const saved = enqueuePatch({
        profileId,
        token: resultToken,
        recipient,
        timeline,
        paymentMethod: payment,
        phone: phoneToSave,
        sessionId,
        completedSteps: finalCompletedSteps,
        cardFlow: activeFlow,
      });
      if (phoneToSave) {
        void saved.then((res) => {
          if (!res || !res.ok) setPhoneSaveFailed(true);
        });
      }
    } else if (phoneToSave) {
      setPhoneSaveFailed(true);
    }

    setCardState("enrichment_5");
  }, [profileId, resultToken, recipient, timeline, paymentMethod, sessionId, enqueuePatch, activeFlow]);

  // End of the flow (after step 7, answered or skipped). The completion
  // marker rides the serialized chain, so it lands AFTER every fact PATCH —
  // the server composes its Slack summary from the finished picture.
  const finishFlow = useCallback((finalCompletedSteps: BenefitsEnrichmentStep[]) => {
    if (profileId) {
      trackBenefitsEnrichmentCompleted(
        { ...trackParams, profileId },
        finalCompletedSteps
      );
      void enqueuePatch({
        profileId,
        token: resultToken,
        source: "benefits_enrichment",
        sessionId,
        enrichmentComplete: true,
        completedSteps: finalCompletedSteps,
        cardFlow: activeFlow,
      });
    }
    setCardState("success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, programId, stateCode, ctaSurface, enqueuePatch, resultToken, sessionId, activeFlow]);

  // Facts round (5-7): every tap PATCHes immediately (through the serialized
  // chain) — a mid-round abandon loses nothing, and the /m gap chips are the
  // backstop for what's skipped. Fire-and-forget; best-effort by design.
  const patchFact = useCallback((fact: { ageBand?: string; medicaidStatus?: string; incomeRange?: string }) => {
    if (!profileId) return;
    void enqueuePatch({
      profileId,
      token: resultToken,
      source: "benefits_enrichment",
      sessionId,
      ...fact,
    });
  }, [profileId, resultToken, sessionId, enqueuePatch]);

  // Medicaid step is redundant when they already told us they'll pay with
  // Medicaid (the facts reader infers alreadyHas from payment_methods).
  const medicaidRedundant = paymentMethod === "medicaid";
  // "You" vs "they": every question after "Who needs care?" speaks to the
  // person who needs care when the family picked "Myself".
  const isSelf = recipient === "self";

  // Step 1: Select recipient
  const selectRecipient = useCallback((val: string) => {
    if (!claimStep()) return;
    setRecipient(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 1];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(1, trackParams);
    setTimeout(() => setCardState("enrichment_2"), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, claimStep]);

  // Step 2: Select timeline
  const selectTimeline = useCallback((val: string) => {
    if (!claimStep()) return;
    setTimeline(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 2];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(2, trackParams);
    setTimeout(() => setCardState("enrichment_3"), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, claimStep]);

  // Step 3: Select payment method
  const selectPayment = useCallback((val: string) => {
    if (!claimStep()) return;
    setPaymentMethod(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 3];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(3, trackParams);
    setTimeout(() => setCardState("enrichment_4"), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, claimStep]);

  // Step 4: Phone (the only typed step — last so it can't dampen the one-tap
  // streak). Submitting texts the results link right away, server-side.
  // phoneSaving guards the awaited save (~2-4s with the SMS): without it a
  // slow-connection double-tap would PATCH twice and send two texts.
  const submitPhone = useCallback(() => {
    if (!phoneLooksValid(phone) || phoneSaving) return;
    if (!claimStep()) return;
    setPhoneSaving(true);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 4];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(4, trackParams);
    // Pass phone directly to avoid stale closure (state won't be updated yet)
    saveEnrichmentData(newCompleted, undefined, phone);
  }, [phone, phoneSaving, completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, saveEnrichmentData, claimStep]);

  // Step 5: Age band
  const selectAge = useCallback((val: string) => {
    if (!claimStep()) return;
    setAgeBand(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 5];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(5, trackParams);
    patchFact({ ageBand: val });
    setTimeout(() => setCardState(medicaidRedundant ? "enrichment_7" : "enrichment_6"), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, patchFact, medicaidRedundant, claimStep]);

  // Step 6: Medicaid status
  const selectMedicaid = useCallback((val: string) => {
    if (!claimStep()) return;
    setMedicaidChoice(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 6];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(6, trackParams);
    patchFact({ medicaidStatus: val });
    setTimeout(() => setCardState("enrichment_7"), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, patchFact, claimStep]);

  // Step 7: Income band
  const selectIncome = useCallback((val: string) => {
    if (!claimStep()) return;
    setIncomeBand(val);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 7];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(7, trackParams);
    patchFact({ incomeRange: val });
    setTimeout(() => finishFlow(newCompleted), 150);
  }, [completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, patchFact, finishFlow, claimStep]);

  // Skip current step
  const handleSkip = useCallback(() => {
    if (!claimStep()) return;
    const stepMap: Record<string, BenefitsEnrichmentStep> = {
      enrichment_1: 1,
      enrichment_2: 2,
      enrichment_3: 3,
      enrichment_4: 4,
      enrichment_5: 5,
      enrichment_6: 6,
      enrichment_7: 7,
    };
    const currentStep = stepMap[cardState];
    if (currentStep) {
      trackBenefitsEnrichmentStepSkipped(
        currentStep,
        trackParams,
        completedSteps
      );
    }

    switch (cardState) {
      case "enrichment_1":
        setTimeout(() => setCardState("enrichment_2"), 150);
        break;
      case "enrichment_2":
        setTimeout(() => setCardState("enrichment_3"), 150);
        break;
      case "enrichment_3":
        setTimeout(() => setCardState("enrichment_4"), 150);
        break;
      case "enrichment_4":
        saveEnrichmentData(completedSteps);
        break;
      case "enrichment_5":
        setTimeout(() => setCardState(medicaidRedundant ? "enrichment_7" : "enrichment_6"), 150);
        break;
      case "enrichment_6":
        setTimeout(() => setCardState("enrichment_7"), 150);
        break;
      case "enrichment_7":
        finishFlow(completedSteps);
        break;
    }
  }, [cardState, completedSteps, programId, stateCode, profileId, ctaSurface, activeFlow, saveEnrichmentData, finishFlow, medicaidRedundant, claimStep]);

  // ─── three_tap arm ─────────────────────────────────────────────────────
  // "You" until they say it's someone else (the sketch's default voice).
  const ttSelf = recipient === null || recipient === "self";
  const incomeRows = (incomeTable || [])
    .filter((r) => typeof r.householdSize === "number" && typeof r.monthlyLimit === "number" && r.monthlyLimit > 0)
    .slice()
    .sort((a, b) => a.householdSize - b.householdSize);
  const hasIncomeTable = incomeRows.length > 0;
  const incomeRow = householdSize != null ? incomeRowFor(incomeRows, householdSize) : null;

  /** Every three_tap write goes through the serialized chain, and a failure
   *  says so inline (house rule: never a silent failed save). */
  const patchTT = useCallback(
    (body: Record<string, unknown>) => {
      if (!profileId) return Promise.resolve(true);
      return enqueuePatch({
        profileId,
        token: resultToken,
        source: "benefits_enrichment",
        sessionId,
        cardFlow: "three_tap",
        ...body,
      }).then((res) => {
        const ok = !!res && res.ok;
        setTtError(ok ? null : "We couldn't save that answer. You can keep going.");
        return ok;
      });
    },
    [profileId, resultToken, sessionId, enqueuePatch],
  );

  const goToAnswer = useCallback(() => {
    setCardState("tt_answer");
  }, []);

  const ttSelectRecipient = useCallback(
    (val: string) => {
      if (!claimStep()) return;
      setRecipient(val);
      const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 1];
      setCompletedSteps(newCompleted);
      trackBenefitsEnrichmentStepCompleted(1, trackParams);
      // Same recipient write as control (syncIntentToProfile), just sent now.
      void patchTT({ recipient: val, completedSteps: newCompleted });
      setTimeout(() => (hasIncomeTable ? setCardState("tt_household") : goToAnswer()), 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completedSteps, claimStep, patchTT, hasIncomeTable, goToAnswer, activeFlow, profileId],
  );

  const ttSelectHousehold = useCallback(
    (n: number) => {
      if (!claimStep()) return;
      setHouseholdSize(n);
      trackBenefitsNamedStep("household_size", "completed", trackParams, { household_size: n });
      void patchTT({ householdSize: n });
      const row = incomeRowFor(incomeRows, n);
      setTimeout(() => (row ? setCardState("tt_income") : goToAnswer()), 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimStep, patchTT, goToAnswer, incomeTable, activeFlow, profileId],
  );

  const ttSelectIncome = useCallback(
    (answer: IncomeAnswer) => {
      if (!claimStep() || !incomeRow || householdSize == null) return;
      setIncomeAnswer(answer);
      trackBenefitsNamedStep("income_vs_limit", "completed", trackParams, {
        answer,
        household_size: householdSize,
        limit: incomeRow.monthlyLimit,
      });
      void patchTT({
        incomeVsLimit: {
          limit: incomeRow.monthlyLimit,
          householdSize,
          answer,
          programId,
          stateId,
        },
      });
      setTimeout(goToAnswer, 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimStep, incomeRow, householdSize, patchTT, goToAnswer, programId, stateId, activeFlow, profileId],
  );

  const ttSkip = useCallback(() => {
    if (!claimStep()) return;
    if (cardState === "tt_who") {
      trackBenefitsEnrichmentStepSkipped(1, trackParams, completedSteps);
      setTimeout(() => (hasIncomeTable ? setCardState("tt_household") : goToAnswer()), 150);
    } else if (cardState === "tt_household") {
      trackBenefitsNamedStep("household_size", "skipped", trackParams);
      // No household size, no honest limit to ask against: straight to the call.
      setTimeout(goToAnswer, 150);
    } else if (cardState === "tt_income") {
      trackBenefitsNamedStep("income_vs_limit", "skipped", trackParams);
      setTimeout(goToAnswer, 150);
    } else if (cardState === "tt_age") {
      trackBenefitsEnrichmentStepSkipped(5, trackParams, completedSteps);
      setTimeout(() => setCardState("tt_medicaid"), 150);
    } else if (cardState === "tt_medicaid") {
      trackBenefitsEnrichmentStepSkipped(6, trackParams, completedSteps);
      setTimeout(() => setCardState("success"), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState, claimStep, completedSteps, hasIncomeTable, goToAnswer, activeFlow, profileId]);

  // The answer — fixed strings, no AI. It reads the same income table the
  // page prints, so it can never disagree with the page.
  const answerKind: "no_table" | "under" | "over" | "unknown" = !hasIncomeTable
    ? "no_table"
    : incomeAnswer === "under"
      ? "under"
      : incomeAnswer === "over"
        ? "over"
        : "unknown";
  // Over the limit: light a matched program with no income table instead,
  // if one has a number to call.
  //
  // "No income table" is NOT "no income limit" (154 of 273 such programs
  // mention an income rule in their summary, Texas Weatherization among
  // them), so one whose own data says it has no income limit goes first, and
  // the copy below never claims the fallback fits.
  const altCandidates =
    answerKind === "over"
      ? (programs ?? [])
          .filter((p) => matchesCareNeed(p, careNeed))
          .filter(
            (p) =>
              p.id !== programId &&
              // A benefit, not a counseling line or directory resource.
              (!p.programType || p.programType === "benefit") &&
              !(p.structuredEligibility?.incomeTable && p.structuredEligibility.incomeTable.length > 0) &&
              !!p.callContact?.phone,
          )
      : [];
  const altProgram = altCandidates.find((p) => p.noIncomeLimit) ?? altCandidates[0] ?? null;
  const callTarget: { programId: string; shortName: string; contact: CallContact } | null = altProgram?.callContact
    ? {
        programId: altProgram.id,
        shortName: altProgram.shortName || altProgram.name,
        contact: { ...altProgram.callContact, description: null },
      }
    : callContact
      ? { programId, shortName: shortLabel, contact: callContact }
      : null;
  const callScript = callTarget
    ? recipient
      ? buildCallScript(callTarget.shortName, RELATIONSHIP_DISPLAY[recipient] ?? null)
      : `Hi, I'm calling to ask about ${callTarget.shortName}. Could you help me get started, or point me to the right person?`
    : null;
  const otherMatches = Math.max(resultCount - 1, 0);

  // Reaching the answer is finishing the flow: fire completion once (events
  // + the completion marker that drives the team's Slack summary), and move
  // focus to the verdict for screen readers.
  const hasFiredAnswer = useRef(false);
  useEffect(() => {
    if (cardState !== "tt_answer") return;
    answerHeadingRef.current?.focus();
    if (hasFiredAnswer.current) return;
    hasFiredAnswer.current = true;
    trackBenefitsEnrichmentCompleted(trackParams, completedSteps, {
      answer_kind: answerKind,
      household_size: householdSize,
      call_program_id: callTarget?.programId ?? null,
    });
    if (profileId) {
      void enqueuePatch({
        profileId,
        token: resultToken,
        source: "benefits_enrichment",
        sessionId,
        enrichmentComplete: true,
        completedSteps,
        cardFlow: "three_tap",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState]);

  const onCallTap = useCallback(() => {
    if (!callTarget) return;
    trackBenefitsNamedStep("call_tapped", "completed", trackParams, {
      call_program_id: callTarget.programId,
      answer_kind: answerKind,
    });
    trackGrowthEvent({
      eventType: "cta_engaged",
      pagePath: entrySource,
      ctaId: "three_tap_call",
      ctaSurface,
      metadata: { card_flow: "three_tap" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callTarget?.programId, answerKind, entrySource, ctaSurface, activeFlow, profileId]);

  const onTextOpen = useCallback(() => {
    setTextOpen(true);
    trackBenefitsNamedStep("text_me_opened", "completed", trackParams);
    trackGrowthEvent({
      eventType: "cta_engaged",
      pagePath: entrySource,
      ctaId: "three_tap_text_me",
      ctaSurface,
      metadata: { card_flow: "three_tap" },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySource, ctaSurface, activeFlow, profileId]);

  // three_tap phone: awaited (not backgrounded like control) because the
  // result shows right here, under the call.
  const ttSubmitPhone = useCallback(async () => {
    if (!phoneLooksValid(phone) || phoneSaving) return;
    setPhoneSaving(true);
    setTtError(null);
    const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 4];
    setCompletedSteps(newCompleted);
    trackBenefitsEnrichmentStepCompleted(4, trackParams);
    if (!profileId) {
      setPhoneSaving(false);
      setTextResult(previewRun ? "sent" : "not_sent");
      return;
    }
    const res = await enqueuePatch({
      profileId,
      token: resultToken,
      source: "benefits_enrichment",
      sessionId,
      phone,
      completedSteps: newCompleted,
      cardFlow: "three_tap",
    });
    setPhoneSaving(false);
    if (!res || !res.ok) {
      setPhoneSaveFailed(true);
      setTtError("We couldn't save your number. Please try again.");
      return;
    }
    const data = await res.json().catch(() => null);
    setTextResult(data?.smsSent ? "sent" : "not_sent");
    if (!data?.smsSent) setPhoneSaveFailed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, phoneSaving, completedSteps, profileId, resultToken, sessionId, enqueuePatch, previewRun, activeFlow]);

  const onMoreOpen = useCallback(() => {
    trackBenefitsNamedStep("more_questions_opened", "completed", trackParams);
    trackGrowthEvent({
      eventType: "cta_engaged",
      pagePath: entrySource,
      ctaId: "three_tap_more",
      ctaSurface,
      metadata: { card_flow: "three_tap" },
    });
    setCardState("tt_age");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySource, ctaSurface, activeFlow, profileId]);

  const ttSelectAge = useCallback(
    (val: string) => {
      if (!claimStep()) return;
      setAgeBand(val);
      const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 5];
      setCompletedSteps(newCompleted);
      trackBenefitsEnrichmentStepCompleted(5, trackParams);
      void patchTT({ ageBand: val });
      setTimeout(() => setCardState("tt_medicaid"), 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimStep, completedSteps, patchTT, activeFlow, profileId],
  );

  const ttSelectMedicaid = useCallback(
    (val: string) => {
      if (!claimStep()) return;
      setMedicaidChoice(val);
      const newCompleted: BenefitsEnrichmentStep[] = [...completedSteps, 6];
      setCompletedSteps(newCompleted);
      trackBenefitsEnrichmentStepCompleted(6, trackParams);
      void patchTT({ medicaidStatus: val });
      setTimeout(() => setCardState("success"), 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimStep, completedSteps, patchTT, activeFlow, profileId],
  );

  // Current step number for progress dots (1-7)
  const currentStepNumber =
    cardState === "enrichment_1" ? 1
    : cardState === "enrichment_2" ? 2
    : cardState === "enrichment_3" ? 3
    : cardState === "enrichment_4" ? 4
    : cardState === "enrichment_5" ? 5
    : cardState === "enrichment_6" ? 6
    : 7;

  // ─── Returning family (existing account, not signed in) ────────────────
  if (cardState === "welcome_back") {
    return (
      <div className={shell}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" weight="fill" />
          <p className="font-serif text-[19px] font-semibold leading-tight text-gray-900">
            Welcome back.
          </p>
        </div>
        <p className="text-[15px] leading-relaxed text-gray-700">
          {signInEmailed ? (
            <>
              We emailed you a link to your plan. {shortLabel} is saved to it,
              ready when you open the link.
            </>
          ) : (
            <>
              {shortLabel} is saved to your plan. Sign in with this email to see
              it.
            </>
          )}
        </p>
      </div>
    );
  }

  // ─── Success state ─────────────────────────────────────────────────────
  if (cardState === "success") {
    return (
      <div className={shell}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" weight="fill" />
          <p className="font-serif text-[19px] font-semibold leading-tight text-gray-900">
            Sent. Check your inbox.
          </p>
        </div>
        <p className="text-[14px] leading-relaxed text-gray-600">
          {resultCount > 0 ? (
            <>
              We emailed{" "}
              <span className="font-medium text-gray-900">
                {resultCount} {stateName} {resultCount === 1 ? "program" : "programs"}
              </span>{" "}
              you may qualify for, with eligibility and how to apply for each.
              {completedSteps.includes(4) &&
                (phoneSaveFailed ? (
                  <> We couldn&apos;t save your phone number, so we won&apos;t text you. Your results are in your email.</>
                ) : (
                  <> Your results link is also on its way by text.</>
                ))}
              {(completedSteps.includes(5) || completedSteps.includes(6) || completedSteps.includes(7)) && (
                <> We sorted your matches around what you shared.</>
              )}
            </>
          ) : (
            <>We saved your search and emailed you the eligibility details for {shortLabel}.</>
          )}
        </p>
        {resultToken && (
          <a
            href={`/m/${resultToken}`}
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary-600 px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-primary-700"
          >
            See your matches
            <ArrowRight className="h-4 w-4" weight="bold" />
          </a>
        )}
      </div>
    );
  }

  // ─── three_tap states ──────────────────────────────────────────────────
  if (cardState.startsWith("tt_")) {
    const optionClass = (selected: boolean) =>
      `w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${
        selected
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 motion-safe:active:scale-[0.98]"
      }`;
    const skipButton = (
      <button
        type="button"
        onClick={ttSkip}
        className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors focus:outline-none focus-visible:text-gray-700 focus-visible:underline"
      >
        Skip
      </button>
    );
    const errorLine = ttError ? (
      <p className="mt-2 text-center text-[13px] text-red-600" role="alert">
        {ttError}
      </p>
    ) : null;
    const previewLine = previewRun ? (
      <p className="mb-3 text-center text-[12px] text-gray-400">Preview: nothing is saved or sent.</p>
    ) : null;

    // Progress dots for the question screens only (1 or 3 questions).
    const ttSteps = hasIncomeTable ? ["tt_who", "tt_household", "tt_income"] : ["tt_who"];
    const ttIndex = ttSteps.indexOf(cardState);
    const dots =
      ttIndex >= 0 && ttSteps.length > 1 ? (
        <div className="flex items-center justify-center gap-1.5 mb-4" aria-hidden>
          {ttSteps.map((st, i) => (
            <div
              key={st}
              className={`rounded-full transition-all duration-300 ${
                i <= ttIndex ? "bg-gray-900 w-6 h-1.5" : "bg-gray-200 w-1.5 h-1.5"
              }`}
            />
          ))}
        </div>
      ) : null;

    if (cardState === "tt_who") {
      return (
        <div className={shell}>
          {previewLine}
          {dots}
          <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Who is this for?</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TT_RECIPIENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ttSelectRecipient(opt.value)}
                  className={optionClass(recipient === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {skipButton}
            {errorLine}
          </div>
        </div>
      );
    }

    if (cardState === "tt_household") {
      const helper = isEnergyAssistance(`${programName} ${shortLabel}`)
        ? "Everyone who shares the utility bills."
        : ttSelf
          ? "Everyone who lives with you."
          : "Everyone who lives with them.";
      return (
        <div className={shell}>
          {previewLine}
          {dots}
          <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {ttSelf ? "How many people live in your home?" : "How many people live in their home?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">{helper}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {TT_HOUSEHOLD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ttSelectHousehold(opt.value)}
                  className={optionClass(householdSize === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {skipButton}
            {errorLine}
          </div>
        </div>
      );
    }

    if (cardState === "tt_income" && incomeRow && householdSize != null) {
      const whose =
        householdSize > 1 ? (ttSelf ? "your household's" : "their household's") : ttSelf ? "your" : "their";
      const people = `${householdSize} ${householdSize === 1 ? "person" : "people"}`;
      return (
        <div className={shell}>
          {previewLine}
          {dots}
          <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              Is {whose} income under {usd(incomeRow.monthlyLimit)} a month?
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">
              Before tax, including Social Security. That&apos;s {stateName}&apos;s limit for {people}.
            </p>
            <div className="space-y-2 mb-4">
              {TT_INCOME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ttSelectIncome(opt.value)}
                  className={optionClass(incomeAnswer === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {skipButton}
            {errorLine}
          </div>
        </div>
      );
    }

    if (cardState === "tt_age") {
      return (
        <div className={shell}>
          {previewLine}
          <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {ttSelf ? "How old are you?" : "How old is the person needing care?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">Two quick taps. These sort your other matches.</p>
            <div className="space-y-2 mb-4">
              {AGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ttSelectAge(opt.value)}
                  className={optionClass(ageBand === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {skipButton}
            {errorLine}
          </div>
        </div>
      );
    }

    if (cardState === "tt_medicaid") {
      return (
        <div className={shell}>
          {previewLine}
          <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {ttSelf ? "Do you have Medicaid?" : "Do they have Medicaid?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">
              Several programs need Medicaid first. Knowing this sorts your list.
            </p>
            <div className="space-y-2 mb-4">
              {medicaidOptions(ttSelf).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => ttSelectMedicaid(opt.value)}
                  className={optionClass(medicaidChoice === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {skipButton}
            {errorLine}
          </div>
        </div>
      );
    }

    // tt_answer (and any tt_ state whose data went missing falls here too).
    const n = householdSize ?? 1;
    const headline =
      answerKind === "under"
        ? n > 1
          ? `${ttSelf ? "Your" : "Their"} household is under the income limit for ${shortLabel}.`
          : `${ttSelf ? "You're" : "They're"} under the income limit for ${shortLabel}.`
        : answerKind === "over"
          ? `${shortLabel} probably isn't a fit at that income.`
          : answerKind === "unknown"
            ? "The agency checks income on the call."
            : "Your next step is one call.";
    const sub =
      answerKind === "under"
        ? "The local agency makes the final call."
        : answerKind === "over"
          ? altProgram
            ? `${altProgram.shortName || altProgram.name} has different rules, so it's worth a call.`
            : "The agency can tell you about other help."
          : answerKind === "no_table"
            ? // No table can mean no income test at all (Seattle Gold Card),
              // so nothing here mentions income.
              "They'll tell you what you need to apply."
            : null;
    const hours =
      callTarget?.contact.hours && looksLikeHours(callTarget.contact.hours) ? callTarget.contact.hours : null;

    return (
      <div className={`${shell} ${variant === "bare" ? "min-h-[72dvh]" : ""} flex flex-col`}>
        {previewLine}
        <div className="motion-safe:animate-in motion-safe:fade-in duration-300 flex flex-1 flex-col">
          {/* The verdict, lit softly — the one thing the button promised. */}
          <div className="relative isolate mb-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-10 rounded-3xl"
              style={{
                background:
                  "radial-gradient(60% 70% at 35% 35%, rgba(241,229,214,0.95), rgba(241,229,214,0) 70%)",
              }}
            />
            <h3
              ref={answerHeadingRef}
              tabIndex={-1}
              className="font-display text-[26px] leading-[1.15] text-gray-900 focus:outline-none"
            >
              {headline}
            </h3>
            {sub && <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">{sub}</p>}
          </div>

          {callTarget && callScript ? (
            <div>
              <p className="text-[12px] font-medium text-gray-500">Who to call</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-snug text-gray-900">
                {stripParen(callTarget.contact.label)}
              </p>
              {hours && <p className="mt-0.5 text-[13px] text-gray-500">{hours}</p>}
              <a
                href={telHref(callTarget.contact.phone)}
                onClick={onCallTap}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-5 py-4 text-[17px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/50 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98]"
                aria-label={`Call ${stripParen(callTarget.contact.label)} at ${callTarget.contact.phone}`}
              >
                <Phone className="h-5 w-5" weight="fill" aria-hidden />
                Call {callTarget.contact.phone}
              </a>
              <div className="mt-3 rounded-2xl rounded-bl-md bg-[#F4EEE6] px-4 py-3">
                <p className="text-[12px] font-medium text-[#8C8882]">What to say</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-gray-900">&ldquo;{callScript}&rdquo;</p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-gray-600">
              Your plan has the next step and who to contact.
            </p>
          )}

          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            {callTarget && !textOpen && textResult === null && (
              <button
                type="button"
                onClick={onTextOpen}
                className="text-[14px] font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary-600/40"
              >
                Text me my plan
              </button>
            )}
            {textOpen && textResult === null && (
              <div className="w-full text-left">
                <p className="text-[13px] text-gray-500 mb-2">
                  We&apos;ll text you a link to your plan. You can reply with any questions;
                  Olera&apos;s care team replies within 2 business days.
                </p>
                <label htmlFor={`tt-phone-${variant}`} className="sr-only">
                  Your mobile number
                </label>
                <input
                  id={`tt-phone-${variant}`}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phoneLooksValid(phone)) {
                      e.preventDefault();
                      void ttSubmitPhone();
                    }
                  }}
                  placeholder="Your mobile number"
                  autoComplete="tel"
                  inputMode="tel"
                  className="block w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 transition focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                />
                <button
                  type="button"
                  onClick={() => void ttSubmitPhone()}
                  disabled={!phoneLooksValid(phone) || phoneSaving}
                  className="mt-2 w-full py-3 px-4 rounded-xl text-[15px] font-semibold text-center transition-all duration-150 bg-gray-900 text-white disabled:opacity-40 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
                >
                  {phoneSaving ? "Sending…" : "Text me"}
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                  By adding your number you agree to receive care-related texts from Olera.
                  Reply STOP anytime.
                </p>
              </div>
            )}
            {textResult === "sent" && (
              <p className="text-[14px] text-gray-700" role="status">
                Sent. Check your texts.
              </p>
            )}
            {textResult === "not_sent" && (
              <p className="text-[14px] text-gray-700" role="status">
                {planEmailed || previewRun
                  ? "We couldn't text that number. Your plan link is in your email."
                  : "We couldn't text that number."}
              </p>
            )}
            {errorLine}
            {(planEmailed || previewRun) && (
              <p className="text-[13px] text-gray-400">Your plan link is in your email.</p>
            )}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 pt-5 text-center">
            <button
              type="button"
              onClick={onMoreOpen}
              className="text-[13px] text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:underline"
            >
              {otherMatches > 0
                ? `2 more questions sort your other ${otherMatches} ${otherMatches === 1 ? "match" : "matches"}`
                : "2 more questions sharpen your plan"}
            </button>
            {resultToken && (
              <a
                href={`/m/${resultToken}`}
                onClick={() => trackBenefitsNamedStep("plan_opened", "completed", trackParams)}
                className="text-[13px] font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 focus:outline-none focus-visible:underline"
              >
                See your plan
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Enrichment states ─────────────────────────────────────────────────
  if (cardState.startsWith("enrichment_")) {
    return (
      <div className={shell}>
        {/* Success banner */}
        <div className="mb-4 bg-emerald-50/70 rounded-xl px-4 py-3 border border-emerald-100">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900 truncate">
                Sent to your inbox
              </p>
              <p className="text-[12px] text-gray-600 truncate">
                {resultCount} {stateName} {resultCount === 1 ? "program" : "programs"}
              </p>
            </div>
          </div>
        </div>

        {/* Progress dots (step 6 drops out when payment=medicaid) */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {(medicaidRedundant ? [1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7]).map((i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i <= currentStepNumber
                  ? "bg-gray-900 w-6 h-1.5"
                  : "bg-gray-200 w-1.5 h-1.5"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Who needs care? */}
        {cardState === "enrichment_1" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Who needs care?
            </h3>
            <div className="space-y-2 mb-4">
              {RECIPIENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectRecipient(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    recipient === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 2: How soon? */}
        {cardState === "enrichment_2" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isSelf ? "How soon do you need care?" : "How soon is care needed?"}
            </h3>
            <div className="space-y-2 mb-4">
              {TIMELINE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectTimeline(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    timeline === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 4: Want this by text? (phone capture — SMS reachability) */}
        {cardState === "enrichment_4" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              Want this by text?
            </h3>
            {/* Set the same care-team identity, reply promise ("2 business
                days", matching the SMS templates), and reply affordance that
                the Day-0 text carries. */}
            <p className="text-[13px] text-gray-500 mb-4">
              We&apos;ll text your plan now. You can reply with any questions about next
              steps; Olera&apos;s care team replies within 2 business days.
            </p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phoneLooksValid(phone)) {
                  e.preventDefault();
                  submitPhone();
                }
              }}
              placeholder="Your mobile number"
              autoComplete="tel"
              inputMode="tel"
              className="block w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 transition focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
            <button
              onClick={submitPhone}
              disabled={!phoneLooksValid(phone) || phoneSaving}
              className="mt-3 w-full py-3.5 px-4 rounded-xl text-[15px] font-semibold text-center transition-all duration-150 bg-gray-900 text-white disabled:opacity-40 disabled:cursor-default active:scale-[0.98] disabled:active:scale-100"
            >
              {phoneSaving ? "Sending…" : "Text me my results"}
            </button>
            <p className="mt-2.5 text-[11px] leading-relaxed text-gray-400">
              By adding your number you agree to receive care-related texts from Olera.
              Reply STOP anytime.
            </p>
            <button
              onClick={handleSkip}
              className="w-full py-2 mt-1 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 5: Age band (facts round — checks eligibility, sharpens matches) */}
        {cardState === "enrichment_5" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {isSelf ? "How old are you?" : "How old is the person needing care?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">
              Three quick taps left. These check eligibility so your matches get more accurate.
            </p>
            <div className="space-y-2 mb-4">
              {AGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectAge(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    ageBand === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 6: Medicaid status (skipped when payment=medicaid) */}
        {cardState === "enrichment_6" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {isSelf ? "Do you have Medicaid?" : "Do they have Medicaid?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">
              Several programs need Medicaid first. Knowing this sorts your list.
            </p>
            <div className="space-y-2 mb-4">
              {medicaidOptions(isSelf).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectMedicaid(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    medicaidChoice === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 7: Income band (rough is fine; band floors drive exclusions) */}
        {cardState === "enrichment_7" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
              {recipient === "self"
                ? "About how much is your monthly income?"
                : "About how much is the monthly income of the person who needs care?"}
            </h3>
            <p className="text-[13px] text-gray-500 mb-4">
              {recipient === "self" ? "Your own" : "Their own"} income, like Social Security or a pension, not the whole family&apos;s. Most programs have income limits, so a rough range is all we need.
            </p>
            <div className="space-y-2 mb-4">
              {INCOME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectIncome(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    incomeBand === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {/* Step 3: How will you pay? */}
        {cardState === "enrichment_3" && (
          <div className="animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              How are you thinking of covering the cost?
            </h3>
            <div className="space-y-2 mb-4">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => selectPayment(opt.value)}
                  className={`w-full py-3.5 px-4 rounded-xl text-[15px] font-medium text-center transition-all duration-150 border ${
                    paymentMethod === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 font-normal bg-transparent border-none transition-colors"
            >
              Skip
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Capture state ─────────────────────────────────────────────────────
  return (
    <div className={shell}>
      {/* Value first — the free thing, before the ask. Savings number when we
          have it; eligibility framing when we don't. */}
      <p className="text-[13px] font-medium text-gray-500">
        {shortLabel} · {stateName}
      </p>
      {savings ? (
        <>
          <p className="mt-0.5 font-serif text-[28px] font-bold leading-none tracking-tight text-gray-900">
            {savings.text}
          </p>
          <p className="mt-1.5 text-[13px] font-medium text-gray-600">
            {benefitAmountCaption(savings.kind)}
          </p>
        </>
      ) : (
        <>
          <p className="mt-0.5 font-serif text-[26px] font-bold leading-tight tracking-tight text-gray-900">
            Could you qualify?
          </p>
          <p className="mt-1.5 text-[13px] font-medium text-gray-600">
            Most families who are eligible never apply.
          </p>
        </>
      )}

      <div className="my-4 border-t border-gray-100" />

      <p className="mb-3 text-[15px] font-semibold text-gray-900">See if you qualify &amp; how to apply</p>

      {authedEmail ? (
        <p className="mb-3 text-[13px] text-gray-500">Signed in as {authedEmail}</p>
      ) : (
        <input
          type="email"
          value={email}
          onFocus={trackCtaEngagement}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving && emailValid) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Your email address"
          autoComplete="email"
          inputMode="email"
          disabled={saving}
          className={`block w-full rounded-xl border bg-white px-3.5 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 transition focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 disabled:opacity-50 ${
            error ? "border-red-300" : "border-gray-200"
          }`}
        />
      )}

      {error && (
        <p className="mt-2 text-[13px] text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        onClick={() => {
          trackCtaEngagement();
          void handleSubmit();
        }}
        disabled={saving}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-700 hover:shadow-md active:scale-[0.98] disabled:cursor-default disabled:opacity-70 disabled:active:scale-100"
      >
        {saving && <Spinner className="h-4 w-4 animate-spin" weight="bold" />}
        {saving ? "Checking…" : "Check my eligibility"}
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] font-medium text-gray-600">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary-600" weight="fill" />
        Free. No spam.
      </p>
    </div>
  );
}
